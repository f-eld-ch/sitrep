// Package identity bridges OIDC actor information into context.Context so that
// gqlgen resolvers and application services can read the authenticated subject
// without depending on echo.Context.
package identity

import (
	"context"
	"errors"
)

// ErrUnauthenticated is returned when no actor is present in the context.
// Services must return this rather than a zero-value subject, which would
// silently corrupt the audit trail.
var ErrUnauthenticated = errors.New("unauthenticated: no actor in context")

type contextKey struct{}

// Actor is the authenticated principal extracted from the OIDC token.
type Actor struct {
	// Sub is the OIDC subject — the stable, pseudonymous identifier.
	Sub   string
	Email string
	Name  string
}

// WithActor stores the authenticated actor in the context.
func WithActor(ctx context.Context, a Actor) context.Context {
	return context.WithValue(ctx, contextKey{}, a)
}

// ActorFrom retrieves the authenticated actor from the context.
// Returns ErrUnauthenticated if no actor was set — never returns a zero-value.
func ActorFrom(ctx context.Context) (Actor, error) {
	a, ok := ctx.Value(contextKey{}).(Actor)
	if !ok || a.Sub == "" {
		return Actor{}, ErrUnauthenticated
	}
	return a, nil
}
