# Documentation Organization Guide

> 📖 **中文版本**: [DOCUMENTATION_ORGANIZATION_CN.md](./DOCUMENTATION_ORGANIZATION_CN.md)

## 📅 Organization Date
2025-10-09

## 🎯 Purpose

To organize documentation files from the root directory into appropriate locations, making the project structure clearer and documentation easier to find and maintain.

---

## 📂 New Documentation Structure

```
iTrade/
├── .cursorrules                    # AI Agent documentation rules
├── README.md                       # Main project documentation
│
├── docs/                           # Project-level documentation
│   ├── README.md                   # Documentation index
│   │
│   ├── guides/                     # User guides
│   │   ├── PROJECT_QUICK_START.md
│   │   ├── RUN_COMMANDS.md
│   │   └── STRATEGY_MANAGEMENT_GUIDE.md
│   │
│   ├── development/                # Development process documentation
│   │   ├── CONSOLE_WEB_IMPROVEMENTS.md
│   │   ├── IMPLEMENTATION_SUMMARY.md
│   │   ├── IMPROVEMENTS_SUMMARY.md
│   │   ├── FINAL_SUMMARY.md
│   │   ├── MOBILE_STRATEGY_IMPLEMENTATION.md
│   │   ├── MOBILE_STRATEGY_ENHANCED.md
│   │   └── ORDER_TRACKER_FIX.md
│   │
│   ├── api/                        # API documentation
│   │   └── API-REFERENCE-MARKET-DATA.md
│   │
│   └── architecture/               # Architecture documentation
│       └── (existing architecture docs)
│
├── apps/                           # Applications
│   ├── console/
│   │   └── docs/
│   │       ├── README.md           # Console documentation index
│   │       └── QUICK_START.md      # Console quick start
│   │
│   ├── web/
│   │   └── docs/
│   │       └── README.md
│   │
│   └── mobile/
│       └── docs/
│           └── README.md
│
└── packages/                       # Packages
    └── core/
        └── docs/
            ├── README.md           # Core package documentation index
            ├── ORDER_SYNC_MECHANISM.md
            ├── ORDER_SYNC_IMPLEMENTATION.md
            ├── ORDER_SYNC_REFACTORING.md
            └── ORDER_SYNC_SUMMARY.md
```

---

## 🔄 File Movement Record

### Moved from root to `apps/console/docs/`
```
CONSOLE_QUICK_START.md → apps/console/docs/QUICK_START.md
```

### Moved from root to `docs/guides/`
```
RUN_COMMANDS.md → docs/guides/RUN_COMMANDS.md
STRATEGY_MANAGEMENT_GUIDE.md → docs/guides/STRATEGY_MANAGEMENT_GUIDE.md
QUICK_START.md → docs/guides/PROJECT_QUICK_START.md
```

### Moved from root to `docs/development/`
```
CONSOLE_WEB_IMPROVEMENTS.md → docs/development/CONSOLE_WEB_IMPROVEMENTS.md
IMPLEMENTATION_SUMMARY.md → docs/development/IMPLEMENTATION_SUMMARY.md
IMPROVEMENTS_SUMMARY.md → docs/development/IMPROVEMENTS_SUMMARY.md
FINAL_SUMMARY.md → docs/development/FINAL_SUMMARY.md
MOBILE_STRATEGY_IMPLEMENTATION.md → docs/development/MOBILE_STRATEGY_IMPLEMENTATION.md
MOBILE_STRATEGY_ENHANCED.md → docs/development/MOBILE_STRATEGY_ENHANCED.md
ORDER_TRACKER_FIX.md → docs/development/ORDER_TRACKER_FIX.md
DOCUMENTATION_ORGANIZATION.md → docs/development/DOCUMENTATION_ORGANIZATION.md
```

### Moved from root to `packages/core/docs/`
```
ORDER_SYNC_IMPLEMENTATION.md → packages/core/docs/ORDER_SYNC_IMPLEMENTATION.md
ORDER_SYNC_MECHANISM.md → packages/core/docs/ORDER_SYNC_MECHANISM.md
ORDER_SYNC_REFACTORING.md → packages/core/docs/ORDER_SYNC_REFACTORING.md
ORDER_SYNC_SUMMARY.md → packages/core/docs/ORDER_SYNC_SUMMARY.md
```

---

## 📝 New Files Created

### AI Agent Rules
- `.cursorrules` - AI documentation generation rules

### README Index Files
- `docs/README.md` - Documentation center index
- `apps/console/docs/README.md` - Console app documentation index
- `packages/core/docs/README.md` - Core package documentation index

---

## 🎯 Documentation Classification Rules

### 1. User Guides (`docs/guides/`)
**Suitable for**:
- Quick start guides
- Tutorials
- Best practices
- How-to guides

**Examples**:
- `PROJECT_QUICK_START.md`
- `RUN_COMMANDS.md`
- `STRATEGY_MANAGEMENT_GUIDE.md`

### 2. Development Documentation (`docs/development/`)
**Suitable for**:
- Implementation summaries
- Improvement logs
- Migration guides
- Bug fix documentation
- Development process records

