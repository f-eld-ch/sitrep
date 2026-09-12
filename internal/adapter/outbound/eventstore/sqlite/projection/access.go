package projection

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/f-eld-ch/sitrep/internal/adapter/outbound/helpers/sqlite"
	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/eventsourcing"
)

var _ Handler = (*AccessHandler)(nil)

// AccessHandler maintains the access read-model tables and the policy cache.
// It halts on error because partial access state silently grants or denies.
type AccessHandler struct{ db *sql.DB }

func NewAccessHandler(db *sql.DB) *AccessHandler { return &AccessHandler{db: db} }

func (h *AccessHandler) Name() string      { return "readmodel.access" }
func (h *AccessHandler) Version() int      { return 4 }
func (h *AccessHandler) HaltOnError() bool { return true }
func (h *AccessHandler) Handles(st, _ string) bool {
	return st == "IncidentAccess" || st == "AccessGroup" || st == "GlobalAccess"
}

func (h *AccessHandler) Reset(ctx context.Context) error {
	for _, q := range []string{
		`DELETE FROM readmodel_access_policy`,
		`DELETE FROM readmodel_global_access`,
		`DELETE FROM readmodel_access_group_member`,
		`DELETE FROM readmodel_access_group`,
		`DELETE FROM readmodel_incident_access_mode`,
		`DELETE FROM readmodel_incident_access`,
	} {
		if _, err := h.db.ExecContext(ctx, q); err != nil {
			return err
		}
	}

	return nil
}

