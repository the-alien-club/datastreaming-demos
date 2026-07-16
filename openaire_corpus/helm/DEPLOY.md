# OpenAIRE Literature Research — Helm / ArgoCD Deployment

> GitOps target: an ArgoCD **Application** (`openaire-corpus-prod` in namespace
> `openaire` on `platform-prod`) tracking `datastreaming-demos` `main` at
> `openaire_corpus/helm/openaire-corpus-chart`. A plain `helm upgrade --install`
> works too — see [Direct Helm Release](#direct-helm-release).

## Architecture

```
Internet
   │
   ▼
Istio Ingress Gateway       (openaire.demo.alien.club:443 — OWN gateway + cert)
   │
   ▼
VirtualService              (namespace: openaire, host openaire.demo.alien.club, path /)
   │
   ▼
Service  ClusterIP:80
   │
   ▼
Deployment  replicas=1      (stateless Next.js app, served at root — NO basePath)
   │
   ├─ Connects to:
   │   ├─ StatefulSet <release>-postgres:5432   (bundled Postgres, PVC-backed)
   │   ├─ <release>-worker:7777                 (ingest worker HTTP API — in-cluster only)
   │   ├─ mcp.alien.club (OpenAIRE MCP)         (corpus building — openaire_kg_* / openaire_sx_*)
   │   ├─ mcp.alien.club (datacluster MCP)      (RAG — research, multi-cluster aggregator)
   │   ├─ auth.alien.club                       (Authentik SSO)
   │   └─ openrouter.ai / api.anthropic.com     (agent loops — per config.agentProvider)
   │
   ▼
Deployment  <release>-worker  replicas=1   ◄── THE DIFFERENCE FROM A PLAIN WEB APP
   │   (pg-boss consumer + HTTP submit API on :7777)
   │
   └─ Connects to:
      ├─ StatefulSet <release>-postgres:5432   (pg-boss queue — its own schema)
      ├─ <release>:80                          (posts one HMAC-signed terminal callback)
      ├─ api.openaire.eu/graph/v1              (OpenAIRE Graph API — metadata resolve)
      ├─ ScholeXplorer                         (citation-link counts — cited-by / references)
      ├─ open-access PDF hosts                 (full-text lane — arXiv / PMC / repositories)
      ├─ api.mistral.ai                        (Mistral OCR — full text + figure images)
      ├─ Scaleway Object Storage               (blob store — heavy bytes off-queue)
      ├─ RunPod                                (bge-m3 embeddings)
      └─ api.alien.club/clusters/111/proxy     (data cluster register / upsert)
```

**The worker is what makes this chart more than a plain web app.** It pulls
doc-ingest jobs from a pg-boss queue (in the bundled Postgres), runs the per-doc
pipeline `resolve → [fetch-pdf → extract] → prepare → embed → register`, and
serves the HTTP submit API the app calls. It is **internal only** — never
fronted by Istio. pg-boss row-locks make `worker.replicaCount > 1` safe (one
shared queue, no double-processing). A `wait-for-postgres` init-container gates
the worker on the bundled Postgres so it doesn't crash-loop on boot (the worker
connects to pg-boss immediately and has no in-process retry/wait of its own).

**Auth**: Alien Auth (Authentik) SSO via better-auth `genericOAuth`, enabled
when `config.authentikBaseUrl` is set + the client id/secret ExternalSecret is
present. The better-auth tables live in the same Prisma schema as the domain
tables, so the entrypoint's single `prisma migrate deploy` covers the whole
schema.

**No BnF broker.** Unlike the sibling BnF chart, there is no partner-API egress
chokepoint — the OpenAIRE Graph API is public (an optional token only raises the
rate ceiling), so the worker talks to it directly, rate-gated by
`OPENAIRE_RPM`. PDF hosts are politeness-gated per host (`PDF_HOST_RPM`).

