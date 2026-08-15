# LadderEntrySingleTPStrategy — PRD

## 1. 概述

阶梯入场 + 单一止盈策略。以参考价为基准，在下方按阶梯依次挂 BUY 限价单（DCA）。每次 entry 成交后立即更新唯一一个 TP SELL 限价单。TP 成交后取消所有剩余 entry，以最新参考价重建 ladder，开始新 cycle。

策略通过框架接口运行：

- `processInitialData(initialData)` — 启动/重启时恢复状态
- `analyze(dataUpdate)` — 接收实时数据，返回 signal
- 返回 signal：`buy` / `sell` / `cancel` / `update`（cancel+place 合并）

策略声明数据需求（`initialDataRequirements` + `subscriptionRequirements`），由框架负责获取和投递。

---

## 2. 参数

| 参数             | 类型    | 说明                                                                                                                                        |
| ---------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| basePrice        | number  | 参考基准价。0 = 每次启动/new cycle 从 orderbook bid0 获取；>0 = 固定价                                                                      |
| entryGapType     | enum?   | 参考价到 entry 0 的 gap 类型。`arithmetic`（等差）/ `geometric`（等比）。不指定时默认同 stepType（向后兼容）                                |
| entryGapValue    | number? | 参考价到 entry 0 的 gap 值。arithmetic: 绝对价差；geometric: 百分比。0 = entry 0 在参考价。不指定时默认 stepValue（向后兼容：gap = 层间距） |
| ladderSteps      | int     | ladder 层数                                                                                                                                 |
| stepType         | enum    | `arithmetic`（等差）/ `geometric`（等比）— 控制 entry levels 之间的间距                                                                     |
| stepValue        | number  | arithmetic: 每步绝对价差（entry levels 之间）；geometric: 每步百分比。注意：不是参考价到 entry 0 的 gap                                     |
| qtyType          | enum    | `arithmetic` / `geometric`                                                                                                                  |
| qtyPerStep       | number  | 每步基础数量（base currency）                                                                                                               |
| qtyStepAdd       | number  | arithmetic: 每步增量                                                                                                                        |
| qtyStepRatio     | number  | geometric: 每步倍比                                                                                                                         |
| tpType           | enum    | `absolute`（固定盈利额）/ `percent`（百分比）                                                                                               |
| tpAbsoluteProfit | number  | absolute 模式目标利润（quote currency）                                                                                                     |
| tpPercent        | number  | percent 模式目标利润百分比                                                                                                                  |
| maxInvestment    | number  | 最大投资额（quote，保证金预算）。Buying power = maxInvestment × leverage                                                                    |
| maxPosition      | number  | 最大持仓量（base，含未成交 entry 单）                                                                                                       |
| leverage         | int     | 杠杆倍数                                                                                                                                    |
| resetInterval    | enum    | 分钟。entry 0 未成交超时后重置。0 = 不重置。可选: 0/5/15/30/60/1440                                                                         |

---

## 3. Ladder 构建

### 价格

1. 计算 entryBase（entry 0 的价格）= 参考价 + gap:
   - Arithmetic gap: `entryBase = referencePrice - entryGapValue`
   - Geometric gap: `entryBase = referencePrice × (1 - entryGapValue/100)`
   - entryGapValue=0 → entryBase = referencePrice（entry 0 在参考价）

2. 各 step 价格从 entryBase 开始:
   - Arithmetic: `price[i] = entryBase - stepValue × i`
   - Geometric: `price[i] = entryBase × (1 - stepValue/100)^i`

`i = 0, 1, ..., ladderSteps-1`

### 数量

- Arithmetic: `qty[i] = qtyPerStep + qtyStepAdd × i`
- Geometric: `qty[i] = qtyPerStep × qtyStepRatio^i`

i = 0, 1, ..., ladderSteps-1

### 示例1 (旧版兼容: entryGapValue 默认=stepValue)

```
referencePrice = 0.345, geometric, stepValue = 0.63, entryGapValue 默认=0.63 (同 stepValue)
entryGapType 默认=geometric (同 stepType)
→ entryBase = 0.345 * (1-0.0063) = 0.3428

Step 0: 0.3428 (= entryBase), qty=3000
Step 1: 0.3407 (= 0.3428 * 0.9937), qty=4500
...

### 示例2 (新版: entryGapValue=0, entry 0 在参考价)
referencePrice = 100, arithmetic, stepValue = 5, entryGapValue = 0
→ entryBase = 100 - 0 = 100

Step 0: 100 (= entryBase), qty=0.1
Step 1: 95 (= 100 - 5*1), qty=0.1
Step 2: 90 (= 100 - 5*2), qty=0.1

### 示例3 (新版: 不同的 gap 类型和值)
referencePrice = 100, geometric steps stepValue=2%, arithmetic gap entryGapValue=10
→ entryBase = 100 - 10 = 90

Step 0: 90 (= 90 * 0.98^0), qty=0.1
Step 1: 88.2 (= 90 * 0.98^1), qty=0.1
Step 2: 86.436 (= 90 * 0.98^2), qty=0.1
```

---

## 4. Entry 逻辑

Sequential 模式 — 同时只有一个 entry BUY 限价单：

1. Step 0 成交后才挂 Step 1，依次类推
2. 挂单前检查：remainingPositionCapacity >= step.qty 且 remainingInvestmentCapacity >= step.price × step.qty
3. Entry 被取消（未成交）→ 允许重新挂同 step
4. Entry 部分成交 → 保留部分成交，更新 VWAP/TP，继续等剩余成交或下一步

