#!/usr/bin/env bash
# =============================================================
# iTrade — One-time GCE Instance Setup Script
# =============================================================
# Run this ONCE after creating a fresh GCE instance:
#   chmod +x setup-gce.sh && ./setup-gce.sh
#
# Prerequisites:
#   - Debian/Ubuntu based GCE VM
#   - Your GitHub repo URL
#   - Env files ready (see deploy/env.*.template)
# =============================================================

set -euo pipefail

# ── Configuration ────────────────────────────────────────────
REPO_URL="${REPO_URL:-https://github.com/YOUR_ORG/iTrade.git}"
APP_DIR="/opt/itrade/app"
ENV_DIR="/opt/itrade"
DEPLOY_USER="${DEPLOY_USER:-$(whoami)}"
# ─────────────────────────────────────────────────────────────

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[setup]${NC} $*"; }
warn() { echo -e "${YELLOW}[warn]${NC}  $*"; }
fail() { echo -e "${RED}[error]${NC} $*"; exit 1; }

# ── 1. System update ─────────────────────────────────────────
log "Updating system packages..."
sudo apt-get update -qq
sudo apt-get install -y -qq git curl ca-certificates gnupg lsb-release openssl

# ── 2. Install Docker ────────────────────────────────────────
if command -v docker &>/dev/null; then
  log "Docker already installed: $(docker --version)"
else
  log "Installing Docker..."
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$DEPLOY_USER"
  log "Docker installed. You may need to log out and back in for group changes."
fi

# ── 3. Install Docker Compose plugin ─────────────────────────
if docker compose version &>/dev/null 2>&1; then
  log "Docker Compose already installed: $(docker compose version)"
else
  log "Installing Docker Compose plugin..."
  # Try apt first (works if Docker CE from official repo is installed)
  if apt-cache show docker-compose-plugin &>/dev/null 2>&1; then
    sudo apt-get install -y -qq docker-compose-plugin
  else
    # Fallback: install standalone Compose v2 binary as a Docker CLI plugin
    warn "docker-compose-plugin not found in apt — installing standalone binary from GitHub..."
    COMPOSE_VERSION=$(curl -fsSL --max-time 10 \
      https://api.github.com/repos/docker/compose/releases/latest \
      | grep '"tag_name"' | sed 's/.*"v\([^"]*\)".*/\1/')
    COMPOSE_VERSION="${COMPOSE_VERSION:-2.24.7}"  # fallback pin if GitHub API is unavailable
    PLUGIN_DIR="/usr/local/lib/docker/cli-plugins"
    sudo mkdir -p "$PLUGIN_DIR"
    sudo curl -fsSL \
      "https://github.com/docker/compose/releases/download/v${COMPOSE_VERSION}/docker-compose-$(uname -s | tr '[:upper:]' '[:lower:]')-$(uname -m)" \
      -o "$PLUGIN_DIR/docker-compose"
    sudo chmod +x "$PLUGIN_DIR/docker-compose"
    log "Docker Compose v${COMPOSE_VERSION} installed as CLI plugin."
  fi
fi

# ── 4. Create directory structure ────────────────────────────
log "Creating /opt/itrade directory structure..."
sudo mkdir -p \
  "$APP_DIR" \
  "$ENV_DIR/certbot/certs" \
  "$ENV_DIR/certbot/webroot"
sudo chown -R "$DEPLOY_USER:$DEPLOY_USER" "$ENV_DIR"

# ── 5. Clone or update the repository ───────────────────────
if [ -d "$APP_DIR/.git" ]; then
  log "Repository already exists. Pulling latest..."
  cd "$APP_DIR" && git pull origin main
else
  log "Cloning repository..."
  if [ "$REPO_URL" = "https://github.com/YOUR_ORG/iTrade.git" ]; then
    fail "Please set REPO_URL before running: export REPO_URL=https://github.com/YOUR_ORG/iTrade.git"
  fi
  git clone "$REPO_URL" "$APP_DIR"
fi

# ── 6. Create environment files from templates ───────────────
log "Creating environment files..."

create_env_from_template() {
  local template="$APP_DIR/deploy/$1"
  local dest="$ENV_DIR/$2"
  if [ ! -f "$dest" ]; then
    if [ -f "$template" ]; then
      cp "$template" "$dest"
      warn "Created $dest from template — please edit it with real values!"
    else
      warn "Template $template not found, skipping."
    fi
  else
    log "Env file $dest already exists, skipping."
  fi
}

