#!/usr/bin/env bash
# Behavioural tests for the chart: renders scenarios and asserts on the output.
# Usage: helm/ci/test.sh   (needs only the helm binary)
set -uo pipefail

CHART="$(cd "$(dirname "$0")/.." && pwd)"
CI="$CHART/ci"
fail=0

render() { helm template t "$CHART" "$@" 2>&1; }

ok()   { echo "ok   - $1"; }
bad()  { echo "FAIL - $1"; fail=1; }

# expect_render <name> <grep -E pattern> <helm args...>
expect_render() {
  local name=$1 pat=$2; shift 2
  if render "$@" | grep -Eq -- "$pat"; then ok "$name"; else bad "$name (missing: $pat)"; fi
}
# expect_absent <name> <pattern> <helm args...>
expect_absent() {
  local name=$1 pat=$2; shift 2
  if render "$@" | grep -Eq -- "$pat"; then bad "$name (unexpected: $pat)"; else ok "$name"; fi
}
# expect_fail <name> <message fragment> <helm args...>
expect_fail() {
  local name=$1 msg=$2; shift 2
  local out; out=$(render "$@")
  if [ $? -ne 0 ] && grep -Fq -- "$msg" <<<"$out"; then ok "$name"; else bad "$name (expected failure containing: $msg)"; fi
}

PG=(-f "$CI/postgres-values.yaml")
HPA=(-f "$CI/hpa-values.yaml")
SQ=(-f "$CI/sqlite-values.yaml")

# --- autoscaling ---------------------------------------------------------
expect_absent  "hpa off by default"                    'kind: HorizontalPodAutoscaler' "${PG[@]}"
expect_render  "hpa renders when enabled"              'kind: HorizontalPodAutoscaler' "${HPA[@]}"
expect_absent  "deployment omits replicas with hpa"    '^  replicas:' "${HPA[@]}"
expect_render  "deployment sets replicas without hpa"  '^  replicas: 1' "${PG[@]}"
expect_render  "pdb with hpa"                          'kind: PodDisruptionBudget' "${HPA[@]}"
expect_absent  "no pdb for a single replica"           'kind: PodDisruptionBudget' "${PG[@]}"
expect_render  "spread across nodes when scaled out"   'topologySpreadConstraints' "${HPA[@]}"
expect_fail    "hpa rejected with sqlite"              'SQLite is a single-writer' "${SQ[@]}" --set autoscaling.enabled=true --set secrets.cookieKey=x
expect_fail    "replicas>1 rejected with sqlite"       'SQLite is a single-writer' "${SQ[@]}" --set replicaCount=2
expect_fail    "hpa needs a cookie key"                'stable cookie key' "${PG[@]}" --set autoscaling.enabled=true
expect_fail    "hpa needs a cpu request"               'resources.requests.cpu' "${HPA[@]}" --set resources=null
expect_fail    "hpa rejects filesystem attachments"    'not shared between pods' "${HPA[@]}" --set attachments.backend=filesystem

# --- database / migrations ----------------------------------------------
expect_render  "postgres migrates with a hook job"     'helm.sh/hook": pre-install,pre-upgrade' "${PG[@]}"
expect_absent  "postgres does not migrate on startup"  'migrate-on-startup' "${PG[@]}"
expect_render  "sqlite migrates on startup"            'migrate-on-startup' "${SQ[@]}"
expect_render  "sqlite uses Recreate rollout"          'type: Recreate' "${SQ[@]}"
expect_render  "sqlite mounts the volume"              'kind: PersistentVolumeClaim' "${SQ[@]}"
expect_fail    "sqlite needs persistence"              'requires persistence.enabled' "${SQ[@]}" --set persistence.enabled=false
expect_fail    "postgres needs a database url"         'requires either secrets.existingSecret' --set database.type=postgres
expect_fail    "startup migrations rejected at scale"  'races between replicas' "${HPA[@]}" --set migrations.mode=startup
expect_absent  "existingSecret creates no Secret"      'kind: Secret' "${HPA[@]}" --set secrets.existingSecret=mine --set database.postgres.url= --set secrets.oidcClientSecret= --set secrets.cookieKey=

# --- rollout / shutdown ---------------------------------------------------
expect_render  "zero-unavailable rolling update"       'maxUnavailable: 0' "${PG[@]}"
expect_render  "preStop sleep before shutdown"         'seconds: 5' "${PG[@]}"
expect_render  "readiness uses /ready"                 'path: /ready' "${PG[@]}"
expect_render  "liveness uses /health"                 'path: /health' "${PG[@]}"

# --- image ---------------------------------------------------------------
expect_render  "mutable tag is always pulled"          'imagePullPolicy: Always' "${PG[@]}" --set image.tag=develop
expect_render  "versioned tag is pulled if absent"     'imagePullPolicy: IfNotPresent' "${PG[@]}" --set image.tag=v26.11.0
expect_render  "digest wins over tag"                  'sitrep@sha256:abc' "${PG[@]}" --set image.tag=v1 --set image.digest=sha256:abc

# --- operations ----------------------------------------------------------
expect_render  "secret version rolls pods"             'sitrep.ch/secret-version: "2"' "${PG[@]}" --set secrets.version=2
expect_absent  "no secret-version annotation by default" 'secret-version' "${PG[@]}"
expect_absent  "networkpolicy is opt-in"               'kind: NetworkPolicy' "${PG[@]}"
expect_fail    "networkpolicy needs egress rules"      'networkPolicy.egress' "${PG[@]}" --set networkPolicy.enabled=true
expect_render  "networkpolicy renders"                 'kind: NetworkPolicy' "${PG[@]}" --set networkPolicy.enabled=true --set 'networkPolicy.egress[0].ports[0].port=5432'
expect_render  "memory limit raised, request kept"     'memory: 1Gi' "${PG[@]}"
expect_render  "memory request kept"                  'memory: 128Mi' "${PG[@]}"

exit $fail
