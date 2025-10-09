# 移动端策略功能增强版

## 新增功能

### 1. 搜索功能 ✅
**参考**: `apps/mobile/lib/screens/product.dart`

#### 实现细节
- 使用 `SimpleSearchBar` 组件
- 支持按名称、Symbol、Exchange 模糊搜索
- 实时过滤结果
- 搜索关键词不区分大小写

#### 用户体验
```
┌──────────────────────────────────┐
│  🔍 Search...                    │
└──────────────────────────────────┘
```

输入 "BTC" → 显示所有包含 BTC 的策略
输入 "binance" → 显示所有使用 binance 交易所的策略

### 2. 排序功能 ✅

#### 排序选项
- **按名称排序** (Name): A-Z 或 Z-A
- **按 PnL 排序** (PnL): 从高到低或从低到高
- **按状态排序** (Status): Active/Stopped/Paused/Error

#### UI 设计
```
Sort by: [Name ↑] [PnL] [Status]
```

点击已选中的按钮可切换升序/降序：
- ↑ = 升序
- ↓ = 降序

### 3. 加密货币图标 ✅
**参考**: `apps/mobile/lib/screens/product.dart`

#### 实现
- 使用 OKX CDN 提供的加密货币图标
- 自动从 Symbol 提取 base currency
- 支持多种格式：BTC/USDT、BTCUSDT 等
- 错误降级：显示默认图标

#### 图标 URL
```dart
https://static.coinall.ltd/cdn/oksupport/asset/currency/icon/{SYMBOL}.png
```

示例：
- BTC → `https://.../BTC.png`
- ETH → `https://.../ETH.png`

### 4. 策略详情 - 订单列表 ✅

#### 订单信息展示
每个订单显示：
1. **加密货币图标** - 基础货币的图标
2. **Symbol** - 交易对 (e.g., BTC/USDT)
3. **Buy/Sell 标签** - 绿色(Buy) 或 红色(Sell)
4. **状态徽章** - Filled/Partial/Canceled/Rejected
5. **数量** - 已成交/总数量 (e.g., 0.5/1.0)
6. **价格** - 平均成交价或委托价
7. **时间** - 相对时间 (e.g., "2h ago")
8. **PnL** - 已实现盈亏（如果有）

#### 订单项布局
```
┌──────────────────────────────────────┐
│ [图标] BTC/USDT [BUY]    [Filled]   │
│        Qty: 0.5/1.0       $45,123    │
│        2h ago             +$123.45   │
└──────────────────────────────────────┘
```

#### 颜色编码
- **Buy**: 绿色背景
- **Sell**: 红色背景
- **Filled**: 绿色徽章
- **Partial**: 橙色徽章
- **Canceled**: 灰色徽章
- **Rejected**: 红色徽章
- **PnL**: 绿色(盈利) / 红色(亏损)

## 新增文件

### 1. 数据模型
#### `apps/mobile/lib/models/order.dart`
```dart
class Order {
  final String id;
  final String symbol;
  final String side;  // BUY/SELL
  final String status;
  final double quantity;
  final double executedQuantity;
  final double? price;
  final double? averagePrice;
  final double? realizedPnl;
  final DateTime timestamp;
  
  bool get isFilled;
  bool get isBuy;
  String get baseCurrency;  // 从 symbol 提取
}
```

### 2. 服务层
#### `apps/mobile/lib/services/order_service.dart`
```dart
class OrderService {
  Future<List<Order>> getOrders({
    int? strategyId,
    String? symbol,
    String? status,
  });
  
  Future<Order?> getOrder(String id);
}
```

### 3. 工具类
#### `apps/mobile/lib/utils/crypto_icons.dart`
```dart
class CryptoIcons {
  static String getIconUrl(String symbol);
  static String _extractBaseCurrency(String symbol);
}
```

## 修改文件

### 1. 策略列表页面
**文件**: `apps/mobile/lib/screens/strategy.dart`

#### 新增状态
```dart
List<Strategy> _allStrategies;      // 所有策略
List<Strategy> _filteredStrategies; // 过滤后的策略
String _searchQuery;                 // 搜索关键词
SortBy _sortBy;                      // 当前排序方式
bool _sortAscending;                 // 升序/降序
```

#### 新增方法
- `_applyFiltersAndSort()` - 应用过滤和排序
- `_handleSearch(String query)` - 处理搜索
- `_handleSortChange(SortBy sortBy)` - 处理排序
- `_extractBaseCurrency(String? symbol)` - 提取基础货币

#### UI 改进
1. 添加了搜索栏
2. 添加了排序按钮行
3. 策略卡片显示加密货币图标
4. 优化了卡片布局

### 2. 策略详情页面
**文件**: `apps/mobile/lib/screens/strategy_detail.dart`

