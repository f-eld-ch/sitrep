package cli

import (
	"errors"
	"fmt"
	"log/slog"
	"os"
	"regexp"
	"strings"

	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
	"github.com/spf13/viper"

	"github.com/f-eld-ch/sitrep/internal/core/domain/message"
)

type configOption struct {
	name        string
	flag        string // pflag name; defaults to name when empty (used for dotted viper keys)
	value       any
	description string
	legacyEnv   []string
	addFlag     func(*pflag.FlagSet)
}

// flagName returns the pflag flag name. When a separate flag name is configured
// (e.g. for dotted viper keys), it is used; otherwise the viper key is the flag name.
func (o configOption) flagName() string {
	if o.flag != "" {
		return o.flag
	}

	return o.name
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

// stringOptionF creates an option whose viper key (name) differs from its pflag name (flag).
// Used for dotted viper keys like "storage.attachments.enabled" → flag "attachments-enabled".
func stringOptionF(viperKey, flagName, defaultValue, description string, legacyEnv ...string) configOption {
	return configOption{
		name:        viperKey,
		flag:        flagName,
		value:       defaultValue,
		description: description,
		legacyEnv:   legacyEnv,
		addFlag: func(flags *pflag.FlagSet) {
			flags.String(flagName, defaultValue, description)
		},
	}
}

// boolOptionF creates a bool option whose viper key (name) differs from its pflag name (flag).
func boolOptionF(viperKey, flagName string, defaultValue bool, description string, legacyEnv ...string) configOption {
	return configOption{
		name:        viperKey,
		flag:        flagName,
		value:       defaultValue,
		description: description,
		legacyEnv:   legacyEnv,
		addFlag: func(flags *pflag.FlagSet) {
			flags.Bool(flagName, defaultValue, description)
		},
	}
}

func stringSliceOption(name string, defaultValue []string, description string, legacyEnv ...string) configOption {
	return configOption{
		name:        name,
		value:       defaultValue,
		description: description,
		legacyEnv:   legacyEnv,
		addFlag: func(flags *pflag.FlagSet) {
			flags.StringSlice(name, defaultValue, description)
		},
	}
}

var rootConfigOptions = []configOption{
	stringOption("log-level", "info", "Log level (debug, info, warn, error)", "LOG_LEVEL"),
	stringOption(
		"database-url",
		"",
		"PostgreSQL or SQLite connection string (DSN or URL; sqlite:///path.db for SQLite)",
		"DATABASE_URL",
	),
}

func Execute() {
	rootCmd, err := NewRootCmd()
	cobra.CheckErr(err)

	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

func NewRootCmd() (*cobra.Command, error) {
	rootCmd := &cobra.Command{
		Use:           "sitrep",
		Short:         "SitRep — incident management server",
		SilenceUsage:  true,
		SilenceErrors: true,
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
	rootCmd.AddCommand(newAccessCmd(v))

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

		if err := v.BindPFlag(option.name, flags.Lookup(option.flagName())); err != nil {
			return fmt.Errorf("bind --%s: %w", option.flagName(), err)
		}
	}

	return nil
}

func canonicalEnvName(option string) string {
	r := strings.NewReplacer("-", "_", ".", "_")
	return "SITREP_" + strings.ToUpper(r.Replace(option))
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

// validSizePattern matches viper's parseSizeInBytes accepted forms:
// optional digits, optional whitespace, optional kb/mb/gb suffix (case-insensitive).
var validSizePattern = regexp.MustCompile(`(?i)^\s*\d+\s*(kb|mb|gb|b)?\s*$`)

func validateConfig(v *viper.Viper) error {
	if port := v.GetUint("port"); port == 0 || port > 65535 {
		return fmt.Errorf("port must be between 1 and 65535")
	}

	var level slog.Level

	logLevel := v.GetString("log-level")
	if err := level.UnmarshalText([]byte(logLevel)); err != nil {
		return fmt.Errorf("invalid log-level %q: %w", logLevel, err)
	}

	// Validate attachment config only when attachments are enabled.
	if v.GetBool("storage.attachments.enabled") {
		backend := v.GetString("storage.attachments.backend")
		switch backend {
		case "", "filesystem", "ephemeral", "database":
		default:
			return fmt.Errorf("storage.attachments.backend must be filesystem, ephemeral, or database; got %q", backend)
		}

		rawSize := v.GetString("storage.attachments.max-size")
		if !validSizePattern.MatchString(rawSize) {
			return fmt.Errorf("invalid size %q: use bytes or a kb/mb/gb suffix (e.g. 25mb)", rawSize)
		}

		maxBytes := v.GetSizeInBytes("storage.attachments.max-size")
		if maxBytes == 0 {
			return fmt.Errorf("storage.attachments.max-size must be greater than zero")
		}

		if maxBytes > message.MaxAttachmentSize {
			return fmt.Errorf(
				"storage.attachments.max-size %d bytes exceeds the domain maximum of %d bytes (25 MiB)",
				maxBytes, message.MaxAttachmentSize,
			)
		}

		if backend == "filesystem" && v.GetString("storage.attachments.filesystem.dir") == "" {
			return fmt.Errorf("storage.attachments.filesystem.dir must be set when backend is filesystem")
		}
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
