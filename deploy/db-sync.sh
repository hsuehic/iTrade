#!/usr/bin/env bash
# =============================================================
# db-sync.sh — Export local PostgreSQL → Import to GCE
# =============================================================
#
# Usage (run from your LOCAL machine):
#
#   # Full export + upload + import in one shot:
#   bash deploy/db-sync.sh sync
#
#   # Or step by step:
#   bash deploy/db-sync.sh export          # dump local DB to file
#   bash deploy/db-sync.sh upload          # scp dump to GCE
#   bash deploy/db-sync.sh import          # restore on GCE
#
# Requirements:
#   - Local Docker running (local postgres container)
#   - GCE_HOST / GCE_USER env vars set (or edit CONFIG below)
#   - SSH key for GCE already configured
#
# Config is read from:
#   Local credentials : apps/console/.env  (or .env.local)
#   GCE host info     : .env.gce (or override via env vars)
# =============================================================

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${GREEN}▶${NC} $*"; }
warn()  { echo -e "${YELLOW}⚠${NC}  $*"; }
error() { echo -e "${RED}✖${NC}  $*" >&2; exit 1; }
dim()   { echo -e "${CYAN}  $*${NC}"; }

# ── CONFIG — edit or override via environment variables ──────
# Local postgres Docker container name
if [[ -z "${LOCAL_CONTAINER:-}" ]]; then
  if docker ps --format '{{.Names}}' | grep -q "^itrade-db$"; then
    LOCAL_CONTAINER="itrade-db"
  elif docker ps --format '{{.Names}}' | grep -q "^proxy-manager-db-1$"; then
    LOCAL_CONTAINER="proxy-manager-db-1"
  else
    LOCAL_CONTAINER="itrade-db"
  fi
fi

# Dump file location (local machine)
DUMP_FILE="${DUMP_FILE:-/tmp/itrade_db_$(date +%Y%m%d_%H%M%S).dump}"

# GCE connection (read from .env.gce or override)
GCE_ENV_FILE=".env.gce"
if [[ -f "$GCE_ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$GCE_ENV_FILE"
fi
GCE_HOST="${GCE_HOST:-}"
GCE_USER="${GCE_USER:-}"
GCE_KEY="${GCE_KEY:-}"

# SSH options (mirrors sync-env.sh)
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o BatchMode=yes)
if [[ -n "$GCE_KEY" ]]; then
  [[ -f "$GCE_KEY" ]] || error "GCE_KEY file not found: $GCE_KEY"
  SSH_OPTS+=(-i "$GCE_KEY")
fi

# Remote paths on GCE
GCE_DUMP_PATH="/tmp/itrade_db_import.dump"
GCE_COMPOSE_FILE="/opt/itrade/app/docker-compose.prod.yml"
GCE_CONTAINER="itrade-db"
# ─────────────────────────────────────────────────────────────

# ── Helpers ──────────────────────────────────────────────────

# Get PG major version from a running local container
get_local_pg_version() {
  local container="${1:-$LOCAL_CONTAINER}"
  docker exec "$container" psql -U "${LOCAL_DB_USER:-postgres}" -d postgres \
    -tAc "SHOW server_version;" 2>/dev/null | cut -d. -f1 || echo "?"
}

# Get PG major version from GCE container via SSH
get_gce_pg_version() {
  ssh "${SSH_OPTS[@]}" "$GCE_USER@$GCE_HOST" \
    "docker exec -e PGPASSWORD='${GCE_DB_PASS:-}' '$GCE_CONTAINER' \
       psql -U '${GCE_DB_USER:-itrade}' -d postgres \
       -tAc 'SHOW server_version;'" 2>/dev/null | cut -d. -f1 || echo "?"
}

# Check that a local container is running AND healthy (not in a restart loop)
require_local_container() {
  local container="${1:-$LOCAL_CONTAINER}"

  if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
    error "Container '$container' is not running. Start it first."
  fi

  local status
  status=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' "$container" 2>/dev/null || echo "unknown")

  if [[ "$status" == "unhealthy" ]]; then
    error "Container '$container' is unhealthy. Check: docker logs $container"
  fi

  # Wait briefly if health check is still starting
  if [[ "$status" == "starting" ]]; then
    warn "Container '$container' health check is starting, waiting..."
    local waited=0
    while [[ $waited -lt 30 ]]; do
      sleep 2
      waited=$((waited + 2))
      status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "unknown")
      if [[ "$status" == "healthy" ]]; then
        break
      fi
      if [[ "$status" == "unhealthy" ]]; then
        error "Container '$container' became unhealthy. Check: docker logs $container"
      fi
    done
    if [[ "$status" != "healthy" && "$status" != "no-healthcheck" ]]; then
      error "Container '$container' did not become healthy within 30s (status: $status)"
    fi
  fi
}

