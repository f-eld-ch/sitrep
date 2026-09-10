package cli

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/spf13/pflag"
	"github.com/spf13/viper"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoadConfig(t *testing.T) {
	t.Run("loads an explicit configuration file", func(t *testing.T) {
		configPath := writeConfig(t, "port: 4321\nlog-level: debug\n")
		v := testViper(t)

		err := loadConfig(v, configPath)

		require.NoError(t, err)
		assert.Equal(t, uint(4321), v.GetUint("port"))
		assert.Equal(t, "debug", v.GetString("log-level"))
	})

	t.Run("rejects a missing explicit configuration file", func(t *testing.T) {
		err := loadConfig(testViper(t), filepath.Join(t.TempDir(), "missing.yaml"))

		require.Error(t, err)
		assert.ErrorContains(t, err, "read configuration")
	})

	t.Run("environment variables override the configuration file", func(t *testing.T) {
		t.Setenv("SITREP_PORT", "5432")
		configPath := writeConfig(t, "port: 4321\n")

		v := testViper(t)
		err := loadConfig(v, configPath)

		require.NoError(t, err)
		assert.Equal(t, uint(5432), v.GetUint("port"))
	})

	t.Run("retention settings use YAML, environment, and flag precedence", func(t *testing.T) {
		t.Setenv("SITREP_AUTO_CLOSE_INCIDENTS", "20")

		flags := pflag.NewFlagSet("serve", pflag.ContinueOnError)
		v, err := newViper(rootConfigOptions, serveConfigOptions)
		require.NoError(t, err)
		require.NoError(t, bindFlags(v, flags, serveConfigOptions))
		require.NoError(t, flags.Parse([]string{"--auto-close-incidents=10"}))
		configPath := writeConfig(t, "auto-close-incidents: 30\nauto-archive-incidents: 90\n")

		require.NoError(t, loadConfig(v, configPath))
		assert.Equal(t, uint(10), v.GetUint("auto-close-incidents"))
		assert.Equal(t, uint(90), v.GetUint("auto-archive-incidents"))
	})
}

func TestCanonicalEnvName(t *testing.T) {
	tests := []struct {
		option string
		want   string
	}{
		{"port", "SITREP_PORT"},
		{"log-level", "SITREP_LOG_LEVEL"},
		{"storage.attachments.enabled", "SITREP_STORAGE_ATTACHMENTS_ENABLED"},
		{"storage.attachments.max-size", "SITREP_STORAGE_ATTACHMENTS_MAX_SIZE"},
		{"storage.attachments.filesystem.dir", "SITREP_STORAGE_ATTACHMENTS_FILESYSTEM_DIR"},
	}

	for _, tt := range tests {
		t.Run(tt.option, func(t *testing.T) {
			assert.Equal(t, tt.want, canonicalEnvName(tt.option))
		})
	}
}

func TestConfigValidate(t *testing.T) {
	t.Run("rejects an invalid server port", func(t *testing.T) {
		v := testViper(t)
		v.Set("port", 65536)
		err := validateConfig(v)

		require.Error(t, err)
		assert.ErrorContains(t, err, "port")
	})

	t.Run("rejects unknown attachment backend", func(t *testing.T) {
		v := testViper(t)
		v.Set("storage.attachments.enabled", true)
		v.Set("storage.attachments.backend", "s3")
		v.Set("storage.attachments.max-size", "25mb")
		v.Set("storage.attachments.filesystem.dir", "/tmp/att")
		err := validateConfig(v)

		require.Error(t, err)
		assert.ErrorContains(t, err, "backend")
	})

	t.Run("rejects invalid max-size format", func(t *testing.T) {
		v := testViper(t)
		v.Set("storage.attachments.enabled", true)
		v.Set("storage.attachments.backend", "ephemeral")
		v.Set("storage.attachments.max-size", "25MiB")
		err := validateConfig(v)

		require.Error(t, err)
		assert.ErrorContains(t, err, "invalid size")
	})

	t.Run("rejects empty dir when backend is filesystem", func(t *testing.T) {
		v := testViper(t)
		v.Set("storage.attachments.enabled", true)
		v.Set("storage.attachments.backend", "filesystem")
		v.Set("storage.attachments.max-size", "25mb")
		v.Set("storage.attachments.filesystem.dir", "")
		err := validateConfig(v)

		require.Error(t, err)
		assert.ErrorContains(t, err, "filesystem.dir")
	})

	t.Run("passes valid attachment config", func(t *testing.T) {
		v := testViper(t)
		v.Set("storage.attachments.enabled", true)
		v.Set("storage.attachments.backend", "ephemeral")
		v.Set("storage.attachments.max-size", "25mb")
		err := validateConfig(v)

		require.NoError(t, err)
	})
}

func TestNewRootCmd(t *testing.T) {
	rootCmd, err := NewRootCmd()

	require.NoError(t, err)

	configFlag := rootCmd.PersistentFlags().Lookup("config")
	require.NotNil(t, configFlag)
	assert.Empty(t, configFlag.DefValue)
	assert.NotNil(t, rootCmd.PersistentFlags().Lookup("database-url"))
	assert.Nil(t, rootCmd.PersistentFlags().Lookup("port"))

	serveCmd, _, err := rootCmd.Find([]string{"serve"})
	require.NoError(t, err)
	assert.NotNil(t, serveCmd.Flags().Lookup("port"))
	assert.NotNil(t, serveCmd.Flags().Lookup("migrate-on-startup"))
	assert.Nil(t, serveCmd.Flags().Lookup("database-url"))
	assert.Equal(t, "0", serveCmd.Flags().Lookup("auto-close-incidents").DefValue)
	assert.Equal(t, "0", serveCmd.Flags().Lookup("auto-archive-incidents").DefValue)

	accessCmd, _, err := rootCmd.Find([]string{"access"})
	require.NoError(t, err)
	assert.NotNil(t, accessCmd)

	usersCmd, _, err := rootCmd.Find([]string{"access", "users"})
	require.NoError(t, err)
	assert.NotNil(t, usersCmd)
}

func testViper(t *testing.T) *viper.Viper {
	t.Helper()

	v, err := newViper(rootConfigOptions, serveConfigOptions)
	require.NoError(t, err)

	return v
}

func writeConfig(t *testing.T, contents string) string {
	t.Helper()
	configPath := filepath.Join(t.TempDir(), "config.yaml")
	require.NoError(t, os.WriteFile(configPath, []byte(contents), 0o600))

	return configPath
}
