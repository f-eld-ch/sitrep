package projection

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

type AccessHandler struct{ pool *pgxpool.Pool }

func NewAccessHandler(pool *pgxpool.Pool) *AccessHandler { return &AccessHandler{pool: pool} }
func (h *AccessHandler) Name() string                    { return "rm_access" }
func (h *AccessHandler) Version() int                    { return 1 }
func (h *AccessHandler) HaltOnError() bool               { return true }
func (h *AccessHandler) Handles(streamType, _ string) bool {
	return streamType == "IncidentAccess" || streamType == "AccessGroup" || streamType == "GlobalAccess"
}

func (h *AccessHandler) Reset(ctx context.Context) error {
	_, err := h.pool.Exec(
		ctx,
		`TRUNCATE rm_access_policy, rm_global_access, rm_access_group_member, rm_access_group, rm_incident_access_mode, rm_incident_access`,
	)
	return err
}

func (h *AccessHandler) Apply(ctx context.Context, e eventsourcing.Event) error {
	tx, ok := pgxTxFromCtx(ctx)
	if !ok {
		return fmt.Errorf("rm_access: no transaction in context")
	}

	switch e.StreamType {
	case "IncidentAccess":
		if err := h.applyIncident(ctx, tx, e); err != nil {
			return err
		}
	case "AccessGroup":
		if err := h.applyGroup(ctx, tx, e); err != nil {
			return err
		}
	case "GlobalAccess":
		if err := h.applyGlobal(ctx, tx, e); err != nil {
			return err
		}
	default:
		return nil
	}
	return h.rebuildPolicies(ctx, tx)
}

