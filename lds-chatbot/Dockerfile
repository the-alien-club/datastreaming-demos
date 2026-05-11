# syntax=docker/dockerfile:1.7

# Stage 1: Install dependencies
FROM node:20-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Build
FROM node:20-slim AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
# basePath is baked into the Next.js client bundles at build time and cannot
# be changed at runtime. Injected via --build-arg from CI.
ARG NEXT_PUBLIC_BASE_PATH=/agents
ENV NEXT_PUBLIC_BASE_PATH=${NEXT_PUBLIC_BASE_PATH}
# Build-time placeholders so `next build` doesn't fail on env validation;
# real values come from the ConfigMap / Secrets at runtime.
ENV DATABASE_URL=postgres://build:build@localhost:5432/build
ENV BETTER_AUTH_SECRET=build-time-placeholder
ENV BETTER_AUTH_URL=http://localhost:3000
# AUTHENTIK_BASE_URL has no NEXT_PUBLIC_ prefix on purpose: server-side only,
# read at runtime from the ConfigMap. No build-time placeholder needed.
ENV AUTHENTIK_APP_SLUG=datastreaming
ENV AUTHENTIK_CLIENT_ID=build-time-placeholder
ENV AUTHENTIK_CLIENT_SECRET=build-time-placeholder
ENV PLATFORM_API_URL=http://localhost:3333
ENV CLUSTER_ID=77

# Generate Prisma client before building Next.js — lib/generated is gitignored
# so it doesn't exist in the COPY . . layer and must be produced here.
RUN npx prisma generate
RUN npm run build

# Stage 3: Production runtime
FROM node:20-slim AS runner
WORKDIR /app

# pg_isready so the entrypoint can wait for Postgres before migrating.
RUN apt-get update && apt-get install -y --no-install-recommends postgresql-client \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

# Standalone tracing can miss runtime deps (pg, tsx used by migrate-auth.ts);
# copy full node_modules first, then the standalone build layered on top wins for Next.js internals.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

# Prisma schema + migrations (needed by `prisma migrate deploy` at startup).
COPY --from=builder --chown=node:node /app/prisma ./prisma
# Prisma v7 config file — required by all prisma CLI commands at runtime.
COPY --from=builder --chown=node:node /app/prisma.config.ts ./prisma.config.ts
# Full lib/ source — needed by migrate-auth.ts (imports lib/auth, lib/db, etc.)
# lib/generated is inside lib/ so this covers the Prisma client too.
COPY --from=builder --chown=node:node /app/lib ./lib

# Scripts the entrypoint actually runs — keep dev-only debug
# utilities (debug-sse.mjs, seed-mcps.mjs) out of the runtime image.
COPY --from=builder --chown=node:node /app/scripts/migrate-auth.ts ./scripts/migrate-auth.ts
COPY --from=builder --chown=node:node /app/tsconfig.json ./tsconfig.json
COPY --from=builder --chown=node:node /app/package.json ./package.json

COPY --chown=node:node --chmod=0755 docker/entrypoint.sh /app/entrypoint.sh

USER node

EXPOSE 3000

ENTRYPOINT ["/app/entrypoint.sh"]
