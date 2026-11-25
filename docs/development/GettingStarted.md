# Getting Started

This page gets a development environment running and explains how to check your changes. Before you
start, read [CONTRIBUTING.md](../../CONTRIBUTING.md). Where to go next:

- Backend (everything outside `ui/`): [AGENTS.md](../../AGENTS.md) and [Backend Architecture](Backend%20Architecture.md)
- Frontend (`ui/`): [ui/AGENTS.md](../../ui/AGENTS.md) and [ui/ARCHITECTURE.md](../../ui/ARCHITECTURE.md)
- All developer documentation: [README](README.md)

## Prerequisites

- Go, in the version pinned in `go.mod`
- Node.js (version in `.nvmrc`) and `yarn`
- [`golangci-lint`](https://golangci-lint.run/) and [`pre-commit`](https://pre-commit.com/)
- Docker or Podman, only for the PostgreSQL setup, the PostgreSQL integration tests and the local Dex
  identity provider

## Run it locally

SitRep supports two database backends: embedded SQLite and PostgreSQL. Both are first-class, so a change to
the database layer or to a migration has to work on both (see [Migrations](#migrations)). Pick one setup.

For both setups, build the UI once so the Go binary can embed it:

```sh
cd ui && yarn install && yarn build && cd ..
```

The Go server embeds `ui/build` via `go:embed` at compile time, so this directory must exist and contain a
build before `go run .` will even compile.

### Option A: SQLite, no Docker

The quickest way to a running system. It uses an embedded SQLite file and a fixed local user instead of an
identity provider.

Create a `config.yaml` in the repository root (the file is gitignored, never commit it):

```yaml
database-url: "sqlite://sitrep.db"   # relative path; use sqlite:///abs/path/to/sitrep.db for an absolute one
migrate-on-startup: true             # the schema does not exist until migrations have run
insecure-local-auth: true            # skip OIDC, act as a fixed local user. Never use in production
graphql-introspection: true          # enables /api/v2/graphql/play
```

Start the backend (it reads `config.yaml` from the working directory) and, in a second terminal, the UI dev server:

```sh
go run .
```

```sh
cd ui && yarn start
```

Open [localhost:3000](http://localhost:3000/). The Vite dev server proxies `/api/v2/graphql` to the Go server on `:4180`.

To use a configuration file elsewhere, pass its path explicitly. An explicit path must exist and contain
valid YAML:

```sh
go run . --config /path/to/config.yaml
```

Or build and run the binary:

```sh
go build -o sitrep . && ./sitrep serve
```

Constraints of the SQLite backend:

- Only one server process may open the database file at a time. A second process sees busy errors.
- The file attachment backend defaults to `filesystem` (the `database` backend requires PostgreSQL).
- Without `insecure-local-auth`, login needs an OIDC provider; Option B sets up Dex for that.

### Option B: PostgreSQL and a local identity provider

This is closer to production: the server runs against PostgreSQL and logs users in through a local
[Dex](https://dexidp.io/) OIDC provider. Docker Compose provides both.

1. Create a `config.yaml` in the repository root:

   ```yaml
   oidc-issuer: "http://localhost:5556/dex"
   oidc-client-id: "sitrep"
   oidc-client-secret: "ds8LCRW4jhB58nWdMgZHeVISqx3O3e1o3g0LEr9H8tM="  # generate with: openssl rand -base64 32 | tr -- '+/' '-_'
   oidc-redirect-url: "http://localhost:3000/oauth2/callback"
   cookie-key: "0123456789abcdef0123456789abcdef"                        # generate with: openssl rand -hex 16

   database-url: "postgres://postgres:postgrespassword@localhost:15432/postgres?sslmode=disable"
   migrate-on-startup: true  # required on first run; the schema does not exist until migrations have run

   graphql-introspection: true  # enables /api/v2/graphql/play
   ```

2. Create a `.env.local` in the repository root for Docker Compose (sets the Postgres password and the Dex
   OIDC client):

   ```
   OIDC_CLIENT_ID=sitrep
   OIDC_CLIENT_SECRET=ds8LCRW4jhB58nWdMgZHeVISqx3O3e1o3g0LEr9H8tM=
   POSTGRES_PASSWORD=postgrespassword
   ```

3. Start the infrastructure:

   ```sh
   docker compose --env-file .env.local up -d
   ```

   On SELinux machines use the SELinux compose file:

   ```sh
   docker compose -f docker-compose.selinux.yml --env-file .env.local up -d
   ```

4. Start the backend, and in a second terminal the UI dev server:

   ```sh
   go run .
   ```

   ```sh
   cd ui && yarn start
   ```

5. Open [localhost:3000](http://localhost:3000/). The Vite dev server proxies `/api/v2/graphql` and
   `/oauth2` to the Go server on `:4180`. Authentication is handled by Dex: click **Log in with Example**.

The GraphQL playground is available at
[localhost:4180/api/v2/graphql/play](http://localhost:4180/api/v2/graphql/play) when
`graphql-introspection: true` is set.

### Running migrations by hand

The server runs migrations itself when `migrate-on-startup` is set. To run them separately:

```sh
go run . migrate up            # apply all pending migrations
go run . migrate status        # show what is applied
go run . migrate up --database-url sqlite://sitrep.db   # against a specific database
```

Never apply schema changes by hand to the development database; they are lost on the next `migrate up`.

## Check your changes

Run these before every commit. CI runs the same checks and rejects anything that fails.

**Backend**

```sh
golangci-lint fmt ./...        # the single formatter, do not use gofmt
golangci-lint run ./...        # static analysis and import rules
go test ./...                  # unit tests, no database or Docker needed
go test -race ./...            # race detector, run before opening a PR
go test -tags integration ./...  # PostgreSQL tests in a container (needs Docker or Podman)
```

Run the integration tests before pushing a change to a Postgres adapter, a projection handler or a
Postgres migration. See [AGENTS.md](../../AGENTS.md#testing) for how the three test tiers (domain, service,
resolver) are built and how the PostgreSQL tests are set up with Podman.

**Frontend** (from `ui/`)

```sh
yarn fmt            # format (oxfmt)
yarn lint           # oxlint
yarn typecheck      # tsc --noEmit
yarn codegen:check  # generated GraphQL types match api/schema.graphql
yarn test           # vitest
```

After changing `api/schema.graphql`, regenerate the backend with `go generate ./internal/adapter/inbound/graphql/...`
and the frontend types with `yarn codegen`.

### Pre-commit hooks

The repository ships a [`.pre-commit-config.yaml`](../../.pre-commit-config.yaml) that runs the formatters and
linters above on the files you changed, and checks that the commit message follows
[Conventional Commits](https://www.conventionalcommits.org/). Install it once:

```sh
pre-commit install --install-hooks
pre-commit install --hook-type commit-msg
```

Commit messages look like `feat(incident): add ChangeLocation command`; the scopes in use are listed in
[AGENTS.md](../../AGENTS.md).

## Migrations

Migrations live in `migrations/postgres` and `migrations/sqlite` and are run with
[goose](https://github.com/pressly/goose); they are embedded in the binary. The two sets are kept in sync:
a schema change, a read-model table or column, an index or a data backfill in one needs its counterpart in the
other, so that the resulting schema and the behaviour seen by the application are equivalent. SQL syntax and
migration numbers may differ.

Adding a migration:

1. Add `NNNN_<slug>.sql` (or a Go migration registered in `postgres.go` / `sqlite.go`) to **both** directories.
2. Run both migration test suites: `go test ./migrations/...`.
3. If the read model changed, bump the projection handler `Version()` in every projector so existing read
   models are rebuilt after deploy.

Never edit a migration that has already been committed or applied; add a new one. The rules, the historical
Postgres-only exceptions and the Go-migration conventions are in [AGENTS.md](../../AGENTS.md#migrations).

## Server configuration

Every configuration-backed CLI flag also has a YAML key with the same name and a canonical `SITREP_*`
environment variable. Values take precedence in this order: CLI flags, environment variables, configuration
file, then defaults. `--config` selects the YAML file and has no environment-variable counterpart.

The options you will use most in development:

| Flag / YAML key | Environment variable | Purpose |
| --- | --- | --- |
| `database-url` | `SITREP_DATABASE_URL` | `postgres://…` or `sqlite://…` DSN. A root flag, shared by `serve`, `migrate` and `access` |
| `log-level` | `SITREP_LOG_LEVEL` | `debug`, `info`, `warn`, `error`. A root flag |
| `migrate-on-startup` | `SITREP_MIGRATE_ON_STARTUP` | Run pending migrations when the server starts |
| `insecure-local-auth` | `SITREP_INSECURE_LOCAL_AUTH` | Fixed local user instead of OIDC. Development only |
| `graphql-introspection` | `SITREP_GRAPHQL_INTROSPECTION` | Enable introspection and the playground |
| `port` | `SITREP_PORT` | Listen port, default `4180` |
| `auto-close-incidents`, `auto-archive-incidents` | `SITREP_AUTO_CLOSE_INCIDENTS`, `SITREP_AUTO_ARCHIVE_INCIDENTS` | Retention, disabled by default. See [Incident Retention](Incident%20Retention.md) |

The complete list (OIDC, attachments, map tiles, TLS/ACME, telemetry, legacy environment variable names) is
the administrator configuration reference on the website:
<https://sitrep.ch/docs/admin/reference/konfiguration/>. Run `go run . serve --help` for the flags of your
build.

## Observability (optional)

To export OpenTelemetry traces, metrics and logs, set these environment variables before starting the Go
server. The OTel SDK reads them directly, so they cannot be set in `config.yaml`:

```sh
export OTEL_EXPORTER_OTLP_ENDPOINT=https://your-apm-endpoint:443
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=ApiKey <your-api-key>"
```

Using [direnv](https://direnv.net/) with an `.envrc` file in the repository root is the recommended way to
manage these. Without `OTEL_EXPORTER_OTLP_ENDPOINT` the SDK is skipped and nothing is exported.