**Gateway / certificate**: `openaire.demo.alien.club` is a dedicated subdomain
served at root `/`, so the chart provisions its **own** Istio Gateway +
cert-manager Certificate (no basePath, no URI rewrite). Switch to a shared
gateway only if a Gateway already serves the host — see "Shared-Gateway Mode".

---

## Naming Conventions

| Resource | Value |
|---|---|
| ArgoCD Application | `openaire-corpus-prod` |
| Helm release name | `openaire-corpus-prod` |
| Kubernetes namespace | `openaire` |
| All resources | prefixed `openaire-corpus-prod-…` |
| App image repo | `rg.fr-par.scw.cloud/ns-data-streaming/openaire-corpus` |
| Worker image repo | `rg.fr-par.scw.cloud/ns-data-streaming/openaire-corpus-worker` |
| k8s context | `platform-prod` |

---

## Protected Secrets — DO NOT TOUCH

Annotated `helm.sh/resource-policy: keep`; they survive chart upgrades and are
generated once at first install. **Never delete or edit them directly.**

- `openaire-corpus-prod-postgres` — Postgres password + `DATABASE_URL`.
- `openaire-corpus-prod-app` — `BETTER_AUTH_SECRET` (rotating it invalidates
  every session) **and** `JOB_CALLBACK_SECRET` (the HMAC key the app signs
  ingest-callbacks with and hands the worker per job; rotating it breaks
  in-flight jobs).

Deleting either breaks the app irreversibly.

---

## Prerequisites (first install only)

- Kubernetes cluster with:
  - Istio (`ingressgateway` in `istio-system`).
  - DNS `openaire.demo.alien.club` → the Istio ingress LB.
  - cert-manager with a `letsencrypt` **ClusterIssuer**.
  - external-secrets with the `scaleway-secret-manager` ClusterSecretStore.
- A Scaleway Secret Manager secret named **`openaire-corpus-prod`** holding every
  credential as a property (see "Scaleway Secret Manager" below).
- The shared **`authentik-prod`** Scaleway secret (SSO client id/secret, reused
  across all demos) and the OAuth callback
  `https://openaire.demo.alien.club/api/auth/oauth2/callback/authentik`
  registered on the `datastreaming` Authentik application.

### ⚠️ chat-sdk must be on npm before the app image builds

The app depends on `@alien/chat-sdk`, which is an **npm alias** for the published
`@alien_intelligence/chat-sdk` (see `package.json`). The app Dockerfile is a
plain `npm ci` — it pulls the SDK from the registry, NOT from the monorepo
`tooling/` tarball. So before building the app image, confirm:

```bash
npm view @alien_intelligence/chat-sdk@<version> version   # must exist on npm
```

The alias range in `package.json` and the published version must be compatible,
and `package-lock.json` must resolve to the registry tarball
(`registry.npmjs.org/@alien_intelligence/chat-sdk/...`), not a `file:` path.

---

## Scaleway Secret Manager

One secret (`openaire-corpus-prod`) holds every credential as a property. The
ExternalSecrets project the subsets each workload needs. Property names are
configurable in `values.yaml` under `secrets.*Property`.

| Property | Consumed by | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | app | agent loops (when `agentProvider=anthropic`) |
| `OPENROUTER_API_KEY` | app + worker | agent loops (when `agentProvider=openrouter`) |
| `OPENAIRE_MCP_TOKEN` | app | OpenAIRE MCP (corpus building) |
| `CLUSTER_BEARER_TOKEN` | app + worker | data-cluster auth (RAG read + register write) |
| `LANGFUSE_SECRET_KEY` | app | optional — only if `config.langfusePublicKey` set |
| `SCW_S3_ACCESS_KEY` / `SCW_S3_SECRET_KEY` | worker | Scaleway Object Storage (blob) |
| `RUNPOD_API_KEY` | worker | bge-m3 embeddings |
| `MISTRAL_API_KEY` | worker | Mistral OCR full-text lane (only if `fulltextEnabled`) |

