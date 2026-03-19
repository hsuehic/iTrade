#!/usr/bin/env bash
# =============================================================
# deploy-remote.sh — Runs on the GCE instance during CI/CD deploy
# =============================================================
# Called by .github/workflows/deploy.yml after SCP to the server.
#
# Required environment variables (passed by the CI runner):
#   GITHUB_REPOSITORY  — e.g. org/iTrade
#   COMMIT_SHA         — full git SHA being deployed
#   GHCR_TOKEN         — GitHub Container Registry token
#   GH_ACTOR           — GitHub actor (for GHCR login)
#   IMAGE_PREFIX       — e.g. ghcr.io/org/itrade
#
# SSL/proxy is handled externally by nginx-proxy-manager.
# This script only manages: db, schema-migrator, console, web.
# =============================================================

set -euo pipefail

APP_DIR="/opt/itrade/app"
COMPOSE_FILE="$APP_DIR/docker-compose.prod.yml"
DEPLOY_START=$(date +%s)

# ══════════════════════════════════════════════════════════════
# Phase 1: Preparation (old containers still serving traffic)
# ══════════════════════════════════════════════════════════════
echo ""
echo "══ Phase 1: Preparation (zero downtime) ══"

download_from_github() {
  local source_path="$1"
  local dest_path="$2"
  local tmp_path="${dest_path}.tmp"
  local ok=false

  if curl -fsSL --connect-timeout 10 --max-time 30 \
    "https://raw.githubusercontent.com/$GITHUB_REPOSITORY/$COMMIT_SHA/$source_path" \
    -o "$tmp_path"; then
    ok=true
  elif curl -fsSL --connect-timeout 10 --max-time 30 \
    -H "Accept: application/vnd.github.raw" \
    "https://api.github.com/repos/$GITHUB_REPOSITORY/contents/$source_path?ref=$COMMIT_SHA" \
    -o "$tmp_path"; then
    ok=true
  fi

  if [ "$ok" = true ] && [ -s "$tmp_path" ]; then
    mv "$tmp_path" "$dest_path"
    echo "  ✅ Downloaded: $source_path"
    return 0
  fi

  rm -f "$tmp_path"
  echo "  ❌ Failed to download: $source_path"
  return 1
}

echo "▶ Setting up directories..."
sudo -n mkdir -p /opt/itrade "$APP_DIR" 2>/dev/null || mkdir -p /opt/itrade "$APP_DIR"
sudo -n chown -R "$(whoami):$(whoami)" /opt/itrade/ 2>/dev/null || true
sudo -n chmod 755 /opt/itrade/ /opt/itrade/app/ 2>/dev/null || true

echo "▶ Downloading deployment files..."
cd "$APP_DIR"
download_from_github "docker-compose.prod.yml" "$COMPOSE_FILE"

if [ ! -s "$COMPOSE_FILE" ] || ! grep -q "services:" "$COMPOSE_FILE"; then
  echo "❌ docker-compose.prod.yml is empty or invalid"
  exit 1
fi
FILE_SIZE=$(wc -c < "$COMPOSE_FILE")
echo "  ✅ docker-compose.prod.yml valid (${FILE_SIZE} bytes)"

echo "▶ Verifying environment files..."
sudo chmod 600 /opt/itrade/.env.* 2>/dev/null || true

for env_file in /opt/itrade/.env.{console,db,web}; do
  if [ ! -f "$env_file" ]; then
    echo "❌ Missing: $env_file"
    exit 1
  fi
done
echo "  ✅ All environment files present"

echo "▶ Logging in to GHCR..."
echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GH_ACTOR" --password-stdin

export CONSOLE_IMAGE="$IMAGE_PREFIX/console:$COMMIT_SHA"
export SCHEMA_MIGRATOR_IMAGE="$IMAGE_PREFIX/schema-migrator:$COMMIT_SHA"
export WEB_IMAGE="$IMAGE_PREFIX/web:$COMMIT_SHA"

echo "▶ Pre-pulling new images (services still running)..."
PULL_START=$(date +%s)

docker compose -f "$COMPOSE_FILE" pull console schema-migrator web

PULL_END=$(date +%s)
echo "  ✅ Images pre-pulled in $((PULL_END - PULL_START))s (zero downtime)"

PHASE1_END=$(date +%s)
echo "══ Phase 1 complete: $((PHASE1_END - DEPLOY_START))s (zero downtime) ══"

