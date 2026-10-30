package cli

import (
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
)

// fakeKeeper is a reviewSummaryKeeper that counts its runs and can be held up.
type fakeKeeper struct {
	runs   atomic.Int32
	actor  atomic.Value
	forced atomic.Bool
	hold   chan struct{} // closed to let a run finish; nil lets it finish at once
	result inbound.BackfillResult
	err    error
}

func (f *fakeKeeper) BackfillReviewSummaries(
	_ context.Context,
	actor string,
	force bool,
) (inbound.BackfillResult, error) {
	f.runs.Add(1)
	f.actor.Store(actor)
	f.forced.Store(force)

	if f.hold != nil {
		<-f.hold
	}

	return f.result, f.err
}

// run starts the backfill and waits until that run is over.
func run(t *testing.T, b *reviewBackfill) {
	t.Helper()

	done := make(chan struct{})
	b.finished = func() { close(done) }

	b.Start(context.Background())

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("the backfill did not finish")
	}
}

func TestReviewBackfill_KeepsTheHeadlinesInTheBackground(t *testing.T) {
	keeper := &fakeKeeper{result: inbound.BackfillResult{Recorded: 2, Skipped: 1}}

	run(t, newReviewBackfill(keeper))

	assert.Equal(t, int32(1), keeper.runs.Load())
	assert.Equal(t, reviewBackfillActor, keeper.actor.Load())
	assert.False(t, keeper.forced.Load(), "the server only works out what is missing or out of date")
}

func TestReviewBackfill_DoesNotStartASecondRunWhileOneIsGoing(t *testing.T) {
	keeper := &fakeKeeper{hold: make(chan struct{})}
	b := newReviewBackfill(keeper)

	var finished sync.WaitGroup

	finished.Add(1)

	b.finished = finished.Done

	b.Start(context.Background())
	require.Eventually(t, func() bool { return keeper.runs.Load() == 1 }, 5*time.Second, time.Millisecond)

	// The hourly maintenance comes round while the first run is still working through incidents.
	b.Start(context.Background())
	b.Start(context.Background())

	close(keeper.hold)
	finished.Wait()

	assert.Equal(t, int32(1), keeper.runs.Load(), "the others were left out")
}

func TestReviewBackfill_RunsAgainOnceTheLastRunIsOver(t *testing.T) {
	keeper := &fakeKeeper{}
	b := newReviewBackfill(keeper)

	run(t, b)
	run(t, b)

	assert.Equal(t, int32(2), keeper.runs.Load())
}

func TestReviewBackfill_AFailureIsNotPassedOnAndDoesNotBlockTheNextRun(t *testing.T) {
	keeper := &fakeKeeper{err: errors.New("database unavailable")}
	b := newReviewBackfill(keeper)

	// Nothing to recover from or return: it is only logged, and tried again next time.
	run(t, b)
	run(t, b)

	assert.Equal(t, int32(2), keeper.runs.Load())
}

func TestReviewBackfill_AStoppedRunIsNotAFailure(t *testing.T) {
	keeper := &fakeKeeper{err: context.Canceled}

	assert.NotPanics(t, func() { run(t, newReviewBackfill(keeper)) })
}