> `OPENROUTER_API_KEY` is projected into the worker-creds secret too, but the
> OpenAIRE worker does not currently read it (it has no vision/agent lane). It is
> harmless; drop it from the worker ExternalSecret if you want a tighter surface.

The Authentik client id/secret come from the **separate shared** `authentik-prod`
Scaleway secret, not this one (`secrets.authentikScalewaySecretName`).

---

## Release Loop

### 1. Pre-flight checks

```bash
cd datastreaming-demos/openaire_corpus
npx tsc --noEmit                       # app: 0 errors
npm run lint                           # app: 0 errors
( cd worker-v2 && npm run typecheck && npm test )   # worker: green
helm lint helm/openaire-corpus-chart   # chart: 0 failures
```

### 2. Version bump

Bump the same version in these places (keep them in sync):

```
1. package.json                                          — "version"
2. helm/openaire-corpus-chart/values.yaml                — image.tag
3. helm/openaire-corpus-chart/values.yaml                — worker.image.tag
4. helm/openaire-corpus-chart/Chart.yaml                 — version + appVersion
```

### 3. Build and push BOTH images

Two images. There is no basePath to bake in — the app is served at root.

```bash
cd datastreaming-demos/openaire_corpus

# App image (plain context — chat-sdk comes from npm, see prerequisites)
docker build -t rg.fr-par.scw.cloud/ns-data-streaming/openaire-corpus:<tag> .
docker push     rg.fr-par.scw.cloud/ns-data-streaming/openaire-corpus:<tag>

# Worker image (context = ./worker-v2, its own Dockerfile)
docker build -f worker-v2/Dockerfile \
  -t rg.fr-par.scw.cloud/ns-data-streaming/openaire-corpus-worker:<tag> worker-v2
docker push rg.fr-par.scw.cloud/ns-data-streaming/openaire-corpus-worker:<tag>
```

### 4. Apply the ArgoCD application (first install only)

```bash
kubectl --context platform-prod apply -f helm/argocd-application.yaml
```

### 5. Push to git → ArgoCD auto-sync

```bash
git push origin main
```

`openaire-corpus-prod` has `automated.selfHeal: true`. Force immediate pickup:

```bash
kubectl --context platform-prod \
  annotate application openaire-corpus-prod -n argocd \
  argocd.argoproj.io/refresh=hard --overwrite
```

### 6. Verify startup

```bash
kubectl --context platform-prod logs -n openaire deploy/openaire-corpus-prod --tail=30
```

Expected: Postgres wait → `prisma migrate deploy` → `▲ Next.js … ✓ Ready`.

```bash
kubectl --context platform-prod logs -n openaire deploy/openaire-corpus-prod-worker --tail=30
```

Expected: `worker_v2_up` with `httpPort: 7777` and pg-boss starting.

---

## Direct Helm Release

Plain Helm against `platform-prod` — no git push, no ArgoCD. Fastest path;
use the same commands to redeploy after a chart or image change.

### 1. Create the Scaleway secret (first install only)

external-secrets reads one Scaleway Secret Manager secret named
`openaire-corpus-prod`, whose value is a **JSON object** keyed by the property
names in `values.yaml` (`secrets.*Property`). Build it from a JSON file and push
one version:

```bash
# secret.json = {"ANTHROPIC_API_KEY":"…","OPENROUTER_API_KEY":"…",
#   "OPENAIRE_MCP_TOKEN":"…","CLUSTER_BEARER_TOKEN":"…","LANGFUSE_SECRET_KEY":"…",
#   "SCW_S3_ACCESS_KEY":"…","SCW_S3_SECRET_KEY":"…","RUNPOD_API_KEY":"…",
#   "MISTRAL_API_KEY":"…"}

SECRET_ID=$(scw secret secret create name=openaire-corpus-prod \
  project-id=77c152cc-4d27-4d9b-a449-143df07bcaad \
  description="OpenAIRE corpus app+worker credentials" -o json | jq -r .id)

scw secret version create secret-id=$SECRET_ID data=@secret.json

rm -f secret.json   # never leave credentials on disk
```

