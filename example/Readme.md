# Example Setup Sitrep

This shows how to start sitrep with a local DEX IDP.

Prerequisites:

- docker / docker compose
- caddy webserver (every other reverse proxy would work as well, nginx, apache, etc.)

## Configuration

All configuration can be done in the .env and the Caddyfile file:

### Caddyfile

set the hostname in the caddyfile server block:

```diff
- sitrep.local, 192.168.9.2 {
+ myserver.example.com {

```

### .env file

- Make sure to set the SITREP_HOSTNAME to the same thing you set in the Caddyfile.
- regenerate all secrets as mentioned in the file

## Run Sitrep

1. Start Caddy webserver (from this directory):

```
$ caddy run
```

2. Run Docker Compose

```
docker-compose --env-file .env up -d
```

3. Access the Sitrep server on https://${SITREP_HOST}
