# Anti-Corruption Layer Architecture

## Overview

`ui/src/api/` is the **anti-corruption layer** (ACL) between React components and Apollo/Hasura.
Components and views import _only_ from the `api` path alias. `@apollo/client` may not be imported
anywhere outside this directory — enforced by an oxlint `no-restricted-imports` rule in
`.oxlintrc.jsonc`.

The goal is a swap-day where changing from Hasura to gqlgen touches only files inside `src/api/`,
with zero changes to views or components.

---

## Directory layout

```
src/api/
  index.ts          — public surface: re-exports hooks and result types only
  result.ts         — QueryResult / CommandHook / CommandState discriminated unions
  errors.ts         — ApiError, ApiErrorCode
  client.ts         — ApolloClient instance (was src/client.tsx)
  cache.ts          — InMemoryCache + activeIncidentVar (was src/cache.tsx)
  common/
    mapper.ts       — shared utilities: toDate, toOptionalDate, toEnum
  incident/         — incident aggregate
  journal/          — journal aggregate
  message/          — message aggregate
  layer/            — layer aggregate
  testing/          — test helpers: loadingResult, errorResult, readyResult, fixtures
```

Each aggregate follows the same structure:

```
{aggregate}/
  documents.ts  — TypedDocumentNode GQL operations + variable interfaces
  wire.ts       — raw Hasura response shapes (to be deleted at cutover)
  mapper.ts     — wire → domain type conversions (+ test)
  queries.ts    — useQuery hooks returning QueryResult<T>
  commands.ts   — useMutation hooks returning CommandHook<Args, Result>
  invalidate.ts — afterXxxWrite(id) refetch helpers
  index.ts      — re-exports the aggregate's public surface
```

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

| File                 | Schema source                  | Output                | Purpose                                          |
| -------------------- | ------------------------------ | --------------------- | ------------------------------------------------ |
| `ui/codegen.ts`      | `hasura/schema/hasura.graphql` | `ui/src/gql/`         | Validates current documents against Hasura       |
| `ui/codegen.next.ts` | `api/schema.graphql`           | (check only, no emit) | Validates future documents against gqlgen schema |

Run locally:

```sh
yarn codegen           # regenerate ui/src/gql/ from Hasura schema
yarn codegen:check     # same, fail if output differs (CI gate)
yarn codegen:next:check  # validate future-facing documents (CI gate)
```

CI runs both check commands on every push. The `codegen:next:check` gate means you cannot write a
UI query that the Go server cannot answer, even before Go is implemented.

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
export function afterIncidentWrite(incidentId: string) {
  return [{ query: GET_INCIDENTS }, { query: GET_INCIDENT_DETAILS, variables: { incidentId } }];
}
```

All mutation hooks call the appropriate `afterXxxWrite` with the correct variables, fixing a
pre-existing defect where `refetchQueries` omitted variables and never fired.

---

## Testing

The ACL boundary makes two new test tiers possible:

**Mapper tests** (`*.mapper.test.ts`) — pure functions, no Apollo/React. Wire literal in, domain
object out. The only Hasura-aware tests; the first things deleted at cutover. Assert:
`__typename` dropped, timestamps are `instanceof Date`, soft-deleted records absent, unknown enums
fall back.

**Container tests** (`*.container.test.tsx`) — mock the `api` module with `vi.mock("api")`.
Previously impossible without `MockedProvider`. Pattern:

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

Each aggregate is migrated independently, behind an OpenFeature flag. The feature flag selects
which `ApolloLink` is active — Hasura or gqlgen. Both share one `InMemoryCache`.

**Steps for one aggregate:**

1. **Update `documents.ts`** — change operation names and field names to match the gqlgen schema.
   The `codegen:next:check` CI gate confirms validity before you touch any other file.

2. **Update `wire.ts`** — update response types to match gqlgen (or delete the file if the
   gqlgen shape is identical to the domain types).

3. **Update `mapper.ts`** — update field mappings. When every line is `x: w.x`, delete the
   mapper and have the query hook return the raw result directly.

4. **Update `commands.ts`** — remove Hasura-specific logic:
   - Delete `affectedRows === 0` checks (gqlgen raises a proper GraphQL error instead)
   - Delete client-generated timestamps (`closedAt: new Date()` → server sets it)
   - Delete `returning` envelope unwrapping

5. **Update `invalidate.ts`** — update operation names to match gqlgen documents.

6. **Delete `wire.ts`** and the mapper file when they are no longer needed.

7. **Flip the feature flag to 100 %**, observe for one release cycle, then remove the flag and
   the Hasura link.

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
