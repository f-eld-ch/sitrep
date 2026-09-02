package cli

import (
	"errors"
	"fmt"
	"log/slog"
	"strings"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
	"github.com/spf13/viper"
)

type configOption struct {
	name        string
	value       any
	description string
	legacyEnv   []string
	addFlag     func(*pflag.FlagSet)
}

func stringOption(name, defaultValue, description string, legacyEnv ...string) configOption {
	return configOption{
		name:        name,
		value:       defaultValue,
		description: description,
		legacyEnv:   legacyEnv,
		addFlag: func(flags *pflag.FlagSet) {
			flags.String(name, defaultValue, description)
		},
	}
}

func uintOption(name string, defaultValue uint, description string, legacyEnv ...string) configOption {
	return configOption{
		name:        name,
		value:       defaultValue,
		description: description,
		legacyEnv:   legacyEnv,
		addFlag: func(flags *pflag.FlagSet) {
			flags.Uint(name, defaultValue, description)
		},
	}
}

func boolOption(name string, defaultValue bool, description string, legacyEnv ...string) configOption {
	return configOption{
		name:        name,
		value:       defaultValue,
		description: description,
		legacyEnv:   legacyEnv,
		addFlag: func(flags *pflag.FlagSet) {
			flags.Bool(name, defaultValue, description)
		},
	}
}

var rootConfigOptions = []configOption{
	stringOption("log-level", "info", "Log level (debug, info, warn, error)", "LOG_LEVEL"),
	stringOption("database-url", "", "PostgreSQL connection string (DSN or URL)", "DATABASE_URL"),
}

func Execute() {
	rootCmd, err := NewRootCmd()
	cobra.CheckErr(err)
	cobra.CheckErr(rootCmd.Execute())
}

func NewRootCmd() (*cobra.Command, error) {
	rootCmd := &cobra.Command{
		Use:          "sitrep",
		Short:        "SitRep — incident management server",
		SilenceUsage: true,
	}

	pf := rootCmd.PersistentFlags()
	pf.String("config", "", "Path to configuration file")
	if err := rootCmd.MarkPersistentFlagFilename("config", "yaml", "yml"); err != nil {
		return nil, fmt.Errorf("configure --config completion: %w", err)
	}

	v, err := newViper(rootConfigOptions)
	if err != nil {
		return nil, err
	}
	if err := bindFlags(v, pf, rootConfigOptions); err != nil {
		return nil, err
	}
	rootCmd.PersistentPreRunE = func(cmd *cobra.Command, _ []string) error {
		configPath, err := cmd.Flags().GetString("config")
		if err != nil {
			return fmt.Errorf("read --config: %w", err)
		}
		if err := loadConfig(v, configPath); err != nil {
			return err
		}
		return configureLogger(v.GetString("log-level"))
	}
	rootCmd.RunE = func(cmd *cobra.Command, args []string) error {
		return runServe(cmd, args, v)
	}
	serveCmd, err := newServeCmd(v)
	if err != nil {
		return nil, err
	}
	rootCmd.AddCommand(serveCmd)
	rootCmd.AddCommand(newMigrateCmd(v))
	return rootCmd, nil
}

func newViper(options ...[]configOption) (*viper.Viper, error) {
	v := viper.New()
	for _, optionGroup := range options {
		if err := configureOptions(v, optionGroup); err != nil {
			return nil, err
		}
	}
	return v, nil
}

func configureOptions(v *viper.Viper, options []configOption) error {
	for _, option := range options {
		v.SetDefault(option.name, option.value)
		envNames := append([]string{option.name, canonicalEnvName(option.name)}, option.legacyEnv...)
		if err := v.BindEnv(envNames...); err != nil {
			return fmt.Errorf("bind %s environment variables: %w", option.name, err)
		}
	}
	return nil
}

func bindFlags(v *viper.Viper, flags *pflag.FlagSet, options []configOption) error {
	for _, option := range options {
		option.addFlag(flags)
		if err := v.BindPFlag(option.name, flags.Lookup(option.name)); err != nil {
			return fmt.Errorf("bind --%s: %w", option.name, err)
		}
	}
	return nil
}

func canonicalEnvName(option string) string {
	return "SITREP_" + strings.ToUpper(strings.ReplaceAll(option, "-", "_"))
}

func loadConfig(v *viper.Viper, configPath string) error {
	if configPath != "" {
		v.SetConfigFile(configPath)
	} else {
		v.SetConfigName("config")
		v.SetConfigType("yaml")
		v.AddConfigPath(".")
	}
	if err := v.ReadInConfig(); err != nil {
		var lookupError viper.ConfigFileNotFoundError
		if configPath != "" || !errors.As(err, &lookupError) {
			return fmt.Errorf("read configuration: %w", err)
		}
	}
	return validateConfig(v)
}

func validateConfig(v *viper.Viper) error {
	if port := v.GetUint("port"); port == 0 || port > 65535 {
		return fmt.Errorf("port must be between 1 and 65535")
	}
	var level slog.Level
	logLevel := v.GetString("log-level")
	if err := level.UnmarshalText([]byte(logLevel)); err != nil {
		return fmt.Errorf("invalid log-level %q: %w", logLevel, err)
	}

	oidcFields := []string{
		v.GetString("oidc-client-id"),
		v.GetString("oidc-issuer"),
		v.GetString("oidc-client-secret"),
		v.GetString("oidc-redirect-url"),
		v.GetString("cookie-key"),
	}
	configured := 0
	for _, field := range oidcFields {
		if field != "" {
			configured++
		}
	}
	if configured != 0 && configured != len(oidcFields) {
		return fmt.Errorf("oidc-client-id, oidc-issuer, oidc-client-secret, oidc-redirect-url, and cookie-key must be configured together")
	}
	return nil
}

func configureLogger(levelText string) error {
	var level slog.Level
	if err := level.UnmarshalText([]byte(levelText)); err != nil {
		return fmt.Errorf("parse log level: %w", err)
	}
	logLevel.Set(level)
	initLogger()
	return nil
}
