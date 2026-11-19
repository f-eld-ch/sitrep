package messagemap_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/migrations/internal/messagemap"
)

const malformed = `{not json`

func TestPlansReportNothingToDo(t *testing.T) {
	assert.True(t, messagemap.DivisionPlan{}.None())
	assert.False(t, messagemap.DivisionPlan{AddNew: true}.None())
	assert.False(t, messagemap.DivisionPlan{AssignKindTo: "a"}.None())

	assert.True(t, messagemap.LayerPlan{}.None())
	assert.False(t, messagemap.LayerPlan{AddNew: true}.None())
	assert.False(t, messagemap.LayerPlan{AssignKindTo: "a"}.None())
}

func TestDivisionEventsWithMalformedDataAreReported(t *testing.T) {
	for _, eventType := range []string{
		"DivisionAdded", "Imported", "DivisionRenamed", "DivisionKindAssigned", "DivisionRemoved",
	} {
		t.Run(eventType, func(t *testing.T) {
			events := []messagemap.Event{ev(eventType, malformed)}

			_, err := messagemap.PlanDivision(events)
			require.Error(t, err)

			_, _, err = messagemap.MessageMapDivisionID(events)
			require.Error(t, err)
		})
	}
}

func TestLayerEventsWithMalformedDataAreReported(t *testing.T) {
	for _, eventType := range []string{"Created", "Imported", "Renamed", "KindAssigned"} {
		t.Run(eventType, func(t *testing.T) {
			streams := []messagemap.LayerStream{{ID: "l", Events: []messagemap.Event{ev(eventType, malformed)}}}

			_, err := messagemap.PlanLayer(streams)
			require.Error(t, err)

			_, err = messagemap.NeedsStandardLayer(streams)
			require.Error(t, err)
		})
	}

	t.Run("a removed layer needs no data", func(t *testing.T) {
		streams := []messagemap.LayerStream{{ID: "l", Events: []messagemap.Event{ev("Removed", malformed)}}}

		plan, err := messagemap.PlanLayer(streams)

		require.NoError(t, err)
		assert.Equal(t, messagemap.LayerPlan{AddNew: true}, plan)
	})
}

func TestMessageEventsWithMalformedDataAreReported(t *testing.T) {
	for _, eventType := range []string{
		"Triaged", "Imported", "DivisionAcknowledged", "DivisionAcknowledgementRevoked",
	} {
		t.Run(eventType, func(t *testing.T) {
			_, err := messagemap.NeedsAcknowledgement([]messagemap.Event{ev(eventType, malformed)}, "d")

			require.Error(t, err)
		})
	}
}
