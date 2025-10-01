package auth

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/securecookie"
	"github.com/labstack/echo/v4"

	"github.com/zitadel/oidc/v3/pkg/client"
	"github.com/zitadel/oidc/v3/pkg/client/rp"
	httphelper "github.com/zitadel/oidc/v3/pkg/http"
	"github.com/zitadel/oidc/v3/pkg/oidc"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	semconv "go.opentelemetry.io/otel/semconv/v1.37.0"
	"go.opentelemetry.io/otel/trace"
)

type OIDCClient struct {
	rp           rp.RelyingParty
	logger       *slog.Logger
	secureCookie *securecookie.SecureCookie
}

var ErrUnauthorized = errors.New("unauthorized")

// NewOIDC returns a new OIDCClient
func NewOIDC(ctx context.Context, issuer, clientID, clientSecret, redirectURI, key string) (*OIDCClient, error) {
	var err error

	s := securecookie.New([]byte(key), []byte(key))
	s.MaxLength(4 * 4096) // 16KB
	o := &OIDCClient{
		logger:       slog.Default().WithGroup("oidc_client"),
		secureCookie: s,
	}
	// enable outgoing request logging
	client := &http.Client{Transport: otelhttp.NewTransport(http.DefaultTransport)}

	cookieHandler := httphelper.NewCookieHandler([]byte(key), []byte(key), httphelper.WithSameSite(http.SameSiteDefaultMode))
	options := []rp.Option{
		rp.WithCookieHandler(cookieHandler),
		rp.WithVerifierOpts(rp.WithIssuedAtOffset(5 * time.Second)),
		rp.WithHTTPClient(client),
		rp.WithLogger(o.logger),
		rp.WithSigningAlgsFromDiscovery(),
		rp.WithPKCE(cookieHandler),
	}

	scopes := []string{"openid", "profile", "email"}
	o.rp, err = rp.NewRelyingPartyOIDC(ctx, issuer, clientID, clientSecret, redirectURI, scopes, options...)

	return o, err
}

// Generates a random state string
func state() string {
	u, err := uuid.NewV7()
	if err != nil {
		return uuid.New().String()
	}
	return u.String()
}

// SignInHandler initiates the authentication /oauth2/sign_in
func (o *OIDCClient) SignInHandler(c echo.Context) error {
	_, err := o.userInfoFrom(c)
	// if already logged in redirect to main
	if err == nil {
		return c.Redirect(http.StatusFound, "/")
	}

	return echo.WrapHandler(rp.AuthURLHandler(state, o.rp))(c)
}

// CallbackHandler handles the auth callback from route /oauth2/callback
func (o *OIDCClient) CallbackHandler(c echo.Context) error {
	return echo.WrapHandler(rp.CodeExchangeHandler(rp.UserinfoCallback(o.marshalUserinfo(c)), o.rp))(c)
}

// marshalUserinfo handles the user info response and writes it to the HTTP response.
func (o *OIDCClient) marshalUserinfo(c echo.Context) func(w http.ResponseWriter, r *http.Request, tokens *oidc.Tokens[*oidc.IDTokenClaims], state string, rp rp.RelyingParty, info *oidc.UserInfo) {
	return func(w http.ResponseWriter, r *http.Request, tokens *oidc.Tokens[*oidc.IDTokenClaims], state string, rp rp.RelyingParty, info *oidc.UserInfo) {
		if tokens == nil || tokens.IDToken == "" {
			o.logger.Warn("No ID token found in callback")
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		if tokens.AccessToken != "" {
			err := o.encodeTokenFrom(c, "access_token", tokens.AccessToken, int(tokens.ExpiresIn))
			if err != nil {
				http.Error(w, "Internal Server Error", http.StatusInternalServerError)
				return
			}
		}
		if tokens.RefreshToken != "" {
			err := o.encodeTokenFrom(c, "refresh_token", tokens.RefreshToken, int((time.Until(tokens.Expiry.Add(2 * 24 * time.Hour)).Seconds())))
			if err != nil {
				http.Error(w, "Internal Server Error", http.StatusInternalServerError)
				return
			}
		}

		err := o.encodeTokenFrom(c, "id_token", tokens.IDToken, int(tokens.ExpiresIn))
		if err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			return
		}
		http.Redirect(w, r, "/", http.StatusFound)
	}
}

// SignOutHandler handles the signout /oauth2/sign_out
func (o *OIDCClient) SignOutHandler(c echo.Context) error {
	cookie, err := o.secureCookie.Encode("id_token", "")
	if err != nil {
		o.logger.Error("Failed to encode id token", "error", err)
		http.Error(c.Response().Writer, "Internal Server Error", http.StatusInternalServerError)
		return nil
	}
	c.SetCookie(&http.Cookie{
		Name:     "id_token",
		Value:    cookie,
		Path:     "/",
		HttpOnly: true,
		MaxAge:   -1,
	})
	return c.Redirect(http.StatusFound, "/")
}

// UserInfoHandler retrieves user information from the ID token and returns it as JSON.
func (o *OIDCClient) UserInfoHandler(c echo.Context) error {
	userInfo, err := o.userInfoFrom(c)
	if err != nil {
		if !errors.Is(err, ErrUnauthorized) {
			o.logger.Error("failed to get user info", "error.message", err.Error())
		}
		return c.JSON(http.StatusUnauthorized, "Unauthorized")
	}
	return c.JSON(http.StatusOK, userInfo)
}

