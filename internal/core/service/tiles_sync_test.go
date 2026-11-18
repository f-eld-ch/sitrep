package service

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log/slog"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/maptile"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

var (
	baseTS   = maptile.Supported[0]
	reliefTS = maptile.Supported[1]
)

// fakeUpstream serves archives from memory with ETag and Range semantics.
type fakeUpstream struct {
	mu      sync.Mutex
	remote  map[maptile.Tileset]outbound.RemoteTileInfo
	data    map[maptile.Tileset][]byte
	headErr map[maptile.Tileset]error
	// breakAfter makes the next Fetch fail with an unexpected EOF after this many bytes.
	breakAfter int
	// padding is appended to the body of every Fetch beyond the announced size, like a lying server.
	padding   string
	offsets   []int64 // offsets requested by Fetch, in order
	block     chan struct{}
	started   chan struct{} // closed when the first Fetch begins
	startOnce sync.Once
}

func newFakeUpstream() *fakeUpstream {
	return &fakeUpstream{
		remote:  map[maptile.Tileset]outbound.RemoteTileInfo{},
		data:    map[maptile.Tileset][]byte{},
		headErr: map[maptile.Tileset]error{},
	}
}

func (u *fakeUpstream) publish(ts maptile.Tileset, etag, content string) {
	u.mu.Lock()
	defer u.mu.Unlock()

	u.remote[ts] = outbound.RemoteTileInfo{ETag: etag, Size: int64(len(content))}
	u.data[ts] = []byte(content)
}

func (u *fakeUpstream) Head(_ context.Context, ts maptile.Tileset) (outbound.RemoteTileInfo, error) {
	u.mu.Lock()
	defer u.mu.Unlock()

	if err := u.headErr[ts]; err != nil {
		return outbound.RemoteTileInfo{}, err
	}

	return u.remote[ts], nil
}

type brokenReader struct {
	r    io.Reader
	left int
}

func (b *brokenReader) Read(p []byte) (int, error) {
	if b.left <= 0 {
		return 0, io.ErrUnexpectedEOF
	}

	if len(p) > b.left {
		p = p[:b.left]
	}

	n, err := b.r.Read(p)
	b.left -= n

	return n, err
}

func (u *fakeUpstream) Fetch(
	_ context.Context,
	ts maptile.Tileset,
	offset int64,
	etag string,
) (outbound.TileFetch, error) {
	if u.started != nil {
		u.startOnce.Do(func() { close(u.started) })
	}

	if u.block != nil {
		<-u.block
	}

	u.mu.Lock()
	defer u.mu.Unlock()

	u.offsets = append(u.offsets, offset)

	r := u.remote[ts]
	data := u.data[ts]
	resumed := offset > 0 && etag == r.ETag

	if !resumed {
		offset = 0
	}

	var body io.Reader = bytes.NewReader(append(append([]byte{}, data[offset:]...), u.padding...))
	if u.breakAfter > 0 {
		body = &brokenReader{r: body, left: u.breakAfter}
		u.breakAfter = 0
	}

	return outbound.TileFetch{Body: io.NopCloser(body), Resumed: resumed, ETag: r.ETag, Size: r.Size}, nil
}

// fakeArchive keeps installed archives and parts in memory.
type fakeArchive struct {
	mu        sync.Mutex
	local     map[maptile.Tileset]outbound.LocalTileInfo
	content   map[maptile.Tileset]string
	parts     map[maptile.Tileset]*fakePart
	free      uint64
	commitErr error
	discarded []maptile.Tileset
	pruneKeep []maptile.Tileset
	pruneAge  time.Duration
}

type fakePart struct {
	etag string
	buf  bytes.Buffer
}

func newFakeArchive() *fakeArchive {
	return &fakeArchive{
		local:   map[maptile.Tileset]outbound.LocalTileInfo{},
		content: map[maptile.Tileset]string{},
		parts:   map[maptile.Tileset]*fakePart{},
		free:    1 << 40,
	}
}

func (a *fakeArchive) Local(_ context.Context, ts maptile.Tileset) (outbound.LocalTileInfo, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	return a.local[ts], nil
}

func (a *fakeArchive) Part(_ context.Context, ts maptile.Tileset) (outbound.PartInfo, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	p, ok := a.parts[ts]
	if !ok {
		return outbound.PartInfo{}, nil
	}

	return outbound.PartInfo{Present: true, ETag: p.etag, Size: int64(p.buf.Len())}, nil
}

type nopWriteCloser struct{ io.Writer }

func (nopWriteCloser) Close() error { return nil }

