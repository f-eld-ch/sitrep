package model

import "github.com/google/uuid"

type Division struct {
	ID          uuid.UUID `json:"id"`
	Description string    `json:"description"`
	Name        string    `json:"name"`
	Incident    Incident  `json:"incident"`
}
