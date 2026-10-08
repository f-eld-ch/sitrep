package conformance

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/message"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
)

// RunMessageAcknowledgements runs the per-division acknowledgement sub-suite.
func RunMessageAcknowledgements(t *testing.T, f Factory) {
	t.Helper()

	if f(t).Project == nil {
		t.Skip("backend does not provide Project func")
	}

	at := time.Date(2026, 1, 15, 10, 0, 0, 0, time.UTC)
	mapDiv := shared.DivisionID(uuid.New())
	scDiv := shared.DivisionID(uuid.New())

	// project records a message, lets the script issue commands on it, and projects everything.
	project := func(t *testing.T, b *Backend, script func(m *message.Message)) uuid.UUID {
		t.Helper()

		id := shared.MessageID(uuid.New())
		m := message.New(id)
		require.NoError(t, m.Record(shared.IncidentID(uuid.New()), 1, "Pegel steigt", "Beobachter", "",
			"Führung", "", shared.MediumRadio, at, "sys", at, "sys"))
		require.NoError(t, m.Triage(shared.TriageDone, shared.PriorityNormal,
			[]shared.DivisionID{mapDiv, scDiv}, nil, "sys", at, "sys"))
		script(m)

		require.NoError(t, b.Transactor.WithinTx(t.Context(), func(ctx context.Context) error {
			_, err := b.Store.Append(ctx, m)
			return err
		}))
		require.NoError(t, b.Project(t.Context()))

		return uuid.UUID(id)
	}

	acknowledged := func(t *testing.T, b *Backend, id uuid.UUID) []uuid.UUID {
		t.Helper()

		msg, err := b.Queries.GetMessage(t.Context(), id)
		require.NoError(t, err)

		var out []uuid.UUID

		for _, a := range msg.Acknowledgements {
			out = append(out, a.DivisionID)
		}

		return out
	}

	t.Run("AcknowledgeAndRevoke", func(t *testing.T) {
		b := f(t)
		id := project(t, b, func(m *message.Message) {
			require.NoError(t, m.AcknowledgeForDivision(mapDiv, "operator", at.Add(time.Minute)))
			require.NoError(t, m.AcknowledgeForDivision(scDiv, "operator", at.Add(2*time.Minute)))
		})

		assert.Equal(t, []uuid.UUID{uuid.UUID(mapDiv), uuid.UUID(scDiv)}, acknowledged(t, b, id))

		msg, err := b.Queries.GetMessage(t.Context(), id)
		require.NoError(t, err)
		assert.Equal(t, "operator", msg.Acknowledgements[0].By)
		assert.WithinDuration(t, at.Add(time.Minute), msg.Acknowledgements[0].At, time.Second)

		b2 := f(t)
		id = project(t, b2, func(m *message.Message) {
			require.NoError(t, m.AcknowledgeForDivision(mapDiv, "operator", at))
			require.NoError(t, m.RevokeDivisionAcknowledgement(mapDiv, "operator", at))
		})
		assert.Empty(t, acknowledged(t, b2, id))
	})

	t.Run("RetriageDropsAcknowledgementOfRemovedDivision", func(t *testing.T) {
		b := f(t)
		id := project(t, b, func(m *message.Message) {
			require.NoError(t, m.AcknowledgeForDivision(mapDiv, "operator", at))
			require.NoError(t, m.AcknowledgeForDivision(scDiv, "operator", at))
			require.NoError(t, m.Triage(shared.TriageDone, shared.PriorityNormal,
				[]shared.DivisionID{scDiv}, nil, "sys", at, "sys"))
		})

		assert.Equal(t, []uuid.UUID{uuid.UUID(scDiv)}, acknowledged(t, b, id))
	})

	t.Run("CorrectingContentOrTimeClearsAcknowledgements", func(t *testing.T) {
		newContent := "Pegel sinkt"
		newTime := at.Add(-time.Minute)

		b := f(t)
		id := project(t, b, func(m *message.Message) {
			require.NoError(t, m.AcknowledgeForDivision(mapDiv, "operator", at))
			require.NoError(t, m.Correct(&newContent, nil, nil, nil, nil, nil, nil, "sys", at, "sys"))
		})
		assert.Empty(t, acknowledged(t, b, id), "content change")

		b = f(t)
		id = project(t, b, func(m *message.Message) {
			require.NoError(t, m.AcknowledgeForDivision(mapDiv, "operator", at))
			require.NoError(t, m.Correct(nil, nil, nil, nil, nil, nil, &newTime, "sys", at, "sys"))
		})
		assert.Empty(t, acknowledged(t, b, id), "time change")

		sender := "Neuer Absender"
		b = f(t)
		id = project(t, b, func(m *message.Message) {
			require.NoError(t, m.AcknowledgeForDivision(mapDiv, "operator", at))
			require.NoError(t, m.Correct(nil, &sender, nil, nil, nil, nil, nil, "sys", at, "sys"))
		})
		assert.Equal(t, []uuid.UUID{uuid.UUID(mapDiv)}, acknowledged(t, b, id), "unrelated field")
	})

	t.Run("RebuildKeepsAcknowledgements", func(t *testing.T) {
		b := f(t)
		if b.ResetProjections == nil {
			t.Skip("backend does not provide ResetProjections func")
		}

		id := project(t, b, func(m *message.Message) {
			require.NoError(t, m.AcknowledgeForDivision(mapDiv, "operator", at))
		})

		require.NoError(t, b.ResetProjections(t.Context()))
		require.NoError(t, b.Project(t.Context()))

		assert.Equal(t, []uuid.UUID{uuid.UUID(mapDiv)}, acknowledged(t, b, id))
	})
}
