package shared_test

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
)

func TestParseIDs(t *testing.T) {
	raw := uuid.New()

	parsers := map[string]func(string) (uuid.UUID, error){
		"incident": func(s string) (uuid.UUID, error) { id, err := shared.ParseIncidentID(s); return uuid.UUID(id), err },
		"message":  func(s string) (uuid.UUID, error) { id, err := shared.ParseMessageID(s); return uuid.UUID(id), err },
		"layer":    func(s string) (uuid.UUID, error) { id, err := shared.ParseLayerID(s); return uuid.UUID(id), err },
		"feature":  func(s string) (uuid.UUID, error) { id, err := shared.ParseFeatureID(s); return uuid.UUID(id), err },
		"division": func(s string) (uuid.UUID, error) { id, err := shared.ParseDivisionID(s); return uuid.UUID(id), err },
		"attachment": func(s string) (uuid.UUID, error) {
			id, err := shared.ParseAttachmentID(s)
			return uuid.UUID(id), err
		},
		"schadenplatz": func(s string) (uuid.UUID, error) {
			id, err := shared.ParseSchadenplatzID(s)
			return uuid.UUID(id), err
		},
		"resource": func(s string) (uuid.UUID, error) { id, err := shared.ParseResourceID(s); return uuid.UUID(id), err },
	}

	for name, parse := range parsers {
		t.Run(name, func(t *testing.T) {
			got, err := parse(raw.String())
			require.NoError(t, err)
			assert.Equal(t, raw, got)

			_, err = parse("not-a-uuid")
			require.Error(t, err)
		})
	}
}

// IDs travel as JSON text (event payloads, GraphQL), so a value must survive a round trip.
func TestIDsRoundTripAsText(t *testing.T) {
	type payload struct {
		Incident     shared.IncidentID
		Message      shared.MessageID
		Layer        shared.LayerID
		Feature      shared.FeatureID
		Division     shared.DivisionID
		Attachment   shared.AttachmentID
		Schadenplatz shared.SchadenplatzID
		Resource     shared.ResourceID
	}

	in := payload{
		shared.IncidentID(uuid.New()), shared.MessageID(uuid.New()), shared.LayerID(uuid.New()),
		shared.FeatureID(uuid.New()), shared.DivisionID(uuid.New()), shared.AttachmentID(uuid.New()),
		shared.SchadenplatzID(uuid.New()), shared.ResourceID(uuid.New()),
	}

	b, err := json.Marshal(in)
	require.NoError(t, err)
	assert.Contains(t, string(b), in.Incident.String())
	assert.Contains(t, string(b), in.Resource.String())

	var out payload

	require.NoError(t, json.Unmarshal(b, &out))
	assert.Equal(t, in, out)

	t.Run("a malformed id is an error", func(t *testing.T) {
		var bad payload

		require.Error(t, json.Unmarshal([]byte(`{"Incident":"nope"}`), &bad))
		require.Error(t, json.Unmarshal([]byte(`{"Resource":"nope"}`), &bad))
	})
}

func TestValidationError(t *testing.T) {
	err := shared.ValidationError{Field: "name", Message: "must not be empty"}

	require.ErrorIs(t, err, shared.ErrInvalidInput)
	assert.Contains(t, err.Error(), "name")
	assert.Contains(t, err.Error(), "must not be empty")
}
