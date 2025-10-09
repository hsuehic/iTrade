# Console 应用快速启动指南

## 📋 前置条件

1. **数据库运行**
   ```bash
   cd apps/services
   docker-compose up -d
   ```

2. **环境变量设置**
   
   在项目根目录创建 `.env` 文件：
   ```bash
   # 数据库配置
   DATABASE_HOST=localhost
   DATABASE_PORT=5432
   DATABASE_USER=postgres
   DATABASE_PASSWORD=postgres
   DATABASE_NAME=itrade
   DATABASE_SSL=false
   
   # Binance 配置（可选，用于实际交易）
   BINANCE_API_KEY=your_api_key_here
   BINANCE_SECRET_KEY=your_secret_key_here
   ```

3. **依赖安装**
   ```bash
   pnpm install
   ```

4. **数据库初始化**
   ```bash
   cd packages/data-manager
   pnpm run sync-schema
   ```

---

## 🚀 启动 Console 应用

### 方式 1：开发模式（推荐）

```bash
cd apps/console
pnpm dev
```

### 方式 2：监听模式（自动重启）

```bash
cd apps/console
pnpm dev:watch
```

### 方式 3：测试模式

```bash
cd apps/console
pnpm test
```

---

## 📊 创建并运行策略

### 选项 1：使用 Web 界面（推荐）

1. **启动 Web 应用**
   ```bash
   cd apps/web
   pnpm dev
   ```

2. **访问** `http://localhost:3000`

3. **登录后进入策略页面**

4. **创建新策略**
   - 点击 "Create Strategy" 按钮
   - 填写策略信息：
     - Name: `My First MA Strategy`
     - Type: `moving_average`
     - Exchange: `binance`
     - Symbol: `BTC/USDT`
   - 配置参数：
     ```json
     {
       "fastPeriod": 12,
       "slowPeriod": 26,
       "threshold": 0.001,
       "subscription": {
         "ticker": true,
         "klines": true,
         "method": "rest"
       }
     }
     ```

5. **启动策略**
   - 点击 "Start" 按钮
   - 策略状态变为 "Active"
   - Console 应用会在 1 秒内自动加载并开始执行

### 选项 2：使用数据库直接操作

```sql
-- 首先需要创建用户（如果还没有）
INSERT INTO "user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
VALUES ('user_1', 'Test User', 'test@example.com', NOW(), NULL, NOW(), NOW());

-- 创建策略
INSERT INTO strategies (
  name, 
  description, 
  type, 
  status, 
  exchange, 
  symbol, 
  parameters,
  "userId",
  "createdAt",
  "updatedAt"
) VALUES (
  'Moving Average Strategy',
  'Simple moving average crossover strategy',
  'moving_average',
  'active',  -- 设置为 active 立即启动
  'binance',
  'BTC/USDT',
  '{
    "fastPeriod": 12,
    "slowPeriod": 26,
    "threshold": 0.001,
    "subscription": {
      "ticker": true,
      "klines": true,
      "method": "rest"
    }
  }'::jsonb,
  'user_1',
  NOW(),
  NOW()
);
```

---

## 📈 监控策略执行

### 1. Console 日志输出

启动后你会看到：

```
[INFO] Connecting to database...
[INFO] ✅ Database connected
[INFO] 📊 iTrade Console started with database-driven strategy management
[INFO] ✅ Exchange connected (REST API working)
[INFO] Trading engine started
[INFO] Starting Strategy Manager...
[INFO] Loading 1 active strategies...
[INFO] ✅ Added strategy: Moving Average Strategy (ID: 1)
[INFO]    Type: moving_average, Symbol: BTC/USDT, Exchange: binance
[INFO] ✅ Order Tracker started - All orders will be saved to database
[INFO] Strategy Manager started with performance monitoring

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 iTrade Trading System is LIVE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Active strategies are loaded from database
🔄 Monitoring for strategy updates every second
📈 Performance reports every 60 seconds
💼 Orders will be tracked and saved to database
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 2. 策略信号日志

当策略生成信号时：

```
[INFO] 🎯 SIGNAL: strategy_1 - BUY BTC/USDT @ 45000.00
[INFO]    📊 Confidence: 75.0%
[INFO]    💭 Reason: Fast MA crossed above slow MA
```

### 3. 订单执行日志

当订单被创建和执行时：

```
[INFO] 📝 ORDER CREATED: BUY 0.001 BTC/USDT @ 45000.00
[INFO]    Order ID: 12345678
[INFO] 💾 Order saved to database: 12345678 (Strategy ID: 1)

