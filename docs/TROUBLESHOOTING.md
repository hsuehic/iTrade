# iTrade 故障排除指南

## 问题：没有收到市场数据 / 策略没有信号

### 症状
- 系统启动成功
- 显示已订阅市场数据
- 但是等待很长时间（10+ 分钟）都没有看到：
  - Ticker 数据更新
  - 策略分析日志
  - 策略信号

### 可能的原因和解决方案

#### 1. Binance Testnet WebSocket 不稳定 ⚠️

**问题**：Binance Testnet 的 WebSocket 数据流可能不稳定或不可用。

**解决方案**：使用 Binance 主网订阅市场数据（不需要 API 密钥）

```typescript
// 在 apps/console/src/main.ts 中
const USE_MAINNET_FOR_DATA = true; // 改为 true
const binance = new BinanceExchange(!USE_MAINNET_FOR_DATA);
```

**说明**：
- ✅ 订阅市场数据（ticker、orderbook、trades、klines）不需要 API 密钥
- ✅ 主网的 WebSocket 数据流更稳定
- ⚠️ 如果要执行真实交易，必须使用真实的 API 密钥和主网
- 🔒 对于测试交易功能，使用 testnet + testnet API 密钥

#### 2. 日志级别太高 

**问题**：日志级别设置为 `INFO`，看不到详细的数据流日志。

**解决方案**：改为 `DEBUG` 级别

```typescript
const logger = new ConsoleLogger(LogLevel.DEBUG);
```

**预期输出**：
```
[DEBUG] 📈 Ticker #1: BTCUSDT = 43250.50
[DEBUG] 📈 Ticker #2: BTCUSDT = 43251.30
[DEBUG] 📈 Ticker #3: BTCUSDT = 43252.10
```

#### 3. WebSocket 连接失败但没有明显错误

**诊断步骤**：

1. **添加事件监听器**（已在更新的代码中）
   ```typescript
   binance.on('ws_connected', () => {
     logger.info('✅ WebSocket connected');
   });
   
   binance.on('ws_error', (error) => {
     logger.error('❌ WebSocket error:', error);
   });
   
   binance.on('ws_disconnected', (name, code, reason) => {
     logger.warn(`❌ WebSocket disconnected: ${code} - ${reason}`);
   });
   ```

2. **检查日志输出**
   - 应该看到 `✅ WebSocket connected`
   - 如果看到 `❌ WebSocket error` 或 `❌ WebSocket disconnected`，说明连接有问题

3. **手动测试 API 连接**
   ```typescript
   setTimeout(async () => {
     const ticker = await binance.getTicker('BTC/USDT');
     logger.info(`Current price: ${ticker.price.toString()}`);
   }, 2000);
   ```

#### 4. 策略参数设置太保守

**问题**：策略需要太多数据点或阈值太高，很难触发信号。

**默认参数**（需要 30 个数据点，约 30 秒）：
```typescript
const strategy = new MovingAverageStrategy({
  fastPeriod: 10,
  slowPeriod: 30,    // 需要 30 个价格点
  threshold: 0.05,   // 5% 的变化才触发
  symbol: 'BTC/USDT',
});
```

**测试用参数**（只需 5 个数据点，约 5 秒）：
```typescript
const strategy = new MovingAverageStrategy({
  fastPeriod: 3,     // 只需 3 个点
  slowPeriod: 5,     // 只需 5 个点
  threshold: 0.001,  // 0.1% 就触发（更敏感）
  symbol: 'BTC/USDT',
});
```

#### 5. 防火墙或网络问题

**问题**：防火墙阻止 WebSocket 连接。

**检查**：
```bash
# 测试 Binance API 连接
curl https://api.binance.com/api/v3/ping

# 应该返回：{}

# 测试获取 ticker
curl https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT
```

**解决方案**：
- 检查防火墙设置
- 尝试使用 VPN
- 检查公司网络是否阻止加密货币网站