---

## 5. TP 逻辑

### 价格计算

- Absolute: `tpPrice = VWAP + tpAbsoluteProfit / inventoryQty`
- Percent: `tpPrice = VWAP × (1 + tpPercent / 100)`

### 数量

`tpQty = inventoryQty - tpFilledQty`（当前 cycle TP 已部分卖出量）

### 价格保护

`tpPrice = max(ask0, computedTpPrice)`

- ask0 来自 orderbook 订阅（框架投递）
- 如果 ask0 > 计算价 → 用 ask0（立即成交，锁定更好价格）
- 如果 ask0 <= 计算价 → 用计算价（挂 maker 等价格上涨）

### 更新触发

- Entry 完全成交 → 立即更新 TP
- Entry 部分成交 → 2s debounce 后更新 TP
- 任何时候只有 1 个活跃 TP SELL 限价单

### VWAP

`VWAP = Σ(各 entry 成交价 × 成交量) / Σ(各 entry 成交量)`

只统计本策略的 entry（BUY）订单，不含外部仓位。

---

## 6. Cycle 生命周期

```
启动 → 获取 referencePrice → buildLadder → 挂 Step 0

Step N 成交 → recalculateVWAP → 更新 TP → 挂 Step N+1

TP 完全成交 → 取消所有 entry → 取消 TP → reset state → 重新获取 referencePrice → buildLadder → 挂 Step 0 → 新 cycle
```

---

## 7. Reset Interval

条件：只有 entry 0（NEW 未成交）+ 无 TP + 超过 resetInterval 分钟

操作：取消 entry 0 → 重新获取 bid0 → 重建 ladder → 挂新 Step 0

---

## 8. 风控

| 检查              | 公式                                           | 动作         |
| ----------------- | ---------------------------------------------- | ------------ |
| 仓位上限          | inventoryQty + pendingBuyQty >= maxPosition    | 不挂新 entry |
| 资金上限          | committedNotional >= maxInvestment × leverage  | 不挂新 entry |
| committedNotional | inventoryQty × VWAP + Σ(未成交 entry notional) | —            |

---

## 9. Restart Recovery

框架在策略启动时调用 `processInitialData(initialData)`，其中包含：

- `openOrders` — 当前挂单
- `orderHistory` — 最近成交记录
- `positions` — 当前仓位
- `orderBook` — bid0/ask0（当 basePrice=0）
- `balance` — 余额

策略通过 clientOrderId 前缀过滤自己的订单，然后：

1. 确定 referencePrice：
   - 有活跃 TP → 从 TP 反推 VWAP → 反推 referencePrice
   - 有活跃 entry 无 TP → 从 entry 价格匹配 ladder step 反推
   - 都没有 → 用 bid0
2. buildLadder()
3. 匹配 open orders 到 ladder steps（价格匹配）
4. recalculateVWAP()（从 FILLED order + orderHistory）
5. inventory > 0 但无 TP → 挂 TP
6. 有未填满 step → 挂 entry

### 注意

- clientOrderId 中的序号是全局递增序号，**不是** ladder step index
- 反推 referencePrice 时必须用价格匹配，不能用序号

---

## 10. clientOrderId 格式

```
Entry:  E{strategyId}D{globalSeq}D{unixTimestampSeconds}
TP:     T{strategyId}D{globalSeq}D{unixTimestampSeconds}
```

globalSeq 是全局递增序号，不是 step index。最长 32 字符，字母数字。

---

## 11. 已知问题

1. **referencePrice 反推 bug**：用 clientOrderId 全局序号当 stepIndex → 序号超过 ladder 步数时反推出错误 referencePrice → entry 价格远高于市场
2. **TP ghost bug**：cancel+replace 的 replace 失败时策略不感知 → tpClientOrderId 指向不存在的 order → 不挂新 TP
3. **复杂度过高**：3000+ 行，edge case 处理相互耦合
4. **update signal**：cancel+place 合并，失败时无法单独重试

---

## 12. 新版本要求

1. **简化架构**：目标 < 1000 行
2. **分拆 signal**：cancel 和 place 分开，各自可独立重试
3. **失败重试**：所有 signal 操作失败后自动重试（指数退避，3 次）
4. **State Machine**：IDLE → ENTRY_PLACED → ENTRY_FILLED → TP_PLACED → TP_FILLED → CYCLE_RESET → IDLE
5. **幂等性**：每个操作可安全重复
6. **可测试**：每个核心逻辑可独立单测
7. **Restart Recovery**：以框架提供的 initialData 为准，完整恢复

---

## 13. 关键约束

1. TP 价格绝不能低于 VWAP（亏本卖）
2. TP 价格不能高于 ask1（无法成交）
3. 同时只有一个 entry 挂单
4. 同时只有一个 TP 挂单
5. 只操作本策略订单（clientOrderId 前缀过滤）
6. Restart 后状态以框架提供的 exchange 数据为准

---

## 14. TP 计算示例

```
absolute 模式: tpAbsoluteProfit=5
Entry: 3000 @ 0.3603, 4500 @ 0.3580
VWAP = (3000×0.3603 + 4500×0.358) / 7500 = 0.35892
tpPrice = 0.35892 + 5/7500 = 0.35959
ask0 = 0.345 → tpPrice > ask0 → 挂 0.35959 maker 单

percent 模式: tpPercent=1
tpPrice = 0.35892 × 1.01 = 0.36251
```
