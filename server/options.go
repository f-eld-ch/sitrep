package server

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/99designs/gqlgen/graphql"
	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/handler/extension"
	"github.com/99designs/gqlgen/graphql/handler/transport"
	"github.com/99designs/gqlgen/graphql/playground"
	"github.com/labstack/echo/v4"
	"github.com/ravilushqa/otelgqlgen"
	"github.com/vektah/gqlparser/v2/gqlerror"

	graph "github.com/f-eld-ch/sitrep/internal/adapter/inbound/graphql"
	"github.com/f-eld-ch/sitrep/internal/adapter/inbound/graphql/generated"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
	"github.com/f-eld-ch/sitrep/server/auth"
)

// WithVersion records the build identity so it can be served to clients.
//
// The UI is embedded in this binary (see ui.Assets), so these values describe the frontend
// being served as much as the backend, which is what lets the update prompt name the
// version it is offering.
func WithVersion(version, sha string) Option {
	return func(s *Server) error {
		s.version = version
		s.sha = sha
		return nil
	}
}

// Option defines a functional option for Server.
type Option func(*Server) error

// WithPort sets the server port.
func WithPort(port uint) Option {
	return func(s *Server) error {
		s.port = port
		return nil
	}
}

// WithAddress sets the server address.
func WithAddress(addr string) Option {
	return func(s *Server) error {
		s.address = addr
		return nil
	}
}

func WithOidc(oidcClient *auth.OIDCClient) Option {
	return func(s *Server) error {
		s.Enforcer = oidcClient
		return nil
	}
}

// complexityBudget caps the total cost of a single GraphQL operation.
// Budget reasoning: a realistic dashboard query fetches ~10 incidents with their
// messages (10 × messageCost=50 + field costs ≈ 1000) plus layers and features.
// Budget set to 5000 to allow that with headroom.
const complexityBudget = 5000

// disableIntrospection is a gqlgen extension that sets DisableIntrospection on
// every operation context, preventing schema reflection by clients.
type disableIntrospection struct{}

func (disableIntrospection) ExtensionName() string                   { return "DisableIntrospection" }
func (disableIntrospection) Validate(graphql.ExecutableSchema) error { return nil }
func (disableIntrospection) MutateOperationContext(_ context.Context, opCtx *graphql.OperationContext) *gqlerror.Error {
	opCtx.DisableIntrospection = true
	return nil
}

func WithApiV2(
	incidents inbound.IncidentService,
	messages inbound.MessageService,
	layers inbound.LayerService,
	features inbound.FeatureService,
	queries outbound.Queries,
	enableIntrospection bool,
) Option {
	return func(s *Server) error {
		cfg := generated.Config{Resolvers: &graph.Resolver{
			Incidents: incidents,
			Messages:  messages,
			Layers:    layers,
			Features:  features,
			Queries:   queries,
		}}
		// Flat cost per list-resolver call to penalise N+1 patterns
		// (e.g. fetching messages for every incident in a list query)
		// without rejecting normal single-incident or single-layer queries.
		const messageCost = 50
		const featureCost = 20
		cfg.Complexity.Incident.Messages = func(childComplexity int) int { return childComplexity + messageCost }
		cfg.Complexity.Layer.Features = func(childComplexity int) int { return childComplexity + featureCost }

		srv := handler.New(generated.NewExecutableSchema(cfg))
		srv.AddTransport(transport.POST{})
		srv.Use(otelgqlgen.Middleware())
		srv.Use(extension.FixedComplexityLimit(complexityBudget))
		srv.SetErrorPresenter(logAndPresentError)
		srv.SetRecoverFunc(func(ctx context.Context, p any) error {
			opCtx := graphql.GetOperationContext(ctx)
			slog.ErrorContext(ctx, "resolver panic",
				"operation", opCtx.OperationName,
				"query", opCtx.RawQuery,
				"panic", fmt.Sprintf("%v", p),
			)
			return fmt.Errorf("internal server error")
		})
		if !enableIntrospection {
			srv.Use(disableIntrospection{})
		}

		apiv2 := s.router.Group("/api/v2", s.RequireLogin)
		apiv2.POST("/graphql", echo.WrapHandler(srv))
		if enableIntrospection {
			apiv2.GET("/graphql/play", echo.WrapHandler(
				playground.Handler("SitRep GraphQL", "/api/v2/graphql"),
			))
		}
		apiv2.GET("/health", func(c echo.Context) error {
			return c.String(http.StatusOK, "OK")
		})
		return nil
	}
}

func logAndPresentError(ctx context.Context, e error) *gqlerror.Error {
	opCtx := graphql.GetOperationContext(ctx)
	fieldCtx := graphql.GetPathContext(ctx)

	// gqlgen wraps resolver errors as *gqlerror.Error with query position info,
	// making e.Error() noisy ("input:2:3: NOT_FOUND"). Use the clean message instead.
	errMsg := e.Error()
	var gqlErr *gqlerror.Error
	if errors.As(e, &gqlErr) {
		errMsg = gqlErr.Message
	}

	attrs := []any{
		"operation", opCtx.OperationName,
		"error", errMsg,
		"variables", opCtx.Variables,
	}
	if fieldCtx != nil {
		attrs = append(attrs, "path", fieldCtx.Path())
	}

	var code string
	switch {
	case errors.Is(e, shared.ErrNotFound):
		code = "NOT_FOUND"
	case errors.Is(e, shared.ErrIncidentNotOpen):
		code = "INCIDENT_NOT_OPEN"
	case errors.Is(e, shared.ErrIncidentNotClosed):
		code = "INCIDENT_NOT_CLOSED"
	case errors.Is(e, shared.ErrIncidentDeleted):
		code = "INCIDENT_DELETED"
	case errors.Is(e, shared.ErrAlreadyClosed):
		code = "ALREADY_CLOSED"
	case errors.Is(e, shared.ErrAlreadyOpen):
		code = "ALREADY_OPEN"
	case errors.Is(e, shared.ErrForbidden):
		code = "FORBIDDEN"
	case errors.Is(e, shared.ErrInvalidInput):
		code = "INVALID_INPUT"
	case errors.Is(e, shared.ErrConflict):
		code = "CONFLICT"
	default:
		slog.ErrorContext(ctx, "resolver error", attrs...)
		return &gqlerror.Error{
			Message:    "internal server error",
			Extensions: map[string]any{"code": "INTERNAL_ERROR"},
		}
	}

	slog.WarnContext(ctx, "resolver domain error", append(attrs, "code", code)...)
	return &gqlerror.Error{Message: e.Error(), Extensions: map[string]any{"code": code}}
}
