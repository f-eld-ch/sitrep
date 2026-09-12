package sqlite

import (
	"context"
	"database/sql"
	"errors"

	"github.com/google/uuid"

	sqlite "github.com/f-eld-ch/sitrep/internal/adapter/outbound/helpers/sqlite"
	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

var _ outbound.AccessQueries = (*AccessQueries)(nil)

// AccessQueries queries the SQLite access read-model tables.
type AccessQueries struct{ db *sql.DB }

func NewAccessQueries(db *sql.DB) *AccessQueries { return &AccessQueries{db: db} }

func (q *AccessQueries) ListIncidentAccess(
	ctx context.Context,
	incidentID shared.IncidentID,
) ([]outbound.IncidentAccessGrantRM, error) {
	rows, err := q.db.QueryContext(ctx, `
		SELECT a.incident_id, a.principal_kind, a.principal_id,
		       COALESCE(u.name, g.name, a.principal_id), a.role
		  FROM readmodel_incident_access a
		  LEFT JOIN users u ON a.principal_kind = 'user' AND u.sub = a.principal_id
		  LEFT JOIN readmodel_access_group g ON a.principal_kind = 'group' AND g.id = a.principal_id
		 WHERE a.incident_id = ? AND a.revoked_at IS NULL
		 ORDER BY a.principal_kind, COALESCE(u.name, g.name, a.principal_id), a.role`,
		uuid.UUID(incidentID).String(),
	)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	var out []outbound.IncidentAccessGrantRM

	for rows.Next() {
		var (
			row      outbound.IncidentAccessGrantRM
			incIDStr string
		)

		if err := rows.Scan(
			&incIDStr,
			&row.PrincipalKind,
			&row.PrincipalID,
			&row.PrincipalName,
			&row.Role,
		); err != nil {
			return nil, err
		}

		incID, err := uuid.Parse(incIDStr)
		if err != nil {
			return nil, err
		}

		row.IncidentID = shared.IncidentID(incID)
		out = append(out, row)
	}

	return out, rows.Err()
}

func (q *AccessQueries) GetIncidentAccessMode(
	ctx context.Context,
	incidentID shared.IncidentID,
) (access.IncidentMode, error) {
	var mode access.IncidentMode

	err := q.db.QueryRowContext(ctx,
		`SELECT mode FROM readmodel_incident_access_mode WHERE incident_id = ?`,
		uuid.UUID(incidentID).String(),
	).Scan(&mode)
	if errors.Is(err, sql.ErrNoRows) {
		return "", shared.ErrNotFound
	}

	return mode, err
}

func (q *AccessQueries) ListAccessGroups(ctx context.Context) ([]outbound.AccessGroupRM, error) {
	rows, err := q.db.QueryContext(ctx, `
		SELECT id, name, description, archived_at
		  FROM readmodel_access_group
		 ORDER BY name, id`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	var out []outbound.AccessGroupRM

	for rows.Next() {
		var (
			row        outbound.AccessGroupRM
			idStr      string
			archivedAt sqlite.NullTime
		)

		if err := rows.Scan(&idStr, &row.Name, &row.Description, &archivedAt); err != nil {
			return nil, err
		}

		id, err := uuid.Parse(idStr)
		if err != nil {
			return nil, err
		}

		row.ID = id
		row.ArchivedAt = archivedAt.V
		out = append(out, row)
	}

	return out, rows.Err()
}

func (q *AccessQueries) ListGroupMembers(ctx context.Context, groupID uuid.UUID) ([]outbound.GroupMemberRM, error) {
	rows, err := q.db.QueryContext(ctx, `
		SELECT group_id, subject
		  FROM readmodel_access_group_member
		 WHERE group_id = ? AND removed_at IS NULL
		 ORDER BY subject`, groupID.String())
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	var out []outbound.GroupMemberRM

	for rows.Next() {
		var (
			groupIDStr string
			subject    string
		)

		if err := rows.Scan(&groupIDStr, &subject); err != nil {
			return nil, err
		}

		gID, err := uuid.Parse(groupIDStr)
		if err != nil {
			return nil, err
		}

		out = append(out, outbound.GroupMemberRM{GroupID: gID, Subject: subject})
	}

	return out, rows.Err()
}

func (q *AccessQueries) ListUsers(ctx context.Context) ([]outbound.UserRM, error) {
	rows, err := q.db.QueryContext(ctx,
		`SELECT sub, name, email FROM users ORDER BY name, email, sub`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	var out []outbound.UserRM

	for rows.Next() {
		var row outbound.UserRM
		if err := rows.Scan(&row.Sub, &row.Name, &row.Email); err != nil {
			return nil, err
		}

		out = append(out, row)
	}

	return out, rows.Err()
}

func (q *AccessQueries) ListGlobalRoles(ctx context.Context) ([]outbound.GlobalRoleGrantRM, error) {
	rows, err := q.db.QueryContext(ctx, `
		SELECT a.subject, a.role, COALESCE(u.name, ''), COALESCE(u.email, '')
		  FROM readmodel_global_access a
		  LEFT JOIN users u ON u.sub = a.subject
		 WHERE a.revoked_at IS NULL
		 ORDER BY a.role, COALESCE(u.name, a.subject)`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	var out []outbound.GlobalRoleGrantRM

	for rows.Next() {
		var row outbound.GlobalRoleGrantRM
		if err := rows.Scan(&row.Subject, &row.Role, &row.Name, &row.Email); err != nil {
			return nil, err
		}

		out = append(out, row)
	}

	return out, rows.Err()
}

func (q *AccessQueries) MyGlobalRoles(ctx context.Context, subject string) ([]outbound.GlobalRoleGrantRM, error) {
	rows, err := q.db.QueryContext(ctx, `
		SELECT a.subject, a.role, COALESCE(u.name, ''), COALESCE(u.email, '')
		  FROM readmodel_global_access a
		  LEFT JOIN users u ON u.sub = a.subject
		 WHERE a.subject = ? AND a.revoked_at IS NULL`, subject)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()

	var out []outbound.GlobalRoleGrantRM

	for rows.Next() {
		var row outbound.GlobalRoleGrantRM
		if err := rows.Scan(&row.Subject, &row.Role, &row.Name, &row.Email); err != nil {
			return nil, err
		}

		out = append(out, row)
	}

	return out, rows.Err()
}
