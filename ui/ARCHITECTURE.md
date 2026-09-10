# Anti-Corruption Layer Architecture

## Overview

`ui/src/api/` is the **anti-corruption layer** (ACL) between React components and Apollo/gqlgen.
Components and views import _only_ from the `api` path alias. `@apollo/client` may not be imported
anywhere outside this directory — enforced by an oxlint `no-restricted-imports` rule in
`.oxlintrc.jsonc`. That rule is currently severity `warn` with a documented allowlist of legacy
violators; the allowlist may shrink, never grow, and a new direct Apollo import in a view is a
review rejection regardless of the warn severity.

The backend is a hand-written Go/gqlgen API — there is no pending schema swap. The ACL boundary
still stands on its own merits: it keeps every Apollo/GraphQL detail out of views and components.

For project setup, the commit gates, and the wider UI layout, see [AGENTS.md](AGENTS.md). This
document covers only the ACL.

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
  message/          — message aggregate
  layer/            — layer aggregate
  access/           — access aggregate
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

There is no `wire.ts`. Hand-written response types were deleted; both the
`TypedDocumentNode` parameters and the mapper input types now come from the **generated**
`src/gql/next/graphql.ts` (imported via the `gql/next` path alias), with mapper parameters
extracted inline from the operation result:

```ts
import type { GetIncidentsQuery, GetIncidentDetailQuery } from "gql/next";

export function toIncidentSummary(w: GetIncidentsQuery["incidents"][0]): Incident { … }
export function toIncidentDetails(w: NonNullable<GetIncidentDetailQuery["incident"]>): Incident { … }
```

This means the compiler — not a hand-maintained interface — is the source of truth for the wire
shape. Generated nullability is accurate, so mappers coerce (`?? ""`) rather than cast. Variable
types come from the matching
`*QueryVariables` / `*MutationVariables` type, so aggregates no longer declare their own
`*Vars` interfaces.

---

## Schema file

### `api/schema.graphql` (repo root)

The contract between the UI and the Go backend. Both `ui/codegen.ts` and `gqlgen.yml` consume this
file. Intent-named mutations (`closeIncident`, not `updateIncidents`), flat domain types, no wire
artefacts like `affectedRows`, `byPk`, `_eq`, `_isNull`.

---

## Codegen config

| File            | Schema source        | Documents matched | Output             |
| --------------- | -------------------- | ----------------- | ------------------ |
| `ui/codegen.ts` | `api/schema.graphql` | `src/api/**/*.ts` | `ui/src/gql/next/` |

Run locally:

```sh
yarn codegen        # regenerate ui/src/gql/next/ from api/schema.graphql
yarn codegen:check  # same, fail if committed output differs (CI gate)
```

`yarn codegen:check` runs in CI on every push — you cannot land a query the Go server can't answer.

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

Mappers convert gqlgen wire shapes to domain types. Every field is written out explicitly — no
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
domain object out. Assert: `__typename` dropped, timestamps are `instanceof Date`, soft-deleted
records absent, unknown enums fall back. Fixtures are typed with the generated operation types, so
a schema change that breaks a fixture is a compile error rather than a silently-passing test.

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
