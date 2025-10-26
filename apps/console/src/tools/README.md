# 工具脚本 (Tools)

实用工具脚本集合，用于系统初始化、诊断、维护和监控。

## 📂 工具列表

```
tools/
├── init-history.ts      # 初始化历史账户数据
├── cron.ts              # 账户轮询定时任务
├── diagnose-auth.ts     # API 认证诊断工具
└── get-current-ip.ts    # 获取当前公网 IP
```

## 🛠️ 工具详解

### 1️⃣ 初始化历史数据 (`init-history.ts`)

**用途：**  
首次运行时，从所有配置的交易所获取当前账户数据，并创建初始快照保存到数据库。

**功能：**
- 连接所有配置的交易所（Binance, OKX, Coinbase）
- 获取当前账户余额
- 获取当前持仓信息
- 保存为初始历史快照
- 用于后续的历史数据追踪和分析

**运行命令：**
```bash
npm run tool:init-history

# 或直接运行（推荐，使用调试器配置）
cd apps/console && \
NODE_ENV=development \
TS_NODE_PROJECT=tsconfig.build.json \
TS_NODE_FILES=true \
NODE_OPTIONS="--conditions=source" \
node -r ts-node/register \
     -r tsconfig-paths/register \
     -r reflect-metadata \
     src/tools/init-history.ts
```

**输出示例：**
```
🚀 Initializing Historical Account Snapshots...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 Step 1: Initialize Database
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Database connected

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 Step 2: Initialize Exchanges
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Binance Exchange initialized
✅ OKX Exchange initialized
✅ Coinbase Exchange initialized

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 Step 3: Fetch Current Account Data
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 Binance Account:
  💰 Balances: 15 assets
     USDT: 10000.00
     BTC: 0.5
  📈 Positions: 2 positions
     BTC/USDT:USDT LONG 0.1 @ $95000

📊 OKX Account:
  💰 Balances: 8 assets
  📈 Positions: 0 positions

📊 Coinbase Account:
  💰 Balances: 5 assets
  📈 Positions: 0 positions

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 Step 4: Save Initial Snapshots
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Saved binance snapshot: 15 balances, 2 positions
✅ Saved okx snapshot: 8 balances, 0 positions
✅ Saved coinbase snapshot: 5 balances, 0 positions

✅ Historical data initialization completed!
```

**何时使用：**
- ⚠️ **首次设置系统时运行一次**
- 重置历史数据时
- 添加新交易所后

**注意事项：**
- 需要有效的 API 凭证
- 确保所有交易所配置正确
- 建议在低流量时段运行

---

### 2️⃣ 账户轮询定时任务 (`cron.ts`)

**用途：**  
持续轮询所有交易所的账户数据，定期保存快照用于历史追踪和分析。

**功能：**
- 定期轮询账户余额
- 定期轮询持仓信息
- 自动保存快照到数据库
- 支持配置轮询间隔
- 优雅处理错误和重试

**运行命令：**
```bash
npm run cron

# 或直接运行
npx tsx src/tools/cron.ts
```

**配置（.env）：**
```bash
# 轮询间隔（毫秒）
# 默认: 60000 (1 分钟)
ACCOUNT_POLLING_INTERVAL=60000
```

**输出示例：**
```
🚀 Initializing Account Polling Cron Job...

✅ Database initialized
✅ Binance Exchange initialized
✅ OKX Exchange initialized
✅ Coinbase Exchange initialized

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 Account Polling Service Started
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Polling Interval: 60 seconds
Exchanges: binance, okx, coinbase

Press Ctrl+C to stop

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 [2025-10-26 10:00:00] Polling Cycle #1

binance:
  ✅ Balances: 15
  ✅ Positions: 2

okx:
  ✅ Balances: 8
  ✅ Positions: 0

coinbase:
  ✅ Balances: 5
  ✅ Positions: 0

✅ Polling completed in 1.5s

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

... (continues polling)
```

**何时使用：**
- ⚠️ **在运行 `init-history.ts` 之后**
- 需要持续追踪账户变化时
- 用于历史数据分析和报告
- 作为后台服务持续运行

**部署建议：**
```bash
# 使用 PM2 管理进程
pm2 start "npm run cron" --name itrade-cron

# 查看日志
pm2 logs itrade-cron

# 停止服务
pm2 stop itrade-cron
```

---

### 3️⃣ API 认证诊断工具 (`diagnose-auth.ts`)

**用途：**  
帮助诊断 Binance API 401 认证错误的具体原因。

**功能：**
- ✅ 环境变量检查
- ✅ 时钟同步检查（NTP）
- ✅ 签名算法验证
- ✅ API Key 有效性验证
- ✅ 权限检查
- ✅ IP 白名单检查（推断）
- ✅ 网络连接测试
- ✅ 详细的诊断报告

**运行命令：**
```bash
npm run tool:diagnose-auth

# 或直接运行
npx tsx src/tools/diagnose-auth.ts
```

