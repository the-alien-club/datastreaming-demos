{{/*
Expand the name of the chart.
*/}}
{{- define "openaire-corpus.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "openaire-corpus.fullname" -}}
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

{{/*
Chart name and version for the chart label.
*/}}
{{- define "openaire-corpus.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "openaire-corpus.labels" -}}
helm.sh/chart: {{ include "openaire-corpus.chart" . }}
{{ include "openaire-corpus.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "openaire-corpus.selectorLabels" -}}
app.kubernetes.io/name: {{ include "openaire-corpus.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
In-cluster DNS name of the app Service. Used both as the worker's progress
callback host (WORKER_CALLBACK_BASE_URL / APP_BASE_URL) and nowhere else —
keep the two in lock-step so the worker's callback host allow-list passes.
Port 80 is the http default, so it is intentionally omitted from the URL.
*/}}
{{- define "openaire-corpus.appInternalUrl" -}}
{{- printf "http://%s.%s.svc.cluster.local" (include "openaire-corpus.fullname" .) .Values.namespace }}
{{- end }}

{{/*
In-cluster DNS name of the worker HTTP API (app → worker job submit).
*/}}
{{- define "openaire-corpus.workerInternalUrl" -}}
{{- printf "http://%s-worker.%s.svc.cluster.local:%d" (include "openaire-corpus.fullname" .) .Values.namespace (int .Values.worker.service.port) }}
{{- end }}
