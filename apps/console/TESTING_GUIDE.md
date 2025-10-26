# iTrade Console 测试运行指南

## 🔧 运行方式说明

iTrade Console 的测试代码使用两种不同的运行方式：`tsx` 和 `ts-node`。选择正确的运行方式对于测试能否成功执行至关重要。

### ⚡ tsx - 快速运行（推荐用于不涉及 TypeORM 的测试）

**适用场景：**
- ✅ 交易所 WebSocket 测试
- ✅ 交易所 REST API 测试
- ✅ 不涉及数据库操作的工具脚本
- ✅ 纯逻辑测试（不使用装饰器）

**优点：**
- 启动速度快
- 开发体验好
- 内存占用少

**限制：**
- ❌ 不完全支持 TypeORM 装饰器
- ❌ 不完全支持 `reflect-metadata`
- ❌ 会导致装饰器相关的运行时错误

### 🔨 ts-node - 完整支持（必须用于涉及 TypeORM 的测试）

**适用场景：**
- ✅ 数据库 CRUD 测试
- ✅ 集成测试（涉及 TradingEngine + 数据库）
- ✅ 涉及 TypeORM Entity 的任何代码
- ✅ 需要 reflect-metadata 完整支持的代码

**优点：**
- 完整支持 TypeORM 装饰器
- 完整支持 reflect-metadata
- 与生产环境行为一致

**缺点：**
- 启动稍慢
- 命令行较长

---

## 📋 测试分类与运行方式

### ✅ 使用 tsx 运行的测试

#### 交易所测试（单元测试）

```bash
# WebSocket 测试
npm run test:binance        # Binance WebSocket
npm run test:okx            # OKX WebSocket
npm run test:coinbase       # Coinbase WebSocket

# REST API 测试
npm run test:binance-rest   # Binance REST
npm run test:okx-rest       # OKX REST
npm run test:coinbase-rest  # Coinbase REST

# 特殊测试
npm run test:okx-order      # OKX 创建订单
npm run test:okx-permissions # OKX 权限测试

# 批量测试
npm run test:all-ws         # 所有 WebSocket
npm run test:all-rest       # 所有 REST
npm run test:all-exchanges  # 所有交易所
```

**运行命令格式：**
```bash
tsx src/unit/exchanges/{exchange}/{test-file}.test.ts
```

#### 订阅协调器测试（集成测试）

```bash
npm run test:subscription   # 订阅协调器测试
```

#### 策略执行测试（集成测试 - 不直接使用数据库）

```bash
npm run test:strategy-execution
```

#### 工具脚本（部分）

```bash
npm run tool:diagnose-auth  # API 认证诊断
npm run tool:get-ip         # 获取公网 IP
```

---

### ✅ 使用 ts-node 运行的测试

#### 数据库测试（单元测试）

```bash
npm run test:db:order-association
```

**运行命令格式：**
```bash
NODE_ENV=development \
TS_NODE_PROJECT=tsconfig.build.json \
TS_NODE_FILES=true \
NODE_OPTIONS="--conditions=source" \
node -r ts-node/register \
     -r tsconfig-paths/register \
     -r reflect-metadata \
     src/unit/database/order-strategy-association.test.ts
```

**为什么需要这些参数？**
- `NODE_ENV=development` - 设置开发环境
- `TS_NODE_PROJECT=tsconfig.build.json` - 指定 TypeScript 配置
- `TS_NODE_FILES=true` - 启用文件解析
- `NODE_OPTIONS="--conditions=source"` - 启用源码条件
- `-r ts-node/register` - 注册 TypeScript 支持
- `-r tsconfig-paths/register` - 支持路径别名（`@itrade/*`）
- `-r reflect-metadata` - 启用元数据反射（TypeORM 装饰器必需）

#### 集成测试（涉及数据库）

```bash
npm run test:trading-engine  # TradingEngine 完整流程
npm run dev                   # 同上（开发快捷方式）
```

**为什么 TradingEngine 测试必须用 ts-node？**
- 依赖 `TypeOrmDataManager`
- 依赖 `StrategyManager`（使用数据库）
- 依赖 `OrderTracker`（保存订单到数据库）
- 需要加载和保存 Strategy Entity

#### 工具脚本（涉及数据库）

```bash
npm run tool:init-history    # 初始化历史数据
npm run cron                  # 账户轮询服务
```

**为什么这些工具必须用 ts-node？**
- 直接操作 TypeORM Entity
- 保存快照到数据库
- 查询和更新数据库记录

---

## 🚨 常见错误与解决方案

### 错误 1: TypeORM 装饰器错误

**错误信息：**
```
TypeError: Cannot read properties of undefined (reading 'constructor')
    at PrimaryGeneratedColumn.ts:106:28
```

**原因：**
使用 `tsx` 运行了涉及 TypeORM 的代码。

