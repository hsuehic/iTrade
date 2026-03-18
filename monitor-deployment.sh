#!/usr/bin/env bash
# =============================================================
# Monitor GitHub Actions Deployment
# =============================================================

set -euo pipefail

REPO="hsuehic/iTrade"
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[monitor]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC} $*"; }
fail() { echo -e "${RED}[error]${NC} $*"; }

log "Monitoring GitHub Actions deployment for $REPO..."

while true; do
  # Get latest workflow run
  RESPONSE=$(curl -s "https://api.github.com/repos/$REPO/actions/runs?per_page=1")
  
  if command -v jq >/dev/null 2>&1; then
    STATUS=$(echo "$RESPONSE" | jq -r '.workflow_runs[0].status')
    CONCLUSION=$(echo "$RESPONSE" | jq -r '.workflow_runs[0].conclusion')
    URL=$(echo "$RESPONSE" | jq -r '.workflow_runs[0].html_url')
    COMMIT=$(echo "$RESPONSE" | jq -r '.workflow_runs[0].head_sha' | cut -c1-8)
  else
    # Fallback without jq
    STATUS=$(echo "$RESPONSE" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
    CONCLUSION=$(echo "$RESPONSE" | grep -o '"conclusion":"[^"]*"' | head -1 | cut -d'"' -f4)
    URL=$(echo "$RESPONSE" | grep -o '"html_url":"[^"]*"' | head -1 | cut -d'"' -f4)
    COMMIT=$(echo "$RESPONSE" | grep -o '"head_sha":"[^"]*"' | head -1 | cut -d'"' -f4 | cut -c1-8)
  fi
  
  TIMESTAMP=$(date '+%H:%M:%S')
  
  case "$STATUS" in
    "in_progress")
      warn "[$TIMESTAMP] Deployment in progress... (commit: $COMMIT)"
      ;;
    "completed")
      if [ "$CONCLUSION" = "success" ]; then
        log "[$TIMESTAMP] ✅ Deployment successful! (commit: $COMMIT)"
        log "URL: $URL"
        exit 0
      else
        fail "[$TIMESTAMP] ❌ Deployment failed! (commit: $COMMIT)"
        fail "URL: $URL"
        exit 1
      fi
      ;;
    "queued")
      warn "[$TIMESTAMP] Deployment queued... (commit: $COMMIT)"
      ;;
    *)
      warn "[$TIMESTAMP] Unknown status: $STATUS (commit: $COMMIT)"
      ;;
  esac
  
  sleep 10
done