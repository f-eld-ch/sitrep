package server

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestWithTLSValidation(t *testing.T) {
	tests := []struct {
		name    string
		port    uint
		cfg     TLSConfig
		wantErr string
	}{
		{
			name: "static key pair",
			port: 4180,
			cfg:  TLSConfig{CertFile: "/tls/cert.pem", KeyFile: "/tls/key.pem"},
		},
		{
			name: "acme on 443",
			port: acmeTLSPort,
			cfg:  TLSConfig{ACMEDomains: []string{"sitrep.example.org"}, ACMECacheDir: "/var/lib/sitrep/acme"},
		},
		{
			name:    "key pair and acme are mutually exclusive",
			port:    acmeTLSPort,
			cfg:     TLSConfig{CertFile: "/tls/cert.pem", KeyFile: "/tls/key.pem", ACMEDomains: []string{"a.example"}},
			wantErr: "cannot be combined",
		},
		{
			name:    "cert without key",
			port:    4180,
			cfg:     TLSConfig{CertFile: "/tls/cert.pem"},
			wantErr: "must be set together",
		},
		{
			name:    "nothing configured",
			port:    4180,
			cfg:     TLSConfig{},
			wantErr: "must be set",
		},
		{
			name:    "acme without cache dir",
			port:    acmeTLSPort,
			cfg:     TLSConfig{ACMEDomains: []string{"a.example"}},
			wantErr: "acme-cache-dir is required",
		},
		{
			name:    "acme with relative cache dir",
			port:    acmeTLSPort,
			cfg:     TLSConfig{ACMEDomains: []string{"a.example"}, ACMECacheDir: "acme"},
			wantErr: "absolute path",
		},
		{
			name:    "acme on a port other than 443",
			port:    4180,
			cfg:     TLSConfig{ACMEDomains: []string{"a.example"}, ACMECacheDir: "/var/lib/sitrep/acme"},
			wantErr: "acme requires port 443",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			s := &Server{port: tc.port}

			err := WithTLS(tc.cfg)(s)
			if tc.wantErr != "" {
				require.Error(t, err)
				assert.Contains(t, err.Error(), tc.wantErr)
				assert.Nil(t, s.tls)

				return
			}

			require.NoError(t, err)
			require.NotNil(t, s.tls)
		})
	}
}

func TestAutocertManagerUsesConfiguredDirectory(t *testing.T) {
	cfg := TLSConfig{
		ACMEDomains:      []string{"sitrep.example.org"},
		ACMECacheDir:     "/var/lib/sitrep/acme",
		ACMEEmail:        "ops@example.org",
		ACMEDirectoryURL: "https://acme-staging-v02.api.letsencrypt.org/directory",
	}

	m := cfg.autocertManager()

	require.NotNil(t, m.Client)
	assert.Equal(t, cfg.ACMEDirectoryURL, m.Client.DirectoryURL)
	assert.Equal(t, cfg.ACMEEmail, m.Email)
	require.NoError(t, m.HostPolicy(t.Context(), "sitrep.example.org"))
	assert.Error(t, m.HostPolicy(t.Context(), "attacker.example.org"))
}
