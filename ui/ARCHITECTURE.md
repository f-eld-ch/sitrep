# Anti-Corruption Layer Architecture

## Overview

`ui/src/api/` is the **anti-corruption layer** (ACL) between React components and Apollo/Hasura.
Components and views import _only_ from the `api` path alias. `@apollo/client` may not be imported
anywhere outside this directory — enforced by an oxlint `no-restricted-imports` rule in
`.oxlintrc.jsonc`. That rule is currently severity `warn` with a documented allowlist of legacy
violators; the allowlist may shrink, never grow, and a new direct Apollo import in a view is a
review rejection regardless of the warn severity.

The goal is a swap-day where changing from Hasura to gqlgen touches only files inside `src/api/`,
with zero changes to views or components.

For project setup, the commit gates, and the wider UI layout, see [AGENTS.md](AGENTS.md). This
document covers only the ACL and the migration.

---

## Directory layout

```
src/api/
  index.ts          — public surface: re-exports hooks and result types only
  result.ts         — QueryResult / CommandHook / CommandState discriminated unions
  errors.ts         — ApiError, ApiErrorCode
  client.ts         — ApolloClient instance
  cache.ts          — InMemoryCache + activeIncidentVar
  common/
    mapper.ts       — shared utilities: toDate, toOptionalDate, toEnum
  incident/         — incident aggregate
  journal/          — journal aggregate
  message/          — message aggregate
  layer/            — layer aggregate
  testing/
    results.ts      — test helpers: loadingResult, errorResult, readyResult
```

Each aggregate follows the same structure:

```
{aggregate}/
  documents.ts  — TypedDocumentNode GQL operations, typed from the generated `gql` module
  mapper.ts     — wire → domain type conversions (+ test)
  queries.ts    — useQuery hooks returning QueryResult<T>
  commands.ts   — useMutation hooks returning CommandHook<Args, Result>
  invalidate.ts — afterXxxWrite(id) refetch helpers
  index.ts      — re-exports the aggregate's public surface
```

### No hand-written wire types

There is no `wire.ts`. Hand-written Hasura response types were deleted; both the
`TypedDocumentNode` parameters and the mapper input types now come from the **generated**
`src/gql/graphql.ts` (imported via the `gql` path alias), with mapper parameters extracted inline
from the operation result:

```ts
import type { FetchIncidentsQuery, GetIncidentDetailQuery } from "gql";

export function toIncidentSummary(w: FetchIncidentsQuery["incidents"][0]): Incident { … }
export function toIncidentDetails(w: NonNullable<GetIncidentDetailQuery["incidentsByPk"]>): Incident { … }
```

This means the compiler — not a hand-maintained interface — is the source of truth for the wire
shape. Generated nullability is accurate and stricter than the old hand-written types were, so
mappers coerce (`?? ""`) rather than cast. Variable types come from the matching
`*QueryVariables` / `*MutationVariables` type, so aggregates no longer declare their own
`*Vars` interfaces.

---

## Schema files

### `api/schema.graphql` (repo root)

The _future_ gqlgen schema. This is the contract between the UI and the Go backend.
Both `ui/codegen.next.ts` and `gqlgen.yml` consume this file.

**Not** the current Hasura schema. It uses intent-named mutations (`closeIncident`, not
`updateIncidents`), flat domain types (no Hasura envelopes), and omits wire artefacts like
`affectedRows`, `byPk`, `_eq`, `_isNull`.

### `hasura/schema/hasura.graphql`

A committed SDL snapshot of the Hasura schema, introspected as role `editor`. Used only by
`ui/codegen.ts` to generate types for the current Hasura wire layer. Refresh manually when
the Hasura schema changes:

```sh
yarn codegen:schema   # introspects running Hasura, writes hasura/schema/hasura.graphql
```

The file is committed so CI has no Hasura dependency.

---

## Codegen configs

| File                   | Schema source                  | Documents matched      | Output                         |
| ---------------------- | ------------------------------ | ---------------------- | ------------------------------ |
| `ui/codegen.ts`        | `hasura/schema/hasura.graphql` | `src/api/**/*.ts`      | `ui/src/gql/`                  |
| `ui/codegen.next.ts`   | `api/schema.graphql`           | `src/api/**/*.next.ts` | `ui/src/gql/next/`             |
| `ui/codegen.schema.ts` | live Hasura (introspection)    | —                      | `hasura/schema/hasura.graphql` |

Run locally:

```sh
yarn codegen             # regenerate ui/src/gql/ from the Hasura SDL snapshot
yarn codegen:check       # same, fail if committed output differs (CI gate)
yarn codegen:next        # regenerate ui/src/gql/next/ from api/schema.graphql
yarn codegen:next:check  # same, fail if committed output differs (CI gate)
yarn codegen:schema      # refresh the SDL snapshot from a running Hasura
```

