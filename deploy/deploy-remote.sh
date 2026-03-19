#!/usr/bin/env bash
# =============================================================
# deploy-remote.sh — Runs on the GCE instance during CI/CD deploy
# =============================================================
# Called by .github/workflows/deploy.yml after SCP to the server.
#
# Required environment variables (passed by the CI runner):
#   GITHUB_REPOSITORY  — e.g. org/iTrade
#   COMMIT_SHA         — full git SHA being deployed
#   GHCR_TOKEN         — GitHub Container Registry token
#   GH_ACTOR           — GitHub actor (for GHCR login)
#   IMAGE_PREFIX       — e.g. ghcr.io/org/itrade
# =============================================================

set -euo pipefail

APP_DIR="/opt/itrade/app"
COMPOSE_FILE="$APP_DIR/docker-compose.prod.yml"
NGINX_CONF="/opt/itrade/nginx.conf"
CERTBOT_ENV="/opt/itrade/.env.certbot"
CERTS_BASE="/opt/itrade/certbot/certs"
WEBROOT_DIR="/opt/itrade/certbot/webroot"
DEPLOY_START=$(date +%s)

# ══════════════════════════════════════════════════════════════
# Phase 1: Preparation (old containers still serving traffic)
# ══════════════════════════════════════════════════════════════
echo ""
echo "══ Phase 1: Preparation (zero downtime) ══"

download_from_github() {
  local source_path="$1"
  local dest_path="$2"
  local tmp_path="${dest_path}.tmp"
  local ok=false

  if curl -fsSL --connect-timeout 10 --max-time 30 \
    "https://raw.githubusercontent.com/$GITHUB_REPOSITORY/$COMMIT_SHA/$source_path" \
    -o "$tmp_path"; then
    ok=true
  elif curl -fsSL --connect-timeout 10 --max-time 30 \
    -H "Accept: application/vnd.github.raw" \
    "https://api.github.com/repos/$GITHUB_REPOSITORY/contents/$source_path?ref=$COMMIT_SHA" \
    -o "$tmp_path"; then
    ok=true
  fi

  if [ "$ok" = true ] && [ -s "$tmp_path" ]; then
    mv "$tmp_path" "$dest_path"
    echo "  ✅ Downloaded: $source_path"
    return 0
  fi

  rm -f "$tmp_path"
  echo "  ❌ Failed to download: $source_path"
  return 1
}

echo "▶ Setting up directories..."
sudo -n mkdir -p /opt/itrade "$APP_DIR" "$CERTS_BASE" "$WEBROOT_DIR" 2>/dev/null || mkdir -p /opt/itrade "$APP_DIR" "$CERTS_BASE" "$WEBROOT_DIR"
sudo -n chown -R "$(whoami):$(whoami)" /opt/itrade/ 2>/dev/null || true
sudo -n chmod 755 /opt/itrade/ /opt/itrade/app/ 2>/dev/null || true

echo "▶ Downloading deployment files..."
cd "$APP_DIR"
download_from_github "docker-compose.prod.yml" "$COMPOSE_FILE"

if [ ! -s "$COMPOSE_FILE" ] || ! grep -q "services:" "$COMPOSE_FILE"; then
  echo "❌ docker-compose.prod.yml is empty or invalid"
  exit 1
fi
FILE_SIZE=$(wc -c < "$COMPOSE_FILE")
echo "  ✅ docker-compose.prod.yml valid (${FILE_SIZE} bytes)"

echo "▶ Verifying environment files..."
sudo chmod 600 /opt/itrade/.env.* 2>/dev/null || true

for env_file in /opt/itrade/.env.{console,db,web,certbot}; do
  if [ ! -f "$env_file" ]; then
    echo "❌ Missing: $env_file"
    exit 1
  fi
done
echo "  ✅ All environment files present"

# ── Prepare nginx config and SSL paths ───────────────────────
echo "▶ Preparing nginx config and SSL paths..."

# Support DOMAINS= (comma-separated, multi-domain) with DOMAIN= fallback
DOMAINS_RAW=$(sed -n 's/^DOMAINS=//p' "$CERTBOT_ENV" | head -n 1 | tr -d '[:space:]"')
if [ -z "${DOMAINS_RAW:-}" ]; then
  DOMAINS_RAW=$(sed -n 's/^DOMAIN=//p' "$CERTBOT_ENV" | head -n 1 | tr -d '[:space:]"')
fi
if [ -z "${DOMAINS_RAW:-}" ]; then
  echo "❌ DOMAINS (or DOMAIN) is missing in $CERTBOT_ENV"
  exit 1
fi

IFS=',' read -ra DOMAIN_LIST <<< "$DOMAINS_RAW"
CERT_NAME="${DOMAIN_LIST[0]}"
SERVER_NAMES="${DOMAIN_LIST[*]}"
echo "  Domains: ${SERVER_NAMES}"
echo "  Cert name: ${CERT_NAME}"

