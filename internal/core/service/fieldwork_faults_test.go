package service_test

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore"
	"github.com/f-eld-ch/sitrep/internal/core/domain/schadenplatz"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/service"
)

// fieldRig is the Schadenplatz and resource services on an incident that has a default
// Schadenplatz, a second one with casualties, and three resources: one alerted, a second one to
// take over from it, and one that was relieved. Their repositories can be made to fail.
type fieldRig struct {
	incidentRig

	places    *faultySchadenplaetze
	resources *faultyResources
	sp        *service.SchadenplatzService
	res       *service.ResourceService

	incidentID shared.IncidentID
	defaultID  shared.SchadenplatzID
	otherID    shared.SchadenplatzID
	alerted    shared.ResourceID
	successor  shared.ResourceID
	relieved   shared.ResourceID
}

func newFieldRig(t *testing.T) fieldRig {
	t.Helper()

	r := newIncidentRig(t)
	spRepo := eventstore.NewSchadenplatzRepository(r.store)
	r.svc.WithSchadenplatzRepository(spRepo)

	rig := fieldRig{
		incidentRig: r,
		places:      &faultySchadenplaetze{SchadenplatzRepository: spRepo},
		resources:   &faultyResources{ResourceRepository: eventstore.NewResourceRepository(r.store)},
	}
	rig.sp = r.factory.SchadenplatzService(rig.places, r.incidents)
	rig.res = r.factory.ResourceService(rig.resources, r.incidents, rig.places)

	rig.incidentID = r.create(t, "Hochwasser")

	inc, err := r.svc.LoadIncident(ctx(), rig.incidentID)
	require.NoError(t, err)
	require.NotNil(t, inc.DefaultSchadenplatzID())

	rig.defaultID = *inc.DefaultSchadenplatzID()

	other, err := rig.sp.CreateSchadenplatz(ctx(), rig.incidentID, "Nord", nil, testActor)
	require.NoError(t, err)

	rig.otherID = other.ID

	_, err = rig.sp.RecordCasualties(ctx(), other.ID, shared.MessageID(newID()),
		schadenplatz.CasualtyDeltas{Verletzte: 2}, nil, testActor)
	require.NoError(t, err)

	alert := func(name string) shared.ResourceID {
		in := alertInput(rig.incidentID)
		in.Name = name

		state, err := rig.res.AlertResource(ctx(), in, testActor)
		require.NoError(t, err)

		return state.ID
	}

	rig.alerted, rig.successor, rig.relieved = alert("Zug A"), alert("Zug B"), alert("Zug C")

	_, err = rig.res.RelieveResource(ctx(), rig.relieved, nil, nil, testActor)
	require.NoError(t, err)

	rig.places.saves, rig.resources.saves = 0, 0

	return rig
}

// fieldOp is a command of the Schadenplatz or resource service. A run with missing set acts on
// something that does not exist.
type fieldOp struct {
	name string
	run  func(r fieldRig, missing bool) error
}

