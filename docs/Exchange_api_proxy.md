# Exchange API Proxy

## Websock & rest api

```nginx
# =========================
# Coinbase Advanced public WebSocket
# 访问格式：
# wss://itrade.ihsueh.com/ws/coinbase/advanced
# =========================
location /ws/coinbase/advanced {
    rewrite ^/ws/coinbase/advanced(.*)$ $1 break;

    proxy_pass https://advanced-trade-ws.coinbase.com;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host advanced-trade-ws.coinbase.com;
    proxy_set_header Origin https://advanced-trade.coinbase.com;
    proxy_ssl_server_name on;
    proxy_ssl_name advanced-trade-ws.coinbase.com;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_buffering off;
}

# =========================
# Coinbase Advanced User WebSocket
# 访问格式：
# wss://itrade.ihsueh.com/ws/coinbase/advanced-user
# =========================
location /ws/coinbase/advanced-user {
    rewrite ^/ws/coinbase/advanced-user(.*)$ $1 break;

    proxy_pass https://advanced-trade-ws-user.coinbase.com;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host advanced-trade-ws-user.coinbase.com;
    proxy_set_header Origin https://advanced-trade.coinbase.com;
    proxy_ssl_server_name on;
    proxy_ssl_name advanced-trade-ws-user.coinbase.com;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_buffering off;
}

# =========================
# Coinbase advanced REST API 代理
# 访问格式：
# https://itrade.ihsueh.com/rest/coinbase/api/v3/brokerage/accounts...
# =========================
location /rest/coinbase {
    rewrite ^/rest/coinbase/(.*)$ /$1 break;
    proxy_pass https://api.coinbase.com;
    proxy_http_version 1.1;
    proxy_set_header Host api.coinbase.com;
    proxy_ssl_server_name on;
    proxy_ssl_name api.coinbase.com;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 10s;
    proxy_read_timeout 30s;
    proxy_buffering off;
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Origin, Content-Type, Accept, Authorization' always;
}

# =========================
# Coinbase Exchange Public WebSocket
# 访问格式：
# wss://itrade.ihsueh.com/ws/coinbase-exchange
# =========================
location /ws/coinbase-exchange {
    rewrite ^/ws/coinbase-exchange(.*)$ $1 break;

    proxy_pass https://ws-feed.exchange.coinbase.com;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host ws-feed.exchange.coinbase.com;
    proxy_set_header Origin https://exchange.coinbase.com;
    proxy_ssl_server_name on;
    proxy_ssl_name ws-feed.exchange.coinbase.com;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_buffering off;
}

# =========================
# Coinbase Exchange REST API (Public)
# 访问格式：
# https://itrade.ihsueh.com/rest/coinbase-exchange/products
# =========================
location /rest/coinbase-exchange {
    rewrite ^/rest/coinbase-exchange/(.*)$ /$1 break;
    proxy_pass https://api.exchange.coinbase.com;
    proxy_http_version 1.1;
    proxy_set_header Host api.exchange.coinbase.com;
    proxy_ssl_server_name on;
    proxy_ssl_name api.exchange.coinbase.com;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 10s;
    proxy_read_timeout 30s;
    proxy_buffering off;
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Origin, Content-Type, Accept, Authorization' always;
}

# =========================
# OKX REST API 代理
# 访问格式：
# https://itrade.ihsueh.com/rest/okx/api/v5/...
# =========================
location /rest/okx {

    rewrite ^/rest/okx/(.*)$ /$1 break;

    proxy_pass https://www.okx.com;

    proxy_http_version 1.1;
    proxy_set_header Host www.okx.com;
    proxy_ssl_server_name on;
    proxy_ssl_name www.okx.com;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_connect_timeout 10s;
    proxy_read_timeout 30s;

    proxy_buffering off;

    # CORS 支持
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Origin, Content-Type, Accept, Authorization' always;
}

# =========================
# Binance Spot REST API
# 访问格式：
# https://itrade.ihsueh.com/rest/binance/spot/api/v3/...
# =========================
location /rest/binance/spot {

    rewrite ^/rest/binance/spot/(.*)$ /$1 break;

    proxy_pass https://api.binance.com;

    proxy_http_version 1.1;
    proxy_set_header Host api.binance.com;
    proxy_ssl_server_name on;
    proxy_ssl_name api.binance.com;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_connect_timeout 10s;
    proxy_read_timeout 30s;

    proxy_buffering off;
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Origin, Content-Type, Accept, Authorization' always;
}

# =========================
# Binance Perp (USDT-M Futures) REST API
# 访问格式：
# https://itrade.ihsueh.com/rest/binance/perp/fapi/v1/...
# =========================
location /rest/binance/perp {

    rewrite ^/rest/binance/perp/(.*)$ /$1 break;

    proxy_pass https://fapi.binance.com;

    proxy_http_version 1.1;
    proxy_set_header Host fapi.binance.com;
    proxy_ssl_server_name on;
    proxy_ssl_name fapi.binance.com;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_connect_timeout 10s;
    proxy_read_timeout 30s;

    proxy_buffering off;
    add_header 'Access-Control-Allow-Origin' '*' always;
    add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS' always;
    add_header 'Access-Control-Allow-Headers' 'Origin, Content-Type, Accept, Authorization' always;
}

# =========================
# OKX Public WebSocket
# wss://itrade.ihsueh.com/ws/okx/ws/v5/public?brokerId=9999
# =========================
location ^~ /ws/okx/ {
    rewrite ^/ws/okx(.*)$ $1 break;

    proxy_pass https://ws.okx.com;

    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    proxy_set_header Host ws.okx.com;
    proxy_ssl_server_name on;
    proxy_ssl_name ws.okx.com;

    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;

    proxy_buffering off;
}
    # =========================
    # Binance Spot WebSocket
    # 访问格式：
    # wss://itrade.ihsueh.com/ws/binance/spot/ws/btcusdt@trade
    # =========================
    location /ws/binance/spot {

        rewrite ^/ws/binance/spot(.*)$ $1 break;

        proxy_pass https://stream.binance.com;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host stream.binance.com;
        proxy_ssl_server_name on;
        proxy_ssl_name stream.binance.com;

        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;

        proxy_buffering off;
    }

    # =========================
    # Binance Perpetual (USDT-M Futures)
    # 访问格式：
    # wss://itrade.ihsueh.com/ws/binance/perp/ws/btcusdt@markPrice
    # =========================
    location /ws/binance/perp {

        rewrite ^/ws/binance/perp(.*)$ $1 break;

        proxy_pass https://fstream.binance.com;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_set_header Host fstream.binance.com;
        proxy_ssl_server_name on;
        proxy_ssl_name fstream.binance.com;

        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;

        proxy_buffering off;
    }
```