if [ -d "$NGINX_CONF" ]; then
  mv "$NGINX_CONF" "/opt/itrade/nginx.conf.backup.$(date +%s)"
fi

mkdir -p "$CERTS_BASE/live/$CERT_NAME" "$WEBROOT_DIR"

# ── Generate nginx.conf ──────────────────────────────────────
cat > "$NGINX_CONF" <<NGINX_EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${SERVER_NAMES};

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
    server_name ${SERVER_NAMES};

    ssl_certificate     /etc/letsencrypt/live/${CERT_NAME}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${CERT_NAME}/privkey.pem;

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

    # ── Binance Perpetual WebSocket ──
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

    # ── Binance Perpetual REST API ──
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
NGINX_EOF
chmod 644 "$NGINX_CONF"
echo "  ✅ nginx.conf written (server_name: $SERVER_NAMES)"

# ── Bootstrap certificate ────────────────────────────────────
DUMMY_CERT="$CERTS_BASE/live/$CERT_NAME/fullchain.pem"
DUMMY_KEY="$CERTS_BASE/live/$CERT_NAME/privkey.pem"
if [ ! -s "$DUMMY_CERT" ] || [ ! -s "$DUMMY_KEY" ]; then
  echo "  ▶ Generating temporary bootstrap certificate..."

  if ! command -v openssl >/dev/null 2>&1; then
    echo "  ▶ openssl not found, installing..."
    sudo apt-get update -qq && sudo apt-get install -y -qq openssl
  fi

  mkdir -p "$CERTS_BASE/live/$CERT_NAME"

  SAN_EXT=""
  for d in "${DOMAIN_LIST[@]}"; do
    if [ -z "$SAN_EXT" ]; then SAN_EXT="DNS:$d"; else SAN_EXT="$SAN_EXT,DNS:$d"; fi
  done

  if openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout "$DUMMY_KEY" \
    -out "$DUMMY_CERT" \
    -subj "/CN=$CERT_NAME" \
    -addext "subjectAltName=$SAN_EXT" 2>&1; then
    echo "  ✅ Bootstrap certificate generated (SAN: $SAN_EXT)"
  else
    echo "  ⚠️  openssl failed as current user, retrying with sudo..."
    sudo openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
      -keyout "$DUMMY_KEY" \
      -out "$DUMMY_CERT" \
      -subj "/CN=$CERT_NAME" \
      -addext "subjectAltName=$SAN_EXT" 2>&1
    sudo chown "$(whoami):$(whoami)" "$DUMMY_KEY" "$DUMMY_CERT"
    echo "  ✅ Bootstrap certificate generated (with sudo, SAN: $SAN_EXT)"
  fi
else
  echo "  ✅ Existing certificate found"
fi

# Disable host nginx if running (only needed on first deploy)
if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet nginx; then
  echo "  ⚠️  Stopping host nginx to avoid port conflict"
  sudo systemctl stop nginx || true
  sudo systemctl disable nginx || true
fi

echo "▶ Logging in to GHCR..."
echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GH_ACTOR" --password-stdin

export CONSOLE_IMAGE="$IMAGE_PREFIX/console:$COMMIT_SHA"
export SCHEMA_MIGRATOR_IMAGE="$IMAGE_PREFIX/schema-migrator:$COMMIT_SHA"
export WEB_IMAGE="$IMAGE_PREFIX/web:$COMMIT_SHA"

echo "▶ Pre-pulling new images (services still running)..."
PULL_START=$(date +%s)

docker compose -f "$COMPOSE_FILE" pull console schema-migrator web

PULL_END=$(date +%s)
echo "  ✅ Images pre-pulled in $((PULL_END - PULL_START))s (zero downtime)"

PHASE1_END=$(date +%s)
echo "══ Phase 1 complete: $((PHASE1_END - DEPLOY_START))s (zero downtime) ══"

# ══════════════════════════════════════════════════════════════
# Phase 2: Rolling update (minimal downtime)
# ══════════════════════════════════════════════════════════════
echo ""
echo "══ Phase 2: Rolling update (minimal downtime starts) ══"
DOWNTIME_START=$(date +%s)

docker compose -f "$COMPOSE_FILE" up -d --no-build db
echo "▶ Waiting for database..."
DB_TIMEOUT=30
DB_ELAPSED=0
while [ $DB_ELAPSED -lt $DB_TIMEOUT ]; do
  if docker inspect --format='{{.State.Health.Status}}' itrade-db 2>/dev/null | grep -q "healthy"; then
    break
  fi
  sleep 2
  DB_ELAPSED=$((DB_ELAPSED + 2))
