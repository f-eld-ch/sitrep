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
	"github.com/labstack/echo/v5"
	"github.com/ravilushqa/otelgqlgen"
	"github.com/vektah/gqlparser/v2/gqlerror"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	"go.opentelemetry.io/otel/trace"

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

// Stack contains the application dependencies exposed by the server.
type Stack struct {
	Incidents             inbound.IncidentService
	Messages              inbound.MessageService
	Layers                inbound.LayerService
	Features              inbound.FeatureService
	Access                inbound.AccessService
	Schadenplaetze        inbound.SchadenplatzService
	Resources             inbound.ResourceService
	Timeline              inbound.TimelineService
	Tiles                 inbound.TileService
	IncidentAccessChecker outbound.IncidentAccessChecker
	GlobalAccessChecker   outbound.GlobalAccessChecker
	AccessQueries         outbound.AccessQueries
	Queries               outbound.Queries
	// MaxAttachmentSize is the maximum allowed size in bytes for file attachments.
	// Zero means no server-side limit (domain validation still applies).
	MaxAttachmentSize int64
}

// APIV2Option configures the API-v2 GraphQL handler.
type APIV2Option func(*apiV2Config)

type apiV2Config struct {
	introspection bool
}

// WithPort sets the server port.
// WithReadinessCheck makes /ready also depend on a dependency probe (typically the database), so
// a pod that cannot reach it is taken out of the Service instead of failing requests.
// /health stays dependency-free on purpose: restarting pods does not fix a database outage.
func WithReadinessCheck(check func(context.Context) error) Option {
	return func(s *Server) error {
		s.readyCheck = check

		return nil
	}
}

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

// WithAllowedOrigins restricts the CORS allowed origins. Defaults to same-origin
// only (empty slice) when not set. Pass explicit origins for deployments that
// serve the UI from a different host than the API.
func WithAllowedOrigins(origins []string) Option {
	return func(s *Server) error {
		s.allowedOrigins = origins
		return nil
	}
}

func WithEnforcer(enforcer auth.Enforcer) Option {
	return func(s *Server) error {
		s.Enforcer = enforcer
		return nil
	}
}

func WithOidc(oidcClient *auth.OIDCClient) Option { return WithEnforcer(oidcClient) }

// complexityBudget caps the total cost of a single GraphQL operation.
// Budget reasoning: a realistic dashboard query fetches ~10 incidents with their
// messages (10 × messageCost=50 + field costs ≈ 1000) plus layers and features.
// Budget set to 5000 to allow that with headroom.
const complexityBudget = 5000

func WithGraphQLIntrospection() APIV2Option {
	return func(c *apiV2Config) { c.introspection = true }
}

func WithApiV2(stack Stack, opts ...APIV2Option) Option {
	return func(s *Server) error {
		config := &apiV2Config{
			introspection: false,
		}
		for _, opt := range opts {
			opt(config)
		}

		s.registerAPIV2 = func() { registerAPIV2(s, stack, *config) }

		return nil
	}
}

func registerAPIV2(s *Server, stack Stack, config apiV2Config) {
	cfg := generated.Config{Resolvers: &graph.Resolver{
		Incidents:             stack.Incidents,
		Messages:              stack.Messages,
		Layers:                stack.Layers,
		Features:              stack.Features,
		Access:                stack.Access,
		Schadenplaetze:        stack.Schadenplaetze,
		Resources:             stack.Resources,
		Timeline:              stack.Timeline,
		IncidentAccessChecker: stack.IncidentAccessChecker,
		GlobalAccessChecker:   stack.GlobalAccessChecker,
		AccessQueries:         stack.AccessQueries,
		Queries:               stack.Queries,
	}}
	// Flat cost per list-resolver call to penalise N+1 patterns
	// (e.g. fetching messages for every incident in a list query)
	// without rejecting normal single-incident or single-layer queries.
	const (
		messageCost = 50
		featureCost = 20
	)

	cfg.Complexity.Incident.Messages = func(childComplexity int) int { return childComplexity + messageCost }
	cfg.Complexity.Layer.Features = func(childComplexity int) int { return childComplexity + featureCost }
	srv := handler.New(generated.NewExecutableSchema(cfg))
	srv.AddTransport(transport.POST{})
	srv.Use(otelgqlgen.Middleware(otelgqlgen.WithInterceptResponseResultHandlerFunc(interceptResponseResult)))
	srv.Use(extension.FixedComplexityLimit(complexityBudget))

	if config.introspection {
		slog.Warn("graphql introspection enabled; this is not recommended in production")
		srv.Use(extension.Introspection{})
	}

	srv.SetErrorPresenter(logAndPresentError)
	srv.SetRecoverFunc(func(ctx context.Context, p any) error {
		opCtx := graphql.GetOperationContext(ctx)
		slog.ErrorContext(ctx, "resolver panic",
			slog.String("operation", opCtx.OperationName),
			slog.String("panic", fmt.Sprintf("%v", p)),
		)

		return fmt.Errorf("internal server error")
	})

	apiv2 := s.router.Group("/api/v2", s.RequireLogin)
	apiv2.POST("/graphql", echo.WrapHandler(srv))

	if config.introspection {
		apiv2.GET("/graphql/play", echo.WrapHandler(
			playground.Handler("SitRep GraphQL", "/api/v2/graphql"),
		))
	}

	apiv2.GET("/health", func(c *echo.Context) error {
		return c.String(http.StatusOK, "OK")
	})

	apiv2.POST("/messages/:id/attachments", uploadAttachment(stack.Messages, stack.MaxAttachmentSize))
	apiv2.GET("/attachments/:id", downloadAttachment(stack.Messages))

	if stack.Tiles != nil {
		registerTiles(apiv2, stack.Tiles)
	}
}