# Check that the GCE DB container is running and healthy via SSH
require_gce_container() {
  local status
  status=$(ssh "${SSH_OPTS[@]}" "$GCE_USER@$GCE_HOST" \
    "docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' '$GCE_CONTAINER' 2>/dev/null || echo 'not-found'" 2>/dev/null)

  case "$status" in
    healthy|no-healthcheck) ;;
    unhealthy)
      error "GCE container '$GCE_CONTAINER' is unhealthy. SSH in and check: docker logs $GCE_CONTAINER"
      ;;
    not-found)
      error "GCE container '$GCE_CONTAINER' not found. Is the DB running on GCE?"
      ;;
    starting)
      warn "GCE container '$GCE_CONTAINER' health check is starting, waiting..."
      local waited=0
      while [[ $waited -lt 30 ]]; do
        sleep 2
        waited=$((waited + 2))
        status=$(ssh "${SSH_OPTS[@]}" "$GCE_USER@$GCE_HOST" \
          "docker inspect --format='{{.State.Health.Status}}' '$GCE_CONTAINER' 2>/dev/null || echo 'unknown'" 2>/dev/null)
        if [[ "$status" == "healthy" ]]; then break; fi
        if [[ "$status" == "unhealthy" ]]; then
          error "GCE container '$GCE_CONTAINER' became unhealthy. SSH in and check: docker logs $GCE_CONTAINER"
        fi
      done
      if [[ "$status" != "healthy" ]]; then
        error "GCE container '$GCE_CONTAINER' did not become healthy within 30s (status: $status)"
      fi
      ;;
    *)
      error "GCE container '$GCE_CONTAINER' has unexpected status: $status"
      ;;
  esac
}

# ── Read local DB credentials ─────────────────────────────────
load_local_creds() {
  # Try common local env file locations
  for f in "apps/console/.env" ".env" "apps/console/env.local" ".env.local"; do
    if [[ -f "$f" ]]; then
      LOCAL_ENV_FILE="$f"
      break
    fi
  done

  if [[ -z "${LOCAL_ENV_FILE:-}" ]]; then
    error "Cannot find local .env file. Set LOCAL_DB_USER, LOCAL_DB_PASS, LOCAL_DB_NAME manually."
  fi

  LOCAL_DB_USER="${LOCAL_DB_USER:-$(grep -E '^DB_USER=' "$LOCAL_ENV_FILE" | cut -d= -f2 | tr -d '[:space:]' || echo 'postgres')}"
  LOCAL_DB_PASS="${LOCAL_DB_PASS:-$(grep -E '^DB_PASSWORD=' "$LOCAL_ENV_FILE" | cut -d= -f2 | tr -d '[:space:]' || echo '')}"
  LOCAL_DB_NAME="${LOCAL_DB_NAME:-$(grep -E '^DB_DB=' "$LOCAL_ENV_FILE" | cut -d= -f2 | tr -d '[:space:]' || echo 'itrade')}"

  # Override LOCAL_CONTAINER if defined in the local env file
  ENV_LOCAL_CONTAINER=$(grep -E '^LOCAL_CONTAINER=' "$LOCAL_ENV_FILE" | cut -d= -f2 | tr -d '[:space:]' || echo '')
  if [[ -n "$ENV_LOCAL_CONTAINER" ]]; then
    LOCAL_CONTAINER="$ENV_LOCAL_CONTAINER"
  fi

  info "Local  container : $LOCAL_CONTAINER"
  info "Local  database  : $LOCAL_DB_NAME  (user: $LOCAL_DB_USER)"
}

