#!/usr/bin/env bash
# =============================================================
# Diagnose Deployment Issues
# =============================================================
# This script helps diagnose what's failing in the GitHub Actions deployment
# =============================================================

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[diagnose]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
fail() { echo -e "${RED}[error]${NC} $*"; }

log "🔍 Diagnosing deployment issues..."

# Test 1: Check if docker-compose.prod.yml is downloadable
log "Test 1: Testing docker-compose.prod.yml download..."
REPO="hsuehic/iTrade"
COMMIT="main"
BASE_URL="https://raw.githubusercontent.com/${REPO}/${COMMIT}"

if curl -fsSL --connect-timeout 10 --max-time 30 \
  "$BASE_URL/docker-compose.prod.yml" -o /tmp/test-docker-compose.yml; then
  
  FILE_SIZE=$(wc -c < /tmp/test-docker-compose.yml)
  log "✅ Download successful (${FILE_SIZE} bytes)"
  
  # Validate content
  if grep -q "services:" /tmp/test-docker-compose.yml; then
    log "✅ File content is valid"
  else
    warn "❌ File content appears invalid"
    head -5 /tmp/test-docker-compose.yml
  fi
  
  rm -f /tmp/test-docker-compose.yml
else
  fail "❌ Download failed"
fi

# Test 2: Check GitHub Container Registry access
log "Test 2: Testing GHCR image availability..."
IMAGES=(
  "ghcr.io/hsuehic/itrade/console:latest"
  "ghcr.io/hsuehic/itrade/web:latest"
  "ghcr.io/hsuehic/itrade/schema-migrator:latest"
)

for image in "${IMAGES[@]}"; do
  log "Checking $image..."
  if curl -fsSL -I "https://ghcr.io/v2/${image#ghcr.io/}/manifests/latest" >/dev/null 2>&1; then
    log "✅ $image is accessible"
  else
    warn "⚠️  $image may not be accessible (or requires auth)"
  fi
done

# Test 3: Check recent GitHub Actions runs
log "Test 3: Checking recent GitHub Actions runs..."
RESPONSE=$(curl -s "https://api.github.com/repos/$REPO/actions/runs?per_page=3")

if command -v jq >/dev/null 2>&1; then
  echo "$RESPONSE" | jq -r '.workflow_runs[] | "Run: \(.status) - \(.conclusion // "null") - \(.created_at) - \(.html_url)"'
else
  log "jq not available, showing raw response snippet..."
  echo "$RESPONSE" | grep -o '"status":"[^"]*"' | head -3
fi

# Test 4: Suggest next steps
log "🔧 Suggested troubleshooting steps:"
echo ""
echo "1. Check GitHub Actions logs at:"
echo "   https://github.com/$REPO/actions"
echo ""
echo "2. Common issues to check:"
echo "   - GCE_HOST secret: Correct IP/domain?"
echo "   - GCE_USER secret: Correct username?"
echo "   - GCE_SSH_PRIVATE_KEY secret: Valid base64-encoded private key?"
echo "   - SSH access: Can you manually SSH to the server?"
echo "   - Environment files: Do they exist at /opt/itrade/.env.*?"
echo ""
echo "3. Manual test on GCE instance:"
echo "   ssh user@your-gce-host"
echo "   curl -fsSL '$BASE_URL/docker-compose.prod.yml' -o /tmp/test.yml"
echo "   docker compose -f /tmp/test.yml config"
echo ""
echo "4. Check GCE instance requirements:"
echo "   - Docker installed and running"
echo "   - Environment files present"
echo "   - Sufficient disk space"
echo "   - Network connectivity to GitHub and GHCR"

log "✅ Diagnosis complete"