#### 新增状态
```dart
List<Order> _orders;
bool _isLoadingOrders;
```

#### 新增方法
- `_loadOrders()` - 加载订单数据

#### 新增组件
- `_OrderItem` - 订单项组件
  - 显示加密货币图标
  - 显示完整订单信息
  - 颜色编码状态和 PnL
  - 相对时间显示

#### UI 布局
在性能卡片和参数卡片之间插入订单列表卡片：
```
┌─────────────────────────────────┐
│ Orders              10 total    │
├─────────────────────────────────┤
│ [订单1]                         │
│ [订单2]                         │
│ ...                             │
│ Showing first 10 of 50 orders   │
└─────────────────────────────────┘
```

## 后端 API

### 新增路由
**文件**: `apps/web/app/api/orders/route.ts`

```typescript
GET /api/orders
Query Parameters:
  - strategyId?: number
  - symbol?: string
  - status?: string
  - startDate?: string (ISO 8601)
  - endDate?: string (ISO 8601)

Response: Order[]
```

## 功能对比

### 之前
```
策略列表:
- 简单的卡片列表
- 无搜索功能
- 无排序功能
- 状态指示点
- 基本的 PnL 显示

详情页:
- 策略信息
- PnL 指标
- 参数配置
- 启动/停止按钮
```

### 之后
```
策略列表:
✅ 搜索栏 (支持名称/Symbol/Exchange)
✅ 排序按钮 (Name/PnL/Status)
✅ 加密货币图标
✅ 优化的卡片布局
✅ 实时过滤

详情页:
✅ 所有之前的功能
✅ 订单列表
✅ 每个订单显示：
   - 加密货币图标
   - Symbol + Buy/Sell 标签
   - 状态徽章
   - 数量和价格
   - 时间和 PnL
```

## 使用示例

### 搜索策略
1. 在搜索栏输入关键词
2. 自动过滤匹配的策略
3. 清空搜索栏显示所有策略

### 排序策略
1. 点击 "Name" 按钮 → 按名称 A-Z 排序
2. 再次点击 "Name" → 切换为 Z-A 排序
3. 点击 "PnL" 按钮 → 按 PnL 从高到低排序
4. 点击 "Status" 按钮 → 按状态排序

### 查看订单
1. 进入策略详情页
2. 滚动到订单部分
3. 查看最近 10 个订单
4. 每个订单显示完整信息

## 技术亮点

### 1. 性能优化
- 搜索和排序在本地内存中进行
- 图片懒加载和错误降级
- 订单列表限制显示数量（最多10个）

### 2. 用户体验
- 实时搜索反馈
- 直观的排序指示器
- 清晰的视觉层次
- 响应式的状态变化
- 相对时间显示更友好

### 3. 代码质量
- 分离关注点（Model/Service/UI）
- 可复用的组件（CryptoIcons, SimpleSearchBar）
- 类型安全（Dart 强类型）
- 清晰的命名和注释

## 测试场景

### 搜索功能
1. 输入完整策略名称 → 应该只显示该策略
2. 输入部分名称 → 应该显示所有匹配的策略
3. 输入 Symbol → 应该显示使用该交易对的策略
4. 输入不存在的关键词 → 显示"No strategies found"
5. 清空搜索 → 显示所有策略

### 排序功能
1. 按名称升序 → 策略按字母顺序排列
2. 按 PnL 降序 → 盈利最多的在前
3. 切换排序方向 → 箭头图标改变

### 订单显示
1. 有订单 → 显示订单列表
2. 无订单 → 显示"No orders yet"
3. 超过10个订单 → 显示"Showing first 10 of X orders"
4. Buy 订单 → 绿色标签
5. Sell 订单 → 红色标签
6. Filled 订单 → 绿色徽章
7. 有 PnL → 显示盈亏

## 未来改进

### 搜索
- [ ] 高级过滤器（状态、交易所、日期范围）
- [ ] 搜索历史
- [ ] 搜索建议

### 排序
- [ ] 按创建时间排序
- [ ] 按最后运行时间排序
- [ ] 自定义排序

### 订单
- [ ] 分页加载更多订单
- [ ] 订单详情页面
- [ ] 订单筛选（状态、日期）
- [ ] 订单统计图表

### 其他
- [ ] 下拉刷新
- [ ] 骨架屏加载状态
- [ ] 实时数据更新（WebSocket）
- [ ] 离线缓存

## 总结

✅ **搜索功能**: 支持多字段模糊搜索
✅ **排序功能**: 三种排序方式，双向排序
✅ **加密货币图标**: 自动加载，优雅降级
✅ **订单列表**: 完整信息展示，美观易读
✅ **代码质量**: 结构清晰，类型安全
✅ **用户体验**: 流畅交互，视觉友好

🎉 **移动端策略管理功能全面升级完成！**

