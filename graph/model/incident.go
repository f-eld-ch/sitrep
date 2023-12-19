package model

import (
	"time"

	"github.com/google/uuid"
)

type Incident struct {
	ID        uuid.UUID  `json:"id"`
	ClosedAt  time.Time  `json:"closedAt"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
	DeletedAt time.Time  `json:"deletedAt"`
	Divisions []Division `json:"divisions"`
	Name      string     `json:"name"`
	Journals  []Journal  `json:"journals"`
	Location  Location   `json:"location"`
}

type NewIncident struct {
	Name     string  `json:"name"`
	Location string  `json:"location"`
	Lat      float64 `json:"lat"`
	Long     float64 `json:"long"`
}
