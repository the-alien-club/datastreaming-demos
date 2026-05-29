# Alien Agents — Helm / ArgoCD Deployment

## Architecture

```
Internet
   │
   ▼
Istio Ingress Gateway          (demo.alien.club:443, shared)
   │   └── /agents    → VirtualService (alien-agents)
   ▼
VirtualService                 (namespace: alien-agents)
   │
   ▼
Service  ClusterIP:80
   │
   ▼
Deployment  replicas=1         (stateless Next.js app, basePath=/agents)
   │
   └─ Connects to:
      ├─ StatefulSet <release>-postgres:5432  (bundled Postgres, PVC-backed)
      ├─ api.alpha.alien.club   (Alien Backend — workflow engine, Responses API)
      ├─ mcp.alpha.alien.club   (Data Cluster MCP — RAG)
      └─ auth.alien.club        (Authentik — OAuth2/OIDC)
```

**Storage**: a bundled Postgres StatefulSet with a PVC owned by `volumeClaimTemplates` holds all app state (agents, conversations, messages, better-auth sessions). The app pod itself is stateless.

**Gateway / certificate**: by default the chart **attaches** to an existing Istio Gateway that already serves `demo.alien.club` and provisions its own Certificate. The name of that Gateway is supplied via `istio.sharedGatewayName` (required).

---

## Naming Conventions

| Resource | Value |
|---|---|
| ArgoCD Application | `alien-agents-prod` |
| Helm release name | `alien-agents-prod` |
| Kubernetes namespace | `alien-agents` |
| All resources | prefixed `alien-agents-prod-…` |
| Image repo | `rg.fr-par.scw.cloud/ns-data-streaming/alien-agents` |
| k8s context | `platform-prod` |

---

## Protected Secrets — DO NOT TOUCH

These two Secrets are annotated `helm.sh/resource-policy: keep` and survive chart upgrades. **Never delete or edit them directly.**

- `alien-agents-prod-postgres` — Postgres password (generated once at first install)
- `alien-agents-prod-app` — `BETTER_AUTH_SECRET` (generated once at first install)

Deleting either will break the app irreversibly (all sessions invalidated; Postgres data unreachable).

---

## Release Loop

### 1. Pre-flight checks

All three must be green before building. Fix any errors; warnings are acceptable.

```bash
cd datastreaming-demos/alien-agents

npx tsc --noEmit          # 0 errors
npm test -- --run         # all tests pass (currently 49/49)
npx eslint .              # 0 errors (warnings OK)
```

### 2. Version bump

Bump **both** files to the same version (e.g. `0.2.6`):

```bash
# 1. package.json — "version" field
# 2. helm/alien-agents-chart/values.yaml — image.tag
```

They must stay in sync. The Helm tag is what ArgoCD deploys; `package.json` is what shows in logs and `npm run --version`.

### 3. Commit

Stage only production files — never commit debug scripts, spike files, or `.log` files:

```bash
git add \
  package.json \
  helm/alien-agents-chart/values.yaml \
  <...any changed source files...>

# Example:
git commit -m "feat(chatbot): <description> + bump to 0.2.6"
```

No `Co-Authored-By` lines. No `spike_*.mjs`, `*.log`, or scratch files.

### 4. Build and push

`NEXT_PUBLIC_BASE_PATH=/agents` is **baked into the client bundle** at build time. It must match `istio.path` in `values.yaml` — both are `/agents`.

```bash
cd datastreaming-demos/alien-agents

docker build \
  --build-arg NEXT_PUBLIC_BASE_PATH=/agents \
  -t rg.fr-par.scw.cloud/ns-data-streaming/alien-agents:0.2.6 \
  .

docker push rg.fr-par.scw.cloud/ns-data-streaming/alien-agents:0.2.6
```

Build takes ~5–7 min. Push takes ~1–2 min (layers are cached after first push).

### 5. Push to git → ArgoCD auto-sync

```bash
git push origin main
```

ArgoCD has `automated.selfHeal: true` on `alien-agents-prod`. It polls git every ~3 min. To force immediate pickup:

