# OpenAIRE Helm Chart & ArgoCD Deployment

## Prerequisites

- Kubernetes cluster with:
  - Ingress NGINX controller
  - cert-manager for SSL certificates
  - ArgoCD installed

## Quick Deploy

### 1. Create Secret

First, create the secret with your Anthropic API key:

```bash
kubectl create namespace openaire

kubectl create secret generic openaire-secrets \
  --namespace openaire \
  --from-literal=ANTHROPIC_API_KEY=your_anthropic_api_key_here
```

### 2. Deploy with ArgoCD

Update the ArgoCD application manifest with your git repository:

```bash
# Edit argocd-application.yaml and update the repoURL
nano argocd-application.yaml

# Apply the ArgoCD application
kubectl apply -f argocd-application.yaml
```

ArgoCD will automatically:
- Sync the helm chart
- Create the deployment with 1 replica
- Create the service (ClusterIP)
- Create the ingress with SSL at `demo.datastreaming.ai/openaire`

### 3. Manual Helm Install (Alternative)

If you prefer manual helm install:

```bash
# Install the chart
helm install openaire ./openaire-chart \
  --namespace openaire \
  --create-namespace \
  --set image.tag=0.6.7

# Or upgrade
helm upgrade openaire ./openaire-chart \
  --namespace openaire
```

## Configuration

### Image Configuration

The chart uses:
- **Repository**:  rg.fr-par.scw.cloud/ns-data-streaming/demo-openaire
- **Tag**: 0.1.0

Update in [values.yaml](openaire-chart/values.yaml):

```yaml
image:
  repository:  rg.fr-par.scw.cloud/ns-data-streaming/demo-openaire
  tag: 0.1.0
```

### Ingress Configuration

The ingress is configured for:
- **Host**: `demo.datastreaming.ai`
- **Path**: `/openaire`
- **SSL**: Automatic via cert-manager with `letsencrypt-prod`

The path rewrite ensures `/openaire` is stripped before forwarding to the pod.

### Resource Limits

Default resources:

```yaml
resources:
  requests:
    cpu: 250m
    memory: 512Mi
  limits:
    cpu: 1000m
    memory: 2Gi
```

Adjust based on your load in [values.yaml](openaire-chart/values.yaml).

## Accessing the Application

Once deployed, access at:

**https://demo.datastreaming.ai/openaire**

## Monitoring

Check deployment status:

```bash
# ArgoCD status
kubectl get application openaire-demo -n argocd

# Pod status
kubectl get pods -n openaire

# Logs
kubectl logs -f deployment/openaire -n openaire

# Ingress status
kubectl get ingress -n openaire
```

## Troubleshooting

### Pod not starting

```bash
kubectl describe pod -l app.kubernetes.io/name=openaire -n openaire
kubectl logs -l app.kubernetes.io/name=openaire -n openaire
```

### Ingress not working

```bash
# Check ingress
kubectl describe ingress -n openaire

# Check cert-manager certificate
kubectl get certificate -n openaire
kubectl describe certificate openaire-tls -n openaire
```

### SSL certificate issues

```bash
# Check cert-manager logs
kubectl logs -n cert-manager deployment/cert-manager

# Check certificate request
kubectl get certificaterequest -n openaire
```

## Updating

### Update image tag

```bash
# Update values.yaml, then sync with ArgoCD
kubectl patch application openaire-demo -n argocd \
  --type merge \
  -p '{"spec":{"source":{"helm":{"parameters":[{"name":"image.tag","value":"0.6.8"}]}}}}'
```

Or update [values.yaml](openaire-chart/values.yaml) and commit to git (ArgoCD will auto-sync).

### Scale replicas

```bash
# Via kubectl
kubectl scale deployment/openaire --replicas=2 -n openaire

# Or update values.yaml
# replicaCount: 2
```

## Architecture

```
Internet
   ↓
Ingress NGINX (demo.datastreaming.ai/openaire)
   ↓
Service (ClusterIP:80)
   ↓
Deployment (1 replica)
   ↓
Pod (Container:3000)
   ├─ Next.js Frontend
   ├─ API Routes
   └─ MCP Servers (spawned on-demand)
```

## Files

- [Chart.yaml](openaire-chart/Chart.yaml) - Chart metadata
- [values.yaml](openaire-chart/values.yaml) - Configuration values
- [templates/deployment.yaml](openaire-chart/templates/deployment.yaml) - Kubernetes Deployment
- [templates/service.yaml](openaire-chart/templates/service.yaml) - Kubernetes Service
- [templates/ingress.yaml](openaire-chart/templates/ingress.yaml) - Ingress with SSL
- [argocd-application.yaml](argocd-application.yaml) - ArgoCD Application manifest
