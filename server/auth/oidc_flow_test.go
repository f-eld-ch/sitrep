package auth

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync"
	"testing"
	"time"

	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

const (
	testClientID     = "sitrep-test"
	testClientSecret = "s3cret"
	testRedirectURI  = "http://localhost/oauth2/callback"
	testCookieKey    = "a-test-cookie-key"
	testKeyID        = "test-key-1"
)

// fakeProvider is a minimal OIDC provider: discovery, JWKS, token and userinfo endpoints,
// signing ID tokens with a throwaway RSA key.
type fakeProvider struct {
	t      *testing.T
	srv    *httptest.Server
	key    *rsa.PrivateKey
	signer *rsa.PrivateKey // key used to sign tokens (differs from key to forge)

	mu            sync.Mutex
	tokenRequests []url.Values
	idTokenTTL    time.Duration
	refreshToken  string
	omitIDToken   bool
	failRefresh   bool
}

func newFakeProvider(t *testing.T) *fakeProvider {
	t.Helper()

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)

	p := &fakeProvider{
		t:            t,
		key:          key,
		signer:       key,
		idTokenTTL:   time.Hour,
		refreshToken: "refresh-1",
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/.well-known/openid-configuration", p.discovery)
	mux.HandleFunc("/keys", p.jwks)
	mux.HandleFunc("/token", p.token)
	mux.HandleFunc("/userinfo", p.userinfo)

	p.srv = httptest.NewServer(mux)
	t.Cleanup(p.srv.Close)

	return p
}

func (p *fakeProvider) discovery(w http.ResponseWriter, _ *http.Request) {
	writeJSON(p.t, w, map[string]any{
		"issuer":                                p.srv.URL,
		"authorization_endpoint":                p.srv.URL + "/authorize",
		"token_endpoint":                        p.srv.URL + "/token",
		"userinfo_endpoint":                     p.srv.URL + "/userinfo",
		"jwks_uri":                              p.srv.URL + "/keys",
		"id_token_signing_alg_values_supported": []string{"RS256"},
	})
}

func (p *fakeProvider) jwks(w http.ResponseWriter, _ *http.Request) {
	pub := p.key.PublicKey
	writeJSON(p.t, w, map[string]any{"keys": []map[string]string{{
		"kty": "RSA", "use": "sig", "alg": "RS256", "kid": testKeyID,
		"n": base64.RawURLEncoding.EncodeToString(pub.N.Bytes()),
		"e": base64.RawURLEncoding.EncodeToString(big.NewInt(int64(pub.E)).Bytes()),
	}}})
}

func (p *fakeProvider) userinfo(w http.ResponseWriter, _ *http.Request) {
	writeJSON(p.t, w, map[string]string{
		"sub": "user-1", "email": "alice@example.com", "name": "Alice",
	})
}

func (p *fakeProvider) token(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	_ = r.ParseForm()

	p.mu.Lock()
	p.tokenRequests = append(p.tokenRequests, r.PostForm)
	omit := p.omitIDToken
	fail := p.failRefresh && r.PostForm.Get("grant_type") == "refresh_token"
	ttl := p.idTokenTTL
	refresh := p.refreshToken
	p.mu.Unlock()

	if fail {
		w.WriteHeader(http.StatusBadRequest)
		writeJSON(p.t, w, map[string]string{"error": "invalid_grant"})

		return
	}

	resp := map[string]any{
		"access_token":  "access-" + r.PostForm.Get("grant_type"),
		"token_type":    "Bearer",
		"expires_in":    int(ttl.Seconds()),
		"refresh_token": refresh,
	}
	if !omit {
		resp["id_token"] = p.signIDToken("user-1", ttl)
	}

	writeJSON(p.t, w, resp)
}

func (p *fakeProvider) signIDToken(sub string, ttl time.Duration) string {
	return p.signClaims(p.signer, map[string]any{
		"iss":                p.srv.URL,
		"sub":                sub,
		"aud":                []string{testClientID},
		"exp":                time.Now().Add(ttl).Unix(),
		"iat":                time.Now().Unix(),
		"email":              "alice@example.com",
		"name":               "Alice",
		"preferred_username": "alice",
		"sid":                "session-1",
	})
}

