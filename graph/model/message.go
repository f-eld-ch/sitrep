package model

import (
	"time"

	"github.com/google/uuid"
)

type Message struct {
	ID             uuid.UUID `json:"id"`
	ClosedAt       time.Time `json:"closedAt"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
	DeletedAt      time.Time `json:"deletedAt"`
	Author         User      `json:"author"`
	Receiver       string    `json:"receiver"`
	ReceiverDetail string    `json:"receiverDetail"`
	Sender         string    `json:"sender"`
	SenderDetail   string    `json:"senderDetail"`
	Time           time.Time `json:"time"`
}

type NewMessage struct {
	Sender   string `json:"sender"`
	Receiver string `json:"receiver"`
	Time     string `json:"time"`
	Message  string `json:"message"`
}
