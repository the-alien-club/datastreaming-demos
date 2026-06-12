# Publisher Demo — Deployment Guide

The chart deploys the publisher demo to `platform-prod`, bound to the shared
`demo.alien.club` Istio Gateway alongside `alien-agents` (`/agents`) and
`openaire` (`/openaire`). Publisher-demo claims the catch-all (`prefix: /`)
on the same host — Istio routes by longest prefix per request, so the two
existing demos keep their own paths and everything else lands here.

ArgoCD is the source of truth: the canonical `Application` lives in
[k8s-charts/argocd/apps/demo-prod.yaml](../../../k8s-charts/argocd/apps/demo-prod.yaml).
This document covers the one-time setup (image build, Scaleway secret) and
the environment-switch matrix for moving the demo between alpha and prod.

---

## 1. Build & push the image

No CI is wired for this repo yet — the image is built manually and pushed to
Scaleway. Tag bumps must be reflected in the ArgoCD `Application`'s
`image.tag` parameter override.

```bash
cd datastreaming-demos/publisher-demo

# Pick the next version — match Chart.yaml appVersion + values.yaml image.tag
VERSION=0.1.0

# Build for the cluster's architecture (Scaleway nodes are amd64)
docker buildx build \
  --platform linux/amd64 \
  -t rg.fr-par.scw.cloud/ns-data-streaming/publisher-demo:${VERSION} \
  --push \
  .

# Verify
docker manifest inspect rg.fr-par.scw.cloud/ns-data-streaming/publisher-demo:${VERSION}
```

Then bump `helm/publisher-demo-chart/Chart.yaml` `appVersion` +
`helm/publisher-demo-chart/values.yaml` `image.tag` to the same `${VERSION}`
and commit on `main`.

---

## 2. Create the Scaleway secret (once per environment)

Each environment has its own Scaleway Secret Manager secret. Both properties
(`ADMIN_OAT`, `ANTHROPIC_API_KEY`) live on a single secret — the chart
references the secret by `name:` and pulls properties individually, so a
future environment switch is one ArgoCD `secrets.scalewaySecretName`
override (see §4).

```bash
# Alpha (current default — values.yaml ships with secretName=publisher-demo-alpha)
scw secret secret create \
  name=publisher-demo-alpha \
  project-id=<ns-data-streaming-project-id>

scw secret version create \
  secret-name=publisher-demo-alpha \
  data='{"ADMIN_OAT":"oat_Mjg...","ANTHROPIC_API_KEY":"sk-ant-..."}'

# Prod (when ready to switch)
scw secret secret create name=publisher-demo-prod project-id=<ns-data-streaming-project-id>
scw secret version create secret-name=publisher-demo-prod data='{"ADMIN_OAT":"<prod-oat>","ANTHROPIC_API_KEY":"<prod-key>"}'
```

The Scaleway secret must store the two values as **properties on a single
secret version** (key-value JSON, not separate secrets). The
`ClusterSecretStore` named `scaleway-secret-manager` is already configured
on the platform-prod cluster — no per-app config needed.

### Verify the ExternalSecret reconciles

```bash
kubectl -n publisher-demo get externalsecret publisher-demo-alpha-secrets
# STATUS=SecretSynced READY=True
kubectl -n publisher-demo get secret publisher-demo-alpha-secrets -o json \
  | jq -r '.data | keys'
# Should list: ADMIN_OAT, ANTHROPIC_API_KEY
```

---

## 3. ArgoCD Application

The Application is declared in
[k8s-charts/argocd/apps/demo-prod.yaml](../../../k8s-charts/argocd/apps/demo-prod.yaml)
and applied directly with `kubectl apply` to the `argocd` namespace on
`platform-prod`. Required parameter overrides:

