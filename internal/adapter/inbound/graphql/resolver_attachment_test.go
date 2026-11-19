package graphql_test

import (
	"context"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/adapter/inbound/graphql/model"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/inbound"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

func TestMessage_QueryAndAttachments(t *testing.T) {
	s := newFullStack(t)
	inc := s.createIncident(t, "Files", model.IncidentAccessModeRestricted)
	ctx := ctxFor("owner")

	msg, err := s.resolver.Mutation().CreateMessage(ctx, model.CreateMessageInput{
		IncidentID: inc.ID, Sender: "A", Receiver: "B", Content: "see attached", Medium: model.MediumRadio,
	})
	require.NoError(t, err)

	msgID, err := shared.ParseMessageID(msg.ID)
	require.NoError(t, err)

	attach := func(name string) inbound.AttachmentState {
		t.Helper()

		a, err := s.messages.AttachFile(ctx, msgID, inbound.AttachFileInput{
			Filename: name, ContentType: "text/plain", Size: 5, Content: strings.NewReader("hello"),
		}, identity.Actor{Sub: "owner"})
		require.NoError(t, err)

		return a
	}

	first, second := attach("a.txt"), attach("b.txt")

	s.catchUp(t)

	files, err := s.resolver.Message().Attachments(ctx, msg)
	require.NoError(t, err)
	require.Len(t, files, 2)
	assert.Equal(t, first.ID.String(), files[0].ID)
	assert.Equal(t, "a.txt", files[0].Filename)
	assert.Equal(t, "text/plain", files[0].ContentType)
	assert.Equal(t, 5, files[0].Size)
	assert.Equal(t, "owner", files[0].UploadedBy)
	assert.Equal(t, "/api/v2/attachments/"+first.ID.String(), files[0].URL)
	assert.Equal(t, second.ID.String(), files[1].ID)

	_, err = s.resolver.Message().Attachments(ctx, &model.Message{ID: "nope"})
	require.ErrorIs(t, err, shared.ErrInvalidInput)

	// The Message query returns the stored message; a stranger on the restricted incident
	// does not even learn that it exists.
	got, err := s.resolver.Query().Message(ctx, msg.ID)
	require.NoError(t, err)
	assert.Equal(t, "see attached", got.Content)

	_, err = s.resolver.Query().Message(ctxFor("stranger"), msg.ID)
	require.ErrorIs(t, err, shared.ErrNotFound)

	_, err = s.resolver.Query().Message(ctx, uuid.NewString())
	require.ErrorIs(t, err, shared.ErrNotFound)

	_, err = s.resolver.Query().Message(ctx, "nope")
	require.ErrorIs(t, err, shared.ErrInvalidInput)

	// Removing an attachment needs write access and returns the removed id.
	_, err = s.resolver.Mutation().RemoveAttachment(ctxFor("stranger"), msg.ID, first.ID.String())
	require.ErrorIs(t, err, shared.ErrForbidden)

	removed, err := s.resolver.Mutation().RemoveAttachment(ctx, msg.ID, first.ID.String())
	require.NoError(t, err)
	assert.Equal(t, first.ID.String(), removed)
	s.catchUp(t)

	files, err = s.resolver.Message().Attachments(ctx, msg)
	require.NoError(t, err)
	require.Len(t, files, 1)
	assert.Equal(t, second.ID.String(), files[0].ID)

	_, err = s.resolver.Mutation().RemoveAttachment(ctx, msg.ID, uuid.NewString())
	require.Error(t, err, "an unknown attachment cannot be removed")
}

func TestRemoveAttachment_GuardClauses(t *testing.T) {
	m := newFullStack(t).resolver.Mutation()

	_, err := m.RemoveAttachment(context.Background(), uuid.NewString(), uuid.NewString())
	require.Error(t, err, "no actor")

	_, err = m.RemoveAttachment(ctxFor("x"), "nope", uuid.NewString())
	require.ErrorIs(t, err, shared.ErrInvalidInput, "malformed message id")

	_, err = m.RemoveAttachment(ctxFor("x"), uuid.NewString(), "nope")
	require.ErrorIs(t, err, shared.ErrInvalidInput, "malformed attachment id")

	_, err = m.RemoveAttachment(ctxFor("x"), uuid.NewString(), uuid.NewString())
	require.ErrorIs(t, err, shared.ErrNotFound, "unknown message")
}

func TestIncident_ChildIncidents(t *testing.T) {
	s := newFullStack(t)
	parent := s.createIncident(t, "Parent", model.IncidentAccessModeOpenOperational)

	open, err := s.resolver.Mutation().CreateIncident(ctxFor("owner"), model.CreateIncidentInput{
		Name: "Child", ParentID: &parent.ID, Divisions: []*model.DivisionInput{}, Layers: []*model.LayerInput{},
		Mode: new(model.IncidentAccessModeOpenOperational),
	})
	require.NoError(t, err)

	hidden, err := s.resolver.Mutation().CreateIncident(ctxFor("owner"), model.CreateIncidentInput{
		Name: "Hidden child", ParentID: &parent.ID, Divisions: []*model.DivisionInput{}, Layers: []*model.LayerInput{},
		Mode: new(model.IncidentAccessModeRestricted),
	})
	require.NoError(t, err)
	s.catchUp(t)

	children, err := s.resolver.Incident().ChildIncidents(ctxFor("owner"), parent)
	require.NoError(t, err)
	require.Len(t, children, 2)
	assert.ElementsMatch(t,
		[]string{open.Incident.ID, hidden.Incident.ID},
		[]string{children[0].ID, children[1].ID},
	)

	// A restricted child is only listed for those who may read it.
	visible, err := s.resolver.Incident().ChildIncidents(ctxFor("someone-else"), parent)
	require.NoError(t, err)
	require.Len(t, visible, 1)
	assert.Equal(t, "Child", visible[0].Name)
	require.NotNil(t, visible[0].ParentID)
	assert.Equal(t, parent.ID, *visible[0].ParentID)

	_, err = s.resolver.Incident().ChildIncidents(ctxFor("owner"), &model.Incident{ID: "nope"})
	require.ErrorIs(t, err, shared.ErrInvalidInput)
}
