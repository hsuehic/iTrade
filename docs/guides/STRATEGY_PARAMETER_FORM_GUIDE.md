# 🎯 策略参数表单使用指南

## 📋 概述

新的策略参数表单为每种策略类型提供了专门的输入界面，让用户能够更直观地配置策略参数，无需手动编辑JSON。

## ✨ 主要功能

### 🔧 智能表单模式

- **策略特定参数**: 每种策略类型显示相应的参数输入框
- **参数说明**: 每个参数都有详细的描述和默认值
- **类型验证**: 自动验证参数类型和范围
- **实时预览**: 参数变化时实时更新JSON

### 🔄 双模式切换

- **表单模式** (默认): 用户友好的输入界面
- **JSON模式**: 高级用户可直接编辑JSON

### 📊 支持的策略类型

#### 1. Moving Average Strategy (移动平均策略)
- **Fast Period**: 短期移动平均周期 (2-100, 默认: 12)
- **Slow Period**: 长期移动平均周期 (3-200, 默认: 26)
- **Signal Threshold**: 信号阈值 (0-0.1, 默认: 0.001)

#### 2. RSI Strategy (相对强弱指标策略)
- **RSI Period**: RSI计算周期 (2-50, 默认: 14)
- **Overbought Level**: 超买水平 (50-95, 默认: 70)
- **Oversold Level**: 超卖水平 (5-50, 默认: 30)

#### 3. Custom Strategy (自定义策略)
- 提示用户使用JSON模式进行高级配置

## 🚀 使用方法

### 📱 在Web界面中

1. **访问策略页面**: 导航到策略管理页面
2. **创建新策略**: 点击"Create New Strategy"按钮
3. **选择策略类型**: 在Strategy Type下拉菜单中选择策略
4. **配置参数**: 
   - 默认使用表单模式，填写各个参数
   - 如需高级配置，点击"JSON Mode"切换
5. **查看说明**: 每个参数都有说明文字和默认值
6. **风险提示**: 自动显示策略相关的风险因素

### 🔧 表单功能详解

#### 参数输入
```tsx
// 数字参数 - 自动类型验证
<Input 
  type="number"
  min={2} max={100}
  value={12}
/>

// 布尔参数 - 开关控制
<Switch 
  checked={true}
  onCheckedChange={handleChange}
/>

// 选择参数 - 下拉菜单
<Select value="rest">
  <SelectItem value="rest">REST Polling</SelectItem>
  <SelectItem value="websocket">WebSocket Stream</SelectItem>
</Select>
```

#### 订阅设置
- **Ticker Data**: 实时价格和成交量数据
- **Kline Data**: K线/OHLCV数据用于技术分析  
- **Data Method**: REST轮询 vs WebSocket流

#### 风险提示
自动显示每种策略的风险因素，如：
- 延迟指标可能导致入场时机滞后
- 横盘市场表现不佳
- 强趋势市场中的假信号

## 🎨 用户体验改进

### ✅ 优势

1. **零门槛使用**: 不需要了解JSON格式
2. **参数说明**: 每个参数都有清晰的描述
3. **默认值**: 提供专业的默认配置
4. **实时验证**: 输入时即时检查参数有效性
5. **风险意识**: 自动显示策略风险

### 🎯 界面特色

- **直观的图标**: 每种策略都有独特图标
- **颜色编码**: 必填参数用红色标记
- **响应式布局**: 支持桌面和移动端
- **暗黑模式**: 完整支持主题切换

## 🔧 开发者指南

### 添加新策略参数表单

在 `StrategyParameterFormSimple.tsx` 中添加新的渲染函数：

```tsx
const renderNewStrategyParams = () => (
  <div className="grid gap-4">
    <div className="space-y-2">
      <Label htmlFor="newParam">
        New Parameter <span className="text-red-500">*</span>
      </Label>
      <Input
        type="number"
        value={parameters.newParam as number || 50}
        onChange={(e) => handleParameterChange('newParam', Number(e.target.value))}
        min={1}
        max={100}
      />
      <p className="text-xs text-muted-foreground">
        Parameter description (default: 50)
      </p>
    </div>
  </div>
);

// 在 renderParametersByType 中添加 case
case 'new_strategy':
  return renderNewStrategyParams();
```

### 参数验证

```tsx
const validateParameter = (name: string, value: unknown) => {
  switch (name) {
    case 'fastPeriod':
      return typeof value === 'number' && value >= 2 && value <= 100;
    case 'slowPeriod': 
      return typeof value === 'number' && value >= 3 && value <= 200;
    default:
      return true;
  }
};
```

## 📈 未来规划

### 🚧 待实现功能

1. **参数关联验证**: 如 fastPeriod < slowPeriod
2. **参数历史**: 保存用户常用的参数配置
3. **预设模板**: 提供策略参数预设
4. **参数优化建议**: 基于历史数据的参数推荐
5. **回测集成**: 直接在表单中运行参数回测

### 🎯 策略支持扩展

- **MACD Strategy**: MACD指标策略
- **Bollinger Bands**: 布林带策略  
- **Grid Trading**: 网格交易策略
- **DCA Strategy**: 定投策略
- **Arbitrage**: 套利策略

## 🎉 总结

新的策略参数表单大大降低了策略配置的门槛：

- **✅ 用户友好**: 图形界面替代JSON编辑
- **✅ 专业指导**: 详细参数说明和风险提示
- **✅ 灵活切换**: 表单模式与JSON模式无缝切换
- **✅ 类型安全**: 自动参数验证和类型检查
- **✅ 扩展性强**: 易于添加新策略类型

现在创建策略变得像填写表单一样简单！🚀
