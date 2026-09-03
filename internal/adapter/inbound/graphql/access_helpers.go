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

func incidentModeFromDomain(mode access.IncidentMode) model.IncidentAccessMode {
	if mode == access.Restricted {
		return model.IncidentAccessModeRestricted
	}

	return model.IncidentAccessModeOpenOperational
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

func principalKindFromDomain(kind access.PrincipalKind) model.AccessPrincipalKind {
	if kind == access.GroupPrincipal {
		return model.AccessPrincipalKindGroup
	}

	return model.AccessPrincipalKindUser
}

func incidentRoleFromDomain(role access.Role) model.IncidentRole {
	switch role {
	case access.Owner:
		return model.IncidentRoleOwner
	case access.Manager:
		return model.IncidentRoleManager
	case access.Editor:
		return model.IncidentRoleEditor
	case access.Viewer:
		return model.IncidentRoleViewer
	}

	return model.IncidentRoleViewer
}

func globalRoleToDomain(role model.GlobalRole) access.GlobalRole {
	if role == model.GlobalRoleGroupAdmin {
		return access.GroupAdmin
	}

	return access.SystemAdmin
}

func globalRoleFromDomain(role access.GlobalRole) model.GlobalRole {
	if role == access.GroupAdmin {
		return model.GlobalRoleGroupAdmin
	}

	return model.GlobalRoleSystemAdmin
}