# ── Read GCE DB credentials ───────────────────────────────────
load_gce_creds() {
  # Read from /opt/itrade/.env.db on GCE (we pull it over SSH)
  GCE_DB_USER="${GCE_DB_USER:-$(ssh "${SSH_OPTS[@]}" "$GCE_USER@$GCE_HOST" "grep -E '^POSTGRES_USER=' /opt/itrade/.env.db | cut -d= -f2 | tr -d '[:space:]'" 2>/dev/null || echo 'itrade_user')}"
  GCE_DB_NAME="${GCE_DB_NAME:-$(ssh "${SSH_OPTS[@]}" "$GCE_USER@$GCE_HOST" "grep -E '^POSTGRES_DB=' /opt/itrade/.env.db | cut -d= -f2 | tr -d '[:space:]'" 2>/dev/null || echo 'itrade_db')}"
  GCE_DB_PASS="${GCE_DB_PASS:-$(ssh "${SSH_OPTS[@]}" "$GCE_USER@$GCE_HOST" "grep -E '^POSTGRES_PASSWORD=' /opt/itrade/.env.db | cut -d= -f2 | tr -d '[:space:]'" 2>/dev/null || echo '')}"

  info "Remote container : $GCE_CONTAINER  ($GCE_USER@$GCE_HOST)"
  info "Remote database  : $GCE_DB_NAME  (user: $GCE_DB_USER)"
}

# ── Step: version ────────────────────────────────────────────
cmd_version() {
  echo ""
  info "PostgreSQL version check"
  echo ""

  # Local
  local local_ver="?"
  if docker ps --format '{{.Names}}' | grep -q "^${LOCAL_CONTAINER}$"; then
    load_local_creds
    local_ver=$(get_local_pg_version "$LOCAL_CONTAINER")
    local local_status
    local_status=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}running{{end}}' "$LOCAL_CONTAINER" 2>/dev/null || echo "unknown")
    local local_image
    local_image=$(docker inspect --format='{{.Config.Image}}' "$LOCAL_CONTAINER" 2>/dev/null || echo "unknown")
    info "Local:  PostgreSQL $local_ver  (image: $local_image, status: $local_status)"
  else
    warn "Local:  Container '$LOCAL_CONTAINER' is not running"
  fi

  # GCE
  if [[ -n "$GCE_HOST" && -n "$GCE_USER" ]]; then
    load_gce_creds
    require_gce_container
    local gce_ver
    gce_ver=$(get_gce_pg_version)
    local gce_image
    gce_image=$(ssh "${SSH_OPTS[@]}" "$GCE_USER@$GCE_HOST" \
      "docker inspect --format='{{.Config.Image}}' '$GCE_CONTAINER'" 2>/dev/null || echo "unknown")
    local gce_status
    gce_status=$(ssh "${SSH_OPTS[@]}" "$GCE_USER@$GCE_HOST" \
      "docker inspect --format='{{.State.Health.Status}}' '$GCE_CONTAINER'" 2>/dev/null || echo "unknown")
    info "GCE:    PostgreSQL $gce_ver  (image: $gce_image, status: $gce_status)"

    if [[ "$local_ver" != "?" && "$gce_ver" != "?" && "$local_ver" != "$gce_ver" ]]; then
      warn "Version mismatch! Local PG $local_ver vs GCE PG $gce_ver"
      warn "pg_dump/pg_restore works across versions, but keeping them in sync is recommended."
    fi
  else
    warn "GCE:    GCE_HOST / GCE_USER not set, skipping remote check"
  fi

  echo ""
}