**Examples**:
- `CONSOLE_WEB_IMPROVEMENTS.md`
- `IMPLEMENTATION_SUMMARY.md`
- `ORDER_TRACKER_FIX.md`

### 3. API Documentation (`docs/api/`)
**Suitable for**:
- API reference
- Interface documentation
- Protocol specifications

**Examples**:
- `API-REFERENCE-MARKET-DATA.md`

### 4. Architecture Documentation (`docs/architecture/`)
**Suitable for**:
- System design
- Architecture decisions
- Technical specifications

**Examples**:
- `DESIGN-ANALYSIS-MARKET-DATA-API.md`
- `trading-engine-analysis.md`

### 5. Application Documentation (`apps/{app}/docs/`)
**Suitable for**:
- Application-specific quick starts
- Application configuration guides
- Application deployment docs

**Examples**:
- `apps/console/docs/QUICK_START.md`

### 6. Package Documentation (`packages/{package}/docs/`)
**Suitable for**:
- Package feature detailed documentation
- Package API reference
- Package usage examples

**Examples**:
- `packages/core/docs/ORDER_SYNC_MECHANISM.md`

---

## 🤖 AI Agent Rules Explanation

Created `.cursorrules` file containing:

### 1. Documentation Structure Standards
- Clear directory hierarchy
- File naming conventions
- Classification standards

### 2. Decision Tree
Helps AI decide where documentation should go:
```
Is it a Quick Start?        → apps/{app}/docs/QUICK_START.md
Is it implementation docs?  → docs/development/
Is it a package feature?    → packages/{package}/docs/
Is it a user guide?         → docs/guides/
Is it architecture?         → docs/architecture/
Is it API reference?        → docs/api/
```

### 3. Best Practices
- Keep root directory clean
- Documentation close to code
- Update indexes
- Cross-reference documents

---

## ✅ Organization Results

### Before (Messy)
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
└── ... (20+ documentation files in root)
```

### After (Clean)
```
iTrade/
├── README.md
├── .cursorrules
├── docs/                     # Project documentation
│   ├── guides/              # 7 user guides
│   ├── development/         # 8 development docs
│   ├── api/                 # API documentation
│   └── architecture/        # Architecture docs
├── apps/
│   └── console/docs/        # Console-specific docs
└── packages/
    └── core/docs/           # Core-specific docs
```

---

## 📊 Statistics

| Category | Count | Location |
|----------|-------|----------|
| User Guides | 3+ | `docs/guides/` |
| Development Docs | 8 | `docs/development/` |
| Console Docs | 1 | `apps/console/docs/` |
| Core Docs | 4 | `packages/core/docs/` |
| Existing docs/ | 20+ | `docs/` |

**Total**: 35+ documentation files, all well organized!

---

## 🔍 Finding Documentation

### Quick Find Guide

**I need to...**

- **Start using the project** → `docs/guides/PROJECT_QUICK_START.md`
- **Launch Console** → `apps/console/docs/QUICK_START.md`
- **Understand order sync** → `packages/core/docs/ORDER_SYNC_SUMMARY.md`
- **View improvement logs** → `docs/development/`
- **API reference** → `docs/api/` or `packages/{package}/docs/`
- **Architecture design** → `docs/architecture/`

### Documentation Index Entry Points

1. **Main Index** → `docs/README.md`
2. **Console Index** → `apps/console/docs/README.md`
3. **Core Index** → `packages/core/docs/README.md`

---

## 🎉 Benefits

### 1. Clearer Organization
- ✅ Documentation categorized by type and scope
- ✅ Easy to find and maintain
- ✅ Clean root directory

### 2. Better Maintainability
- ✅ Documentation close to related code
- ✅ Clear responsibilities
- ✅ Easy to update

### 3. Better Developer Experience
- ✅ AI knows where documentation goes
- ✅ Developers know where to find docs
- ✅ New documents automatically categorized

### 4. More Professional Project Structure
- ✅ Follows open-source best practices
- ✅ Easy for newcomers to understand
- ✅ Complete documentation index

---

## 🚀 Future Maintenance

### When Creating New Documentation

1. **Review** `.cursorrules` rules
2. **Determine** document type
3. **Select** correct location
4. **Update** relevant README indexes

### When AI Creates Documentation

AI will automatically follow `.cursorrules` rules:
- ✅ Automatically identify document type
- ✅ Place in correct location
- ✅ Update indexes

### When Manually Creating Documentation

Refer to this decision tree:
```
Application-specific? → apps/{app}/docs/
Package-specific?     → packages/{package}/docs/
Project-level?        → docs/{category}/
```

---

## 📚 Related Files

- `.cursorrules` - AI Agent documentation rules
- `docs/README.md` - Documentation center index
- `apps/console/docs/README.md` - Console documentation index
- `packages/core/docs/README.md` - Core documentation index

---

**Organization Complete! Project documentation structure is now clear and orderly!** 📚✨

## 🔧 Maintenance Commands

```bash
# View documentation structure
tree -L 3 -I 'node_modules|dist|build' docs/ apps/*/docs packages/*/docs

# Find documentation
find . -name "*.md" -type f | grep -v node_modules

# Verify links (can use markdown-link-check tool)
```

---

**Last Updated**: 2025-10-09

