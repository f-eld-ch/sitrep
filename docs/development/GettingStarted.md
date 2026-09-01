## Getting Started

### Local Development Environment

A simple local development environment uses Docker Compose for infrastructure (Postgres + Dex OIDC) and runs the Go server and UI dev server locally.

1. Install docker / docker compose and yarn / node (see `.nvmrc` for the pinned version)

2. Create a `config.yaml` in the repo root for the Go server (this file is gitignored):

```yaml
oidc_issuer: "http://localhost:5556/dex"
oidc_client_id: "sitrep"
oidc_client_secret: "ds8LCRW4jhB58nWdMgZHeVISqx3O3e1o3g0LEr9H8tM="  # generate with: openssl rand -base64 32 | tr -- '+/' '-_'
oidc_redirect_url: "http://localhost:3000/oauth2/callback"
cookie_key: "0123456789abcdef0123456789abcdef"                        # generate with: openssl rand -hex 16

database_url: "postgres://postgres:postgrespassword@localhost:5432/postgres?sslmode=disable"

graphql_introspection: true  # enables /api/v2/graphql/play
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

5. Start the Go backend server (reads `config.yaml` from the working directory):

```
go run .
```

Or build and run the binary:

```
go build -o sitrep . && ./sitrep serve
```

6. Start the UI dev server:

```
cd ui && yarn start
```

7. Open [localhost:3000](http://localhost:3000/). The Vite dev server proxies `/api/v2/graphql` and `/oauth2` to the Go server at `:4180`. Authentication is handled by the local Dex IDP — click **Log in with Example**.

The GraphQL playground is available at [localhost:4180/api/v2/graphql/play](http://localhost:4180/api/v2/graphql/play) when `graphql_introspection: true` is set in `config.yaml`.

### Observability (optional)

To enable OTEL tracing and metrics export, set these environment variables before starting the Go server (the OTel SDK reads them directly — they cannot be set in `config.yaml`):

```sh
export OTEL_EXPORTER_OTLP_ENDPOINT=https://your-apm-endpoint:443
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=ApiKey <your-api-key>"
```

Using [direnv](https://direnv.net/) with an `.envrc` file in the repo root is the recommended way to manage these.
