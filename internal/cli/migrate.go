package cli

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"os"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"

	"github.com/f-eld-ch/sitrep/migrations"
)

var migrateCmd = &cobra.Command{
	Use:   "migrate",
	Short: "Database migration commands",
}

var migrateUpCmd = &cobra.Command{
	Use:   "up",
	Short: "Apply all pending migrations",
	RunE:  runMigrateUp,
}

var migrateDownCmd = &cobra.Command{
	Use:   "down",
	Short: "Roll back the last applied migration",
	RunE:  runMigrateDown,
}

var migrateStatusCmd = &cobra.Command{
	Use:   "status",
	Short: "Print migration status",
	RunE:  runMigrateStatus,
}

var migratePreflightCmd = &cobra.Command{
	Use:   "preflight",
	Short: "Run import data checks without migrating (safe to run against production)",
	RunE:  runMigratePreflight,
}

func init() {
	migrateCmd.AddCommand(migrateUpCmd)
	migrateCmd.AddCommand(migrateDownCmd)
	migrateCmd.AddCommand(migrateStatusCmd)
	migrateCmd.AddCommand(migratePreflightCmd)
}

func openGooseDB(ctx context.Context) (*sql.DB, error) {
	dsn := viper.GetString("database_url")
	if dsn == "" {
		return nil, fmt.Errorf("--database-url / DATABASE_URL is required for migrate commands")
	}
	cfg, err := pgx.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parsing database URL: %w", err)
	}
	db := stdlib.OpenDB(*cfg)
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("connecting to database: %w", err)
	}
	return db, nil
}

func gooseProvider(db *sql.DB) (*goose.Provider, error) {
	return goose.NewProvider(
		goose.DialectPostgres,
		db,
		migrations.FS,
		goose.WithGoMigrations(migrations.GoMigrations()...),
		goose.WithVerbose(true),
	)
}

func runMigrateUp(cmd *cobra.Command, _ []string) error {
	db, err := openGooseDB(cmd.Context())
	if err != nil {
		return err
	}
	defer func() { _ = db.Close() }()
	p, err := gooseProvider(db)
	if err != nil {
		return err
	}
	results, err := p.Up(cmd.Context())
	for _, r := range results {
		slog.InfoContext(cmd.Context(), "migration applied", "version", r.Source.Version, "type", r.Source.Type, "duration", r.Duration)
	}
	return err
}

func runMigrateDown(cmd *cobra.Command, _ []string) error {
	db, err := openGooseDB(cmd.Context())
	if err != nil {
		return err
	}
	defer func() { _ = db.Close() }()
	p, err := gooseProvider(db)
	if err != nil {
		return err
	}
	result, err := p.Down(cmd.Context())
	if err != nil {
		return err
	}
	slog.InfoContext(cmd.Context(), "migration rolled back", "version", result.Source.Version)
	return nil
}

func runMigrateStatus(cmd *cobra.Command, _ []string) error {
	db, err := openGooseDB(cmd.Context())
	if err != nil {
		return err
	}
	defer func() { _ = db.Close() }()
	p, err := gooseProvider(db)
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

func runMigratePreflight(cmd *cobra.Command, _ []string) error {
	db, err := openGooseDB(cmd.Context())
	if err != nil {
		return err
	}
	defer func() { _ = db.Close() }()

	warnings, err := migrations.RunPreflight(cmd.Context(), db)
	for _, w := range warnings {
		slog.WarnContext(cmd.Context(), "preflight", "finding", w)
	}
	if err != nil {
		return fmt.Errorf("preflight failed: %w", err)
	}
	if len(warnings) == 0 {
		slog.InfoContext(cmd.Context(), "preflight: all checks passed — data is ready to import")
	} else {
		slog.InfoContext(cmd.Context(), "preflight: checks passed with warnings", "count", len(warnings))
	}
	return nil
}
