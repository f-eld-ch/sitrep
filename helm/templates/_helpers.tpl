{{- define "sitrep.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "sitrep.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "sitrep.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "sitrep.labels" -}}
helm.sh/chart: {{ include "sitrep.chart" . }}
{{ include "sitrep.selectorLabels" . }}
app.kubernetes.io/version: {{ .Values.image.tag | default .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "sitrep.selectorLabels" -}}
app.kubernetes.io/name: {{ include "sitrep.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "sitrep.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "sitrep.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{- define "sitrep.image" -}}
{{- if .Values.image.digest -}}
{{- printf "%s@%s" .Values.image.repository .Values.image.digest -}}
{{- else -}}
{{- printf "%s:%s" .Values.image.repository (.Values.image.tag | default .Chart.AppVersion) -}}
{{- end -}}
{{- end }}

{{/* Pull policy: explicit value wins; mutable tags (develop, stable, ...) are always re-pulled, immutable tags and digests are not. */}}
{{- define "sitrep.pullPolicy" -}}
{{- if .Values.image.pullPolicy -}}
{{- .Values.image.pullPolicy -}}
{{- else if .Values.image.digest -}}
IfNotPresent
{{- else -}}
{{- $tag := .Values.image.tag | default .Chart.AppVersion -}}
{{- if or (has $tag (list "develop" "stable" "latest" "edge")) (hasPrefix "pr-" $tag) -}}Always{{- else -}}IfNotPresent{{- end -}}
{{- end -}}
{{- end }}

{{/* Name of the Secret holding database-url / oidc-client-secret / cookie-key. */}}
{{- define "sitrep.secretName" -}}
{{- default (include "sitrep.fullname" .) .Values.secrets.existingSecret }}
{{- end }}

{{- define "sitrep.createSecret" -}}
{{- if not .Values.secrets.existingSecret }}true{{- end }}
{{- end }}

{{- define "sitrep.isPostgres" -}}
{{- if eq .Values.database.type "postgres" }}true{{- end }}
{{- end }}

{{/* Effective migration mode: "auto" is a hook Job for postgres and on-startup for sqlite. */}}
{{- define "sitrep.migrationMode" -}}
{{- if eq .Values.migrations.mode "auto" -}}
{{- if eq .Values.database.type "postgres" }}job{{ else }}startup{{ end -}}
{{- else -}}
{{- .Values.migrations.mode -}}
{{- end -}}
{{- end }}

{{/* True when more than one pod can run at the same time. */}}
{{- define "sitrep.multiReplica" -}}
{{- if or .Values.autoscaling.enabled (gt (int .Values.replicaCount) 1) }}true{{- end }}
{{- end }}

{{/* Cross-field validation. Fails the render with an actionable message. */}}
{{- define "sitrep.validate" -}}
{{- if not (has .Values.database.type (list "postgres" "sqlite")) -}}
{{- fail "database.type must be 'postgres' or 'sqlite'" -}}
{{- end -}}
{{- if and (eq .Values.database.type "sqlite") (include "sitrep.multiReplica" .) -}}
{{- fail "SQLite is a single-writer file database: autoscaling.enabled must be false and replicaCount must be 1. Use database.type=postgres to run more than one replica." -}}
{{- end -}}
{{- if and (eq .Values.database.type "sqlite") (not .Values.persistence.enabled) -}}
{{- fail "database.type=sqlite requires persistence.enabled=true, otherwise the database is lost whenever the pod restarts." -}}
{{- end -}}
{{- if and (eq .Values.database.type "postgres") (not .Values.secrets.existingSecret) (not .Values.database.postgres.existingSecret) (not .Values.database.postgres.url) -}}
{{- fail "database.type=postgres requires database.postgres.existingSecret, secrets.existingSecret (key 'database-url') or database.postgres.url." -}}
{{- end -}}
{{- if and .Values.autoscaling.enabled (not (dig "requests" "cpu" "" (.Values.resources | default dict))) -}}
{{- fail "autoscaling.enabled requires resources.requests.cpu: utilization targets are relative to the CPU request." -}}
{{- end -}}
{{- if and .Values.autoscaling.enabled (not .Values.autoscaling.targetCPUUtilizationPercentage) (not .Values.autoscaling.targetMemoryUtilizationPercentage) -}}
{{- fail "autoscaling.enabled requires targetCPUUtilizationPercentage and/or targetMemoryUtilizationPercentage." -}}
{{- end -}}
{{- if and (include "sitrep.multiReplica" .) (not .Values.secrets.existingSecret) (not .Values.secrets.cookieKey) -}}
{{- fail "Running more than one replica requires a stable cookie key (secrets.cookieKey or key 'cookie-key' in secrets.existingSecret). Without it every pod generates its own key and sessions break when requests hit another pod." -}}
{{- end -}}
{{- if and (include "sitrep.multiReplica" .) (eq .Values.attachments.backend "filesystem") -}}
{{- fail "attachments.backend=filesystem is not shared between pods. Use backend 'database' (default with postgres) when running more than one replica." -}}
{{- end -}}
{{- if and (eq (include "sitrep.migrationMode" .) "startup") (include "sitrep.multiReplica" .) -}}
{{- fail "migrations.mode=startup races between replicas. Use migrations.mode=job (default for postgres)." -}}
{{- end -}}
{{- if and .Values.networkPolicy.enabled (not .Values.networkPolicy.egress) -}}
{{- fail "networkPolicy.enabled requires networkPolicy.egress rules for the database and OIDC provider; otherwise the pod cannot reach them." -}}
{{- end -}}
{{- include "sitrep.validateMapTiles" . -}}
{{- end }}

{{/* How the map tile volume is provided: "" (tiles off), "pvc" or "ephemeral". */}}
{{- define "sitrep.tilesVolumeKind" -}}
{{- if .Values.mapTiles.enabled -}}
{{- $type := .Values.mapTiles.persistence.type | default "auto" -}}
{{- if eq $type "auto" -}}
{{- if include "sitrep.multiReplica" . }}ephemeral{{ else }}pvc{{ end -}}
{{- else -}}
{{- $type -}}
{{- end -}}
{{- end -}}
{{- end }}

{{/* Validation of the mapTiles values. Included by sitrep.validate. */}}
{{- define "sitrep.validateMapTiles" -}}
{{- if .Values.mapTiles.enabled -}}
{{- if not (has (.Values.mapTiles.persistence.type | default "auto") (list "auto" "pvc" "ephemeral")) -}}
{{- fail "mapTiles.persistence.type must be 'auto', 'pvc' or 'ephemeral'" -}}
{{- end -}}
{{- $kind := include "sitrep.tilesVolumeKind" . -}}
{{- if and (eq $kind "pvc") (include "sitrep.multiReplica" .) -}}
{{- fail "mapTiles.persistence.type=pvc cannot be used with more than one replica: a ReadWriteOnce volume is attached to one pod. Use 'ephemeral' (the default for several replicas): every pod then gets and downloads its own copy." -}}
{{- end -}}
{{- if and (eq $kind "ephemeral") .Values.mapTiles.persistence.existingClaim -}}
{{- fail "mapTiles.persistence.existingClaim only works with type 'pvc' (one replica)." -}}
{{- end -}}
{{- if and (eq $kind "ephemeral") (not .Values.mapTiles.autoDownload) -}}
{{- fail "mapTiles.autoDownload=false leaves the per-pod tile volumes empty forever. Enable autoDownload, or run a single replica with a PVC that you fill yourself." -}}
{{- end -}}
{{- $tiles := .Values.mapTiles.mountPath | trimSuffix "/" -}}
{{- $data := .Values.persistence.mountPath | trimSuffix "/" -}}
{{- if or (eq $tiles $data) (hasPrefix (printf "%s/" $data) $tiles) (hasPrefix (printf "%s/" $tiles) $data) -}}
{{- fail "mapTiles.mountPath must not be the same as, or inside, persistence.mountPath (or the other way round): the two volumes would overlap." -}}
{{- end -}}
{{- end -}}
{{- end }}
