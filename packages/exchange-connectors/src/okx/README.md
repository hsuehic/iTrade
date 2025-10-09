# OKX Exchange Connector

OKX（前 OKEx）交易所的完整实现。

## 特性

✅ **REST API**
- 市场数据（Ticker、OrderBook、Trades、Klines）
- 现货交易（创建、取消、查询订单）
- 账户管理（余额、持仓）
- 交易所信息

✅ **WebSocket**
- 实时 Ticker 订阅
- 实时 OrderBook 订阅
- 实时 Trades 订阅
- 实时 K线订阅

✅ **符号标准化**
- 自动转换 `BTC/USDT` → `BTC-USDT`
- 支持标准格式和 OKX 格式

## 快速使用

```typescript
import { OKXExchange } from '@itrade/exchange-connectors';

// 创建实例（Demo Trading）
const okx = new OKXExchange(true);

// 连接
await okx.connect({
  apiKey: 'your_api_key',
  secretKey: 'your_secret_key',
  passphrase: 'your_passphrase', // OKX 特有
  sandbox: true,
});

// 获取市场数据
const ticker = await okx.getTicker('BTC/USDT');
console.log(`Price: ${ticker.price.toString()}`);

// 订阅实时数据
await okx.subscribeToTicker('BTC/USDT');
okx.on('ticker', (symbol, ticker) => {
  console.log(`${symbol}: ${ticker.price.toString()}`);
});
```

## 与其他交易所的区别

| 特性 | OKX | Binance |
|------|-----|---------|
| 符号格式 | `BTC-USDT` | `BTCUSDT` |
| 认证方式 | Key + Secret + **Passphrase** | Key + Secret |
| K线格式 | `1m`, `1H`, `1D` | `1m`, `1h`, `1d` |
| 测试环境 | Demo Trading | Testnet |

## 重要提示

⚠️ **Passphrase 是必需的**
- OKX API 需要三个凭证：API Key、Secret Key 和 **Passphrase**
- Passphrase 在创建 API 密钥时设置

⚠️ **Demo Trading**
- 使用 `new OKXExchange(true)` 启用 Demo 模式
- 需要在 OKX 网站上启用 Demo Trading 并创建 Demo API 密钥

## API 文档

详细文档请查看：
- [OKX Exchange Guide](../../../../docs/OKX-EXCHANGE-GUIDE.md)
- [OKX API Documentation](https://www.okx.com/docs-v5/en/)

## 实现状态

✅ 已实现
✅ 已测试
✅ 生产就绪

