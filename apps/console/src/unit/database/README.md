# 数据库测试 (Database Tests)

测试数据库实体的 CRUD 操作和数据完整性。

## 📂 测试文件

```
database/
└── order-strategy-association.test.ts    # Order-Strategy-Exchange 关联测试
```

## 🧪 当前测试

### Order-Strategy-Exchange 关联测试

**文件：** `order-strategy-association.test.ts`

**测试目标：**
验证订单、策略和交易所之间的关联机制是否正常工作。

**测试流程：**
```
1. 初始化数据库连接
   └── 使用 TypeOrmDataManager

2. 获取或创建测试用户
   └── 从现有用户中选择或创建新用户

3. 创建测试策略
   └── 类型：MovingAverageStrategy
   └── 状态：STOPPED
   └── 交易所：binance
   └── 交易对：BTC/USDT

4. 创建 Mock Order 并关联 Strategy
   └── 设置 exchange
   └── 设置 strategyId
   └── 设置 strategyType (策略类名)
   └── 设置 strategyName (用户定义名称)
   └── 设置 clientOrderId (格式: s-{strategyId}-{timestamp})

5. 保存到数据库
   └── 使用 dataManager.saveOrder()

6. 查询并验证（不带 relation）
   └── 验证 exchange 字段
   └── 验证 strategyType 字段
   └── 验证 strategyName 字段
   └── 验证 clientOrderId 格式

7. 查询并验证（带 relation）
   └── 验证 Strategy 关联加载
   └── 验证关联的 Strategy ID 匹配
   └── 验证关联的 Strategy 信息完整

8. 按 strategyId 查询订单
   └── 验证可以正确查询到关联订单

9. 验证所有检查点
   └── 10 个验证点全部通过

10. 清理测试数据
    └── 删除测试策略
    └── 关闭数据库连接
```

**运行命令：**
```bash
npm run test:db:order-association

# 或直接运行
npx tsx src/unit/database/order-strategy-association.test.ts
```

**测试输出：**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧪 Testing Order-Strategy-Exchange Association
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 Step 1: Initialize Database Connection
✅ Database connected

📦 Step 2: Get or Create Test User
✅ Using Existing User: ID=xxx

📦 Step 3: Create Test Strategy
✅ Test Strategy Created: ID=123, Name=TEST_ORDER_ASSOC_xxx

📦 Step 4: Create Mock Order with Associations
📋 Mock Order Details:
   ID: xxx
   ClientOrderId: s-123-1234567890
   Symbol: BTC/USDT
   Exchange: binance
   StrategyId: 123
   StrategyType: MovingAverageStrategy
   StrategyName: TEST_ORDER_ASSOC_xxx

...

📦 Step 8: Verify All Associations
📊 Verification Results:
   ✅ Order Exists: true
   ✅ Exchange Set: true
   ✅ StrategyType Set: true
   ✅ StrategyName Set: true
   ✅ Strategy Relation Loaded: true
   ✅ Strategy ID Match: true
   ✅ Exchange Match: true
   ✅ StrategyType Match: true
   ✅ StrategyName Match: true
   ✅ ClientOrderId Format: true

🎉 All Checks PASSED! ✅
```

**验证点：**
1. ✅ Order 对象成功创建
2. ✅ `exchange` 字段正确设置
3. ✅ `strategyType` 字段正确设置（策略类名）
4. ✅ `strategyName` 字段正确设置（用户定义名）
5. ✅ Strategy 关联成功加载
6. ✅ Strategy ID 正确匹配
7. ✅ Exchange 名称匹配 Strategy 配置
8. ✅ StrategyType 匹配 Strategy 类型
9. ✅ StrategyName 匹配 Strategy 名称
10. ✅ ClientOrderId 格式正确（`s-{strategyId}-{timestamp}`）

## 🎯 测试意义

### Order-Strategy-Exchange 关联的重要性

**为什么需要这个关联？**

1. **订单追踪** - 知道每个订单是由哪个策略生成的
2. **性能分析** - 统计每个策略的盈亏和成功率
3. **风险管理** - 按策略限制订单数量和规模
4. **调试和审计** - 追踪订单来源和决策过程
5. **多交易所支持** - 明确订单属于哪个交易所

**关联字段说明：**

| 字段 | 类型 | 用途 | 示例 |
|------|------|------|------|
| `exchange` | String | 交易所标识 | "binance", "okx", "coinbase" |
| `strategyId` | Number | 策略 ID（FK） | 123 |
| `strategyType` | String | 策略类名 | "MovingAverageStrategy" |
| `strategyName` | String | 用户定义策略名 | "MA_BTC_SPOT" |
| `clientOrderId` | String | 客户端订单 ID | "s-123-1234567890" |
| `strategy` | Relation | TypeORM 关联 | Strategy 对象 |

## 📝 未来测试计划

以下是计划添加的数据库测试：

### Strategy CRUD 测试
- [ ] 创建策略
- [ ] 读取策略
- [ ] 更新策略参数
- [ ] 删除策略
- [ ] 按状态查询策略
- [ ] 按交易所查询策略

### Order CRUD 测试
- [ ] 创建订单
- [ ] 读取订单
- [ ] 更新订单状态
- [ ] 按 Symbol 查询订单
- [ ] 按状态查询订单
- [ ] 按时间范围查询订单

### Account Snapshot 测试
- [ ] 创建快照
- [ ] 查询最新快照
- [ ] 按时间范围查询快照
- [ ] 计算快照差异

### 数据完整性测试
- [ ] 外键约束验证
- [ ] 唯一性约束验证
- [ ] 必填字段验证
- [ ] 数据类型验证

### 并发测试
- [ ] 多个策略同时创建订单
- [ ] 事务隔离级别测试
- [ ] 死锁检测和处理

## 🔍 调试技巧

### 查看 SQL 日志

修改测试文件中的 `logging` 选项：

```typescript
const dataManager = new TypeOrmDataManager({
  // ... other options
  logging: 'all', // 或 ['query', 'error', 'schema']
});
```

### 保留测试数据

注释掉清理步骤，保留数据用于检查：

```typescript
// finally {
//   if (testStrategyId) {
//     await dataManager.deleteStrategy(testStrategyId);
//   }
// }
```

### 使用数据库客户端

使用 pgAdmin、DBeaver 等工具直接查看数据库：

```bash
# PostgreSQL 连接信息
Host: localhost
Port: 5432
Database: itrade
User: postgres
Password: (from .env)
```

## 📚 相关文档

- [单元测试总览](../README.md)
- [主文档](../../README.md)
- [Data Manager 包文档](../../../../../packages/data-manager/README.md)

---

Author: xiaoweihsueh@gmail.com  
Date: October 26, 2025

