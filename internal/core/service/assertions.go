package service

import "github.com/f-eld-ch/sitrep/internal/core/port/inbound"

// Compile-time assertions: concrete services satisfy their inbound port interfaces.
var (
	_ inbound.IncidentService = (*IncidentService)(nil)
	_ inbound.MessageService  = (*MessageService)(nil)
	_ inbound.LayerService    = (*LayerService)(nil)
	_ inbound.FeatureService  = (*FeatureService)(nil)
)
