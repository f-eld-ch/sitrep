package cli

import (
	"log/slog"

	"github.com/spf13/cobra"
	"github.com/spf13/viper"
)

var rootCmd = &cobra.Command{
	Use:   "sitrep",
	Short: "SitRep — incident management server",
	// Running bare `sitrep` serves (backward compat: existing manifests need no change).
	RunE: serveCmd.RunE,
}

func Execute() {
	cobra.CheckErr(rootCmd.Execute())
}

func init() {
	cobra.OnInitialize(func() {
		viper.SetConfigName("config")
		viper.SetConfigType("yaml")
		viper.AddConfigPath(".")
		viper.AutomaticEnv()
		_ = viper.ReadInConfig()

		var level slog.Level
		if err := level.UnmarshalText([]byte(viper.GetString("log_level"))); err != nil {
			level = slog.LevelInfo
		}
		logLevel.Set(level)
		initLogger()

		_ = viper.BindEnv("oidc_client_id", "OIDC_CLIENT_ID", "OAUTH2_PROXY_CLIENT_ID")
		_ = viper.BindEnv("oidc_issuer", "OIDC_ISSUER", "OAUTH2_PROXY_OIDC_ISSUER_URL")
		_ = viper.BindEnv("oidc_client_secret", "OIDC_CLIENT_SECRET", "OAUTH2_PROXY_CLIENT_SECRET")
		_ = viper.BindEnv("oidc_redirect_url", "OIDC_REDIRECT_URL", "OAUTH2_PROXY_REDIRECT_URL")
		_ = viper.BindEnv("cookie_key", "COOKIE_KEY", "OAUTH2_PROXY_COOKIE_SECRET", "OIDC_COOKIE_KEY")
		_ = viper.BindEnv("server_port", "SERVER_PORT")
		_ = viper.BindEnv("database_url", "DATABASE_URL")
		viper.SetDefault("server_port", 4180)
	})

	// Persistent flags — visible on every subcommand.
	pf := rootCmd.PersistentFlags()
	pf.String("log-level", "info", "Log level (debug, info, warn, error)")
	pf.Uint("port", 4180, "Server port")
	pf.String("oidc-client-id", "", "OIDC client ID")
	pf.String("oidc-issuer", "", "OIDC issuer URL")
	pf.String("oidc-client-secret", "", "OIDC client secret")
	pf.String("oidc-redirect-url", "", "OIDC redirect URL")
	pf.String("cookie-key", "", "Cookie signing key")
	pf.String("database-url", "", "PostgreSQL connection string (DSN or URL)")
	pf.Bool("graphql-introspection", false, "Enable GraphQL introspection and playground (dev only)")

	// Bind to the same viper keys the existing BindEnv aliases already cover.
	_ = viper.BindEnv("log_level", "LOG_LEVEL")
	_ = viper.BindEnv("graphql_introspection", "GRAPHQL_INTROSPECTION")
	_ = viper.BindPFlag("log_level", pf.Lookup("log-level"))
	_ = viper.BindPFlag("server_port", pf.Lookup("port"))
	_ = viper.BindPFlag("oidc_client_id", pf.Lookup("oidc-client-id"))
	_ = viper.BindPFlag("oidc_issuer", pf.Lookup("oidc-issuer"))
	_ = viper.BindPFlag("oidc_client_secret", pf.Lookup("oidc-client-secret"))
	_ = viper.BindPFlag("oidc_redirect_url", pf.Lookup("oidc-redirect-url"))
	_ = viper.BindPFlag("cookie_key", pf.Lookup("cookie-key"))
	_ = viper.BindPFlag("database_url", pf.Lookup("database-url"))
	_ = viper.BindPFlag("graphql_introspection", pf.Lookup("graphql-introspection"))

	rootCmd.AddCommand(serveCmd)
	rootCmd.AddCommand(migrateCmd)
}