done
if [ $DB_ELAPSED -ge $DB_TIMEOUT ]; then
  echo "❌ Database health check timeout"
  docker compose -f "$COMPOSE_FILE" logs --tail=20 db
  exit 1
fi
echo "  ✅ Database healthy (waited ${DB_ELAPSED}s)"

echo "▶ Stopping console before schema migration..."
docker compose -f "$COMPOSE_FILE" stop console 2>/dev/null || true

# Sync DB password: POSTGRES_PASSWORD only takes effect during initial initdb.
# If the volume already exists with a different password, the env var is ignored.
# Read the expected password from .env.console and reset it inside the running DB.
CONSOLE_ENV="/opt/itrade/.env.console"
EXPECTED_DB_USER=$(sed -n 's/^DB_USER=//p' "$CONSOLE_ENV" | head -n 1)
EXPECTED_DB_PASS=$(sed -n 's/^DB_PASSWORD=//p' "$CONSOLE_ENV" | head -n 1)
EXPECTED_DB_USER="${EXPECTED_DB_USER:-itrade}"

if [ -n "${EXPECTED_DB_PASS:-}" ]; then
  echo "▶ Syncing database password..."
  ESCAPED_PASS=$(printf '%s' "$EXPECTED_DB_PASS" | sed "s/'/''/g")
  docker exec itrade-db psql -U "${EXPECTED_DB_USER}" -d postgres \
    -c "ALTER USER ${EXPECTED_DB_USER} WITH PASSWORD '${ESCAPED_PASS}';" \
    2>/dev/null && echo "  ✅ Database password synced" \
    || echo "  ⚠️  Password sync failed (may already be correct)"
fi

docker exec itrade-db psql -U "${EXPECTED_DB_USER}" -d "${POSTGRES_DB:-itrade}" \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid != pg_backend_pid() AND application_name != 'schema-migrator';" \
  2>/dev/null || true

docker compose -f "$COMPOSE_FILE" rm -sf schema-migrator 2>/dev/null || true
echo "▶ Running schema migration..."
MIGRATION_START=$(date +%s)
docker compose -f "$COMPOSE_FILE" up --no-build schema-migrator

MIGRATOR_EXIT=$(docker inspect --format='{{.State.ExitCode}}' itrade-schema-migrator 2>/dev/null || echo "1")
MIGRATION_END=$(date +%s)
if [ "$MIGRATOR_EXIT" != "0" ]; then
  echo "❌ Schema migration failed (exit code: $MIGRATOR_EXIT)"
  docker compose -f "$COMPOSE_FILE" logs --tail=30 schema-migrator
  exit 1
fi
echo "  ✅ Schema migration complete ($((MIGRATION_END - MIGRATION_START))s)"

echo "▶ Updating console and web services..."
docker compose -f "$COMPOSE_FILE" up -d --no-build console web

docker compose -f "$COMPOSE_FILE" up -d --no-build nginx
docker exec itrade-nginx nginx -s reload 2>/dev/null || true

echo "▶ Waiting for web service to be healthy..."
WEB_TIMEOUT=90
WEB_ELAPSED=0
while [ $WEB_ELAPSED -lt $WEB_TIMEOUT ]; do
  if docker inspect --format='{{.State.Health.Status}}' itrade-web 2>/dev/null | grep -q "healthy"; then
    break
  fi
  sleep 3
  WEB_ELAPSED=$((WEB_ELAPSED + 3))
  if [ $((WEB_ELAPSED % 15)) -eq 0 ]; then
    echo "  Waiting... ${WEB_ELAPSED}s/${WEB_TIMEOUT}s"
  fi
done

DOWNTIME_END=$(date +%s)

if [ $WEB_ELAPSED -ge $WEB_TIMEOUT ]; then
  echo "❌ Web service health check timeout"
  docker compose -f "$COMPOSE_FILE" logs --tail=50 web
  exit 1
fi

echo "  ✅ Web service healthy (waited ${WEB_ELAPSED}s)"
echo "══ Phase 2 complete: ~$((DOWNTIME_END - DOWNTIME_START))s service downtime ══"

# ══════════════════════════════════════════════════════════════
# Phase 3: Post-deploy (services are already healthy)
# ══════════════════════════════════════════════════════════════
echo ""
echo "══ Phase 3: Post-deploy tasks (zero downtime) ══"

CERT_FILE="$CERTS_BASE/live/$CERT_NAME/fullchain.pem"
NEED_CERT=false

if [ ! -s "$CERT_FILE" ]; then
  NEED_CERT=true
  echo "  Certificate missing → will issue"
