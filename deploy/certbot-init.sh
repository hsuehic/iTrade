#!/bin/bash
# =============================================================
# certbot-init.sh — One-time SSL Certificate Initialization
# =============================================================
#
# Run this ONCE after the GCE instance is set up AND all domain
# DNS A-records already point to the GCE external IP.
#
# Usage:
#   cd /opt/itrade/app
#   bash deploy/certbot-init.sh
#
# What it does:
#   1. Reads DOMAINS from /opt/itrade/.env.certbot
#      (falls back to DOMAIN for backward compat, or NEXT_PUBLIC_APP_URL)
#   2. Creates host directories for certs + webroot
#   3. Generates a temporary self-signed cert so nginx can start
#   4. Generates /opt/itrade/nginx.conf with server blocks for ALL domains
#   5. Starts the stack (nginx serves HTTP + ACME challenge)
#   6. Runs certbot to get a real SAN certificate covering all domains
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

# ── Step 1: Resolve domains ─────────────────────────────────
info "Resolving domains..."

DOMAINS_RAW=""
EMAIL=""

if [[ -f "$ENV_CERTBOT" ]]; then
  DOMAINS_RAW=$(grep -E '^DOMAINS=' "$ENV_CERTBOT" | cut -d= -f2 | tr -d '[:space:]')
  # Backward compat: fall back to DOMAIN= (singular)
  if [[ -z "$DOMAINS_RAW" ]]; then
    DOMAINS_RAW=$(grep -E '^DOMAIN=' "$ENV_CERTBOT" | cut -d= -f2 | tr -d '[:space:]')
  fi
  EMAIL=$(grep -E '^CERTBOT_EMAIL=' "$ENV_CERTBOT" | cut -d= -f2 | tr -d '[:space:]')
fi

# Fall back: extract domain from NEXT_PUBLIC_APP_URL in .env.web
if [[ -z "$DOMAINS_RAW" && -f "$ENV_WEB" ]]; then
  RAW_URL=$(grep -E '^NEXT_PUBLIC_APP_URL=' "$ENV_WEB" | cut -d= -f2 | tr -d '[:space:]"' )
  DOMAINS_RAW=$(echo "$RAW_URL" | sed 's|https\?://||' | sed 's|/.*||')
  warn "DOMAINS not set in .env.certbot — extracted '$DOMAINS_RAW' from NEXT_PUBLIC_APP_URL"
fi

[[ -z "$DOMAINS_RAW" ]] && error "Cannot determine DOMAINS. Set DOMAINS= in $ENV_CERTBOT"
[[ -z "$EMAIL" ]]       && error "Set CERTBOT_EMAIL= in $ENV_CERTBOT"

# Parse comma-separated domains into an array
IFS=',' read -ra DOMAIN_LIST <<< "$DOMAINS_RAW"

# First domain is used as cert-name and primary domain
CERT_NAME="${DOMAIN_LIST[0]}"

info "Domains : ${DOMAIN_LIST[*]}"
info "Cert    : $CERT_NAME (primary / cert-name)"
info "Email   : $EMAIL"

# ── Step 2: Create host directories ──────────────────────────
info "Creating certificate and webroot directories..."
mkdir -p "$CERTS_DIR"
mkdir -p "$WEBROOT_DIR"
mkdir -p "$CERTS_DIR/live/$CERT_NAME"

# ── Step 3: Generate temporary self-signed cert ───────────────
# This lets nginx start in HTTPS mode before the real cert exists.
# certbot will overwrite it during Step 6.
DUMMY_CERT="$CERTS_DIR/live/$CERT_NAME/fullchain.pem"
DUMMY_KEY="$CERTS_DIR/live/$CERT_NAME/privkey.pem"

