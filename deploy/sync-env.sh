#!/usr/bin/env bash
# =============================================================
# sync-env.sh — Sync env files between local deploy/envs/ and GCE /opt/itrade/
# =============================================================
#
# Usage:
#   bash deploy/sync-env.sh           # push: local  →  GCE (default)
#   bash deploy/sync-env.sh --push    # push: local  →  GCE
#   bash deploy/sync-env.sh --pull    # pull: GCE    →  local (backs up local first)
#
# Typical workflows:
#   1) Pull production config to local for inspection/dev:
#        bash deploy/sync-env.sh --pull
#      (existing local .env.* files are backed up to deploy/envs/backup-<timestamp>/)
#
#   2) Edit env files locally in deploy/envs/, then push to GCE:
#        bash deploy/sync-env.sh
#      (then restart services on GCE — see the tail of the script output)
#
# GCE connection is read from .env.gce in the project root:
#   # Option A — gcloud (recommended, no key management needed):
#   GCE_INSTANCE=<instance-name>
#   GCE_ZONE=<zone>
#   GCE_USER=<ssh-username>
#
#   # Option B — plain scp:
#   GCE_HOST=<external-ip-or-hostname>
#   GCE_USER=<ssh-username>
#   GCE_KEY=<path-to-private-key>   (optional, default: ~/.ssh/id_ed25519_gce_deploy)
# =============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCAL_ENV_DIR="$SCRIPT_DIR/envs"
REMOTE_ENV_DIR="/opt/itrade"
ENV_GCE_FILE="$PROJECT_ROOT/.env.gce"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[sync-env]${NC} $*"; }
warn() { echo -e "${YELLOW}[sync-env]${NC} $*"; }
fail() { echo -e "${RED}[sync-env]${NC} $*"; exit 1; }

# ── Parse mode (push | pull) ──────────────────────────────────
MODE="push"
case "${1:-}" in
  ""|--push)      MODE="push" ;;
  --pull)         MODE="pull" ;;
  -h|--help)
    sed -n '2,30p' "${BASH_SOURCE[0]}"
    exit 0
    ;;
  *) fail "Unknown argument: $1  (expected --push or --pull, see --help)" ;;
esac

# ── Load GCE connection info ──────────────────────────────────
if [[ ! -f "$ENV_GCE_FILE" ]]; then
  fail ".env.gce not found at $ENV_GCE_FILE

Create it with:
  cat > $ENV_GCE_FILE << 'EOF'
# Option A — gcloud (recommended, no key management needed):
GCE_INSTANCE=<instance-name>          # e.g. instance-20260316-094522
GCE_ZONE=<zone>                       # e.g. us-central1-a
GCE_USER=<your-gce-username>          # e.g. xiaoweihsueh

# Option B — plain scp (only if gcloud is unavailable):
# GCE_HOST=<external-ip>
# GCE_KEY=~/.ssh/your-private-key
EOF"
fi

# shellcheck source=/dev/null
source "$ENV_GCE_FILE"

GCE_INSTANCE="${GCE_INSTANCE:-}"
GCE_ZONE="${GCE_ZONE:-}"
GCE_HOST="${GCE_HOST:-}"
GCE_USER="${GCE_USER:-}"
GCE_KEY="${GCE_KEY:-}"

[[ -z "$GCE_USER" ]] && fail "GCE_USER is not set in $ENV_GCE_FILE"

# ── Choose transfer mode ──────────────────────────────────────
# Prefer gcloud when GCE_INSTANCE is set, but verify it actually works —
# a broken gcloud (e.g. Python incompatibility) should fall back to plain scp.
USE_GCLOUD=false
_gcloud_usable() {
  command -v gcloud &>/dev/null || return 1
  # Probe the exact subcommand we will call — `gcloud --version` and even
  # `gcloud compute zones list` can succeed while `gcloud compute ssh/scp`
  # crash on broken installs (e.g. Python incompatibility).
  gcloud compute ssh --help &>/dev/null || return 1
  return 0
}

if [[ -n "$GCE_INSTANCE" ]]; then
  # Try to locate gcloud if not in PATH
  if ! command -v gcloud &>/dev/null; then
    for candidate in \
      "$HOME/google-cloud-sdk/bin/gcloud" \
      "/usr/local/google-cloud-sdk/bin/gcloud" \
      "/opt/homebrew/bin/gcloud"; do
      if [[ -x "$candidate" ]]; then
        export PATH="$(dirname "$candidate"):$PATH"
        log "Found gcloud at $candidate"
        break
      fi
    done
  fi

  if _gcloud_usable; then
    USE_GCLOUD=true
  elif [[ -n "$GCE_HOST" ]]; then
    warn "gcloud is broken/unusable — falling back to scp via GCE_HOST=$GCE_HOST"
    USE_GCLOUD=false
  else
    fail "GCE_INSTANCE is set but 'gcloud' was not found or is broken.
  Install/repair gcloud: https://cloud.google.com/sdk/docs/install
  Or use scp mode: set GCE_HOST=<external-ip> (and optionally GCE_KEY) in $ENV_GCE_FILE."
  fi
