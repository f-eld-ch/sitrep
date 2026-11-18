package tilesync

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/maptile"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
)

type fakeSvc struct {
	syncs, prunes atomic.Int32
	syncErr       error
	report        inbound.SyncReport
}

func (f *fakeSvc) Sync(context.Context) (inbound.SyncReport, error) {
	f.syncs.Add(1)

	return f.report, f.syncErr
}

func (f *fakeSvc) Status(context.Context) ([]inbound.TilesetStatus, error) { return nil, nil }

func (f *fakeSvc) Prune(context.Context) ([]inbound.PrunedFile, error) {
	f.prunes.Add(1)

	return nil, nil
}

func runFor(t *testing.T, svc inbound.TileSyncService, interval, jitter, d time.Duration) {
	t.Helper()

	ctx, cancel := context.WithTimeout(t.Context(), d)
	defer cancel()

	done := make(chan struct{})

	go func() {
		New(svc, interval, jitter).Run(ctx)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		require.Fail(t, "Run did not stop when the context ended")
	}
}

func TestRunner_SyncsAtStartAndOnEveryTick(t *testing.T) {
	svc := &fakeSvc{}

	runFor(t, svc, 20*time.Millisecond, 0, 150*time.Millisecond)

	assert.GreaterOrEqual(t, svc.syncs.Load(), int32(3), "once at start, then every interval")
	assert.Equal(t, svc.syncs.Load(), svc.prunes.Load(), "every run cleans up first")
}

func TestRunner_StopsDuringStartupDelay(t *testing.T) {
	svc := &fakeSvc{}

	runFor(t, svc, time.Hour, time.Hour, 50*time.Millisecond)

	assert.Zero(t, svc.syncs.Load(), "cancelled before the first run")
}

func TestRunner_KeepsGoingAfterFailures(t *testing.T) {
	svc := &fakeSvc{syncErr: errors.New("boom")}

	runFor(t, svc, 20*time.Millisecond, 0, 100*time.Millisecond)

	assert.GreaterOrEqual(t, svc.syncs.Load(), int32(2))
}

func TestRunner_SurvivesAFailedTileset(t *testing.T) {
	svc := &fakeSvc{report: inbound.SyncReport{Tilesets: []inbound.TilesetSync{
		{Tileset: maptile.Supported[0], Outcome: inbound.SyncFailed, Err: errors.New("offline")},
	}}}

	runFor(t, svc, 20*time.Millisecond, 0, 80*time.Millisecond)

	assert.GreaterOrEqual(t, svc.syncs.Load(), int32(2))
}

func TestRunner_SkipsWhenASyncIsAlreadyRunning(t *testing.T) {
	svc := &fakeSvc{syncErr: inbound.ErrSyncInProgress}

	runFor(t, svc, 20*time.Millisecond, 0, 80*time.Millisecond)

	assert.GreaterOrEqual(t, svc.syncs.Load(), int32(2))
}

func TestRunner_CallsAfterSyncAfterEveryRun(t *testing.T) {
	svc := &fakeSvc{syncErr: errors.New("boom")} // also after a failed run

	var after atomic.Int32

	ctx, cancel := context.WithTimeout(t.Context(), 100*time.Millisecond)
	defer cancel()

	New(svc, 20*time.Millisecond, 0).AfterSync(func(context.Context) { after.Add(1) }).Run(ctx)

	assert.Equal(t, svc.syncs.Load(), after.Load(), "once per run, whatever its outcome")
	assert.GreaterOrEqual(t, after.Load(), int32(2))
}
