# Deploying SitRep on Kubernetes with Helm

The chart lives in [`helm/`](../../helm) and is published as an OCI artifact:

```bash
helm install sitrep oci://ghcr.io/f-eld-ch/charts/sitrep --version <chart-version> -f values.yaml
```

The chart is versioned **independently of the app**: SemVer for the chart (`1.2.0`), CalVer for the app
(`v26.11.1`).

| Published by | Chart version | appVersion |
|---|---|---|
| tag `chart-v1.2.0` | `1.2.0`, exactly the `version` in `Chart.yaml` | the app release it was tested with, e.g. `v26.11.1` |
| push to `develop` | `0.0.0-develop.<run>.<sha>` | `develop` |
| pull request | `<Chart.yaml version>-pr.<number>.<run>`, packaged but **never pushed** | `develop` |

Charts are pushed only from `develop` and from `chart-v*` tags that sit on a `develop` commit. A release
never overwrites an already published version.

### Releasing the chart

1. Change the chart, and bump `version` in `helm/Chart.yaml` (patch = fix, minor = new values,
   major = breaking values). Update `appVersion` if the chart now needs a newer app.
2. Merge to `develop`.
3. Run `./scripts/release.sh --chart` (add `--bump patch|minor|major` to bump the version for you), or push
   the tag `chart-v<version>` yourself. The workflow refuses a tag that differs from `Chart.yaml`, requires
   `appVersion` to be a released app tag whose image exists, then publishes and signs the chart.

An app release (`vYY.M.P`) does not publish a chart, and a chart release does not need a new app release.

### Charts and Kargo Freight

A Freight is a tested **pair**: one app image and one chart version, chosen independently by the Warehouse.
Demo proves the pair, and customers only accept Freight that passed demo.

- `develop` Warehouse: image `develop` (by digest) + chart `>=0.0.0-0 <0.0.1` (develop builds).
- `releases` Warehouse: image `^v\d+\.\d+\.\d+$` + chart `>=1.0.0`. The constraint excludes develop builds,
  pre-releases and anything before the first release, so customers can only ever get a released chart.

Because the two move separately, `appVersion` is a floor: a chart may require features of a newer app
(for example the `/ready` database check), and demo is where an incompatible pair is caught.

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
1.34+) gives endpoint removal time to propagate before the server stops accepting connections.

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
3. A released chart is signed with
   cosign (keyless): `cosign verify ghcr.io/f-eld-ch/charts/sitrep:<version>
   --certificate-identity-regexp 'https://github.com/f-eld-ch/sitrep/' --certificate-oidc-issuer https://token.actions.githubusercontent.com`.

## Promotion with Kargo

Kargo should update `image.tag` (or `image.digest`) in the environment's values file. Leaving
`image.tag` empty deploys the chart's appVersion.
