# iTrade Documentation

欢迎来到 iTrade 项目文档中心！

> 📖 **Chinese Version**: [README_CN.md](./README_CN.md) (Coming soon)

---

## 📚 Documentation Navigation

### 📖 User Guides ([guides/](./guides/))
Start here if you're new to iTrade:

**Quick Start**:
- **[Project Quick Start](./guides/PROJECT_QUICK_START.md)** - Get started with iTrade
- **[Quick Start (CN)](./guides/QUICKSTART_CN.md)** - 快速入门（中文）
- **[Run Commands](./guides/RUN_COMMANDS.md)** - Common commands reference

**Strategy Guides**:
- **[Strategy Management Guide](./guides/STRATEGY_MANAGEMENT_GUIDE.md)** - How to manage strategies
- **[Strategy Debug Guide](./guides/STRATEGY-DEBUG-GUIDE.md)** - Debug trading strategies
- [Strategy Example (CN)](./guides/STRATEGY-EXAMPLE-CN.md)
- [Strategy Example (EN)](./guides/STRATEGY-EXAMPLE-EN.md)
- [Strategy Flow (CN)](./guides/STRATEGY-FLOW-CN.md)
- [Strategy Flow (EN)](./guides/STRATEGY-FLOW-EN.md)

**Exchange Guides**:
- [Multi-Exchange Guide](./guides/MULTI-EXCHANGE-GUIDE.md)
- [OKX Exchange Guide](./guides/OKX-EXCHANGE-GUIDE.md)

**Subscription Guides**:
- [Auto Subscription Usage](./guides/AUTO-SUBSCRIPTION-USAGE.md)
- [Subscription Quick Start](./guides/SUBSCRIPTION-QUICK-START.md)

**Documentation Guides**:
- [Documentation Guide](./guides/DOCUMENTATION_GUIDE.md)
- [Documentation Organization Complete](./guides/DOCUMENTATION_ORGANIZATION_COMPLETE.md)
- [Documentation Organization Summary](./guides/DOCUMENTATION_ORGANIZATION_SUMMARY.md)

### 🏗️ Architecture ([architecture/](./architecture/))
System design and architecture decisions:

- [Trading Engine Analysis](./architecture/TRADING-ENGINE-ANALYSIS.md)
- [Market Data API Design Analysis](./architecture/DESIGN-ANALYSIS-MARKET-DATA-API.md)
- [Auto Subscription Design](./architecture/DESIGN-AUTO-SUBSCRIPTION.md)

### 🔌 API Reference ([api/](./api/))
API documentation and interface references:

- [Market Data API Reference](./api/API-REFERENCE-MARKET-DATA.md)

### 🛠️ Development ([development/](./development/))
Development process and implementation documentation:

**Implementation & Improvements**:
- [Console & Web Improvements](./development/CONSOLE_WEB_IMPROVEMENTS.md)
- [Implementation Summary](./development/IMPLEMENTATION_SUMMARY.md)
- [Improvements Summary](./development/IMPROVEMENTS_SUMMARY.md)
- [Final Summary](./development/FINAL_SUMMARY.md)

**Mobile Development**:
- [Mobile Strategy Implementation](./development/MOBILE_STRATEGY_IMPLEMENTATION.md)
- [Mobile Strategy Enhanced](./development/MOBILE_STRATEGY_ENHANCED.md)

**Bug Fixes**:
- [Order Tracker Fix](./development/ORDER_TRACKER_FIX.md)

**Documentation Updates**:
- [Documentation Organization](./development/DOCUMENTATION_ORGANIZATION.md)
- [Documentation Organization (CN)](./development/DOCUMENTATION_ORGANIZATION_CN.md)
- [Naming Convention Update](./development/NAMING_CONVENTION_UPDATE.md)
- [Naming Convention Update (CN)](./development/NAMING_CONVENTION_UPDATE_CN.md)

### 📝 Changelog ([changelog/](./changelog/))
Changes, updates, and summaries:

**Changelogs**:
- [Multi-Exchange Changelog](./changelog/CHANGELOG-MULTI-EXCHANGE.md)
- [Symbol Normalization Changelog](./changelog/CHANGELOG-SYMBOL-NORMALIZATION.md)

**Summaries**:
- [Multi-Exchange Summary](./changelog/MULTI-EXCHANGE-SUMMARY.md)
- [Typed Market Data Summary](./changelog/SUMMARY-TYPED-MARKET-DATA.md)

**Bug Fixes**:
- [Subscription Key Mismatch Fix](./changelog/BUGFIX-SUBSCRIPTION-KEY-MISMATCH.md)

### 🚀 Migration Guides ([migration/](./migration/))
Migration guides for major updates:

- [Typed Market Data Migration Guide](./migration/MIGRATION-GUIDE-TYPED-MARKET-DATA.md)

