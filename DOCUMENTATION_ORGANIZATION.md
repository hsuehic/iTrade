# 文档组织结构说明

## 📅 整理日期

2025-10-09

## 🎯 整理目的

将根目录的文档文件整理到合理的位置，使项目结构更清晰，文档更易于查找和维护。

---

## 📂 新的文档结构

```
iTrade/
├── .cursorrules                    # AI Agent 文档规则
├── README.md                       # 项目主文档
│
├── docs/                           # 项目级文档
│   ├── README.md                   # 文档索引
│   │
│   ├── guides/                     # 用户指南
│   │   ├── PROJECT_QUICK_START.md
│   │   ├── RUN_COMMANDS.md
│   │   └── STRATEGY_MANAGEMENT_GUIDE.md
│   │
│   ├── development/                # 开发过程文档
│   │   ├── CONSOLE_WEB_IMPROVEMENTS.md
│   │   ├── IMPLEMENTATION_SUMMARY.md
│   │   ├── IMPROVEMENTS_SUMMARY.md
│   │   ├── FINAL_SUMMARY.md
│   │   ├── MOBILE_STRATEGY_IMPLEMENTATION.md
│   │   ├── MOBILE_STRATEGY_ENHANCED.md
│   │   └── ORDER_TRACKER_FIX.md
│   │
│   ├── api/                        # API 文档
│   │   └── API-REFERENCE-MARKET-DATA.md
│   │
│   └── architecture/               # 架构文档
│       └── (现有架构文档)
│
├── apps/                           # 应用
│   ├── console/
│   │   └── docs/
│   │       ├── README.md           # Console 文档索引
│   │       └── QUICK_START.md      # Console 快速启动
│   │
│   ├── web/
│   │   └── docs/
│   │       └── README.md
│   │
│   └── mobile/
│       └── docs/
│           └── README.md
│
└── packages/                       # 包
    └── core/
        └── docs/
            ├── README.md           # Core 包文档索引
            ├── ORDER_SYNC_MECHANISM.md
            ├── ORDER_SYNC_IMPLEMENTATION.md
            ├── ORDER_SYNC_REFACTORING.md
            └── ORDER_SYNC_SUMMARY.md
```

---

## 🔄 文件移动记录

### 从根目录移动到 `apps/console/docs/`

```
CONSOLE_QUICK_START.md → apps/console/docs/QUICK_START.md
```

### 从根目录移动到 `docs/guides/`

```
RUN_COMMANDS.md → docs/guides/RUN_COMMANDS.md
STRATEGY_MANAGEMENT_GUIDE.md → docs/guides/STRATEGY_MANAGEMENT_GUIDE.md
QUICK_START.md → docs/guides/PROJECT_QUICK_START.md
```

### 从根目录移动到 `docs/development/`

```
CONSOLE_WEB_IMPROVEMENTS.md → docs/development/CONSOLE_WEB_IMPROVEMENTS.md
IMPLEMENTATION_SUMMARY.md → docs/development/IMPLEMENTATION_SUMMARY.md
IMPROVEMENTS_SUMMARY.md → docs/development/IMPROVEMENTS_SUMMARY.md
FINAL_SUMMARY.md → docs/development/FINAL_SUMMARY.md
MOBILE_STRATEGY_IMPLEMENTATION.md → docs/development/MOBILE_STRATEGY_IMPLEMENTATION.md
MOBILE_STRATEGY_ENHANCED.md → docs/development/MOBILE_STRATEGY_ENHANCED.md
ORDER_TRACKER_FIX.md → docs/development/ORDER_TRACKER_FIX.md
```

### 从根目录移动到 `packages/core/docs/`

```
ORDER_SYNC_IMPLEMENTATION.md → packages/core/docs/ORDER_SYNC_IMPLEMENTATION.md
ORDER_SYNC_MECHANISM.md → packages/core/docs/ORDER_SYNC_MECHANISM.md
ORDER_SYNC_REFACTORING.md → packages/core/docs/ORDER_SYNC_REFACTORING.md
ORDER_SYNC_SUMMARY.md → packages/core/docs/ORDER_SYNC_SUMMARY.md
```

---

## 📝 新增文件

### AI Agent 规则

- `.cursorrules` - AI 文档生成规则，指导 AI 将文档放到正确位置

### README 索引文件

- `docs/README.md` - 文档中心索引
- `apps/console/docs/README.md` - Console 应用文档索引
- `packages/core/docs/README.md` - Core 包文档索引

---

## 🎯 文档分类规则

### 1. 用户指南 (`docs/guides/`)

**适用于**：

- 快速启动指南
- 使用教程
- 最佳实践
- 操作指南

**示例**：

- `PROJECT_QUICK_START.md`
- `RUN_COMMANDS.md`
- `STRATEGY_MANAGEMENT_GUIDE.md`

### 2. 开发文档 (`docs/development/`)

**适用于**：

- 实现总结
- 改进记录
- 迁移指南
- Bug 修复文档
- 开发过程记录

**示例**：

- `CONSOLE_WEB_IMPROVEMENTS.md`
- `IMPLEMENTATION_SUMMARY.md`
- `ORDER_TRACKER_FIX.md`

### 3. API 文档 (`docs/api/`)

**适用于**：

- API 参考
- 接口文档
- 协议规范

**示例**：

- `API-REFERENCE-MARKET-DATA.md`

### 4. 架构文档 (`docs/architecture/`)

**适用于**：

- 系统设计
- 架构决策
- 技术规范

**示例**：

- `DESIGN-ANALYSIS-MARKET-DATA-API.md`
- `trading-engine-analysis.md`

