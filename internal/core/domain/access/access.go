package access

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

type IncidentMode string

const (
	OpenOperational IncidentMode = "open_operational"
	Restricted      IncidentMode = "restricted"
)

type Action string

type GlobalAction string

const (
	IncidentRead         Action = "incident.read"
	IncidentWrite        Action = "incident.write"
	IncidentDelete       Action = "incident.delete"
	IncidentClose        Action = "incident.close"
	IncidentReopen       Action = "incident.reopen"
	IncidentManageAccess Action = "incident.manage_access"
	IncidentLinkParent   Action = "incident.link_parent"
	IncidentUnlinkParent Action = "incident.unlink_parent"
	MessageRead          Action = "message.read"
	MessageWrite         Action = "message.write"
	LayerRead            Action = "layer.read"
	LayerCreate          Action = "layer.create"
	LayerWrite           Action = "layer.write"
	LayerDelete          Action = "layer.delete"
	FeatureWrite         Action = "feature.write"
)

const (
	GroupManage       GlobalAction = "group.manage"
	SystemAdminManage GlobalAction = "system_admin.manage"
)

type Role string

const (
	Owner   Role = "owner"
	Manager Role = "manager"
	Editor  Role = "editor"
	Viewer  Role = "viewer"
)

type PrincipalKind string

const (
	UserPrincipal  PrincipalKind = "user"
	GroupPrincipal PrincipalKind = "group"
)

type Principal struct {
	Kind PrincipalKind `json:"kind"`
	ID   string        `json:"id"`
}

type AccessInitialized struct {
	Mode     IncidentMode `json:"mode"`
	OwnerSub *string      `json:"ownerSub,omitempty"`
}

type RoleGranted struct {
	Principal Principal `json:"principal"`
	Role      Role      `json:"role"`
}

type RoleRevoked struct {
	Principal Principal `json:"principal"`
	Role      Role      `json:"role"`
}

type AccessModeChanged struct {
	Mode IncidentMode `json:"mode"`
}

type IncidentAccess struct {
	root  eventsourcing.Root
	mode  IncidentMode
	roles map[string]map[Role]bool
}

func NewIncidentAccess(id shared.IncidentID) *IncidentAccess {
	a := &IncidentAccess{roles: make(map[string]map[Role]bool)}
	a.root.SetID(uuid.UUID(id))
	eventsourcing.Register(a, AccessInitialized{}, RoleGranted{}, RoleRevoked{}, AccessModeChanged{})
	return a
}

func (a *IncidentAccess) Root() *eventsourcing.Root  { return &a.root }
func (a *IncidentAccess) AggregateType() string      { return "IncidentAccess" }
func (a *IncidentAccess) OwnerIncidentID() uuid.UUID { return a.root.ID() }
func (a *IncidentAccess) Mode() IncidentMode         { return a.mode }
func (a *IncidentAccess) IsOwner(sub string) bool {
	return a.HasRole(Principal{Kind: UserPrincipal, ID: sub}, Owner)
}

func (a *IncidentAccess) HasDirectUserOwner() bool {
	return a.directOwnerCount() > 0
}

func (a *IncidentAccess) HasRole(p Principal, role Role) bool {
	return a.roles[principalKey(p)][role]
}

func (a *IncidentAccess) Initialize(ownerSub *string, mode IncidentMode, actor string, at time.Time) error {
	if !validMode(mode) {
		return fmt.Errorf("%w: invalid access mode", shared.ErrInvalidInput)
	}
	if ownerSub == nil && mode == Restricted {
		return fmt.Errorf("%w: restricted access requires an owner", shared.ErrInvalidInput)
	}
	if ownerSub != nil && strings.TrimSpace(*ownerSub) == "" {
		return fmt.Errorf("%w: owner subject must not be empty", shared.ErrInvalidInput)
	}
	eventsourcing.TrackChange(a, AccessInitialized{Mode: mode, OwnerSub: ownerSub}, at, meta(actor))
	return nil
}

func (a *IncidentAccess) GrantRole(p Principal, role Role, actor string, at time.Time) error {
	if err := validatePrincipal(p); err != nil {
		return err
	}
	if !validRole(role) {
		return fmt.Errorf("%w: invalid incident role", shared.ErrInvalidInput)
	}
	if a.HasRole(p, role) {
		return nil
	}
	eventsourcing.TrackChange(a, RoleGranted{Principal: p, Role: role}, at, meta(actor))
	return nil
}

func (a *IncidentAccess) RevokeRole(p Principal, role Role, actor string, at time.Time) error {
	if err := validatePrincipal(p); err != nil {
		return err
	}
	if !validRole(role) {
		return fmt.Errorf("%w: invalid incident role", shared.ErrInvalidInput)
	}
	if !a.HasRole(p, role) {
		return nil
	}
	if role == Owner && a.directOwnerCount() == 1 {
		return fmt.Errorf("%w: cannot revoke last owner", shared.ErrForbidden)
	}
	eventsourcing.TrackChange(a, RoleRevoked{Principal: p, Role: role}, at, meta(actor))
	return nil
}

func (a *IncidentAccess) ChangeAccessMode(mode IncidentMode, actor string, at time.Time) error {
	if !validMode(mode) {
		return fmt.Errorf("%w: invalid access mode", shared.ErrInvalidInput)
	}
	if a.mode == mode {
		return nil
	}
	if mode == Restricted && a.directOwnerCount() == 0 {
		if err := a.GrantRole(Principal{Kind: UserPrincipal, ID: actor}, Owner, actor, at); err != nil {
			return err
		}
	}
	eventsourcing.TrackChange(a, AccessModeChanged{Mode: mode}, at, meta(actor))
	return nil
}

