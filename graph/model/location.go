package model

import (
	"time"

	"github.com/google/uuid"
)

// Location represents the Location with name and coordinates
type Location struct {
	ID          uuid.UUID  `json:"id"`
	Name        string     `json:"name"`
	CreatedAt   time.Time  `json:"createdAt"`
	Coordinates Coordinate `json:"Coordinate"`
}

// Coordinate represents a lat/long coordinate
type Coordinate struct {
	Lat  float64 `json:"lat"`
	Long float64 `json:"long"`
}
