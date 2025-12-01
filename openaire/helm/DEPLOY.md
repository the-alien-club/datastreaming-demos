# Deploy Helm Chart Locally (No Git Push)

## Deploy with Helm

```bash
cd /home/xqua/Documents/Work/Alien/AIRM/datastreaming-demos/openaire/helm

# 1. Create namespace
kubectl create namespace openaire

# 2. Create secret with your Anthropic API key
kubectl create secret generic openaire-secrets \
  --namespace openaire \
  --from-literal=ANTHROPIC_API_KEY=your_key_here

# 3. Install the chart
helm install openaire ./openaire-chart --namespace openaire

# 4. Check deployment status
kubectl get pods -n openaire
kubectl get ingress -n openaire
```

## Optional: Register in ArgoCD (for visualization)

If you want ArgoCD to visualize the deployment (without managing it):

```bash
# This will show the app in ArgoCD UI but won't sync/manage it
kubectl apply -f argocd-track-existing.yaml
```

ArgoCD will show the resources but won't modify them since auto-sync is disabled.

## Option 2: Use Helm Locally, Skip ArgoCD

Just use helm directly:

```bash
# Install
helm install openaire ./openaire-chart --namespace openaire

# Upgrade
helm upgrade openaire ./openaire-chart --namespace openaire

# Uninstall
helm uninstall openaire --namespace openaire
```

## Verify Deployment

```bash
# Check pods
kubectl get pods -n openaire

# Check service
kubectl get svc -n openaire

# Check ingress
kubectl get ingress -n openaire

# View logs
kubectl logs -f deployment/openaire -n openaire

# Test locally
kubectl port-forward -n openaire deployment/openaire 3000:3000
# Then visit: http://localhost:3000
```

## Access the App

Once deployed and ingress is ready:

**https://demo.datastreaming.ai/openaire**

## Update Deployment

```bash
# Make changes to values.yaml or templates
# Then upgrade:
helm upgrade openaire ./openaire-chart --namespace openaire

# Or with specific values:
helm upgrade openaire ./openaire-chart \
  --namespace openaire \
  --set image.tag=0.6.8
```
