package incident_test

import (
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/domain/incident"
)

func TestOpenIncident(t *testing.T) {
	i, err := incident.New("incident 1", incident.Location{Name: "Neverland"})
	require.Nil(t, err, "empty error")

	// assert for not nil (good when you expect something)
	if assert.NotNil(t, i) {
		assert.Equal(t, "incident 1", i.Name())
		assert.Equal(t, incident.StatusUnknown, i.Status())
		assert.Zero(t, i.OpenedAt(), "new incident has openAt not set")

		openTime := time.Now()
		i.OpenIncident(openTime)
		assert.NotZero(t, i.OpenedAt(), "OpenIncident sets the openedAt")
		assert.Equal(t, openTime, i.OpenedAt(), "OpenIncident sets the correct time")
		assert.Equal(t, incident.StatusOpen, i.Status(), "OpenIncident sets the open status")

		assert.Zero(t, i.ClosedAt(), "OpenIncident sets empty closedAt")
		otherTime := time.Now().Add(-10 * time.Hour)
		i.OpenIncident(otherTime)
		assert.NotEqual(t, otherTime, i.OpenedAt(), "OpenIncident not sets the openedAt when already set")
	}

	i2, err := incident.New("incident 2", incident.Location{Name: "Neverland"})
	futureTime := time.Now().Add(10 * time.Hour)
	i2.OpenIncident(futureTime)
	assert.NotEqual(t, futureTime, i2.OpenedAt(), "OpenIncident not sets the openedAt when time is in future")
	assert.NotZero(t, i2.OpenedAt(), "OpenIncident sets the openedAt to current time when time is in future")
}

func TestClose(t *testing.T) {
	i, err := incident.New("incident 1", incident.Location{Name: "Neverland"})
	require.Nil(t, err, "empty error")

	if assert.NotNil(t, i) {
		assert.Zero(t, i.ClosedAt(), "not yet closed incident")
		err = i.Close(time.Now())
		assert.Nil(t, err, "close does not return an error")
		assert.NotZero(t, i.ClosedAt(), "sets empty closedAt")

		err = i.Close(time.Now())
		assert.NotNil(t, err, "close on closed incident returns an error")
	}
}

func TestAddDivision(t *testing.T) {
	i, err := incident.New("incident 1", incident.Location{Name: "Neverland"})
	i.OpenIncident(time.Now())

	require.Nil(t, err, "empty error")

	assert.Zero(t, i.ClosedAt(), "not yet closed incident")
	err = i.Close(time.Now())
	assert.Nil(t, err, "close does not return an error")
	assert.NotZero(t, i.ClosedAt(), "sets empty closedAt")

	err = i.Close(time.Now())
	assert.NotNil(t, err, "close on closed incident returns an error")
}