To rotate a credential later: edit the JSON, `scw secret version create` a new
version (it becomes `latest`), then let the ExternalSecret refresh (`1h`) or
force it by deleting the synced k8s Secret so ESO recreates it.

### 2. Build + push both images

Same as steps 1–3 of the Release Loop above.

### 3. Install / upgrade

```bash
helm upgrade --install openaire-corpus-prod helm/openaire-corpus-chart \
  --kube-context platform-prod \
  --namespace openaire --create-namespace \
  --timeout 4m
```

Helm has cluster access, so the chart's `lookup`-based password/secret
preservation works correctly here (first install generates them; upgrades keep
them) — unlike ArgoCD, which needs the `ignoreDifferences` workaround.

### 4. Verify (live values)

```bash
kubectl --context platform-prod -n openaire get pods
curl -sS -o /dev/null -w "%{http_code}\n" https://openaire.demo.alien.club/   # 307 → /sign-in
curl -sS -o /dev/null -w "%{http_code}\n" https://openaire.demo.alien.club/api/auth/get-session  # 200
```

---

## Configuration Knobs (`values.yaml`)

| Key | Purpose | Default |
|---|---|---|
| `image.tag` / `worker.image.tag` | App / worker image tags | `0.1.0` |
| `config.publicUrl` | Public host (BETTER_AUTH_URL + APP_URL) | `https://openaire.demo.alien.club` |
| `config.clusterMode` | `real` → worker + datacluster RAG; `fake` → in-process fixtures | `real` |
| `config.openaireMcpUrl` | OpenAIRE MCP endpoint (corpus building) | `https://mcp.alien.club/mcp` |
| `config.dataclusterMcpUrl` | RAG MCP endpoint (real mode) | aggregator `?config=…` |
| `config.agentProvider` | `openrouter` (GLM 5.2) or `anthropic` | `openrouter` |
| `config.langfusePublicKey` | Enables Langfuse tracing when set | (set) |
| `worker.enabled` | Deploy the ingest worker | `true` |
| `worker.replicaCount` | Worker replicas (pg-boss-safe to scale) | `1` |
| `worker.config.fulltextEnabled` | Fetch + Mistral-OCR OA PDFs (full text + figures) | `"true"` |
| `worker.config.clusterId` | Data cluster ID (must match the RAG dataset region) | `"111"` |
| `worker.config.openaireRpm` / `pdfHostRpm` | OpenAIRE + per-PDF-host politeness rates | `"60"` |
| `worker.config.*Concurrency` | Per-stage concurrency (resolve/fetch/extract/prepare/embed/register) | see values.yaml |
| `istio.hosts[].gateway` | `own` (provision gateway+cert) or `shared` | `own` |
| `postgres.persistence.size` | Postgres PVC size | `10Gi` |

**`config.clusterMode=fake`** disables the worker entirely (no worker Deployment,
Service, ConfigMap, or ExternalSecret rendered) — handy for a UI-only deploy.

---

## App ↔ Worker Wiring (the part that's easy to get wrong)

All set automatically by the chart in `real` mode:

- App → worker submit: `WORKER_RUNNER_URL = http://<release>-worker.<ns>.svc.cluster.local:7777`
- Worker → app callback: `WORKER_CALLBACK_BASE_URL = http://<release>.<ns>.svc.cluster.local`
  (in-cluster, no Istio hairpin). The app hands the worker this base URL **plus a
  per-job callback secret** at submit time; the worker HMAC-signs its one terminal
  callback with that per-job secret (`x-callback-signature: sha256=<hex>`). There
  is no shared allow-list env var — the trust is the per-job secret.

---

## ArgoCD Sync Waves

