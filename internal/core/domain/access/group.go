package access

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

type GroupCreated struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

type GroupRenamed struct {
	Name string `json:"name"`
}

type GroupArchived struct{}

type GroupMemberAdded struct {
	Subject string `json:"subject"`
}

type GroupMemberRemoved struct {
	Subject string `json:"subject"`
}

type AccessGroup struct {
	root        eventsourcing.Root
	name        string
	description string
	archived    bool
	members     map[string]bool
}

func NewAccessGroup(id uuid.UUID) *AccessGroup {
	g := &AccessGroup{members: make(map[string]bool)}
	g.root.SetID(id)
	eventsourcing.Register(g, GroupCreated{}, GroupRenamed{}, GroupArchived{}, GroupMemberAdded{}, GroupMemberRemoved{})

	return g
}

func (g *AccessGroup) Root() *eventsourcing.Root     { return &g.root }
func (g *AccessGroup) AggregateType() string         { return "AccessGroup" }
func (g *AccessGroup) Name() string                  { return g.name }
func (g *AccessGroup) Description() string           { return g.description }
func (g *AccessGroup) IsArchived() bool              { return g.archived }
func (g *AccessGroup) HasMember(subject string) bool { return g.members[subject] }

func (g *AccessGroup) Create(name, description, actor string, at time.Time) error {
	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("group name must not be empty")
	}

	eventsourcing.TrackChange(g, GroupCreated{Name: name, Description: description}, at, meta(actor))

	return nil
}

func (g *AccessGroup) Rename(name, actor string, at time.Time) error {
	if g.archived {
		return fmt.Errorf("group is archived")
	}

	if strings.TrimSpace(name) == "" {
		return fmt.Errorf("group name must not be empty")
	}

	if g.name == name {
		return nil
	}

	eventsourcing.TrackChange(g, GroupRenamed{Name: name}, at, meta(actor))

	return nil
}

func (g *AccessGroup) Archive(actor string, at time.Time) error {
	if g.archived {
		return nil
	}

	eventsourcing.TrackChange(g, GroupArchived{}, at, meta(actor))

	return nil
}

func (g *AccessGroup) AddMember(subject, actor string, at time.Time) error {
	if g.archived {
		return fmt.Errorf("group is archived")
	}

	if strings.TrimSpace(subject) == "" {
		return fmt.Errorf("group member subject must not be empty")
	}

	if g.members[subject] {
		return nil
	}

	eventsourcing.TrackChange(g, GroupMemberAdded{Subject: subject}, at, meta(actor))

	return nil
}

func (g *AccessGroup) RemoveMember(subject, actor string, at time.Time) error {
	if !g.members[subject] {
		return nil
	}

	eventsourcing.TrackChange(g, GroupMemberRemoved{Subject: subject}, at, meta(actor))

	return nil
}

func (g *AccessGroup) Transition(e eventsourcing.Event) error {
	switch d := e.Data.(type) {
	case GroupCreated:
		g.name, g.description = d.Name, d.Description
	case GroupRenamed:
		g.name = d.Name
	case GroupArchived:
		g.archived = true
	case GroupMemberAdded:
		g.members[d.Subject] = true
	case GroupMemberRemoved:
		delete(g.members, d.Subject)
	default:
		return fmt.Errorf("access group transition: unhandled event type %T", e.Data)
	}

	return nil
}