# ── Step: export ──────────────────────────────────────────────
cmd_export() {
  load_local_creds
  require_local_container "$LOCAL_CONTAINER"

  local pg_ver
  pg_ver=$(get_local_pg_version "$LOCAL_CONTAINER")
  info "Exporting local database '$LOCAL_DB_NAME' (PG $pg_ver) from container '$LOCAL_CONTAINER'..."

  # pg_dump in custom format (-F c) → compressed binary, best for pg_restore
  docker exec \
    -e PGPASSWORD="$LOCAL_DB_PASS" \
    "$LOCAL_CONTAINER" \
    pg_dump \
      -U "$LOCAL_DB_USER" \
      -d "$LOCAL_DB_NAME" \
      -F c \
      --no-owner \
      --no-acl \
      -f /tmp/itrade_export.dump

  # Copy dump out of container to local filesystem
  docker cp "$LOCAL_CONTAINER:/tmp/itrade_export.dump" "$DUMP_FILE"
  docker exec "$LOCAL_CONTAINER" rm -f /tmp/itrade_export.dump

  DUMP_SIZE=$(du -sh "$DUMP_FILE" | cut -f1)
  info "✅ Export complete: $DUMP_FILE ($DUMP_SIZE)"
  echo ""
  echo "  Run next: bash deploy/db-sync.sh upload"
  echo "  Or:       bash deploy/db-sync.sh sync   (export + upload + import)"
}

# ── Step: upload ──────────────────────────────────────────────
cmd_upload() {
  [[ -z "$GCE_HOST" ]] && error "GCE_HOST is not set. Export via 'export GCE_HOST=<ip>' or create .env.gce"
  [[ -z "$GCE_USER" ]] && error "GCE_USER is not set."

  # Find most recent dump if DUMP_FILE not explicitly set
  if [[ ! -f "$DUMP_FILE" ]]; then
    DUMP_FILE=$(ls -t /tmp/itrade_db_*.dump 2>/dev/null | head -1 || true)
    [[ -z "$DUMP_FILE" ]] && error "No dump file found. Run 'export' step first."
  fi

  info "Uploading $DUMP_FILE → $GCE_USER@$GCE_HOST:$GCE_DUMP_PATH ..."
  scp "${SSH_OPTS[@]}" "$DUMP_FILE" "$GCE_USER@$GCE_HOST:$GCE_DUMP_PATH"
  info "✅ Upload complete."
  echo ""
  echo "  Run next: bash deploy/db-sync.sh import"
}

# ── Step: import ──────────────────────────────────────────────
cmd_import() {
  [[ -z "$GCE_HOST" ]] && error "GCE_HOST is not set."
  [[ -z "$GCE_USER" ]] && error "GCE_USER is not set."

  load_gce_creds
  require_gce_container

  local gce_ver
  gce_ver=$(get_gce_pg_version)
  info "GCE PostgreSQL version: $gce_ver"

  warn "⚠️  This will REPLACE all data in the GCE database '$GCE_DB_NAME'."
  warn "   Existing GCE data will be overwritten. Are you sure? (yes/no)"
  read -r CONFIRM
  [[ "$CONFIRM" != "yes" ]] && { info "Aborted."; exit 0; }

  info "Importing dump into GCE container '$GCE_CONTAINER' ..."

  ssh "${SSH_OPTS[@]}" "$GCE_USER@$GCE_HOST" bash << REMOTE
    set -euo pipefail

    # Check dump file exists
    [[ -f "$GCE_DUMP_PATH" ]] || { echo "Dump file not found: $GCE_DUMP_PATH"; exit 1; }

    # Copy dump into container
    docker cp "$GCE_DUMP_PATH" "$GCE_CONTAINER:/tmp/itrade_import.dump"

    # Drop all existing connections to the database (so we can restore)
    echo "Terminating existing connections..."
    docker exec \
      -e PGPASSWORD="$GCE_DB_PASS" \
      "$GCE_CONTAINER" \
      psql -U "$GCE_DB_USER" -d postgres \
      -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$GCE_DB_NAME' AND pid <> pg_backend_pid();" \
      > /dev/null 2>&1 || true

    # pg_restore: --clean drops objects before recreating them
    #             --if-exists avoids errors if object doesn't exist yet
    #             --no-owner  skips ownership assignments (handles user differences)
    echo "Restoring database..."
    docker exec \
      -e PGPASSWORD="$GCE_DB_PASS" \
      "$GCE_CONTAINER" \
      pg_restore \
        -U "$GCE_DB_USER" \
        -d "$GCE_DB_NAME" \
        --clean \
        --if-exists \
        --no-owner \
        --no-acl \
        -v \
        /tmp/itrade_import.dump 2>&1 | tail -20

    echo "Cleaning up dump file on GCE..."
    rm -f "$GCE_DUMP_PATH"
    docker exec "$GCE_CONTAINER" rm -f /tmp/itrade_import.dump

    echo "✅ Import complete."
REMOTE

  info "✅ GCE database restored from local dump."
  echo ""
  echo "  Verify with:"
  echo "    ssh $GCE_USER@$GCE_HOST \"docker exec $GCE_CONTAINER psql -U $GCE_DB_USER -d $GCE_DB_NAME -c '\\\\dt'\""
}

