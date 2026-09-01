package auth

import (
	"net/http"

	"github.com/labstack/echo/v5"
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
		// no auth
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
