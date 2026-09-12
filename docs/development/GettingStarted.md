## Getting Started

### Local Development Environment

A simple local development environment uses Docker Compose for infrastructure (Postgres + Dex OIDC) and runs the Go server and UI dev server locally.

1. Install docker / docker compose and yarn / node (see `.nvmrc` for the pinned version)

2. Create a `config.yaml` in the repo root for the Go server (this file is gitignored):

```yaml
oidc-issuer: "http://localhost:5556/dex"
oidc-client-id: "sitrep"
oidc-client-secret: "ds8LCRW4jhB58nWdMgZHeVISqx3O3e1o3g0LEr9H8tM="  # generate with: openssl rand -base64 32 | tr -- '+/' '-_'
oidc-redirect-url: "http://localhost:3000/oauth2/callback"
cookie-key: "0123456789abcdef0123456789abcdef"                        # generate with: openssl rand -hex 16

database-url: "postgres://postgres:postgrespassword@localhost:15432/postgres?sslmode=disable"
# Or use the embedded SQLite backend (no Docker needed):
# database-url: "sqlite://sitrep.db"
migrate-on-startup: true  # required on first run; the database schema does not exist until migrations have run

graphql-introspection: true  # enables /api/v2/graphql/play
```

3. Create a `.env.local` in the repo root for Docker Compose (sets the Postgres password and Dex OIDC client):

```
OIDC_CLIENT_ID=sitrep
OIDC_CLIENT_SECRET=ds8LCRW4jhB58nWdMgZHeVISqx3O3e1o3g0LEr9H8tM=
POSTGRES_PASSWORD=postgrespassword
```

4. Start the infrastructure (Postgres + Dex):

```
docker compose --env-file .env.local up -d
```

On SELinux machines use the selinux compose file:

```
docker compose -f docker-compose.selinux.yml --env-file .env.local up -d
```

5. Build the UI once so the Go binary can embed it:

```
cd ui && yarn install && yarn build && cd ..
```

The Go server embeds `ui/build` via `go:embed` at compile time, so this directory must exist and contain a build before `go run .` will even compile.

6. Start the Go backend server (by default, reads `config.yaml` from the working directory):

```
go run .
```

To use a configuration file elsewhere, pass its path explicitly. An explicit path must exist and
contain valid YAML:

```
go run . --config /path/to/config.yaml
```

Or build and run the binary:

```
go build -o sitrep . && ./sitrep serve
```

7. Start the UI dev server:

```
cd ui && yarn start
```

8. Open [localhost:3000](http://localhost:3000/). The Vite dev server proxies `/api/v2/graphql` and `/oauth2` to the Go server at `:4180`. Authentication is handled by the local Dex IDP — click **Log in with Example**.

The GraphQL playground is available at [localhost:4180/api/v2/graphql/play](http://localhost:4180/api/v2/graphql/play) when `graphql-introspection: true` is set in `config.yaml`.

### SQLite backend (no Docker required)

The server supports an embedded SQLite backend suitable for single-machine deployments and
local development without Docker:

```yaml
database-url: "sqlite://sitrep.db"   # relative path — file created next to config.yaml
# database-url: "sqlite:///abs/path/to/sitrep.db"  # absolute path
```

Run migrations then start the server as usual:

```bash
go run . migrate up --database-url sqlite://sitrep.db
go run .
```

**Constraints:**
- Only one server process may open the database at a time. A second process will see busy errors.
- The file attachment backend defaults to `filesystem` (the `database` backend requires Postgres).
- `config.dev.yaml` (used by `go run .` without an explicit `--config`) is pre-configured to use
  `sqlite://dev.sqlite3` in the working directory so that routine local runs require no Docker.

### Server Configuration

Every configuration-backed CLI flag also has a YAML key with the same name and a canonical
`SITREP_*` environment variable. Values take precedence in this order: CLI flags, environment
variables, configuration file, then defaults.

| Flag / YAML key | Canonical environment variable | Legacy environment variables |
| --- | --- | --- |
| `log-level` | `SITREP_LOG_LEVEL` | `LOG_LEVEL` |
| `database-url` | `SITREP_DATABASE_URL` | `DATABASE_URL` |
| `port` | `SITREP_PORT` | `SITREP_SERVER_PORT`, `SERVER_PORT` |
| `oidc-client-id` | `SITREP_OIDC_CLIENT_ID` | `OIDC_CLIENT_ID`, `OAUTH2_PROXY_CLIENT_ID` |
| `oidc-issuer` | `SITREP_OIDC_ISSUER` | `OIDC_ISSUER`, `OAUTH2_PROXY_OIDC_ISSUER_URL` |
| `oidc-client-secret` | `SITREP_OIDC_CLIENT_SECRET` | `OIDC_CLIENT_SECRET`, `OAUTH2_PROXY_CLIENT_SECRET` |
| `oidc-redirect-url` | `SITREP_OIDC_REDIRECT_URL` | `OIDC_REDIRECT_URL`, `OAUTH2_PROXY_REDIRECT_URL` |
| `cookie-key` | `SITREP_COOKIE_KEY` | `COOKIE_KEY`, `OAUTH2_PROXY_COOKIE_SECRET`, `OIDC_COOKIE_KEY` |
| `graphql-introspection` | `SITREP_GRAPHQL_INTROSPECTION` | `GRAPHQL_INTROSPECTION` |
| `migrate-on-startup` | `SITREP_MIGRATE_ON_STARTUP` | `MIGRATE_ON_STARTUP` |
| `auto-close-incidents` | `SITREP_AUTO_CLOSE_INCIDENTS` | — |
| `auto-archive-incidents` | `SITREP_AUTO_ARCHIVE_INCIDENTS` | — |

`log-level` and `database-url` are root flags. The remaining flags are specific to `sitrep serve`.
`--config` selects the YAML file and does not have an environment-variable counterpart.

Retention is disabled by default. See [Incident Retention](Incident%20Retention.md) to configure
and operate it.

### Observability (optional)

To enable OTEL tracing and metrics export, set these environment variables before starting the Go server (the OTel SDK reads them directly — they cannot be set in `config.yaml`):

```sh
export OTEL_EXPORTER_OTLP_ENDPOINT=https://your-apm-endpoint:443
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=ApiKey <your-api-key>"
```

Using [direnv](https://direnv.net/) with an `.envrc` file in the repo root is the recommended way to manage these.