elif openssl x509 -in "$CERT_FILE" -noout -subject 2>/dev/null | grep -qi "O = \|self.signed\|CN = $CERT_NAME" && \
     ! openssl x509 -in "$CERT_FILE" -noout -issuer 2>/dev/null | grep -qi "Let's Encrypt\|R3\|R10\|R11\|E1\|E5"; then
  NEED_CERT=true
  echo "  Self-signed certificate detected → will issue real one"
elif ! openssl x509 -in "$CERT_FILE" -noout -checkend 2592000 >/dev/null 2>&1; then
  NEED_CERT=true
  echo "  Certificate expires within 30 days → will renew"
fi

if [ "$NEED_CERT" = true ]; then
  CERTBOT_EMAIL=$(sed -n 's/^CERTBOT_EMAIL=//p' "$CERTBOT_ENV" | head -n 1 | tr -d '[:space:]"')
  if [ -n "${CERTBOT_EMAIL:-}" ]; then
    CERT_LIVE_DIR="$CERTS_BASE/live/$CERT_NAME"
    CERT_RENEWAL_CONF="$CERTS_BASE/renewal/$CERT_NAME.conf"
    if [ -d "$CERT_LIVE_DIR" ] && [ ! -f "$CERT_RENEWAL_CONF" ]; then
      echo "  ▶ Clearing non-certbot certificate from live directory..."
      rm -rf "$CERT_LIVE_DIR"
      rm -rf "$CERTS_BASE/archive/$CERT_NAME" 2>/dev/null || true
    fi

    DOMAIN_FLAGS=""
    for d in "${DOMAIN_LIST[@]}"; do
      DOMAIN_FLAGS="$DOMAIN_FLAGS --domain $d"
    done

    echo "▶ Issuing/renewing Let's Encrypt certificate for: ${SERVER_NAMES}..."
    if docker compose -f "$COMPOSE_FILE" run --rm --entrypoint certbot certbot certonly \
      --webroot \
      --webroot-path=/var/www/certbot \
      $DOMAIN_FLAGS \
      --email "$CERTBOT_EMAIL" \
      --agree-tos \
      --non-interactive \
      --keep-until-expiring \
      --cert-name "$CERT_NAME"; then
      docker exec itrade-nginx nginx -s reload
      echo "  ✅ Certificate issued/renewed and nginx reloaded"
    else
      if [ ! -s "$CERTS_BASE/live/$CERT_NAME/fullchain.pem" ]; then
        echo "  ▶ Restoring bootstrap certificate..."
        mkdir -p "$CERTS_BASE/live/$CERT_NAME"

        SAN_EXT=""
        for d in "${DOMAIN_LIST[@]}"; do
          if [ -z "$SAN_EXT" ]; then SAN_EXT="DNS:$d"; else SAN_EXT="$SAN_EXT,DNS:$d"; fi
        done

        openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
          -keyout "$CERTS_BASE/live/$CERT_NAME/privkey.pem" \
          -out "$CERTS_BASE/live/$CERT_NAME/fullchain.pem" \
          -subj "/CN=$CERT_NAME" \
          -addext "subjectAltName=$SAN_EXT" 2>&1 || \
        sudo openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
          -keyout "$CERTS_BASE/live/$CERT_NAME/privkey.pem" \
          -out "$CERTS_BASE/live/$CERT_NAME/fullchain.pem" \
          -subj "/CN=$CERT_NAME" \
          -addext "subjectAltName=$SAN_EXT" 2>&1 || true
      fi
      echo "  ⚠️  Certificate issuance failed (non-fatal, services running with self-signed cert)"
    fi
  fi
else
  echo "  ✅ Certificate is valid, skipping certbot"
fi

docker compose -f "$COMPOSE_FILE" up -d --no-build certbot

CRON_JOB="0 */12 * * * docker exec itrade-nginx nginx -s reload >> /var/log/nginx-reload.log 2>&1"
if ! crontab -l 2>/dev/null | grep -q "itrade-nginx nginx -s reload"; then
  (crontab -l 2>/dev/null || true; echo "# iTrade nginx SSL reload"; echo "$CRON_JOB") | crontab -
  echo "  ✅ Installed nginx reload cron"
fi

docker logout ghcr.io >/dev/null 2>&1 || true

DEPLOY_END=$(date +%s)

# ── Final status ─────────────────────────────────────────────
echo ""
echo "▶ Final container status:"
docker compose -f "$COMPOSE_FILE" ps

echo ""
echo "🎉 Deployment successful!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Total pipeline time:  $((DEPLOY_END - DEPLOY_START))s"
echo "  Image pre-pull:       $((PULL_END - PULL_START))s (zero downtime)"
echo "  Service downtime:     ~$((DOWNTIME_END - DOWNTIME_START))s"
echo "  Schema migration:     $((MIGRATION_END - MIGRATION_START))s"
echo "  Web health wait:      ${WEB_ELAPSED}s"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