func (a *fakeArchive) OpenPart(
	_ context.Context,
	ts maptile.Tileset,
	etag string,
	_ int64,
	resume bool,
) (io.WriteCloser, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	p := a.parts[ts]
	if resume {
		if p == nil || p.etag != etag {
			return nil, outbound.ErrUpstreamChanged
		}
	} else {
		p = &fakePart{etag: etag}
		a.parts[ts] = p
	}

	return nopWriteCloser{&p.buf}, nil
}

func (a *fakeArchive) Commit(_ context.Context, ts maptile.Tileset, remote outbound.RemoteTileInfo) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.commitErr != nil {
		return a.commitErr
	}

	p := a.parts[ts]
	a.content[ts] = p.buf.String()
	a.local[ts] = outbound.LocalTileInfo{Present: true, ETag: remote.ETag, Size: remote.Size}

	delete(a.parts, ts)

	return nil
}

func (a *fakeArchive) DiscardPart(_ context.Context, ts maptile.Tileset) error {
	a.mu.Lock()
	defer a.mu.Unlock()

	delete(a.parts, ts)

	a.discarded = append(a.discarded, ts)

	return nil
}

func (a *fakeArchive) FreeSpace(context.Context) (uint64, error) { return a.free, nil }

func (a *fakeArchive) Prune(
	_ context.Context,
	keep []maptile.Tileset,
	age time.Duration,
) ([]outbound.PrunedFile, error) {
	a.pruneKeep, a.pruneAge = keep, age

	return []outbound.PrunedFile{{Path: "/x/old.mbtiles", Size: 9}}, nil
}

func newSync(t *testing.T) (*TileSyncService, *fakeUpstream, *fakeArchive) {
	t.Helper()

	up, ar := newFakeUpstream(), newFakeArchive()
	up.publish(baseTS, `"b1"`, "BASE-ARCHIVE-BYTES")
	up.publish(reliefTS, `"r1"`, "RELIEF-ARCHIVE-BYTES")

	return NewTileSyncService(up, ar, 7*24*time.Hour), up, ar
}

func outcomes(r inbound.SyncReport) map[string]inbound.SyncOutcome {
	m := map[string]inbound.SyncOutcome{}
	for _, ts := range r.Tilesets {
		m[ts.Tileset.Name] = ts.Outcome
	}

	return m
}

func TestTileSync_FreshDownloadInstallsBoth(t *testing.T) {
	svc, _, ar := newSync(t)

	report, err := svc.Sync(t.Context())
	require.NoError(t, err)

	assert.Equal(t, inbound.SyncDownloaded, outcomes(report)[baseTS.Name])
	assert.Equal(t, inbound.SyncDownloaded, outcomes(report)[reliefTS.Name])
	assert.Equal(t, "BASE-ARCHIVE-BYTES", ar.content[baseTS])
	assert.Equal(t, `"b1"`, ar.local[baseTS].ETag)
	assert.Equal(t, int64(len("BASE-ARCHIVE-BYTES")), report.Tilesets[0].Bytes)
}

func TestTileSync_UpToDateDoesNotDownload(t *testing.T) {
	svc, up, _ := newSync(t)

	_, err := svc.Sync(t.Context())
	require.NoError(t, err)

	up.offsets = nil

	report, err := svc.Sync(t.Context())
	require.NoError(t, err)

	assert.Equal(t, inbound.SyncUpToDate, outcomes(report)[baseTS.Name])
	assert.Empty(t, up.offsets, "no download when the ETag matches")
}

func TestTileSync_NewUpstreamVersionReplacesTheArchive(t *testing.T) {
	svc, up, ar := newSync(t)

	_, err := svc.Sync(t.Context())
	require.NoError(t, err)

	up.publish(baseTS, `"b2"`, "BASE-VERSION-TWO-IS-LONGER")

	report, err := svc.Sync(t.Context())
	require.NoError(t, err)

	assert.Equal(t, inbound.SyncDownloaded, outcomes(report)[baseTS.Name])
	assert.Equal(t, inbound.SyncUpToDate, outcomes(report)[reliefTS.Name])
	assert.Equal(t, "BASE-VERSION-TWO-IS-LONGER", ar.content[baseTS])
	assert.Equal(t, `"b2"`, ar.local[baseTS].ETag)
}

func TestTileSync_HandCopiedArchiveWithoutVersionIsReplaced(t *testing.T) {
	svc, _, ar := newSync(t)
	ar.local[baseTS] = outbound.LocalTileInfo{Present: true, ETag: ""}

	report, err := svc.Sync(t.Context())
	require.NoError(t, err)
	assert.Equal(t, inbound.SyncDownloaded, outcomes(report)[baseTS.Name])
}

