{{/* Environment shared by the server pods and the migration Job. */}}
{{- define "sitrep.env" -}}
- name: SITREP_DATABASE_URL
  {{- if eq .Values.database.type "postgres" }}
  valueFrom:
    secretKeyRef:
      name: {{ default (include "sitrep.secretName" .) .Values.database.postgres.existingSecret }}
      key: {{ .Values.database.postgres.urlKey | default "database-url" }}
  {{- else }}
  value: {{ printf "sqlite://%s/%s" (.Values.persistence.mountPath | trimSuffix "/") .Values.database.sqlite.file | quote }}
  {{- end }}
- name: SITREP_PORT
  value: {{ .Values.containerPort | quote }}
- name: SITREP_LOG_LEVEL
  value: {{ .Values.logLevel | quote }}
{{- end }}