### 5. 应用文档 (`apps/{app}/docs/`)

**适用于**：

- 应用特定的快速启动
- 应用配置指南
- 应用部署文档

**示例**：

- `apps/console/docs/QUICK_START.md`

### 6. 包文档 (`packages/{package}/docs/`)

**适用于**：

- 包功能详细文档
- 包 API 参考
- 包使用示例

**示例**：

- `packages/core/docs/ORDER_SYNC_MECHANISM.md`

---

## 🤖 AI Agent 规则说明

创建了 `.cursorrules` 文件，包含：

### 1. 文档结构规范

- 明确的目录层次
- 文件命名约定
- 文档类型分类

### 2. 决策树

帮助 AI 决定文档应该放在哪里：

```
是快速启动？ → apps/{app}/docs/QUICK_START.md
是实现文档？ → docs/development/
是包功能？   → packages/{package}/docs/
是用户指南？ → docs/guides/
是架构文档？ → docs/architecture/
是 API 文档？→ docs/api/
```

### 3. 最佳实践

- 保持根目录整洁
- 文档靠近相关代码
- 交叉引用相关文档
- 更新 README 索引

### 4. 模板

- Quick Start 模板
- 实现文档模板
- 特性文档模板

---

## ✅ 整理效果

### 之前（混乱）

```
iTrade/
├── README.md
├── CONSOLE_QUICK_START.md
├── CONSOLE_WEB_IMPROVEMENTS.md
├── FINAL_SUMMARY.md
├── IMPLEMENTATION_SUMMARY.md
├── IMPROVEMENTS_SUMMARY.md
├── MOBILE_STRATEGY_ENHANCED.md
├── MOBILE_STRATEGY_IMPLEMENTATION.md
├── ORDER_SYNC_IMPLEMENTATION.md
├── ORDER_SYNC_MECHANISM.md
├── ORDER_SYNC_REFACTORING.md
├── ORDER_SYNC_SUMMARY.md
├── ORDER_TRACKER_FIX.md
├── QUICK_START.md
├── RUN_COMMANDS.md
├── STRATEGY_MANAGEMENT_GUIDE.md
└── ... (20+ 文档文件在根目录)
```

### 之后（清晰）

```
iTrade/
├── README.md
├── .cursorrules
├── docs/                     # 项目文档
│   ├── guides/              # 7 个用户指南
│   ├── development/         # 7 个开发文档
│   ├── api/                 # API 文档
│   └── architecture/        # 架构文档
├── apps/
│   └── console/docs/        # Console 特定文档
└── packages/
    └── core/docs/           # Core 特定文档
```

---

## 📊 统计

| 类别 | 文件数 | 位置 |
|-----|-------|------|
| 用户指南 | 3+ | `docs/guides/` |
| 开发文档 | 7 | `docs/development/` |
| Console 文档 | 1 | `apps/console/docs/` |
| Core 文档 | 4 | `packages/core/docs/` |
| 现有 docs/ 文档 | 20+ | `docs/` |

**总计**：35+ 文档文件，全部组织有序！

---

## 🔍 查找文档

### 快速查找指南

**我需要...**

- **开始使用项目** → `docs/guides/PROJECT_QUICK_START.md`
- **启动 Console** → `apps/console/docs/QUICK_START.md`
- **了解订单同步** → `packages/core/docs/ORDER_SYNC_SUMMARY.md`
- **查看改进记录** → `docs/development/`
- **API 参考** → `docs/api/` 或 `packages/{package}/docs/`
- **架构设计** → `docs/architecture/`

### 文档索引入口

1. **主索引** → `docs/README.md`
2. **Console 索引** → `apps/console/docs/README.md`
3. **Core 索引** → `packages/core/docs/README.md`

---

## 🎉 优势

### 1. 更清晰的组织

- ✅ 文档按类型和范围分类
- ✅ 易于查找和维护
- ✅ 根目录整洁

### 2. 更好的可维护性

- ✅ 文档靠近相关代码
- ✅ 责任明确
- ✅ 易于更新

### 3. 更好的开发体验

- ✅ AI 知道文档应该放哪
- ✅ 开发者知道去哪找文档
- ✅ 新文档自动归类

### 4. 更专业的项目结构

- ✅ 符合开源项目最佳实践
- ✅ 易于新人理解
- ✅ 文档索引完整

---

## 🚀 后续维护

### 创建新文档时

1. **查看** `.cursorrules` 规则
2. **确定** 文档类型
3. **选择** 正确位置
4. **更新** 相关 README 索引

### AI 创建文档时

AI 会自动遵循 `.cursorrules` 规则：

- ✅ 自动识别文档类型
- ✅ 放到正确位置
- ✅ 更新索引

### 手动创建文档时

参考此决策树：

```
应用特定？ → apps/{app}/docs/
包特定？   → packages/{package}/docs/
项目级？   → docs/{category}/
```

---

## 📚 相关文件

- `.cursorrules` - AI Agent 文档规则
- `docs/README.md` - 文档中心索引
- `apps/console/docs/README.md` - Console 文档索引
- `packages/core/docs/README.md` - Core 文档索引

---

**整理完成！项目文档结构现在清晰有序！** 📚✨

## 🔧 维护命令

```bash
# 查看文档结构
tree -L 3 -I 'node_modules|dist|build' docs/ apps/*/docs packages/*/docs

# 查找文档
find . -name "*.md" -type f | grep -v node_modules

# 验证链接
# (可以使用 markdown-link-check 工具)
```

---

**Last Updated**: 2025-10-09