#### 6. Symbol 格式问题

**问题**：虽然现在有符号标准化，但某些边缘情况可能还有问题。

**检查**：
```typescript
// 使用标准格式
const symbol = 'BTC/USDT'; // ✅ 推荐

// 避免拼写错误
const symbol = 'BTCUSD';   // ❌ 错误（Binance 使用 USDT 不是 USD）
const symbol = 'BTCUSDT';  // ✅ 可以，但不是标准格式
```

## 诊断清单

运行程序后，按顺序检查：

### ✅ 第1步：确认系统启动
```
[INFO] Trading engine started successfully
[INFO] Subscribing to ticker data for BTC/USDT...
```

### ✅ 第2步：确认 WebSocket 连接
```
[INFO] ✅ WebSocket connected
```
如果没有看到，说明 WebSocket 连接失败。

### ✅ 第3步：确认数据接收
```
[INFO] 📈 Ticker #1: BTCUSDT = 43250.50
[INFO] 📈 Ticker #2: BTCUSDT = 43251.30
```
如果没有看到，说明虽然连接成功但没有收到数据。

### ✅ 第4步：等待足够数据
- 使用默认参数（slowPeriod=30）：等待约 30 秒
- 使用测试参数（slowPeriod=5）：等待约 5 秒

### ✅ 第5步：查看策略分析
应该看到策略开始分析（即使没有信号）：
```
[DEBUG] Strategy analyzing...
```

### ✅ 第6步：等待信号（可能需要时间）
```
[INFO] 🎯 Strategy Signal: buy BTCUSDT @ 43252.10 (confidence: 0.8)
[INFO]    Reason: Fast MA (43252.10) crossed above Slow MA (43200.45)
```

## 完整的调试版本

这是一个包含所有调试功能的完整配置：

```typescript
import { TradingEngine, LogLevel, EventBus } from '@itrade/core';
import { ConsoleLogger } from '@itrade/logger';
import { RiskManager } from '@itrade/risk-manager';
import { PortfolioManager } from '@itrade/portfolio-manager';
import { MovingAverageStrategy } from '@itrade/strategies';
import { BinanceExchange } from '@itrade/exchange-connectors';
import { Decimal } from 'decimal.js';

const logger = new ConsoleLogger(LogLevel.DEBUG); // DEBUG 级别

async function main() {
  const riskManager = new RiskManager({
    maxDrawdown: new Decimal(20),
    maxPositionSize: new Decimal(10),
    maxDailyLoss: new Decimal(5),
  });
  const portfolioManager = new PortfolioManager(new Decimal(10000));
  const engine = new TradingEngine(riskManager, portfolioManager, logger);

  const symbol = 'BTC/USDT';
  
  // 测试配置：更快触发
  const strategy = new MovingAverageStrategy({
    fastPeriod: 3,
    slowPeriod: 5,
    threshold: 0.001,
    symbol,
  });
  engine.addStrategy('ma-strategy', strategy);

  // 使用主网数据
  const USE_MAINNET = true;
  const binance = new BinanceExchange(!USE_MAINNET);

  // 添加所有事件监听器
  binance.on('connected', () => logger.info('✅ Exchange connected'));
  binance.on('ws_connected', () => logger.info('✅ WebSocket connected'));
  binance.on('ws_disconnected', (name, code, reason) => {
    logger.warn(`❌ WebSocket disconnected: ${code} - ${reason}`);
  });
  binance.on('ws_error', (error) => logger.error('❌ WebSocket error:', error));
  binance.on('ticker', (s, t) => logger.debug(`📊 Raw ticker: ${s} @ ${t.price}`));
  binance.on('error', (error) => logger.error('❌ Exchange error:', error));

  await binance.connect({
    apiKey: process.env.BINANCE_API_KEY || '',
    secretKey: process.env.BINANCE_SECRET_KEY || '',
    sandbox: !USE_MAINNET,
  });

  engine.addExchange('binance', binance);
  await engine.start();

  logger.info(`Using ${USE_MAINNET ? 'MAINNET' : 'TESTNET'}`);
  await binance.subscribeToTicker(symbol);
  logger.info(`✅ Subscribed to ${symbol}`);

  const eventBus = EventBus.getInstance();
  let tickerCount = 0;
  
  eventBus.onTickerUpdate((data) => {
    tickerCount++;
    logger.info(`📈 Ticker #${tickerCount}: ${data.symbol} = ${data.ticker.price.toString()}`);
  });

  eventBus.onStrategySignal((signal) => {
    logger.info(`🎯 SIGNAL: ${signal.action} @ ${signal.price} (${signal.confidence})`);
    logger.info(`   ${signal.reason}`);
  });

  // 测试 REST API
  setTimeout(async () => {
    try {
      const ticker = await binance.getTicker(symbol);
      logger.info(`💰 REST API test: ${ticker.price.toString()}`);
    } catch (error) {
      logger.error('❌ REST API failed:', error as Error);
    }
  }, 2000);

  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    await engine.stop();
    await binance.disconnect();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
