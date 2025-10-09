# WebSocket 连接被阻断问题及解决方案

## 问题描述

在运行 iTrade 系统时，出现以下错误：

```
❌ WebSocket error: WebSocket was closed before the connection was established
❌ WebSocket error: read ECONNRESET
❌ WebSocket disconnected: binance, code: 1006
```

但同时，REST API 可以正常工作：
```
💰 Current BTC/USDT price: 121402.63
```

## 问题原因

这表明：
1. ✅ 网络连接正常
2. ✅ 可以访问 Binance API
3. ❌ WebSocket 连接被阻断

可能的原因：
- **地区限制**：某些地区/国家限制加密货币 WebSocket 连接
- **防火墙**：企业或家庭防火墙阻止 WebSocket 协议
- **ISP 限制**：互联网服务提供商阻止特定端口或协议
- **GFW（中国大陆）**：加密货币相关的 WebSocket 端口被封锁

## 解决方案

### 方案1: REST API 轮询（已实现）✅

使用 REST API 定期轮询市场数据，替代 WebSocket 实时推送。

**优点**：
- ✅ 可靠（REST API 通常不被阻断）
- ✅ 实现简单
- ✅ 适用于测试和开发

**缺点**：
- ⚠️ 延迟较高（1秒间隔）
- ⚠️ API 请求限制（Binance 有速率限制）
- ⚠️ 不适合高频交易

**实现**（已在 `apps/console/src/main.ts` 中）：

```typescript
// 使用 REST API 轮询
let tickerCount = 0;
const pollInterval = setInterval(async () => {
  try {
    const ticker = await binance.getTicker(symbol);
    tickerCount++;
    logger.info(`📈 Ticker #${tickerCount}: ${symbol} = ${ticker.price.toString()}`);
    
    // 手动触发引擎处理
    await engine.onMarketData(symbol, ticker);
  } catch (error) {
    logger.error('❌ Failed to fetch ticker:', error as Error);
  }
}, 1000); // 每秒轮询一次
```

### 方案2: 使用代理/VPN

如果你需要实时 WebSocket 数据流：

1. **使用 HTTP/HTTPS 代理**

   ```bash
   # 设置环境变量
   export HTTP_PROXY=http://proxy.example.com:8080
   export HTTPS_PROXY=http://proxy.example.com:8080
   
   # 然后运行程序
   pnpm run start
   ```

2. **使用 VPN**
   - 连接到支持加密货币交易的地区的 VPN
   - 重新运行程序

3. **使用 SOCKS5 代理（通过 Shadowsocks 等）**

   ```typescript
   // 在代码中配置代理（需要修改 BaseExchange）
   const agent = new HttpsProxyAgent('socks5://127.0.0.1:1080');
   this.httpClient = axios.create({
     baseURL: this.baseUrl,
     httpsAgent: agent,
   });
   ```

### 方案3: 使用其他交易所

某些交易所的 WebSocket 可能没有被阻断：

```typescript
// 尝试使用 Coinbase
import { CoinbaseExchange } from '@itrade/exchange-connectors';

const coinbase = new CoinbaseExchange();
await coinbase.connect({
  apiKey: process.env.COINBASE_API_KEY || '',
  secretKey: process.env.COINBASE_SECRET_KEY || '',
  sandbox: true,
});

engine.addExchange('coinbase', coinbase);
```

### 方案4: 自建中继服务器

如果你需要生产环境的实时数据：

1. 在可以访问 Binance WebSocket 的服务器上部署中继服务
2. 你的本地程序连接到中继服务器
3. 中继服务器转发 WebSocket 数据

## 当前配置

### main.ts 当前使用的方案

```typescript
// ✅ 方案1：REST API 轮询
const USE_MAINNET_FOR_DATA = true;
const binance = new BinanceExchange(!USE_MAINNET_FOR_DATA);

// 移除了 WebSocket 订阅
// await binance.subscribeToTicker(symbol); // ❌ 被阻断

// 使用轮询代替
const pollInterval = setInterval(async () => {
  const ticker = await binance.getTicker(symbol);
  await engine.onMarketData(symbol, ticker);
}, 1000);
```

## 性能对比

| 方案 | 延迟 | 可靠性 | 带宽 | 适用场景 |
|------|------|--------|------|---------|
| WebSocket | 实时（<100ms） | ⭐⭐⭐⭐⭐ | 低 | 生产环境、高频交易 |
| REST 轮询（1s） | 1000ms | ⭐⭐⭐⭐ | 中 | 开发、测试、低频交易 |
| REST 轮询（5s） | 5000ms | ⭐⭐⭐⭐⭐ | 低 | 长期策略、回测 |

## Binance API 限制

使用 REST API 轮询时需要注意速率限制：

### 重量限制（Weight）
- 每个请求有权重（Weight）
- `getTicker()` 的权重：**2**
- 限制：**1200 weight/分钟**

### 计算
```
1 秒轮询一次 = 60 次/分钟
60 次 × 2 weight = 120 weight/分钟

