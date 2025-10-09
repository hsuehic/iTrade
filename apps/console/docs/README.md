# Console 应用文档

iTrade Console - 命令行交易应用

## 📚 文档

- **[快速启动指南](./QUICK_START.md)** - 如何启动和使用 Console 应用

## 🎯 Console 应用概述

Console 应用是 iTrade 的命令行版本，提供完整的交易功能：

### 核心功能

- ✅ 数据库驱动的策略管理
- ✅ 实时策略执行
- ✅ 自动订单追踪
- ✅ 订单状态同步（防止 WebSocket 失败）
- ✅ 性能监控和报告
- ✅ 多交易所支持

### 主要组件

1. **TradingEngine** - 交易引擎核心
2. **StrategyManager** - 策略管理器（从数据库加载）
3. **OrderTracker** - 订单追踪器
4. **OrderSyncService** - 订单状态同步服务

## 🚀 快速开始

```bash
cd apps/console
pnpm dev
```

详见：[快速启动指南](./QUICK_START.md)

## 📊 特性亮点

### 1. 数据库驱动
- 策略从 PostgreSQL 加载
- 每秒检查策略更新
- 自动添加/移除策略

### 2. 实时监控
- 策略信号追踪
- 订单生命周期监控
- 每 60 秒性能报告

### 3. 可靠性保障
- 订单状态同步（每 5 秒）
- WebSocket 失败自动恢复
- 应用重启状态恢复

## 🔗 相关文档

- [项目快速启动](../../../docs/guides/PROJECT_QUICK_START.md)
- [运行命令](../../../docs/guides/RUN_COMMANDS.md)
- [Console & Web 改进](../../../docs/development/CONSOLE_WEB_IMPROVEMENTS.md)
- [OrderSyncService 文档](../../../packages/core/docs/)

---

**需要帮助？** 查看[快速启动指南](./QUICK_START.md)或[故障排查](../../../docs/TROUBLESHOOTING.md)

