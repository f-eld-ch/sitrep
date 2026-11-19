package tilesync

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/maptile"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
)

type pruneFailSvc struct {
	fakeSvc
	pruneErr error
}

func (p *pruneFailSvc) Prune(ctx context.Context) ([]inbound.PrunedFile, error) {
	_, _ = p.fakeSvc.Prune(ctx)

	return nil, p.pruneErr
}

func newSvc(syncErr error, report inbound.SyncReport) *pruneFailSvc {
	p := &pruneFailSvc{}
	p.syncErr = syncErr
	p.report = report

	return p
}

func captureDefaultLog(t *testing.T) *bytes.Buffer {
	t.Helper()

	var buf bytes.Buffer

	old := slog.Default()

	slog.SetDefault(slog.New(slog.NewTextHandler(&buf, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(func() { slog.SetDefault(old) })

	return &buf
}

func TestRunner_RunOnce(t *testing.T) {
	base := maptile.Supported[0]

	tests := []struct {
		name       string
		svc        *pruneFailSvc
		wantLogs   []string
		unwantLogs []string
	}{
		{
			name:     "a failed cleanup is logged and the sync still runs",
			svc:      &pruneFailSvc{pruneErr: errors.New("permission denied")},
			wantLogs: []string{"tile cleanup failed", "permission denied"},
		},
		{
			name:       "a cancelled cleanup is not a warning",
			svc:        &pruneFailSvc{pruneErr: context.Canceled},
			unwantLogs: []string{"tile cleanup failed"},
		},
		{
			name:     "a failed sync is logged",
			svc:      newSvc(errors.New("boom"), inbound.SyncReport{}),
			wantLogs: []string{"tile sync failed", "boom"},
		},
		{
			name:       "a cancelled sync is not a warning",
			svc:        newSvc(context.Canceled, inbound.SyncReport{}),
			unwantLogs: []string{"tile sync failed"},
		},
		{
			name:     "a sync that is already running is only a debug line",
			svc:      newSvc(inbound.ErrSyncInProgress, inbound.SyncReport{}),
			wantLogs: []string{"tile sync already running, skipping"},
		},
		{
			name: "tilesets that could not be updated are reported",
			svc: newSvc(nil, inbound.SyncReport{Tilesets: []inbound.TilesetSync{
				{Tileset: base, Outcome: inbound.SyncSkippedDiskSpace, Err: errors.New("need 2 GiB")},
			}}),
			wantLogs: []string{"tileset not updated, will retry", "skipped_disk_space", "need 2 GiB"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			logs := captureDefaultLog(t)
			runner := New(tt.svc, time.Hour, 0)

			runner.runOnce(t.Context())

			assert.Equal(t, int32(1), tt.svc.syncs.Load(), "the sync runs whatever the cleanup did")

			for _, want := range tt.wantLogs {
				assert.Contains(t, logs.String(), want)
			}

			for _, unwant := range tt.unwantLogs {
				assert.NotContains(t, logs.String(), unwant)
			}
		})
	}
}

func TestRunner_AfterSyncRunsEvenWhenTheSyncFails(t *testing.T) {
	captureDefaultLog(t)

	svc := newSvc(errors.New("boom"), inbound.SyncReport{})

	var after int

	runner := New(svc, time.Hour, 0).AfterSync(func(context.Context) { after++ })
	runner.runOnce(t.Context())

	require.Equal(t, 1, after)
}