func TestTileSync_BrokenConnectionIsResumedNextRun(t *testing.T) {
	svc, up, ar := newSync(t)
	up.breakAfter = 5

	report, err := svc.Sync(t.Context())
	require.NoError(t, err)

	assert.Equal(t, inbound.SyncFailed, outcomes(report)[baseTS.Name])
	require.Error(t, report.Tilesets[0].Err)
	assert.Equal(t, 5, ar.parts[baseTS].buf.Len(), "the part is kept for resuming")

	up.offsets = nil

	report, err = svc.Sync(t.Context())
	require.NoError(t, err)

	assert.Equal(t, inbound.SyncResumed, outcomes(report)[baseTS.Name])
	assert.Equal(t, "BASE-ARCHIVE-BYTES", ar.content[baseTS], "5 bytes + the rest = the whole file")
	assert.Equal(t, int64(5), up.offsets[0], "the second run asked to resume at byte 5")
	assert.EqualValues(
		t,
		len("BASE-ARCHIVE-BYTES")-5,
		report.Tilesets[0].Bytes,
		"only the missing bytes were downloaded",
	)
}

func TestTileSync_PartOfAnOlderVersionIsRestarted(t *testing.T) {
	svc, up, ar := newSync(t)
	up.breakAfter = 5

	_, err := svc.Sync(t.Context())
	require.NoError(t, err)

	// swisstopo publishes a new version while the part of the old one is on disk.
	up.publish(baseTS, `"b2"`, "BASE-VERSION-TWO-IS-LONGER")
	up.offsets = nil

	report, err := svc.Sync(t.Context())
	require.NoError(t, err)

	assert.Equal(t, inbound.SyncDownloaded, outcomes(report)[baseTS.Name], "not resumed")
	assert.Equal(t, int64(0), up.offsets[0])
	assert.Equal(t, "BASE-VERSION-TWO-IS-LONGER", ar.content[baseTS])
}

func TestTileSync_NotEnoughDiskSpaceKeepsTheCurrentArchive(t *testing.T) {
	svc, up, ar := newSync(t)

	_, err := svc.Sync(t.Context())
	require.NoError(t, err)

	up.publish(baseTS, `"b2"`, "BASE-VERSION-TWO-IS-LONGER")
	up.offsets = nil
	ar.free = 10 // far less than the new archive needs

	report, err := svc.Sync(t.Context())
	require.NoError(t, err)

	assert.Equal(t, inbound.SyncSkippedDiskSpace, outcomes(report)[baseTS.Name])
	require.Error(t, report.Tilesets[0].Err)
	assert.Empty(t, up.offsets, "nothing downloaded")
	assert.Equal(t, `"b1"`, ar.local[baseTS].ETag, "the installed archive is untouched")
}

func TestTileSync_DiskCheckCountsOnlyTheMissingBytesOfAResume(t *testing.T) {
	svc, up, ar := newSync(t)
	up.breakAfter = 17 // all but one byte of the 18-byte archive arrives

	_, err := svc.Sync(t.Context())
	require.NoError(t, err)

	ar.free = 2 // enough for the 1 missing byte plus 10 % headroom (rounded down to 0)

	report, err := svc.Sync(t.Context())
	require.NoError(t, err)
	assert.Equal(t, inbound.SyncResumed, outcomes(report)[baseTS.Name])
}

func TestTileSync_InvalidDownloadIsDiscardedNotResumed(t *testing.T) {
	svc, _, ar := newSync(t)
	ar.commitErr = outbound.ErrInvalidArchive

	report, err := svc.Sync(t.Context())
	require.NoError(t, err)

	assert.Equal(t, inbound.SyncFailed, outcomes(report)[baseTS.Name])
	assert.Contains(t, ar.discarded, baseTS)
	assert.NotContains(t, ar.parts, baseTS)
	assert.False(t, ar.local[baseTS].Present)
}

func TestTileSync_OneFailingTilesetDoesNotStopTheOther(t *testing.T) {
	svc, up, ar := newSync(t)
	up.headErr[baseTS] = errors.New("connection refused")

	report, err := svc.Sync(t.Context())
	require.NoError(t, err)

	assert.Equal(t, inbound.SyncFailed, outcomes(report)[baseTS.Name])
	assert.Equal(t, inbound.SyncDownloaded, outcomes(report)[reliefTS.Name])
	assert.Equal(t, "RELIEF-ARCHIVE-BYTES", ar.content[reliefTS])
}

