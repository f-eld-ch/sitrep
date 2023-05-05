package router

import (
	"net/http"

	oidcauth "github.com/TJM/gin-gonic-oidcauth"
	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/otel/attribute"
	oteltrace "go.opentelemetry.io/otel/trace"
)

type UserInfo struct {
	Name  string `json:"user"`
	Email string `json:"email"`
}

// Defining the Graphql handler
func userInfoHandler() gin.HandlerFunc {

	return func(c *gin.Context) {

		username := c.GetString(oidcauth.AuthUserKey)
		_, span := tracer.Start(c.Request.Context(), "userinfo", oteltrace.WithAttributes(attribute.String("id", username)))
		defer span.End()
		if username == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{})
			return
		}

		c.JSON(http.StatusOK, &UserInfo{Name: username, Email: username})
	}
}
