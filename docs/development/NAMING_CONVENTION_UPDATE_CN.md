# 文档命名规范更新

> 📖 **English Version**: [NAMING_CONVENTION_UPDATE.md](./NAMING_CONVENTION_UPDATE.md)

## 📅 更新日期

2025-10-09

## 🎯 更新目的

更新文档命名规范，使其更符合国际开源项目标准：

- **英文作为默认**（无后缀）
- **中文版本**添加 `_CN` 后缀

---

## 🔄 变更内容

### 旧规范

```
FILENAME.md          # 中文版本
FILENAME_EN.md       # 英文版本
```

### 新规范（当前）

```
FILENAME.md          # 英文版本（默认）
FILENAME_CN.md       # 中文版本
```

---

## 📝 重命名的文件

### 1. AI 配置文档

| 旧文件名 | 新文件名 | 语言 |
|---------|---------|------|
| `.ai/README.md` | `.ai/README_CN.md` | 中文 |
| `.ai/README_EN.md` | `.ai/README.md` | 英文（默认） |

### 2. 文档组织说明

| 旧文件名 | 新文件名 | 语言 |
|---------|---------|------|
| `docs/development/DOCUMENTATION_ORGANIZATION.md` | `docs/development/DOCUMENTATION_ORGANIZATION_CN.md` | 中文 |
| `docs/development/DOCUMENTATION_ORGANIZATION_EN.md` | `docs/development/DOCUMENTATION_ORGANIZATION.md` | 英文（默认） |

---

## 📚 更新的文件

### 1. `.cursorrules`

添加了双语文档命名部分：

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

更新了所有引用以反映新的命名规范。

### 3. 内部链接

更新了所有受影响文档的双向链接：

- 英文版本链接到 `FILENAME_CN.md`
- 中文版本链接到 `FILENAME.md`

---

## 🎯 更新原因

### 为什么英文作为默认？

1. **国际标准** 🌍
   - 英文是软件开发的国际通用语言
   - 大多数开源项目使用英文作为默认
   - GitHub、npm 等平台以英文为主

2. **AI 工具兼容性** 🤖
   - Cursor AI 对英文支持最佳
   - GitHub Copilot 针对英文优化
   - 更好的代码补全和建议

3. **全球可访问性** 🌐
   - 让项目对全球开发者可访问
   - 更容易吸引国际贡献者
   - 在 GitHub 和 npm 上有更好的可发现性

4. **文档工具** 🛠️
   - 大多数文档生成器默认英文
   - 英文内容更好的 SEO
   - 更广泛的受众范围

---

## 📊 影响分析

### 积极影响 ✅

1. **更好的国际化形象**
   - 项目显得更专业
   - 吸引国际贡献者
   - 遵循行业最佳实践

2. **改进的工具支持**
   - AI 工具更有效地工作
   - 更好的 IDE 集成
   - 增强的开发体验

3. **更清晰的结构**
   - 默认文件无后缀
   - 中文版本标识清晰
   - 一目了然

### 最小影响 ⚠️

1. **破坏性变更**：无
   - 仅内部文档
   - 无 API 或代码变更
   - 所有链接已更新

2. **迁移工作量**：低
   - 只重命名了 4 个文件
   - 所有链接自动更新
   - 不影响外部依赖

---

## 🔗 链接模式

### 英文版本（默认）

```markdown
> 📖 **中文版本**: [FILENAME_CN.md](./FILENAME_CN.md)
```

### 中文版本

```markdown
> 📖 **English Version**: [FILENAME.md](./FILENAME.md)
```

---

## 🎨 示例

### 快速启动指南

```
apps/console/docs/
├── QUICK_START.md        # 英文（默认）
└── QUICK_START_CN.md     # 中文
```

### API 参考

```
packages/core/docs/
├── API_REFERENCE.md      # 英文（默认）
└── API_REFERENCE_CN.md   # 中文
```

### README 文件

```
project-root/
├── README.md             # 英文（默认）
└── README_CN.md          # 中文
```

---

## 🤖 AI 集成

### 更新的 AI 规则

AI 代理（Cursor、Copilot 等）现在将：

1. **默认创建英文文档**

   ```
   用户："Create a quick start guide"
   AI 创建：QUICK_START.md（英文）
   ```

2. **中文版本添加 _CN 后缀**

   ```
   用户："创建快速启动指南的中文版本"
   AI 创建：QUICK_START_CN.md（中文）
   ```

3. **维护双向链接**
   - 自动在版本间添加链接
   - 保持两个版本同步

---

## 📋 迁移清单

- [x] 重命名 AI 配置文件
- [x] 重命名文档组织文件
- [x] 更新 `.cursorrules` 新规范
- [x] 更新 `BILINGUAL_DOCUMENTATION.md`
- [x] 更新所有内部链接
- [x] 创建迁移文档
- [x] 验证所有链接正常

---

## 🚀 未来影响

### 对新文档

创建新的双语文档时：

1. **从英文开始**（默认）

   ```bash
   touch docs/guides/NEW_GUIDE.md
   ```

2. **按需添加中文版本**

   ```bash
   touch docs/guides/NEW_GUIDE_CN.md
   ```

3. **添加双向链接**

### 对现有文档

现有的纯中文文档可以保持原样，直到创建英文版本：

- `docs/guides/STRATEGY_MANAGEMENT_GUIDE.md`（中文）✅ 暂时可以
- 以后需要时添加英文版本

---

## 📖 相关文档

- [.cursorrules](../../.cursorrules) - 更新的 AI 规则
- [BILINGUAL_DOCUMENTATION.md](../BILINGUAL_DOCUMENTATION.md) - 更新的双语指南
- [AI Configuration](../../.ai/README.md) - 英文版本
- [AI 配置说明](../../.ai/README_CN.md) - 中文版本

---

## ✅ 验证

验证更改：

```bash
# 检查重命名的文件
ls -la .ai/README*.md
ls -la docs/development/DOCUMENTATION_ORGANIZATION*.md

# 期望输出：
# .ai/README.md          （英文，默认）
# .ai/README_CN.md       （中文）
# docs/development/DOCUMENTATION_ORGANIZATION.md      （英文，默认）
# docs/development/DOCUMENTATION_ORGANIZATION_CN.md   （中文）
```

---

## 🎉 总结

**命名规范更新成功！** ✨

- ✅ 英文作为默认（无后缀）
- ✅ 中文添加 `_CN` 后缀
- ✅ 更好的国际化对齐
- ✅ 改进的 AI 工具兼容性
- ✅ 专业的开源项目结构

---

**这个变更让 iTrade 成为一个更具国际可访问性的项目！** 🌍

---

**最后更新**: 2025-10-09
