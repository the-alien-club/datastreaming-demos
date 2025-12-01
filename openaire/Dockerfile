# Use Node.js LTS
FROM node:20-alpine

# Install build tools for native dependencies
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy root package.json
COPY package.json ./

# Copy all packages
COPY packages ./packages

# Install dependencies for MCP server
WORKDIR /app/packages/mcp
RUN npm install

# Build MCP server (needed for frontend dependency)
RUN npm run build

# Install dependencies for Viz MCP server
WORKDIR /app/packages/viz-mcp
RUN npm install

# Build Viz MCP server
RUN npm run build

# Install dependencies for frontend (this will link to local MCP packages)
WORKDIR /app/packages/frontend
RUN npm install

# Expose Next.js dev port
EXPOSE 3000

# Start Next.js in dev mode
CMD ["npm", "run", "dev"]