func fieldOps() []fieldOp {
	spID := func(r fieldRig, missing bool) shared.SchadenplatzID {
		if missing {
			return shared.SchadenplatzID(newID())
		}

		return r.otherID
	}
	incID := func(r fieldRig, missing bool) shared.IncidentID {
		if missing {
			return shared.IncidentID(newID())
		}

		return r.incidentID
	}
	resID := func(id shared.ResourceID, missing bool) shared.ResourceID {
		if missing {
			return shared.ResourceID(newID())
		}

		return id
	}

	return []fieldOp{
		{"CreateSchadenplatz", func(r fieldRig, missing bool) error {
			_, err := r.sp.CreateSchadenplatz(ctx(), incID(r, missing), "Süd", nil, testActor)

			return err
		}},
		{"RenameSchadenplatz", func(r fieldRig, missing bool) error {
			_, err := r.sp.RenameSchadenplatz(ctx(), spID(r, missing), "Anders", testActor)

			return err
		}},
		{"SetSchadenplatzGeometry", func(r fieldRig, missing bool) error {
			_, err := r.sp.SetSchadenplatzGeometry(
				ctx(),
				spID(r, missing),
				[]byte(`{"type":"Point","coordinates":[8,47]}`),
				testActor,
			)

			return err
		}},
		{"RecordCasualties", func(r fieldRig, missing bool) error {
			_, err := r.sp.RecordCasualties(ctx(), spID(r, missing), shared.MessageID(newID()),
				schadenplatz.CasualtyDeltas{Tote: 1}, nil, testActor)

			return err
		}},
		{"MergeSchadenplatz", func(r fieldRig, missing bool) error {
			return r.sp.MergeSchadenplatz(ctx(), spID(r, missing), nil, testActor)
		}},
		{"AlertResource", func(r fieldRig, missing bool) error {
			in := alertInput(incID(r, missing))
			in.Name = "Neu"
			_, err := r.res.AlertResource(ctx(), in, testActor)

			return err
		}},
		{"Rename", func(r fieldRig, missing bool) error {
			_, err := r.res.Rename(ctx(), resID(r.alerted, missing), "Anders", nil, testActor)

			return err
		}},
		{"RelieveResource", func(r fieldRig, missing bool) error {
			_, err := r.res.RelieveResource(ctx(), resID(r.alerted, missing), nil, nil, testActor)

			return err
		}},
		{"ReactivateResource", func(r fieldRig, missing bool) error {
			_, err := r.res.ReactivateResource(ctx(), resID(r.relieved, missing), nil, testActor)

			return err
		}},
		{"HandOver", func(r fieldRig, missing bool) error {
			_, err := r.res.HandOver(ctx(), resID(r.alerted, missing), r.successor, nil, testActor)

			return err
		}},
	}
}

func TestFieldServices_CommandsReportFailures(t *testing.T) {
	for _, op := range fieldOps() {
		t.Run(op.name+" works when nothing is wrong", func(t *testing.T) {
			require.NoError(t, op.run(newFieldRig(t), false))
		})

		t.Run(op.name+" without permission", func(t *testing.T) {
			r := newFieldRig(t)
			r.access.denied = true

			require.ErrorIs(t, op.run(r, false), shared.ErrForbidden)
		})

		t.Run(op.name+" when the permission cannot be looked up", func(t *testing.T) {
			r := newFieldRig(t)
			r.access.err = errBoom

			require.ErrorIs(t, op.run(r, false), errBoom)
		})

		t.Run(op.name+" on something that does not exist", func(t *testing.T) {
			r := newFieldRig(t)

			require.ErrorIs(t, op.run(r, true), shared.ErrNotFound)
		})

		t.Run(op.name+" when the incident cannot be loaded", func(t *testing.T) {
			r := newFieldRig(t)
			r.incidents.load = errBoom

			require.ErrorIs(t, op.run(r, false), errBoom)
		})

		t.Run(op.name+" on a closed incident", func(t *testing.T) {
			r := newFieldRig(t)
			_, err := r.svc.CloseIncident(ctx(), r.incidentID, testActor)
			require.NoError(t, err)

			require.ErrorIs(t, op.run(r, false), shared.ErrIncidentNotOpen)
		})

		t.Run(op.name+" when the result cannot be saved", func(t *testing.T) {
			r := newFieldRig(t)
			r.places.save, r.resources.save = errBoom, errBoom

			require.ErrorIs(t, op.run(r, false), errBoom)
		})

		if op.name == "CreateSchadenplatz" || op.name == "AlertResource" {
			continue // these write a new aggregate and load none
		}

		t.Run(op.name+" when the stored state cannot be loaded", func(t *testing.T) {
			r := newFieldRig(t)
			r.places.load, r.resources.load = errBoom, errBoom

			require.ErrorIs(t, op.run(r, false), errBoom)
		})
	}
}

