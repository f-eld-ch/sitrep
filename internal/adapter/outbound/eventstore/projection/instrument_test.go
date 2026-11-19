package projection_test

import (
	"context"
	"errors"
	"testing"

	sdkmetric "go.opentelemetry.io/otel/sdk/metric"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/metric/noop"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/eventstore/projection"
)

// blockingProjector reports that it started and then runs until release is closed.
type blockingProjector struct {
	started chan struct{}
	release chan struct{}
	err     error
}

func (p *blockingProjector) Run(_ context.Context) error {
	close(p.started)
	<-p.release

	return p.err
}

func newBlockingProjector(err error) *blockingProjector {
	return &blockingProjector{started: make(chan struct{}), release: make(chan struct{}), err: err}
}

// useMeterProvider installs the provider as the global one for the duration of the test.
func useMeterProvider(t *testing.T, mp metric.MeterProvider) {
	t.Helper()

	previous := otel.GetMeterProvider()

	otel.SetMeterProvider(mp)
	t.Cleanup(func() { otel.SetMeterProvider(previous) })
}

// runningGauge collects the projector.running data points as backend -> value.
func runningGauge(t *testing.T, reader *sdkmetric.ManualReader) map[string]int64 {
	t.Helper()

	var rm metricdata.ResourceMetrics
	require.NoError(t, reader.Collect(t.Context(), &rm))

	out := map[string]int64{}

	for _, scope := range rm.ScopeMetrics {
		for _, m := range scope.Metrics {
			if m.Name != "projector.running" {
				continue
			}

			gauge, ok := m.Data.(metricdata.Gauge[int64])
			require.True(t, ok, "projector.running must be an int64 gauge")

			for _, dp := range gauge.DataPoints {
				backend, _ := dp.Attributes.Value("backend")
				out[backend.AsString()] = dp.Value
			}
		}
	}

	return out
}

func TestInstrumentedProjector_GaugeFollowsTheRunState(t *testing.T) {
	reader := sdkmetric.NewManualReader()
	useMeterProvider(t, sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader)))

	inner := newBlockingProjector(nil)
	ip := projection.NewInstrumentedProjector(inner, "inmem")

	assert.Equal(t, map[string]int64{"inmem": 0}, runningGauge(t, reader), "stopped before Run")

	done := make(chan error, 1)

	go func() { done <- ip.Run(t.Context()) }()

	<-inner.started
	assert.Equal(t, map[string]int64{"inmem": 1}, runningGauge(t, reader), "running while the projector runs")

	close(inner.release)
	require.NoError(t, <-done)
	assert.Equal(t, map[string]int64{"inmem": 0}, runningGauge(t, reader), "stopped again after Run returns")

	ip.Unregister()
	assert.Empty(t, runningGauge(t, reader), "an unregistered gauge is no longer reported")
}

func TestInstrumentedProjector_RunReturnsTheInnerError(t *testing.T) {
	reader := sdkmetric.NewManualReader()
	useMeterProvider(t, sdkmetric.NewMeterProvider(sdkmetric.WithReader(reader)))

	boom := errors.New("boom")
	inner := newBlockingProjector(boom)
	close(inner.release)

	ip := projection.NewInstrumentedProjector(inner, "postgres")
	require.ErrorIs(t, ip.Run(t.Context()), boom)
	assert.Equal(t, map[string]int64{"postgres": 0}, runningGauge(t, reader), "the gauge is reset on failure too")
}

// failingMeter fails the registration step selected by the test.
type failingMeter struct {
	noop.Meter

	gaugeErr    error
	callbackErr error
}

func (m failingMeter) Int64ObservableGauge(
	name string,
	options ...metric.Int64ObservableGaugeOption,
) (metric.Int64ObservableGauge, error) {
	if m.gaugeErr != nil {
		return nil, m.gaugeErr
	}

	return m.Meter.Int64ObservableGauge(name, options...)
}

func (m failingMeter) RegisterCallback(metric.Callback, ...metric.Observable) (metric.Registration, error) {
	return nil, m.callbackErr
}

type failingMeterProvider struct {
	noop.MeterProvider

	meter failingMeter
}

func (p failingMeterProvider) Meter(string, ...metric.MeterOption) metric.Meter { return p.meter }

func TestInstrumentedProjector_MetricsFailuresAreNotFatal(t *testing.T) {
	tests := []struct {
		name  string
		meter failingMeter
	}{
		{"gauge cannot be created", failingMeter{gaugeErr: errors.New("no gauge")}},
		{"callback cannot be registered", failingMeter{callbackErr: errors.New("no callback")}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			useMeterProvider(t, failingMeterProvider{meter: tc.meter})

			boom := errors.New("inner result")
			inner := newBlockingProjector(boom)
			close(inner.release)

			ip := projection.NewInstrumentedProjector(inner, "inmem")

			require.ErrorIs(t, ip.Run(t.Context()), boom, "the projector still runs without metrics")
			assert.NotPanics(t, ip.Unregister, "there is nothing to unregister")
		})
	}
}
