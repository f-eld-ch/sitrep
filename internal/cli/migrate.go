package cli

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"

	"github.com/f-eld-ch/sitrep/migrations"
)

const (
	gooseDBConnectWait     = 2 * time.Minute
	gooseDBConnectInterval = 2 * time.Second
	gooseDBPingTimeout     = 5 * time.Second
)

func newMigrateCmd(v *viper.Viper) *cobra.Command {
	migrateCmd := &cobra.Command{Use: "migrate", Short: "Database migration commands"}
	migrateCmd.AddCommand(
		newMigrateUpCmd(v),
		newMigrateDownCmd(v),
		newMigrateStatusCmd(v),
		newMigratePreflightCmd(v),
	)

	return migrateCmd
}

func openGooseDB(ctx context.Context, dsn string) (*sql.DB, error) {
	if dsn == "" {
		return nil, fmt.Errorf("--database-url / DATABASE_URL is required for migrate commands")
	}

	set, err := migrations.ForDSN(dsn)
	if err != nil {
		return nil, err
	}

	switch set.Dialect {
	case goose.DialectPostgres:
		cfg, err := pgx.ParseConfig(dsn)
		if err != nil {
			return nil, fmt.Errorf("parsing database URL: %w", err)
		}

		return openGooseDBWithRetry(
			ctx,
			gooseDBConnectWait,
			gooseDBConnectInterval,
			func(ctx context.Context) (*sql.DB, error) {
				db := stdlib.OpenDB(*cfg)

				pingCtx, cancel := context.WithTimeout(ctx, gooseDBPingTimeout)
				defer cancel()

				if err := db.PingContext(pingCtx); err != nil {
					_ = db.Close()
					return nil, err
				}

				return db, nil
			},
		)

	default:
		return nil, fmt.Errorf("unsupported database dialect: %s", set.Dialect)
	}
}

func openGooseDBWithRetry(
	ctx context.Context,
	wait, interval time.Duration,
	open func(context.Context) (*sql.DB, error),
) (*sql.DB, error) {
	deadline := time.NewTimer(wait)
	defer deadline.Stop()

	var lastErr error

	for {
		db, err := open(ctx)
		if err == nil {
			return db, nil
		}

		lastErr = err
		slog.InfoContext(ctx, "waiting for database connection", slog.String("error", err.Error()))

		retry := time.NewTimer(interval)
		select {
		case <-ctx.Done():
			retry.Stop()
			return nil, fmt.Errorf("connecting to database: %w", ctx.Err())
		case <-deadline.C:
			retry.Stop()
			return nil, fmt.Errorf("connecting to database after %s: %w", wait, lastErr)
		case <-retry.C:
		}
	}
}

func gooseProvider(db *sql.DB, dsn string) (*goose.Provider, error) {
	set, err := migrations.ForDSN(dsn)
	if err != nil {
		return nil, err
	}

	return goose.NewProvider(
		set.Dialect,
		db,
		set.FS,
		goose.WithGoMigrations(set.GoMigrations...),
		goose.WithVerbose(true),
	)
}

func newMigrateUpCmd(v *viper.Viper) *cobra.Command {
	return &cobra.Command{
		Use:   "up",
		Short: "Apply all pending migrations",
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runMigrateUp(cmd, v.GetString("database-url"))
		},
	}
}

func runMigrateUp(cmd *cobra.Command, dsn string) error {
	// serve falls back to in-memory stores without a database, so there is
	// nothing to migrate. Skipping keeps `migrate up` usable as an
	// unconditional pre-start step in the systemd unit.
	if dsn == "" {
		slog.WarnContext(cmd.Context(), "no database-url set, skipping migrations")
		return nil
	}

	db, err := openGooseDB(cmd.Context(), dsn)
	if err != nil {
		return err
	}
	defer func() { _ = db.Close() }()

	p, err := gooseProvider(db, dsn)
	if err != nil {
		return err
	}

	results, err := p.Up(cmd.Context())
	for _, r := range results {
		slog.InfoContext(
			cmd.Context(),
			"migration applied",
			slog.Int64("version", r.Source.Version),
			slog.String("type", string(r.Source.Type)),
			slog.Duration("duration", r.Duration),
		)
	}

	return err
}

func newMigrateDownCmd(v *viper.Viper) *cobra.Command {
	return &cobra.Command{
		Use:   "down",
		Short: "Roll back the last applied migration",
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runMigrateDown(cmd, v.GetString("database-url"))
		},
	}
}

func runMigrateDown(cmd *cobra.Command, dsn string) error {
	db, err := openGooseDB(cmd.Context(), dsn)
	if err != nil {
		return err
	}
	defer func() { _ = db.Close() }()

	p, err := gooseProvider(db, dsn)
	if err != nil {
		return err
	}

	result, err := p.Down(cmd.Context())
	if err != nil {
		return err
	}

	slog.InfoContext(cmd.Context(), "migration rolled back", slog.Int64("version", result.Source.Version))

	return nil
}

func newMigrateStatusCmd(v *viper.Viper) *cobra.Command {
	return &cobra.Command{
		Use:   "status",
		Short: "Print migration status",
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runMigrateStatus(cmd, v.GetString("database-url"))
		},
	}
}

func runMigrateStatus(cmd *cobra.Command, dsn string) error {
	db, err := openGooseDB(cmd.Context(), dsn)
	if err != nil {
		return err
	}
	defer func() { _ = db.Close() }()

	p, err := gooseProvider(db, dsn)
	if err != nil {
		return err
	}

	statuses, err := p.Status(cmd.Context())
	if err != nil {
		return err
	}

	for _, s := range statuses {
		state := "pending"
		if s.State == goose.StateApplied {
			state = "applied"
		}

		_, _ = fmt.Fprintf(os.Stdout, "%5d  %-8s  %s\n", s.Source.Version, state, s.Source.Path)
	}

	return nil
}

func newMigratePreflightCmd(v *viper.Viper) *cobra.Command {
	return &cobra.Command{
		Use:   "preflight",
		Short: "Run import data checks without migrating (safe to run against production)",
		RunE: func(cmd *cobra.Command, _ []string) error {
			return runMigratePreflight(cmd, v.GetString("database-url"))
		},
	}
}

func runMigratePreflight(cmd *cobra.Command, dsn string) error {
	db, err := openGooseDB(cmd.Context(), dsn)
	if err != nil {
		return err
	}
	defer func() { _ = db.Close() }()

	warnings, err := migrations.RunPreflight(cmd.Context(), db)
	for _, w := range warnings {
		slog.WarnContext(cmd.Context(), "preflight", slog.String("finding", w))
	}

	if err != nil {
		return fmt.Errorf("preflight failed: %w", err)
	}

	if len(warnings) == 0 {
		slog.InfoContext(cmd.Context(), "preflight: all checks passed — data is ready to import")
	} else {
		slog.InfoContext(cmd.Context(), "preflight: checks passed with warnings", slog.Int("count", len(warnings)))
	}

	return nil
}