if [[ ! -f "$DUMMY_CERT" ]]; then
  # Build SAN extension for all domains
  SAN_EXT=""
  for i in "${!DOMAIN_LIST[@]}"; do
    if [[ -z "$SAN_EXT" ]]; then
      SAN_EXT="DNS:${DOMAIN_LIST[$i]}"
    else
      SAN_EXT="$SAN_EXT,DNS:${DOMAIN_LIST[$i]}"
    fi
  done

  info "Generating temporary self-signed certificate for nginx bootstrap..."
  info "  SAN: $SAN_EXT"
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout "$DUMMY_KEY" \
    -out    "$DUMMY_CERT" \
    -subj   "/CN=$CERT_NAME" \
    -addext "subjectAltName=$SAN_EXT" \
    2>/dev/null
  info "Temporary cert created at $DUMMY_CERT"
else
  info "Certificate already exists at $DUMMY_CERT — skipping dummy cert step."
fi

# ── Step 4: Generate nginx.conf for ALL domains ─────────────
info "Generating nginx.conf → $NGINX_CONF ..."
if [[ -d "$NGINX_CONF" ]]; then
  warn "$NGINX_CONF is a directory. Moving it to a timestamped backup."
  mv "$NGINX_CONF" "/opt/itrade/nginx.conf.backup.$(date +%s)"
fi

# Build space-separated server_name list
SERVER_NAMES="${DOMAIN_LIST[*]}"

cat > "$NGINX_CONF" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $SERVER_NAMES;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name $SERVER_NAMES;

    ssl_certificate     /etc/letsencrypt/live/$CERT_NAME/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$CERT_NAME/privkey.pem;

    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options    nosniff;
    add_header X-Frame-Options           SAMEORIGIN;
    add_header Referrer-Policy           "strict-origin-when-cross-origin";

    client_max_body_size 10M;

    # ── Coinbase Advanced public WebSocket ──
    # wss://<domain>/ws/coinbase/advanced
    location /ws/coinbase/advanced {
        rewrite ^/ws/coinbase/advanced(.*)\$ \$1 break;
        proxy_pass https://advanced-trade-ws.coinbase.com;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host advanced-trade-ws.coinbase.com;
        proxy_set_header Origin https://advanced-trade.coinbase.com;
        proxy_ssl_server_name on;
        proxy_ssl_name advanced-trade-ws.coinbase.com;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }

    # ── Coinbase Advanced User WebSocket ──
    # wss://<domain>/ws/coinbase/advanced-user
    location /ws/coinbase/advanced-user {
        rewrite ^/ws/coinbase/advanced-user(.*)\$ \$1 break;
        proxy_pass https://advanced-trade-ws-user.coinbase.com;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host advanced-trade-ws-user.coinbase.com;
        proxy_set_header Origin https://advanced-trade.coinbase.com;
        proxy_ssl_server_name on;
        proxy_ssl_name advanced-trade-ws-user.coinbase.com;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }

    # ── OKX Public WebSocket ──
    # wss://<domain>/ws/okx/ws/v5/public
    location ^~ /ws/okx/ {
        rewrite ^/ws/okx(.*)\$ \$1 break;
        proxy_pass https://ws.okx.com;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host ws.okx.com;
        proxy_ssl_server_name on;
        proxy_ssl_name ws.okx.com;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }

    # ── Binance Spot WebSocket ──
    # wss://<domain>/ws/binance/spot/ws/btcusdt@trade
    location /ws/binance/spot {
        rewrite ^/ws/binance/spot(.*)\$ \$1 break;
        proxy_pass https://stream.binance.com;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host stream.binance.com;
        proxy_ssl_server_name on;
        proxy_ssl_name stream.binance.com;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }

    # ── Binance Perpetual (USDT-M Futures) WebSocket ──
    # wss://<domain>/ws/binance/perp/ws/btcusdt@markPrice
    location /ws/binance/perp {
        rewrite ^/ws/binance/perp(.*)\$ \$1 break;
        proxy_pass https://fstream.binance.com;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host fstream.binance.com;
        proxy_ssl_server_name on;
        proxy_ssl_name fstream.binance.com;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
        proxy_buffering off;
    }

    # ── Coinbase Advanced REST API ──
    # https://<domain>/rest/coinbase/api/v3/brokerage/accounts...
    location /rest/coinbase {
        rewrite ^/rest/coinbase/(.*)\$ /\$1 break;
        proxy_pass https://api.coinbase.com;
        proxy_http_version 1.1;
        proxy_set_header Host api.coinbase.com;
        proxy_ssl_server_name on;
        proxy_ssl_name api.coinbase.com;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout 30s;
        proxy_buffering off;
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Origin, Content-Type, Accept, Authorization' always;
    }

    # ── OKX REST API ──
    # https://<domain>/rest/okx/api/v5/...
    location /rest/okx {
        rewrite ^/rest/okx/(.*)\$ /\$1 break;
        proxy_pass https://www.okx.com;
        proxy_http_version 1.1;
        proxy_set_header Host www.okx.com;
        proxy_ssl_server_name on;
        proxy_ssl_name www.okx.com;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout 30s;
        proxy_buffering off;
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Origin, Content-Type, Accept, Authorization' always;
    }

    # ── Binance Spot REST API ──
    # https://<domain>/rest/binance/spot/api/v3/...
    location /rest/binance/spot {
        rewrite ^/rest/binance/spot/(.*)\$ /\$1 break;
        proxy_pass https://api.binance.com;
        proxy_http_version 1.1;
        proxy_set_header Host api.binance.com;
        proxy_ssl_server_name on;
        proxy_ssl_name api.binance.com;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout 30s;
        proxy_buffering off;
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Origin, Content-Type, Accept, Authorization' always;
    }

    # ── Binance Perpetual (USDT-M Futures) REST API ──
    # https://<domain>/rest/binance/perp/fapi/v1/...
    location /rest/binance/perp {
        rewrite ^/rest/binance/perp/(.*)\$ /\$1 break;
        proxy_pass https://fapi.binance.com;
        proxy_http_version 1.1;
        proxy_set_header Host fapi.binance.com;
        proxy_ssl_server_name on;
        proxy_ssl_name fapi.binance.com;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout 30s;
        proxy_buffering off;
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'Origin, Content-Type, Accept, Authorization' always;
    }

    # ── Default: proxy to web app ──
    location / {
        resolver 127.0.0.11 ipv6=off valid=30s;
        set \$web_upstream web;
        proxy_pass         http://\$web_upstream:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade    \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout    60s;
        proxy_read_timeout    60s;
        proxy_next_upstream error timeout http_502 http_503;
        proxy_next_upstream_tries    2;
        proxy_next_upstream_timeout  30s;
    }
}
EOF
chmod 644 "$NGINX_CONF"
info "nginx.conf written (server_name: $SERVER_NAMES)."

