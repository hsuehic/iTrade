# ============================================================
# Web Application (Next.js)
# ============================================================
# Uses the unified build base image with everything pre-built
# ============================================================
FROM itrade-deps:latest AS runner

WORKDIR /app/apps/web

ENV NODE_ENV=production
ENV BUILD_MODE=prod
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3002
ENV HOSTNAME=0.0.0.0

EXPOSE 3002

# Use Next.js CLI for production start - simpler and more reliable
CMD ["pnpm", "start"]