# ══════════════════════════════════════════════════════════════
# Phase 2: Rolling update (minimal downtime)
# ══════════════════════════════════════════════════════════════
echo ""
echo "══ Phase 2: Rolling update (minimal downtime starts) ══"
DOWNTIME_START=$(date +%s)

# Volume layout for PostgreSQL 18:
#   docker-compose mounts named volume at /var/lib/postgresql
#   PG18 PGDATA = /var/lib/postgresql/18/docker (inside the named volume)
#   This ensures data persists across container recreations.
#
# IMPORTANT: Never mount at /var/lib/postgresql/data — PG18 doesn't use
# that path, so data would end up in a disposable anonymous volume instead.
echo "▶ Starting database..."
docker compose -f "$COMPOSE_FILE" stop db 2>/dev/null || true
docker compose -f "$COMPOSE_FILE" rm -f db 2>/dev/null || true

docker compose -f "$COMPOSE_FILE" up -d --no-build db
echo "▶ Waiting for database..."
DB_TIMEOUT=30
DB_ELAPSED=0
while [ $DB_ELAPSED -lt $DB_TIMEOUT ]; do
  if docker inspect --format='{{.State.Health.Status}}' itrade-db 2>/dev/null | grep -q "healthy"; then
    break
  fi
  sleep 2
  DB_ELAPSED=$((DB_ELAPSED + 2))
done
if [ $DB_ELAPSED -ge $DB_TIMEOUT ]; then
  echo "❌ Database health check timeout"
  docker compose -f "$COMPOSE_FILE" logs --tail=20 db
  exit 1
fi
echo "  ✅ Database healthy (waited ${DB_ELAPSED}s)"

echo "▶ Stopping console before schema migration..."
docker compose -f "$COMPOSE_FILE" stop console 2>/dev/null || true

# Sync DB password: POSTGRES_PASSWORD only takes effect during initial initdb.
# If the volume already exists with a different password, the env var is ignored.
# Read the expected password from .env.console and reset it inside the running DB.
CONSOLE_ENV="/opt/itrade/.env.console"
EXPECTED_DB_USER=$(sed -n 's/^DB_USER=//p' "$CONSOLE_ENV" | head -n 1)
EXPECTED_DB_PASS=$(sed -n 's/^DB_PASSWORD=//p' "$CONSOLE_ENV" | head -n 1)
EXPECTED_DB_USER="${EXPECTED_DB_USER:-itrade}"

if [ -n "${EXPECTED_DB_PASS:-}" ]; then
  echo "▶ Syncing database password..."
  ESCAPED_PASS=$(printf '%s' "$EXPECTED_DB_PASS" | sed "s/'/''/g")
  docker exec itrade-db psql -U "${EXPECTED_DB_USER}" -d postgres \
    -c "ALTER USER ${EXPECTED_DB_USER} WITH PASSWORD '${ESCAPED_PASS}';" \
    2>/dev/null && echo "  ✅ Database password synced" \
    || echo "  ⚠️  Password sync failed (may already be correct)"
fi

docker exec itrade-db psql -U "${EXPECTED_DB_USER}" -d "${POSTGRES_DB:-itrade}" \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid != pg_backend_pid() AND application_name != 'schema-migrator';" \
  2>/dev/null || true

docker compose -f "$COMPOSE_FILE" rm -sf schema-migrator 2>/dev/null || true
echo "▶ Running schema migration..."
MIGRATION_START=$(date +%s)
docker compose -f "$COMPOSE_FILE" up --no-build schema-migrator

MIGRATOR_EXIT=$(docker inspect --format='{{.State.ExitCode}}' itrade-schema-migrator 2>/dev/null || echo "1")
MIGRATION_END=$(date +%s)
if [ "$MIGRATOR_EXIT" != "0" ]; then
  echo "❌ Schema migration failed (exit code: $MIGRATOR_EXIT)"
  docker compose -f "$COMPOSE_FILE" logs --tail=30 schema-migrator
  exit 1
fi
echo "  ✅ Schema migration complete ($((MIGRATION_END - MIGRATION_START))s)"

echo "▶ Removing old console, web, and adminer containers..."
docker compose -f "$COMPOSE_FILE" rm -sf console web adminer 2>/dev/null || true
for cname in itrade-console itrade-web itrade-adminer; do
  docker rm -f "$cname" 2>/dev/null || true
done

echo "▶ Starting console, web, and adminer services..."
docker compose -f "$COMPOSE_FILE" up -d --no-build console web adminer