func (p *fakeProvider) signClaims(key *rsa.PrivateKey, claims map[string]any) string {
	enc := func(v any) string {
		b, err := json.Marshal(v)
		require.NoError(p.t, err)

		return base64.RawURLEncoding.EncodeToString(b)
	}

	signingInput := enc(map[string]string{"alg": "RS256", "typ": "JWT", "kid": testKeyID}) + "." + enc(claims)
	sum := sha256.Sum256([]byte(signingInput))
	sig, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, sum[:])
	require.NoError(p.t, err)

	return signingInput + "." + base64.RawURLEncoding.EncodeToString(sig)
}

func (p *fakeProvider) requests() []url.Values {
	p.mu.Lock()
	defer p.mu.Unlock()

	return append([]url.Values(nil), p.tokenRequests...)
}

func (p *fakeProvider) set(f func(*fakeProvider)) {
	p.mu.Lock()
	defer p.mu.Unlock()

	f(p)
}

func newTestClient(t *testing.T, p *fakeProvider) *OIDCClient {
	t.Helper()

	o, err := NewOIDC(context.Background(), p.srv.URL, testClientID, testClientSecret, testRedirectURI, testCookieKey)
	require.NoError(t, err)

	return o
}

// do runs a handler through echo with the given cookies and returns the recorder.
func do(t *testing.T, h echo.HandlerFunc, target string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	t.Helper()

	e := echo.New()
	req := httptest.NewRequestWithContext(context.Background(), http.MethodGet, target, nil)

	for _, c := range cookies {
		req.AddCookie(c)
	}

	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	require.NoError(t, h(c))

	return rec
}

func setCookies(rec *httptest.ResponseRecorder) []*http.Cookie {
	res := rec.Result()
	defer func() { _ = res.Body.Close() }()

	return res.Cookies()
}

func cookieNamed(rec *httptest.ResponseRecorder, name string) *http.Cookie {
	for _, c := range setCookies(rec) {
		if c.Name == name {
			return c
		}
	}

	return nil
}

// login performs sign-in and callback, returning the callback response and its cookies.
func login(t *testing.T, o *OIDCClient) (*httptest.ResponseRecorder, []*http.Cookie) {
	t.Helper()

	in := do(t, o.SignInHandler, "/oauth2/sign_in")
	require.Equal(t, http.StatusFound, in.Code)

	loc, err := url.Parse(in.Header().Get("Location"))
	require.NoError(t, err)

	cb := do(t, o.CallbackHandler,
		testRedirectURI+"?code=abc&state="+url.QueryEscape(loc.Query().Get("state")),
		setCookies(in)...)

	return cb, setCookies(cb)
}

func TestNewOIDCFailsWithoutDiscovery(t *testing.T) {
	srv := httptest.NewServer(http.NotFoundHandler())
	defer srv.Close()

	_, err := NewOIDC(context.Background(), srv.URL, testClientID, testClientSecret, testRedirectURI, testCookieKey)
	require.Error(t, err)
}

func TestSignInRedirectsToProviderWithStateAndPKCE(t *testing.T) {
	p := newFakeProvider(t)
	o := newTestClient(t, p)

	rec := do(t, o.SignInHandler, "/oauth2/sign_in")

	assert.Equal(t, http.StatusFound, rec.Code)

	loc, err := url.Parse(rec.Header().Get("Location"))
	require.NoError(t, err)

	assert.Equal(t, p.srv.URL+"/authorize", loc.Scheme+"://"+loc.Host+loc.Path)

	q := loc.Query()
	assert.Equal(t, testClientID, q.Get("client_id"))
	assert.Equal(t, testRedirectURI, q.Get("redirect_uri"))
	assert.Equal(t, "code", q.Get("response_type"))
	assert.Equal(t, "S256", q.Get("code_challenge_method"))
	assert.NotEmpty(t, q.Get("code_challenge"))
	assert.NotEmpty(t, q.Get("state"))
	assert.Contains(t, q.Get("scope"), "offline_access")

	for _, name := range []string{"state", "pkce"} {
		c := cookieNamed(rec, name)
		require.NotNil(t, c, name)
		assert.True(t, c.Secure, name)
		assert.True(t, c.HttpOnly, name)
		assert.Equal(t, http.SameSiteLaxMode, c.SameSite, name)
	}
}

func TestSignInRedirectsHomeWhenAlreadyLoggedIn(t *testing.T) {
	p := newFakeProvider(t)
	o := newTestClient(t, p)
	_, cookies := login(t, o)

	rec := do(t, o.SignInHandler, "/oauth2/sign_in", cookies...)

	assert.Equal(t, http.StatusFound, rec.Code)
	assert.Equal(t, "/", rec.Header().Get("Location"))
}

