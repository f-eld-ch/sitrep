package layer_test

import (
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/layer"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

func TestLayer_Imported(t *testing.T) {
	id := shared.LayerID(uuid.New())

	l := replay(t, id, []eventsourcing.Event{{
		Version:    1,
		EventType:  "Imported",
		OccurredAt: at,
		Data:       layer.Imported{IncidentID: incidentID, Name: "Altlage"},
	}})

	assert.Equal(t, uuid.UUID(incidentID), l.OwnerIncidentID())
	assert.Equal(t, incidentID, l.IncidentID())
	assert.Equal(t, "Altlage", l.Name())
	assert.Equal(t, shared.LayerKindStandard, l.Kind())
}

func TestLayer_TransitionRejectsForeignEvents(t *testing.T) {
	l := layer.New(shared.LayerID(uuid.New()))

	require.Error(t, l.Transition(eventsourcing.Event{Data: 42}))
}
