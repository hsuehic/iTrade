# iTrade GCE 部署指南

本文档说明如何将 `apps/console`（交易引擎）和 `apps/web`（Web 管理界面）通过 Docker Compose 部署到 Google Compute Engine，并配置 GitHub Actions 实现自动部署。

---

## 目录

1. [架构概览](#架构概览)
2. [前置条件](#前置条件)
3. [第一步：创建 GCE 实例](#第一步创建-gce-实例)
4. [第二步：初始化 GCE 环境](#第二步初始化-gce-环境)
5. [第三步：配置环境变量](#第三步配置环境变量)
6. [第四步：首次手动部署](#第四步首次手动部署)
7. [第五步：配置 GitHub Actions 自动部署](#第五步配置-github-actions-自动部署)
8. [第六步：（可选）启用 HTTPS](#第六步可选启用-https)
9. [日常操作参考](#日常操作参考)
10. [数据库同步（本地 → GCE）](#数据库同步本地--gce)
11. [数据库备份（GCE → 本地）](#数据库备份gce--本地)
12. [故障排查](#故障排查)

---

## 架构概览

```
GCE VM
└── Docker Compose (docker-compose.prod.yml)
    ├── postgres:16-alpine   ← 数据库（仅内网，不暴露端口）
    ├── schema-migrator      ← 一次性 init 容器，负责同步 DB schema
    ├── itrade-console       ← 交易引擎 (Node.js + ts-node)
    ├── itrade-web           ← Web 应用 (Next.js, 内网 port 3002)
    └── nginx                ← 反向代理 (对外 port 80 / 443)
```

**启动顺序**：`db (healthy)` → `schema-migrator (completed)` → `console + web` → `nginx`

**环境变量策略**：所有 secret 存放在 GCE 本地 `/opt/itrade/.env.*`，通过 `env_file` 注入容器，不进入镜像，不上传 GitHub。

---

## 数据库 Schema 管理说明

### 首次安装会自动初始化 schema 吗？

**会**。`docker-compose.prod.yml` 包含一个 `schema-migrator` 初始化容器，它在 `db` 健康后运行，执行 `packages/data-manager/sync-schema-to-db.ts`（TypeORM `synchronize: true`），自动创建所有表、索引和外键关系，完成后退出。

### 每次 GitHub Actions 部署会更新 schema 吗？

**会**。每次部署时 `schema-migrator` 都会重新运行。TypeORM 的行为是：

- 如果表/列不存在 → 创建（`CREATE TABLE` / `ALTER TABLE ADD COLUMN`）
- 如果表/列已存在且结构相同 → **no-op**（不做任何操作，安全）
- 如果列被删除（entity 里移除了字段）→ TypeORM **不会自动删除**列（需手动迁移）

因此每次部署都运行是安全的，不会破坏现有数据。

### 每次部署 PostgreSQL 数据会保留吗？

**会**。数据存储在 Docker named volume `postgres_data`，与容器镜像完全分离：

```
docker compose up -d --build    # ✅ 重建镜像，数据保留
docker compose restart          # ✅ 重启容器，数据保留
docker compose down             # ✅ 停止并删除容器，数据保留
docker compose down -v          # ❌ 危险！-v 会删除 volume，数据丢失
```

---

## 前置条件

- Google Cloud 账号，已开通 Compute Engine API
- GitHub 仓库已推送最新代码
- 本地安装 `gcloud` CLI（用于创建实例，可选）

---

## 第一步：创建 GCE 实例

### 推荐规格

| 项目 | 推荐值 |
|------|--------|
| 机器类型 | `e2-medium`（2 vCPU / 4 GB RAM） |
| 操作系统 | Debian 12 (Bookworm) |
| 磁盘 | 30 GB SSD（`pd-ssd`） |
| 区域 | 选择离用户最近的区域 |
| 网络标签 | `http-server`, `https-server` |

### 通过 gcloud CLI 创建

```bash
gcloud compute instances create itrade-prod \
  --zone=asia-east1-b \
  --machine-type=e2-medium \
  --image-family=debian-12 \
  --image-project=debian-cloud \
  --boot-disk-size=30GB \
  --boot-disk-type=pd-ssd \
  --tags=http-server,https-server
```

### 开放防火墙规则

```bash
# 如果尚未存在默认 HTTP/HTTPS 规则
gcloud compute firewall-rules create allow-http \
  --allow tcp:80 --target-tags=http-server

gcloud compute firewall-rules create allow-https \
  --allow tcp:443 --target-tags=https-server
```

---

## 第二步：初始化 GCE 环境

SSH 进入 GCE 实例后，运行项目提供的一键初始化脚本。

### 2.1 SSH 到实例

```bash
gcloud compute ssh itrade-prod --zone=asia-east1-b
# 或直接用 IP：
ssh your_username@<GCE_EXTERNAL_IP>
```

### 2.2 将初始化脚本上传到 GCE

**方式 A**：通过 gcloud scp 上传

```bash
# 在本地执行
gcloud compute scp deploy/setup-gce.sh itrade-prod:/tmp/setup-gce.sh --zone=asia-east1-b
```

**方式 B**：直接在 GCE 上通过 curl 获取（仓库需为 public，或用 token）

```bash
# 在 GCE 上执行
curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/iTrade/main/deploy/setup-gce.sh -o /tmp/setup-gce.sh
```

### 2.3 执行初始化脚本

```bash
# 在 GCE 上执行
export REPO_URL=https://github.com/YOUR_ORG/iTrade.git
chmod +x /tmp/setup-gce.sh
/tmp/setup-gce.sh
```

脚本会自动完成以下工作：

- 安装 Docker 和 Docker Compose 插件
- 创建 `/opt/itrade/` 目录结构
- 克隆仓库到 `/opt/itrade/app`
- 从模板创建 `/opt/itrade/.env.*` 文件（待填写）
- 配置 UFW 防火墙（开放 22/80/443）
- 生成 SSH 部署密钥对（供 GitHub Actions 使用）
- 打印公钥和私钥（⚠️ 请立即保存私钥）

---

## 第三步：配置环境变量

初始化脚本执行后，会在 `/opt/itrade/` 目录创建三个环境文件。逐一编辑填入真实值。

### 3.1 数据库环境变量

```bash
vim /opt/itrade/.env.db
```

```dotenv
POSTGRES_USER=itrade
POSTGRES_PASSWORD=<强密码，建议 openssl rand -hex 16>
POSTGRES_DB=itrade
```

### 3.2 Console（交易引擎）环境变量

```bash
vim /opt/itrade/.env.console
```

关键字段：

```dotenv
# 数据库 — 使用 Docker 服务名 'db'，不要用 localhost
DB_HOST=db
DB_PORT=5432
DB_USER=itrade
DB_PASSWORD=<与 .env.db 中 POSTGRES_PASSWORD 保持一致>
DB_DB=itrade

# 加密密钥 — 生成：openssl rand -hex 32
ENCRYPTION_KEY=<32字节随机十六进制>

# 轮询间隔（毫秒）
BOT_REFRESH_INTERVAL_MS=60000
ACCOUNT_POLLING_INTERVAL=60000
STRATEGY_SYNC_INTERVAL_MS=60000
OPEN_ORDERS_SYNC_INTERVAL=60000
```

> 完整字段参见 `deploy/env.console.template`。

### 3.3 Web 应用环境变量

```bash
vim /opt/itrade/.env.web
```

关键字段：

```dotenv
NODE_ENV=production
BUILD_MODE=prod

# 数据库 — 同样使用服务名 'db'
DB_HOST=db
DB_PASSWORD=<与 .env.db 一致>

# Auth secret — 生成：openssl rand -hex 32
BETTER_AUTH_SECRET=<32字节随机十六进制>
BETTER_AUTH_URL=https://your-domain.com

# Google OAuth
GOOGLE_CLIENT_ID=<Google Cloud Console 获取>
GOOGLE_CLIENT_SECRET=<Google Cloud Console 获取>
```

> 完整字段参见 `deploy/env.web.template`。

---

## 第四步：首次手动部署

```bash
# 在 GCE 上执行
cd /opt/itrade/app

# 构建镜像并启动所有服务（首次构建约 5-10 分钟）
docker compose -f docker-compose.prod.yml up -d --build

# 查看启动状态
docker compose -f docker-compose.prod.yml ps

# 实时查看日志
docker compose -f docker-compose.prod.yml logs -f
```

### 验证服务状态

```bash
# 检查所有容器是否 healthy/running
docker compose -f docker-compose.prod.yml ps

# 检查 Web 是否可访问
curl -I http://localhost  # 应返回 200

# 检查数据库是否 ready
docker exec itrade-db pg_isready -U itrade
```

---

## 第五步：配置 GitHub Actions 自动部署

### 5.1 获取 SSH 密钥

`setup-gce.sh` 执行时会生成并打印密钥对。如需重新查看：

```bash
# 在 GCE 上执行
cat ~/.ssh/id_ed25519_gce_deploy        # 私钥 → 用于 GitHub Secret
cat ~/.ssh/id_ed25519_gce_deploy.pub    # 公钥 → 需加入 authorized_keys
```

确保公钥已加入 GCE 的 authorized_keys：

```bash
cat ~/.ssh/id_ed25519_gce_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

### 5.2 在 GitHub 仓库添加 Secrets

进入 GitHub 仓库 → **Settings → Secrets and variables → Actions → New repository secret**，添加以下三个 secret：

| Secret 名称 | 值说明 |
|-------------|--------|
| `GCE_HOST` | GCE 实例的外部 IP 地址（或绑定的域名） |
| `GCE_USER` | GCE 上的 SSH 用户名（如 `xiaowei_xue`） |
| `GCE_SSH_PRIVATE_KEY` | `~/.ssh/id_ed25519_gce_deploy` 私钥的完整内容（含 `-----BEGIN...` 和 `-----END...`） |

### 5.3 验证 GitHub Actions 配置

推送任意 commit 到 `main` 分支：

```bash
git push origin main
```

进入 GitHub 仓库 → **Actions** 标签页，查看 `Deploy to GCE` 工作流执行情况。

### 5.4 手动触发部署（强制重建）

如需强制重建所有镜像（清除缓存）：

1. 进入 **Actions → Deploy to GCE → Run workflow**
2. 勾选 `Force rebuild all Docker images (no cache)`
3. 点击 **Run workflow**

### 5.5 工作流程说明

```
push to main
    │
    ▼
GitHub Actions Runner (ubuntu-latest)
    │
    ├─ Checkout 代码（获取 commit SHA 用于日志）
    ├─ 配置 SSH Agent（注入私钥）
    ├─ 将 GCE 加入 known_hosts
    │
    └─ SSH 到 GCE 执行：
        ├─ git fetch && git reset --hard origin/main
        ├─ docker compose build
        ├─ docker compose up -d
        ├─ docker image prune -f（清理旧镜像）
        └─ docker compose ps（打印状态）
```

---

## 第六步：（可选）启用 HTTPS

> **前提**：域名 DNS A 记录已指向 GCE 外网 IP，且已填好 `/opt/itrade/.env.certbot`（`DOMAIN` 和 `CERTBOT_EMAIL`）。

整个 HTTPS 初始化流程由 `deploy/certbot-init.sh` 一键完成，**无需任何手动操作**：

```bash
cd /opt/itrade/app
bash deploy/certbot-init.sh
```

该脚本自动完成以下步骤：

1. 从 `/opt/itrade/.env.certbot` 读取域名和邮箱
2. 创建证书目录 `/opt/itrade/certbot/certs` 和 webroot 目录
3. 生成临时自签名证书，让 nginx 先能以 HTTPS 模式启动
4. 根据 `deploy/nginx.conf.template` 生成 `/opt/itrade/nginx.conf`（自动替换域名）
5. 启动 Docker Compose 服务栈（db、web、console、nginx）
6. 在 Docker 容器内运行 certbot，通过 ACME HTTP-01 验证获取真实的 Let's Encrypt 证书
7. 重载 nginx，切换到真实证书
8. 安装系统 cron，每 12 小时重载 nginx 以加载续期后的新证书

**证书自动续期**：`docker-compose.prod.yml` 中的 `certbot` 服务每 12 小时自动检查并续期（证书到期前 30 天开始续期），全程无需人工干预。

---

## 日常操作参考

### 查看日志

```bash
cd /opt/itrade/app

# 全部服务
docker compose -f docker-compose.prod.yml logs -f

# 单个服务
docker compose -f docker-compose.prod.yml logs -f console
docker compose -f docker-compose.prod.yml logs -f web
docker compose -f docker-compose.prod.yml logs -f db
```

### 重启单个服务

```bash
docker compose -f docker-compose.prod.yml restart console
docker compose -f docker-compose.prod.yml restart web
```

### 手动更新部署

```bash
cd /opt/itrade/app
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build
```

### 数据库备份

```bash
# 备份
docker exec itrade-db pg_dump -U itrade itrade > /opt/itrade/backup_$(date +%Y%m%d).sql

# 恢复
docker exec -i itrade-db psql -U itrade itrade < /opt/itrade/backup_YYYYMMDD.sql
```

### 完全停止所有服务

```bash
docker compose -f docker-compose.prod.yml down
# 注意：不加 -v 不会删除 postgres_data 数据卷
```

---

## 数据库同步（本地 → GCE）

将本地 Docker PostgreSQL 数据同步到 GCE 生产数据库，适用于以下场景：

- **首次上线**：用本地已有的策略、账户等数据初始化生产库
- **手动迁移**：本地调试好数据后推送到 GCE

> ⚠️ **注意**：此操作会**覆盖** GCE 数据库中的所有数据，执行前请确认。

### 工具脚本

项目提供 `deploy/db-sync.sh` 脚本，支持**双向同步**：

| 方向 | 命令 | 说明 |
|------|------|------|
| 本地 → GCE | `sync` | 导出本地 → 上传 → 导入 GCE（一键） |
| GCE → 本地 | `pull` | 下载 GCE → 恢复到本地容器（一键） |

`sync` 自动完成以下步骤：

1. `pg_dump` 导出本地数据库（压缩格式）
2. `scp` 将 dump 文件传输到 GCE
3. SSH 到 GCE，`pg_restore` 恢复数据（`--clean --if-exists` 模式，无需停服）
4. 清理本地和远程的临时 dump 文件

### 前置条件

| 要求 | 说明 |
|------|------|
| 本地安装 `pg_dump` | macOS：`brew install libpq`，并将 `pg_dump` 加入 PATH |
| SSH 可免密登录 GCE | `ssh your_user@<GCE_IP>` 不需要输入密码 |
| GCE 上 PostgreSQL 容器正在运行 | `docker ps \| grep itrade-db` |

### 10.1 配置连接信息

从模板创建本地配置文件（**此文件已加入 `.gitignore`，不会被提交**）：

```bash
cp deploy/env.gce.template .env.gce
```

编辑 `.env.gce`，填入实际值：

```dotenv
# GCE 连接信息
GCE_HOST=<GCE 外部 IP 或域名>
GCE_USER=<GCE SSH 用户名>

# GCE 上 PostgreSQL 连接信息（与 /opt/itrade/.env.db 保持一致）
DB_USER=itrade
DB_PASSWORD=<GCE 数据库密码>
DB_DB=itrade
```

### 10.2 配置本地数据库连接

`db-sync.sh` 默认读取以下本地变量（如与你的本地配置不同，请在 `.env.gce` 中覆盖）：

```dotenv
# 本地 PostgreSQL（可选，默认值如下）
LOCAL_DB_HOST=localhost
LOCAL_DB_PORT=5432
LOCAL_DB_USER=itrade_user
LOCAL_DB_PASSWORD=your_db_password
LOCAL_DB_NAME=itrade_db
```

### 10.3 执行同步（本地 → GCE）

```bash
# 在项目根目录执行（一键完成 export + upload + import）
bash deploy/db-sync.sh sync
```

也可以分步执行：

```bash
bash deploy/db-sync.sh export   # 1. 仅导出本地 DB 到 /tmp/itrade_db_<ts>.dump
bash deploy/db-sync.sh upload   # 2. 仅上传 dump 到 GCE
bash deploy/db-sync.sh import   # 3. 仅在 GCE 上恢复（会提示确认）
```

示例输出：

```
▶ Local  container : itrade-db
▶ Local  database  : itrade  (user: itrade_user)
▶ Exporting local database 'itrade' from container 'itrade-db'...
▶ ✅ Export complete: /tmp/itrade_db_20260316_120000.dump (2.1M)
▶ Uploading /tmp/itrade_db_20260316_120000.dump → your_user@34.x.x.x:/tmp/itrade_db_import.dump ...
▶ ✅ Upload complete.
▶ Remote container : itrade-db  (your_user@34.x.x.x)
▶ Remote database  : itrade  (user: itrade_user)
⚠  ⚠️  This will REPLACE all data in the GCE database 'itrade'.
   Existing GCE data will be overwritten. Are you sure? (yes/no)
yes
▶ Importing dump into GCE container 'itrade-db' ...
▶ ✅ GCE database restored from local dump.
```

### 10.4 验证同步结果

```bash
# 查看 GCE 数据库中的表
ssh your_user@<GCE_IP> \
  "docker exec itrade-db psql -U itrade itrade -c '\dt'"

# 查看各表记录数
ssh your_user@<GCE_IP> \
  "docker exec itrade-db psql -U itrade itrade -c \
   'SELECT schemaname, tablename, n_live_tup AS rows FROM pg_stat_user_tables ORDER BY rows DESC;'"
```

### 注意事项

- **无需停服**：`import` 使用 `pg_restore --clean --if-exists` 模式，直接在运行中的数据库上替换数据，GCE 服务不需要重启
- **数据方向**：`sync` / `export` / `upload` / `import` 均为本地 → GCE 方向；GCE → 本地请见下一节
- **密钥安全**：`.env.gce` 文件已加入 `.gitignore`，切勿手动提交到仓库
- **pg_dump 版本**：本地 `pg_dump` 版本建议与 GCE PostgreSQL 版本一致（均为 16），版本差异过大可能导致恢复失败

---

## 数据库备份（GCE → 本地）

将 GCE 生产数据库下载到本地，适用于以下场景：

- **定期备份**：将生产数据保存到本地，防止数据丢失
- **本地调试**：把线上真实数据拉到本地复现问题
- **迁移恢复**：GCE 实例故障时，利用本地备份快速重建

### 命令概览

| 命令 | 作用 |
|------|------|
| `pull` | 一键：下载 GCE DB + 恢复到本地容器 |
| `download` | 仅下载：SSH 到 GCE 导出，scp 到本地 `/tmp/itrade_db_gce_<ts>.dump` |
| `restore-local` | 仅恢复：将已下载的 dump 还原到本地容器 |

### 前置条件

与「本地 → GCE」相同，需已配置 `.env.gce`（参见 [10.1 配置连接信息](#101-配置连接信息)）。

### 11.1 一键下载并恢复到本地

```bash
# 在项目根目录执行
bash deploy/db-sync.sh pull
```

执行过程：

```
▶ Starting full pull: GCE → local

▶ Remote container : itrade-db  (your_user@34.x.x.x)
▶ Remote database  : itrade  (user: itrade_user)
▶ Dumping GCE database 'itrade' from container 'itrade-db'...
▶ Downloading dump → /tmp/itrade_db_gce_20260316_120000.dump ...
▶ ✅ Download complete: /tmp/itrade_db_gce_20260316_120000.dump (2.3M)

▶ Local  container : itrade-db
▶ Local  database  : itrade  (user: itrade_user)
⚠  ⚠️  This will REPLACE all data in the LOCAL database 'itrade'.
   Source dump: /tmp/itrade_db_gce_20260316_120000.dump
   Are you sure? (yes/no)
yes
▶ Copying dump into local container 'itrade-db'...
▶ Terminating existing connections to 'itrade'...
▶ Restoring database 'itrade' in local container...
▶ ✅ Local database restored from GCE dump.
```

### 11.2 仅下载（不恢复）

如果只想获取 dump 文件用于存档，不需要立即恢复到本地：

```bash
bash deploy/db-sync.sh download

# dump 文件保存在：/tmp/itrade_db_gce_<timestamp>.dump
```

指定自定义保存路径：

```bash
DOWNLOAD_FILE=~/backups/itrade_prod_$(date +%Y%m%d).dump \
  bash deploy/db-sync.sh download
```

### 11.3 从已下载的 dump 恢复到本地

```bash
# 自动使用最新的 /tmp/itrade_db_gce_*.dump
bash deploy/db-sync.sh restore-local

# 或指定特定 dump 文件
DOWNLOAD_FILE=~/backups/itrade_prod_20260316.dump \
  bash deploy/db-sync.sh restore-local
```

### 11.4 验证恢复结果

```bash
# 查看本地数据库中的表
docker exec itrade-db psql -U itrade_user itrade -c '\dt'

# 查看各表记录数
docker exec itrade-db psql -U itrade_user itrade -c \
  'SELECT tablename, n_live_tup AS rows FROM pg_stat_user_tables ORDER BY rows DESC;'
```

### 注意事项

- **本地数据将被覆盖**：`restore-local` 会清空本地库后重新导入，脚本执行前会提示确认
- **仅下载不影响本地**：`download` 只保存 dump 文件，不会修改本地数据库
- **GCE 生产库不受影响**：整个 pull / download 过程对 GCE 生产库和服务均为只读操作
- **dump 文件存储在 `/tmp/`**：系统重启后会自动清理，如需长期保留请用 `DOWNLOAD_FILE` 指定持久路径

---

## 本地测试部署步骤（推荐）

在推送到 GitHub Actions 之前，建议先在本地测试部署步骤，这样可以提前发现并修复问题。

### 快速开始

运行所有测试：

```bash
bash deploy/test-local.sh
```

### 测试内容

1. **Web Docker 镜像构建** - 测试 web 应用的 Docker 构建过程
2. **Console Docker 镜像构建** - 测试 console 应用的 Docker 构建过程
3. **Certbot 脚本验证** - 验证 SSL 证书初始化脚本
4. **环境同步脚本验证** - 验证环境变量同步脚本
5. **Docker Compose 配置验证** - 验证生产环境 docker-compose 配置

### 详细文档

完整的本地测试指南请参考：[本地部署测试指南](../guides/LOCAL_DEPLOYMENT_TESTING.md)

---

## 故障排查

### 容器无法启动

```bash
# 查看详细错误
docker compose -f docker-compose.prod.yml logs console
docker compose -f docker-compose.prod.yml logs web
```

### 数据库连接失败

```bash
# 确认 .env.console 和 .env.web 中 DB_HOST=db（不是 localhost）
# 确认数据库密码与 .env.db 中 POSTGRES_PASSWORD 一致
docker exec itrade-db pg_isready -U itrade
```

### GitHub Actions SSH 连接失败

```bash
# 检查 GCE 上 authorized_keys 是否包含公钥
cat ~/.ssh/authorized_keys

# 检查 SSH 服务是否允许密钥登录
sudo grep -E "PubkeyAuthentication|AuthorizedKeysFile" /etc/ssh/sshd_config
```

### Next.js 构建失败（镜像内）

Next.js 构建时需要某些环境变量（如 `BETTER_AUTH_URL`）。如果 build 阶段报错找不到环境变量，在 `apps/web/Dockerfile` 的 builder stage 中添加对应的 `ARG` 和 `--build-arg`，或使用 `.env.build` 文件仅提供构建时占位值。

### 磁盘空间不足

```bash
# 清理未使用的 Docker 资源
docker system prune -af --volumes
```

---

Author: <xiaoweihsueh@gmail.com>  
Date: March 16, 2026
