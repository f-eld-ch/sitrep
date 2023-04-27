# Sitrep
![Lage](docs/images/Lage1.png?raw=true "Lage")
![Lage2](docs/images/Lage2.png?raw=true "Lage2")
![Overview](docs/images/IncidentOverview.png?raw=true "Overview")
![Editor](docs/images/MessageEditor.png?raw=true "Message Editor")
![Feed](docs/images/JournalFeed.png?raw=true "Feed")
![Triage](docs/images/Triage.png?raw=true "Triage")

## Demo-Environment

The current develop version is automatically deployed to: [https://sitrep-dev.zso-uri.ch](https://sitrep-dev.zso-uri.ch)
Login is possible with your Github account.

### Local Development Environment

A simple local development environment can be created using docker compose and the frontend can be run using yarn.

1. Install docker / docker compose and yarn / node 16+

2. Create a .env.local file setting these variables:

Oauth2_PROXY clients can be created using Auth0....

```
OAUTH2_PROXY_CLIENT_ID=...
OAUTH2_PROXY_CLIENT_SECRET=...
OAUTH2_PROXY_OIDC_ISSUER_URL=https://${TENANT.eu.auth0.com/
HASURA_GRAPHQL_JWT_SECRET='{"type":"RS256","key":"-----BEGIN CERTIFICATE-----\n
...
}\n-----END CERTIFICATE-----\n","header":{"type":"Authorization"},"claims_map":{"x-hasura-user-id":{"path":"$.sub"},"x-hasura-email":{"path":"$.email"},"x-hasura-allowed-roles":["user","editor"],"x-hasura-default-role":"user"}}'
POSTGRES_PASSWORD=postgrespassword
HASURA_GRAPHQL_ADMIN_SECRET: myadminsecretkey
```

3. Run docker compose environment:

```
docker compose --env-file .env.local up -d
```

4. Run yarn

```
yarn start
```

5. Open [localhost:4180](http://localhost:4180/) and not the default port 3000. Port 4180 is the OAUTH2 proxy which will then proxy requests towards the yarn started nodejs server which will then proxy /api/graphql towards the Hasura backend.