func (o *OIDCClient) userInfoFrom(c echo.Context) (*UserInfo, error) {
	idToken := o.decodedTokenFrom(c, "id_token")
	if idToken == "" {
		return nil, ErrUnauthorized
	}

	accessToken := o.decodedTokenFrom(c, "access_token")
	refreshToken := o.decodedTokenFrom(c, "refresh_token")

	claims := &oidc.IDTokenClaims{}
	_, err := oidc.ParseToken(idToken, claims)
	if err != nil {
		o.logger.Error("failed to parse id_token", "error.message", err.Error())
		return nil, ErrUnauthorized
	}

	// Refresh the ID token if it is expiring within 15 minutes
	if refreshToken != "" && claims.GetExpiration().Before(time.Now().Add(15*time.Minute)) {
		o.logger.Debug("id_token is expiring soon, refreshing token", "expiration", claims.GetExpiration().String())

		assertion := ""
		if o.rp.Signer() != nil {
			assertion, err = client.SignedJWTProfileAssertion(o.rp.OAuthConfig().ClientID, []string{o.rp.Issuer(), o.rp.OAuthConfig().Endpoint.TokenURL}, time.Hour, o.rp.Signer())
			if err != nil {
				o.logger.Error("failed to create client assertion", "error.message", err.Error())
			}
		}

		tokens, err := rp.RefreshTokens[oidc.IDClaims](c.Request().Context(), o.rp, refreshToken, assertion, oidc.ClientAssertionTypeJWTAssertion)
		if err != nil {
			o.logger.Error("failed to refresh token", "error.message", err.Error())
			return nil, ErrUnauthorized
		}
		if tokens.IDToken == "" {
			o.logger.Error("no id_token returned from refresh")
			return nil, ErrUnauthorized
		}

		err = o.encodeTokenFrom(c, "id_token", tokens.IDToken, int(tokens.ExpiresIn))
		if err != nil {
			o.logger.Error("failed to encode refreshed id_token", "error.message", err.Error())
			return nil, ErrUnauthorized
		}
		idToken = tokens.IDToken
		_, err = oidc.ParseToken(idToken, claims)
		if err != nil {
			o.logger.Error("failed to parse id_token", "error.message", err.Error())
			return nil, ErrUnauthorized
		}

		if tokens.AccessToken != "" {
			err := o.encodeTokenFrom(c, "access_token", tokens.AccessToken, int(tokens.ExpiresIn))
			if err != nil {
				o.logger.Error("failed to encode refreshed access_token", "error.message", err.Error())
				return nil, ErrUnauthorized
			}
			accessToken = tokens.AccessToken
		}
		if tokens.RefreshToken != "" {
			err := o.encodeTokenFrom(c, "refresh_token", tokens.RefreshToken, int((time.Until(tokens.Expiry.Add(2 * 24 * time.Hour)).Seconds())))
			if err != nil {
				o.logger.Error("failed to encode refreshed refresh_token", "error.message", err.Error())
				return nil, ErrUnauthorized
			}
			refreshToken = tokens.RefreshToken
		}
	}

	return &UserInfo{
		Name:              claims.Name,
		User:              claims.Subject,
		Email:             claims.Email,
		PreferredUsername: claims.PreferredUsername,
		IDToken:           idToken,
		AccessToken:       accessToken,
		RefreshToken:      refreshToken,
		SessionID:         claims.SessionID,
	}, nil
}

func (o *OIDCClient) decodedTokenFrom(c echo.Context, cookiename string) string {
	cookie, err := c.Cookie(cookiename)
	if err != nil || cookie.Value == "" {
		return ""
	}

	// Decode the ID token cookie
	decodedCookie := ""
	err = o.secureCookie.Decode(cookiename, cookie.Value, &decodedCookie)
	if err != nil {
		o.logger.Error("failed to decode id_token cookie", "error", err)
		return ""
	}

	return decodedCookie
}

func (o *OIDCClient) encodeTokenFrom(c echo.Context, cookiename, value string, expiresIn int) error {
	encodedToken, err := o.secureCookie.Encode(cookiename, value)
	if err != nil {
		o.logger.Error("Failed to encode id token", "error", err)
		return errors.New("Failed to encode id token")
	}

	c.SetCookie(&http.Cookie{
		Name:     cookiename,
		Value:    encodedToken,
		Path:     "/",
		MaxAge:   expiresIn,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	})

	return nil
}

// Middleware: require valid ID token
func (o *OIDCClient) RequireLogin(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {
		userInfo, err := o.userInfoFrom(c)
		if err != nil {
			o.logger.Error("failed to get user info", string(semconv.ErrorMessageKey), err)
			return c.JSON(http.StatusUnauthorized, "Unauthorized")
		}
		c.Set("id_token", userInfo.IDToken)
		c.Set("access_token", userInfo.AccessToken)
		c.Set("refresh_token", userInfo.RefreshToken)
		c.Set("user_info", userInfo)

		span := trace.SpanFromContext(c.Request().Context())
		span.SetAttributes(
			semconv.EnduserID(userInfo.Email),
			semconv.EnduserPseudoID(userInfo.User),
			semconv.SessionID(userInfo.SessionID),
		)
		return next(c)
	}
}
