package config

import (
	"fmt"

	oidcauth "github.com/TJM/gin-gonic-oidcauth"
	"github.com/spf13/viper"
)

// GetOidcConfig will return the config for OIDC auth
func GetOidcConfig() (c *oidcauth.Config) {
	c = oidcauth.DefaultConfig()
	c.ClientID = viper.GetString("oidcClientId")
	c.ClientSecret = viper.GetString("oidcClientSecret")
	c.IssuerURL = viper.GetString("oidcIssuerURL")
	c.RedirectURL = fmt.Sprintf("%s/oauth2/callback", viper.GetString("rootURL"))
	c.DefaultAuthenticatedURL = "/index.html"
	return c
}
