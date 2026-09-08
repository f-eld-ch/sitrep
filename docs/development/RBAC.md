# Role-Based Access Control (RBAC)

This document describes how SitRep's permission system works end-to-end — from domain events to Casbin enforcement — and how to extend or test it.

---

## Overview

Authorization in SitRep has two independent scopes:

- **Global roles** control who can administrate the system (manage groups, promote other admins).
- **Incident roles** control who can see and act on a specific incident.

Both are event-sourced: every grant and revocation is a domain event stored in the event log. The access projection materialises those events into flat `readmodel.access_*` tables, and a Casbin enforcer evaluates incoming requests against those tables.

---

## Domain Aggregates

Three event streams carry all authorization facts. None of them is owned by the `Incident` aggregate — they are peers that refer to incident IDs by value.

### `IncidentAccess` (`internal/core/domain/access`)

One stream per incident, keyed by the incident's UUID. Owns:
- The **access mode** (`open_operational` or `restricted`)
- **Role grants** per principal (user, group, or the special `all` principal)

Events: `AccessInitialized`, `RoleGranted`, `RoleRevoked`, `AccessModeChanged`.

The incident service creates and saves an `IncidentAccess` aggregate in the same transaction as the `Incident` aggregate, granting the creator an `owner` role at birth.

### `AccessGroup`

One stream per group. Owns group name, description, archival status, and member list.

Events: `GroupCreated`, `GroupRenamed`, `GroupDescriptionChanged`, `GroupArchived`, `GroupMemberAdded`, `GroupMemberRemoved`.

### `GlobalAccess`

A singleton stream with a well-known UUID (`00000000-0000-0000-0000-000000000001`). Owns all system-level role grants.

Events: `GlobalAccessInitialized`, `GlobalRoleGranted`, `GlobalRoleRevoked`.

---

## Incident Roles and Permissions

A principal holds exactly one role per incident (the domain enforces this — granting a new role automatically revokes any existing one in the same transaction).

| Permission | Viewer | Editor | Manager | Owner |
|---|:---:|:---:|:---:|:---:|
| Read incident, messages, layers | ✓ | ✓ | ✓ | ✓ |
| Write incident (rename, update) | | ✓ | ✓ | ✓ |
| Post / edit messages | | ✓ | ✓ | ✓ |
| Create / edit / delete layers and features | | ✓ | ✓ | ✓ |
| Close / reopen incident | | | ✓ | ✓ |
| Manage access grants (`incident.manage_access`) | | | ✓ | ✓ |
| Link / unlink parent incident | | ✓ | ✓ | ✓ |
| Delete incident (`incident.delete`) | | | | ✓ |

> These permissions apply to **restricted** incidents. On **open_operational** incidents the access checker bypasses Casbin for every action except `incident.delete` (see Access Modes below).

**Important:** `NONE` is not a stored role — revoking a grant removes the row entirely. `NONE` appears in the UI as a way to express "revoke whatever role this principal has".

### The `all` principal

Granting the `all` principal (principal kind `all`, ID `*`) gives every authenticated user viewer or editor access to an incident. This is useful for announcing broad operational access without enumerating individuals. The `all` principal only supports `viewer` and `editor` — it cannot be an owner or manager.

---

## Access Modes

Every incident has exactly one of two modes:

| Mode | Meaning |
|---|---|
| `open_operational` | Every authenticated user can read, write, close, and manage access grants on the incident. **Only `incident.delete` is policy-gated** — it is restricted to owners even on open incidents. |
| `restricted` | Only principals with an explicit grant (user, group, or `all`) can access the incident. All actions are Casbin-enforced. |

### Open-mode bypass detail

When an incident is `open_operational` and already has at least one owner grant, the access checker short-circuits for every action **except** `incident.delete`, avoiding a Casbin lookup. If no owner grant exists yet (ownerless incident), *all* actions are bypassed — the incident is fully claimable by any authenticated user.