elif [[ -n "$GCE_HOST" ]]; then
  USE_GCLOUD=false
else
  fail "Nothing is configured in $ENV_GCE_FILE.
  Set GCE_INSTANCE + GCE_ZONE + GCE_USER (gcloud mode, recommended)
  or GCE_HOST + GCE_USER (scp mode)."
fi

# ── Build scp options (plain mode only) ──────────────────────
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o BatchMode=yes)
if [[ -n "$GCE_KEY" ]]; then
  [[ -f "$GCE_KEY" ]] || fail "GCE_KEY file not found: $GCE_KEY"
  SSH_OPTS+=(-i "$GCE_KEY")
fi

# gcloud common flags (zone + optional IAP tunnel)
ZONE_FLAG=()
[[ -n "$GCE_ZONE" ]] && ZONE_FLAG=(--zone "$GCE_ZONE")

detect_iap_flag() {
  IAP_FLAG=()
  if ! timeout 5 bash -c "echo >/dev/tcp/${GCE_HOST:-127.0.0.1}/22" 2>/dev/null; then
    log "Direct SSH unreachable — using IAP tunnel"
    IAP_FLAG=(--tunnel-through-iap)
  fi
}

# =====================================================================
# PULL MODE: GCE → local
# =====================================================================
if [[ "$MODE" == "pull" ]]; then
  mkdir -p "$LOCAL_ENV_DIR"

  # Backup existing local .env.* before overwriting
  BACKUP_DIR="$LOCAL_ENV_DIR/backup-$(date +%Y%m%d-%H%M%S)"
  shopt -s nullglob
  LOCAL_ENV_FILES=("$LOCAL_ENV_DIR"/.env.*)
  shopt -u nullglob
  if [[ ${#LOCAL_ENV_FILES[@]} -gt 0 ]]; then
    mkdir -p "$BACKUP_DIR"
    for f in "${LOCAL_ENV_FILES[@]}"; do
      cp "$f" "$BACKUP_DIR/"
    done
    log "Backed up ${#LOCAL_ENV_FILES[@]} existing local file(s) → $BACKUP_DIR"
  fi

  # Discover remote .env.* files
  if [[ "$USE_GCLOUD" == true ]]; then
    detect_iap_flag
    REMOTE_LIST=$(gcloud compute ssh "$GCE_INSTANCE" "${ZONE_FLAG[@]}" "${IAP_FLAG[@]}" \
      --command="cd $REMOTE_ENV_DIR && ls -1 .env.* 2>/dev/null || true")
  else
    REMOTE_LIST=$(ssh "${SSH_OPTS[@]}" "$GCE_USER@$GCE_HOST" \
      "cd $REMOTE_ENV_DIR && ls -1 .env.* 2>/dev/null || true")
  fi

  [[ -z "${REMOTE_LIST// /}" ]] && fail "No .env.* files found on remote $REMOTE_ENV_DIR"

  log "Pulling env files from GCE → $LOCAL_ENV_DIR/"
  echo ""

  while IFS= read -r filename; do
    [[ -z "$filename" ]] && continue
    if [[ "$USE_GCLOUD" == true ]]; then
      gcloud compute scp \
        "${GCE_INSTANCE}:${REMOTE_ENV_DIR}/${filename}" \
        "$LOCAL_ENV_DIR/${filename}" \
        --ssh-key-expire-after=1d \
        "${ZONE_FLAG[@]}" "${IAP_FLAG[@]}"
    else
      scp "${SSH_OPTS[@]}" \
        "$GCE_USER@$GCE_HOST:${REMOTE_ENV_DIR}/${filename}" \
        "$LOCAL_ENV_DIR/${filename}"
    fi
    chmod 600 "$LOCAL_ENV_DIR/${filename}" 2>/dev/null || true
    log "  ⬇️   $filename"
  done <<< "$REMOTE_LIST"

  echo ""
  log "Pull complete. Local envs are in $LOCAL_ENV_DIR/"
  [[ -d "$BACKUP_DIR" ]] && echo "  Previous local files backed up to: $BACKUP_DIR"
  echo ""
  exit 0
fi

# =====================================================================
# PUSH MODE: local → GCE
# =====================================================================

# ── Check local envs directory ────────────────────────────────
if [[ ! -d "$LOCAL_ENV_DIR" ]]; then
  fail "Local env directory not found: $LOCAL_ENV_DIR

Create it and copy the templates:
  mkdir -p $LOCAL_ENV_DIR
  cp $SCRIPT_DIR/env.db.template      $LOCAL_ENV_DIR/.env.db
  cp $SCRIPT_DIR/env.console.template $LOCAL_ENV_DIR/.env.console
  cp $SCRIPT_DIR/env.web.template     $LOCAL_ENV_DIR/.env.web
Then fill in the real values and re-run this script."
fi

# ── Find env files to sync ────────────────────────────────────
ENV_FILES=()
for f in "$LOCAL_ENV_DIR"/.env.*; do
  [[ -f "$f" ]] && ENV_FILES+=("$f")
done

if [[ ${#ENV_FILES[@]} -eq 0 ]]; then
  fail "No .env.* files found in $LOCAL_ENV_DIR"
fi

# ── Sync each file ────────────────────────────────────────────
TMP_DIR="/tmp/itrade-envs-$$"   # unique tmp dir on GCE

if [[ "$USE_GCLOUD" == true ]]; then
  log "Syncing ${#ENV_FILES[@]} env file(s) via gcloud → $GCE_INSTANCE:$REMOTE_ENV_DIR/"
else
  log "Syncing ${#ENV_FILES[@]} env file(s) via scp → $GCE_USER@$GCE_HOST:$REMOTE_ENV_DIR/"
fi
echo ""

# ── Step 1: Create tar archive and upload in single operation ──
TAR_FILE="/tmp/itrade-envs-$$.tar.gz"
log "Creating archive..."

# Create list of files to include (only existing files)
ENV_BASENAMES=()
for f in "${ENV_FILES[@]}"; do
  ENV_BASENAMES+=("$(basename "$f")")
done

# Create tar without macOS extended attributes to avoid warnings
tar --no-xattrs -czf "$TAR_FILE" -C "$LOCAL_ENV_DIR" "${ENV_BASENAMES[@]}" 2>/dev/null || \
tar -czf "$TAR_FILE" -C "$LOCAL_ENV_DIR" "${ENV_BASENAMES[@]}"

if [[ "$USE_GCLOUD" == true ]]; then
  detect_iap_flag

  # Single file upload - much faster than multiple files
  gcloud compute scp "$TAR_FILE" \
    "${GCE_INSTANCE}:${TMP_DIR}.tar.gz" \
    --ssh-key-expire-after=1d \
    "${ZONE_FLAG[@]}" "${IAP_FLAG[@]}"

  # Extract on remote
  gcloud compute ssh "$GCE_INSTANCE" "${ZONE_FLAG[@]}" "${IAP_FLAG[@]}" \
    --command="mkdir -p $TMP_DIR && tar -xzf ${TMP_DIR}.tar.gz -C $TMP_DIR && rm ${TMP_DIR}.tar.gz"
else
  ssh "${SSH_OPTS[@]}" "$GCE_USER@$GCE_HOST" "mkdir -p $TMP_DIR"
  scp "${SSH_OPTS[@]}" "$TAR_FILE" "$GCE_USER@$GCE_HOST:${TMP_DIR}.tar.gz"
  ssh "${SSH_OPTS[@]}" "$GCE_USER@$GCE_HOST" "tar -xzf ${TMP_DIR}.tar.gz -C $TMP_DIR && rm ${TMP_DIR}.tar.gz"
fi

# Clean up local tar file
rm -f "$TAR_FILE"

for local_file in "${ENV_FILES[@]}"; do
  filename="$(basename "$local_file")"
  log "  ⬆️   $filename → $TMP_DIR/"
done

# ── Step 3: Move files to final destination with correct ownership ──
MOVE_CMD=" (sudo -n mkdir -p $REMOTE_ENV_DIR 2>/dev/null || mkdir -p $REMOTE_ENV_DIR) && (sudo -n mv $TMP_DIR/.env.* $REMOTE_ENV_DIR/ 2>/dev/null || mv $TMP_DIR/.env.* $REMOTE_ENV_DIR/) && (sudo -n chown $GCE_USER:$GCE_USER $REMOTE_ENV_DIR/.env.* 2>/dev/null || true) && (sudo -n chmod 600 $REMOTE_ENV_DIR/.env.* 2>/dev/null || chmod 600 $REMOTE_ENV_DIR/.env.*) && rm -rf $TMP_DIR"

if [[ "$USE_GCLOUD" == true ]]; then
  gcloud compute ssh "$GCE_INSTANCE" "${ZONE_FLAG[@]}" "${IAP_FLAG[@]}" --command="$MOVE_CMD"
else
  ssh "${SSH_OPTS[@]}" "$GCE_USER@$GCE_HOST" "$MOVE_CMD"
fi

echo ""
log "All env files synced successfully."
echo ""
if [[ "$USE_GCLOUD" == true ]]; then
  echo "  Remote location : $GCE_INSTANCE:$REMOTE_ENV_DIR/"
else
  echo "  Remote location : $GCE_USER@$GCE_HOST:$REMOTE_ENV_DIR/"
fi
echo ""
echo "  To apply changes, restart affected services on GCE:"
echo "    ssh $GCE_USER@$GCE_HOST"
echo "    cd /opt/itrade/app"
echo "    docker compose -f docker-compose.prod.yml up -d --force-recreate console web"
echo ""
