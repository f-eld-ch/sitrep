package projection

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel"
)

type blockingNotifier struct {
	entered chan struct{}
	release chan error
}

func newBlockingNotifier() *blockingNotifier {
	return &blockingNotifier{
		entered: make(chan struct{}),
		release: make(chan error, 1),
	}
}

func (n *blockingNotifier) Notify(context.Context) error { return nil }

func (n *blockingNotifier) Wait(ctx context.Context) error {
	select {
	case <-n.entered:
	default:
		close(n.entered)
	}

	select {
	case err := <-n.release:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func TestProjector_WaitForNotificationOrRetentionWaitsForNotify(t *testing.T) {
	notifier := newBlockingNotifier()
	p := &Projector{notifier: notifier, tracer: otel.Tracer("sitrep/projector")}
	retentionC := make(chan time.Time)

	done := make(chan error, 1)
	go func() { done <- p.waitForNotificationOrRetention(context.Background(), retentionC) }()

	<-notifier.entered
	select {
	case err := <-done:
		t.Fatalf("wait returned before notification: %v", err)
	case <-time.After(25 * time.Millisecond):
	}

	notifier.release <- nil
	require.NoError(t, <-done)
}

func TestProjector_WaitForNotificationOrRetentionRunsRetention(t *testing.T) {
	notifier := newBlockingNotifier()
	retentionC := make(chan time.Time, 1)
	retentionCalls := 0
	p := &Projector{
		notifier: notifier,
		tracer:   otel.Tracer("sitrep/projector"),
		runRetention: func(context.Context) (bool, error) {
			retentionCalls++
			return false, nil
		},
	}

	done := make(chan error, 1)
	go func() { done <- p.waitForNotificationOrRetention(context.Background(), retentionC) }()

	<-notifier.entered
	retentionC <- time.Now()
	require.NoError(t, <-done)
	assert.Equal(t, 1, retentionCalls)
}

func TestProjector_WaitForNotificationOrRetentionReturnsNotifierErrors(t *testing.T) {
	notifier := newBlockingNotifier()
	p := &Projector{notifier: notifier, tracer: otel.Tracer("sitrep/projector")}
	wantErr := errors.New("listen failed")

	done := make(chan error, 1)
	go func() { done <- p.waitForNotificationOrRetention(context.Background(), make(chan time.Time)) }()

	<-notifier.entered
	notifier.release <- wantErr
	err := <-done
	require.Error(t, err)
	assert.ErrorIs(t, err, wantErr)
}
