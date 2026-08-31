package service

import "github.com/f-eld-ch/sitrep/internal/core/port/outbound"

// Factory holds the cross-cutting infrastructure shared by every service and
// creates fully-wired service instances. Use functional options to inject the
// backend implementations; swap the entire set by changing a few lines at the
// composition root rather than threading every dependency through every call.
type Factory struct {
	tx       outbound.Transactor
	clock    outbound.Clock
	ids      outbound.IDs
	notifier outbound.EventNotifier
	counter  outbound.MessageCounter
}

// FactoryOption configures a Factory.
type FactoryOption func(*Factory)

func WithTransactor(tx outbound.Transactor) FactoryOption {
	return func(f *Factory) { f.tx = tx }
}

func WithClock(clock outbound.Clock) FactoryOption {
	return func(f *Factory) { f.clock = clock }
}

func WithIDs(ids outbound.IDs) FactoryOption {
	return func(f *Factory) { f.ids = ids }
}

func WithNotifier(notifier outbound.EventNotifier) FactoryOption {
	return func(f *Factory) { f.notifier = notifier }
}

func WithMessageCounter(counter outbound.MessageCounter) FactoryOption {
	return func(f *Factory) { f.counter = counter }
}

// NewFactory builds a Factory from the supplied options.
func NewFactory(opts ...FactoryOption) *Factory {
	f := &Factory{}
	for _, o := range opts {
		o(f)
	}
	return f
}

// IncidentService creates a ready-to-use IncidentService.
func (f *Factory) IncidentService(repo outbound.IncidentRepository, layers outbound.LayerRepository) *IncidentService {
	return NewIncidentService(f.tx, repo, layers, f.clock, f.ids, f.notifier)
}

// MessageService creates a ready-to-use MessageService.
func (f *Factory) MessageService(repo outbound.MessageRepository, incidents outbound.IncidentRepository) *MessageService {
	return NewMessageService(f.tx, repo, incidents, f.counter, f.clock, f.ids, f.notifier)
}

// LayerService creates a ready-to-use LayerService.
func (f *Factory) LayerService(repo outbound.LayerRepository) *LayerService {
	return NewLayerService(f.tx, repo, f.clock, f.ids, f.notifier)
}

// FeatureService creates a ready-to-use FeatureService.
func (f *Factory) FeatureService(repo outbound.FeatureRepository) *FeatureService {
	return NewFeatureService(f.tx, repo, f.clock, f.notifier)
}
