package auth

import (
	"errors"
	"log"
	"os"

	"github.com/coreos/go-oidc/v3/oidc"
)

// Config represents available options for oidcauth.
type Config struct {
	// ClientID is the OAUTH2 Client ID
	// Default value is: (read from OS ENV: OAUTH2_CLIENT_ID)
	ClientID string

	// ClientSecret is the OAUTH2 Client Secret
	// Default value is: (read from OS ENV: OAUTH2_CLIENT_SECRET)
	ClientSecret string

	// IssuerURL is the root URL to theIdentity Provider
	// Default value is: (read from OS ENV: OIDC_ISSUER_URL)
	IssuerURL string

	// RedirectURL is the path that the Identity Provider will redirect clients to
	// Default value is: (read from OS ENV: OIDC_REDIRECT_URL)
	RedirectURL string

	// Scopes is a list of OIDC Scopes to request.
	// Default value is: []string{oidc.ScopeOpenID, "profile", "email"}
	Scopes []string

	// LoginClaim is the OIDC claim to map to the user's login (username)
	// Default value is: "email"
	LoginClaim string

	// SessionClaims is the list of OIDC claims to add to the user's session (in addition to LoginClaim)
	// Example []string{"email", "givenName", "name"}
	// NOTE: This can be set to ["*"] to load *all* claims. (nonce will be excluded)
	// Default value is: ["*"]
	SessionClaims []string

	// SessionPrefix is an optional prefix string to prefix to the claims (i.e. google: or corp:) to prevent
	// clashes in the session namespace
	// Default value is: ""
	SessionPrefix string

	// DefaultAuthenticatedURL is the URL to redirect a user to after successful authentication. By default, we will
	//   try to determine where they were when they requested to login and send them back there.
	// Default value is: "/"
	DefaultAuthenticatedURL string

	// LogoutURL is the URL to redirect a user to after logging out.
	// NOTE: If you require / to be authenticated, setting this to / will start the login process immediately, which may not be desirable.
	// Default value is: "/"
	LogoutURL string
}

// DefaultConfig will create a new config object with defaults
// NOTE: This matches the examples on https://github.com/coreos/go-oidc/tree/v3/example
func DefaultConfig() (c *Config) {
	c = &Config{
		ClientID:                os.Getenv("OIDC_CLIENT_ID"),
		ClientSecret:            os.Getenv("OIDC_CLIENT_SECRET"),
		IssuerURL:               os.Getenv("OIDC_ISSUER_URL"),
		RedirectURL:             os.Getenv("OIDC_REDIRECT_URL"),
		Scopes:                  []string{oidc.ScopeOpenID, "profile", "email"},
		LoginClaim:              "email",
		SessionClaims:           []string{"*"},
		DefaultAuthenticatedURL: "/",
		LogoutURL:               "/",
	}
	return
}

// ExampleConfigDex will return the config for a default DEX IdP example-app
// DEX: https://github.com/dexidp/dex
func ExampleConfigDex() (c *Config) {
	c = DefaultConfig()
	c.ClientID = "example-app"
	c.ClientSecret = "ZXhhbXBsZS1hcHAtc2VjcmV0"
	c.IssuerURL = "http://127.0.0.1:5556/dex"
	c.RedirectURL = "http://127.0.0.1:5555/callback"
	return
}

// ExampleConfigGoogle will return the config for the Google Accounts IdP like the go-oidc examples
// go-oidc google example:  https://github.com/coreos/go-oidc/tree/v3/example
func ExampleConfigGoogle() (c *Config) {
	c = DefaultConfig()
	c.ClientID = os.Getenv("GOOGLE_OAUTH2_CLIENT_ID")
	c.ClientSecret = os.Getenv("GOOGLE_OAUTH2_CLIENT_SECRET")
	c.IssuerURL = "https://accounts.google.com"
	c.RedirectURL = "http://127.0.0.1:5556/auth/google/callback"
	return
}

// Validate will validate the Config
func (c Config) Validate() (err error) {

	if c.ClientID == "" {
		err = errors.New("ClientID is required")
		return
	}

	if c.ClientSecret == "" {
		err = errors.New("ClientSecret is required")
		return
	}

	if c.IssuerURL == "" { // TODO: Validate that its a properly formed URL
		err = errors.New("IssuerURL is required")
		return
	}

	if c.RedirectURL == "" { // TODO: Validate that its a properly formed URL
		err = errors.New("RedirectURL is required")
		return
	}

	return
}

// GetOidcAuth returns the configured OIDC authentication controller
func GetOidcAuth(c *Config) (o *OidcAuth, err error) {
	return c.GetOidcAuth()
}

// GetOidcAuth returns the configured OIDC authentication controller
func (c *Config) GetOidcAuth() (o *OidcAuth, err error) {
	err = c.Validate()
	if err != nil {
		log.Fatal(err)
	}
	return newOidcAuth(c)
}

// The methods below can be used to return the middleware, but currently do
// not handle the routes. They are of limited use, for now.
//
// // Default returns the location middleware with default configuration.
// func Default() gin.HandlerFunc {
// 	config := DefaultConfig()
// 	return New(config)
// }

// // New returns the location middleware with user-defined custom configuration.
// func New(c *Config) gin.HandlerFunc {
// 	auth, err := c.GetOidcAuth()
// 	if err != nil {
// 		log.Fatal("[oidcauth] Error getting auth handler")
// 	}
// 	return auth.AuthRequired()
// }