func TestCallbackSetsSessionCookies(t *testing.T) {
	p := newFakeProvider(t)
	o := newTestClient(t, p)

	cb, cookies := login(t, o)

	assert.Equal(t, http.StatusFound, cb.Code)
	assert.Equal(t, "/", cb.Header().Get("Location"))

	byName := map[string]*http.Cookie{}
	for _, c := range cookies {
		byName[c.Name] = c
	}

	for _, name := range []string{"id_token", "access_token", "refresh_token"} {
		c := byName[name]
		require.NotNil(t, c, name)
		assert.True(t, c.Secure, name)
		assert.True(t, c.HttpOnly, name)
		assert.Equal(t, http.SameSiteLaxMode, c.SameSite, name)
		assert.Equal(t, "/", c.Path, name)
	}

	assert.Equal(t, 3600, byName["id_token"].MaxAge)
	assert.Equal(t, refreshTokenCookieMaxAge, byName["refresh_token"].MaxAge)

	// the code exchange carried the code and the PKCE verifier
	reqs := p.requests()
	require.Len(t, reqs, 1)
	assert.Equal(t, "authorization_code", reqs[0].Get("grant_type"))
	assert.Equal(t, "abc", reqs[0].Get("code"))
	assert.NotEmpty(t, reqs[0].Get("code_verifier"))

	// the cookie value is encrypted, not the raw JWT
	assert.NotContains(t, byName["id_token"].Value, ".")
}

func TestCallbackRejectsWrongState(t *testing.T) {
	p := newFakeProvider(t)
	o := newTestClient(t, p)

	in := do(t, o.SignInHandler, "/oauth2/sign_in")
	cb := do(t, o.CallbackHandler, testRedirectURI+"?code=abc&state=forged", setCookies(in)...)

	assert.Equal(t, http.StatusUnauthorized, cb.Code)
	assert.Nil(t, cookieNamed(cb, "id_token"))
	assert.Empty(t, p.requests(), "no code exchange may happen with a bad state")
}

func TestCallbackRejectsMissingStateCookie(t *testing.T) {
	p := newFakeProvider(t)
	o := newTestClient(t, p)

	cb := do(t, o.CallbackHandler, testRedirectURI+"?code=abc&state=whatever")

	assert.Equal(t, http.StatusUnauthorized, cb.Code)
	assert.Nil(t, cookieNamed(cb, "id_token"))
}

func TestCallbackWithoutIDTokenIsRejected(t *testing.T) {
	p := newFakeProvider(t)
	p.set(func(p *fakeProvider) { p.omitIDToken = true })
	o := newTestClient(t, p)

	cb, _ := login(t, o)

	assert.NotEqual(t, http.StatusFound, cb.Code)
	assert.Nil(t, cookieNamed(cb, "id_token"))
}

func TestCallbackRejectsTokenSignedWithForeignKey(t *testing.T) {
	p := newFakeProvider(t)

	forged, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)

	p.set(func(p *fakeProvider) { p.signer = forged })
	o := newTestClient(t, p)

	cb, _ := login(t, o)

	assert.NotEqual(t, http.StatusFound, cb.Code)
	assert.Nil(t, cookieNamed(cb, "id_token"))
}

type fakeUsers struct {
	upserts []string
	err     error
}

func (f *fakeUsers) Upsert(_ context.Context, sub, _, _ string) error {
	f.upserts = append(f.upserts, sub)
	return f.err
}

type fakeFirstUsers struct {
	fakeUsers

	first bool
}

func (f *fakeFirstUsers) UpsertAndReportFirst(ctx context.Context, sub, email, name string) (bool, error) {
	return f.first, f.Upsert(ctx, sub, email, name)
}

func TestCallbackUpsertsUser(t *testing.T) {
	p := newFakeProvider(t)
	o := newTestClient(t, p)
	users := &fakeUsers{}
	o.WithUserRepository(users)

	cb, _ := login(t, o)

	assert.Equal(t, http.StatusFound, cb.Code)
	assert.Equal(t, []string{"user-1"}, users.upserts)
}

func TestCallbackUpsertFailureIs500(t *testing.T) {
	p := newFakeProvider(t)
	o := newTestClient(t, p)
	o.WithUserRepository(&fakeUsers{err: errors.New("db down")})

	cb, _ := login(t, o)

	assert.Equal(t, http.StatusInternalServerError, cb.Code)
}

