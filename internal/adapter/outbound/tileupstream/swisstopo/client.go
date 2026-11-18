// Package swisstopo implements outbound.TileUpstream against the public swisstopo
// vector tile service (https://vectortiles.geo.admin.ch).
package swisstopo

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"

	"github.com/f-eld-ch/sitrep/internal/core/domain/maptile"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

var _ outbound.TileUpstream = (*Client)(nil)

const (
	// DefaultBaseURL is the public swisstopo vector tile service.
	DefaultBaseURL = "https://vectortiles.geo.admin.ch"

	headerTimeout = 30 * time.Second
	// idleTimeout aborts a download that has not received a byte for this long.
	idleTimeout = 60 * time.Second
)

// Client downloads MBTiles archives from swisstopo.
type Client struct {
	baseURL string
	http    *http.Client
}

// Option configures a Client.
type Option func(*Client)

// WithBaseURL overrides the service URL (for tests).
func WithBaseURL(u string) Option { return func(c *Client) { c.baseURL = strings.TrimRight(u, "/") } }

// WithHTTPClient replaces the HTTP client (for tests).
func WithHTTPClient(h *http.Client) Option { return func(c *Client) { c.http = h } }

// New returns a Client. The default HTTP client is traced with otelhttp and has no overall
// timeout (the archives are over a gigabyte), only header and idle timeouts.
func New(opts ...Option) *Client {
	transport := http.DefaultTransport.(*http.Transport).Clone() //nolint:forcetypeassert // stdlib guarantees *http.Transport
	transport.ResponseHeaderTimeout = headerTimeout

	c := &Client{
		baseURL: DefaultBaseURL,
		http: &http.Client{
			Transport:     otelhttp.NewTransport(transport),
			CheckRedirect: sameHostRedirects,
		},
	}
	for _, o := range opts {
		o(c)
	}

	return c
}

func (c *Client) archiveURL(ts maptile.Tileset) string {
	return fmt.Sprintf("%s/tiles/%s/%s/%s.mbtiles", c.baseURL, ts.Name, ts.Version, ts.Name)
}

// Head implements outbound.TileUpstream.
func (c *Client) Head(ctx context.Context, ts maptile.Tileset) (outbound.RemoteTileInfo, error) {
	if err := ts.Validate(); err != nil {
		return outbound.RemoteTileInfo{}, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodHead, c.archiveURL(ts), nil)
	if err != nil {
		return outbound.RemoteTileInfo{}, err
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return outbound.RemoteTileInfo{}, err
	}

	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return outbound.RemoteTileInfo{}, fmt.Errorf("HEAD %s: unexpected status %s", req.URL, resp.Status)
	}

	info := outbound.RemoteTileInfo{ETag: resp.Header.Get("ETag"), Size: resp.ContentLength}
	if info.ETag == "" || info.Size <= 0 {
		return outbound.RemoteTileInfo{}, fmt.Errorf("HEAD %s: response has no ETag or size", req.URL)
	}

	info.LastModified, _ = http.ParseTime(resp.Header.Get("Last-Modified"))

	return info, nil
}

// Fetch implements outbound.TileUpstream.
func (c *Client) Fetch(ctx context.Context, ts maptile.Tileset, offset int64, etag string) (outbound.TileFetch, error) {
	if err := ts.Validate(); err != nil {
		return outbound.TileFetch{}, err
	}

	// The download must be cancelled when no byte arrives for idleTimeout, which the
	// request context alone cannot express, so the body wrapper cancels it.
	ctx, cancel := context.WithCancel(ctx)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.archiveURL(ts), nil)
	if err != nil {
		cancel()

		return outbound.TileFetch{}, err
	}

	if offset > 0 {
		req.Header.Set("Range", "bytes="+strconv.FormatInt(offset, 10)+"-")
		// Only resume the version we started; otherwise the server sends the whole new file.
		req.Header.Set("If-Range", etag)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		cancel()

		return outbound.TileFetch{}, err
	}

	fetch := outbound.TileFetch{ETag: resp.Header.Get("ETag")}

	switch resp.StatusCode {
	case http.StatusOK:
		fetch.Size = resp.ContentLength
	case http.StatusPartialContent:
		start, total, ok := parseContentRange(resp.Header.Get("Content-Range"))
		if !ok || start != offset {
			_ = resp.Body.Close()

			cancel()

			return outbound.TileFetch{}, fmt.Errorf(
				"GET %s: unexpected Content-Range %q",
				req.URL,
				resp.Header.Get("Content-Range"),
			)
		}

		fetch.Resumed = true
		fetch.Size = total
	default:
		_ = resp.Body.Close()

		cancel()

		return outbound.TileFetch{}, fmt.Errorf("GET %s: unexpected status %s", req.URL, resp.Status)
	}

	if fetch.ETag == "" || fetch.Size <= 0 {
		_ = resp.Body.Close()

		cancel()

		return outbound.TileFetch{}, fmt.Errorf("GET %s: response has no ETag or size", req.URL)
	}

	fetch.Body = newIdleBody(resp.Body, cancel, idleTimeout)

	return fetch, nil
}

// parseContentRange parses "bytes <start>-<end>/<total>".
func parseContentRange(h string) (start, total int64, ok bool) {
	rest, found := strings.CutPrefix(h, "bytes ")
	if !found {
		return 0, 0, false
	}

	rng, totalStr, found := strings.Cut(rest, "/")
	if !found {
		return 0, 0, false
	}

	startStr, _, found := strings.Cut(rng, "-")
	if !found {
		return 0, 0, false
	}

	start, err1 := strconv.ParseInt(startStr, 10, 64)
	total, err2 := strconv.ParseInt(totalStr, 10, 64)

	return start, total, err1 == nil && err2 == nil
}

// idleBody cancels the request when no data arrives for the idle timeout.
type idleBody struct {
	rc     io.ReadCloser
	cancel context.CancelFunc
	idle   time.Duration

	mu    sync.Mutex
	timer *time.Timer
	fired bool
}

func newIdleBody(rc io.ReadCloser, cancel context.CancelFunc, idle time.Duration) *idleBody {
	b := &idleBody{rc: rc, cancel: cancel, idle: idle}
	b.timer = time.AfterFunc(idle, b.expire)

	return b
}

func (b *idleBody) expire() {
	b.mu.Lock()
	b.fired = true
	b.mu.Unlock()
	b.cancel()
}

func (b *idleBody) Read(p []byte) (int, error) {
	n, err := b.rc.Read(p)

	b.mu.Lock()
	if n > 0 {
		b.timer.Reset(b.idle)
	}

	fired := b.fired
	b.mu.Unlock()

	if err != nil && fired {
		return n, fmt.Errorf("download stalled for %s: %w", b.idle, errors.Join(err, context.DeadlineExceeded))
	}

	return n, err
}

func (b *idleBody) Close() error {
	b.timer.Stop()
	err := b.rc.Close()
	b.cancel()

	return err
}

// maxRedirects bounds the redirects followed for one request.
const maxRedirects = 3

// sameHostRedirects lets a request follow redirects only within the host it started at, so a
// response from the server can never send the download to another host.
func sameHostRedirects(req *http.Request, via []*http.Request) error {
	if len(via) > maxRedirects {
		return fmt.Errorf("stopped after %d redirects", maxRedirects)
	}

	if req.URL.Host != via[0].URL.Host || req.URL.Scheme != via[0].URL.Scheme {
		return fmt.Errorf("refusing redirect from %s to %s", via[0].URL.Host, req.URL.Host)
	}

	return nil
}
