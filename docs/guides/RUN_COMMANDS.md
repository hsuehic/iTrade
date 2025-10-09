# 运行命令快速参考

## 必需的环境变量

在运行之前，确保设置以下环境变量或创建相应的 `.env` 文件：

```bash
# 数据库配置（对 Web 和 Console 都必需）
export DATABASE_HOST=localhost
export DATABASE_PORT=5432
export DATABASE_USER=postgres
export DATABASE_PASSWORD=your_password
export DATABASE_NAME=itrade
export DATABASE_SSL=false
```

## 数据库设置

### 1. 创建数据库

```bash
# 连接到 PostgreSQL
psql -U postgres

# 创建数据库
CREATE DATABASE itrade;

# 退出
\q
```

### 2. 同步数据库 Schema

```bash
# 方式 1: 使用 .env 文件（推荐）
cd packages/data-manager
# 编辑 .env 文件，设置数据库连接信息
pnpm exec tsx sync-scheme-to-db.ts

# 方式 2: 使用环境变量
cd packages/data-manager
DATABASE_HOST=localhost \
DATABASE_PORT=5432 \
DATABASE_USER=postgres \
DATABASE_PASSWORD=your_password \
DATABASE_NAME=itrade \
pnpm exec tsx sync-scheme-to-db.ts
```

## 安装依赖

```bash
# 在项目根目录
pnpm install
```

## 运行应用程序

### 启动 Web Manager

```bash
# 终端 1
cd apps/web

# 方式 1: 使用 .env.local 文件（推荐）
pnpm dev

# 方式 2: 使用环境变量
DATABASE_HOST=localhost \
DATABASE_PORT=5432 \
DATABASE_USER=postgres \
DATABASE_PASSWORD=your_password \
DATABASE_NAME=itrade \
pnpm dev
```

访问: http://localhost:3000

### 启动 Console Application

```bash
# 终端 2
cd apps/console

# 方式 1: 使用环境变量（推荐）
DATABASE_HOST=localhost \
DATABASE_PORT=5432 \
DATABASE_USER=postgres \
DATABASE_PASSWORD=your_password \
DATABASE_NAME=itrade \
pnpm dev

# 方式 2: 创建包装脚本
# 创建 run.sh:
#!/bin/bash
export DATABASE_HOST=localhost
export DATABASE_PORT=5432
export DATABASE_USER=postgres
export DATABASE_PASSWORD=your_password
export DATABASE_NAME=itrade
pnpm dev

# 然后运行:
chmod +x run.sh
./run.sh
```

## 开发流程

### 完整的启动流程

```bash
# 1. 启动数据库（如果未运行）
# macOS (使用 Homebrew)
brew services start postgresql@14

# Linux
sudo systemctl start postgresql

# 2. 创建并同步数据库（首次运行）
cd packages/data-manager
pnpm exec tsx sync-scheme-to-db.ts

# 3. 启动 Web Manager (终端 1)
cd apps/web
pnpm dev

# 4. 启动 Console (终端 2)
cd apps/console
DATABASE_HOST=localhost \
DATABASE_PORT=5432 \
DATABASE_USER=postgres \
DATABASE_PASSWORD=your_password \
DATABASE_NAME=itrade \
pnpm dev
```

### 构建生产版本

```bash
# 构建所有包
pnpm build

# 构建特定应用
cd apps/web
pnpm build

cd apps/console
pnpm build
```

## 故障排查

### 检查 PostgreSQL 状态

```bash
# macOS
brew services list | grep postgres

# Linux
sudo systemctl status postgresql

# 检查连接
psql -U postgres -c "SELECT version();"
```

### 检查数据库是否存在

```bash
psql -U postgres -l | grep itrade
```

### 测试数据库连接

```bash
psql -U postgres -d itrade -c "\dt"
```

### 查看日志

```bash
# Console 应用日志会直接输出到终端

# Web Manager 日志
# 查看浏览器控制台和终端输出
```

## 有用的 SQL 命令

```sql
-- 连接到数据库
\c itrade

-- 查看所有表
\dt

-- 查看策略
SELECT id, name, type, status, exchange, symbol FROM strategies;

-- 查看订单
SELECT id, symbol, side, type, status, "realizedPnl", "unrealizedPnl" FROM orders LIMIT 10;

-- 查看用户
SELECT id, name, email FROM users;

-- 清空表（小心使用！）
TRUNCATE strategies, orders CASCADE;
```

## 环境变量完整列表

### 必需的环境变量

```bash
# 数据库配置
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=postgres
DATABASE_PASSWORD=your_password
DATABASE_NAME=itrade
DATABASE_SSL=false
```

### 可选的环境变量

```bash
# Node 环境
NODE_ENV=development

# Web Manager
PORT=3000
BETTER_AUTH_SECRET=your-secret-key
BETTER_AUTH_URL=http://localhost:3000

# Binance API (如果需要交易)
BINANCE_API_KEY=your-api-key
BINANCE_SECRET_KEY=your-secret-key
```

## 快速测试

### 测试 Web Manager

1. 访问 http://localhost:3000
2. 注册/登录
3. 导航到 `/strategy`
4. 创建一个测试策略
5. 启动策略
6. 导航到 `/analytics` 查看数据

### 测试 Console

1. 启动 Console
2. 查看日志输出，应该看到：
   - "Database connected"
   - "Strategy Manager started"
   - "Loading X active strategies"
3. 在 Web UI 中启动/停止策略
4. 观察 Console 日志中的变化

## 常用命令

```bash
# 重新安装依赖
pnpm install --force

# 清理构建输出
pnpm clean

# 类型检查
pnpm type-check

# Linting
pnpm lint

# 重新构建包
cd packages/data-manager
pnpm build
```

## 生产部署

### 环境变量设置

在生产环境中，使用环境变量而不是 `.env` 文件：

```bash
# 设置系统环境变量
export DATABASE_HOST=your-prod-host
export DATABASE_PORT=5432
export DATABASE_USER=your-prod-user
export DATABASE_PASSWORD=your-prod-password
export DATABASE_NAME=itrade
export DATABASE_SSL=true
export NODE_ENV=production
```

### 构建和运行

```bash
# 构建
pnpm build

# 运行 Web Manager
cd apps/web
pnpm start

# 运行 Console
cd apps/console
node dist/main.js
```

## 备份和恢复

### 备份数据库

```bash
pg_dump -U postgres itrade > backup.sql
```

### 恢复数据库

```bash
psql -U postgres itrade < backup.sql
```

## 下一步

- 阅读 [QUICK_START.md](./QUICK_START.md) 获取详细的设置指南
- 阅读 [STRATEGY_MANAGEMENT_GUIDE.md](./STRATEGY_MANAGEMENT_GUIDE.md) 了解功能详情
- 阅读 [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) 了解技术实现

---

💡 **提示**: 将常用的环境变量设置保存到 shell 配置文件（如 `~/.bashrc` 或 `~/.zshrc`）中，这样每次打开新终端时都会自动加载。

