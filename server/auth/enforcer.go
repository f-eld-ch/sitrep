package auth

import "github.com/labstack/echo/v5"

type Enforcer interface {
	RequireLogin(next echo.HandlerFunc) echo.HandlerFunc
	SignInHandler(c *echo.Context) error
	SignOutHandler(c *echo.Context) error
	UserInfoHandler(c *echo.Context) error
	CallbackHandler(c *echo.Context) error
}