create_env_from_template "env.db.template"      ".env.db"
create_env_from_template "env.console.template" ".env.console"
create_env_from_template "env.web.template"     ".env.web"
create_env_from_template "env.certbot.template" ".env.certbot"

# ── 7. Configure firewall (ufw) ──────────────────────────────
if command -v ufw &>/dev/null; then
  log "Configuring UFW firewall..."
  sudo ufw allow ssh
  sudo ufw allow 80/tcp
  sudo ufw allow 443/tcp
  sudo ufw --force enable
  log "Firewall configured: SSH, HTTP (80), HTTPS (443) allowed."
else
  warn "ufw not found — configure firewall rules manually in GCE console."
fi

# ── 8. Enable Docker auto-start ──────────────────────────────
sudo systemctl enable docker

# ── 9. (Optional) Setup GitHub Actions deploy key ────────────
SSH_KEY_FILE="$HOME/.ssh/id_ed25519_gce_deploy"
if [ ! -f "$SSH_KEY_FILE" ]; then
  log "Generating SSH deploy key for GitHub Actions..."
  mkdir -p "$HOME/.ssh"
  chmod 700 "$HOME/.ssh"
  ssh-keygen -t ed25519 -C "gce-deploy@itrade" -f "$SSH_KEY_FILE" -N ""

  # Automatically add public key to authorized_keys
  cat "${SSH_KEY_FILE}.pub" >> "$HOME/.ssh/authorized_keys"
  chmod 600 "$HOME/.ssh/authorized_keys"
  log "Public key added to ~/.ssh/authorized_keys automatically."

  echo ""
  warn "Add this PRIVATE key as GitHub secret GCE_SSH_PRIVATE_KEY:"
  echo "------"
  cat "${SSH_KEY_FILE}"
  echo "------"
else
  log "Deploy SSH key already exists at $SSH_KEY_FILE"
  # Ensure public key is in authorized_keys (idempotent)
  if ! grep -qF "$(cat "${SSH_KEY_FILE}.pub")" "$HOME/.ssh/authorized_keys" 2>/dev/null; then
    cat "${SSH_KEY_FILE}.pub" >> "$HOME/.ssh/authorized_keys"
    chmod 600 "$HOME/.ssh/authorized_keys"
    log "Public key re-added to ~/.ssh/authorized_keys."
  fi
fi

# ── Done ─────────────────────────────────────────────────────
GCE_IP=$(curl -s --max-time 3 ifconfig.me 2>/dev/null || echo '<your-gce-ip>')

echo ""
log "✅ GCE setup complete!"
echo ""
echo "══════════════════════════════════════════════════════════"
echo "  Next steps"
echo "══════════════════════════════════════════════════════════"
echo ""
echo "  1. Edit env files with real values:"
echo "       nano $ENV_DIR/.env.db"
echo "       nano $ENV_DIR/.env.console"
echo "       nano $ENV_DIR/.env.web"
echo "       nano $ENV_DIR/.env.certbot   ← set DOMAIN + CERTBOT_EMAIL"
echo ""
echo "  2. Add GitHub Secrets:"
echo "       GCE_HOST            → $GCE_IP"
echo "       GCE_USER            → $DEPLOY_USER"
echo "       GCE_SSH_PRIVATE_KEY → (see private key printed above)"
echo ""
echo "  3. Point your domain DNS A-record → $GCE_IP"
echo "     (wait for DNS propagation before the next step)"
echo ""
echo "  4. First deploy — start all services:"
echo "       cd $APP_DIR"
echo "       docker compose -f docker-compose.prod.yml up -d --build"
echo ""
echo "  5. Initialize SSL (run ONCE, requires DNS already pointing here):"
echo "       cd $APP_DIR"
echo "       bash deploy/certbot-init.sh"
echo ""
echo "     This will:"
echo "       • Read DOMAIN from $ENV_DIR/.env.certbot"
echo "         (auto-extracted from NEXT_PUBLIC_APP_URL if DOMAIN is unset)"
echo "       • Generate a self-signed cert for nginx bootstrap"
echo "       • Obtain a real Let's Encrypt certificate via HTTP-01 challenge"
echo "       • Switch nginx to HTTPS and reload it"
echo "       • Install a system cron to reload nginx every 12h after renewal"
echo ""
echo "     After this, renewal is fully automatic (certbot service in Docker"
echo "     Compose checks every 12h and renews when cert is <30 days from expiry)."
echo ""
echo "  6. Push to 'main' branch — GitHub Actions auto-deploys on every push."
echo ""
echo "══════════════════════════════════════════════════════════"
