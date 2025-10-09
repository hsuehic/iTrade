# 文档使用指南

## 🎯 快速查找

### 我想...

**开始使用项目**
→ [项目快速启动](./PROJECT_QUICK_START.md)

**运行 Console 应用**
→ [Console 快速启动](../../apps/console/docs/QUICK_START.md)

**管理交易策略**
→ [策略管理指南](./STRATEGY_MANAGEMENT_GUIDE.md)

**查看常用命令**
→ [运行命令参考](./RUN_COMMANDS.md)

**了解订单同步**
→ [OrderSync 快速参考](../../packages/core/docs/ORDER_SYNC_SUMMARY.md)

**解决问题**
→ [故障排查](../TROUBLESHOOTING.md)

**查看改进历史**
→ [开发文档](../development/)

**API 参考**
→ [API 文档](../API-REFERENCE-MARKET-DATA.md)

---

## 📂 文档结构

```
docs/
├── README.md                # 📖 文档中心（从这里开始）
├── guides/                  # 👤 用户指南
├── development/             # 🛠️  开发文档
├── api/                     # 🔌 API 参考
└── architecture/            # 🏗️  架构设计

apps/{app}/docs/             # 📱 应用文档
└── console/docs/            # Console 应用

packages/{package}/docs/     # 📦 包文档
└── core/docs/               # Core 包
```

---

## 🚀 新手指南

### 第一次使用？

1. **阅读**：[项目快速启动](./PROJECT_QUICK_START.md)
2. **启动**：[Console 快速启动](../../apps/console/docs/QUICK_START.md)
3. **学习**：[策略管理指南](./STRATEGY_MANAGEMENT_GUIDE.md)
4. **参考**：[运行命令](./RUN_COMMANDS.md)

### 遇到问题？

1. **查看**：[故障排查](../TROUBLESHOOTING.md)
2. **搜索**：在 [文档中心](../README.md) 搜索关键词
3. **反馈**：提交 Issue

---

## 💡 文档规则

创建新文档时，遵循 [.cursorrules](../../.cursorrules)：

### 位置选择
- **应用文档** → `apps/{app}/docs/`
- **包文档** → `packages/{package}/docs/`
- **项目文档** → `docs/{category}/`

### 文档类型
- **Quick Start** → `apps/{app}/docs/QUICK_START.md`
- **用户指南** → `docs/guides/`
- **开发文档** → `docs/development/`
- **API 文档** → `docs/api/` 或 `packages/{package}/docs/`
- **架构文档** → `docs/architecture/`

---

## 📚 推荐阅读顺序

### 1. 入门阶段
1. [项目快速启动](./PROJECT_QUICK_START.md)
2. [Console 快速启动](../../apps/console/docs/QUICK_START.md)
3. [运行命令](./RUN_COMMANDS.md)

### 2. 进阶阶段
1. [策略管理指南](./STRATEGY_MANAGEMENT_GUIDE.md)
2. [OrderSync 总结](../../packages/core/docs/ORDER_SYNC_SUMMARY.md)
3. [API 参考](../API-REFERENCE-MARKET-DATA.md)

### 3. 深入理解
1. [Console & Web 改进](../development/CONSOLE_WEB_IMPROVEMENTS.md)
2. [OrderSync 机制](../../packages/core/docs/ORDER_SYNC_MECHANISM.md)
3. [架构文档](../architecture/)

---

## 🔍 文档索引

### 主要入口
- **[文档中心](../README.md)** - 完整文档索引
- **[Console 文档](../../apps/console/docs/README.md)** - Console 应用
- **[Core 文档](../../packages/core/docs/README.md)** - Core 包

### 按主题浏览
- [用户指南](../README.md#-用户指南-guides)
- [架构文档](../README.md#️-架构文档-architecture)
- [API 参考](../README.md#-api-参考-api-reference)
- [开发文档](../README.md#️-开发文档-development)

---

## 🎨 文档贡献

### 创建新文档

1. **确定类型**（用户指南？开发文档？）
2. **选择位置**（应用？包？项目级？）
3. **创建文件**（遵循命名规范）
4. **更新索引**（在相关 README 中添加链接）

### 文档模板

查看 [.cursorrules](../../.cursorrules) 获取模板。

---

**需要帮助？** 从 [文档中心](../README.md) 开始浏览！ 📖

