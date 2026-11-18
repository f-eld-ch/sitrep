package service

import (
	"context"
	"errors"
	"log/slog"
	"strconv"
	"strings"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/trace"

	"github.com/f-eld-ch/sitrep/internal/core/domain/maptile"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

var _ inbound.TileService = (*TileService)(nil)

// TileService serves vector tiles from a local archive when one exists and
// describes the public swisstopo tiles otherwise.
type TileService struct {
	store  outbound.TileStore
	tracer trace.Tracer
	served metric.Int64Counter
}

// NewTileService builds a TileService reading from store.
func NewTileService(store outbound.TileStore) *TileService {
	meter := otel.Meter("sitrep/service")
	served, _ := meter.Int64Counter("tiles.served",
		metric.WithDescription("Vector tile requests by outcome"),
		metric.WithUnit("{tile}"),
	)

	return &TileService{
		store:  store,
		tracer: otel.Tracer("github.com/f-eld-ch/sitrep/service"),
		served: served,
	}
}

// TileJSON returns the TileJSON for ts: local URLs when an archive exists,
// the public swisstopo URLs otherwise. MapLibre picks tile URLs round-robin
// without retrying, so the two are never mixed.
func (s *TileService) TileJSON(
	ctx context.Context,
	ts maptile.Tileset,
	tileBaseURL string,
) (inbound.TileJSONState, error) {
	ctx, span := s.tracer.Start(ctx, "TileService.TileJSON",
		trace.WithAttributes(attribute.String("tileset", ts.String())))
	defer span.End()

	info, err := s.store.Info(ctx, ts)

	switch {
	case err == nil:
		tj := info.TileJSON
		tj.Attribution = maptile.Attribution
		tj.Scheme = "xyz"
		tj.TileJSON = "2.1.0"
		tj.Tiles = []string{strings.TrimRight(tileBaseURL, "/") + "/" + ts.Name + "/" + ts.Version + "/{z}/{x}/{y}.pbf"}

		span.SetAttributes(attribute.Bool("tiles.local", true))

		return inbound.TileJSONState{TileJSON: tj, Local: true}, nil
	case errors.Is(err, outbound.ErrTilesetNotAvailable):
		span.SetAttributes(attribute.Bool("tiles.local", false))

		return inbound.TileJSONState{TileJSON: upstreamTileJSON(ts)}, nil
	default:
		span.RecordError(err)
		span.SetStatus(codes.Error, err.Error())
		logIfUnexpected(ctx, "TileJSON", err, tilesetAttr(ts))

		return inbound.TileJSONState{}, err
	}
}

// Tile returns one tile, a redirect to swisstopo, or an empty result.
//
// Deliberately no span: a map view requests dozens of tiles, so a span each would
// only add export volume (the HTTP middleware skips them too). The tiles.served
// counter covers the load instead.
func (s *TileService) Tile(ctx context.Context, ts maptile.Tileset, c maptile.Coord) (inbound.TileState, error) {
	data, err := s.store.Tile(ctx, ts, c)

	switch {
	case err == nil:
		s.count(ctx, "local")

		return inbound.TileState{Data: data, ETag: s.ETag(ctx, ts)}, nil
	case errors.Is(err, maptile.ErrTileNotFound):
		s.count(ctx, "empty")

		return inbound.TileState{Empty: true, ETag: s.ETag(ctx, ts)}, nil
	case errors.Is(err, outbound.ErrTilesetNotAvailable):
		s.count(ctx, "redirect")

		url := strings.NewReplacer(
			"{z}", strconv.Itoa(c.Z), "{x}", strconv.Itoa(c.X), "{y}", strconv.Itoa(c.Y),
		).Replace(maptile.UpstreamTileURL(ts))

		return inbound.TileState{Redirect: true, RedirectURL: url}, nil
	default:
		logIfUnexpected(ctx, "Tile", err, tilesetAttr(ts))

		return inbound.TileState{}, err
	}
}

// ETag returns the archive ETag, or "" when there is no local archive.
func (s *TileService) ETag(ctx context.Context, ts maptile.Tileset) string {
	info, err := s.store.Info(ctx, ts)
	if err != nil {
		return ""
	}

	return info.ETag
}

func (s *TileService) count(ctx context.Context, source string) {
	s.served.Add(ctx, 1, metric.WithAttributes(attribute.String("source", source)))
}

func upstreamTileJSON(ts maptile.Tileset) maptile.TileJSON {
	return maptile.TileJSON{
		TileJSON:    "2.1.0",
		Name:        ts.Name,
		Version:     ts.Version,
		Attribution: maptile.Attribution,
		Scheme:      "xyz",
		Format:      "pbf",
		MinZoom:     0,
		MaxZoom:     14,
		Bounds:      []float64{3.57, 44.18, 13.66, 48.88},
		Tiles:       []string{maptile.UpstreamTileURL(ts)},
	}
}

func tilesetAttr(ts maptile.Tileset) slog.Attr { return slog.String("tileset", ts.String()) }