func (h *AccessHandler) applyIncident(ctx context.Context, tx pgx.Tx, e eventsourcing.Event) error {
	// The concrete transaction type is intentionally hidden behind the shared exec helper.
	switch e.EventType {
	case "AccessInitialized":
		var d struct {
			Mode     access.IncidentMode `json:"mode"`
			OwnerSub *string             `json:"ownerSub"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		if err := exec(
			tx,
			ctx,
			`INSERT INTO rm_incident_access_mode (incident_id, mode) VALUES ($1, $2) ON CONFLICT (incident_id) DO UPDATE SET mode = EXCLUDED.mode`,
			e.StreamID,
			d.Mode,
		); err != nil {
			return err
		}
		if d.OwnerSub != nil {
			return exec(
				tx,
				ctx,
				`INSERT INTO rm_incident_access (incident_id, principal_kind, principal_id, role, granted_at, granted_by) VALUES ($1, 'user', $2, 'owner', $3, $4) ON CONFLICT (incident_id, principal_kind, principal_id, role) DO NOTHING`,
				e.StreamID,
				*d.OwnerSub,
				e.OccurredAt,
				actorFrom(e),
			)
		}
	case "AccessModeChanged":
		var d access.AccessModeChanged
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		return exec(tx, ctx, `UPDATE rm_incident_access_mode SET mode = $2 WHERE incident_id = $1`, e.StreamID, d.Mode)
	case "RoleGranted":
		var d access.RoleGranted
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		return exec(
			tx,
			ctx,
			`INSERT INTO rm_incident_access (incident_id, principal_kind, principal_id, role, granted_at, granted_by) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (incident_id, principal_kind, principal_id, role) DO UPDATE SET revoked_at = NULL, revoked_by = NULL`,
			e.StreamID,
			d.Principal.Kind,
			d.Principal.ID,
			d.Role,
			e.OccurredAt,
			actorFrom(e),
		)
	case "RoleRevoked":
		var d access.RoleRevoked
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		return exec(
			tx,
			ctx,
			`UPDATE rm_incident_access SET revoked_at = $5, revoked_by = $6 WHERE incident_id = $1 AND principal_kind = $2 AND principal_id = $3 AND role = $4`,
			e.StreamID,
			d.Principal.Kind,
			d.Principal.ID,
			d.Role,
			e.OccurredAt,
			actorFrom(e),
		)
	}
	return nil
}

func (h *AccessHandler) applyGroup(ctx context.Context, tx pgx.Tx, e eventsourcing.Event) error {
	switch e.EventType {
	case "GroupCreated":
		var d access.GroupCreated
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		return exec(
			tx,
			ctx,
			`INSERT INTO rm_access_group (id, name, description, created_at, updated_at) VALUES ($1, $2, $3, $4, $4) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, updated_at = EXCLUDED.updated_at`,
			e.StreamID,
			d.Name,
			d.Description,
			e.OccurredAt,
		)
	case "GroupRenamed":
		var d access.GroupRenamed
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		return exec(
			tx,
			ctx,
			`UPDATE rm_access_group SET name = $2, updated_at = $3 WHERE id = $1`,
			e.StreamID,
			d.Name,
			e.OccurredAt,
		)
	case "GroupArchived":
		return exec(
			tx,
			ctx,
			`UPDATE rm_access_group SET archived_at = $2, updated_at = $2 WHERE id = $1`,
			e.StreamID,
			e.OccurredAt,
		)
	case "GroupMemberAdded":
		var d access.GroupMemberAdded
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		return exec(
			tx,
			ctx,
			`INSERT INTO rm_access_group_member (group_id, subject, added_at, added_by) VALUES ($1, $2, $3, $4) ON CONFLICT (group_id, subject) DO UPDATE SET removed_at = NULL, removed_by = NULL`,
			e.StreamID,
			d.Subject,
			e.OccurredAt,
			actorFrom(e),
		)
	case "GroupMemberRemoved":
		var d access.GroupMemberRemoved
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		return exec(
			tx,
			ctx,
			`UPDATE rm_access_group_member SET removed_at = $3, removed_by = $4 WHERE group_id = $1 AND subject = $2`,
			e.StreamID,
			d.Subject,
			e.OccurredAt,
			actorFrom(e),
		)
	}
	return nil
}

func (h *AccessHandler) applyGlobal(ctx context.Context, tx pgx.Tx, e eventsourcing.Event) error {
	switch e.EventType {
	case "GlobalRoleGranted":
		var d access.GlobalRoleGranted
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		return exec(
			tx,
			ctx,
			`INSERT INTO rm_global_access (subject, role, granted_at, granted_by) VALUES ($1, $2, $3, $4) ON CONFLICT (subject, role) DO UPDATE SET revoked_at = NULL, revoked_by = NULL`,
			d.Subject,
			d.Role,
			e.OccurredAt,
			actorFrom(e),
		)
	case "GlobalRoleRevoked":
		var d access.GlobalRoleRevoked
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}
		return exec(
			tx,
			ctx,
			`UPDATE rm_global_access SET revoked_at = $3, revoked_by = $3 WHERE subject = $1 AND role = $2`,
			d.Subject,
			d.Role,
			e.OccurredAt,
		)
	}
	return nil
}

func (h *AccessHandler) rebuildPolicies(ctx context.Context, tx pgx.Tx) error {
	if err := exec(tx, ctx, `TRUNCATE rm_access_policy`); err != nil {
		return err
	}
	return exec(tx, ctx, `
INSERT INTO rm_access_policy (subject, domain, object, action)
SELECT 'user:' || a.principal_id, 'incident:' || a.incident_id, p.object, p.action
FROM rm_incident_access a
JOIN rm_incident_access_mode m ON m.incident_id = a.incident_id AND m.mode = 'restricted'
JOIN (VALUES
 ('owner','incident','incident.read'), ('owner','incident','incident.write'), ('owner','incident','incident.delete'),
 ('owner','incident','incident.close'), ('owner','incident','incident.reopen'), ('owner','incident','incident.manage_access'),
 ('owner','incident','incident.link_parent'), ('owner','incident','incident.unlink_parent'), ('owner','message','message.read'),
 ('owner','message','message.write'), ('owner','layer','layer.read'), ('owner','layer','layer.create'),
 ('owner','layer','layer.write'), ('owner','layer','layer.delete'), ('owner','feature','feature.write'),
 ('manager','incident','incident.read'), ('manager','incident','incident.write'), ('manager','incident','incident.close'),
 ('manager','incident','incident.reopen'), ('manager','incident','incident.manage_access'), ('manager','message','message.read'),
 ('manager','message','message.write'), ('manager','layer','layer.read'), ('manager','layer','layer.create'),
 ('manager','layer','layer.write'), ('manager','layer','layer.delete'), ('manager','feature','feature.write'),
 ('editor','incident','incident.read'), ('editor','incident','incident.write'), ('editor','message','message.read'),
 ('editor','message','message.write'), ('editor','layer','layer.read'), ('editor','layer','layer.create'),
 ('editor','layer','layer.write'), ('editor','layer','layer.delete'), ('editor','feature','feature.write'),
 ('viewer','incident','incident.read'), ('viewer','message','message.read'), ('viewer','layer','layer.read')
) AS p(role, object, action) ON p.role = a.role
WHERE a.revoked_at IS NULL AND a.principal_kind = 'user'
ON CONFLICT DO NOTHING;

INSERT INTO rm_access_policy (subject, domain, object, action)
SELECT 'user:' || gm.subject, 'incident:' || a.incident_id, p.object, p.action
FROM rm_incident_access a
JOIN rm_incident_access_mode m ON m.incident_id = a.incident_id AND m.mode = 'restricted'
JOIN rm_access_group_member gm ON gm.group_id::text = a.principal_id AND gm.removed_at IS NULL
JOIN rm_access_group g ON g.id = gm.group_id AND g.archived_at IS NULL
JOIN (VALUES
 ('owner','incident','incident.read'), ('owner','incident','incident.write'), ('owner','incident','incident.delete'), ('owner','incident','incident.close'), ('owner','incident','incident.reopen'), ('owner','incident','incident.manage_access'), ('owner','incident','incident.link_parent'), ('owner','incident','incident.unlink_parent'), ('owner','message','message.read'), ('owner','message','message.write'), ('owner','layer','layer.read'), ('owner','layer','layer.create'), ('owner','layer','layer.write'), ('owner','layer','layer.delete'), ('owner','feature','feature.write'),
 ('manager','incident','incident.read'), ('manager','incident','incident.write'), ('manager','incident','incident.close'), ('manager','incident','incident.reopen'), ('manager','incident','incident.manage_access'), ('manager','message','message.read'), ('manager','message','message.write'), ('manager','layer','layer.read'), ('manager','layer','layer.create'), ('manager','layer','layer.write'), ('manager','layer','layer.delete'), ('manager','feature','feature.write'),
 ('editor','incident','incident.read'), ('editor','incident','incident.write'), ('editor','message','message.read'), ('editor','message','message.write'), ('editor','layer','layer.read'), ('editor','layer','layer.create'), ('editor','layer','layer.write'), ('editor','layer','layer.delete'), ('editor','feature','feature.write'),
 ('viewer','incident','incident.read'), ('viewer','message','message.read'), ('viewer','layer','layer.read')
) AS p(role, object, action) ON p.role = a.role
WHERE a.revoked_at IS NULL AND a.principal_kind = 'group'
ON CONFLICT DO NOTHING;

INSERT INTO rm_access_policy (subject, domain, object, action)
SELECT 'user:' || subject, 'global', CASE role WHEN 'system_admin' THEN 'system_admin' ELSE 'group' END, CASE role WHEN 'system_admin' THEN 'system_admin.manage' ELSE 'group.manage' END
FROM rm_global_access WHERE revoked_at IS NULL`)
}

func actorFrom(e eventsourcing.Event) string {
	if actor, ok := e.Metadata["actor"].(string); ok {
		return actor
	}
	return "system:projection"
}