# ── Step: sync (all-in-one local → GCE) ──────────────────────
cmd_sync() {
  info "Starting full sync: local → GCE"
  echo ""
  cmd_export
  echo ""
  cmd_upload
  echo ""
  cmd_import
}

# ── Step: download (GCE → local dump file) ────────────────────
cmd_download() {
  [[ -z "$GCE_HOST" ]] && error "GCE_HOST is not set. Export via 'export GCE_HOST=<ip>' or create .env.gce"
  [[ -z "$GCE_USER" ]] && error "GCE_USER is not set."

  load_gce_creds
  require_gce_container

  local gce_ver
  gce_ver=$(get_gce_pg_version)

  # Timestamp-based output filename (local)
  DOWNLOAD_FILE="${DOWNLOAD_FILE:-/tmp/itrade_db_gce_$(date +%Y%m%d_%H%M%S).dump}"

  info "Dumping GCE database '$GCE_DB_NAME' (PG $gce_ver) from container '$GCE_CONTAINER'..."

  # Run pg_dump inside GCE container, save to a temp path on GCE
  ssh "${SSH_OPTS[@]}" "$GCE_USER@$GCE_HOST" \
    "docker exec -e PGPASSWORD='$GCE_DB_PASS' '$GCE_CONTAINER' \
       pg_dump -U '$GCE_DB_USER' -d '$GCE_DB_NAME' \
               -F c --no-owner --no-acl \
               -f /tmp/itrade_gce_export.dump"

  # Download dump from GCE to local machine
  info "Downloading dump → $DOWNLOAD_FILE ..."
  scp "${SSH_OPTS[@]}" "$GCE_USER@$GCE_HOST:/tmp/itrade_gce_export.dump" "$DOWNLOAD_FILE"

  # Clean up temp file on GCE
  ssh "${SSH_OPTS[@]}" "$GCE_USER@$GCE_HOST" "rm -f /tmp/itrade_gce_export.dump"

  DUMP_SIZE=$(du -sh "$DOWNLOAD_FILE" | cut -f1)
  info "✅ Download complete: $DOWNLOAD_FILE ($DUMP_SIZE)"
  echo ""
  echo "  Run next: bash deploy/db-sync.sh restore-local"
  echo "  Or:       bash deploy/db-sync.sh pull   (download + restore-local)"
}

