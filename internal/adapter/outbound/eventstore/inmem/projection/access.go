package projection

import (
	"context"
	"fmt"
	"sync"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

type AccessPolicyRow struct {
	Subject string
	Domain  string
	Object  string
	Action  string
}

type IncidentGrantRow struct {
	IncidentID    uuid.UUID
	PrincipalKind access.PrincipalKind
	PrincipalID   string
	Role          access.Role
}

type AccessHandler struct {
	mu       sync.RWMutex
	grants   map[string]access.Role
	groups   map[uuid.UUID]*groupProjection
	global   map[string]map[access.GlobalRole]bool
	modes    map[uuid.UUID]access.IncidentMode
	policies map[string]AccessPolicyRow
}

type groupProjection struct {
	name        string
	description string
	archived    bool
	members     map[string]bool
}

func NewAccessHandler() *AccessHandler {
	return &AccessHandler{
		grants:   make(map[string]access.Role),
		groups:   make(map[uuid.UUID]*groupProjection),
		global:   make(map[string]map[access.GlobalRole]bool),
		modes:    make(map[uuid.UUID]access.IncidentMode),
		policies: make(map[string]AccessPolicyRow),
	}
}

func (h *AccessHandler) Name() string { return "rm_access" }
func (h *AccessHandler) Version() int { return 1 }
func (h *AccessHandler) Handles(st, _ string) bool {
	return st == "IncidentAccess" || st == "AccessGroup" || st == "GlobalAccess"
}

func (h *AccessHandler) Reset(_ context.Context) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	h.grants = make(map[string]access.Role)
	h.groups = make(map[uuid.UUID]*groupProjection)
	h.global = make(map[string]map[access.GlobalRole]bool)
	h.modes = make(map[uuid.UUID]access.IncidentMode)
	h.policies = make(map[string]AccessPolicyRow)

	return nil
}

func (h *AccessHandler) Apply(_ context.Context, e eventsourcing.Event) error {
	h.mu.Lock()
	defer h.mu.Unlock()

	switch e.StreamType {
	case "IncidentAccess":
		return h.applyIncident(e)
	case "AccessGroup":
		return h.applyGroup(e)
	case "GlobalAccess":
		return h.applyGlobal(e)
	default:
		return nil
	}
}

func (h *AccessHandler) applyIncident(e eventsourcing.Event) error {
	switch e.EventType {
	case "AccessInitialized":
		var d access.AccessInitialized
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		h.modes[e.StreamID] = d.Mode
		if d.OwnerSub != nil {
			h.grants[grantKey(e.StreamID, access.UserPrincipal, *d.OwnerSub, access.Owner)] = access.Owner
		}
	case "RoleGranted":
		var d access.RoleGranted
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		h.grants[grantKey(e.StreamID, d.Principal.Kind, d.Principal.ID, d.Role)] = d.Role
	case "RoleRevoked":
		var d access.RoleRevoked
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		delete(h.grants, grantKey(e.StreamID, d.Principal.Kind, d.Principal.ID, d.Role))
	case "AccessModeChanged":
		var d access.AccessModeChanged
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		h.modes[e.StreamID] = d.Mode
	default:
		return fmt.Errorf("rm_access: unhandled incident event %q", e.EventType)
	}

	h.recompute()

	return nil
}

func (h *AccessHandler) applyGroup(e eventsourcing.Event) error {
	g := h.groups[e.StreamID]
	if g == nil {
		g = &groupProjection{members: make(map[string]bool)}
		h.groups[e.StreamID] = g
	}

	switch e.EventType {
	case "GroupCreated":
		var d access.GroupCreated
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		g.name = d.Name
		g.description = d.Description
	case "GroupRenamed":
		var d access.GroupRenamed
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		g.name = d.Name
	case "GroupArchived":
		g.archived = true
	case "GroupMemberAdded":
		var d access.GroupMemberAdded
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		g.members[d.Subject] = true

	case "GroupMemberRemoved":
		var d access.GroupMemberRemoved
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		delete(g.members, d.Subject)

	default:
		return fmt.Errorf("rm_access: unhandled group event %q", e.EventType)
	}

	h.recompute()

	return nil
}