**输出示例：**
```
🔍 Binance API Authentication Diagnostic Tool

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 Running Diagnostics...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Environment Variables: Found
✅ Clock Sync: Within acceptable range (offset: 45ms)
✅ API Key Format: Valid
✅ Signature Algorithm: HMAC-SHA256 working correctly
⚠️  API Key Validity: Cannot verify (401 Unauthorized)
❌ Account Access: 401 Unauthorized

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Diagnostic Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Tests Passed: 4/7
Tests Failed: 2/7
Tests Warning: 1/7

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 Recommended Actions
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Based on the diagnostics, here's what you should check:

1. ❌ API Key Permissions
   - Verify "Enable Reading" is checked
   - Verify "Enable Spot & Margin Trading" is checked
   - Binance Console: https://www.binance.com/en/my/settings/api-management

2. ⚠️  IP Whitelist
   - Check if IP whitelist is enabled
   - Add your current IP to whitelist
   - Or temporarily set to "Unrestricted" for testing
   - Use tool:get-ip to find your IP

3. ✅ Timestamp & Signature
   - Your timestamp and signature are correct

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**何时使用：**
- 遇到 401 Unauthorized 错误时
- API Key 配置后验证
- 排查认证问题
- 系统部署后验证

**常见问题及解决：**

| 问题 | 可能原因 | 解决方案 |
|------|---------|---------|
| 401 Unauthorized | API Key 无效 | 重新生成 API Key |
| 401 Unauthorized | IP 未白名单 | 添加 IP 或设置 Unrestricted |
| 401 Unauthorized | 权限不足 | 启用相应权限 |
| 400 Timestamp | 时钟不同步 | 同步系统时间 |
| 400 Signature | 签名错误 | 检查 Secret Key 是否正确 |

---

### 4️⃣ 获取公网 IP (`get-current-ip.ts`)

**用途：**  
获取当前服务器/机器的公网 IP 地址，用于配置交易所 API 白名单。

**功能：**
- 使用多个 IP 查询服务（高可用性）
- 显示 IP 地址和位置信息
- 提供添加 IP 到白名单的步骤说明

**运行命令：**
```bash
npm run tool:get-ip

# 或直接运行
npx tsx src/tools/get-current-ip.ts
```

**输出示例：**
```
🔍 正在获取当前公网 IP 地址...

📡 尝试 ipify...
✅ 当前公网 IP: 203.0.113.45
📍 位置信息: San Francisco, CA, US

📋 请将此 IP 添加到 Binance API 白名单中

🔧 添加步骤:
1. 访问 https://www.binance.com/cn/my/settings/api-management
2. 找到您的 API 密钥
3. 在 "IP access restrictions" 部分
4. 添加 IP: 203.0.113.45
5. 点击 "Confirm" 保存

⚠️  或者临时选择 "Unrestricted" 进行测试
```

**何时使用：**
- 配置 API Key 时
- IP 变更后
- 认证失败时
- 服务器迁移后

**支持的服务：**
1. ipify (https://api.ipify.org)
2. ipinfo.io (https://ipinfo.io)
3. ip-api (http://ip-api.com)

---

## 🎯 工具使用流程

### 初次设置

```bash
# 1. 获取当前 IP
npm run tool:get-ip

# 2. 配置交易所 API Key 白名单
# (在交易所网站手动操作)

# 3. 验证 API 认证
npm run tool:diagnose-auth

# 4. 初始化历史数据
npm run tool:init-history

# 5. 启动账户轮询服务
npm run cron
```

### 日常运维

```bash
# 定期检查认证状态
npm run tool:diagnose-auth

# 查看当前 IP（如有变更）
npm run tool:get-ip

# 重新初始化历史数据（如需要）
npm run tool:init-history
```

### 故障排查

```bash
# 认证失败
npm run tool:diagnose-auth

# IP 地址问题
npm run tool:get-ip

# 数据问题
npm run tool:init-history
```

## 📊 工具依赖关系

```
                    ┌─────────────────┐
                    │   .env 配置     │
                    │  (API Keys)     │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
    ┌─────────────┐  ┌──────────────┐  ┌─────────────┐
    │ get-ip.ts   │  │ diagnose-    │  │ init-       │
    │             │  │ auth.ts      │  │ history.ts  │
    └─────────────┘  └──────────────┘  └──────┬──────┘
                                               │
                                               │ 生成初始数据
                                               ▼
                                       ┌──────────────┐
                                       │   cron.ts    │
                                       │ (定期轮询)   │
                                       └──────────────┘
```

## 🔍 常见问题

### Q: 必须按顺序运行工具吗？

**A:**
- `get-ip.ts` 和 `diagnose-auth.ts` 可随时运行
- `init-history.ts` 必须在 `cron.ts` 之前运行
- `cron.ts` 作为长期运行的服务

### Q: 工具会产生交易吗？

**A:** 不会！所有工具仅读取数据，不执行任何交易操作。

### Q: 轮询频率应该设置多少？

**A:**
- 测试环境：6-10 秒（快速反馈）
- 生产环境：60-300 秒（降低 API 调用）
- 根据交易所 API 限制调整

### Q: 如何停止 cron 服务？

**A:**
```bash
# 前台运行：Ctrl+C
# PM2 运行：pm2 stop itrade-cron
# 或查找进程：ps aux | grep cron | kill <PID>
```

## 📚 相关文档

- [主文档](../README.md)
- [集成测试文档](../integration/README.md)
- [账户轮询快速开始](../../../../docs/guides/ACCOUNT_POLLING_QUICK_START.md)

---

Author: xiaoweihsueh@gmail.com  
Date: October 26, 2025

