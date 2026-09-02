package identity

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestActorFrom(t *testing.T) {
	t.Run("returns the stored actor", func(t *testing.T) {
		want := Actor{Sub: "oidc-subject", Email: "operator@example.test", Name: "Operator"}

		got, err := ActorFrom(WithActor(context.Background(), want))

		require.NoError(t, err)
		assert.Equal(t, want, got)
	})

	t.Run("preserves values from the parent context", func(t *testing.T) {
		type parentKey struct{}
		parent := context.WithValue(context.Background(), parentKey{}, "request-value")

		ctx := WithActor(parent, Actor{Sub: "oidc-subject"})

		assert.Equal(t, "request-value", ctx.Value(parentKey{}))
	})

	for _, test := range []struct {
		name string
		ctx  context.Context
	}{
		{name: "missing actor", ctx: context.Background()},
		{name: "actor without subject", ctx: WithActor(context.Background(), Actor{Email: "operator@example.test"})},
	} {
		t.Run(test.name, func(t *testing.T) {
			actor, err := ActorFrom(test.ctx)

			assert.ErrorIs(t, err, ErrUnauthenticated)
			assert.Equal(t, Actor{}, actor)
		})
	}
}
