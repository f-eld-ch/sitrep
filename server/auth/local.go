package auth

import (
	"net/http"

	"github.com/labstack/echo/v5"

	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

type LocalEnforcer struct {
	UserInfo UserInfo
}

func NewLocalEnforcer() *LocalEnforcer {
	return &LocalEnforcer{
		UserInfo: UserInfo{
			User:              "local-user",
			Email:             "local-user@example.com",
			PreferredUsername: "localuser",
		},
	}
}

func (l *LocalEnforcer) RequireLogin(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c *echo.Context) error {
		actor := identity.Actor{
			Sub:   l.UserInfo.User,
			Email: l.UserInfo.Email,
			Name:  l.UserInfo.PreferredUsername,
		}
		ctx := identity.WithActor(c.Request().Context(), actor)
		c.SetRequest(c.Request().WithContext(ctx))
		return next(c)
	}
}

func (l *LocalEnforcer) SignInHandler(c *echo.Context) error {
	return nil
}

func (l *LocalEnforcer) SignOutHandler(c *echo.Context) error {
	return nil
}

func (l *LocalEnforcer) UserInfoHandler(c *echo.Context) error {
	return c.JSON(http.StatusOK, l.UserInfo)
}

func (l *LocalEnforcer) CallbackHandler(c *echo.Context) error {
	return nil
}