func TestFirstUserBootstrap(t *testing.T) {
	tests := []struct {
		name          string
		first         bool
		bootstrapErr  error
		wantBootstrap bool
		wantStatus    int
	}{
		{name: "first user becomes admin", first: true, wantBootstrap: true, wantStatus: http.StatusFound},
		{name: "later users do not", first: false, wantBootstrap: false, wantStatus: http.StatusFound},
		{
			name: "bootstrap failure", first: true, bootstrapErr: errors.New("boom"),
			wantBootstrap: true, wantStatus: http.StatusInternalServerError,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			p := newFakeProvider(t)
			o := newTestClient(t, p)
			o.WithUserRepository(&fakeFirstUsers{first: tc.first})

			var got []identity.Actor

			o.WithFirstUserBootstrap(func(_ context.Context, sub string, a identity.Actor) error {
				assert.Equal(t, sub, a.Sub)

				got = append(got, a)

				return tc.bootstrapErr
			})

			cb, _ := login(t, o)

			assert.Equal(t, tc.wantStatus, cb.Code)

			if tc.wantBootstrap {
				require.Len(t, got, 1)
				assert.Equal(t, identity.Actor{Sub: "user-1", Email: "alice@example.com", Name: "Alice"}, got[0])
			} else {
				assert.Empty(t, got)
			}
		})
	}
}

func TestUserInfoHandler(t *testing.T) {
	p := newFakeProvider(t)
	o := newTestClient(t, p)

	t.Run("no cookie is 401", func(t *testing.T) {
		rec := do(t, o.UserInfoHandler, "/oauth2/userinfo")
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})

	t.Run("tampered cookie is 401", func(t *testing.T) {
		rec := do(
			t,
			o.UserInfoHandler,
			"/oauth2/userinfo",
			&http.Cookie{
				Name:     "id_token",
				Value:    "garbage",
				Secure:   true,
				HttpOnly: true,
				SameSite: http.SameSiteLaxMode,
			},
		)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})

	t.Run("valid session returns the profile but not the refresh token", func(t *testing.T) {
		_, cookies := login(t, o)
		rec := do(t, o.UserInfoHandler, "/oauth2/userinfo", cookies...)
		require.Equal(t, http.StatusOK, rec.Code)

		var got map[string]any
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &got))

		assert.Equal(t, "user-1", got["user"])
		assert.Equal(t, "alice@example.com", got["email"])
		assert.Equal(t, "Alice", got["name"])
		assert.Equal(t, "alice", got["preferredUsername"])
		assert.NotEmpty(t, got["idToken"])
		assert.NotContains(t, rec.Body.String(), "refresh-1")
		assert.NotContains(t, rec.Body.String(), "access-authorization_code")
	})

	t.Run("expired id token is 401 even with a refresh token", func(t *testing.T) {
		p2 := newFakeProvider(t)
		p2.set(func(p *fakeProvider) { p.idTokenTTL = -time.Minute })
		o2 := newTestClient(t, p2)
		_, cookies := login(t, o2)

		rec := do(t, o2.UserInfoHandler, "/oauth2/userinfo", cookies...)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})

	t.Run("cookie encrypted under another key is rejected", func(t *testing.T) {
		other, err := NewOIDC(
			context.Background(),
			p.srv.URL,
			testClientID,
			testClientSecret,
			testRedirectURI,
			"other-key",
		)
		require.NoError(t, err)

		_, cookies := login(t, other)
		rec := do(t, o.UserInfoHandler, "/oauth2/userinfo", cookies...)
		assert.Equal(t, http.StatusUnauthorized, rec.Code)
	})
}

