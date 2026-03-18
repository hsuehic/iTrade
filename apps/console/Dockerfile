# ============================================================
# Console Application
# ============================================================
# Uses the unified build base image with everything pre-built
# ============================================================

# ============================================================
# Stage 1: schema-migrator — TypeORM schema sync (init container)
# ============================================================
FROM itrade-deps:latest AS schema-migrator

WORKDIR /app/packages/data-manager

ENV NODE_ENV=production
ENV TS_NODE_PROJECT=tsconfig.json

# Run the package script so runtime resolution is handled by pnpm workspace binaries.
# This avoids `node -r ts-node/register` module resolution failures in container runtime.
CMD ["pnpm", "run", "sync-schema"]

# ============================================================
# Stage 2: console — Production console application
# ============================================================
FROM itrade-deps:latest AS console

WORKDIR /app/apps/console

ENV NODE_ENV=production

# Use production start script with compiled JavaScript for faster startup (~2s vs ~20s with ts-node)
# reflect-metadata is still needed for TypeORM decorators
CMD ["pnpm", "start:prod"]
