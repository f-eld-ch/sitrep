package cli

import (
	"errors"
	"fmt"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

// reviewBackfillActor is who the events written by the backfill are attributed to.
const reviewBackfillActor = "system:review-backfill"

func newReviewCmd(v *viper.Viper) *cobra.Command {
	reviewCmd := &cobra.Command{Use: "review", Short: "Maintain the reviews of incidents"}
	reviewCmd.AddCommand(newReviewBackfillCmd(v))

	return reviewCmd
}

func newReviewBackfillCmd(v *viper.Viper) *cobra.Command {
	return &cobra.Command{
		Use:   "backfill",
		Short: "Keep the review headline of closed incidents that have none",
		Long: `Works out and keeps the headline of the review (how fast messages were triaged and drawn,
and how many got that far) of every closed incident that has none, so that it takes part in
comparisons with other incidents. A headline is kept when an incident is closed; this is for the
ones that were closed before that, and can be run again at any time: incidents that have one are
left alone. Incidents that come from the legacy import have no message history and are skipped.

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

			result, err := st.IncidentSvc.BackfillReviewSummaries(cmd.Context(), reviewBackfillActor)
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
}