Both check commands run in CI on every push. The `codegen:next:check` gate means you cannot write
a future-facing UI query that the Go server will not be able to answer, even before Go exists.

**`codegen.next.ts` matches only `*.next.ts`.** The current documents use Hasura vocabulary
(`byPk`, `_eq`, `uuid`, `affectedRows`) that does not exist in `api/schema.graphql`, so including
them would fail with dozens of errors. With no `*.next.ts` files yet the check passes vacuously via
`ignoreNoDocuments` — the correct starting state. As each aggregate is ported, add a
`documents.next.ts` beside its `documents.ts` and the gate begins covering it. The count of ported
aggregates is the migration's burn-down.

`yarn codegen:schema` reads `HASURA_GRAPHQL_ADMIN_SECRET` from the environment. Never hardcode a
secret in `codegen.schema.ts`.

**Generated output is committed and must not be formatted.** `src/gql/**` is in the `oxfmt`
ignore list; formatting it changes quote style and makes `codegen:check` report stale files.

---

## Hook shapes

### Queries

```ts
type QueryResult<T> =
  | {
      status: "loading";
      data: undefined;
      error: undefined;
      isRefreshing: false;
      refresh: () => void;
    }
  | {
      status: "error";
      data: T | undefined;
      error: ApiError;
      isRefreshing: boolean;
      refresh: () => void;
    }
  | { status: "ready"; data: T; error: undefined; isRefreshing: boolean; refresh: () => void };
```

Components switch on `status` rather than reconstructing `!loading && data` by hand.
Background polls (e.g. layers every 2s) surface as `isRefreshing: true` on a `"ready"` result.

### Commands

```ts
type CommandHook<Args, Result = void> = [(args: Args) => Promise<Result>, CommandState];
```

Commands return promises so callers can `await` and chain navigation or selection without
`onCompleted` callbacks.

---

## Mappers

Mappers convert Hasura wire shapes to domain types. Every field is written out explicitly — no
spreads. This serves two purposes:

1. **`__typename` is never propagated** into domain objects. The cache normalises by `__typename`;
   domain code should never need it.
2. **The mapper body is the gqlgen requirements list.** Every line that is not `x: w.x` is a
   resolver the Go server must implement. When every line is `x: w.x`, delete the mapper.

Key conversions today:

- `createdAt: string` → `createdAt: Date` (via `toDate`)
- `divisions: [{ division: { ... } }]` → `divisions: Division[]` (join-table unwrap)
- Deleted features are filtered in `toLayer` — the app never sees them
- Unknown enum values fall back to a safe default via `toEnum`

---

## Invalidation

Each aggregate has an `afterXxxWrite(id)` function that returns a typed `refetchQueries` array:

```ts
// api/incident/invalidate.ts
type AfterIncidentWriteEntry =
  | { query: typeof GET_INCIDENTS }
  | { query: typeof GET_INCIDENT_DETAILS; variables: { incidentId: string } };

export function afterIncidentWrite(incidentId?: string): AfterIncidentWriteEntry[] {
  if (incidentId) {
    return [{ query: GET_INCIDENTS }, { query: GET_INCIDENT_DETAILS, variables: { incidentId } }];
  }
  return [{ query: GET_INCIDENTS }];
}
```

The `incidentId` is optional because some writes (creation) have no incident to detail-refetch yet.

Mutation hooks must call the appropriate `afterXxxWrite` rather than hand-writing
`refetchQueries`. Apollo matches a refetch on document **and** variables, so a refetch registered
without the original variables silently never fires — centralising the variable construction here
is what prevents that.

---

## Testing

The ACL boundary supports three test tiers:

**Mapper tests** (`{aggregate}/mapper.test.ts`) — pure functions, no Apollo/React. Wire literal in,
domain object out. The only Hasura-aware tests; the first things deleted at cutover. Assert:
`__typename` dropped, timestamps are `instanceof Date`, soft-deleted records absent, unknown enums
fall back. Fixtures are typed with the generated operation types, so a schema change that breaks a
fixture is a compile error rather than a silently-passing test.

**Enum conformance** (`common/enum-conformance.test.ts`) — asserts domain enums and generated
schema enums agree in both directions: a compile-time subset check catches renames, and runtime
assertions catch schema values with no domain member.

