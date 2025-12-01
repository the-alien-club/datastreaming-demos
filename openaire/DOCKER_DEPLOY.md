# Docker Deployment Guide

## Quick Start

### 1. Set up environment variables

```bash
# Copy the example env file
cp .env.example .env

# Edit .env and add your Anthropic API key
nano .env  # or use your favorite editor
```

### 2. Build and run with Docker

```bash
# Build the image
docker build -t openaire-demo .

# Run the container
docker run -p 3000:3000 --env-file .env openaire-demo
```

### 3. Or use Docker Compose (recommended)

```bash
# Make sure your .env file has ANTHROPIC_API_KEY set
docker-compose up
```

The app will be available at [http://localhost:3000](http://localhost:3000)

---

## Kubernetes Deployment

### Build and push to your registry

```bash
# Build the image
docker build -t your-registry.com/openaire-demo:latest .

# Push to registry
docker push your-registry.com/openaire-demo:latest
```

### Basic Kubernetes manifests

Create `k8s/deployment.yaml`:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: openaire-secrets
type: Opaque
stringData:
  ANTHROPIC_API_KEY: "your_api_key_here"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: openaire-demo
  labels:
    app: openaire
spec:
  replicas: 2
  selector:
    matchLabels:
      app: openaire
  template:
    metadata:
      labels:
        app: openaire
    spec:
      containers:
      - name: openaire
        image: your-registry.com/openaire-demo:latest
        ports:
        - containerPort: 3000
          name: http
        env:
        - name: NODE_ENV
          value: "development"
        - name: LOG_LEVEL
          value: "info"
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: openaire-secrets
              key: ANTHROPIC_API_KEY
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
        livenessProbe:
          httpGet:
            path: /
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: openaire-service
spec:
  selector:
    app: openaire
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: ClusterIP
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: openaire-ingress
  annotations:
    kubernetes.io/ingress.class: "nginx"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
  - hosts:
    - openaire-demo.yourdomain.com
    secretName: openaire-tls
  rules:
  - host: openaire-demo.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: openaire-service
            port:
              number: 80
```

### Deploy to Kubernetes

```bash
# Create secret (or use the one in the manifest)
kubectl create secret generic openaire-secrets \
  --from-literal=ANTHROPIC_API_KEY=your_api_key_here

# Apply manifests
kubectl apply -f k8s/deployment.yaml

# Check deployment
kubectl get pods -l app=openaire
kubectl logs -f deployment/openaire-demo
```

---

## Architecture Notes

This Docker setup runs:

1. **Next.js Frontend** (port 3000) - Web UI with API routes
2. **MCP Servers** - Spawned as child processes by the Agent SDK
   - OpenAIRE MCP Server (research data)
   - Visualization MCP Server (charting)

The MCP servers are spawned on-demand when queries are processed, so they run as child processes within the Next.js container.

### Resource Requirements

- **Memory**: 512Mi-2Gi (depends on query complexity)
- **CPU**: 500m-2000m (MCP servers + Next.js)
- **Disk**: Minimal (no persistent storage needed for demo)

### Scaling Considerations

- Each pod spawns its own MCP server instances
- Job store is in-memory (per-pod)
- For production, consider:
  - Redis for distributed job store
  - Separate service for Agent SDK + MCP servers
  - Persistent storage for caching

---

## Development Notes

The Dockerfile uses `npm run dev` for hot-reload during development. For production:

1. Change `CMD` to build and start:
   ```dockerfile
   RUN npm run build
   CMD ["npm", "start"]
   ```

2. Or create a separate `Dockerfile.prod`

---

## Troubleshooting

### Container exits immediately
- Check that ANTHROPIC_API_KEY is set correctly
- View logs: `docker logs <container-id>`

### MCP servers fail to start
- Check that TypeScript compiled correctly: `docker exec <container> ls /app/packages/mcp/dist`
- View MCP logs in container output (LOG_LEVEL=debug for more detail)

### Port 3000 already in use
- Change port mapping: `docker run -p 8080:3000 ...`

### Build fails
- Clear Docker cache: `docker build --no-cache -t openaire-demo .`
- Check that all packages have valid package.json files
