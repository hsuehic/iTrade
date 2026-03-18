#!/usr/bin/env bash
# =============================================================
# iTrade — Download Only Deployment Files (No Full Source Code)
# =============================================================
# This script downloads only the files needed for Docker deployment,
# avoiding the need to clone the entire repository.
#
# Usage:
#   ./download-deployment-files.sh [COMMIT_SHA]
#
# Files downloaded:
#   - docker-compose.prod.yml
#   - deploy/ directory (scripts and templates)
# =============================================================

set -euo pipefail

REPO="hsuehic/iTrade"
COMMIT_SHA="${1:-main}"
BASE_URL="https://raw.githubusercontent.com/${REPO}/${COMMIT_SHA}"
APP_DIR="/opt/itrade/app"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[download]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC}     $*"; }
fail() { echo -e "${RED}[error]${NC}    $*"; exit 1; }

# Create directory structure
log "Creating directory structure..."
mkdir -p "$APP_DIR/deploy"

# Download docker-compose.prod.yml
log "Downloading docker-compose.prod.yml..."
curl -fsSL "$BASE_URL/docker-compose.prod.yml" -o "$APP_DIR/docker-compose.prod.yml"

# Download deployment scripts and templates
log "Downloading deployment files..."

DEPLOY_FILES=(
  "deploy/certbot-init.sh"
  "deploy/fix-git-permissions.sh"
  "deploy/nginx.conf.template"
  "deploy/env.console.template"
  "deploy/env.web.template"
  "deploy/env.db.template"
  "deploy/env.certbot.template"
  "deploy/setup-gce.sh"
  "deploy/sync-env.sh"
  "deploy/test-local.sh"
  "deploy/db-sync.sh"
)

for file in "${DEPLOY_FILES[@]}"; do
  log "Downloading $file..."
  curl -fsSL "$BASE_URL/$file" -o "$APP_DIR/$file"
  
  # Make shell scripts executable
  if [[ "$file" == *.sh ]]; then
    chmod +x "$APP_DIR/$file"
  fi
done

log "✅ Deployment files downloaded successfully"
log "Files downloaded to: $APP_DIR"

# Verify critical files exist
log "Verifying downloaded files..."
if [ -f "$APP_DIR/docker-compose.prod.yml" ]; then
  log "✅ docker-compose.prod.yml"
else
  fail "❌ docker-compose.prod.yml missing"
fi

if [ -f "$APP_DIR/deploy/certbot-init.sh" ]; then
  log "✅ deploy/certbot-init.sh"
else
  fail "❌ deploy/certbot-init.sh missing"
fi

log "🎉 Ready for Docker deployment!"
log "Next steps:"
log "  1. cd $APP_DIR"
log "  2. docker compose -f docker-compose.prod.yml pull"
log "  3. docker compose -f docker-compose.prod.yml up -d"