```

## 常见错误信息

### "ECONNREFUSED"
```
Error: connect ECONNREFUSED
```
**原因**：无法连接到 Binance 服务器  
**解决**：检查网络连接，尝试使用 VPN

### "Invalid symbol"
```
Error: Invalid symbol
```
**原因**：交易对格式错误或不存在  
**解决**：使用正确格式 `'BTC/USDT'` 或检查交易对是否存在

### "WebSocket connection timeout"
```
WebSocket connection timeout
```
**原因**：WebSocket 连接超时  
**解决**：
1. 尝试使用主网
2. 检查防火墙设置
3. 稍后重试

### 没有任何错误，但也没有数据
**最可能的原因**：使用了 Binance Testnet 的 WebSocket  
**解决**：改用主网（见上文）

## 获取更多帮助

如果以上步骤都无法解决问题：

1. **检查 Binance 状态**：https://www.binance.com/en/support/announcement
2. **查看日志文件**：收集完整的日志输出
3. **检查代码版本**：确保使用最新版本
4. **测试其他交易对**：尝试 `ETH/USDT` 或其他交易对
5. **简化配置**：使用最小化配置测试

## 成功的标志

当一切正常工作时，你应该看到：

```
[INFO] Trading engine started successfully
[INFO] ✅ Exchange connected
[INFO] Using MAINNET
[INFO] ✅ Subscribed to BTC/USDT
[INFO] ✅ WebSocket connected
[INFO] 📈 Ticker #1: BTCUSDT = 43250.50
[INFO] 📈 Ticker #2: BTCUSDT = 43251.30
[INFO] 📈 Ticker #3: BTCUSDT = 43252.10
[INFO] 📈 Ticker #4: BTCUSDT = 43252.80
[INFO] 📈 Ticker #5: BTCUSDT = 43253.20
[INFO] 🎯 SIGNAL: buy @ 43253.20 (0.75)
[INFO]    Fast MA (43252.50) crossed above Slow MA (43251.20)
```

## 性能提示

### 优化数据接收频率

如果 ticker 更新太频繁：
```typescript
// 使用 Klines 代替 Ticker（更低频率）
await binance.subscribeToKlines(symbol, '1m'); // 每分钟一次

// 不要同时订阅 ticker 和 klines
// await binance.subscribeToTicker(symbol); // 注释掉
```

### 减少日志输出

如果日志太多：
```typescript
// 将 ticker 日志改为 DEBUG 级别
eventBus.onTickerUpdate((data) => {
  logger.debug(`Ticker: ${data.ticker.price}`); // 使用 debug 而不是 info
});
```

---

**最后更新**：2025-10-09  
**适用版本**：iTrade 1.0.0+

