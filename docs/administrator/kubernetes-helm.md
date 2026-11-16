# Deploying SitRep on Kubernetes with Helm

The chart lives in [`helm/`](../../helm) and is published as an OCI artifact:

```bash
helm install sitrep oci://ghcr.io/f-eld-ch/charts/sitrep --version <chart-version> -f values.yaml
```

Release tags `vYY.M.P` publish chart version `YY.M.P` (appVersion `vYY.M.P`). Pushes to `develop`
publish `0.0.0-develop.<sha>` with appVersion `develop`.

## Postgres (recommended, supports autoscaling)

Create a Secret (via External Secrets, Sealed Secrets, ...) with the keys `database-url`,
`oidc-client-secret` and `cookie-key`, then:

```yaml
secrets:
  existingSecret: sitrep
oidc:
  clientId: sitrep
  issuer: https://idp.example.com
  redirectUrl: https://sitrep.example.com/oauth2/callback
ingress:
  enabled: true
  hosts:
    - host: sitrep.example.com
      paths: [{ path: / }]
```

Migrations run as a `pre-install,pre-upgrade` hook Job (`sitrep migrate up`), which ArgoCD executes
as a PreSync hook, so replicas never race on the schema.

## Horizontal pod autoscaling (opt-in)

```yaml
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 6
  targetCPUUtilizationPercentage: 70
```

The chart refuses to render (with an explanatory message) when autoscaling or `replicaCount > 1` is
combined with SQLite, a missing `cookie-key` (each pod would otherwise sign sessions with its own
random key), the `filesystem` attachment backend, or no `resources.requests.cpu`. When enabled,
`spec.replicas` is omitted from the Deployment so ArgoCD does not fight the HPA.

## SQLite (single replica)

```yaml
database: { type: sqlite }
persistence: { enabled: true }
```

Uses a `Recreate` rollout, a PVC and `--migrate-on-startup`.

## Operations

**Readiness and liveness.** `/health` (liveness) never touches the database, so a database outage does
not restart pods. `/ready` (readiness) pings PostgreSQL and fails during shutdown, so a pod that cannot
reach the database is taken out of the Service. A `preStop` sleep (`preStopSleepSeconds`, Kubernetes
1.30+) gives endpoint removal time to propagate before the server stops accepting connections.

**Rotating secrets.** The chart cannot see the content of `secrets.existingSecret`, and pods read
it only at start. After a rotation, change `secrets.version` (any string) in the values file to roll the
pods; ArgoCD syncs it like any other change. If you run a rollout-on-change controller, set its
annotation through `podAnnotations` instead.

**Image pinning.** `image.pullPolicy` is automatic: `Always` for mutable tags (`develop`, `stable`,
`latest`, `pr-*`), `IfNotPresent` for version tags and digests. Environments should pin a version tag
or `image.digest`.

**Network and ingress.** `networkPolicy.enabled` restricts ingress to `networkPolicy.ingressFrom` and
egress to DNS plus `networkPolicy.egress` (database, OIDC provider, telemetry). Attachments go up to
25 MB: raise the ingress controller's body limit (ingress-nginx:
`nginx.ingress.kubernetes.io/proxy-body-size: 30m`).

**Spreading.** With more than one replica pods are softly spread across nodes and rolled with
`maxUnavailable: 0`; a PodDisruptionBudget keeps one pod available during node drains.

## Releases, migrations and rollback

Read this before promoting automatically.

1. **Migrations run before the new pods start.** The hook Job upgrades the schema while the previous
   release is still serving. Every migration must therefore stay compatible with the previous release
   (expand first, remove columns/tables one release later).
2. **Rollbacks across a projection change fail.** When a handler's `Version()` was bumped, the new
   release rebuilds the read model. An older image then refuses to start (`projection is newer than
   this build`) and crash-loops. Roll forward with a fix, or restore the database; do not simply
   re-promote the previous image. Kargo stages should treat such releases as not auto-revertible.
3. The chart is only published for a release tag once the matching image exists, and it is signed with
   cosign (keyless): `cosign verify ghcr.io/f-eld-ch/charts/sitrep:<version>
   --certificate-identity-regexp 'https://github.com/f-eld-ch/sitrep/' --certificate-oidc-issuer https://token.actions.githubusercontent.com`.

## Promotion with Kargo

Kargo should update `image.tag` (or `image.digest`) in the environment's values file. Leaving
`image.tag` empty deploys the chart's appVersion.
