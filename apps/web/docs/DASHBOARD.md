# Web Dashboard 使用指南

## 概述

iTrade Web Dashboard 是一个实时的交易监控和分析界面，提供：

- 📊 账户余额和资产概览
- 📈 历史数据图表和趋势分析
- 🎯 策略性能统计和排名
- 💰 交易所和交易对收益对比
- 🔄 实时数据自动刷新

## Dashboard 组件

### 1. 账户概览卡片（Trading Dashboard Cards）

显示关键的交易指标：

#### 总资产（Total Equity）
- 显示所有交易所的总资产
- 包括现金余额 + 持仓价值
- 显示本月涨跌幅百分比
- 绿色表示增长，红色表示下降

#### 未实现盈亏（Unrealized P&L）
- 当前所有开仓持仓的浮动盈亏
- 显示占总资产的百分比
- 显示当前持仓数量
- 盈利为绿色，亏损为红色

#### 活跃策略（Active Strategies）
- 显示正在运行的策略数量
- 显示策略总数
- 显示平均订单成交率

#### 策略盈亏（Strategy P&L）
- 所有策略的累计盈亏
- 显示已执行订单数量
- 显示成功成交的订单数量

### 2. 账户余额图表（Account Balance Chart）

#### 功能特性
- **多交易所对比**：在同一图表中显示多个交易所的余额变化
- **时间范围选择**：支持 7天/30天/90天 三种时间范围
- **堆叠面积图**：直观显示各交易所余额占比
- **悬浮提示**：鼠标悬停显示详细数值

#### 颜色方案
- Binance: 蓝色 (`hsl(var(--chart-1))`)
- OKX: 紫色 (`hsl(var(--chart-2))`)
- Coinbase: 绿色 (`hsl(var(--chart-3))`)

#### 数据更新
- 自动每60秒刷新一次
- 数据来源：AccountPollingService 持久化的历史快照

### 3. 策略性能表格（Strategy Performance Table）

#### Tab 1: Strategies（策略）

显示表现最好的Top 10策略：

| 列名 | 说明 | 示例 |
|------|------|------|
| Strategy | 策略名称 | Grid Trading BTC |
| Symbol | 交易对 | BTCUSDT |
| Exchange | 交易所 | Binance |
| P&L | 盈亏金额 | $500.25 |
| ROI | 投资回报率 | +15.50% |
| Orders | 订单统计 | 145/150 (96.67%) |
| Status | 策略状态 | Active/Inactive |

**颜色规则：**
- 盈利：绿色
- 亏损：红色
- Active：绿色徽章
- Inactive：灰色徽章

#### Tab 2: Exchanges（交易所）

按交易所分组的统计：

| 列名 | 说明 |
|------|------|
| Exchange | 交易所名称 |
| Total Strategies | 该交易所上的策略总数 |
| Active | 活跃策略数量 |
| Total P&L | 该交易所上所有策略的总盈亏 |
| Avg P&L | 平均每个策略的盈亏 |

**用途：**
- 对比不同交易所的表现
- 识别最profitable的交易所
- 优化资金分配

#### Tab 3: Symbols（交易对）

按交易对分组的统计：

| 列名 | 说明 |
|------|------|
| Symbol | 交易对符号 |
| Total Strategies | 该交易对的策略数量 |
| Active | 活跃策略数量 |
| Total P&L | 该交易对的总盈亏 |
| Avg P&L | 平均每个策略的盈亏 |

**用途：**
- 识别最profitable的交易对
- 发现表现不佳的交易对
- 调整策略配置

## 数据刷新

### 自动刷新策略

- **卡片数据**：每30秒刷新
- **图表数据**：每60秒刷新
- **表格数据**：每60秒刷新

### 手动刷新

刷新浏览器页面即可获取最新数据。

## 响应式设计

Dashboard 采用响应式设计，适配不同屏幕尺寸：

### 桌面端（大屏）
- 4列卡片布局
- 完整的图表和表格
- 所有数据列显示

### 平板（中屏）
- 2列卡片布局
- 简化的图表控件
- 主要数据列显示

### 移动端（小屏）
- 1列卡片布局
- 紧凑的图表
- 精简的表格列

## 使用场景

### 1. 日常监控

**目标**：快速了解账户状态

**步骤**：
1. 打开 Dashboard
2. 查看总资产卡片，确认账户安全
3. 检查未实现盈亏，评估当前持仓状况
4. 查看活跃策略数量，确保策略正常运行

### 2. 性能分析

**目标**：评估策略表现，优化配置

**步骤**：
1. 切换到 Strategies 标签
2. 查看 Top 10 策略排名
3. 识别高ROI和高成交率的策略
4. 关停表现不佳的策略
5. 复制成功策略的配置