Values the UI deliberately does not expose are listed in `INTENTIONALLY_UNEXPOSED` in that file,
and are asserted _absent_ from the domain enum. `priority.CRITICAL` is the current entry: it
exists in the DB enum but has never been used in triage, so it is absent from `PriorityStatus`
and from all four locale files. A genuinely new schema value still fails the check — only listed
omissions are excused.

**Container tests** (`*.container.test.tsx`) — mock the `api` module with `vi.mock("api")` to
exercise a component's loading, error, ready and empty branches. Because the boundary is a plain
module, this needs no `MockedProvider` and no Apollo knowledge in the test. Pattern:

```ts
vi.mock("api", () => ({ useIncidents: vi.fn() }));

it("shows a spinner while loading", async () => {
  const { useIncidents } = await import("api");
  vi.mocked(useIncidents).mockReturnValue(loadingResult());
  render(<List />);
  expect(screen.getByTestId("spinner")).toBeInTheDocument();
});
```

Helpers `loadingResult()`, `errorResult(err)`, `readyResult(data)` live in
`api/testing/results.ts`.

---

## gqlgen migration guide

### Per-aggregate swap

> **Not yet implemented.** This section is the plan. `src/api/client.ts` currently has a single
> link and no backend switch; the OpenFeature machinery exists in views (`useBooleanFlagValue`)
> but is not wired to transport selection. Build this before porting the first aggregate.

Each aggregate is migrated independently, behind an OpenFeature flag. The flag selects which
`ApolloLink` is active — Hasura or gqlgen — via `ApolloLink.split` on `context.backend`. Both
share one `InMemoryCache`, which is coherent precisely because the ACL already made the two
backends produce identical domain shapes.

Rollback is a flag flip: the next poll (≤10 s, ≤2 s on the map) returns to Hasura with no
redeploy, since both backends run against the same Postgres.

**Steps for one aggregate:**

1. **Write `documents.next.ts`** — the same operations expressed in the gqlgen vocabulary, typed
   from `src/gql/next/`. `yarn codegen:next:check` confirms validity against `api/schema.graphql`
   before you touch any other file. The old `documents.ts` stays in place and serving until the
   flag flips.

2. **Update `mapper.ts`** — repoint the input types at the `src/gql/next/` operation types and
   update field mappings. When every line is `x: w.x`, delete the mapper and have the query hook
   return the result directly.

3. **Update `commands.ts`** — remove Hasura-specific logic:
   - Delete `affectedRows === 0` checks (gqlgen raises a proper GraphQL error instead)
   - Delete client-generated timestamps (`closedAt: new Date()` → server sets it)
   - Delete `returning` envelope unwrapping

4. **Update `invalidate.ts`** — repoint at the new documents.

5. **Flip the feature flag to 100 %**, observe for one release cycle, then delete the old
   `documents.ts`, remove the flag, and drop the Hasura link.

### Known Hasura-specific logic to remove per aggregate

| File                   | What to remove                                         | Why                                          |
| ---------------------- | ------------------------------------------------------ | -------------------------------------------- |
| `incident/commands.ts` | `affectedRows === 0` guard in `useDeleteIncident`      | gqlgen raises `INCIDENT_NOT_DELETABLE` error |
| `incident/commands.ts` | `closedAt: new Date()` in `useCloseIncident`           | server sets the timestamp                    |
| `incident/commands.ts` | `updateJournals` cascade in `useCloseIncident`         | server handles cascade                       |
| `incident/commands.ts` | `on_conflict` / constraint name in `useUpdateIncident` | gqlgen takes named input                     |
| `message/commands.ts`  | delete-then-reinsert in `useTriageMessage`             | gqlgen transaction                           |
| `layer/commands.ts`    | `deletedAt: new Date()` in `useDeleteFeature`          | server soft-deletes                          |
| `layer/mapper.ts`      | `deletedAt` filter in `toLayer`                        | gqlgen omits deleted rows                    |
| All `queries.ts`       | `pollInterval` / `fetchPolicy`                         | replace with subscriptions via `live: true`  |

### Multi-root transactions

`useTriageMessage` today relies on Hasura's multi-root mutation transactionality (delete +
reinsert in one request). The comment in `message/commands.ts` documents this explicitly. The
gqlgen server must wrap this in a proper transaction. Verify with an integration test that kills
the process between the delete and the insert.

### The `insert_user_for_messages` trigger

`hasura/migrations/Postgres/.../up.sql` defines a trigger that reads `current_setting('hasura.user')`
to upsert into `users` on every message write. This trigger is still live.

**Sequenced removal:**

1. Make the trigger tolerate a missing `hasura.user` setting (return early instead of error)
2. Have the gqlgen server upsert the user explicitly before writing the message
3. Drop the trigger after full cutover

Both backends must be writable simultaneously during the transition.
