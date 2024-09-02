package router

import (
	"context"
	"net/http"
	"time"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/playground"
	"github.com/alexedwards/scs/v2"
	"github.com/f-eld-ch/sitrep/graph"
	"github.com/f-eld-ch/sitrep/pkg/http/auth"
	"github.com/f-eld-ch/sitrep/ui"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/riandyrn/otelchi"
	"github.com/sagikazarmark/slog-shim"
	"github.com/unrolled/secure"
	"github.com/unrolled/secure/cspbuilder"
	"github.com/zitadel/oidc/v3/pkg/client/rp"

	"github.com/go-chi/httplog/v2"
)

// Defining the Graphql handler
func graphqlHandler() http.HandlerFunc {
	// NewExecutableSchema and Config are in the generated.go file
	// Resolver is in the resolver.go file
	h := handler.NewDefaultServer(graph.NewExecutableSchema(graph.Config{Resolvers: &graph.Resolver{}}))

	return func(w http.ResponseWriter, r *http.Request) {
		h.ServeHTTP(w, r)
	}
}

// Defining the Playground handler
func playgroundHandler() http.HandlerFunc {
	h := playground.Handler("GraphQL", "/api/v1/graphql")

	return func(w http.ResponseWriter, r *http.Request) {
		h.ServeHTTP(w, r)
	}
}

func CreateRouter() (*chi.Mux, error) {
	// create the session Manager
	sessionManager := scs.New()

	// Logger
	logger := httplog.NewLogger("httplog", httplog.Options{
		JSON:             true,
		TimeFieldName:    "time",
		LogLevel:         slog.LevelDebug,
		Concise:          true,
		RequestHeaders:   true,
		ResponseHeaders:  true,
		MessageFieldName: "msg",
		QuietDownRoutes: []string{
			"/",
			"/ping",
			"/service-worker.js",
			"/service-worker.js.map",
		},
		QuietDownPeriod: 10 * time.Second,
		// SourceFieldName: "source",
	})

	r := chi.NewRouter()
	r.Use(otelchi.Middleware("sitrep", otelchi.WithChiRoutes(r)))
	r.Use(middleware.RealIP)
	r.Use(httplog.RequestLogger(logger))
	r.Use(auth.SessionWith(sessionManager))
	r.Use(middleware.CleanPath)
	r.Use(middleware.Heartbeat("/health"))
	r.Use(middleware.Heartbeat("/ping"))

	secureMiddleware := secure.New(secure.Options{
		FrameDeny:             true,
		PermissionsPolicy:     "fullscreen=(self), geolocation=(self), clipboard-read=(self)",
		ContentTypeNosniff:    true,
		ReferrerPolicy:        "strict-origin",
		ContentSecurityPolicy: getCSPBuilder().MustBuild(),
	})

	r.Use(secureMiddleware.Handler)

	cookieHandler := auth.GetCookieHandler()
	provider, _ := auth.GetOIDC(context.Background(), cookieHandler)

	r.Route("/oauth2", func(r chi.Router) {
		r.Get("/", rp.AuthURLHandler(auth.RandomState, provider, rp.WithPromptURLParam("Sitrep")))
		r.Get("/login", rp.AuthURLHandler(auth.RandomState, provider, rp.WithPromptURLParam("Sitrep")))
		r.Get("/sign_in", rp.AuthURLHandler(auth.RandomState, provider, rp.WithPromptURLParam("Sitrep")))
		r.Get("/callback", rp.CodeExchangeHandler(rp.UserinfoCallback(auth.MarshalUserInfo(sessionManager)), provider))
		r.With(auth.AuthRequired).Get("/userinfo", auth.UserInfoHandler())
	})

	// // OIDC authentication routes
	// oidc.GET("/sign_out", auth.Logout)

	r.With(auth.AuthRequired).Route("/api/v1", func(r chi.Router) {
		r.Post("/graphql", graphqlHandler())
	})

	r.With(auth.AuthRequired).Route("/admin", func(r chi.Router) {
		r.Get("/playground", playgroundHandler())
	})

	r.Handle("/*", ui.SPAHandler())

	sessionManager.LoadAndSave(r)

	return r, nil
}

func getCSPBuilder() *cspbuilder.Builder {
	cspBuilder := cspbuilder.Builder{
		Directives: map[string][]string{
			cspbuilder.DefaultSrc: {"'self'", "data:"},
			cspbuilder.ConnectSrc: {
				"'self'",
				"ws://*", "wss://*",
				"https://api.mapbox.com",
				"https://vectortiles.geo.admin.ch",
				"https://vectortiles0.geo.admin.ch",
				"https://vectortiles1.geo.admin.ch",
				"https://vectortiles2.geo.admin.ch",
				"https://vectortiles3.geo.admin.ch",
				"https://vectortiles4.geo.admin.ch",
				"https://wmts.geo.admin.ch",
			},

			// TODO(nimdanitro): remove cdn and unsafe-inlines
			cspbuilder.ChildSrc:       {"none"},
			cspbuilder.ImgSrc:         {"'self'", "data:"},
			cspbuilder.ScriptSrc:      {"'self'", "https://cdn.jsdelivr.net"},
			cspbuilder.ScriptSrcElem:  {"'self'", "https://api.mapbox.com", "https://cdn.jsdelivr.net", "'unsafe-inline'"},
			cspbuilder.StyleSrc:       {"'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"},
			cspbuilder.StyleSrcAttr:   {"'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"},
			cspbuilder.WorkerSrc:      {"'self'", "blob:"},
			cspbuilder.FrameAncestors: {"none"},
		},
	}
	return &cspBuilder
}