**解决方案：**
改用 `ts-node` 运行：
```bash
# ❌ 错误
tsx src/unit/database/order-strategy-association.test.ts

# ✅ 正确
npm run test:db:order-association
```

---

### 错误 2: 找不到模块（路径别名问题）

**错误信息：**
```
Error: Cannot find module '@itrade/core'
```

**原因：**
缺少 `-r tsconfig-paths/register` 参数。

**解决方案：**
确保命令包含所有必需参数（使用 npm scripts）。

---

### 错误 3: 装饰器元数据丢失

**错误信息：**
```
Error: No metadata found
```

**原因：**
缺少 `-r reflect-metadata` 参数。

**解决方案：**
确保在命令最前面导入 `reflect-metadata`。

---

## 📊 决策树：选择运行方式

```
你的测试是否使用了以下任何一项？
├─ TypeOrmDataManager
├─ TypeORM Entity (@Entity, @Column 等装饰器)
├─ 数据库操作 (CRUD)
└─ StrategyManager / OrderTracker (间接使用数据库)
    │
    ├─ 是 → 使用 ts-node ✅
    │       npm run test:xxx (查看 package.json)
    │
    └─ 否 → 使用 tsx ⚡
            tsx src/path/to/test.ts
```

---

## 🎯 快速参考表

| 测试类型 | 运行方式 | 命令示例 | 原因 |
|---------|---------|---------|------|
| 交易所 WebSocket | tsx | `npm run test:binance` | 不涉及数据库 |
| 交易所 REST | tsx | `npm run test:binance-rest` | 不涉及数据库 |
| 数据库 CRUD | ts-node | `npm run test:db:order-association` | 使用 TypeORM Entity |
| TradingEngine | ts-node | `npm run test:trading-engine` | 使用 StrategyManager + DB |
| 订阅协调器 | tsx | `npm run test:subscription` | 不涉及数据库 |
| 策略执行 | tsx | `npm run test:strategy-execution` | 不直接使用数据库 |
| 初始化历史 | ts-node | `npm run tool:init-history` | 保存数据到数据库 |
| 账户轮询 | ts-node | `npm run cron` | 保存数据到数据库 |
| API 诊断 | tsx | `npm run tool:diagnose-auth` | 不涉及数据库 |
| 获取 IP | tsx | `npm run tool:get-ip` | 不涉及数据库 |

---

## 💡 最佳实践

### ✅ 推荐做法

1. **始终使用 npm scripts**
   ```bash
   # ✅ 正确 - 使用预定义脚本
   npm run test:trading-engine
   
   # ❌ 避免 - 手动输入长命令容易出错
   NODE_ENV=development TS_NODE_PROJECT=... node -r ...
   ```

2. **编写新测试时检查依赖**
   - 查看是否导入 `TypeOrmDataManager`
   - 查看是否导入任何 Entity
   - 如果是，添加到 package.json 并使用 ts-node

3. **遵循现有模式**
   - 交易所测试 → 放在 `unit/exchanges/` → 使用 tsx
   - 数据库测试 → 放在 `unit/database/` → 使用 ts-node
   - 集成测试 → 放在 `integration/` → 根据是否用数据库选择

4. **测试前先验证**
   ```bash
   # 快速测试导入是否正确
   tsx your-test.ts
   # 如果报 TypeORM 错误 → 改用 ts-node
   ```

### ❌ 避免的做法

1. **不要混用运行方式**
   - 同一个测试文件始终用同一种方式运行

2. **不要跳过必需参数**
   - ts-node 运行时必须包含所有参数

3. **不要在生产脚本中使用 tsx**
   - 生产环境应该使用编译后的 JavaScript

---

## 🔍 故障排查

### 步骤 1: 确认测试类型

```bash
# 检查文件导入
grep -E "TypeOrmDataManager|@itrade/data-manager" your-test.ts
```

- 有结果 → 使用 ts-node
- 无结果 → 可以使用 tsx

### 步骤 2: 查看 package.json

```bash
cat package.json | grep "your-test-name"
```

确认脚本使用的是正确的运行方式。

### 步骤 3: 运行测试

```bash
npm run test:xxx
```

如果失败，查看错误信息判断是否为运行方式问题。

### 步骤 4: 切换运行方式

如果使用 tsx 遇到 TypeORM 错误：
1. 更新 package.json 脚本
2. 改用 ts-node 格式
3. 重新运行测试

---

## 📚 相关文档

- [主文档](./src/README.md)
- [单元测试文档](./src/unit/README.md)
- [集成测试文档](./src/integration/README.md)
- [工具文档](./src/tools/README.md)

---

## 🔗 参考链接

- [tsx 文档](https://github.com/esbuild-kit/tsx)
- [ts-node 文档](https://typestrong.org/ts-node/)
- [TypeORM 装饰器](https://typeorm.io/decorator-reference)
- [reflect-metadata](https://www.npmjs.com/package/reflect-metadata)

---

Author: xiaoweihsueh@gmail.com  
Date: October 26, 2025

