package main

import (
	"net/http"
	"strings"

	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/playground"
	"github.com/RedGecko/sitrep/graph"
	"github.com/RedGecko/sitrep/ui"
)

// Defining the Graphql handler
func graphqlHandler() gin.HandlerFunc {
	// NewExecutableSchema and Config are in the generated.go file
	// Resolver is in the resolver.go file
	h := handler.NewDefaultServer(graph.NewExecutableSchema(graph.Config{Resolvers: &graph.Resolver{}}))

	return func(c *gin.Context) {
		h.ServeHTTP(c.Writer, c.Request)
	}
}

// Defining the Playground handler
func playgroundHandler() gin.HandlerFunc {
	h := playground.Handler("GraphQL", "/api/v1/graphql")

	return func(c *gin.Context) {
		h.ServeHTTP(c.Writer, c.Request)
	}
}

func main() {
	// Setting up Gin
	r := gin.Default()

	r.Use(static.Serve("/", ui.EmbedFolder()))
	r.NoRoute(func(c *gin.Context) {
		if !strings.HasPrefix(c.Request.RequestURI, "/api") {
			c.FileFromFS("index.html", http.FS(ui.StaticFiles))
		}
	})

	// TODO(nimdanitro): fix oauth2 / oidc login flow
	oauth := r.Group("/oauth2")
	oauth.GET("/signin", func(ctx *gin.Context) { ctx.Status(200) })
	oauth.GET("/userinfo", func(ctx *gin.Context) { ctx.JSON(200, gin.H{}) })

	api := r.Group("/api/v1")
	api.POST("/graphql", graphqlHandler())

	admin := r.Group("/admin")
	admin.GET("/playground", playgroundHandler())

	r.Run()
}