```bash
kubectl --context platform-prod \
  annotate application alien-agents-prod -n argocd \
  argocd.argoproj.io/refresh=hard --overwrite
```

Watch the rollout:

```bash
# Poll sync + health + running image
for i in $(seq 1 20); do
  sleep 10
  STATUS=$(kubectl --context platform-prod get application alien-agents-prod \
    -n argocd -o jsonpath='{.status.sync.status} {.status.health.status}' 2>&1)
  IMAGE=$(kubectl --context platform-prod get pods -n alien-agents \
    -o jsonpath='{.items[0].spec.containers[0].image}' 2>/dev/null)
  echo "$(date -u +%H:%M:%S) $STATUS | $IMAGE"
  [[ "$STATUS" == "Synced Healthy" && "$IMAGE" == *"0.2.6"* ]] && break
done
```

### 6. Verify startup logs

```bash
kubectl --context platform-prod logs -n alien-agents \
  deploy/alien-agents-prod --tail=30
```

Expected clean boot sequence:
```
[entrypoint] Waiting for Postgres at …:5432...
[entrypoint] Postgres is ready.
[entrypoint] Applying Prisma migrations...
Prisma schema loaded from prisma/schema.prisma
Datasource "db": PostgreSQL database "…"

No pending migrations.

[entrypoint] Applying better-auth migrations...
Database is already up to date.
[entrypoint] Starting Next.js server...
▲ Next.js 16.x.x
✓ Ready in 0ms
```

Any error before `Ready` is a startup failure — check the logs for the specific migration or config issue.

### 7. Playwright smoke (optional but recommended)

Sign in to https://demo.alien.club/agents with `leo@alien.club`. Verify:
- All sidebar items load without "Failed to load" toasts
- Create or open an existing agent
- Send a short message — response should stream within ~10–15s
- Sign out

---

## Current State (as of 0.2.5)

| Item | Value |
|---|---|
| Live version | `0.2.5` |
| Image digest | `sha256:ac8d32f52543f7615319d5d027df049a5283b1a7dea60de8b49029004162eed7` |
| Platform backend | `api.alpha.alien.club` (dev environment — not prod) |
| Workers | `workers:0.5.37-dev` on `platform-dev` / `datastreaming-dev` |
| Cluster ID | `88` (data cluster on alpha) |

**Note**: the chatbot currently targets `api.alpha.alien.club` (the dev Alien Backend), not `api.alien.club`. This is intentional — the Responses API and streaming features were developed on the dev environment and have not been promoted to prod yet.

---

## Prerequisites (first install only)

- Kubernetes cluster with:
  - Istio (`ingressgateway` in `istio-system`)
  - An existing Istio Gateway in `istio-system` serving `demo.alien.club` on port 443 with a valid TLS cert
  - external-secrets with `scaleway-secret-manager` ClusterSecretStore
  - Scaleway Secret Manager secret `authentik-prod` with properties `AUTHENTIK_CLIENT_ID` / `AUTHENTIK_CLIENT_SECRET`
- Authentik: redirect URI `https://demo.alien.club/agents/api/auth/oauth2/callback/authentik` registered on the `datastreaming` application

### Find the shared Gateway name

```bash
kubectl --context platform-prod get vs -A -o wide | grep demo.alien.club
```

The `GATEWAYS` column prints `istio-system/<name>`. Pass `<name>` to `istio.sharedGatewayName`.

### Apply the ArgoCD application (once)

`helm/argocd-application.yaml` pins `istio.sharedGatewayName` to `demo-openaire-prod-gateway`. If that Gateway is ever renamed, update the `parameters` block.

```bash
kubectl --context platform-prod apply -f helm/argocd-application.yaml
```

---

## Configuration Knobs

Edit `helm/alien-agents-chart/values.yaml` (or pass `--set` / ArgoCD parameters):

