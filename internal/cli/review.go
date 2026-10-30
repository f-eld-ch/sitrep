package cli

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync/atomic"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"

	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
)

// reviewBackfillActor is who the events written by the backfill are attributed to.
const reviewBackfillActor = "system:review-backfill"

// reviewSummaryKeeper is what keeps the review headline of closed incidents that have none.
type reviewSummaryKeeper interface {
	BackfillReviewSummaries(ctx context.Context, actor string, force bool) (inbound.BackfillResult, error)
}

// reviewBackfill keeps the review headline of closed incidents that have none, in the background,
// so they take part in comparisons without anybody having to run `review backfill`.
//
// It is started from the projector's maintenance, which only the elected leader runs, once the
// read models have caught up and then every hour. That picks up the incidents closed before the
// headline was kept, and the ones whose headline could not be kept when they were closed. It runs
// on its own so that working through many old incidents never holds up the projection, and it
// never fails the maintenance it is started from: a failure is logged and tried again next time.
type reviewBackfill struct {
	svc     reviewSummaryKeeper
	running atomic.Bool
	// finished, when set, is called when a run is over. For tests.
	finished func()
}

func newReviewBackfill(svc reviewSummaryKeeper) *reviewBackfill {
	return &reviewBackfill{svc: svc}
}

// Start works through the closed incidents without a headline, unless a run is still going.
func (b *reviewBackfill) Start(ctx context.Context) {
	if !b.running.CompareAndSwap(false, true) {
		return
	}

	go func() {
		defer func() {
			b.running.Store(false)

			if b.finished != nil {
				b.finished()
			}
		}()

		result, err := b.svc.BackfillReviewSummaries(ctx, reviewBackfillActor, false)
		if err != nil {
			if !errors.Is(err, context.Canceled) {
				slog.WarnContext(ctx, "review backfill failed", slog.String("error", err.Error()))
			}

			return
		}

		if result.Recorded+result.Failed > 0 {
			slog.InfoContext(ctx, "review headlines kept for closed incidents",
				slog.Int("recorded", result.Recorded),
				slog.Int("skipped", result.Skipped),
				slog.Int("failed", result.Failed))
		}
	}()
}

func newReviewCmd(v *viper.Viper) *cobra.Command {
	reviewCmd := &cobra.Command{Use: "review", Short: "Maintain the reviews of incidents"}
	reviewCmd.AddCommand(newReviewBackfillCmd(v))

	return reviewCmd
}

func newReviewBackfillCmd(v *viper.Viper) *cobra.Command {
	var force bool

	cmd := &cobra.Command{
		Use:   "backfill",
		Short: "Keep the review headline of closed incidents that have none",
		Long: `Works out and keeps the headline of the review (how fast messages were triaged and drawn,
and how many got that far) of every closed incident that has none, so that it takes part in
comparisons with other incidents. A headline is kept when an incident is closed; this is for the
ones that were closed before that, and can be run again at any time: incidents that have one are
left alone. Incidents that come from the legacy import have no message history and are skipped.

A running server does this by itself, shortly after it starts and then every hour, so this command
is only needed to do it right away, or for a database that no server is running on. The server also
works out again the headlines that were kept by an older way of working them out.

With --force every closed incident gets a new headline, also one that is up to date.

The new headlines are projected by a running server, or when the server next starts.`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			dsn := v.GetString("database-url")
			if dsn == "" {
				return errors.New("--database-url / DATABASE_URL is required for review commands")
			}

			st, err := buildStack(cmd.Context(), withDSN(dsn))
			if err != nil {
				return fmt.Errorf("build stack: %w", err)
			}
			defer st.Teardown()

			result, err := st.IncidentSvc.BackfillReviewSummaries(cmd.Context(), reviewBackfillActor, force)
			if err != nil {
				return err
			}

			cmd.Printf("review headline kept for %d incidents, %d skipped, %d failed\n",
				result.Recorded, result.Skipped, result.Failed)

			if result.Failed > 0 {
				return fmt.Errorf("%d incidents could not be worked out, see the log", result.Failed)
			}

			return nil
		},
	}

	cmd.Flags().BoolVar(&force, "force", false,
		"work out the headline of every closed incident again, also of those that are up to date")

	return cmd
}
