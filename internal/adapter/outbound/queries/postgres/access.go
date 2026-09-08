package postgres

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/f-eld-ch/sitrep/internal/core/domain/access"
	"github.com/f-eld-ch/sitrep/internal/core/domain/shared"
	"github.com/f-eld-ch/sitrep/internal/core/port/outbound"
)

type AccessQueries struct{ pool *pgxpool.Pool }

func NewAccessQueries(pool *pgxpool.Pool) *AccessQueries { return &AccessQueries{pool: pool} }

func (q *AccessQueries) ListIncidentAccess(
	ctx context.Context,
	incidentID shared.IncidentID,
) ([]outbound.IncidentAccessGrantRM, error) {
	rows, err := q.pool.Query(
		ctx,
		`SELECT a.incident_id, a.principal_kind, a.principal_id, COALESCE(u.name, g.name, a.principal_id), a.role
		 FROM readmodel.incident_access a
		 LEFT JOIN users u ON a.principal_kind = 'user' AND u.sub = a.principal_id
		 LEFT JOIN readmodel.access_group g ON a.principal_kind = 'group' AND g.id::text = a.principal_id
		 WHERE a.incident_id = $1 AND a.revoked_at IS NULL
		 ORDER BY a.principal_kind, COALESCE(u.name, g.name, a.principal_id), a.role`,
		uuid.UUID(incidentID),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []outbound.IncidentAccessGrantRM

	for rows.Next() {
		var row outbound.IncidentAccessGrantRM
		if err := rows.Scan(
			&row.IncidentID,
			&row.PrincipalKind,
			&row.PrincipalID,
			&row.PrincipalName,
			&row.Role,
		); err != nil {
			return nil, err
		}

		out = append(out, row)
	}

	return out, rows.Err()
}

func (q *AccessQueries) GetIncidentAccessMode(
	ctx context.Context,
	incidentID shared.IncidentID,
) (access.IncidentMode, error) {
	var mode access.IncidentMode

	err := q.pool.QueryRow(ctx, `SELECT mode FROM readmodel.incident_access_mode WHERE incident_id = $1`, uuid.UUID(incidentID)).
		Scan(&mode)

	return mode, err
}

func (q *AccessQueries) ListAccessGroups(ctx context.Context) ([]outbound.AccessGroupRM, error) {
	rows, err := q.pool.Query(
		ctx,
		`SELECT id, name, description, archived_at FROM readmodel.access_group ORDER BY name, id`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []outbound.AccessGroupRM

	for rows.Next() {
		var row outbound.AccessGroupRM
		if err := rows.Scan(&row.ID, &row.Name, &row.Description, &row.ArchivedAt); err != nil {
			return nil, err
		}

		out = append(out, row)
	}

	return out, rows.Err()
}

func (q *AccessQueries) ListGroupMembers(ctx context.Context, groupID uuid.UUID) ([]outbound.GroupMemberRM, error) {
	rows, err := q.pool.Query(
		ctx,
		`SELECT group_id, subject FROM readmodel.access_group_member WHERE group_id = $1 AND removed_at IS NULL ORDER BY subject`,
		groupID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []outbound.GroupMemberRM

	for rows.Next() {
		var row outbound.GroupMemberRM
		if err := rows.Scan(&row.GroupID, &row.Subject); err != nil {
			return nil, err
		}

		out = append(out, row)
	}

	return out, rows.Err()
}

func (q *AccessQueries) ListUsers(ctx context.Context) ([]outbound.UserRM, error) {
	rows, err := q.pool.Query(ctx, `SELECT sub, name, email FROM users ORDER BY name, email, sub`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

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
	rows, err := q.pool.Query(
		ctx,
		`SELECT a.subject, a.role, COALESCE(u.name, ''), COALESCE(u.email, '')
		 FROM readmodel.global_access a
		 LEFT JOIN users u ON u.sub = a.subject
		 WHERE a.revoked_at IS NULL
		 ORDER BY a.role, COALESCE(u.name, a.subject)`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

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
	rows, err := q.pool.Query(
		ctx,
		`SELECT a.subject, a.role, COALESCE(u.name, ''), COALESCE(u.email, '')
		 FROM readmodel.global_access a
		 LEFT JOIN users u ON u.sub = a.subject
		 WHERE a.subject = $1 AND a.revoked_at IS NULL`,
		subject,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

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

var _ outbound.AccessQueries = (*AccessQueries)(nil)
