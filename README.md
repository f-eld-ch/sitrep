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
OAUTH2_PROXY_OIDC_ISSUER_URL=https://${TENANT}.eu.auth0.com/
HASURA_GRAPHQL_JWT_SECRET='{"type":"RS256","key":"-----BEGIN CERTIFICATE-----\n
...
}\n-----END CERTIFICATE-----\n","header":{"type":"Authorization"},"claims_map":{"x-hasura-user-id":{"path":"$.sub"},"x-hasura-email":{"path":"$.email"},"x-hasura-allowed-roles":["user","editor"],"x-hasura-default-role":"user"}}'
POSTGRES_PASSWORD=postgrespassword
HASURA_GRAPHQL_ADMIN_SECRET=myadminsecretkey
```

3. Run docker compose environment:

```
docker compose --env-file .env.local up -d
```

4. Run yarn

```
yarn start
```

5. Open [localhost:3000](http://localhost:3000/). This will automatically proxy to the OAUTH2 proxy which will then proxy requests towards the graphql-engine with its /v1/graphql


### Translations

* To correct or add **translations** we invite you to help us out [on Weblate](https://hosted.weblate.org/projects/sitrep).<br>
[![Translation status](https://hosted.weblate.org/widgets/sitrep/-/287x66-grey.png)](https://hosted.weblate.org/engage/sitrep/)