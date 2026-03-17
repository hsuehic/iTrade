#!/usr/bin/env bash
# =============================================================
# sync-env.sh — Push local env files to GCE /opt/itrade/
# =============================================================
# Edit env files locally in deploy/envs/, then run:
#   bash deploy/sync-env.sh
#
# GCE connection is read from .env.gce in the project root:
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
USE_GCLOUD=false
if [[ -n "$GCE_INSTANCE" ]]; then
  if command -v gcloud &>/dev/null; then
    USE_GCLOUD=true
  else
    # gcloud not in PATH — try common install locations
    for candidate in \
      "$HOME/google-cloud-sdk/bin/gcloud" \
      "/usr/local/google-cloud-sdk/bin/gcloud" \
      "/opt/homebrew/bin/gcloud"; do
      if [[ -x "$candidate" ]]; then
        export PATH="$(dirname "$candidate"):$PATH"
        USE_GCLOUD=true
        log "Found gcloud at $candidate"
        break
      fi
    done
    if [[ "$USE_GCLOUD" == false ]]; then
      fail "GCE_INSTANCE is set but 'gcloud' was not found in PATH.
  Install gcloud: https://cloud.google.com/sdk/docs/install
  Or use scp mode: set GCE_HOST=<external-ip> and GCE_KEY=<private-key-path> instead."
    fi
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

# ── Check local envs directory ────────────────────────────────
if [[ ! -d "$LOCAL_ENV_DIR" ]]; then
  fail "Local env directory not found: $LOCAL_ENV_DIR

Create it and copy the templates:
  mkdir -p $LOCAL_ENV_DIR
  cp $SCRIPT_DIR/env.db.template      $LOCAL_ENV_DIR/.env.db
  cp $SCRIPT_DIR/env.console.template $LOCAL_ENV_DIR/.env.console
  cp $SCRIPT_DIR/env.web.template     $LOCAL_ENV_DIR/.env.web
  cp $SCRIPT_DIR/env.certbot.template $LOCAL_ENV_DIR/.env.certbot
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

ZONE_FLAG=()
[[ -n "$GCE_ZONE" ]] && ZONE_FLAG=(--zone "$GCE_ZONE")

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
  # Single file upload - much faster than multiple files
  gcloud compute scp "$TAR_FILE" \
    "${GCE_INSTANCE}:${TMP_DIR}.tar.gz" \
    --ssh-key-expire-after=1d \
    "${ZONE_FLAG[@]}"
  
  # Extract on remote
  gcloud compute ssh "$GCE_INSTANCE" "${ZONE_FLAG[@]}" \
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
MOVE_CMD="sudo mkdir -p $REMOTE_ENV_DIR && sudo mv $TMP_DIR/.env.* $REMOTE_ENV_DIR/ && sudo chown $GCE_USER:$GCE_USER $REMOTE_ENV_DIR/.env.* && sudo chmod 600 $REMOTE_ENV_DIR/.env.* && rm -rf $TMP_DIR"

if [[ "$USE_GCLOUD" == true ]]; then
  gcloud compute ssh "$GCE_INSTANCE" "${ZONE_FLAG[@]}" --command="$MOVE_CMD"
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