# ── Step: restore-local (restore GCE dump → local container) ──
cmd_restore_local() {
  load_local_creds
  require_local_container "$LOCAL_CONTAINER"

  local pg_ver
  pg_ver=$(get_local_pg_version "$LOCAL_CONTAINER")
  info "Local PostgreSQL version: $pg_ver"

  # Auto-find most recent GCE dump if DOWNLOAD_FILE not set
  if [[ -z "${DOWNLOAD_FILE:-}" ]] || [[ ! -f "${DOWNLOAD_FILE:-}" ]]; then
    DOWNLOAD_FILE=$(ls -t /tmp/itrade_db_gce_*.dump 2>/dev/null | head -1 || true)
    [[ -z "$DOWNLOAD_FILE" ]] && error "No GCE dump file found in /tmp/. Run 'download' step first."
  fi

  warn "⚠️  This will REPLACE all data in the LOCAL database '$LOCAL_DB_NAME'."
  warn "   Source dump: $DOWNLOAD_FILE"
  warn "   Are you sure? (yes/no)"
  read -r CONFIRM
  [[ "$CONFIRM" != "yes" ]] && { info "Aborted."; exit 0; }

  info "Copying dump into local container '$LOCAL_CONTAINER'..."
  docker cp "$DOWNLOAD_FILE" "$LOCAL_CONTAINER:/tmp/itrade_restore.dump"

  # Terminate existing connections so pg_restore can safely drop/recreate objects
  info "Terminating existing connections to '$LOCAL_DB_NAME'..."
  docker exec \
    -e PGPASSWORD="$LOCAL_DB_PASS" \
    "$LOCAL_CONTAINER" \
    psql -U "$LOCAL_DB_USER" -d postgres \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$LOCAL_DB_NAME' AND pid <> pg_backend_pid();" \
    > /dev/null 2>&1 || true

  info "Restoring database '$LOCAL_DB_NAME' in local container..."
  docker exec \
    -e PGPASSWORD="$LOCAL_DB_PASS" \
    "$LOCAL_CONTAINER" \
    pg_restore \
      -U "$LOCAL_DB_USER" \
      -d "$LOCAL_DB_NAME" \
      --clean \
      --if-exists \
      --no-owner \
      --no-acl \
      -v \
      /tmp/itrade_restore.dump 2>&1 | tail -20

  # Clean up temp file inside local container
  docker exec "$LOCAL_CONTAINER" rm -f /tmp/itrade_restore.dump

  info "✅ Local database restored from GCE dump."
  echo ""
  echo "  Verify with:"
  echo "    docker exec $LOCAL_CONTAINER psql -U $LOCAL_DB_USER -d $LOCAL_DB_NAME -c '\\dt'"
}

# ── Step: pull (all-in-one GCE → local) ──────────────────────
cmd_pull() {
  info "Starting full pull: GCE → local"
  echo ""
  cmd_download
  echo ""
  cmd_restore_local
}

# ── Help ──────────────────────────────────────────────────────
cmd_help() {
  cat << EOF

Usage: bash deploy/db-sync.sh <command>

────── local → GCE (push) ──────────────────────────────────────
  sync          Export local DB, upload to GCE, and import (all-in-one)
  export        Dump local PostgreSQL container → /tmp/itrade_db_<ts>.dump
  upload        SCP the dump file to GCE (/tmp/itrade_db_import.dump)
  import        Restore the dump on GCE (prompts for confirmation)

────── GCE → local (pull / backup) ────────────────────────────
  pull          Download GCE DB and restore to local container (all-in-one)
  download      SSH to GCE, pg_dump there, scp → /tmp/itrade_db_gce_<ts>.dump
  restore-local Restore the downloaded dump into local container

────── Diagnostics ────────────────────────────────────────────
  version       Show PostgreSQL versions and health status (local + GCE)
  help          Show this help

Environment variables (or set in .env.gce):
  GCE_HOST          GCE external IP or hostname
  GCE_USER          SSH username on GCE
  LOCAL_CONTAINER   Local postgres Docker container name  (default: itrade-db)
  LOCAL_DB_USER     Local DB username     (auto-read from apps/console/.env)
  LOCAL_DB_PASS     Local DB password     (auto-read from apps/console/.env)
  LOCAL_DB_NAME     Local DB name         (auto-read from apps/console/.env)
  DOWNLOAD_FILE     Override the local path for downloaded GCE dump

Quick start — push local to GCE:
  export GCE_HOST=34.x.x.x GCE_USER=your_username
  bash deploy/db-sync.sh sync

Quick start — pull GCE to local:
  export GCE_HOST=34.x.x.x GCE_USER=your_username
  bash deploy/db-sync.sh pull

EOF
}

# ── Entry point ───────────────────────────────────────────────
COMMAND="${1:-help}"
case "$COMMAND" in
  sync)           cmd_sync          ;;
  export)         cmd_export        ;;
  upload)         cmd_upload        ;;
  import)         cmd_import        ;;
  pull)           cmd_pull          ;;
  download)       cmd_download      ;;
  restore-local)  cmd_restore_local ;;
  version)        cmd_version       ;;
  help|--help|-h) cmd_help          ;;
  *) error "Unknown command: $COMMAND. Run 'bash deploy/db-sync.sh help'" ;;
esac