func TestUserInfoRefreshesExpiringToken(t *testing.T) {
	p := newFakeProvider(t)
	p.set(func(p *fakeProvider) { p.idTokenTTL = 5 * time.Minute }) // inside the 15 minute refresh window
	o := newTestClient(t, p)
	_, cookies := login(t, o)

	p.set(func(p *fakeProvider) {
		p.idTokenTTL = time.Hour
		p.refreshToken = "refresh-2"
	})

	rec := do(t, o.UserInfoHandler, "/oauth2/userinfo", cookies...)
	require.Equal(t, http.StatusOK, rec.Code)

	reqs := p.requests()
	require.Len(t, reqs, 2)
	assert.Equal(t, "refresh_token", reqs[1].Get("grant_type"))
	assert.Equal(t, "refresh-1", reqs[1].Get("refresh_token"))

	// all three cookies are rotated
	for _, name := range []string{"id_token", "access_token", "refresh_token"} {
		assert.NotNil(t, cookieNamed(rec, name), name)
	}

	// the refreshed session is long-lived, so it is not refreshed again
	refreshed := do(t, o.UserInfoHandler, "/oauth2/userinfo", setCookies(rec)...)
	assert.Equal(t, http.StatusOK, refreshed.Code)
	assert.Len(t, p.requests(), 2)
}

func TestUserInfoRefreshFailureIs401(t *testing.T) {
	p := newFakeProvider(t)
	p.set(func(p *fakeProvider) { p.idTokenTTL = 5 * time.Minute })
	o := newTestClient(t, p)
	_, cookies := login(t, o)

	p.set(func(p *fakeProvider) { p.failRefresh = true })

	rec := do(t, o.UserInfoHandler, "/oauth2/userinfo", cookies...)
	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestSignOutClearsCookies(t *testing.T) {
	p := newFakeProvider(t)
	o := newTestClient(t, p)
	_, cookies := login(t, o)

	rec := do(t, o.SignOutHandler, "/oauth2/sign_out", cookies...)

	assert.Equal(t, http.StatusFound, rec.Code)
	assert.Equal(t, "/", rec.Header().Get("Location"))

	for _, name := range []string{"id_token", "access_token", "refresh_token"} {
		c := cookieNamed(rec, name)
		require.NotNil(t, c, name)
		assert.Negative(t, c.MaxAge, name)
		assert.True(t, c.Secure, name)
		assert.True(t, c.HttpOnly, name)
		assert.Equal(t, "/", c.Path, name)
	}

	// a client replaying the blanked cookies is not logged in
	replay := do(t, o.UserInfoHandler, "/oauth2/userinfo", setCookies(rec)...)
	assert.Equal(t, http.StatusUnauthorized, replay.Code)
}

func TestRequireLogin(t *testing.T) {
	p := newFakeProvider(t)
	o := newTestClient(t, p)

	var (
		called   bool
		actor    identity.Actor
		actorErr error
		stored   any
	)

	next := func(c *echo.Context) error {
		called = true
		actor, actorErr = identity.ActorFrom(c.Request().Context())
		stored = c.Get("user_info")

		return c.NoContent(http.StatusNoContent)
	}

	t.Run("no cookie is 401 and next is not called", func(t *testing.T) {
		called = false
		rec := do(t, o.RequireLogin(next), "/api")

		assert.Equal(t, http.StatusUnauthorized, rec.Code)
		assert.False(t, called)
	})

	t.Run("valid cookie puts the actor in the context", func(t *testing.T) {
		_, cookies := login(t, o)
		rec := do(t, o.RequireLogin(next), "/api", cookies...)

		assert.Equal(t, http.StatusNoContent, rec.Code)
		assert.True(t, called)
		require.NoError(t, actorErr)
		assert.Equal(t, identity.Actor{Sub: "user-1", Email: "alice@example.com", Name: "Alice"}, actor)
		assert.IsType(t, &UserInfo{}, stored)
	})

	t.Run("token not signed by the provider is rejected", func(t *testing.T) {
		called = false

		forged, err := rsa.GenerateKey(rand.Reader, 2048)
		require.NoError(t, err)

		token := p.signClaims(forged, map[string]any{
			"iss": p.srv.URL, "sub": "mallory", "aud": []string{testClientID},
			"exp": time.Now().Add(time.Hour).Unix(), "iat": time.Now().Unix(),
		})
		enc, err := o.secureCookie.Encode("id_token", token)
		require.NoError(t, err)

		rec := do(
			t,
			o.RequireLogin(next),
			"/api",
			&http.Cookie{Name: "id_token", Value: enc, Secure: true, HttpOnly: true, SameSite: http.SameSiteLaxMode},
		)

		assert.Equal(t, http.StatusUnauthorized, rec.Code)
		assert.False(t, called)
	})
}

func writeJSON(t *testing.T, w http.ResponseWriter, v any) {
	t.Helper()

	w.Header().Set("Content-Type", "application/json")
	assert.NoError(t, json.NewEncoder(w).Encode(v))
}
