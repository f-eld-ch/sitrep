package router

import (
	"github.com/gin-gonic/gin"
	"go.opentelemetry.io/otel/trace"
)

func HealthGET(c *gin.Context) {

	var span trace.Span
	_, span = tracer.Start(c.Request.Context(), "Health")
	defer span.End()
	c.JSON(200, gin.H{
		"status": "UP",
	})
}
