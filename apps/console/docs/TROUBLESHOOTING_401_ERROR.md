# 解决账户轮询服务 401 认证错误

## 🚨 问题症状

运行 `pnpm run cron` 时出现以下错误：

```
2025-10-10T02:48:39.394Z [ERROR] Exchange poll failed {
  "error": "Request failed with status code 401",
  ...
}
```

## 🔍 问题原因

401 认证错误通常是由以下原因导致的：

1. **缺少 `.env` 文件** - API 密钥未配置
2. **API 密钥错误** - 密钥无效或已过期
3. **API 权限不足** - 密钥没有读取账户信息的权限
4. **测试网/主网配置错误** - 使用了错误环境的 API 密钥

## 🚀 快速诊断工具

我们提供了一个自动诊断工具来快速定位问题：

```bash
cd apps/console
pnpm run diagnose
```

这个工具会自动检查：
- ✅ 环境变量配置
- ✅ 网络连接状态  
- ✅ 服务器时间同步
- ✅ API 密钥有效性
- ✅ 账户访问权限

**运行诊断工具后，根据报告提示进行修复。**

## ✅ 手动解决方案

如果诊断工具无法运行，可以按以下步骤手动排查：

### 步骤 1: 创建环境配置文件

```bash
# 进入 console 应用目录
cd apps/console

# 复制配置模板为 .env 文件
cp env.template .env

# 编辑 .env 文件
nano .env  # 或使用你喜欢的编辑器
```

### 步骤 2: 配置 API 密钥

在 `.env` 文件中设置您的 API 密钥：

```bash
# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_actual_password
DB_DB=itrade
DB_SSL=false

# Binance API 密钥（必需）
BINANCE_API_KEY=your_actual_binance_api_key
BINANCE_SECRET_KEY=your_actual_binance_secret_key

# 其他交易所（可选）
# OKX_API_KEY=your_okx_api_key
# OKX_SECRET_KEY=your_okx_secret_key
# OKX_PASSPHRASE=your_okx_passphrase

# COINBASE_API_KEY=your_coinbase_api_key
# COINBASE_SECRET_KEY=your_coinbase_secret_key
```

### 步骤 3: 获取 API 密钥

#### Binance API 密钥

1. 访问 [Binance API 管理页面](https://www.binance.com/cn/my/settings/api-management)
2. 创建新的 API 密钥
3. **重要**: 确保启用以下权限：
   - ✅ **Read Info** (读取信息)
   - ❌ **Spot & Margin Trading** (如果只是查看数据，不需要交易权限)
   - ❌ **Futures** (如果不需要期货功能)

#### OKX API 密钥（可选）

1. 访问 [OKX API 管理页面](https://www.okx.com/account/my-api)
2. 创建新的 API 密钥
3. 设置权限为 **读取** (Read Only)

#### Coinbase API 密钥（可选）

1. 访问 [Coinbase Pro API 页面](https://pro.coinbase.com/profile/api)
2. 创建新的 API 密钥
3. 设置权限为 **View** (查看)

### 步骤 4: 验证配置

重新运行账户轮询服务：

```bash
cd apps/console
pnpm run cron
```

现在应该看到类似以下的成功输出：

```
2025-10-10T02:48:35.499Z [INFO] 🚀 Initializing Account Polling Cron Job...
2025-10-10T02:48:35.616Z [INFO] ✅ Database connected
2025-10-10T02:48:35.745Z [INFO] ✅ Binance exchange initialized
2025-10-10T02:48:36.296Z [INFO] ✅ Account Polling Service initialized
2025-10-10T02:48:36.296Z [INFO] 🔄 Starting continuous account polling...
📊 Polling completed: 1/1 exchanges successful
💾 binance snapshot saved: Equity=1234.56, Positions=0
```

## 🔧 常见问题排查

### 问题 1: 仍然出现 401 错误

**可能原因**: API 密钥无效或权限不足

**解决方案**:
1. 检查 API 密钥是否正确复制（无多余空格）
2. 确认 API 密钥权限包含 "Read Info"
3. 检查 API 密钥是否已启用
4. 尝试重新生成 API 密钥

### 问题 2: 连接超时或网络错误

**可能原因**: 网络连接问题或防火墙阻挡

**解决方案**:
1. 检查网络连接
2. 确认防火墙设置
3. 如果在企业网络，可能需要代理设置

### 问题 3: 部分交易所成功，部分失败

这是正常现象，系统会：
- ✅ 继续处理成功的交易所
- ⚠️  记录失败的交易所错误
- 🔄 根据配置进行重试

### 问题 4: 没有任何交易所初始化

**错误信息**: `❌ No exchanges configured. Please set API credentials in .env file.`

**解决方案**:
1. 确认 `.env` 文件存在
2. 确认至少配置了一个交易所的 API 密钥
3. 检查环境变量名是否正确（区分大小写）

## 📋 检查清单

在寻求帮助之前，请确保：

- [ ] `.env` 文件已创建并正确配置
- [ ] API 密钥来源正确（主网 vs 测试网）
- [ ] API 密钥有足够权限（至少包含读取权限）
- [ ] 网络连接正常，能访问交易所 API
- [ ] 数据库连接配置正确

## 🔐 安全注意事项

1. **永远不要**在代码或日志中暴露 API 密钥
2. **定期轮换** API 密钥
3. **最小权限原则** - 只授予必需的权限
4. **监控使用情况** - 定期检查 API 使用记录
5. **备份配置** - 安全地备份配置文件

## 📞 获取帮助

如果问题仍然存在，请提供以下信息：

1. 完整的错误日志
2. `.env` 文件配置（**隐藏敏感信息**）
3. 使用的交易所和 API 密钥权限设置
4. 网络环境信息

---

💡 **提示**: 首次设置成功后，建议运行 `pnpm run init-history` 来初始化历史数据。
