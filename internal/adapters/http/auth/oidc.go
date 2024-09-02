package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"log/slog"

	"github.com/alexedwards/scs/v2"
	"github.com/google/uuid"
	"github.com/spf13/viper"
	"github.com/zitadel/oidc/v3/pkg/client/rp"
	httphelper "github.com/zitadel/oidc/v3/pkg/http"
	"github.com/zitadel/oidc/v3/pkg/oidc"
)

func shaHashing(input string) string {
	plainText := []byte(input)
	sha256Hash := sha256.Sum256(plainText)
	return hex.EncodeToString(sha256Hash[:])
}

func GetCookieHandler() *httphelper.CookieHandler {
	secret := viper.GetString("cookieSecret")
	cookieHandler := httphelper.NewCookieHandler([]byte(shaHashing(secret))[:32], []byte(shaHashing(secret))[:32])

	return cookieHandler
}

func GetOIDC(ctx context.Context, cookieHandler *httphelper.CookieHandler) (rp.RelyingParty, error) {
	options := []rp.Option{
		rp.WithCookieHandler(cookieHandler),
		rp.WithVerifierOpts(rp.WithIssuedAtOffset(5 * time.Second)),
		rp.WithHTTPClient(&http.Client{
			Timeout: time.Minute,
		}),
		rp.WithLogger(slog.Default()),
	}

	issuer := viper.GetString("oidcIssuerURL")
	clientID := viper.GetString("oidcClientId")
	clientSecret := viper.GetString("oidcClientSecret")
	domain := viper.GetString("domain")
	port := viper.GetString("port")
	redirectURI := fmt.Sprintf("https://%s:%s/oauth2/callback", domain, port)
	scopes := []string{"openid", "email", "profile"}
	return rp.NewRelyingPartyOIDC(ctx, issuer, clientID, clientSecret, redirectURI, scopes, options...)
}

func RandomState() string {
	var bytes [32]byte
	_, err := rand.Read(bytes[:])
	if err != nil {
		return uuid.NewString()
	}
	return base64.StdEncoding.EncodeToString(bytes[:])
}

type AuthInfo struct {
	UserInfo *oidc.UserInfo                    `json:"userInfo"`
	IDToken  *oidc.Tokens[*oidc.IDTokenClaims] `json:"idToken"`
}

func MarshalUserInfo(sm *scs.SessionManager) func(http.ResponseWriter, *http.Request, *oidc.Tokens[*oidc.IDTokenClaims], string, rp.RelyingParty, *oidc.UserInfo) {
	return func(w http.ResponseWriter, r *http.Request, tokens *oidc.Tokens[*oidc.IDTokenClaims], state string, rp rp.RelyingParty, info *oidc.UserInfo) {
		i := AuthInfo{UserInfo: info, IDToken: tokens}
		userInfo, _ := json.Marshal(i)
		sm.Put(r.Context(), IDTokenKey, tokens.IDToken)
		sm.Put(r.Context(), AuthInfoKey, userInfo)
		sm.Put(r.Context(), RefreshTokenKey, tokens.RefreshToken)
		sm.Put(r.Context(), AccessTokenKey, tokens.AccessToken)
		sm.Put(r.Context(), UserIDKey, FirstNonEmpty([]string{i.UserInfo.PreferredUsername, i.UserInfo.Subject, i.IDToken.IDTokenClaims.Subject}))
		sm.Put(r.Context(), EmailKey, FirstNonEmpty([]string{i.UserInfo.Email, i.IDToken.IDTokenClaims.Email}))
		http.Redirect(w, r, "/index.html", http.StatusFound)
	}
}

func FirstNonEmpty(s []string) string {
	for _, e := range s {
		if e != "" {
			return e
		}
	}
	return ""
}

func UserInfoHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		type User struct {
			UserID   string   `json:"user"`
			Email    string   `json:"email"`
			AuthInfo AuthInfo `json:"authInfo"`
		}

		u := User{}

		userId := r.Context().Value(UserIDKey)
		if userId, ok := userId.(string); ok {
			u.UserID = userId
		}

		email := r.Context().Value(EmailKey)
		if email, ok := email.(string); ok {
			u.Email = email
		}

		json.NewEncoder(w).Encode(u)
	}
}