| Wave | Resources |
|---|---|
| `-2` | ConfigMaps, ExternalSecrets, generated Secrets (app + postgres) |
| `0` | Postgres StatefulSet + Service, app + worker Deployments + Services, Gateway, VirtualService, Certificate |

`argocd-application.yaml` adds `ignoreDifferences` + `RespectIgnoreDifferences`
on the two generated Secrets so syncs don't rotate the kept passwords/secrets.

---

## Troubleshooting

### App pod `CrashLoopBackOff`
```bash
kubectl --context platform-prod logs -n openaire deploy/openaire-corpus-prod
```
Entrypoint waits ~2 min for Postgres, then runs `prisma migrate deploy`. Most
startup failures are a missing env var (lib/env.ts throws by name) or a migration
issue. Under `agentProvider=openrouter`, a missing `OPENROUTER_API_KEY` refuses
boot by design.

### App image build fails on `npm ci`
`@alien_intelligence/chat-sdk@<range>` isn't on npm, or `package-lock.json` still
resolves the SDK to a `file:` path. See "chat-sdk must be on npm" above.

### Ingestion never progresses
Check the worker:
```bash
kubectl --context platform-prod logs -n openaire deploy/openaire-corpus-prod-worker --tail=80 \
  | grep -iE "error|callback|register|embed|throttle"
```
Common causes: a missing worker credential (S3 / RunPod / Mistral / cluster
bearer), or `clusterId` not matching the RAG dataset region. Docs with no
reachable OA PDF **degrade to the abstract lane** and still complete — that is
not a failure.

### Worker init-container stuck `Init:0/1`, logs `pg_isready ... - no attempt`
`no attempt` (PQPING_NO_ATTEMPT) means libpq bailed *before* connecting because
`getpwuid()` failed: the pod runs as `securityContext.runAsUser: 1000`, which
has no entry in the `postgres` image's `/etc/passwd`. The init-container passes
`-U <postgres.username>` to skip that lookup — if you change the image or
securityContext and this resurfaces, keep the explicit `-U`.

### Cert never issues / TLS handshake fails
```bash
kubectl --context platform-prod get certificate -n istio-system openaire-corpus-prod-tls
kubectl --context platform-prod describe certificate -n istio-system openaire-corpus-prod-tls
```
Check DNS `openaire.demo.alien.club` resolves to the ingress LB (ACME HTTP-01
needs port 80 reachable — the chart's Gateway serves `:80` with
`httpsRedirect: false` for the challenge) and the `letsencrypt` ClusterIssuer
exists.

### Postgres pod `Pending`
PVC unbound — storage class mismatch. Leave
`postgres.persistence.storageClassName` unset to use the cluster default
(`sbs-default` on Scaleway).

> **Never** run `kubectl delete application openaire-corpus-prod` on
> `platform-prod` — it cascades and deletes the Postgres StatefulSet + PVC. See
> the platform-wide CLAUDE.md ArgoCD rules.

---

## Shared-Gateway Mode (alternative)

If a Gateway already serves the host, attach to it instead of provisioning one:

```yaml
istio:
  hosts:
    - host: openaire.demo.alien.club
      path: /
      gateway: shared
  sharedGatewayName: <existing-gateway-name>   # kubectl get vs -A -o wide | grep <host>
  gateway:
    create: false
  certificate:
    enabled: false
```

Serving under a path prefix (e.g. `demo.alien.club/openaire`) is **not** supported
out of the box — the app has no `basePath` wiring. It would require baking
`NEXT_PUBLIC_BASE_PATH` into the client bundle at build time and an Istio
rewrite. The dedicated subdomain avoids all of that.

---

## Data Persistence Notes

- Bundled Postgres has **no replication and no backup** — fine for a demo, not
  for real production data. Both the app schema and the worker's pg-boss queue
  live in it.
- The StatefulSet PVC + generated Secrets are `helm.sh/resource-policy: keep` —
  uninstalling the chart leaves them in place. To fully wipe state, delete the
  PVC and Secrets manually after `helm uninstall`.
