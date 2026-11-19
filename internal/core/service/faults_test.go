package service_test

import (
	"context"

	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/feature"
	"github.com/f-eld-ch/sitrep/internal/core/domain/incident"
	"github.com/f-eld-ch/sitrep/internal/core/domain/layer"
	"github.com/f-eld-ch/sitrep/internal/core/domain/message"
	"github.com/f-eld-ch/sitrep/internal/core/domain/schadenplatz"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

// ── Fault injection for the repositories ─────────────────────────────────────

// fault says how a repository misbehaves. The zero value does not.
type fault struct {
	// load makes Load fail with this error, after loadOK loads that go through.
	load   error
	loadOK int
	// save makes Save fail with this error, after saveOK saves that go through.
	save   error
	saveOK int
	// conflicts is the number of Saves that fail with shared.ErrConflict before one goes through,
	// as when another writer got in between.
	conflicts int
	// saves counts the calls to Save.
	saves int
}

// onLoad is called by a repository's Load; a non-nil result is the error to return.
func (f *fault) onLoad() error {
	if f.load == nil {
		return nil
	}

	if f.loadOK > 0 {
		f.loadOK--

		return nil
	}

	return f.load
}

// onSave is called by a repository's Save; a non-nil result is the error to return.
func (f *fault) onSave() error {
	f.saves++

	if f.conflicts > 0 {
		f.conflicts--

		return shared.ErrConflict
	}

	if f.save == nil {
		return nil
	}

	if f.saveOK > 0 {
		f.saveOK--

		return nil
	}

	return f.save
}

type faultyIncidents struct {
	outbound.IncidentRepository
	fault
}

func (r *faultyIncidents) Load(ctx context.Context, id shared.IncidentID) (*incident.Incident, error) {
	if err := r.onLoad(); err != nil {
		return nil, err
	}

	return r.IncidentRepository.Load(ctx, id)
}

func (r *faultyIncidents) Save(ctx context.Context, a *incident.Incident) (outbound.Cursor, error) {
	if err := r.onSave(); err != nil {
		return nil, err
	}

	return r.IncidentRepository.Save(ctx, a)
}

type faultyMessages struct {
	outbound.MessageRepository
	fault
	loadManyErr error
}

func (r *faultyMessages) Load(ctx context.Context, id shared.MessageID) (*message.Message, error) {
	if err := r.onLoad(); err != nil {
		return nil, err
	}

	return r.MessageRepository.Load(ctx, id)
}

func (r *faultyMessages) LoadMany(ctx context.Context, ids []shared.MessageID) ([]*message.Message, error) {
	if r.loadManyErr != nil {
		return nil, r.loadManyErr
	}

	return r.MessageRepository.LoadMany(ctx, ids)
}

func (r *faultyMessages) Save(ctx context.Context, a *message.Message) (outbound.Cursor, error) {
	if err := r.onSave(); err != nil {
		return nil, err
	}

	return r.MessageRepository.Save(ctx, a)
}

type faultyLayers struct {
	outbound.LayerRepository
	fault
}

func (r *faultyLayers) Load(ctx context.Context, id shared.LayerID) (*layer.Layer, error) {
	if err := r.onLoad(); err != nil {
		return nil, err
	}

	return r.LayerRepository.Load(ctx, id)
}

func (r *faultyLayers) Save(ctx context.Context, a *layer.Layer) (outbound.Cursor, error) {
	if err := r.onSave(); err != nil {
		return nil, err
	}

	return r.LayerRepository.Save(ctx, a)
}

type faultyFeatures struct {
	outbound.FeatureRepository
	fault
}

func (r *faultyFeatures) Load(ctx context.Context, id shared.FeatureID) (*feature.Feature, error) {
	if err := r.onLoad(); err != nil {
		return nil, err
	}

	return r.FeatureRepository.Load(ctx, id)
}

func (r *faultyFeatures) Save(ctx context.Context, a *feature.Feature) (outbound.Cursor, error) {
	if err := r.onSave(); err != nil {
		return nil, err
	}

	return r.FeatureRepository.Save(ctx, a)
}

type faultySchadenplaetze struct {
	outbound.SchadenplatzRepository
	fault
}

func (r *faultySchadenplaetze) Save(ctx context.Context, a *schadenplatz.Schadenplatz) (outbound.Cursor, error) {
	if err := r.onSave(); err != nil {
		return nil, err
	}

	return r.SchadenplatzRepository.Save(ctx, a)
}

type faultyAccessRepo struct {
	outbound.IncidentAccessRepository
	fault
}

func (r *faultyAccessRepo) Save(ctx context.Context, a *access.IncidentAccess) (outbound.Cursor, error) {
	if err := r.onSave(); err != nil {
		return nil, err
	}

	return r.IncidentAccessRepository.Save(ctx, a)
}

// ── Access and hierarchy ─────────────────────────────────────────────────────

// accessState is an access checker the test can switch: it allows everything until told otherwise.
type accessState struct {
	denied bool
	err    error
}

func (a *accessState) Can(context.Context, string, shared.IncidentID, access.Action) (bool, error) {
	return !a.denied, a.err
}

// hierarchyStub is a hierarchy guard with scripted answers.
type hierarchyStub struct {
	lockErr         error
	hasChildren     bool
	hasChildrenErr  error
	locks, released int
}

func (h *hierarchyStub) LockForUpdate(context.Context) (func(), error) {
	if h.lockErr != nil {
		return nil, h.lockErr
	}

	h.locks++

	return func() { h.released++ }, nil
}

func (h *hierarchyStub) HasChildren(context.Context, shared.IncidentID) (bool, error) {
	return h.hasChildren, h.hasChildrenErr
}

// accessTemplates is an AccessQueries that only knows the default-access template.
type accessTemplates struct {
	outbound.AccessQueries
	template outbound.DefaultAccessTemplateRM
	err      error
}

func (a accessTemplates) GetDefaultAccessTemplate(context.Context) (outbound.DefaultAccessTemplateRM, error) {
	return a.template, a.err
}
