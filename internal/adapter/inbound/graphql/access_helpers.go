package graphql

import (
	"github.com/f-eld-ch/sitrep/internal/adapter/inbound/graphql/model"
	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
)

func accessModeToDomain(mode model.IncidentAccessMode) access.IncidentMode {
	if mode == model.IncidentAccessModeRestricted {
		return access.Restricted
	}

	return access.OpenOperational
}

func incidentRoleToDomain(role model.IncidentRole) access.Role {
	switch role {
	case model.IncidentRoleOwner:
		return access.Owner
	case model.IncidentRoleManager:
		return access.Manager
	case model.IncidentRoleEditor:
		return access.Editor
	case model.IncidentRoleViewer:
		return access.Viewer
	}

	return access.Viewer
}

func principalKindToDomain(kind model.AccessPrincipalKind) access.PrincipalKind {
	if kind == model.AccessPrincipalKindGroup {
		return access.GroupPrincipal
	}

	return access.UserPrincipal
}

func globalRoleToDomain(role model.GlobalRole) access.GlobalRole {
	if role == model.GlobalRoleGroupAdmin {
		return access.GroupAdmin
	}

	return access.SystemAdmin
}
