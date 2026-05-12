#!/usr/bin/env bash
# =============================================================
# install-skills.sh — Install project-level Cowork skills
#
# Cowork does not auto-scan the project folder for skills.
# Run this script once after cloning to install skills from
# .claude/skills/ into Cowork's plugin directory.
#
# Usage:
#   bash .claude/install-skills.sh
# =============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILLS_SRC="$SCRIPT_DIR/skills"

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[skills]${NC} $*"; }
warn() { echo -e "${YELLOW}[skills]${NC} $*"; }
fail() { echo -e "${RED}[skills]${NC} $*"; exit 1; }

# ── Locate Cowork skills plugin directory ─────────────────────
APP_SUPPORT="$HOME/Library/Application Support/Claude/local-agent-mode-sessions/skills-plugin"

if [[ ! -d "$APP_SUPPORT" ]]; then
  fail "Cowork plugin directory not found at:
  $APP_SUPPORT

Make sure the Claude desktop app is installed and you have opened Cowork at least once."
fi

# Find the active plugin instance (most recently modified)
PLUGIN_DIR=$(find "$APP_SUPPORT" -maxdepth 3 -name "skills" -type d 2>/dev/null \
  | xargs -I{} dirname {} \
  | sort -t/ -k1 \
  | tail -1)

if [[ -z "$PLUGIN_DIR" ]]; then
  fail "Could not find Cowork skills directory inside $APP_SUPPORT"
fi

COWORK_SKILLS="$PLUGIN_DIR/skills"
log "Installing project skills to: $COWORK_SKILLS"
echo ""

# ── Install each skill from .claude/skills/ ───────────────────
INSTALLED=0
for skill_dir in "$SKILLS_SRC"/*/; do
  skill_name="$(basename "$skill_dir")"
  skill_md="$skill_dir/SKILL.md"

  if [[ ! -f "$skill_md" ]]; then
    warn "  Skipping $skill_name (no SKILL.md found)"
    continue
  fi

  dest="$COWORK_SKILLS/$skill_name"
  mkdir -p "$dest"
  cp "$skill_md" "$dest/SKILL.md"

  # Copy any bundled resources (scripts/, references/, assets/)
  for subdir in scripts references assets; do
    if [[ -d "$skill_dir/$subdir" ]]; then
      cp -r "$skill_dir/$subdir" "$dest/"
    fi
  done

  log "  ✓  $skill_name"
  INSTALLED=$((INSTALLED + 1))
done

echo ""
log "$INSTALLED skill(s) installed. Restart the Claude desktop app to pick them up."
