# Sitrep

![Lage](docs/images/Lage1.png?raw=true "Lage")
![Lage2](docs/images/Lage2.png?raw=true "Lage2")
![Overview](docs/images/IncidentOverview.png?raw=true "Overview")
![Editor](docs/images/MessageEditor.png?raw=true "Message Editor")
![Feed](docs/images/JournalFeed.png?raw=true "Feed")
![Triage](docs/images/Triage.png?raw=true "Triage")

## Demo-Environment

The current develop version is automatically deployed to: [https://demo.sitrep.ch](https://demo.sitrep.ch)
Login is possible with your Github account or sign-up for a new account at Auth0.

### Local Development Environment

A simple local development environment can be created using docker compose and the frontend can be run using yarn.

1. Install docker / docker compose and yarn / node 16+

2. Create a .env.local file setting these variables:

Oauth2_PROXY clients can be created using Auth0....

```
OAUTH2_PROXY_CLIENT_ID=sitrep
OAUTH2_PROXY_CLIENT_SECRET=ds8LCRW4jhB58nWdMgZHeVISqx3O3e1o3g0LEr9H8tM=   # generate with: openssl rand -base64 32 | tr -- '+/' '-_'
OAUTH2_PROXY_COOKIE_SECRET=kvicWov5Y_w10r2vmnxJTUTugMUtBp6_R4loxuANMtg= # generate with: openssl rand -base64 32 | tr -- '+/' '-_'
HASURA_GRAPHQL_ADMIN_SECRET=388HMfQ00gEyg636O63S1jxRODTSoAiu_XHa0fXhtRo=  # generate with: openssl rand -base64 32 | tr -- '+/' '-_'
POSTGRES_PASSWORD=postgrespassword

OAUTH2_PROXY_REDIRECT_URL=http://localhost:3000/oauth2/callback # port for yarn dev server%
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

5. Open [localhost:3000](http://localhost:3000/). This will automatically proxy to the OAUTH2 proxy which will then proxy requests towards the graphql-engine with its /v1/graphql. Authentication will be handled by the local dex IDP with it's mock provider. Just click on **Log in with Example**.

### Translations

To correct or add **translations** we invite you to help us out [on Transifex](https://explore.transifex.com/f-eld/sitrep/).
We currently support the following languages:
- German (de)
- English (en)
- Italian (it)
- French (fr)
