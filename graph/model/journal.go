package model

import (
	"time"

	"github.com/google/uuid"
)

type Journal struct {
	ID        uuid.UUID `json:"id"`
	ClosedAt  time.Time `json:"closedAt"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
	DeletedAt time.Time `json:"deletedAt"`
	Name      string    `json:"name"`
	Messages  []Message `json:"messages"`
}
