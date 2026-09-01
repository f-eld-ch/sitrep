// Package projection provides shared projection infrastructure used by both
// the postgres and in-memory projector implementations.
package projection

import (
	"context"
	"sync/atomic"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/metric"

	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

// InstrumentedProjector wraps any outbound.Projector and records a
// projector.running gauge (1=running, 0=stopped). Alerts can fire when the
// gauge drops to 0 outside of a planned shutdown.
type InstrumentedProjector struct {
	inner   outbound.Projector
	running atomic.Int32
	reg     metric.Registration
}

// NewInstrumentedProjector wraps inner with OTEL metrics. backend labels the
// gauge ("postgres" or "inmem"). Errors registering the gauge are non-fatal —
// the projector still runs, just without metrics.
func NewInstrumentedProjector(inner outbound.Projector, backend string) *InstrumentedProjector {
	ip := &InstrumentedProjector{inner: inner}

	meter := otel.Meter("sitrep/projector")
	gauge, err := meter.Int64ObservableGauge("projector.running",
		metric.WithDescription("1 while the projector goroutine is active, 0 after it exits"),
		metric.WithUnit("{bool}"),
	)
	if err != nil {
		return ip
	}

	backendAttr := attribute.String("backend", backend)
	reg, err := meter.RegisterCallback(
		func(_ context.Context, o metric.Observer) error {
			o.ObserveInt64(gauge, int64(ip.running.Load()), metric.WithAttributes(backendAttr))
			return nil
		},
		gauge,
	)
	if err != nil {
		return ip
	}
	ip.reg = reg
	return ip
}

// Run sets the running gauge to 1, delegates to the wrapped projector, then
// resets the gauge to 0 regardless of how the projector exits.
func (ip *InstrumentedProjector) Run(ctx context.Context) error {
	ip.running.Store(1)
	defer ip.running.Store(0)
	return ip.inner.Run(ctx)
}

// Unregister detaches the observable gauge callback. Call it after Run returns
// so the OTEL meter does not hold a reference to a stopped projector.
func (ip *InstrumentedProjector) Unregister() {
	if ip.reg != nil {
		_ = ip.reg.Unregister()
	}
}
