## Getting Started

### Local Development Environment

A simple local development environment can be created using docker compose and the frontend can be run using yarn.

1. Install docker / docker compose and yarn / node 16+

2. Create a .env.local file setting these variables:

OIDC clients can be created using Auth0, Keycloak, Dex, or any other OIDC provider.

```
OIDC_CLIENT_ID=sitrep
OIDC_CLIENT_SECRET=ds8LCRW4jhB58nWdMgZHeVISqx3O3e1o3g0LEr9H8tM=   # generate with: openssl rand -base64 32 | tr -- '+/' '-_'
COOKIE_KEY=kvicWov5Y_w10r2vmnxJTUTugMUtBp6_R4loxuANMtg=            # generate with: openssl rand -base64 32 | tr -- '+/' '-_'
POSTGRES_PASSWORD=postgrespassword
DATABASE_URL=postgres://postgres:postgrespassword@localhost:5432/postgres?sslmode=disable

OIDC_REDIRECT_URL=http://localhost:3000/oauth2/callback # port for yarn dev server
```

3. Run docker compose environment:

```
docker compose --env-file .env.local up -d
```

If you are running on a SElinux enabled machine, use the selinux compose file:

```
docker compose -f docker-compose.selinux.yml --env-file .env.local up -d
```

4. Run yarn

```
cd ui && yarn start
```

5. Open [localhost:3000](http://localhost:3000/). The Vite dev server proxies `/api/v2/graphql` and `/oauth2` to the Go server at `:4180`. Authentication is handled by the local Dex IDP — click **Log in with Example**.


6. Start go backend server