# LDS Chatbot — Helm / ArgoCD Deployment

## Architecture

```
Internet
   │
   ▼
Istio Ingress Gateway          (demo.alien.club:443, shared)
   │   └── /agents    → VirtualService (lds-chatbot)
   ▼
VirtualService                 (namespace: demo-lds-chatbot)
   │
   ▼
Service  ClusterIP:80
   │
   ▼
Deployment  replicas=1         (stateless Next.js app, basePath=/agents)
   │
   └─ Connects to:
      ├─ StatefulSet <release>-postgres:5432  (bundled Postgres, PVC-backed)
      ├─ api.alien.club         (Alien Backend — workflow engine, AI models)
      ├─ mcp.alien.club         (Data Cluster MCP — RAG)
      └─ auth.alien.club        (Authentik — OAuth2/OIDC)
```

**Storage**: a bundled Postgres StatefulSet with a PVC owned by `volumeClaimTemplates` holds all app state (agents, conversations, messages, better-auth sessions). The app pod itself is stateless.

**Gateway / certificate**: by default the chart **attaches** to an existing Istio Gateway that already serves `demo.alien.club` and provisions its own Certificate. The name of that Gateway is supplied via `istio.sharedGatewayName` (required).

## Naming Conventions

| Resource | Value |
|---|---|
| ArgoCD Application | `demo-lds-chatbot-prod` |
| Helm release name | `demo-lds-chatbot-prod` |
| Kubernetes namespace | `demo-lds-chatbot` |
| All resources | prefixed `demo-lds-chatbot-prod-…` |

## Prerequisites

- Kubernetes cluster with:
  - Istio (`ingressgateway` in `istio-system`)
  - An existing Istio Gateway in `istio-system` serving `demo.alien.club` on port 443 with a valid TLS cert
  - external-secrets with `scaleway-secret-manager` ClusterSecretStore
  - Scaleway Secret Manager secret `authentik-prod` with properties `AUTHENTIK_CLIENT_ID` / `AUTHENTIK_CLIENT_SECRET`
- Authentik: redirect URI `https://demo.alien.club/agents/api/auth/oauth2/callback/authentik` registered on the `datastreaming` application

## Build & Push Image

`NEXT_PUBLIC_BASE_PATH=/agents` is baked into the client bundle at build time — must match `istio.path` in `values.yaml`.

```bash
cd datastreaming-demos/lds-chatbot

docker build \
  --build-arg NEXT_PUBLIC_BASE_PATH=/agents \
  -t rg.fr-par.scw.cloud/ns-data-streaming/demo-lds-chatbot:0.1.0 .

docker push rg.fr-par.scw.cloud/ns-data-streaming/demo-lds-chatbot:0.1.0
```

Bump `image.tag` in `helm/lds-chatbot-chart/values.yaml` to match.

## Find the Shared Gateway Name

```bash
kubectl --context platform-prod get vs -A -o wide | grep demo.alien.club
```

The command prints the VirtualService(s) already attached to that host; the `GATEWAYS` column contains the Gateway reference as `istio-system/<name>`. Record `<name>` — you'll pass it to the chart via `istio.sharedGatewayName`.

## Deploy via ArgoCD

`helm/argocd-application.yaml` already pins `istio.sharedGatewayName` to `demo-openaire-prod-gateway` (the Gateway currently serving `demo.alien.club` on platform-prod). If that Gateway is ever renamed/replaced, update the `parameters` block in the Application manifest.

```bash
kubectl --context platform-prod apply -f helm/argocd-application.yaml
```

If `istio.sharedGatewayName` is unset, `helm template` fails fast with a clear error — the Application will show a sync failure in ArgoCD instead of rendering an invalid VirtualService.

ArgoCD sync waves:
- `-2`: ConfigMap, ExternalSecret (Authentik), Secret (BETTER_AUTH_SECRET, Postgres credentials)
- `0` (default): Postgres StatefulSet + Service, app Deployment + Service, VirtualService

Generated-once secrets, preserved across upgrades (`helm.sh/resource-policy: keep`):
- `…-app.BETTER_AUTH_SECRET` — 48 random chars
- `…-postgres.POSTGRES_PASSWORD` — 32 random chars

The Postgres PVC (via `volumeClaimTemplates` + the same annotation) also survives `helm uninstall`.