When the mode row is missing entirely (projection lag or pre-RBAC incident), the checker treats the incident as ownerless-open and allows all actions.

### Mode transition invariant

Switching to `restricted` requires at least one owner grant. If the incident has no explicit user owner at the time of the switch, the actor performing the switch is automatically granted `owner` before the mode change event is recorded — both events are emitted in the same aggregate call.

---

## Global Roles

| Role | Permissions |
|---|---|
| `system_admin` | `group.manage` + `system_admin.manage` — can create/archive groups, add/remove members, and grant or revoke all global roles |
| `group_admin` | `group.manage` only — can create/archive groups and manage group membership, but cannot promote other admins |

The last active `system_admin` cannot be revoked. This is enforced in the `GlobalAccess` domain aggregate.

### Bootstrap

On first startup with an empty database, SitRep bootstraps the first authenticated user as `system_admin` under a database advisory lock, provided no users exist yet. On an existing deployment the CLI command `sitrep admin grant-system-admin <sub>` must be used to promote the first admin.

---

## Read-Model Projection

The `AccessHandler` processes events from all three streams (`IncidentAccess`, `AccessGroup`, `GlobalAccess`) as a single consistency unit and rebuilds the following tables atomically after every access event:

| Table | Contents |
|---|---|
| `readmodel.incident_access` | One row per active (incident, principal, role) grant |
| `readmodel.incident_access_mode` | One row per incident: current mode |
| `readmodel.access_group` | One row per group (name, description, archived_at) |
| `readmodel.access_group_member` | One row per (group_id, subject) membership |
| `readmodel.global_access` | One row per (subject, role) global grant |
| `readmodel.access_policy` | **Flattened** (subject, domain, object, action) tuples consumed by Casbin |

### Policy derivation (`recompute`)

After every access event, `recompute()` rebuilds `access_policy` from scratch. The derivation rules are:

1. **Direct user grant** — for each `(incidentID, user, role)` grant, emit one policy row per action the role holds (see permission table above).
2. **Group grant** — for each `(incidentID, group, role)` grant, also enumerate every group member and emit their individual policy rows. Archived groups are excluded.
3. **`all` grant** — emit a policy row with `subject = 'all'` for every action the role holds. The enforcer rewrites `all` to the actual requesting subject at evaluation time.
4. **Open-mode optimisation** — when an incident is in `open_operational` mode, only `incident.delete` policies are emitted from grants (owner-only action that remains gated even on open incidents). All other access decisions short-circuit to `true` at the checker level before reaching Casbin.
5. **Global roles** — emit one policy per action the global role holds, with `domain = 'global'`.

The `AccessHandler` sets `HaltOnError() = true` — a projection failure stops the handler entirely rather than skipping the event. A missed revocation would leave access incorrectly enabled; it is better to halt and require manual intervention.

Increment `AccessHandler.Version()` whenever the policy derivation logic changes. This triggers an automatic full replay on next startup.

---

## Enforcement Architecture

```
GraphQL resolver / service
  │
  ├── IncidentAccessChecker.Can(ctx, subject, incidentID, action)
  │       ├── SELECT mode FROM readmodel.incident_access_mode
  │       │       not found        → treat as ownerless-open → return true
  │       │       open_operational → check owner count
  │       │           no owners   → return true (fully claimable)
  │       │           has owners + action ≠ incident.delete → return true
  │       │           has owners + action = incident.delete → fall through to Casbin
  │       │       restricted       → fall through to Casbin
  │       └── enforce(subject, domain, object, action)
  │               SELECT policies WHERE (subject=$1 OR subject='all') AND domain=$2
  │               load into in-process Casbin enforcer
  │               Casbin.Enforce(...)
  │
  └── GlobalAccessChecker.Can(ctx, subject, action)
          enforce(subject, 'global', object, action)
```

**Casbin is not the source of truth** — it is a stateless evaluator. Every call to `enforce()` instantiates a fresh Casbin model from the database rows. There is no in-process Casbin state to invalidate.

