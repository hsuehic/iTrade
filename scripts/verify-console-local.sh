#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/apps/services/docker-compose.yml"
VERIFY_DURATION="${VERIFY_DURATION:-15}"

log() {
  printf '[verify-console] %s\n' "$1"
}

ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    log "Docker is not installed or not on PATH."
    exit 1
  fi
}

start_db_if_needed() {
  if nc -z localhost 5432 >/dev/null 2>&1; then
    log "Postgres already running on port 5432."
    echo "false"
    return
  fi

log "Starting local Postgres via docker compose..."
  docker compose -f "$COMPOSE_FILE" up -d db >/dev/null
  echo "true"
}

wait_for_db() {
  local attempts=0
  while ! nc -z localhost 5432 >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [ "$attempts" -gt 15 ]; then
      log "Postgres did not become ready on port 5432."
      return 1
    fi
    sleep 1
  done
  log "Postgres is ready."
}

get_db_container() {
  docker compose -f "$COMPOSE_FILE" ps -q db
}

ensure_database() {
  local container_id
  container_id="$(get_db_container)"
  if [ -z "$container_id" ]; then
    log "Postgres container not found."
    return 1
  fi

  local exists
  exists="$(docker exec "$container_id" psql -U postgres -d postgres -tAc \
    "SELECT 1 FROM pg_database WHERE datname='itrade';" || true)"
  if [ "$exists" != "1" ]; then
    log "Creating database: itrade"
    docker exec "$container_id" psql -U postgres -d postgres -c "CREATE DATABASE itrade;"
  fi
}

run_console() {
  local log_file
  log_file="$(mktemp)"

  log "Starting console for ${VERIFY_DURATION}s..."
  (
    cd "$ROOT_DIR/apps/console"
    NODE_ENV=development \
      TS_NODE_PROJECT=tsconfig.build.json \
      TS_NODE_FILES=true \
      NODE_OPTIONS="--conditions=source" \
      node -r ts-node/register \
      -r tsconfig-paths/register \
      -r reflect-metadata \
      src/main.ts \
      >"$log_file" 2>&1
  ) &

  local pid=$!
  sleep "$VERIFY_DURATION"
  if kill -0 "$pid" >/dev/null 2>&1; then
    log "Stopping console process."
    kill "$pid" >/dev/null 2>&1 || true
  fi

  log "Console output (last 50 lines):"
  tail -n 50 "$log_file" || true
  rm -f "$log_file"
}

main() {
  ensure_docker
  local started_db
  started_db="$(start_db_if_needed)"
  wait_for_db
  ensure_database
  run_console

  if [ "$started_db" = "true" ]; then
    log "Stopping local Postgres."
    docker compose -f "$COMPOSE_FILE" down >/dev/null
  fi
}

main