func TestTileSync_OnlyOneSyncRunsAtATime(t *testing.T) {
	svc, up, _ := newSync(t)
	up.block = make(chan struct{})
	up.started = make(chan struct{})

	done := make(chan error, 1)

	go func() {
		_, err := svc.Sync(t.Context())
		done <- err
	}()

	// The first run is now inside the download, holding the lock.
	<-up.started

	_, err := svc.Sync(t.Context())
	require.ErrorIs(t, err, inbound.ErrSyncInProgress)

	close(up.block)
	require.NoError(t, <-done)
}

func TestTileSync_StopsWhenContextIsCancelled(t *testing.T) {
	svc, _, _ := newSync(t)

	ctx, cancel := context.WithCancel(t.Context())
	cancel()

	_, err := svc.Sync(ctx)
	require.ErrorIs(t, err, context.Canceled)
}

func TestTileSync_Status(t *testing.T) {
	svc, up, ar := newSync(t)
	ar.local[baseTS] = outbound.LocalTileInfo{Present: true, ETag: `"b1"`, Size: 18}
	up.headErr[reliefTS] = errors.New("offline")

	st, err := svc.Status(t.Context())
	require.NoError(t, err)
	require.Len(t, st, 2)

	assert.True(t, st[0].Installed)
	assert.True(t, st[0].UpToDate)
	assert.Equal(t, `"b1"`, st[0].RemoteETag)

	assert.False(t, st[1].Installed)
	assert.Equal(t, "offline", st[1].RemoteErr)
	assert.False(t, st[1].UpToDate)
}

func TestTileSync_PruneKeepsTheSupportedTilesets(t *testing.T) {
	svc, _, ar := newSync(t)

	removed, err := svc.Prune(t.Context())
	require.NoError(t, err)

	assert.Equal(t, maptile.Supported, ar.pruneKeep)
	assert.Equal(t, 7*24*time.Hour, ar.pruneAge)
	assert.Equal(t, []inbound.PrunedFile{{Path: "/x/old.mbtiles", Size: 9}}, removed)
}

func TestTileSync_ServerSendingMoreThanAnnouncedIsRejected(t *testing.T) {
	svc, up, ar := newSync(t)
	up.padding = "EXTRA-BYTES-THE-SERVER-DID-NOT-ANNOUNCE"

	report, err := svc.Sync(t.Context())
	require.NoError(t, err)

	assert.Equal(t, inbound.SyncFailed, outcomes(report)[baseTS.Name])
	require.ErrorContains(t, report.Tilesets[0].Err, "more than the announced")
	assert.False(t, ar.local[baseTS].Present, "nothing is installed")
	assert.LessOrEqual(t, ar.parts[baseTS].buf.Len(), len("BASE-ARCHIVE-BYTES")+1,
		"at most one byte beyond the announced size is ever written")
}

func progressLines(t *testing.T, total, startAt int64, chunk int) []string {
	t.Helper()

	var buf bytes.Buffer

	pw := &progressWriter{
		w: io.Discard, ctx: t.Context(), log: slog.New(slog.NewTextHandler(&buf, nil)), ts: baseTS,
		total: total, done: startAt,
	}
	pw.nextPercent = pw.percent()/progressStepPercent*progressStepPercent + progressStepPercent

	for written := startAt; written < total; written += int64(chunk) {
		_, err := pw.Write(make([]byte, chunk))
		require.NoError(t, err)
	}

	var progress []string

	for line := range strings.SplitSeq(strings.TrimSpace(buf.String()), "\n") {
		if _, after, ok := strings.Cut(line, "progress="); ok {
			progress = append(progress, strings.Fields(after)[0])
		}
	}

	return progress
}

func TestProgressWriter_LogsEveryTenPercent(t *testing.T) {
	got := progressLines(t, 1000, 0, 7)

	assert.Equal(t, []string{"10%", "20%", "30%", "40%", "50%", "60%", "70%", "80%", "90%", "100%"}, got)
}

func TestProgressWriter_ResumedDownloadContinuesAtTheNextStep(t *testing.T) {
	// 45 % are already on disk: the first line is for 50 %, not a repeat of 10-40 %.
	got := progressLines(t, 1000, 450, 10)

	assert.Equal(t, []string{"50%", "60%", "70%", "80%", "90%", "100%"}, got)
}

func TestProgressWriter_BigChunksDoNotRepeatLines(t *testing.T) {
	got := progressLines(t, 1000, 0, 400) // jumps 0 -> 40 -> 80 -> 120 %

	assert.Equal(t, []string{"40%", "80%", "100%"}, got)
}