echo "▶ Waiting for web service to be healthy..."
WEB_TIMEOUT=90
WEB_ELAPSED=0
while [ $WEB_ELAPSED -lt $WEB_TIMEOUT ]; do
  if docker inspect --format='{{.State.Health.Status}}' itrade-web 2>/dev/null | grep -q "healthy"; then
    break
  fi
  sleep 3
  WEB_ELAPSED=$((WEB_ELAPSED + 3))
  if [ $((WEB_ELAPSED % 15)) -eq 0 ]; then
    echo "  Waiting... ${WEB_ELAPSED}s/${WEB_TIMEOUT}s"
  fi
done

DOWNTIME_END=$(date +%s)

if [ $WEB_ELAPSED -ge $WEB_TIMEOUT ]; then
  echo "❌ Web service health check timeout"
  docker compose -f "$COMPOSE_FILE" logs --tail=50 web
  exit 1
fi

echo "  ✅ Web service healthy (waited ${WEB_ELAPSED}s)"
echo "══ Phase 2 complete: ~$((DOWNTIME_END - DOWNTIME_START))s service downtime ══"

# ══════════════════════════════════════════════════════════════
# Phase 3: Post-deploy cleanup
# ══════════════════════════════════════════════════════════════
echo ""
echo "══ Phase 3: Post-deploy cleanup ══"

# Stop leftover nginx/certbot containers from previous deploys
for old_svc in nginx certbot; do
  if docker ps -a --format '{{.Names}}' | grep -q "itrade-${old_svc}"; then
    echo "▶ Removing leftover itrade-${old_svc} container..."
    docker rm -f "itrade-${old_svc}" 2>/dev/null || true
  fi
done

# Remove stale nginx reload cron if it exists
if crontab -l 2>/dev/null | grep -q "itrade-nginx nginx -s reload"; then
  echo "▶ Removing old nginx reload cron job..."
  CLEAN_CRON=$(crontab -l 2>/dev/null | grep -v "itrade-nginx nginx -s reload" | grep -v "# iTrade nginx SSL reload" || true)
  if [ -n "$CLEAN_CRON" ]; then
    echo "$CLEAN_CRON" | crontab -
  else
    crontab -r 2>/dev/null || true
  fi
  echo "  ✅ Cron job removed"
fi

# Remove unused Docker images to free disk space on GCE
echo "▶ Cleaning up unused Docker images..."
BEFORE_SIZE=$(docker system df --format '{{.Size}}' 2>/dev/null | head -1 || echo "unknown")

# 1) Remove dangling (untagged) images
docker image prune -f 2>/dev/null || true

# 2) Remove old GHCR images no longer used by any running container
USED_IMAGES=$(docker ps --format '{{.Image}}' | sort -u)
OLD_IMAGES=$(docker images --format '{{.Repository}}:{{.Tag}}' \
  | grep "^ghcr.io/" \
  | grep -v "<none>" \
  | while read -r img; do
      echo "$USED_IMAGES" | grep -qxF "$img" || echo "$img"
    done)

if [ -n "$OLD_IMAGES" ]; then
  echo "  Removing unused GHCR images:"
  echo "$OLD_IMAGES" | while read -r img; do
    echo "    - $img"
    docker rmi "$img" 2>/dev/null || true
  done
else
  echo "  No unused GHCR images found"
fi

# 3) Final dangling cleanup after rmi
docker image prune -f 2>/dev/null || true

AFTER_SIZE=$(docker system df --format '{{.Size}}' 2>/dev/null | head -1 || echo "unknown")
echo "  ✅ Image cleanup complete (before: ${BEFORE_SIZE}, after: ${AFTER_SIZE})"

docker logout ghcr.io >/dev/null 2>&1 || true

DEPLOY_END=$(date +%s)

# ── Final status ─────────────────────────────────────────────
echo ""
echo "▶ Final container status:"
docker compose -f "$COMPOSE_FILE" ps

echo ""
echo "🎉 Deployment successful!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Total pipeline time:  $((DEPLOY_END - DEPLOY_START))s"
echo "  Image pre-pull:       $((PULL_END - PULL_START))s (zero downtime)"
echo "  Service downtime:     ~$((DOWNTIME_END - DOWNTIME_START))s"
echo "  Schema migration:     $((MIGRATION_END - MIGRATION_START))s"
echo "  Web health wait:      ${WEB_ELAPSED}s"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
