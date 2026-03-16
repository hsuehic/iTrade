#!/bin/bash
# =============================================================
# certbot-init.sh — One-time SSL Certificate Initialization
# =============================================================
#
# Run this ONCE after the GCE instance is set up AND the domain
# DNS A-record already points to the GCE external IP.
#
# Usage:
#   cd /opt/itrade/app
#   bash deploy/certbot-init.sh
#
# What it does:
#   1. Reads DOMAIN from /opt/itrade/.env.certbot
#      (auto-extracted from NEXT_PUBLIC_APP_URL if DOMAIN is absent)
#   2. Creates host directories for certs + webroot
#   3. Generates a temporary self-signed cert so nginx can start
#   4. Generates /opt/itrade/nginx.conf from nginx.conf.template
#   5. Starts the stack (nginx serves HTTP + ACME challenge)
#   6. Runs certbot to get the real Let's Encrypt certificate
#   7. Reloads nginx to pick up the real cert
#   8. Installs a system cron to reload nginx after each renewal
#
# After this script, every subsequent renewal is fully automatic.
# =============================================================

set -euo pipefail

# ── Colours ──────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()    { echo -e "${GREEN}▶${NC} $*"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $*"; }
error()   { echo -e "${RED}✖${NC}  $*" >&2; exit 1; }

# ── Paths ────────────────────────────────────────────────────
APP_DIR="/opt/itrade/app"
ENV_CERTBOT="/opt/itrade/.env.certbot"
ENV_WEB="/opt/itrade/.env.web"
CERTS_DIR="/opt/itrade/certbot/certs"       # → /etc/letsencrypt in containers
WEBROOT_DIR="/opt/itrade/certbot/webroot"   # → /var/www/certbot in containers
NGINX_CONF="/opt/itrade/nginx.conf"         # generated; mounted into nginx container
COMPOSE_FILE="$APP_DIR/docker-compose.prod.yml"

# ── Must run from APP_DIR ─────────────────────────────────────
cd "$APP_DIR"

# ── Step 1: Resolve domain ────────────────────────────────────
info "Resolving domain..."

DOMAIN=""
EMAIL=""

# Load from .env.certbot if it exists
if [[ -f "$ENV_CERTBOT" ]]; then
  DOMAIN=$(grep -E '^DOMAIN=' "$ENV_CERTBOT" | cut -d= -f2 | tr -d '[:space:]')
  EMAIL=$(grep -E '^CERTBOT_EMAIL=' "$ENV_CERTBOT" | cut -d= -f2 | tr -d '[:space:]')
fi

# Fall back: extract domain from NEXT_PUBLIC_APP_URL in .env.web
if [[ -z "$DOMAIN" && -f "$ENV_WEB" ]]; then
  RAW_URL=$(grep -E '^NEXT_PUBLIC_APP_URL=' "$ENV_WEB" | cut -d= -f2 | tr -d '[:space:]"' )
  DOMAIN=$(echo "$RAW_URL" | sed 's|https\?://||' | sed 's|/.*||')
  warn "DOMAIN not set in .env.certbot — extracted '$DOMAIN' from NEXT_PUBLIC_APP_URL"
fi

[[ -z "$DOMAIN" ]] && error "Cannot determine DOMAIN. Set DOMAIN= in $ENV_CERTBOT"
[[ -z "$EMAIL" ]]  && error "Set CERTBOT_EMAIL= in $ENV_CERTBOT"

info "Domain : $DOMAIN"
info "Email  : $EMAIL"

# ── Step 2: Create host directories ──────────────────────────
info "Creating certificate and webroot directories..."
mkdir -p "$CERTS_DIR"
mkdir -p "$WEBROOT_DIR"
mkdir -p "$CERTS_DIR/live/$DOMAIN"

# ── Step 3: Generate temporary self-signed cert ───────────────
# This lets nginx start in HTTPS mode before the real cert exists.
# certbot will overwrite it during Step 6.
DUMMY_CERT="$CERTS_DIR/live/$DOMAIN/fullchain.pem"
DUMMY_KEY="$CERTS_DIR/live/$DOMAIN/privkey.pem"

if [[ ! -f "$DUMMY_CERT" ]]; then
  info "Generating temporary self-signed certificate for nginx bootstrap..."
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout "$DUMMY_KEY" \
    -out    "$DUMMY_CERT" \
    -subj   "/CN=$DOMAIN" \
    2>/dev/null
  info "Temporary cert created at $DUMMY_CERT"
else
  info "Certificate already exists at $DUMMY_CERT — skipping dummy cert step."
fi

# ── Step 4: Generate nginx.conf from template ─────────────────
info "Generating nginx.conf → $NGINX_CONF ..."
sed "s/DOMAIN_PLACEHOLDER/$DOMAIN/g" \
  "$APP_DIR/deploy/nginx.conf.template" > "$NGINX_CONF"
info "nginx.conf written."

# ── Step 5: Start the stack (nginx needs to be up for ACME) ──
info "Starting services (nginx must be up to serve ACME challenge)..."
docker compose -f "$COMPOSE_FILE" up -d db web console nginx

# Wait for nginx to be ready
MAX_WAIT=30
ELAPSED=0
info "Waiting for nginx to become ready..."
until docker exec itrade-nginx nginx -t &>/dev/null; do
  if [[ $ELAPSED -ge $MAX_WAIT ]]; then
    error "nginx failed to become ready within ${MAX_WAIT}s. Check: docker logs itrade-nginx"
  fi
  sleep 2; ELAPSED=$((ELAPSED + 2))
done
info "nginx is ready."

# ── Step 6: Run certbot to get the real certificate ───────────
info "Requesting Let's Encrypt certificate for $DOMAIN ..."
docker compose -f "$COMPOSE_FILE" run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --domain "$DOMAIN" \
  --email  "$EMAIL" \
  --agree-tos \
  --non-interactive \
  --keep-until-expiring \
  --cert-name "$DOMAIN"

info "Certificate obtained successfully."

# ── Step 7: Reload nginx to pick up the real cert ────────────
info "Reloading nginx with the real Let's Encrypt certificate..."
docker exec itrade-nginx nginx -s reload
info "nginx reloaded."

# ── Step 8: Install system cron for post-renewal nginx reload ─
# certbot service renews automatically; after renewal, nginx must
# reload to serve the new cert. A system cron handles this safely.
CRON_JOB="0 */12 * * * docker exec itrade-nginx nginx -s reload >> /var/log/nginx-reload.log 2>&1"
CRON_MARKER="# iTrade nginx SSL reload"

if ! crontab -l 2>/dev/null | grep -q "itrade-nginx"; then
  info "Installing system cron for post-renewal nginx reload..."
  (crontab -l 2>/dev/null; echo "$CRON_MARKER"; echo "$CRON_JOB") | crontab -
  info "Cron installed: nginx will reload every 12h to pick up renewed certs."
else
  info "Cron already installed — skipping."
fi

# ── Done ─────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅  SSL initialisation complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo ""
echo "  Domain  : https://$DOMAIN"
echo "  Cert    : $CERTS_DIR/live/$DOMAIN/"
echo "  Renewal : certbot service runs every 12h (auto)"
echo "  Reload  : system cron runs nginx -s reload every 12h"
echo ""
echo "  To verify:"
echo "    docker compose -f $COMPOSE_FILE ps"
echo "    curl -I https://$DOMAIN"
echo ""