安全范围：✅ 120 < 1200
```

### 建议轮询间隔

| 间隔 | 请求/分钟 | Weight/分钟 | 安全性 |
|------|----------|-------------|--------|
| 1s | 60 | 120 | ✅ 非常安全 |
| 2s | 30 | 60 | ✅ 极度安全 |
| 5s | 12 | 24 | ✅ 推荐用于生产 |

## 优化建议

### 1. 根据策略调整轮询间隔

```typescript
// 快速策略（日内交易）
const pollInterval = 1000; // 1秒

// 中速策略（波段交易）
const pollInterval = 5000; // 5秒

// 慢速策略（长期持有）
const pollInterval = 60000; // 1分钟
```

### 2. 使用 Klines 代替 Ticker

```typescript
// Klines 提供更多信息（OHLCV）
const klines = await binance.getKlines(symbol, '1m', undefined, undefined, 1);
const latestKline = klines[0];

// 使用 close price 作为 ticker
await engine.onMarketData(symbol, {
  symbol,
  price: latestKline.close,
  volume: latestKline.volume,
  // ...
});
```

### 3. 缓存和去重

```typescript
let lastPrice: Decimal | null = null;

setInterval(async () => {
  const ticker = await binance.getTicker(symbol);
  
  // 只有价格变化时才处理
  if (!lastPrice || !ticker.price.equals(lastPrice)) {
    await engine.onMarketData(symbol, ticker);
    lastPrice = ticker.price;
  }
}, 1000);
```

### 4. 错误处理和重试

```typescript
let retryCount = 0;
const MAX_RETRIES = 3;

const pollInterval = setInterval(async () => {
  try {
    const ticker = await binance.getTicker(symbol);
    await engine.onMarketData(symbol, ticker);
    retryCount = 0; // 重置重试计数
  } catch (error) {
    retryCount++;
    logger.error(`❌ Failed to fetch ticker (attempt ${retryCount}/${MAX_RETRIES})`);
    
    if (retryCount >= MAX_RETRIES) {
      logger.error('❌ Max retries reached, stopping polling');
      clearInterval(pollInterval);
    }
  }
}, 1000);
```

## 测试连接

使用以下命令测试你的网络是否能访问 Binance WebSocket：

```bash
# 测试 REST API
curl https://api.binance.com/api/v3/ping

# 测试 WebSocket（需要 wscat）
npm install -g wscat
wscat -c wss://stream.binance.com:9443/ws/btcusdt@ticker
```

如果 REST 工作但 WebSocket 失败，说明 WebSocket 被阻断。

## 故障排除

### 问题1: 轮询速度太慢

**症状**：策略反应迟钝

**解决**：
```typescript
// 减少轮询间隔（注意 API 限制）
const pollInterval = 500; // 500ms (不推荐)
```

### 问题2: 超过 API 速率限制

**症状**：
```
❌ Failed to fetch ticker: Error 429 (Too Many Requests)
```

**解决**：
```typescript
// 增加轮询间隔
const pollInterval = 5000; // 5秒
```

### 问题3: 策略不产生信号

**症状**：收到 ticker 数据但没有策略信号

**检查**：
1. 确认策略参数（FastMA=3, SlowMA=5）
2. 检查数据是否足够（至少 5 个数据点）
3. 查看日志中的 ticker 数量

## 总结

当前实现使用 **REST API 轮询**作为 WebSocket 的替代方案：

✅ **优点**：
- 可靠工作（不受 WebSocket 阻断影响）
- 实现简单
- 适合开发和测试

⚠️ **限制**：
- 1秒延迟
- 不适合高频交易
- 需要注意 API 限制

🚀 **未来改进**：
- 如果需要实时数据，考虑使用 VPN 或代理
- 生产环境建议使用自建中继服务器
- 或者选择 WebSocket 可用的地区部署

---

**相关文档**：
- [故障排除指南](./TROUBLESHOOTING.md)
- [快速开始](./QUICKSTART-CN.md)
- [架构分析](./trading-engine-analysis.md)