func logAndPresentError(ctx context.Context, e error) *gqlerror.Error {
	opCtx := graphql.GetOperationContext(ctx)
	fieldCtx := graphql.GetPathContext(ctx)

	// gqlgen wraps resolver errors as *gqlerror.Error with query position info,
	// making e.Error() noisy ("input:2:3: NOT_FOUND"). Use the clean message instead.
	errMsg := e.Error()
	if gqlErr, ok := errors.AsType[*gqlerror.Error](e); ok {
		errMsg = gqlErr.Message
	}

	attrs := []slog.Attr{
		slog.String("operation", opCtx.OperationName),
		slog.String("error", errMsg),
	}
	if fieldCtx != nil {
		attrs = append(attrs, slog.String("path", fieldCtx.Path().String()))
	}

	// gqlgen emits this when DisableIntrospection is set; it is not a server error.
	var gqlErrCheck *gqlerror.Error
	if errors.As(e, &gqlErrCheck) && gqlErrCheck.Message == "introspection disabled" {
		return gqlErrCheck
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
	case errors.Is(e, shared.ErrInvalidParent):
		code = "INVALID_PARENT_INCIDENT"
	case errors.Is(e, shared.ErrSchadenplatzMerged):
		code = "SCHADENPLATZ_MERGED"
	case errors.Is(e, shared.ErrConflict):
		code = "CONFLICT"
	default:
		if timelineCode, ok := mapTimelineErrorCode(e); ok {
			code = timelineCode

			break
		}

		slog.LogAttrs(ctx, slog.LevelError, "resolver error", attrs...)

		return &gqlerror.Error{
			Message:    "internal server error",
			Extensions: map[string]any{"code": "INTERNAL_ERROR"},
		}
	}

	slog.LogAttrs(ctx, slog.LevelWarn, "resolver domain error", append(attrs, slog.String("code", code))...)

	return &gqlerror.Error{Message: e.Error(), Extensions: map[string]any{"code": code}}
}

// timelineErrors are the expected outcomes of drawing on the message timeline and of
// acknowledging a message. They carry their own code so the UI can say what went wrong.
var timelineErrors = []error{
	shared.ErrNotTriagedToDivision,
	shared.ErrBeforeFeaturePlaced,
	shared.ErrFeatureHasLaterChanges,
	shared.ErrFeatureNotRemoved,
	shared.ErrBeforeFeatureRemoved,
	shared.ErrMessageTimeLocked,
}

// mapTimelineErrorCode returns the code of a timeline domain error; ok is false for anything else.
func mapTimelineErrorCode(e error) (string, bool) {
	for _, sentinel := range timelineErrors {
		if errors.Is(e, sentinel) {
			return sentinel.Error(), true
		}
	}

	return "", false
}

// interceptResponseResult marks the GraphQL operation span as failed only when the response
// carries an unexpected error. Domain errors (FORBIDDEN, CONFLICT, NOT_FOUND, …) are expected
// business outcomes presented to the client with their own code; they are recorded as span
// attributes but do not flag the span as an error.
func interceptResponseResult(resp *graphql.Response, span trace.Span) *graphql.Response {
	if resp == nil || len(resp.Errors) == 0 {
		span.SetStatus(codes.Ok, "Finished successfully")

		return resp
	}

	span.SetAttributes(otelgqlgen.ResolverErrors(resp.Errors)...)

	unexpected := false

	for _, e := range resp.Errors {
		if code, _ := e.Extensions["code"].(string); code == "" || code == "INTERNAL_ERROR" {
			unexpected = true

			break
		}
	}

	if !unexpected {
		span.SetAttributes(attribute.Bool("graphql.domain_error", true))

		return resp
	}

	span.SetStatus(codes.Error, resp.Errors.Error())
	span.RecordError(fmt.Errorf("graphql response errors: %s", resp.Errors.Error()))

	return resp
}
