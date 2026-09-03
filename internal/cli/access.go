package cli

import (
	"context"
	"errors"
	"fmt"
	"sort"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/spf13/cobra"
	"github.com/spf13/viper"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore"
	pgstore "github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/postgres"
	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
)

func newAccessCmd(v *viper.Viper) *cobra.Command {
	accessCmd := &cobra.Command{Use: "access", Short: "Authorization and access commands"}
	accessCmd.AddCommand(newGrantSystemAdminCmd(v), newListSystemAdminsCmd(v), newRevokeSystemAdminCmd(v))
	return accessCmd
}

func newGrantSystemAdminCmd(v *viper.Viper) *cobra.Command {
	var subject string
	cmd := &cobra.Command{
		Use:   "grant-system-admin",
		Short: "Grant system-admin access",
		RunE: func(cmd *cobra.Command, _ []string) error {
			if subject == "" {
				return fmt.Errorf("--sub is required")
			}
			return runGlobalRoleCommand(cmd.Context(), v.GetString("database-url"), subject, access.SystemAdmin, true)
		},
	}
	cmd.Flags().StringVar(&subject, "sub", "", "OIDC subject")
	return cmd
}

func newListSystemAdminsCmd(v *viper.Viper) *cobra.Command {
	return &cobra.Command{
		Use:   "list-system-admins",
		Short: "List system-admin subjects",
		RunE: func(cmd *cobra.Command, _ []string) error {
			g, cleanup, err := openGlobalAccess(cmd.Context(), v.GetString("database-url"))
			if err != nil {
				return err
			}
			defer cleanup()
			admins := g.SubjectsWithRole(access.SystemAdmin)
			sort.Strings(admins)
			for _, admin := range admins {
				fmt.Fprintln(cmd.OutOrStdout(), admin)
			}
			return nil
		},
	}
}

func newRevokeSystemAdminCmd(v *viper.Viper) *cobra.Command {
	var subject string
	cmd := &cobra.Command{
		Use:   "revoke-system-admin",
		Short: "Revoke system-admin access",
		RunE: func(cmd *cobra.Command, _ []string) error {
			if subject == "" {
				return fmt.Errorf("--sub is required")
			}
			return runGlobalRoleCommand(cmd.Context(), v.GetString("database-url"), subject, access.SystemAdmin, false)
		},
	}
	cmd.Flags().StringVar(&subject, "sub", "", "OIDC subject")
	return cmd
}

func runGlobalRoleCommand(ctx context.Context, dsn, subject string, role access.GlobalRole, grant bool) error {
	pool, err := openAccessPool(ctx, dsn)
	if err != nil {
		return err
	}
	defer pool.Close()
	store := pgstore.NewEventStore(pool)
	repo := eventstore.NewGlobalAccessRepository(store)
	g, err := repo.Load(ctx)
	if err != nil {
		if !errors.Is(err, shared.ErrNotFound) {
			return err
		}
		g = access.NewGlobalAccess()
		if err := g.Initialize("system:cli", pgstore.WallClock{}.Now()); err != nil {
			return err
		}
	}
	at := pgstore.WallClock{}.Now()
	if grant {
		err = g.GrantRole(subject, role, "system:cli", at)
	} else {
		err = g.RevokeRole(subject, role, "system:cli", at)
	}
	if err != nil {
		return err
	}
	if len(g.Root().PendingEvents()) == 0 {
		return nil
	}
	tx := pgstore.NewTransactor(pool)
	if err := tx.WithinTx(
		ctx,
		func(ctx context.Context) error { _, err := repo.Save(ctx, g); return err },
	); err != nil {
		return err
	}
	notifier := pgstore.NewNotifier(pool, "events")
	defer notifier.Close()
	return notifier.Notify(ctx)
}

func openGlobalAccess(ctx context.Context, dsn string) (*access.GlobalAccess, func(), error) {
	pool, err := openAccessPool(ctx, dsn)
	if err != nil {
		return nil, func() {}, err
	}
	g, err := eventstore.NewGlobalAccessRepository(pgstore.NewEventStore(pool)).Load(ctx)
	if errors.Is(err, shared.ErrNotFound) {
		g = access.NewGlobalAccess()
	} else if err != nil {
		pool.Close()
		return nil, func() {}, err
	}
	return g, pool.Close, nil
}

func openAccessPool(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	if dsn == "" {
		return nil, fmt.Errorf("--database-url / DATABASE_URL is required for access commands")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, err
	}
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return pool, nil
}