The Casbin policy model is RBAC-free (`p = sub, dom, obj, act`; `e = some(where p.eft == allow)`). There is no Casbin role inheritance. Group membership expansion and the `all` rewriting are done in the projection, not in Casbin.

### Missing mode row

If `readmodel.incident_access_mode` has no row for a given incident (the projection has not caught up yet, or the incident pre-dates RBAC), the checker treats the incident as ownerless-open and returns `true` for all actions. This prevents the async projector lag from making newly created incidents inaccessible.

---

## Cross-Stream Invariants and the `AccessGuard`

Some invariants span multiple event streams:
- An owner grant must not be revoked if it is the last one.
- A group cannot be archived while it has active incident grants.
- A group-membership change affects all incidents that grant that group.

These checks require reading across streams, which optimistic concurrency alone cannot protect. The `outbound.AccessGuard` port serialises them with an advisory lock in PostgreSQL and a mutex in the in-memory adapter. The service acquires the guard before reading cross-stream state and releases it after saving.

---

## Testing

### In-memory test stack

The resolver tests use `newTestStack(t)` which wires the in-memory event store, projector, and access checker. Attach an `AccessHandler` and `AccessQueries` to test access-related resolver paths:

```go
accessHandler := projection.NewAccessHandler()
accessQueries := inmemqueries.NewAccessQueries(accessHandler)
r := &gqlresolver.Resolver{AccessQueries: accessQueries}
```

The in-memory `AccessHandler` exposes `Policies()`, `Mode()`, `IncidentGrants()`, and `GlobalRoles()` for direct assertions without going through the read-model query layer.

### Service-level tests

`internal/core/service/access_test.go` tests the `AccessService` with a fully wired in-memory stack including the access checker, so grant/revoke operations and the resulting `Can` outcomes are tested end-to-end through the domain and projection layers.

### Projection tests

`internal/adapter/outbound/eventstore/inmem/projection/access_test.go` tests the policy derivation logic in isolation — group expansion, `all` principal, open-mode optimisation, mode transitions, and revocations.

---

## Adding a New Permission

1. Add the `Action` constant to `internal/core/domain/access/access.go`.
2. Add it to the relevant role's slice in `incidentActions()` in the `AccessHandler` (`inmem/projection/access.go`). Mirror the change in the postgres `AccessHandler` (`postgres/projection/access.go`).
3. Increment `AccessHandler.Version()` in both handlers to trigger a projection rebuild on next deploy.
4. Add the guard call in the service method that requires the new permission.
5. Add a test asserting the new action is allowed/denied for each role.

---

## Package Map

| Concern | Package |
|---|---|
| Domain aggregates and events | `internal/core/domain/access` |
| Outbound ports (`IncidentAccessChecker`, `GlobalAccessChecker`, `AccessQueries`, `AccessGuard`) | `internal/core/port/outbound` |
| Access service (`GrantRole`, `RevokeRole`, `ChangeMode`, `CreateGroup`, …) | `internal/core/service/access.go` |
| In-memory projection handler | `internal/adapter/outbound/eventstore/inmem/projection/access.go` |
| Postgres projection handler | `internal/adapter/outbound/eventstore/postgres/projection/access.go` |
| In-memory access checker | `internal/adapter/outbound/eventstore/inmem/access_checker.go` |
| Postgres access checker | `internal/adapter/outbound/eventstore/postgres/access_checker.go` |
| In-memory read-model queries | `internal/adapter/outbound/queries/inmem/access.go` |
| Postgres read-model queries | `internal/adapter/outbound/queries/postgres/queries.go` |
| GraphQL resolvers | `internal/adapter/inbound/graphql/schema.resolvers.go`, `access_helpers.go` |
| Frontend access UI | `ui/src/views/incident/Access.tsx` |
| Frontend admin UI | `ui/src/views/admin/` |
