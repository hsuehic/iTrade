#!/usr/bin/env bash
# =============================================================
# iTrade — Fix Git Repository Permissions on GCE
# =============================================================
# Run this script if you encounter Git permission errors during deployment.
# This script diagnoses and fixes common Git permission issues.
#
# Usage:
#   chmod +x fix-git-permissions.sh
#   ./fix-git-permissions.sh
# =============================================================

set -euo pipefail

APP_DIR="/opt/itrade/app"
REPO_URL="https://github.com/hsuehic/iTrade.git"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[fix-git]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC}     $*"; }
fail() { echo -e "${RED}[error]${NC}    $*"; exit 1; }

# Check if we're in the right directory
if [ ! -d "$APP_DIR" ]; then
  fail "App directory $APP_DIR does not exist. Run setup-gce.sh first."
fi

cd "$APP_DIR"

# Check if this is a Git repository
if [ ! -d ".git" ]; then
  fail "Not a Git repository. Expected .git directory in $APP_DIR"
fi

log "Diagnosing Git repository permissions..."

# Check current user
CURRENT_USER=$(whoami)
log "Current user: $CURRENT_USER"

# Check Git directory ownership
GIT_OWNER=$(stat -c '%U' .git 2>/dev/null || stat -f '%Su' .git 2>/dev/null || echo "unknown")
log "Git directory owner: $GIT_OWNER"

# Check if .git/objects is writable
if [ -w .git/objects ]; then
  log "✅ Git objects directory is writable"
else
  warn "❌ Git objects directory is not writable"
  
  log "Fixing Git repository permissions..."
  
  # Fix ownership of entire .git directory
  if [ "$GIT_OWNER" != "$CURRENT_USER" ]; then
    log "Changing ownership of .git directory to $CURRENT_USER..."
    sudo chown -R "$CURRENT_USER:$CURRENT_USER" .git/
  fi
  
  # Ensure write permissions
  log "Setting write permissions on .git directory..."
  chmod -R u+w .git/
  
  # Verify fix
  if [ -w .git/objects ]; then
    log "✅ Git objects directory is now writable"
  else
    fail "❌ Failed to fix Git objects directory permissions"
  fi
fi

# Check working directory permissions
if [ -w . ]; then
  log "✅ Working directory is writable"
else
  warn "❌ Working directory is not writable"
  
  log "Fixing working directory permissions..."
  sudo chown -R "$CURRENT_USER:$CURRENT_USER" .
  
  if [ -w . ]; then
    log "✅ Working directory is now writable"
  else
    fail "❌ Failed to fix working directory permissions"
  fi
fi

# Test Git operations
log "Testing Git operations..."

# Test git status
if git status >/dev/null 2>&1; then
  log "✅ git status works"
else
  warn "❌ git status failed"
fi

# Test git fetch
log "Testing git fetch..."
if git fetch origin main >/dev/null 2>&1; then
  log "✅ git fetch works"
else
  warn "❌ git fetch failed"
  
  # Try to fix common issues
  log "Attempting to fix Git repository..."
  
  # Clean up any corrupted state
  git reset --hard HEAD 2>/dev/null || true
  git clean -fd 2>/dev/null || true
  
  # Try fetch again
  if git fetch origin main >/dev/null 2>&1; then
    log "✅ git fetch now works after cleanup"
  else
    warn "❌ git fetch still failing, repository may be corrupted"
    
    read -p "Do you want to re-clone the repository? This will lose any local changes. (y/N): " -r
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      log "Re-cloning repository..."
      cd /opt/itrade
      
      # Backup current directory
      if [ -d "app_backup" ]; then
        sudo rm -rf app_backup
      fi
      mv app app_backup
      
      # Clone fresh copy
      git clone "$REPO_URL" app
      cd "$APP_DIR"
      
      # Ensure correct ownership
      sudo chown -R "$CURRENT_USER:$CURRENT_USER" .
      
      log "✅ Repository re-cloned successfully"
    else
      log "Skipping re-clone. You may need to fix the repository manually."
    fi
  fi
fi

# Final verification
log "Final verification..."
if git status >/dev/null 2>&1 && git fetch origin main >/dev/null 2>&1; then
  log "✅ Git repository is working correctly"
  
  # Show current status
  echo ""
  log "Current Git status:"
  git status --short
  git log --oneline -3
else
  fail "❌ Git repository is still not working correctly"
fi

log "Git permissions fix complete!"