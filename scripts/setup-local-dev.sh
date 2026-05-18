#!/usr/bin/env bash
# =============================================================
# setup-local-dev.sh — get local dev to a working "everything-on" state.
# =============================================================
#
# Performs, in order:
#   1. In-place swap of the local Postgres container to the
#      pgvector/pgvector:pg18 image, preserving the existing data volume
#      and the container name/port. Auto-detects an already-running
#      container (you may override with $LOCAL_DB_CONTAINER).
#   2. Pulls the latest GCE database snapshot into the local container
#      via deploy/db-sync.sh (skip with --skip-pull).
#   3. Runs `pnpm sync-schema` on @itrade/data-manager so any tables
#      missing from the dump (e.g. help_articles on a brand-new feature
#      branch) are created and the pgvector bootstrap is applied.
#   4. Seeds the help-KB starter articles and embeds them.
#
# Usage:
#   bash scripts/setup-local-dev.sh                 # full flow
#   bash scripts/setup-local-dev.sh --skip-pull     # skip the GCE pull
#   bash scripts/setup-local-dev.sh --skip-seed     # skip the help-KB seed
#   bash scripts/setup-local-dev.sh --skip-recreate # don't touch the container
#   bash scripts/setup-local-dev.sh --diagnose      # print state + logs, exit
#   bash scripts/setup-local-dev.sh --reset-volume  # nuke data dir and start fresh
#
# Env overrides:
#   LOCAL_DB_CONTAINER   Container name (auto-detected if unset; defaults to itrade-db)
#   LOCAL_DB_PORT        Host port for Postgres (auto-detected; defaults to 5432)
# =============================================================

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
info() { echo -e "${GREEN}▶${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC}  $*"; }
err()  { echo -e "${RED}✖${NC}  $*" >&2; exit 1; }
step() { echo -e "\n${CYAN}── $* ──${NC}"; }

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# ── Flags ─────────────────────────────────────────────────────
SKIP_PULL=0
SKIP_SEED=0
SKIP_RECREATE=0
RESET_VOLUME=0
DIAGNOSE_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --skip-pull)     SKIP_PULL=1 ;;
    --skip-seed)     SKIP_SEED=1 ;;
    --skip-recreate) SKIP_RECREATE=1 ;;
    --reset-volume)  RESET_VOLUME=1 ;;
    --diagnose)      DIAGNOSE_ONLY=1 ;;
    -h|--help)
      sed -n '2,32p' "$0"
      cat <<'EOF'

Extra flags:
  --reset-volume   Stop & remove the container AND drop its data volume,
                   then recreate from scratch. Useful when the data
                   directory was initialised by an incompatible image
                   (e.g. postgres:18-alpine → pgvector/pgvector:pg18).
                   Local data will be lost; rely on --skip-pull=0 to
                   re-pull from GCE on the next step.
  --diagnose       Print container state, image, last logs, volumes, and
                   exit. No changes are made.

EOF
      exit 0
      ;;
    *) err "Unknown flag: $arg (use --help)" ;;
  esac
done

command -v docker >/dev/null 2>&1 || err "docker is not on PATH"
command -v pnpm   >/dev/null 2>&1 || err "pnpm is not on PATH"

PG_IMAGE="pgvector/pgvector:pg18"

# ── Container detection helpers ───────────────────────────────

detect_container() {
  # Honour explicit override
  if [[ -n "${LOCAL_DB_CONTAINER:-}" ]]; then
    echo "$LOCAL_DB_CONTAINER"
    return
  fi
  # Try common names in order of likelihood
  for candidate in itrade-db proxy-manager-db-1 services-db-1 iTrade-db-1 postgres pgvector; do
    if docker ps -a --format '{{.Names}}' | grep -qx "$candidate"; then
      echo "$candidate"
      return
    fi
  done
  # As a last resort, look for *any* container running a postgres image
  local img_match
  img_match=$(docker ps -a --format '{{.Names}}\t{{.Image}}' \
              | awk -F'\t' 'tolower($2) ~ /postgres|pgvector/ {print $1; exit}')
  if [[ -n "$img_match" ]]; then
    echo "$img_match"
    return
  fi
  echo ""
}