## Deploy via Helm Directly

```bash
helm upgrade --install demo-lds-chatbot-prod ./helm/lds-chatbot-chart \
  --namespace demo-lds-chatbot \
  --create-namespace \
  --set istio.sharedGatewayName=<gateway-name-from-the-step-above>
```

## Verify

```bash
CTX=platform-prod NS=demo-lds-chatbot
kubectl --context $CTX get pods -n $NS
kubectl --context $CTX logs -n $NS deploy/demo-lds-chatbot-prod -f
kubectl --context $CTX exec -n $NS demo-lds-chatbot-prod-postgres-0 -- \
  psql -U lds_chatbot -d lds_chatbot -c "\dt"
kubectl --context $CTX get pvc -n $NS
kubectl --context $CTX get vs -n $NS -o yaml | grep -A2 gateways:
curl -I https://demo.alien.club/agents
```

## Configuration Knobs

Edit `helm/lds-chatbot-chart/values.yaml` (or pass `--set` / ArgoCD parameters):

| Key | Purpose | Default |
|---|---|---|
| `image.tag` | App container image tag | `0.1.0` |
| `istio.host` | Public hostname | `demo.alien.club` |
| `istio.path` | URI prefix; must match `NEXT_PUBLIC_BASE_PATH` build-arg | `/agents` |
| `istio.sharedGatewayName` | **Required** when `gateway.create: false` | `""` |
| `istio.gateway.create` | Have the chart create its own Gateway | `false` |
| `istio.certificate.enabled` | Have the chart provision a cert-manager Certificate | `false` |
| `config.platformApiUrl` | Alien Backend base URL | `https://api.alien.club` |
| `config.clusterId` | Data cluster ID to query | `77` |
| `config.betterAuthUrl` | better-auth public URL | `https://demo.alien.club/agents` |
| `postgres.persistence.size` | Postgres PVC size | `5Gi` |
| `postgres.resources` | Postgres CPU / memory | 100m/256Mi → 500m/1Gi |
| `resources` | App CPU / memory | 250m/512Mi → 1000m/2Gi |

## Standalone Mode (own Gateway + Cert)

If no shared Gateway exists for your target host, or you want the chart fully self-contained, flip:

```yaml
istio:
  host: chat.example.com
  sharedGatewayName: ""
  gateway:
    create: true
  certificate:
    enabled: true
    issuerName: letsencrypt
```

The chart will then provision its own `Gateway` in `istio.gatewayNamespace` and a `Certificate` in the same namespace.

## Troubleshooting

### App pod `CrashLoopBackOff`
```bash
kubectl --context platform-prod logs -n demo-lds-chatbot deploy/demo-lds-chatbot-prod
```
The entrypoint waits up to ~2 min for Postgres (`pg_isready`), then runs drizzle + better-auth migrations. Most startup failures are visible here.

### Postgres pod stuck `Pending`
PVC unbound — usually a storage class mismatch.
```bash
kubectl --context platform-prod describe pvc -n demo-lds-chatbot data-demo-lds-chatbot-prod-postgres-0
kubectl --context platform-prod get storageclass
```
Leave `postgres.persistence.storageClassName` unset to use the cluster default (on Scaleway that's `sbs-default`).

### OAuth callback fails (400 / redirect_uri_mismatch)
Authentik redirect URI must exactly match `${BETTER_AUTH_URL}/api/auth/oauth2/callback/authentik`. Changes to `istio.host` / `istio.path` / `config.betterAuthUrl` require updating the Authentik application config in tandem.

### VirtualService not routing
```bash
kubectl --context platform-prod get gateway -n istio-system
kubectl --context platform-prod get vs -n demo-lds-chatbot -o yaml | grep -A2 gateways:
```
The VirtualService's `gateways` reference (`istio-system/<sharedGatewayName>`) must point at an existing Gateway whose `hosts` includes `demo.alien.club`.

## Data Persistence Notes

- Bundled Postgres has **no replication and no backup**. For a client demo this is fine — for real production you'd want Scaleway Managed Database or at minimum a cron-based `pg_dump` to object storage.
- The StatefulSet PVC + generated Postgres Secret are both `helm.sh/resource-policy: keep` — uninstalling the chart leaves them in place. To truly wipe state, delete the PVC and Secret manually after `helm uninstall`.
