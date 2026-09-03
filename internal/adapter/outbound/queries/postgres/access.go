package postgres

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

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
		`SELECT incident_id, principal_kind, principal_id, role FROM rm_incident_access WHERE incident_id = $1 AND revoked_at IS NULL ORDER BY principal_kind, principal_id, role`,
		uuid.UUID(incidentID),
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []outbound.IncidentAccessGrantRM

	for rows.Next() {
		var row outbound.IncidentAccessGrantRM
		if err := rows.Scan(&row.IncidentID, &row.PrincipalKind, &row.PrincipalID, &row.Role); err != nil {
			return nil, err
		}

		out = append(out, row)
	}

	return out, rows.Err()
}

func (q *AccessQueries) ListAccessGroups(ctx context.Context) ([]outbound.AccessGroupRM, error) {
	rows, err := q.pool.Query(
		ctx,
		`SELECT id, name, description, archived_at FROM rm_access_group ORDER BY name, id`,
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
		`SELECT group_id, subject FROM rm_access_group_member WHERE group_id = $1 AND removed_at IS NULL ORDER BY subject`,
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

var _ outbound.AccessQueries = (*AccessQueries)(nil)