func (a *IncidentAccess) Transition(e eventsourcing.Event) error {
	switch d := e.Data.(type) {
	case AccessInitialized:
		a.mode = d.Mode
		if d.OwnerSub != nil {
			a.addRole(Principal{Kind: UserPrincipal, ID: *d.OwnerSub}, Owner)
		}
	case RoleGranted:
		a.addRole(d.Principal, d.Role)
	case RoleRevoked:
		delete(a.roles[principalKey(d.Principal)], d.Role)
	case AccessModeChanged:
		a.mode = d.Mode
	default:
		return fmt.Errorf("access.Transition: unhandled event type %T", e.Data)
	}
	return nil
}

func (a *IncidentAccess) directOwnerCount() int {
	count := 0
	for key, roles := range a.roles {
		if roles[Owner] && strings.HasPrefix(key, string(UserPrincipal)+":") {
			count++
		}
	}
	return count
}

func (a *IncidentAccess) addRole(p Principal, role Role) {
	key := principalKey(p)
	if a.roles[key] == nil {
		a.roles[key] = make(map[Role]bool)
	}
	a.roles[key][role] = true
}

func principalKey(p Principal) string  { return string(p.Kind) + ":" + p.ID }
func validMode(mode IncidentMode) bool { return mode == OpenOperational || mode == Restricted }
func validRole(role Role) bool {
	return role == Owner || role == Manager || role == Editor || role == Viewer
}

func validatePrincipal(p Principal) error {
	if p.Kind != UserPrincipal && p.Kind != GroupPrincipal {
		return fmt.Errorf("%w: invalid principal kind", shared.ErrInvalidInput)
	}
	if strings.TrimSpace(p.ID) == "" {
		return fmt.Errorf("%w: principal id must not be empty", shared.ErrInvalidInput)
	}
	return nil
}
func meta(actor string) map[string]any { return map[string]any{"actor": actor} }

type GlobalRole string

const (
	SystemAdmin GlobalRole = "system_admin"
	GroupAdmin  GlobalRole = "group_admin"
)

type (
	GlobalAccessInitialized struct{}
	GlobalRoleGranted       struct {
		Subject string     `json:"subject"`
		Role    GlobalRole `json:"role"`
	}
	GlobalRoleRevoked struct {
		Subject string     `json:"subject"`
		Role    GlobalRole `json:"role"`
	}
)

type GlobalAccess struct {
	root  eventsourcing.Root
	roles map[string]map[GlobalRole]bool
}

var GlobalAccessID = uuid.MustParse("00000000-0000-0000-0000-000000000001")

func NewGlobalAccess() *GlobalAccess {
	a := &GlobalAccess{roles: make(map[string]map[GlobalRole]bool)}
	a.root.SetID(GlobalAccessID)
	eventsourcing.Register(a, GlobalAccessInitialized{}, GlobalRoleGranted{}, GlobalRoleRevoked{})
	return a
}
func (a *GlobalAccess) Root() *eventsourcing.Root                    { return &a.root }
func (a *GlobalAccess) AggregateType() string                        { return "GlobalAccess" }
func (a *GlobalAccess) HasRole(subject string, role GlobalRole) bool { return a.roles[subject][role] }

func (a *GlobalAccess) Initialize(actor string, at time.Time) error {
	eventsourcing.TrackChange(a, GlobalAccessInitialized{}, at, meta(actor))
	return nil
}

func (a *GlobalAccess) GrantRole(subject string, role GlobalRole, actor string, at time.Time) error {
	if strings.TrimSpace(subject) == "" || (role != SystemAdmin && role != GroupAdmin) {
		return fmt.Errorf("%w: invalid global role grant", shared.ErrInvalidInput)
	}
	if a.HasRole(subject, role) {
		return nil
	}
	eventsourcing.TrackChange(a, GlobalRoleGranted{Subject: subject, Role: role}, at, meta(actor))
	return nil
}

func (a *GlobalAccess) RevokeRole(subject string, role GlobalRole, actor string, at time.Time) error {
	if !a.HasRole(subject, role) {
		return nil
	}
	if role == SystemAdmin && a.systemAdminCount() == 1 {
		return fmt.Errorf("%w: cannot revoke last system admin", shared.ErrForbidden)
	}
	eventsourcing.TrackChange(a, GlobalRoleRevoked{Subject: subject, Role: role}, at, meta(actor))
	return nil
}

func (a *GlobalAccess) Transition(e eventsourcing.Event) error {
	switch d := e.Data.(type) {
	case GlobalAccessInitialized:
	case GlobalRoleGranted:
		if a.roles[d.Subject] == nil {
			a.roles[d.Subject] = make(map[GlobalRole]bool)
		}
		a.roles[d.Subject][d.Role] = true
	case GlobalRoleRevoked:
		delete(a.roles[d.Subject], d.Role)
	default:
		return fmt.Errorf("access.Transition: unhandled event type %T", e.Data)
	}
	return nil
}

func (a *GlobalAccess) systemAdminCount() int {
	count := 0
	for _, roles := range a.roles {
		if roles[SystemAdmin] {
			count++
		}
	}
	return count
}