func TestSchadenplatzService_MergeSchadenplatz_Failures(t *testing.T) {
	t.Run("the casualties move to the default one", func(t *testing.T) {
		r := newFieldRig(t)

		require.NoError(t, r.sp.MergeSchadenplatz(ctx(), r.otherID, nil, testActor))

		def, err := r.places.SchadenplatzRepository.Load(ctx(), r.defaultID)
		require.NoError(t, err)
		assert.Equal(t, 2, def.Casualties().Verletzte)

		merged, err := r.places.SchadenplatzRepository.Load(ctx(), r.otherID)
		require.NoError(t, err)
		assert.True(t, merged.IsMerged())
	})

	t.Run("the default one cannot be merged into itself", func(t *testing.T) {
		r := newFieldRig(t)

		require.ErrorIs(t, r.sp.MergeSchadenplatz(ctx(), r.defaultID, nil, testActor), shared.ErrInvalidInput)
	})

	t.Run("one that is merged is gone", func(t *testing.T) {
		r := newFieldRig(t)
		require.NoError(t, r.sp.MergeSchadenplatz(ctx(), r.otherID, nil, testActor))

		_, err := r.sp.RenameSchadenplatz(ctx(), r.otherID, "Anders", testActor)
		require.Error(t, err)
	})

	t.Run("the default one that cannot be loaded", func(t *testing.T) {
		r := newFieldRig(t)
		r.places.load = errBoom
		r.places.loadOK = 1 // the Schadenplatz to merge

		require.ErrorIs(t, r.sp.MergeSchadenplatz(ctx(), r.otherID, nil, testActor), errBoom)
	})

	t.Run("the default one that cannot be saved", func(t *testing.T) {
		r := newFieldRig(t)
		r.places.save = errBoom

		require.ErrorIs(t, r.sp.MergeSchadenplatz(ctx(), r.otherID, nil, testActor), errBoom)
		assert.Equal(t, 1, r.places.saves, "the merge itself is not saved if the totals could not be moved")
	})
}

func TestResourceService_DomainRules(t *testing.T) {
	t.Run("a resource that was relieved is not relieved again", func(t *testing.T) {
		r := newFieldRig(t)

		_, err := r.res.RelieveResource(ctx(), r.relieved, nil, nil, testActor)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("only a relieved resource is reactivated", func(t *testing.T) {
		r := newFieldRig(t)

		_, err := r.res.ReactivateResource(ctx(), r.alerted, nil, testActor)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("a relieved resource comes back on the default Schadenplatz", func(t *testing.T) {
		r := newFieldRig(t)

		state, err := r.res.ReactivateResource(ctx(), r.relieved, nil, testActor)
		require.NoError(t, err)
		assert.Equal(t, r.defaultID, state.SchadenplatzID)
	})

	t.Run("a relieved resource cannot be renamed", func(t *testing.T) {
		r := newFieldRig(t)

		_, err := r.res.Rename(ctx(), r.relieved, "Anders", nil, testActor)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("a relief names its successor, which has to exist", func(t *testing.T) {
		r := newFieldRig(t)
		unknown := shared.ResourceID(newID())

		_, err := r.res.RelieveResource(ctx(), r.alerted, &unknown, nil, testActor)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})

	t.Run("a relief links the successor back", func(t *testing.T) {
		r := newFieldRig(t)

		state, err := r.res.RelieveResource(ctx(), r.alerted, &r.successor, nil, testActor)
		require.NoError(t, err)
		require.NotNil(t, state.SuccessorID)
		assert.Equal(t, r.successor, *state.SuccessorID)

		successor, err := r.resources.ResourceRepository.Load(ctx(), r.successor)
		require.NoError(t, err)
		require.NotNil(t, successor.PredecessorID())
		assert.Equal(t, r.alerted, *successor.PredecessorID())
	})

	t.Run("a successor that cannot be saved", func(t *testing.T) {
		r := newFieldRig(t)
		r.resources.save = errBoom
		r.resources.saveOK = 1 // the relieved one

		_, err := r.res.RelieveResource(ctx(), r.alerted, &r.successor, nil, testActor)
		require.ErrorIs(t, err, errBoom)
	})

	t.Run("a hand over needs both resources", func(t *testing.T) {
		r := newFieldRig(t)

		_, err := r.res.HandOver(ctx(), r.alerted, shared.ResourceID(newID()), nil, testActor)
		require.ErrorIs(t, err, shared.ErrNotFound)
	})

	t.Run("a successor that is relieved cannot take over", func(t *testing.T) {
		r := newFieldRig(t)

		_, err := r.res.HandOver(ctx(), r.alerted, r.relieved, nil, testActor)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})

	t.Run("an incident without a default Schadenplatz is told so", func(t *testing.T) {
		r := newFieldRig(t)
		// An incident opened before default Schadenplätze were created.
		legacy := seedIncident(t, r.incidentRig, false)

		_, err := r.res.AlertResource(ctx(), alertInput(legacy), testActor)
		require.ErrorIs(t, err, shared.ErrInvalidInput)
	})
}
