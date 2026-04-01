# ============================================================
# Console Application
# ============================================================
# Uses the unified build base image with everything pre-built.
# Both stages run TypeScript source directly (tsx / ts-node with
# --conditions=source) so they resolve workspace packages to .ts
# source files, bypassing dist/ bundler output entirely.
# ============================================================

# ============================================================
# Stage 0: workspace — shared source layer
# ============================================================
FROM itrade-deps:latest AS workspace

WORKDIR /app

COPY --chown=appuser:nodejs tsconfig.base.json ./
COPY --chown=appuser:nodejs packages/ ./packages/
COPY --chown=appuser:nodejs apps/ ./apps/

# ============================================================
# Stage 1: schema-migrator — TypeORM schema sync (init container)
# ============================================================
FROM workspace AS schema-migrator

WORKDIR /app/packages/data-manager

ENV NODE_ENV=production

CMD ["pnpm", "run", "sync-schema"]

# ============================================================
# Stage 2: console — Production console application
# ============================================================
FROM workspace AS console

WORKDIR /app/apps/console

ENV NODE_ENV=production

CMD ["pnpm", "start"]