[INFO] ✅ ORDER FILLED: 12345678
[INFO]    Executed: 0.001 @ avg 45000.00
[INFO] 💾 Order filled and updated: 12345678, 📊 Unrealized PnL: 0.00, Avg Price: 45000.00
```

### 4. 性能报告（每60秒）

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Strategy Performance Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📈 strategy_1:
   Running for: 0.02h (1m)
   Signals generated: 3
   Orders executed: 1
   Last signal: 15s ago
   Last order: 45s ago
   💰 Total PnL: 0.00
   💵 Realized PnL: 0.00
   📊 Total Orders: 1 (1 filled)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 🎛️ 策略控制

### 启动策略

**方式 1：Web 界面**
- 找到策略，点击 "Start" 按钮
- Console 会在 1 秒内检测并加载

**方式 2：数据库**
```sql
UPDATE strategies 
SET status = 'active' 
WHERE id = 1;
```

### 停止策略

**方式 1：Web 界面**
- 找到策略，点击 "Stop" 按钮
- Console 会在 1 秒内检测并移除

**方式 2：数据库**
```sql
UPDATE strategies 
SET status = 'stopped' 
WHERE id = 1;
```

### 暂停策略

```sql
UPDATE strategies 
SET status = 'paused' 
WHERE id = 1;
```

### 查看策略列表

**方式 1：Web 界面**
- 访问 `/strategy` 页面

**方式 2：数据库**
```sql
SELECT 
  id, 
  name, 
  type, 
  status, 
  symbol, 
  exchange,
  "lastExecutionTime"
FROM strategies
ORDER BY "createdAt" DESC;
```

---

## 📊 查看订单和交易

### 查询所有订单

```sql
SELECT 
  o.id,
  o."clientOrderId",
  o.symbol,
  o.side,
  o.type,
  o.quantity,
  o.price,
  o.status,
  o."executedQuantity",
  o."averagePrice",
  o."realizedPnl",
  s.name as "strategyName"
FROM orders o
LEFT JOIN strategies s ON o."strategyId" = s.id
ORDER BY o.timestamp DESC
LIMIT 20;
```

### 查询策略订单

```sql
SELECT 
  o.id,
  o.side,
  o.symbol,
  o.quantity,
  o.price,
  o.status,
  o."realizedPnl",
  o.timestamp
FROM orders o
WHERE o."strategyId" = 1
ORDER BY o.timestamp DESC;
```

### 计算策略 PnL

```sql
SELECT 
  s.name,
  COUNT(o.id) as "totalOrders",
  COUNT(CASE WHEN o.status = 'FILLED' THEN 1 END) as "filledOrders",
  SUM(o."realizedPnl") as "totalRealizedPnl",
  SUM(o."unrealizedPnl") as "totalUnrealizedPnl"
