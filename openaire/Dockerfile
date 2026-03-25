# Stage 1: Install dependencies
FROM node:20-slim AS deps
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY packages/mcp/package.json ./packages/mcp/
COPY packages/viz-mcp/package.json ./packages/viz-mcp/
COPY packages/frontend/package.json ./packages/frontend/

# Install all dependencies
WORKDIR /app/packages/mcp
RUN npm install

WORKDIR /app/packages/viz-mcp
RUN npm install

WORKDIR /app/packages/frontend
RUN npm install

# Stage 2: Build
FROM node:20-slim AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/packages/mcp/node_modules ./packages/mcp/node_modules
COPY --from=deps /app/packages/viz-mcp/node_modules ./packages/viz-mcp/node_modules
COPY --from=deps /app/packages/frontend/node_modules ./packages/frontend/node_modules

# Copy all source code
COPY packages/mcp/src ./packages/mcp/src
COPY packages/mcp/tsconfig.json packages/mcp/package.json ./packages/mcp/

COPY packages/viz-mcp/src ./packages/viz-mcp/src
COPY packages/viz-mcp/tsconfig.json packages/viz-mcp/package.json ./packages/viz-mcp/

COPY packages/frontend ./packages/frontend

# Build MCP servers
WORKDIR /app/packages/mcp
RUN npm run build

WORKDIR /app/packages/viz-mcp
RUN npm run build

# Build Next.js (NEXT_PUBLIC_BASE_PATH baked at build time for prod routing)
# BETTER_AUTH_* are build-time placeholders so static generation doesn't fail;
# real values are injected at runtime via ConfigMap/Secrets.
WORKDIR /app/packages/frontend
ENV NODE_ENV=production
ENV NEXT_PUBLIC_BASE_PATH=/openaire
ENV BETTER_AUTH_SECRET=build-time-placeholder
ENV BETTER_AUTH_URL=http://localhost:3000
RUN npm run build

# Stage 3: Production runtime
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install Claude Code CLI globally and git (needed for SDK to clone plugin from GitHub)
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/* \
    && npm install -g @anthropic-ai/claude-code

# Use the built-in node user (UID 1000, GID 1000) — matches Helm securityContext.runAsUser
# Copy built MCP servers
COPY --from=builder --chown=node:node /app/packages/mcp/dist ./packages/mcp/dist
COPY --from=builder --chown=node:node /app/packages/mcp/package.json ./packages/mcp/
COPY --from=builder --chown=node:node /app/packages/mcp/node_modules ./packages/mcp/node_modules

COPY --from=builder --chown=node:node /app/packages/viz-mcp/dist ./packages/viz-mcp/dist
COPY --from=builder --chown=node:node /app/packages/viz-mcp/package.json ./packages/viz-mcp/
COPY --from=builder --chown=node:node /app/packages/viz-mcp/node_modules ./packages/viz-mcp/node_modules

# Copy Next.js standalone build (includes its own trimmed node_modules)
COPY --from=builder --chown=node:node /app/packages/frontend/.next/standalone ./packages/frontend/
COPY --from=builder --chown=node:node /app/packages/frontend/.next/static ./packages/frontend/.next/static
COPY --from=builder --chown=node:node /app/packages/frontend/public ./packages/frontend/public
# Agent SDK spawns claude CLI as subprocess — not traced by standalone, copy explicitly
COPY --from=builder --chown=node:node /app/packages/frontend/node_modules/@anthropic-ai ./packages/frontend/node_modules/@anthropic-ai

# Copy entrypoint script
COPY --chown=node:node environment/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Create writable dirs for Claude Code and MCP config
RUN mkdir -p /etc/claude-code /tmp/claude-openaire /home/node/.claude \
    && chown -R node:node /etc/claude-code /tmp/claude-openaire /home/node/.claude /app

USER node

EXPOSE 3000

ENTRYPOINT ["/app/entrypoint.sh"]
