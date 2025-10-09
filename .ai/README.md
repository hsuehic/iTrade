# AI Agent Configuration

This directory contains AI Agent configuration and rule files.

> 📖 **中文版本**: [README_CN.md](./README_CN.md)

## 📁 Files

### `.cursorrules`
Located in the project root, contains:
- Documentation organization rules
- File naming conventions
- Directory structure definitions
- AI decision tree

## 🤖 How AI Agent Works

When AI creates documentation, it automatically:

1. **Identifies Document Type**
   - Quick Start
   - User Guide
   - Development Doc
   - API Reference
   - Architecture Doc

2. **Determines Location**
   - Application-specific → `apps/{app}/docs/`
   - Package-specific → `packages/{package}/docs/`
   - Project-level → `docs/{category}/`

3. **Follows Standards**
   - Uses correct naming
   - Creates necessary directories
   - Updates relevant indexes

## 📚 Rule Files

The main rule file is in the project root:
- [`../.cursorrules`](../.cursorrules)

## 🔄 Updating Rules

After modifying rules, AI will automatically apply the new rules in the next conversation.

## 📖 Related Documentation

- [Documentation Organization](../docs/development/DOCUMENTATION_ORGANIZATION_EN.md)
- [Documentation Usage Guide](../docs/guides/DOCUMENTATION_GUIDE.md)
- [Documentation Center](../docs/README.md)

---

## 🎯 AI Decision Tree

When creating documentation, AI follows this decision tree:

```
┌─────────────────────────────────────┐
│ What type of document is this?     │
└─────────────┬───────────────────────┘
              │
              ├─── Quick Start Guide?
              │    └─> apps/{app}/docs/QUICK_START.md
              │
              ├─── User Guide?
              │    └─> docs/guides/{NAME}.md
              │
              ├─── Implementation/Development?
              │    └─> docs/development/{NAME}.md
              │
              ├─── Package Feature?
              │    └─> packages/{package}/docs/{NAME}.md
              │
              ├─── API Reference?
              │    └─> docs/api/{NAME}.md
              │        or packages/{package}/docs/API.md
              │
              └─── Architecture/Design?
                   └─> docs/architecture/{NAME}.md
```

---

## 📝 Document Templates

### Quick Start Template

```markdown
# {Application/Package} Quick Start Guide

## Prerequisites
- List requirements

## Installation
- Step by step instructions

## Usage
- Basic usage examples

## Next Steps
- Links to detailed guides
```

### Implementation/Feature Template

```markdown
# {Feature Name} Implementation

## Overview
Brief description

## Implementation Details
Technical details

## Usage
How to use

## Testing
How to test

## Related Documentation
Links to related docs
```

### API Reference Template

```markdown
# {Package/Module} API Reference

## Classes/Functions

### ClassName
Description

#### Constructor
Parameters and description

#### Methods
Method descriptions

## Examples
Usage examples

## Related
Links to related documentation
```

---

## 🎨 File Naming Conventions

### Use Cases

| Document Type | Naming Convention | Example |
|--------------|-------------------|---------|
| Quick Start | `QUICK_START.md` | `QUICK_START.md` |
| Important Guide | `UPPERCASE_WITH_UNDERSCORES.md` | `API_REFERENCE.md` |
| Regular Doc | `lowercase-with-hyphens.md` | `usage-guide.md` |
| Feature Doc | `Feature_Name.md` | `ORDER_SYNC_MECHANISM.md` |

---

## ✅ AI Validation Checklist

Before creating/moving documentation, AI checks:

- [ ] Document type identified?
- [ ] Correct location chosen?
- [ ] Directory exists or needs creation?
- [ ] Naming convention followed?
- [ ] Index file needs update?
- [ ] Cross-references added?

---

## 🌟 Best Practices

### For AI
1. **Always check** `.cursorrules` before creating docs
2. **Never place** documentation in root (except README.md)
3. **Always update** relevant README indexes
4. **Create directories** if they don't exist
5. **Use templates** for consistency

### For Developers
1. **Follow** the same rules as AI
2. **Update** `.cursorrules` if patterns change
3. **Review** AI-generated docs
4. **Maintain** documentation indexes

---

## 🔗 Quick Links

### Configuration
- [.cursorrules](../.cursorrules) - Main AI rules

### Documentation
- [Documentation Center](../docs/README.md)
- [Documentation Guide](../docs/guides/DOCUMENTATION_GUIDE.md)
- [Organization Guide](../docs/development/DOCUMENTATION_ORGANIZATION_EN.md)

### Application Docs
- [Console Docs](../apps/console/docs/README.md)
- [Web Docs](../apps/web/docs/README.md)
- [Mobile Docs](../apps/mobile/docs/README.md)

### Package Docs
- [Core Docs](../packages/core/docs/README.md)

---

## 💡 Example: AI Creating Documentation

### User Request
> "Create a quick start guide for the Web application"

### AI Process

1. **Identify**: Quick Start Guide
2. **Determine Location**: `apps/web/docs/QUICK_START.md`
3. **Check Directory**: Create `apps/web/docs/` if needed
4. **Use Template**: Apply Quick Start template
5. **Create File**: Write `QUICK_START.md`
6. **Update Index**: Add link to `apps/web/docs/README.md`

### Result
```
apps/web/docs/
├── README.md (updated with new link)
└── QUICK_START.md (newly created)
```

---

## 📊 Documentation Statistics

Current documentation organization:

| Location | Files | Purpose |
|----------|-------|---------|
| `docs/guides/` | 6+ | User guides |
| `docs/development/` | 8+ | Dev documentation |
| `docs/api/` | 5+ | API reference |
| `apps/*/docs/` | varies | App-specific docs |
| `packages/*/docs/` | varies | Package docs |

---

**AI Configuration Complete! Documentation will be automatically organized!** 🤖📚✨

---

**Last Updated**: 2025-10-09

