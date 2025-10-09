# Documentation Naming Convention Update

> 📖 **中文版本**: [NAMING_CONVENTION_UPDATE_CN.md](./NAMING_CONVENTION_UPDATE_CN.md)

## 📅 Update Date
2025-10-09

## 🎯 Purpose

Update the documentation naming convention to better align with international open-source project standards:

- **English as default** (no suffix)
- **Chinese version** with `_CN` suffix

---

## 🔄 Changes Made

### Previous Convention (Old)
```
FILENAME.md          # Chinese version
FILENAME_EN.md       # English version
```

### New Convention (Current)
```
FILENAME.md          # English version (default)
FILENAME_CN.md       # Chinese version
```

---

## 📝 Files Renamed

### 1. AI Configuration Documentation

| Old Name | New Name | Language |
|----------|----------|----------|
| `.ai/README.md` | `.ai/README_CN.md` | Chinese |
| `.ai/README_EN.md` | `.ai/README.md` | English (default) |

### 2. Documentation Organization Guide

| Old Name | New Name | Language |
|----------|----------|----------|
| `docs/development/DOCUMENTATION_ORGANIZATION.md` | `docs/development/DOCUMENTATION_ORGANIZATION_CN.md` | Chinese |
| `docs/development/DOCUMENTATION_ORGANIZATION_EN.md` | `docs/development/DOCUMENTATION_ORGANIZATION.md` | English (default) |

---

## 📚 Updated Files

### 1. `.cursorrules`
Added bilingual documentation naming section:

```markdown
### Bilingual Documentation Naming

**Default Language**: English (no suffix)
**Chinese Version**: Add `_CN` suffix

Examples:
- `README.md` - English (default)
- `README_CN.md` - Chinese version
- `QUICK_START.md` - English
- `QUICK_START_CN.md` - Chinese version

**Rationale**:
- English is the international standard for open-source projects
- Cursor AI and most development tools work best with English
- Makes the project more accessible to global developers
```

### 2. `docs/BILINGUAL_DOCUMENTATION.md`
Updated all references to reflect the new naming convention.

### 3. Internal Links
Updated bidirectional links in all affected documents:

- English version links to `FILENAME_CN.md`
- Chinese version links to `FILENAME.md`

---

## 🎯 Rationale

### Why English as Default?

1. **International Standard** 🌍
   - English is the lingua franca of software development
   - Most open-source projects use English as default
   - GitHub, npm, and other platforms are English-first

2. **AI Tool Compatibility** 🤖
   - Cursor AI works best with English
   - GitHub Copilot optimized for English
   - Better code completion and suggestions

3. **Global Accessibility** 🌐
   - Makes the project accessible to developers worldwide
   - Easier for international contributors
   - Better discoverability on GitHub and npm

4. **Documentation Tooling** 🛠️
   - Most documentation generators expect English
   - Better SEO for English content
   - Wider audience reach

---

## 📊 Impact Analysis

### Positive Impacts ✅

1. **Better International Presence**
   - Project appears more professional
   - Attracts international contributors
   - Follows industry best practices

2. **Improved Tool Support**
   - AI tools work more effectively
   - Better IDE integration
   - Enhanced developer experience

3. **Cleaner Structure**
   - Default files without suffix
   - Clear language indication for Chinese
   - Easier to understand at a glance

### Minimal Disruption ⚠️

1. **Breaking Changes**: None
   - Internal documentation only
   - No API or code changes
   - All links updated

2. **Migration Effort**: Low
   - Only 4 files renamed
   - All links automatically updated
   - No external dependencies affected

---

## 🔗 Link Pattern

### English Version (Default)
```markdown
> 📖 **中文版本**: [FILENAME_CN.md](./FILENAME_CN.md)
```

### Chinese Version
```markdown
> 📖 **English Version**: [FILENAME.md](./FILENAME.md)
```

---

## 🎨 Examples

### Quick Start Guide

```
apps/console/docs/
├── QUICK_START.md        # English (default)
└── QUICK_START_CN.md     # Chinese
```

### API Reference

```
packages/core/docs/
├── API_REFERENCE.md      # English (default)
└── API_REFERENCE_CN.md   # Chinese
```

### README Files

```
project-root/
├── README.md             # English (default)
└── README_CN.md          # Chinese
```

---

## 🤖 AI Integration

### Updated AI Rules

AI agents (Cursor, Copilot, etc.) will now:

1. **Create English as default**
   ```
   User: "Create a quick start guide"
   AI creates: QUICK_START.md (English)
   ```

2. **Add _CN suffix for Chinese**
   ```
   User: "创建快速启动指南的中文版本"
   AI creates: QUICK_START_CN.md (Chinese)
   ```

3. **Maintain bidirectional links**
   - Auto-link between versions
   - Keep both versions in sync

---

## 📋 Migration Checklist

- [x] Rename AI configuration files
- [x] Rename documentation organization files
- [x] Update `.cursorrules` with new convention
- [x] Update `BILINGUAL_DOCUMENTATION.md`
- [x] Update all internal links
- [x] Create migration documentation
- [x] Verify all links work

---

## 🚀 Future Implications

### For New Documentation

When creating new bilingual documentation:

1. **Start with English** (default)
   ```bash
   touch docs/guides/NEW_GUIDE.md
   ```

2. **Add Chinese version** if needed
   ```bash
   touch docs/guides/NEW_GUIDE_CN.md
   ```

3. **Add bidirectional links**

### For Existing Documentation

Existing Chinese-only documentation can remain as is until English versions are created:

- `docs/guides/STRATEGY_MANAGEMENT_GUIDE.md` (Chinese) ✅ OK for now
- Add `STRATEGY_MANAGEMENT_GUIDE_EN.md` later if needed

---

## 📖 Related Documentation

- [.cursorrules](../../.cursorrules) - Updated AI rules
- [BILINGUAL_DOCUMENTATION.md](../BILINGUAL_DOCUMENTATION.md) - Updated bilingual guide
- [AI Configuration](../../.ai/README.md) - English version
- [AI 配置说明](../../.ai/README_CN.md) - Chinese version

---

## ✅ Verification

To verify the changes:

```bash
# Check renamed files
ls -la .ai/README*.md
ls -la docs/development/DOCUMENTATION_ORGANIZATION*.md

# Expected output:
# .ai/README.md          (English, default)
# .ai/README_CN.md       (Chinese)
# docs/development/DOCUMENTATION_ORGANIZATION.md      (English, default)
# docs/development/DOCUMENTATION_ORGANIZATION_CN.md   (Chinese)
```

---

## 🎉 Summary

**Convention Updated Successfully!** ✨

- ✅ English as default (no suffix)
- ✅ Chinese with `_CN` suffix
- ✅ Better international alignment
- ✅ Improved AI tool compatibility
- ✅ Professional open-source project structure

---

**This change makes iTrade a more internationally accessible project!** 🌍

---

**Last Updated**: 2025-10-09