func (h *AccessHandler) applyGlobal(e eventsourcing.Event) error {
	roles := h.global[e.StreamID.String()]
	if roles == nil {
		roles = make(map[access.GlobalRole]bool)
		h.global[e.StreamID.String()] = roles
	}

	switch e.EventType {
	case "GlobalAccessInitialized":
	case "GlobalRoleGranted":
		var d access.GlobalRoleGranted
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		if h.global[d.Subject] == nil {
			h.global[d.Subject] = make(map[access.GlobalRole]bool)
		}

		h.global[d.Subject][d.Role] = true
	case "GlobalRoleRevoked":
		var d access.GlobalRoleRevoked
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		delete(h.global[d.Subject], d.Role)
	default:
		return fmt.Errorf("rm_access: unhandled global event %q", e.EventType)
	}

	h.recompute()

	return nil
}

func (h *AccessHandler) recompute() {
	h.policies = make(map[string]AccessPolicyRow)
	for key, role := range h.grants {
		incidentID, kind, subject, _ := parseGrantKey(key)
		for _, action := range actionsForMode(role, h.modes[incidentID]) {
			h.addPolicy("user:"+subject, "incident:"+incidentID.String(), string(action))
		}

		if kind == access.GroupPrincipal {
			groupID, err := uuid.Parse(subject)
			if err != nil {
				continue
			}

			if group := h.groups[groupID]; group != nil && !group.archived {
				for member := range group.members {
					for _, action := range actionsForMode(role, h.modes[incidentID]) {
						h.addPolicy("user:"+member, "incident:"+incidentID.String(), string(action))
					}
				}
			}
		}
	}

	for subject, roles := range h.global {
		for role := range roles {
			for _, action := range globalActions(role) {
				h.addPolicy("user:"+subject, "global", string(action))
			}
		}
	}
}

func actionsForMode(role access.Role, mode access.IncidentMode) []access.Action {
	if mode != access.OpenOperational {
		return incidentActions(role)
	}

	return []access.Action{IncidentManageAccess}
}

func (h *AccessHandler) addPolicy(subject, domain, action string) {
	row := AccessPolicyRow{Subject: subject, Domain: domain, Object: objectForAction(action), Action: action}
	h.policies[policyKey(row)] = row
}

func (h *AccessHandler) Policies() []AccessPolicyRow {
	h.mu.RLock()
	defer h.mu.RUnlock()

	rows := make([]AccessPolicyRow, 0, len(h.policies))
	for _, row := range h.policies {
		rows = append(rows, row)
	}

	return rows
}

func (h *AccessHandler) Mode(incidentID uuid.UUID) access.IncidentMode {
	h.mu.RLock()
	defer h.mu.RUnlock()

	return h.modes[incidentID]
}

func (h *AccessHandler) IncidentGrants(incidentID uuid.UUID) []IncidentGrantRow {
	h.mu.RLock()
	defer h.mu.RUnlock()

	var rows []IncidentGrantRow

	for key, role := range h.grants {
		id, kind, subject, _ := parseGrantKey(key)
		if id == incidentID {
			rows = append(rows, IncidentGrantRow{IncidentID: id, PrincipalKind: kind, PrincipalID: subject, Role: role})
		}
	}

	return rows
}

func (h *AccessHandler) Groups() map[uuid.UUID]struct {
	Name        string
	Description string
	Archived    bool
	Members     []string
} {
	h.mu.RLock()
	defer h.mu.RUnlock()

	result := make(map[uuid.UUID]struct {
		Name        string
		Description string
		Archived    bool
		Members     []string
	}, len(h.groups))
	for id, group := range h.groups {
		members := make([]string, 0, len(group.members))

		for subject := range group.members {
			members = append(members, subject)
		}

		result[id] = struct {
			Name        string
			Description string
			Archived    bool
			Members     []string
		}{
			Name:        group.name,
			Description: group.description,
			Archived:    group.archived,
			Members:     members,
		}
	}

	return result
}

