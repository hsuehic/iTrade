# ============================================================
# Stage 1: deps — use shared dependencies base image
# ============================================================
# Uses the shared itrade-deps image built from Dockerfile.deps
# This avoids installing dependencies multiple times across services
# ============================================================
FROM itrade-deps:latest AS deps

# ============================================================
# Stage 2: builder — pre-compile TypeScript
# ============================================================
# Compiling TypeScript at build time eliminates the ~20s ts-node
# startup cost. The runtime stage uses plain `node`, not ts-node.
# ============================================================
FROM node:20-alpine AS builder

RUN apk add --update --no-cache python3 build-base
RUN npm install -g pnpm@10.18.0

WORKDIR /app

# Copy installed node_modules from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy all source code
COPY packages/ ./packages/
COPY apps/console/ ./apps/console/
COPY tsconfig.base.json tsconfig.json package.json pnpm-workspace.yaml ./

# Copy individual package node_modules (for package-scoped bins like tsc)
COPY --from=deps /app/packages/core/node_modules              ./packages/core/node_modules
COPY --from=deps /app/packages/data-manager/node_modules      ./packages/data-manager/node_modules
COPY --from=deps /app/packages/exchange-connectors/node_modules ./packages/exchange-connectors/node_modules
COPY --from=deps /app/packages/strategies/node_modules        ./packages/strategies/node_modules
COPY --from=deps /app/packages/utils/node_modules             ./packages/utils/node_modules
COPY --from=deps /app/packages/logger/node_modules            ./packages/logger/node_modules
COPY --from=deps /app/packages/risk-manager/node_modules      ./packages/risk-manager/node_modules
COPY --from=deps /app/packages/portfolio-manager/node_modules ./packages/portfolio-manager/node_modules
COPY --from=deps /app/packages/push-notification/node_modules ./packages/push-notification/node_modules
COPY --from=deps /app/apps/console/node_modules               ./apps/console/node_modules

# Step 1: Build all workspace packages (produces packages/*/dist/)
# Build in dependency order: dependencies first, then dependents
RUN pnpm --filter=@itrade/utils build
RUN pnpm --filter=@itrade/core build
RUN pnpm --filter=@itrade/logger build
RUN pnpm --filter=@itrade/data-manager build
RUN pnpm --filter=@itrade/strategies build
RUN pnpm --filter=@itrade/risk-manager build
RUN pnpm --filter=@itrade/portfolio-manager build
RUN pnpm --filter=@itrade/push-notification build
RUN pnpm --filter=@itrade/exchange-connectors build

# Step 2: Compile the console app itself (outputs to apps/console/dist/)
# tsconfig.build.json uses module=CommonJS so no tsconfig-paths needed at runtime.
WORKDIR /app/apps/console
RUN npx tsc -p tsconfig.build.json

# ============================================================
# Stage 3a: schema-migrator — TypeORM schema sync (init container)
# ============================================================
# Based on builder stage which has all TypeScript source files.
# Runs once per deployment, then exits.
# ============================================================
FROM builder AS schema-migrator

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 consoleapp

USER consoleapp

# Stay in the app root where node_modules is available
WORKDIR /app

ENV NODE_ENV=production
ENV TS_NODE_PROJECT=packages/data-manager/tsconfig.json
ENV TS_NODE_FILES=true
ENV NODE_OPTIONS=--conditions=source

# Run from app root where node_modules with ts-node is available
CMD ["node", "-r", "ts-node/register", "-r", "tsconfig-paths/register", "-r", "reflect-metadata", "packages/data-manager/sync-schema-to-db.ts"]

# ============================================================
# Stage 3b: runner — lean production image (plain node, no ts-node)
# ============================================================
FROM node:20-alpine AS runner

# No additional packages needed for runner stage

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 consoleapp

# ── Copy compiled output ─────────────────────────────────────
# The compiled dist/ from the builder stage.
COPY --from=builder --chown=consoleapp:nodejs /app/apps/console/dist ./apps/console/dist
COPY --from=builder --chown=consoleapp:nodejs /app/apps/console/package.json ./apps/console/

# ── Copy compiled workspace packages ────────────────────────
# Packages are compiled; node_modules/@itrade/* symlinks resolve to these.
COPY --from=builder --chown=consoleapp:nodejs /app/packages/core/dist          ./packages/core/dist
COPY --from=builder --chown=consoleapp:nodejs /app/packages/core/package.json  ./packages/core/
COPY --from=builder --chown=consoleapp:nodejs /app/packages/data-manager/dist  ./packages/data-manager/dist
COPY --from=builder --chown=consoleapp:nodejs /app/packages/data-manager/package.json ./packages/data-manager/
COPY --from=builder --chown=consoleapp:nodejs /app/packages/exchange-connectors/dist  ./packages/exchange-connectors/dist
COPY --from=builder --chown=consoleapp:nodejs /app/packages/exchange-connectors/package.json ./packages/exchange-connectors/
COPY --from=builder --chown=consoleapp:nodejs /app/packages/strategies/dist    ./packages/strategies/dist
COPY --from=builder --chown=consoleapp:nodejs /app/packages/strategies/package.json ./packages/strategies/
COPY --from=builder --chown=consoleapp:nodejs /app/packages/utils/dist         ./packages/utils/dist
COPY --from=builder --chown=consoleapp:nodejs /app/packages/utils/package.json ./packages/utils/
COPY --from=builder --chown=consoleapp:nodejs /app/packages/logger/dist        ./packages/logger/dist
COPY --from=builder --chown=consoleapp:nodejs /app/packages/logger/package.json ./packages/logger/
COPY --from=builder --chown=consoleapp:nodejs /app/packages/risk-manager/dist  ./packages/risk-manager/dist
COPY --from=builder --chown=consoleapp:nodejs /app/packages/risk-manager/package.json ./packages/risk-manager/
COPY --from=builder --chown=consoleapp:nodejs /app/packages/portfolio-manager/dist    ./packages/portfolio-manager/dist
COPY --from=builder --chown=consoleapp:nodejs /app/packages/portfolio-manager/package.json ./packages/portfolio-manager/
COPY --from=builder --chown=consoleapp:nodejs /app/packages/push-notification/dist    ./packages/push-notification/dist
COPY --from=builder --chown=consoleapp:nodejs /app/packages/push-notification/package.json ./packages/push-notification/

# ── Copy node_modules (includes @itrade/* symlinks → packages above) ──
COPY --from=builder --chown=consoleapp:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=consoleapp:nodejs /app/apps/console/node_modules ./apps/console/node_modules
COPY --from=builder --chown=consoleapp:nodejs /app/package.json ./
COPY --from=builder --chown=consoleapp:nodejs /app/pnpm-workspace.yaml ./

USER consoleapp

WORKDIR /app/apps/console

# reflect-metadata must still be preloaded for TypeORM decorators.
# No ts-node, no tsconfig-paths — plain node with compiled JS.
# Startup time: ~2s  (was ~20s with ts-node)
CMD ["node", "-r", "reflect-metadata", "dist/main.js"]
