package conformance

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// RunEventStore runs the event store sub-suite.
func RunEventStore(t *testing.T, f Factory) {
	t.Helper()

	t.Run("Load_EmptyStream", func(t *testing.T) {
		b := f(t)
		events, err := b.Store.Load(t.Context(), "Widget", uuid.New())
		require.NoError(t, err)
		assert.Empty(t, events)
	})

	t.Run("Append_NewStream", func(t *testing.T) {
		b := f(t)
		a := newWidget(uuid.New())
		trackWidget(a, widgetCreated{Name: "Alpha"})

		err := b.Transactor.WithinTx(t.Context(), func(ctx context.Context) error {
			_, err := b.Store.Append(ctx, a)
			return err
		})
		require.NoError(t, err)

		events, err := b.Store.Load(t.Context(), "Widget", a.Root().ID())
		require.NoError(t, err)
		require.Len(t, events, 1)
		assert.Equal(t, "widgetCreated", events[0].EventType)
	})

	t.Run("Append_NoPending_NilCursor", func(t *testing.T) {
		b := f(t)
		a := newWidget(uuid.New())

		err := b.Transactor.WithinTx(t.Context(), func(ctx context.Context) error {
			c, err := b.Store.Append(ctx, a)
			assert.Nil(t, c)

			return err
		})
		require.NoError(t, err)
	})

	t.Run("Append_OptimisticConflict", func(t *testing.T) {
		b := f(t)
		id := uuid.New()

		// First writer appends v1.
		a1 := newWidget(id)
		trackWidget(a1, widgetCreated{Name: "First"})

		err := b.Transactor.WithinTx(t.Context(), func(ctx context.Context) error {
			_, err := b.Store.Append(ctx, a1)
			return err
		})
		require.NoError(t, err)

		// Second writer tries to append a competing v1 to the same stream.
		a2 := newWidget(id)
		trackWidget(a2, widgetCreated{Name: "Conflict"})

		err = b.Transactor.WithinTx(t.Context(), func(ctx context.Context) error {
			_, err := b.Store.Append(ctx, a2)
			return err
		})
		require.Error(t, err)
	})

	t.Run("Append_MultipleEvents_OrderPreserved", func(t *testing.T) {
		b := f(t)
		a := newWidget(uuid.New())
		trackWidget(a, widgetCreated{Name: "v1"})
		trackWidget(a, widgetRenamed{Name: "v2"})

		err := b.Transactor.WithinTx(t.Context(), func(ctx context.Context) error {
			_, err := b.Store.Append(ctx, a)
			return err
		})
		require.NoError(t, err)

		events, err := b.Store.Load(t.Context(), "Widget", a.Root().ID())
		require.NoError(t, err)
		require.Len(t, events, 2)
		assert.Equal(t, "widgetCreated", events[0].EventType)
		assert.Equal(t, "widgetRenamed", events[1].EventType)
		assert.Equal(t, 1, events[0].Version)
		assert.Equal(t, 2, events[1].Version)
	})

	t.Run("Read_FromBeginning", func(t *testing.T) {
		b := f(t)
		a := newWidget(uuid.New())
		trackWidget(a, widgetCreated{Name: "R1"})
		trackWidget(a, widgetRenamed{Name: "R2"})

		err := b.Transactor.WithinTx(t.Context(), func(ctx context.Context) error {
			_, err := b.Store.Append(ctx, a)
			return err
		})
		require.NoError(t, err)

		events, cursor, err := b.Store.Read(t.Context(), nil, 100)
		require.NoError(t, err)
		assert.Len(t, events, 2)
		assert.NotNil(t, cursor)
	})

	t.Run("Read_EmptyStore", func(t *testing.T) {
		b := f(t)
		events, cursor, err := b.Store.Read(t.Context(), nil, 10)
		require.NoError(t, err)
		assert.Empty(t, events)
		assert.Nil(t, cursor)
	})

	t.Run("Read_Pagination", func(t *testing.T) {
		b := f(t)

		for range 5 {
			w := newWidget(uuid.New())
			trackWidget(w, widgetCreated{Name: "p"})

			err := b.Transactor.WithinTx(t.Context(), func(ctx context.Context) error {
				_, err := b.Store.Append(ctx, w)
				return err
			})
			require.NoError(t, err)
		}

		page1, cur1, err := b.Store.Read(t.Context(), nil, 3)
		require.NoError(t, err)
		assert.Len(t, page1, 3)

		page2, _, err := b.Store.Read(t.Context(), cur1, 10)
		require.NoError(t, err)
		assert.Len(t, page2, 2)
	})

	t.Run("Read_CursorIdempotent", func(t *testing.T) {
		b := f(t)
		a := newWidget(uuid.New())
		trackWidget(a, widgetCreated{Name: "x"})

		err := b.Transactor.WithinTx(t.Context(), func(ctx context.Context) error {
			_, err := b.Store.Append(ctx, a)
			return err
		})
		require.NoError(t, err)

		_, cur, err := b.Store.Read(t.Context(), nil, 10)
		require.NoError(t, err)

		events, _, err := b.Store.Read(t.Context(), cur, 10)
		require.NoError(t, err)
		assert.Empty(t, events)
	})

	t.Run("Read_SeqMonotonic", func(t *testing.T) {
		b := f(t)

		for range 3 {
			w := newWidget(uuid.New())
			trackWidget(w, widgetCreated{Name: "seq"})

			err := b.Transactor.WithinTx(t.Context(), func(ctx context.Context) error {
				_, err := b.Store.Append(ctx, w)
				return err
			})
			require.NoError(t, err)
		}

		events, _, err := b.Store.Read(t.Context(), nil, 100)
		require.NoError(t, err)
		require.Len(t, events, 3)
	})
}
