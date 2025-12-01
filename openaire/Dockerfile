# Use Node.js LTS
FROM node:20-alpine

# Install build tools for native dependencies
RUN apk add --no-cache python3 make g++

# Set working directory and create it with proper ownership
RUN mkdir -p /app && chown -R node:node /app

# Switch to non-root user BEFORE installing dependencies
USER node

WORKDIR /app

# Copy root package.json
COPY --chown=node:node package.json ./

# Copy only package.json files first (for better layer caching)
COPY --chown=node:node packages/mcp/package.json ./packages/mcp/
COPY --chown=node:node packages/viz-mcp/package.json ./packages/viz-mcp/
COPY --chown=node:node packages/frontend/package.json ./packages/frontend/

# Install dependencies for MCP server
WORKDIR /app/packages/mcp
RUN npm install

# Install dependencies for Viz MCP server
WORKDIR /app/packages/viz-mcp
RUN npm install

# Install dependencies for frontend
WORKDIR /app/packages/frontend
RUN npm install

# Now copy the actual source code (this layer only rebuilds when code changes)
WORKDIR /app
COPY --chown=node:node packages/mcp/src ./packages/mcp/src
COPY --chown=node:node packages/mcp/tsconfig.json ./packages/mcp/
COPY --chown=node:node packages/viz-mcp/src ./packages/viz-mcp/src
COPY --chown=node:node packages/viz-mcp/tsconfig.json ./packages/viz-mcp/
COPY --chown=node:node packages/frontend ./packages/frontend

# Build MCP server (needed for frontend dependency)
WORKDIR /app/packages/mcp
RUN npm run build

# Build Viz MCP server
WORKDIR /app/packages/viz-mcp
RUN npm run build

# Set working directory to frontend
WORKDIR /app/packages/frontend

# Expose Next.js dev port
EXPOSE 3000

# Start Next.js in dev mode
CMD ["npm", "run", "dev"]