# ── Step 5: Start the stack (nginx needs to be up for ACME) ──
info "Starting services (nginx must be up to serve ACME challenge)..."
docker compose -f "$COMPOSE_FILE" up -d --no-build db web console nginx

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

# ── Step 6: Run certbot to get the real SAN certificate ──────
# Build --domain flags for all domains
DOMAIN_FLAGS=""
for d in "${DOMAIN_LIST[@]}"; do
  DOMAIN_FLAGS="$DOMAIN_FLAGS --domain $d"
done

info "Requesting Let's Encrypt certificate for: ${DOMAIN_LIST[*]} ..."
docker compose -f "$COMPOSE_FILE" run --rm --entrypoint certbot certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  $DOMAIN_FLAGS \
  --email  "$EMAIL" \
  --agree-tos \
  --non-interactive \
  --keep-until-expiring \
  --cert-name "$CERT_NAME"

info "Certificate obtained successfully."

# ── Step 7: Reload nginx to pick up the real cert ────────────
info "Reloading nginx with the real Let's Encrypt certificate..."
docker exec itrade-nginx nginx -s reload
info "nginx reloaded."

info "Starting certbot renewal service..."
docker compose -f "$COMPOSE_FILE" up -d --no-build certbot

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
echo "  Domains : ${DOMAIN_LIST[*]}"
echo "  Cert    : $CERTS_DIR/live/$CERT_NAME/"
echo "  Renewal : certbot service runs every 12h (auto)"
echo "  Reload  : system cron runs nginx -s reload every 12h"
echo ""
echo "  To verify:"
echo "    docker compose -f $COMPOSE_FILE ps"
for d in "${DOMAIN_LIST[@]}"; do
  echo "    curl -I https://$d"
done
echo ""