# Read DB credentials from apps/console/.env (mirrors deploy/db-sync.sh)
load_creds() {
  local envfile=""
  for f in "apps/console/.env" ".env" "apps/console/env.local" ".env.local"; do
    [[ -f "$f" ]] && envfile="$f" && break
  done
  if [[ -z "$envfile" ]]; then
    warn "No local env file found; falling back to defaults (postgres/postgres/itrade)"
    DB_USER="postgres"; DB_PASS="postgres"; DB_NAME="itrade"
    return
  fi
  DB_USER="$(grep -E '^DB_USER='     "$envfile" | tail -1 | cut -d= -f2- | tr -d '[:space:]')"
  DB_PASS="$(grep -E '^DB_PASSWORD=' "$envfile" | tail -1 | cut -d= -f2- | tr -d '[:space:]')"
  DB_NAME="$(grep -E '^DB_DB='       "$envfile" | tail -1 | cut -d= -f2- | tr -d '[:space:]')"
  DB_USER="${DB_USER:-postgres}"
  DB_PASS="${DB_PASS:-postgres}"
  DB_NAME="${DB_NAME:-itrade}"
}

# Probe whether Postgres is accepting connections. We deliberately do NOT
# require the application database ($DB_NAME, e.g. `itrade`) to exist here —
# on a fresh container the only DB is `postgres`, and `pg_isready -d itrade`
# returns "rejecting connections" until we create it ourselves in ensure_db.
wait_pg_ready() {
  local container="$1"
  for _ in $(seq 1 60); do
    # Verify the container itself is running (not exited/restarting)
    local running
    running=$(docker inspect --format '{{.State.Running}}' "$container" 2>/dev/null || echo "false")
    if [[ "$running" != "true" ]]; then
      sleep 1
      continue
    fi
    # Server is accepting if EITHER probe succeeds:
    #   1. default args (uses postgres user + postgres db)
    #   2. explicit -U $DB_USER -d postgres (works regardless of DB_NAME)
    if docker exec "$container" pg_isready -q >/dev/null 2>&1 \
       || docker exec "$container" pg_isready -q -U "$DB_USER" -d postgres >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

# Verbose diagnostics when wait_pg_ready times out.
diagnose_pg() {
  local container="$1"
  warn "Diagnostics for container '$container':"
  docker inspect --format \
    '  State:    {{.State.Status}}{{if .State.Health}} (health: {{.State.Health.Status}}){{end}}' \
    "$container" || true
  docker inspect --format '  Image:    {{.Config.Image}}'            "$container" || true
  docker inspect --format '  Mounts:   {{range .Mounts}}{{.Type}}:{{.Name}}{{.Source}}->{{.Destination}}  {{end}}' \
    "$container" || true
  docker exec "$container" pg_isready -U "$DB_USER" -d postgres 2>&1 \
    | sed 's/^/  pg_isready: /' || true
  echo ""
  warn "Last 30 lines of container logs:"
  docker logs --tail 30 "$container" 2>&1 | sed 's/^/    /' || true
  echo ""
}

# Create the application database ($DB_NAME) if it doesn't already exist.
# TypeORM's sync only creates tables; it can't create the database itself.
ensure_db() {
  local container="$1"
  local exists
  exists=$(docker exec -e PGPASSWORD="$DB_PASS" "$container" \
             psql -U "$DB_USER" -d postgres -tAc \
             "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" 2>/dev/null | tr -d '[:space:]')
  if [[ "$exists" == "1" ]]; then
    info "Database '$DB_NAME' already exists."
    return
  fi
  info "Creating database '$DB_NAME' …"
  docker exec -e PGPASSWORD="$DB_PASS" "$container" \
    psql -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$DB_NAME\"" >/dev/null
  info "✅ Database '$DB_NAME' created."
}

# ── Diagnose-only mode ────────────────────────────────────────
# Read-only inspection of container state, image, mounts, and last logs.
# Exits without modifying anything. Defined after the helpers it depends on.
maybe_diagnose_and_exit() {
  [[ $DIAGNOSE_ONLY -eq 1 ]] || return 0
  step "Diagnose only — collecting state"

  echo ""; echo "── Containers (postgres-like) ──"
  docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' \
    | (head -1; grep -iE 'postgres|pgvector' || true)

  local target="${LOCAL_DB_CONTAINER:-$(detect_container)}"

  if [[ -n "$target" ]]; then
    echo ""; echo "── docker inspect $target ──"
    docker inspect --format \
      'State:    {{.State.Status}}  ExitCode: {{.State.ExitCode}}  Error: {{.State.Error}}{{"\n"}}Image:    {{.Config.Image}}{{"\n"}}Network:  {{range $k, $v := .NetworkSettings.Networks}}{{$k}} {{end}}{{"\n"}}Mounts:   {{range .Mounts}}{{.Type}}:{{.Name}}{{.Source}}->{{.Destination}} {{end}}' \
      "$target" 2>&1
    echo ""; echo "── docker logs $target --tail 80 ──"
    docker logs --tail 80 "$target" 2>&1 || true
  else
    warn "No postgres-like container found."
  fi

  echo ""; echo "── docker volume ls (filtered) ──"
  docker volume ls | (head -1; grep -iE 'pg|postgres|services' || true)

  echo ""
  info "Done — no changes were made."
  exit 0
}
maybe_diagnose_and_exit

# ── 1. In-place image swap ────────────────────────────────────
if [[ $SKIP_RECREATE -eq 0 ]]; then
  step "Step 1/4 · Swap local Postgres image to $PG_IMAGE (volume preserved)"
  load_creds

  CONTAINER="$(detect_container)"
  HOST_PORT="${LOCAL_DB_PORT:-5432}"

  # ── Optional reset path ─────────────────────────────────────
  # When --reset-volume is set, we tear the container AND its data volume(s)
  # down before any other work. Used to recover from data-dir
  # incompatibility (e.g. an Alpine→Debian Postgres image swap where the
  # old data files trip locale/ICU checks). The next steps (db-sync pull +
  # sync-schema) will repopulate the new clean volume from GCE.
  if [[ $RESET_VOLUME -eq 1 ]]; then
    if [[ -n "$CONTAINER" ]]; then
      # Snapshot the volume names before we destroy the container — once it's
      # gone we can no longer ask docker inspect.
      readarray -t VOL_NAMES < <(docker inspect --format \
        '{{range .Mounts}}{{if eq .Type "volume"}}{{println .Name}}{{end}}{{end}}' \
        "$CONTAINER" 2>/dev/null | sed '/^$/d')

      warn "--reset-volume: destroying container '$CONTAINER' and ${#VOL_NAMES[@]} volume(s)."
      for v in "${VOL_NAMES[@]}"; do warn "    volume: $v"; done

      docker stop "$CONTAINER" >/dev/null 2>&1 || true
      docker rm   "$CONTAINER" >/dev/null 2>&1 || true
      for v in "${VOL_NAMES[@]}"; do
        docker volume rm "$v" >/dev/null 2>&1 || warn "could not remove volume $v (in use?)"
      done
    else
      warn "--reset-volume requested but no container detected — nothing to reset."
    fi
    # Force a fresh start below
    CONTAINER=""
  fi

  if [[ -z "$CONTAINER" ]]; then
    info "No existing Postgres container found — creating a new one named 'itrade-db'."
    CONTAINER="itrade-db"
    docker pull "$PG_IMAGE"
    docker run -d \
      --name "$CONTAINER" \
      -e POSTGRES_USER="$DB_USER" \
      -e POSTGRES_PASSWORD="$DB_PASS" \
      -e POSTGRES_DB="$DB_NAME" \
      -p "${HOST_PORT}:5432" \
      -v itrade_pg_data:/var/lib/postgresql/data \
      --restart unless-stopped \
      "$PG_IMAGE"
  else
    info "Detected container: $CONTAINER"

    # Capture the existing container's settings so we can recreate identically.
    CURRENT_IMAGE="$(docker inspect --format '{{.Config.Image}}' "$CONTAINER")"
    info "Current image: $CURRENT_IMAGE"

    if [[ "$CURRENT_IMAGE" == "$PG_IMAGE" ]]; then
      info "Container is already on $PG_IMAGE — restarting to make sure it's up."
      docker start "$CONTAINER" >/dev/null
    else
      # Preserve port binding (host port mapped to container 5432)
      MAPPED_PORT="$(docker inspect --format \
        '{{range $p, $conf := .NetworkSettings.Ports}}{{if eq $p "5432/tcp"}}{{(index $conf 0).HostPort}}{{end}}{{end}}' \
        "$CONTAINER" 2>/dev/null || echo "")"
      [[ -n "$MAPPED_PORT" ]] && HOST_PORT="$MAPPED_PORT"

      # Preserve all volume mounts so the data directory is reused
      readarray -t MOUNT_ARGS < <(docker inspect \
        --format '{{range .Mounts}}{{if eq .Type "volume"}}-v {{.Name}}:{{.Destination}}
{{else if eq .Type "bind"}}-v {{.Source}}:{{.Destination}}
{{end}}{{end}}' "$CONTAINER" | sed '/^$/d' | tr -s ' ')

      # Preserve env vars (POSTGRES_*, plus anything else the user has set)
      readarray -t ENV_ARGS < <(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' \
        "$CONTAINER" \
        | grep -E '^(POSTGRES_|PGDATA=|LANG=|LC_)' \
        | sed 's/^/-e /')

      # Preserve network
      NETWORK="$(docker inspect --format \
        '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}' "$CONTAINER" 2>/dev/null || echo "bridge")"

      info "Pulling $PG_IMAGE …"
      docker pull "$PG_IMAGE"

      info "Stopping + removing old container (volume kept)…"
      docker stop "$CONTAINER" >/dev/null || true
      docker rm "$CONTAINER"   >/dev/null

      info "Recreating $CONTAINER on $PG_IMAGE (port ${HOST_PORT}, network ${NETWORK})…"
      # shellcheck disable=SC2068
      docker run -d \
        --name "$CONTAINER" \
        --network "$NETWORK" \
        -p "${HOST_PORT}:5432" \
        ${ENV_ARGS[@]+"${ENV_ARGS[@]}"} \
        ${MOUNT_ARGS[@]+"${MOUNT_ARGS[@]}"} \
        --restart unless-stopped \
        "$PG_IMAGE"
    fi
  fi

  info "Waiting for Postgres to accept connections (probing default/postgres db, not '$DB_NAME')…"
  if ! wait_pg_ready "$CONTAINER"; then
    diagnose_pg "$CONTAINER"
    err "Postgres did not become ready within 60s."
  fi
  info "Postgres is ready."

  # TypeORM `synchronize:true` creates tables but NOT the database itself, so
  # we have to make sure the app database (e.g. 'itrade') exists before any
  # subsequent step tries to connect to it.
  ensure_db "$CONTAINER"

  info "Verifying pgvector extension is available…"
  if docker exec "$CONTAINER" psql -U "$DB_USER" -d postgres \
       -tAc "SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name='vector');" \
       | grep -q t; then
    info "✅ pgvector is available on this image."
  else
    err "pgvector extension not available on the image — something went wrong."
  fi

  export LOCAL_CONTAINER="$CONTAINER"   # used by db-sync.sh
else
  warn "Skipping container recreate (--skip-recreate)"
  load_creds
  export LOCAL_CONTAINER="$(detect_container)"
  [[ -z "$LOCAL_CONTAINER" ]] && err "No running Postgres container detected. Re-run without --skip-recreate."
  if ! wait_pg_ready "$LOCAL_CONTAINER"; then
    diagnose_pg "$LOCAL_CONTAINER"
    err "Postgres in '$LOCAL_CONTAINER' is not accepting connections."
  fi
  ensure_db "$LOCAL_CONTAINER"
fi

# ── 2. Pull GCE → local ──────────────────────────────────────
if [[ $SKIP_PULL -eq 0 ]]; then
  step "Step 2/4 · Pull GCE database snapshot → local container ($LOCAL_CONTAINER)"
  [[ -f .env.gce ]] || err ".env.gce not found at repo root. Copy from deploy/env.gce.template."
  bash deploy/db-sync.sh pull
else
  warn "Skipping GCE pull (--skip-pull)"
fi

# ── 3. Sync schema + pgvector bootstrap ──────────────────────
step "Step 3/4 · TypeORM sync-schema (creates help_articles + pgvector bootstrap)"
pnpm --filter @itrade/data-manager run sync-schema

# ── 4. Seed help-KB ──────────────────────────────────────────
if [[ $SKIP_SEED -eq 0 ]]; then
  step "Step 4/4 · Seed help-KB starter articles + embed"
  pnpm --filter @itrade/data-manager run seed-help-kb
else
  warn "Skipping help-KB seed (--skip-seed)"
fi

echo ""
info "✅ Local dev setup complete."
echo ""
echo "Next steps:"
echo "  • Start the web dev server:  pnpm --filter @itrade/web-manager run dev"
echo "  • Open                       http://localhost:3002"
echo "  • The help bot (violet bubble bottom-right of the landing page) is now live."