| Key | Purpose | Current |
|---|---|---|
| `image.tag` | App container image tag | `0.2.5` |
| `config.platformApiUrl` | Alien Backend base URL | `https://api.alpha.alien.club` |
| `config.clusterId` | Data cluster ID | `88` |
| `config.datalclusterMcpUrl` | Data Cluster MCP endpoint | `https://mcp-test-lds-…/mcp` |
| `istio.host` | Public hostname | `demo.alien.club` |
| `istio.path` | URI prefix; must match `NEXT_PUBLIC_BASE_PATH` | `/agents` |
| `istio.sharedGatewayName` | **Required** — existing Gateway name | see `argocd-application.yaml` |
| `postgres.persistence.size` | Postgres PVC size | `5Gi` |
| `resources` | App CPU / memory | 250m/512Mi → 1000m/2Gi |

---

## ArgoCD Sync Waves

| Wave | Resources |
|---|---|
| `-2` | ConfigMap, ExternalSecret (Authentik), Secrets (app + postgres) |
| `0` (default) | Postgres StatefulSet + Service, app Deployment + Service, VirtualService |

---

## Troubleshooting

### App pod `CrashLoopBackOff`

```bash
kubectl --context platform-prod logs -n alien-agents deploy/alien-agents-prod
```

The entrypoint waits up to ~2 min for Postgres, then runs Prisma + better-auth migrations. Most startup failures are visible here.

### Chat returns no response / blank stream

Check workers first — this is the most common cause:

```bash
kubectl --context platform-dev logs -n datastreaming-dev \
  -l app.kubernetes.io/name=workers --tail=50 | grep -i "error\|child nodes\|failed"
```

If you see `has no child nodes in the graph` → workers image is stale. Redeploy workers with current `dev` HEAD (see workers repo).

### SQS dispatch delayed 60–90s

Redis TLS stall on `responseStore.create()`. The fix (fire-and-forget Redis write, SQS first) is in `web-app` backend `0.6.67-dev+`. If this recurs, check the Redis connection to `redis-demos` on Scaleway.

### Postgres pod stuck `Pending`

PVC unbound — storage class mismatch:

```bash
kubectl --context platform-prod describe pvc -n alien-agents \
  data-alien-agents-prod-postgres-0
kubectl --context platform-prod get storageclass
```

Leave `postgres.persistence.storageClassName` unset to use the cluster default (`sbs-default` on Scaleway).

### OAuth callback 400 / `redirect_uri_mismatch`

Authentik redirect URI must exactly match `${BETTER_AUTH_URL}/api/auth/oauth2/callback/authentik`. Changes to `istio.host` / `config.betterAuthUrl` require updating the Authentik application in tandem.

### VirtualService not routing

```bash
kubectl --context platform-prod get gateway -n istio-system
kubectl --context platform-prod get vs -n alien-agents -o yaml | grep -A2 gateways:
```

The VirtualService `gateways` reference (`istio-system/<sharedGatewayName>`) must point at an existing Gateway whose `hosts` includes `demo.alien.club`.

### ArgoCD stuck OutOfSync after image tag change

The ArgoCD Image Updater stores the image tag as a **Helm parameter override** directly on the Application object — this takes precedence over `values.yaml` in git. If the deployed tag doesn't match git:

```bash
# Check what tag ArgoCD is actually using
kubectl --context platform-prod get application alien-agents-prod \
  -n argocd -o jsonpath='{.spec.source.helm.parameters}'

# Patch it directly to force the correct tag
kubectl --context platform-prod patch application alien-agents-prod \
  -n argocd --type json \
  -p '[{"op":"replace","path":"/spec/source/helm/parameters/0/value","value":"0.2.6"}]'
```

**Never** use `kubectl delete application` on `platform-prod` — this cascades and deletes all managed resources including the Postgres StatefulSet and PVC.

---

## Standalone Mode (own Gateway + Cert)

If no shared Gateway exists for your target host, flip:

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

---

## Data Persistence Notes

- Bundled Postgres has **no replication and no backup**. For a client demo this is fine — for real production use Scaleway Managed Database or a cron-based `pg_dump` to object storage.
- The StatefulSet PVC + generated Secrets are `helm.sh/resource-policy: keep` — uninstalling the chart leaves them in place. To fully wipe state, delete the PVC and Secrets manually after `helm uninstall`.