| Parameter | Why it must be overridden |
|---|---|
| `istio.sharedGatewayName` | `values.yaml` ships empty — the chart's `required` guard fires unless overridden. Set to `demo-openaire-prod-gateway`. |
| `image.tag` | Pin to the exact version pushed in §1 (don't track `latest`). |

Everything else can stay on `values.yaml` defaults for the alpha deploy.

```bash
# Apply (or update) the Application
kubectl --context platform-prod apply -f k8s-charts/argocd/apps/demo-prod.yaml

# Watch the sync
kubectl --context platform-prod -n argocd get application publisher-demo-alpha -w
```

---

## 4. Environment switch matrix (alpha → prod)

The chart is structured so a full environment switch is exclusively values
overrides — no template edits, no Helm release rename. To promote to prod,
update the ArgoCD `Application`'s `helm.parameters` block:

| Setting | Alpha (default) | Prod |
|---|---|---|
| `config.platformApiUrl` | `https://api.alpha.alien.club` | `https://api.alien.club` |
| `config.mcpAlienUrl` | `https://mcp.alpha.alien.club` | `https://mcp.alien.club` |
| `config.demoConfigSlug` | `cfg_El_iPlRr8wHQ` | `<prod slug>` |
| `config.demoWorkflowId` | `"238"` | `<prod workflow id>` |
| `config.orgId` | `"3"` | `<prod org id>` |
| `config.otelServiceName` | `publisher-demo-alpha` | `publisher-demo-prod` |
| `secrets.scalewaySecretName` | `publisher-demo-alpha` | `publisher-demo-prod` |

The `ADMIN_OAT` token used in each environment must belong to a user whose
organization on the target platform owns the MCP configuration, datasets,
external APIs, and workflow referenced above (see
[publisher-demo/README.md §Platform prerequisites](../README.md)).

---

## 5. Verify the deploy

```bash
# Pod healthy
kubectl --context platform-prod -n publisher-demo get pods

# Routing — should show three VirtualServices on demo.alien.club
kubectl --context platform-prod get vs -A -o wide | grep demo.alien.club
#   alien-agents/alien-agents-prod-vs        /agents
#   demo-openaire/demo-openaire-prod-vs      /openaire
#   publisher-demo/publisher-demo-alpha-vs   /

# End-to-end: the three demos must all answer
curl -sI https://demo.alien.club/agents/  | head -1   # 200
curl -sI https://demo.alien.club/openaire | head -1   # 200
curl -sI https://demo.alien.club/         | head -1   # 200 → publisher-demo

# Logs
kubectl --context platform-prod -n publisher-demo logs deploy/publisher-demo-alpha --tail=50
```

---

## 6. Local testing (without ArgoCD)

```bash
helm lint helm/publisher-demo-chart \
  --set istio.sharedGatewayName=demo-openaire-prod-gateway

helm template publisher-demo-alpha helm/publisher-demo-chart \
  --set istio.sharedGatewayName=demo-openaire-prod-gateway \
  | less
```

For a full standalone install on a dev cluster (own Gateway + cert), flip
`istio.gateway.create=true` and `istio.certificate.enabled=true` and unset
`istio.sharedGatewayName`.

---

## 7. Rollback

```bash
# Bump image.tag in k8s-charts/argocd/apps/demo-prod.yaml back to the
# previous version, then apply — ArgoCD prunes and rolls forward to the
# pinned tag.
kubectl --context platform-prod apply -f k8s-charts/argocd/apps/demo-prod.yaml

# Or, for an emergency, pause the Application and edit the Deployment
# image directly (drift will be reconciled once selfHeal re-enables):
kubectl --context platform-prod -n argocd patch application publisher-demo-alpha \
  --type merge -p '{"spec":{"syncPolicy":{"automated":null}}}'
kubectl --context platform-prod -n publisher-demo set image \
  deploy/publisher-demo-alpha publisher-demo=rg.fr-par.scw.cloud/ns-data-streaming/publisher-demo:<previous-tag>
```

Never `kubectl delete application` on `platform-prod` — cascade deletion
will take out the namespace, ExternalSecret, and routing config along with
the pod. See `CLAUDE.md` §ArgoCD for the full rule.
