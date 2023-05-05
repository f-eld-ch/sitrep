package router

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/playground"
	"github.com/RedGecko/sitrep/graph"
	"github.com/RedGecko/sitrep/pkg/config"
	"github.com/RedGecko/sitrep/ui"
	oidcauth "github.com/TJM/gin-gonic-oidcauth"
	"github.com/gin-contrib/sessions"
	"github.com/gin-contrib/sessions/cookie"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
	"github.com/spf13/viper"
	"go.opentelemetry.io/contrib/instrumentation/github.com/gin-gonic/gin/otelgin"
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

func CreateRouter() (*gin.Engine, error) {

	tp, err := getTracer()
	if err != nil {
		log.Fatal(err)
	}
	defer func() {
		if err := tp.Shutdown(context.Background()); err != nil {
			log.Printf("Error shutting down tracer provider: %v", err)
		}
	}()

	// Setting up Gin
	r := gin.New()

	r.Use(gin.Logger(), gin.Recovery())
	r.SetTrustedProxies(viper.GetStringSlice("trustedProxies"))
	// Session Config (Basic cookies)
	store := cookie.NewStore([]byte(viper.GetString("cookieSecret")), nil)
	r.Use(sessions.Sessions("oidc", store))

	auth, err := oidcauth.GetOidcAuth(config.GetOidcConfig())
	if err != nil {
		return nil, fmt.Errorf("invalid OIDC Config: %w", err)
	}

	r.Use(otelgin.Middleware("backend"))
	r.Use(auth.AuthRequired())
	r.Use(static.Serve("/", ui.EmbedFolder()))
	r.NoRoute(func(c *gin.Context) {
		if !strings.HasPrefix(c.Request.RequestURI, "/api") {
			c.FileFromFS("index.html", http.FS(ui.StaticFiles))
		}
	})

	// health endpoints
	r.GET("/health", HealthGET)
	r.GET("/ping", HealthGET)

	// OIDC authentication routes
	oidc := r.Group("/oauth2")
	oidc.GET("/", auth.Login)
	oidc.GET("/signin", auth.Login)
	oidc.GET("/sign_in", auth.Login)
	oidc.GET("/callback", auth.AuthCallback)
	oidc.GET("/sign_out", auth.Logout)
	oidc.GET("/userinfo", auth.AuthRequired(), userInfoHandler())
	oidc.GET("/index.html", auth.AuthRequired())

	api := r.Group("/api/v1", auth.AuthRequired())
	api.POST("/graphql", graphqlHandler())

	admin := r.Group("/admin", auth.AuthRequired())
	if gin.Mode() == gin.DebugMode {
		admin.GET("/playground", playgroundHandler())
	}

	return r, nil
}