### 3. 资金分配

**目标**：优化资金在不同交易所的分配

**步骤**：
1. 切换到 Exchanges 标签
2. 对比各交易所的总盈亏和平均盈亏
3. 将更多资金分配到高收益交易所
4. 减少在低收益交易所的仓位

### 4. 交易对选择

**目标**：发现profitable的交易机会

**步骤**：
1. 切换到 Symbols 标签
2. 查看各交易对的表现
3. 增加在高收益交易对上的策略
4. 停止或优化亏损交易对的策略

### 5. 趋势分析

**目标**：理解资产变化趋势

**步骤**：
1. 查看 Account Balance Chart
2. 选择合适的时间范围（7d/30d/90d）
3. 观察余额变化趋势
4. 识别异常波动点
5. 调整交易策略

## 数据来源

### API 端点

Dashboard 从以下 API 获取数据：

#### `/api/analytics/account`
提供账户概览和历史数据

**请求参数：**
- `period`: '7d' | '30d' | '90d'
- `exchange`: 交易所名称或 'all'

**数据更新频率：**
- 实时数据：AccountPollingService 每60秒更新
- API 响应：实时查询数据库

#### `/api/analytics/strategies`
提供策略性能统计

**请求参数：**
- `limit`: 返回top策略的数量

**数据更新频率：**
- 订单数据：实时更新
- P&L计算：实时计算

### 数据流

```
AccountPollingService (Console)
        ↓
    Database
        ↓
   API Routes
        ↓
  React Components
        ↓
  User Interface
```

## 性能优化

### 前端优化

1. **数据缓存**
   - 使用 React 状态管理避免重复请求
   - 设置合理的刷新间隔

2. **懒加载**
   - 图表组件按需加载
   - 大型表格使用虚拟滚动

3. **响应式图表**
   - 使用 Recharts 库的优化功能
   - 限制数据点数量

### 后端优化

1. **数据库查询**
   - 使用索引加速查询
   - 预计算统计数据

2. **API 缓存**
   - 考虑添加 Redis 缓存层
   - 设置合理的缓存过期时间

## 常见问题

### Q1: Dashboard 显示 "No data available"

**原因**：
- AccountPollingService 未启动
- 数据库中没有数据
- API 连接失败

**解决方案**：
1. 确认 Console 应用正在运行
2. 检查 AccountPollingService 是否已启动
3. 查看浏览器控制台的错误信息

### Q2: 数据显示不准确

**原因**：
- 数据延迟
- 计算错误
- 数据同步问题

**解决方案**：
1. 刷新页面获取最新数据
2. 检查 Console 日志中的错误
3. 验证数据库数据的准确性

### Q3: 图表加载缓慢

**原因**：
- 数据量过大
- 网络延迟
- 服务器性能问题

**解决方案**：
1. 减少时间范围（从90天改为30天）
2. 优化数据库查询
3. 考虑添加缓存层

### Q4: 颜色显示异常

**原因**：
- 主题配置问题
- CSS 变量未定义

**解决方案**：
1. 检查 `tailwind.config.ts` 配置
2. 确认主题切换功能正常
3. 清除浏览器缓存

## 自定义配置

### 更改刷新间隔

编辑组件文件：

```typescript
// components/trading-dashboard-cards.tsx
const interval = setInterval(fetchData, 30000); // 改为30秒

// components/account-balance-chart.tsx
const interval = setInterval(fetchData, 120000); // 改为2分钟
```

### 更改Top策略数量

```typescript
// components/strategy-performance-table.tsx
const response = await fetch('/api/analytics/strategies?limit=20'); // 改为20个
```

### 自定义颜色主题

编辑 `tailwind.config.ts`：

```typescript
theme: {
  extend: {
    colors: {
      chart: {
        1: 'hsl(220, 70%, 50%)',  // Binance - 蓝色
        2: 'hsl(280, 70%, 50%)',  // OKX - 紫色
        3: 'hsl(140, 70%, 50%)',  // Coinbase - 绿色
      }
    }
  }
}
```

## 未来改进

### 计划中的功能

- 📱 移动端优化
- 🔔 实时告警通知
- 📊 更多图表类型（饼图、K线图等）
- 🎨 自定义 Dashboard 布局
- 📥 数据导出功能
- 🔍 高级筛选和搜索
- 📈 更多性能指标（夏普比率、最大回撤等）

## 相关文档

- [Account Polling Service](../../packages/core/docs/ACCOUNT_POLLING_SERVICE.md)
- [Strategy Management Guide](../../docs/guides/STRATEGY_MANAGEMENT_GUIDE.md)
- [API Reference](../../docs/api/)

