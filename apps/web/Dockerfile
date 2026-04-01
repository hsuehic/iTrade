# ============================================================
# Web Application (Next.js)
# ============================================================
# Uses the unified deps base image and builds in this image
# ============================================================
FROM itrade-deps:latest AS build

WORKDIR /app

COPY --chown=appuser:nodejs tsconfig.base.json ./
COPY --chown=appuser:nodejs packages/ ./packages/
COPY --chown=appuser:nodejs apps/ ./apps/

RUN pnpm -r --filter "./packages/*" build

WORKDIR /app/apps/web

ENV NODE_ENV=production
ENV BUILD_MODE=prod
ENV NEXT_TELEMETRY_DISABLED=1

RUN pnpm build

FROM build AS runner

WORKDIR /app/apps/web

ENV NODE_ENV=production
ENV BUILD_MODE=prod
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3002
ENV HOSTNAME=0.0.0.0

EXPOSE 3002

# Use Next.js CLI for production start - simpler and more reliable
CMD ["pnpm", "start"]