func grantKey(id uuid.UUID, kind access.PrincipalKind, subject string, role access.Role) string {
	return id.String() + "|" + string(kind) + "|" + subject + "|" + string(role)
}

func parseGrantKey(key string) (uuid.UUID, access.PrincipalKind, string, access.Role) {
	var (
		id      uuid.UUID
		kind    access.PrincipalKind
		subject string
		role    access.Role
	)

	_, _ = fmt.Sscanf(key, "%s", &subject)

	parts := split(key, '|')
	if len(parts) == 4 {
		id, _ = uuid.Parse(parts[0])
		kind = access.PrincipalKind(parts[1])
		subject = parts[2]
		role = access.Role(parts[3])
	}

	return id, kind, subject, role
}

func split(value string, sep byte) []string {
	var out []string

	start := 0

	for i := range value {
		if value[i] == sep {
			out = append(out, value[start:i])
			start = i + 1
		}
	}

	return append(out, value[start:])
}

func policyKey(row AccessPolicyRow) string {
	return row.Subject + "|" + row.Domain + "|" + row.Object + "|" + row.Action
}

func objectForAction(action string) string {
	if i := lastDot(action); i >= 0 {
		return action[:i]
	}

	return action
}

func lastDot(value string) int {
	for i := len(value) - 1; i >= 0; i-- {
		if value[i] == '.' {
			return i
		}
	}

	return -1
}

func incidentActions(role access.Role) []access.Action {
	switch role {
	case access.Owner:
		return []access.Action{
			IncidentRead,
			IncidentWrite,
			IncidentDelete,
			IncidentClose,
			IncidentReopen,
			IncidentManageAccess,
			IncidentLinkParent,
			IncidentUnlinkParent,
			MessageRead,
			MessageWrite,
			LayerRead,
			LayerCreate,
			LayerWrite,
			LayerDelete,
			FeatureWrite,
		}
	case access.Manager:
		return []access.Action{
			IncidentRead,
			IncidentWrite,
			IncidentClose,
			IncidentReopen,
			IncidentManageAccess,
			MessageRead,
			MessageWrite,
			LayerRead,
			LayerCreate,
			LayerWrite,
			LayerDelete,
			FeatureWrite,
		}
	case access.Editor:
		return []access.Action{
			IncidentRead,
			IncidentWrite,
			MessageRead,
			MessageWrite,
			LayerRead,
			LayerCreate,
			LayerWrite,
			LayerDelete,
			FeatureWrite,
		}
	case access.Viewer:
		return []access.Action{IncidentRead, MessageRead, LayerRead}
	}

	return nil
}

func globalActions(role access.GlobalRole) []access.GlobalAction {
	switch role {
	case access.SystemAdmin:
		return []access.GlobalAction{access.GroupManage, access.SystemAdminManage}
	case access.GroupAdmin:
		return []access.GlobalAction{access.GroupManage}
	}

	return nil
}

var (
	IncidentRead                 = access.IncidentRead
	IncidentWrite                = access.IncidentWrite
	IncidentDelete               = access.IncidentDelete
	IncidentClose                = access.IncidentClose
	IncidentReopen               = access.IncidentReopen
	IncidentManageAccess         = access.IncidentManageAccess
	IncidentLinkParent           = access.IncidentLinkParent
	IncidentUnlinkParent         = access.IncidentUnlinkParent
	MessageRead                  = access.MessageRead
	MessageWrite                 = access.MessageWrite
	LayerRead                    = access.LayerRead
	LayerCreate                  = access.LayerCreate
	LayerWrite                   = access.LayerWrite
	LayerDelete                  = access.LayerDelete
	FeatureWrite                 = access.FeatureWrite
	_                    Handler = (*AccessHandler)(nil)
)
