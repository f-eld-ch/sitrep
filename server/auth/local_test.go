package auth

import (
	"net/http"
	"testing"

	"github.com/labstack/echo/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

func TestLocalEnforcerRequireLoginInjectsStaticActor(t *testing.T) {
	l := NewLocalEnforcer()

	var (
		actor    identity.Actor
		actorErr error
	)

	rec := do(t, l.RequireLogin(func(c *echo.Context) error {
		actor, actorErr = identity.ActorFrom(c.Request().Context())
		return c.NoContent(http.StatusNoContent)
	}), "/api")

	assert.Equal(t, http.StatusNoContent, rec.Code)
	require.NoError(t, actorErr)
	assert.Equal(t, identity.Actor{Sub: "local-user", Email: "local-user@example.com", Name: "localuser"}, actor)
}

func TestLocalEnforcerUserInfo(t *testing.T) {
	rec := do(t, NewLocalEnforcer().UserInfoHandler, "/oauth2/userinfo")

	assert.Equal(t, http.StatusOK, rec.Code)
	assert.JSONEq(t,
		`{"user":"local-user","email":"local-user@example.com","preferredUsername":"localuser","idToken":""}`,
		rec.Body.String())
}

func TestLocalEnforcerNoopHandlers(t *testing.T) {
	l := NewLocalEnforcer()

	for name, h := range map[string]echo.HandlerFunc{
		"sign in": l.SignInHandler, "sign out": l.SignOutHandler, "callback": l.CallbackHandler,
	} {
		rec := do(t, h, "/x")
		assert.Equal(t, http.StatusOK, rec.Code, name)
		assert.Empty(t, rec.Body.String(), name)
	}
}
