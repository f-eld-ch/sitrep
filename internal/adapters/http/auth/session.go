package auth

import (
	"context"
	"net/http"
	"time"

	"github.com/alexedwards/scs/v2"
)

const (
	IDTokenKey      string = "id-token"
	AccessTokenKey  string = "access-token"
	RefreshTokenKey string = "refresh-token"

	AuthInfoKey string = "authInfo"
	UserIDKey   string = "userID"
	EmailKey    string = "email"
	GroupsKey   string = "groups"

	AuthenticatedKey string = "authenticated"
)

func SessionWith(sessionManager *scs.SessionManager) func(http.Handler) http.Handler {

	sessionManager.Lifetime = 12 * time.Hour
	sessionManager.IdleTimeout = 120 * time.Minute
	sessionManager.Cookie.Name = "session_id"
	sessionManager.Cookie.HttpOnly = true
	sessionManager.Cookie.Persist = true
	sessionManager.Cookie.SameSite = http.SameSiteDefaultMode
	sessionManager.Cookie.Secure = true

	f := func(h http.Handler) http.Handler {
		fn := func(w http.ResponseWriter, r *http.Request) {
			userID := sessionManager.GetString(r.Context(), UserIDKey)
			email := sessionManager.GetString(r.Context(), EmailKey)

			ctx := r.Context()
			if userID == "" {
				ctx = context.WithValue(ctx, AuthenticatedKey, false)
				h.ServeHTTP(w, r)
			}
			ctx = context.WithValue(ctx, AuthenticatedKey, true)
			ctx = context.WithValue(ctx, UserIDKey, userID)
			ctx = context.WithValue(ctx, EmailKey, email)

			groups := sessionManager.Get(r.Context(), GroupsKey)
			if g, ok := groups.([]string); ok {
				ctx = context.WithValue(ctx, GroupsKey, g)
			}

			h.ServeHTTP(w, r.WithContext(ctx))
		}
		return sessionManager.LoadAndSave(http.HandlerFunc(fn))
	}

	return f
}

func AuthRequired(next http.Handler) http.Handler {
	fn := func(w http.ResponseWriter, r *http.Request) {
		ctx := r.Context()

		authenticated := r.Context().Value(AuthenticatedKey)
		auth, ok := authenticated.(bool)
		if !ok || !auth {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r.WithContext(ctx))
	}
	return http.HandlerFunc(fn)
}
