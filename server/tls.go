package server

import (
	"crypto/tls"
	"errors"
	"fmt"
	"path/filepath"

	"golang.org/x/crypto/acme"
	"golang.org/x/crypto/acme/autocert"
)

// acmeTLSPort is the only port on which a TLS-ALPN-01 challenge is accepted.
// Let's Encrypt always connects to it, regardless of the port the server binds.
const acmeTLSPort = 443

// TLSConfig selects how the server obtains its certificate. Exactly one of the
// two modes must be configured: a static key pair, or ACME.
type TLSConfig struct {
	// CertFile and KeyFile point at a PEM key pair managed outside the server.
	CertFile string
	KeyFile  string

	// ACMEDomains enables ACME when non-empty. Certificates are issued for
	// these hostnames only.
	ACMEDomains []string
	// ACMEEmail is registered with the CA for expiry notices. Optional.
	ACMEEmail string
	// ACMECacheDir persists account keys and certificates across restarts.
	// Without it every restart requests a new certificate and will hit the
	// CA's rate limits.
	ACMECacheDir string
	// ACMEDirectoryURL overrides the CA. Empty means Let's Encrypt production;
	// point it at the staging directory while testing.
	ACMEDirectoryURL string
}

func (c TLSConfig) usesACME() bool { return len(c.ACMEDomains) > 0 }

func (c TLSConfig) validate(port uint) error {
	hasKeyPair := c.CertFile != "" || c.KeyFile != ""

	switch {
	case hasKeyPair && c.usesACME():
		return errors.New("tls: acme-domains cannot be combined with tls-cert/tls-key")
	case !hasKeyPair && !c.usesACME():
		return errors.New("tls: either tls-cert and tls-key, or acme-domains must be set")
	case hasKeyPair && (c.CertFile == "" || c.KeyFile == ""):
		return errors.New("tls: tls-cert and tls-key must be set together")
	}

	if !c.usesACME() {
		return nil
	}

	if c.ACMECacheDir == "" {
		return errors.New("tls: acme-cache-dir is required so certificates survive a restart")
	}

	if !filepath.IsAbs(c.ACMECacheDir) {
		return fmt.Errorf("tls: acme-cache-dir must be an absolute path, got %q", c.ACMECacheDir)
	}

	// TLS-ALPN-01 is the only challenge type served, and the CA always dials 443.
	if port != acmeTLSPort {
		return fmt.Errorf("tls: acme requires port %d, got %d", acmeTLSPort, port)
	}

	return nil
}

// WithTLS serves HTTPS instead of HTTP.
func WithTLS(cfg TLSConfig) Option {
	return func(s *Server) error {
		if err := cfg.validate(s.port); err != nil {
			return err
		}

		s.tls = &cfg

		return nil
	}
}

// autocertManager builds the certificate manager for ACME mode. The returned
// tls.Config answers TLS-ALPN-01 challenges on the listening socket, so no
// separate HTTP-01 listener on port 80 is needed.
func (c TLSConfig) autocertManager() *autocert.Manager {
	m := &autocert.Manager{
		Prompt:     autocert.AcceptTOS,
		HostPolicy: autocert.HostWhitelist(c.ACMEDomains...),
		Cache:      autocert.DirCache(c.ACMECacheDir),
		Email:      c.ACMEEmail,
	}

	if c.ACMEDirectoryURL != "" {
		m.Client = &acme.Client{DirectoryURL: c.ACMEDirectoryURL}
	}

	return m
}

// listenAndServe starts the server in the configured mode.
func (s *Server) listenAndServe() error {
	if s.tls == nil {
		return s.Server.ListenAndServe()
	}

	if !s.tls.usesACME() {
		return s.ListenAndServeTLS(s.tls.CertFile, s.tls.KeyFile)
	}

	manager := s.tls.autocertManager()

	tlsConfig := manager.TLSConfig()
	tlsConfig.MinVersion = tls.VersionTLS12
	s.TLSConfig = tlsConfig

	// Paths are already in TLSConfig.GetCertificate.
	return s.ListenAndServeTLS("", "")
}
