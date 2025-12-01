# Stage 1: Install dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package.json ./
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
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/packages/mcp/node_modules ./packages/mcp/node_modules
COPY --from=deps /app/packages/viz-mcp/node_modules ./packages/viz-mcp/node_modules
COPY --from=deps /app/packages/frontend/node_modules ./packages/frontend/node_modules

# Copy all source code first
COPY packages/mcp/src ./packages/mcp/src
COPY packages/mcp/tsconfig.json ./packages/mcp/
COPY packages/mcp/package.json ./packages/mcp/

COPY packages/viz-mcp/src ./packages/viz-mcp/src
COPY packages/viz-mcp/tsconfig.json ./packages/viz-mcp/
COPY packages/viz-mcp/package.json ./packages/viz-mcp/

COPY packages/frontend ./packages/frontend

# Build MCP servers
WORKDIR /app/packages/mcp
RUN npm run build

WORKDIR /app/packages/viz-mcp
RUN npm run build

# Build Next.js
WORKDIR /app/packages/frontend
ENV NODE_ENV=production
RUN npm run build

# Stage 3: Production runtime
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built MCP servers
COPY --from=builder --chown=nextjs:nodejs /app/packages/mcp/dist ./packages/mcp/dist
COPY --from=builder --chown=nextjs:nodejs /app/packages/mcp/package.json ./packages/mcp/
COPY --from=builder --chown=nextjs:nodejs /app/packages/mcp/node_modules ./packages/mcp/node_modules

COPY --from=builder --chown=nextjs:nodejs /app/packages/viz-mcp/dist ./packages/viz-mcp/dist
COPY --from=builder --chown=nextjs:nodejs /app/packages/viz-mcp/package.json ./packages/viz-mcp/
COPY --from=builder --chown=nextjs:nodejs /app/packages/viz-mcp/node_modules ./packages/viz-mcp/node_modules

# Copy Next.js standalone build to maintain structure
COPY --from=builder --chown=nextjs:nodejs /app/packages/frontend/.next/standalone ./packages/frontend/
# Copy static files and public
COPY --from=builder --chown=nextjs:nodejs /app/packages/frontend/node_modules ./packages/frontend/node_modules
COPY --from=builder --chown=nextjs:nodejs /app/packages/frontend/.next/static ./packages/frontend/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/packages/frontend/public ./packages/frontend/public

USER nextjs

EXPOSE 3000

# server.js is in standalone output
CMD ["node", "packages/frontend/server.js"]