### 🐛 Troubleshooting ([troubleshooting/](./troubleshooting/))
Common issues and solutions:

- **[Troubleshooting Guide](./troubleshooting/TROUBLESHOOTING.md)** - Common problems and fixes
- [WebSocket Blocked Solution](./troubleshooting/WEBSOCKET-BLOCKED-SOLUTION.md)
- [Symbol Normalization](./troubleshooting/SYMBOL-NORMALIZATION.md)

---

## 🌍 Bilingual Documentation

iTrade supports bilingual documentation (English and Chinese):

- **[Bilingual Documentation Guide](./BILINGUAL_DOCUMENTATION.md)** - How to work with bilingual docs

**Naming Convention**:
- `FILENAME.md` - English version (default)
- `FILENAME_CN.md` - Chinese version

---

## 📦 Application & Package Documentation

### Console Application
- **[Console Quick Start](../apps/console/docs/QUICK_START.md)** - Get started with Console app
- [Console Documentation](../apps/console/docs/README.md)

### Web Application
- [Web Documentation](../apps/web/docs/README.md)

### Mobile Application
- [Mobile Documentation](../apps/mobile/docs/README.md)

### Core Package
- **[Order Sync Mechanism](../packages/core/docs/ORDER_SYNC_MECHANISM.md)** - Order sync design
- **[Order Sync Implementation](../packages/core/docs/ORDER_SYNC_IMPLEMENTATION.md)**
- [Order Sync Refactoring](../packages/core/docs/ORDER_SYNC_REFACTORING.md)
- [Order Sync Summary](../packages/core/docs/ORDER_SYNC_SUMMARY.md)
- [Core Package Documentation](../packages/core/docs/README.md)

---

## 🗂️ Documentation Structure

```
docs/
├── README.md                      # This file (Documentation index)
├── BILINGUAL_DOCUMENTATION.md     # Bilingual documentation guide
│
├── guides/                        # User guides and tutorials
│   ├── PROJECT_QUICK_START.md
│   ├── STRATEGY_MANAGEMENT_GUIDE.md
│   └── ... (16 files)
│
├── architecture/                  # Architecture and design documents
│   ├── trading-engine-analysis.md
│   ├── DESIGN-ANALYSIS-MARKET-DATA-API.md
│   └── ... (3 files)
│
├── api/                           # API reference documentation
│   └── API-REFERENCE-MARKET-DATA.md
│
├── development/                   # Development process documentation
│   ├── IMPLEMENTATION_SUMMARY.md
│   ├── IMPROVEMENTS_SUMMARY.md
│   └── ... (11 files)
│
├── changelog/                     # Changelogs and summaries
│   ├── CHANGELOG-MULTI-EXCHANGE.md
│   ├── SUMMARY-TYPED-MARKET-DATA.md
│   └── ... (5 files)
│
├── migration/                     # Migration guides
│   └── MIGRATION-GUIDE-TYPED-MARKET-DATA.md
│
└── troubleshooting/              # Troubleshooting guides
    ├── TROUBLESHOOTING.md
    ├── WEBSOCKET-BLOCKED-SOLUTION.md
    └── ... (3 files)
```

---

## 🎯 Quick Links

### For New Users
1. [Project Quick Start](./guides/PROJECT_QUICK_START.md)
2. [Console Quick Start](../apps/console/docs/QUICK_START.md)
3. [Strategy Management Guide](./guides/STRATEGY_MANAGEMENT_GUIDE.md)

### For Developers
1. [Development Documentation](./development/)
2. [Architecture Documentation](./architecture/)
3. [API Reference](./api/)

### Need Help?
1. [Troubleshooting Guide](./troubleshooting/TROUBLESHOOTING.md)
2. [Documentation Guide](./guides/DOCUMENTATION_GUIDE.md)

---

## 📝 Contributing Documentation

When creating new documentation:

1. **Choose the right location**:
   - User guides → `guides/`
   - Architecture docs → `architecture/`
   - API docs → `api/`
   - Development logs → `development/`
   - Changelogs → `changelog/`
   - Migration guides → `migration/`
   - Troubleshooting → `troubleshooting/`

2. **Follow naming conventions**:
   - Use `UPPERCASE_WITH_UNDERSCORES.md` for important docs
   - Use `lowercase-with-hyphens.md` for regular docs
   - English version: `FILENAME.md` (no suffix)
   - Chinese version: `FILENAME_CN.md`

3. **Update this README**: Add your document to the appropriate section

4. **See**: [.cursorrules](../.cursorrules) for AI documentation rules

---

## 🔍 Search Tips

- **By Topic**: Navigate to the appropriate section above
- **By File Name**: Use your IDE's file search
- **By Content**: Use `grep` or your IDE's search in files feature

---

**Last Updated**: 2025-10-09

**Total Documents**: 40+ files organized in 8 categories