func (h *AccessHandler) Apply(ctx context.Context, e eventsourcing.Event) error {
	tx, ok := txFromCtx(ctx)
	if !ok {
		return fmt.Errorf("access: no transaction in context")
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

func (h *AccessHandler) applyIncident(ctx context.Context, tx *sql.Tx, e eventsourcing.Event) error {
	switch e.EventType {
	case "AccessInitialized":
		var d struct {
			Mode     access.IncidentMode `json:"mode"`
			OwnerSub *string             `json:"ownerSub"`
		}
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		if err := exec(tx, ctx, `
			INSERT INTO readmodel_incident_access_mode (incident_id, mode) VALUES (?, ?)
			ON CONFLICT (incident_id) DO UPDATE SET mode = excluded.mode`,
			e.StreamID.String(), d.Mode,
		); err != nil {
			return err
		}

		if d.OwnerSub != nil {
			return exec(tx, ctx, `
				INSERT INTO readmodel_incident_access
				  (incident_id, principal_kind, principal_id, role, granted_at, granted_by)
				VALUES (?, 'user', ?, 'owner', ?, ?)
				ON CONFLICT (incident_id, principal_kind, principal_id, role) DO NOTHING`,
				e.StreamID.String(), *d.OwnerSub,
				sqlite.FormatTime(e.OccurredAt), actorFrom(e),
			)
		}

	case "AccessModeChanged":
		var d access.AccessModeChanged
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(tx, ctx, `UPDATE readmodel_incident_access_mode SET mode = ? WHERE incident_id = ?`,
			d.Mode, e.StreamID.String())

	case "RoleGranted":
		var d access.RoleGranted
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(tx, ctx, `
			INSERT INTO readmodel_incident_access
			  (incident_id, principal_kind, principal_id, role, granted_at, granted_by)
			VALUES (?, ?, ?, ?, ?, ?)
			ON CONFLICT (incident_id, principal_kind, principal_id, role) DO UPDATE
			  SET revoked_at = NULL, revoked_by = NULL`,
			e.StreamID.String(), d.Principal.Kind, d.Principal.ID, d.Role,
			sqlite.FormatTime(e.OccurredAt), actorFrom(e),
		)

	case "RoleRevoked":
		var d access.RoleRevoked
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(tx, ctx, `
			UPDATE readmodel_incident_access
			SET revoked_at = ?, revoked_by = ?
			WHERE incident_id = ? AND principal_kind = ? AND principal_id = ? AND role = ?`,
			sqlite.FormatTime(e.OccurredAt), actorFrom(e),
			e.StreamID.String(), d.Principal.Kind, d.Principal.ID, d.Role,
		)
	}

	return nil
}

func (h *AccessHandler) applyGroup(ctx context.Context, tx *sql.Tx, e eventsourcing.Event) error {
	switch e.EventType {
	case "GroupCreated":
		var d access.GroupCreated
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		now := sqlite.FormatTime(e.OccurredAt)

		return exec(tx, ctx, `
			INSERT INTO readmodel_access_group (id, name, description, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?)
			ON CONFLICT (id) DO UPDATE
			  SET name = excluded.name, description = excluded.description, updated_at = excluded.updated_at`,
			e.StreamID.String(), d.Name, d.Description, now, now)

	case "GroupRenamed":
		var d access.GroupRenamed
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(tx, ctx, `UPDATE readmodel_access_group SET name = ?, updated_at = ? WHERE id = ?`,
			d.Name, sqlite.FormatTime(e.OccurredAt), e.StreamID.String())

	case "GroupDescriptionChanged":
		var d access.GroupDescriptionChanged
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(tx, ctx, `UPDATE readmodel_access_group SET description = ?, updated_at = ? WHERE id = ?`,
			d.Description, sqlite.FormatTime(e.OccurredAt), e.StreamID.String())

	case "GroupArchived":
		now := sqlite.FormatTime(e.OccurredAt)

		return exec(tx, ctx, `UPDATE readmodel_access_group SET archived_at = ?, updated_at = ? WHERE id = ?`,
			now, now, e.StreamID.String())

	case "GroupMemberAdded":
		var d access.GroupMemberAdded
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(tx, ctx, `
			INSERT INTO readmodel_access_group_member (group_id, subject, added_at, added_by)
			VALUES (?, ?, ?, ?)
			ON CONFLICT (group_id, subject) DO UPDATE SET removed_at = NULL, removed_by = NULL`,
			e.StreamID.String(), d.Subject, sqlite.FormatTime(e.OccurredAt), actorFrom(e))

	case "GroupMemberRemoved":
		var d access.GroupMemberRemoved
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(tx, ctx, `
			UPDATE readmodel_access_group_member SET removed_at = ?, removed_by = ?
			WHERE group_id = ? AND subject = ?`,
			sqlite.FormatTime(e.OccurredAt), actorFrom(e), e.StreamID.String(), d.Subject)
	}

	return nil
}

func (h *AccessHandler) applyGlobal(ctx context.Context, tx *sql.Tx, e eventsourcing.Event) error {
	switch e.EventType {
	case "GlobalRoleGranted":
		var d access.GlobalRoleGranted
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(tx, ctx, `
			INSERT INTO readmodel_global_access (subject, role, granted_at, granted_by)
			VALUES (?, ?, ?, ?)
			ON CONFLICT (subject, role) DO UPDATE SET revoked_at = NULL, revoked_by = NULL`,
			d.Subject, d.Role, sqlite.FormatTime(e.OccurredAt), actorFrom(e))

	case "GlobalRoleRevoked":
		var d access.GlobalRoleRevoked
		if err := remarshal(e.Data, &d); err != nil {
			return err
		}

		return exec(tx, ctx, `
			UPDATE readmodel_global_access SET revoked_at = ?, revoked_by = ?
			WHERE subject = ? AND role = ?`,
			sqlite.FormatTime(e.OccurredAt), actorFrom(e), d.Subject, d.Role)
	}

	return nil
}

// rebuildPolicies recomputes the full policy cache from the current access
// tables. Each INSERT OR IGNORE block mirrors one of the four Postgres INSERT
// statements in postgres/projection/access.go. The role→(object,action) table
// is embedded as a CTE so no VALUES aliasing is needed.
//
// 'all' grants: no mode join (applies in both open and restricted modes).
// viewer/editor only — 'all'+'owner' produces nothing (correct Postgres behaviour).
func (h *AccessHandler) rebuildPolicies(ctx context.Context, tx *sql.Tx) error {
	if err := exec(tx, ctx, `DELETE FROM readmodel_access_policy`); err != nil {
		return err
	}

	// Block 1: direct user grants.
	if err := exec(tx, ctx, `
		WITH roles(role, obj, act) AS (VALUES
		  ('owner','incident','incident.read'),    ('owner','incident','incident.write'),
		  ('owner','incident','incident.delete'),  ('owner','incident','incident.close'),
		  ('owner','incident','incident.reopen'),  ('owner','incident','incident.manage_access'),
		  ('owner','incident','incident.link_parent'), ('owner','incident','incident.unlink_parent'),
		  ('owner','message','message.read'),      ('owner','message','message.write'),
		  ('owner','layer','layer.read'),          ('owner','layer','layer.create'),
		  ('owner','layer','layer.write'),         ('owner','layer','layer.delete'),
		  ('owner','feature','feature.write'),
		  ('manager','incident','incident.read'),  ('manager','incident','incident.write'),
		  ('manager','incident','incident.close'), ('manager','incident','incident.reopen'),
		  ('manager','incident','incident.manage_access'),
		  ('manager','incident','incident.link_parent'), ('manager','incident','incident.unlink_parent'),
		  ('manager','message','message.read'),    ('manager','message','message.write'),
		  ('manager','layer','layer.read'),        ('manager','layer','layer.create'),
		  ('manager','layer','layer.write'),       ('manager','layer','layer.delete'),
		  ('manager','feature','feature.write'),
		  ('editor','incident','incident.read'),   ('editor','incident','incident.write'),
		  ('editor','incident','incident.link_parent'), ('editor','incident','incident.unlink_parent'),
		  ('editor','message','message.read'),     ('editor','message','message.write'),
		  ('editor','layer','layer.read'),         ('editor','layer','layer.create'),
		  ('editor','layer','layer.write'),        ('editor','layer','layer.delete'),
		  ('editor','feature','feature.write'),
		  ('viewer','incident','incident.read'),   ('viewer','message','message.read'),
		  ('viewer','layer','layer.read')
		)
		INSERT OR IGNORE INTO readmodel_access_policy (subject, domain, object, action)
		SELECT 'user:' || a.principal_id,
		       'incident:' || a.incident_id,
		       p.obj,
		       p.act
		  FROM readmodel_incident_access a
		  JOIN readmodel_incident_access_mode m ON m.incident_id = a.incident_id
		  JOIN roles p ON p.role = a.role
		 WHERE a.revoked_at IS NULL
		   AND a.principal_kind = 'user'
		   AND (m.mode = 'restricted' OR p.act = 'incident.delete')`); err != nil {
		return err
	}

	// Block 2: group member grants.
	if err := exec(tx, ctx, `
		WITH roles(role, obj, act) AS (VALUES
		  ('owner','incident','incident.read'),    ('owner','incident','incident.write'),
		  ('owner','incident','incident.delete'),  ('owner','incident','incident.close'),
		  ('owner','incident','incident.reopen'),  ('owner','incident','incident.manage_access'),
		  ('owner','incident','incident.link_parent'), ('owner','incident','incident.unlink_parent'),
		  ('owner','message','message.read'),      ('owner','message','message.write'),
		  ('owner','layer','layer.read'),          ('owner','layer','layer.create'),
		  ('owner','layer','layer.write'),         ('owner','layer','layer.delete'),
		  ('owner','feature','feature.write'),
		  ('manager','incident','incident.read'),  ('manager','incident','incident.write'),
		  ('manager','incident','incident.close'), ('manager','incident','incident.reopen'),
		  ('manager','incident','incident.manage_access'),
		  ('manager','incident','incident.link_parent'), ('manager','incident','incident.unlink_parent'),
		  ('manager','message','message.read'),    ('manager','message','message.write'),
		  ('manager','layer','layer.read'),        ('manager','layer','layer.create'),
		  ('manager','layer','layer.write'),       ('manager','layer','layer.delete'),
		  ('manager','feature','feature.write'),
		  ('editor','incident','incident.read'),   ('editor','incident','incident.write'),
		  ('editor','incident','incident.link_parent'), ('editor','incident','incident.unlink_parent'),
		  ('editor','message','message.read'),     ('editor','message','message.write'),
		  ('editor','layer','layer.read'),         ('editor','layer','layer.create'),
		  ('editor','layer','layer.write'),        ('editor','layer','layer.delete'),
		  ('editor','feature','feature.write'),
		  ('viewer','incident','incident.read'),   ('viewer','message','message.read'),
		  ('viewer','layer','layer.read')
		)
		INSERT OR IGNORE INTO readmodel_access_policy (subject, domain, object, action)
		SELECT 'user:' || gm.subject,
		       'incident:' || a.incident_id,
		       p.obj,
		       p.act
		  FROM readmodel_incident_access a
		  JOIN readmodel_incident_access_mode m ON m.incident_id = a.incident_id
		  JOIN readmodel_access_group_member gm ON gm.group_id = a.principal_id AND gm.removed_at IS NULL
		  JOIN readmodel_access_group g ON g.id = gm.group_id AND g.archived_at IS NULL
		  JOIN roles p ON p.role = a.role
		 WHERE a.revoked_at IS NULL
		   AND a.principal_kind = 'group'
		   AND (m.mode = 'restricted' OR p.act = 'incident.delete')`); err != nil {
		return err
	}

	// Block 3: global grants.
	if err := exec(tx, ctx, `
		WITH roles(role, obj, act) AS (VALUES
		  ('system_admin','system_admin','system_admin.manage'),
		  ('system_admin','group','group.manage'),
		  ('group_admin','group','group.manage')
		)
		INSERT OR IGNORE INTO readmodel_access_policy (subject, domain, object, action)
		SELECT 'user:' || a.subject,
		       'global',
		       p.obj,
		       p.act
		  FROM readmodel_global_access a
		  JOIN roles p ON p.role = a.role
		 WHERE a.revoked_at IS NULL`); err != nil {
		return err
	}

	// Block 4: 'all' grants — no mode restriction, viewer/editor only.
	return exec(tx, ctx, `
		WITH roles(role, obj, act) AS (VALUES
		  ('viewer','incident','incident.read'),   ('viewer','message','message.read'),
		  ('viewer','layer','layer.read'),
		  ('editor','incident','incident.read'),   ('editor','incident','incident.write'),
		  ('editor','message','message.read'),     ('editor','message','message.write'),
		  ('editor','layer','layer.read'),         ('editor','layer','layer.create'),
		  ('editor','layer','layer.write'),        ('editor','layer','layer.delete'),
		  ('editor','feature','feature.write')
		)
		INSERT OR IGNORE INTO readmodel_access_policy (subject, domain, object, action)
		SELECT 'all',
		       'incident:' || a.incident_id,
		       p.obj,
		       p.act
		  FROM readmodel_incident_access a
		  JOIN roles p ON p.role = a.role
		 WHERE a.revoked_at IS NULL AND a.principal_kind = 'all'`)
}

func actorFrom(e eventsourcing.Event) string {
	if actor, ok := e.Metadata["actor"].(string); ok {
		return actor
	}

	return "system:projection"
}