FROM strategies s
LEFT JOIN orders o ON o."strategyId" = s.id
WHERE s.id = 1
GROUP BY s.id, s.name;
```

---

## 🛑 停止 Console 应用

### 优雅关闭

按 `Ctrl+C` 触发优雅关闭：

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🛑 Shutting down gracefully...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Strategy Performance Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[最终性能报告...]

📊 Final metrics for strategy_1: 10 signals, 5 orders in 1.25h
❌ Removed strategy: strategy_1 (ID: 1)
✅ Strategy manager stopped

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Order Tracker Final Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Total Orders Created: 5
   Orders Filled: 4
   Orders Cancelled: 1
   Orders Rejected: 0
   Running time: 1.25 hours
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Order tracker stopped
✅ Trading engine stopped
✅ Exchange disconnected
✅ Database connection closed

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
👋 Goodbye!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## 🔍 故障排查

### 问题：数据库连接失败

**错误信息：**
```
[ERROR] Failed to connect to database
```

**解决方案：**
1. 检查 Docker 容器是否运行：
   ```bash
   docker ps | grep postgres
   ```
2. 检查环境变量配置
3. 检查数据库端口是否被占用

### 问题：没有加载策略

**原因：** 数据库中没有 `status = 'active'` 的策略

**解决方案：**
1. 通过 Web 界面创建并启动策略
2. 或者直接在数据库中设置策略状态为 'active'

### 问题：WebSocket 连接失败

**错误信息：**
```
[ERROR] WebSocket connection failed
```

**解决方案：**
- Console 应用已配置使用 REST 轮询作为后备方案
- WebSocket 失败不影响策略执行
- 检查日志中的 `(REST API working)` 确认 REST 模式正常

### 问题：订单没有保存到数据库

**检查：**
1. OrderTracker 是否启动：
   ```
   [INFO] ✅ Order Tracker started
   ```
2. 查看订单创建日志：
   ```
   [INFO] 💾 Order saved to database: {orderId}
   ```
3. 检查数据库表：
   ```sql
   SELECT COUNT(*) FROM orders;
   ```

---

## 📝 最佳实践

### 1. 测试策略

**在使用真实资金前：**
1. 使用 Binance 测试网
2. 设置小额订单量
3. 监控几天确保稳定
4. 检查 PnL 计算正确性

### 2. 监控

**定期检查：**
- Console 日志输出
- 每分钟的性能报告
- 数据库中的订单记录
- Web 界面的策略状态

### 3. 备份

**定期备份：**
```bash
# 备份数据库
docker exec -t itrade-postgres pg_dump -U postgres itrade > backup_$(date +%Y%m%d_%H%M%S).sql

# 备份策略配置
psql -h localhost -U postgres -d itrade -c "COPY strategies TO '/tmp/strategies.csv' WITH CSV HEADER;"
```

### 4. 日志管理

**日志输出到文件：**
```bash
cd apps/console
pnpm dev > logs/console_$(date +%Y%m%d_%H%M%S).log 2>&1
```

---

## 🎯 下一步

1. **阅读完整文档**
   - `CONSOLE_WEB_IMPROVEMENTS.md` - 详细改进说明
   - `STRATEGY_MANAGEMENT_GUIDE.md` - 策略管理指南

2. **创建自定义策略**
   - 参考 `packages/strategies/src/MovingAverageStrategy.ts`
   - 实现 `IStrategy` 接口
   - 添加到 `StrategyManager` 的策略工厂

3. **集成更多交易所**
   - 查看 `packages/exchange-connectors`
   - 添加新的交易所连接器

4. **优化风险管理**
   - 调整 `RiskManager` 参数
   - 实现自定义风险规则

5. **监控和告警**
   - 集成监控服务（如 Prometheus）
   - 设置告警通知（如 Telegram bot）

---

## 💡 提示

- **性能报告间隔**可以在 `strategy-manager.ts` 中调整（默认 60 秒）
- **策略检查频率**可以在 `strategy-manager.ts` 中调整（默认 1 秒）
- **日志级别**可以在 `main.ts` 中设置（DEBUG, INFO, WARN, ERROR）
- **订单 PnL 计算**可以在 `order-tracker.ts` 中自定义

---

## 📞 支持

如有问题，请：
1. 检查日志输出
2. 查看故障排查部分
3. 检查数据库状态
4. 提交 Issue 到 GitHub

祝交易顺利！ 🚀📈

