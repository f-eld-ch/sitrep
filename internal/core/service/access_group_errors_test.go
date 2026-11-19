package service_test

import (
	"context"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/platform/identity"
)

// Bad group input must surface as shared.ErrInvalidInput, which the server maps to INVALID_INPUT;
// any other error is reported to the user as an internal server error.
func TestAccessGroupValidationErrorsAreInvalidInput(t *testing.T) {
	ctx := context.Background()
	svc := newDefaultAccessSvc(t)
	actor := identity.Actor{Sub: "admin"}

	_, err := svc.CreateAccessGroup(ctx, "  ", "", actor)
	require.ErrorIs(t, err, shared.ErrInvalidInput, "blank name")

	_, err = svc.CreateAccessGroup(ctx, strings.Repeat("x", 65), "", actor)
	require.ErrorIs(t, err, shared.ErrInvalidInput, "name over 64 characters")

	id, err := svc.CreateAccessGroup(ctx, "Ops", "", actor)
	require.NoError(t, err)

	require.ErrorIs(t, svc.RenameAccessGroup(ctx, id, "", actor), shared.ErrInvalidInput)
	require.ErrorIs(t, svc.AddGroupMember(ctx, id, " ", actor), shared.ErrInvalidInput)

	require.NoError(t, svc.ArchiveAccessGroup(ctx, id, actor))
	require.ErrorIs(t, svc.RenameAccessGroup(ctx, id, "Other", actor), shared.ErrInvalidInput, "archived group")
	require.ErrorIs(t, svc.AddGroupMember(ctx, id, "user-1", actor), shared.ErrInvalidInput, "archived group")
}
