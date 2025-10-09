# 双语文档系统 / Bilingual Documentation System

## 🌍 概述 / Overview

**中文**：iTrade 项目现在支持双语文档（中文和英文），使项目更加国际化，便于全球开发者使用。

**English**: iTrade project now supports bilingual documentation (Chinese and English), making the project more international and accessible to global developers.

---

## 📚 双语文档列表 / Bilingual Documents List

### AI 配置文档 / AI Configuration Docs

| English Version (Default) | 中文版本 | 描述 / Description |
|--------------------------|---------|-------------------|
| [.ai/README.md](../.ai/README.md) | [.ai/README_CN.md](../.ai/README_CN.md) | AI Agent 配置说明 / AI Agent configuration guide |

### 开发文档 / Development Docs

| English Version (Default) | 中文版本 | 描述 / Description |
|--------------------------|---------|-------------------|
| [DOCUMENTATION_ORGANIZATION.md](./development/DOCUMENTATION_ORGANIZATION.md) | [DOCUMENTATION_ORGANIZATION_CN.md](./development/DOCUMENTATION_ORGANIZATION_CN.md) | 文档组织结构说明 / Documentation organization guide |

### 核心规则文件 / Core Rule Files

| 文件 / File | 语言 / Language | 说明 / Note |
|------------|----------------|-------------|
| [.cursorrules](../.cursorrules) | English | AI 文档规则（英文为主，适配 Cursor AI）/ AI documentation rules (English primary, optimized for Cursor AI) |

---

## 🎯 语言策略 / Language Strategy

### 英文优先的文档 / English-First Documents

以下文档使用英文作为主要语言：

The following documents use English as the primary language:

- ✅ `.cursorrules` - AI 规则文件（Cursor AI 最佳支持）
- ✅ API 参考文档 / API Reference Documentation
- ✅ 代码注释 / Code Comments
- ✅ README badges and links

**原因 / Reason**: 
- AI 工具（如 Cursor）主要使用英文
- 国际化项目标准
- 技术文档通用语言

### 双语支持的文档 / Bilingual Documents

以下文档提供中英文双语版本：

The following documents provide both Chinese and English versions:

- 📖 AI 配置指南 / AI Configuration Guides
- 📖 文档组织说明 / Documentation Organization Guides
- 📖 用户指南 / User Guides (部分 / partial)

### 中文为主的文档 / Chinese-Primary Documents

以下文档主要使用中文（面向中文用户）：

The following documents primarily use Chinese (for Chinese users):

- 🇨🇳 快速启动指南 / Quick Start Guides (可按需添加英文版 / English can be added as needed)
- 🇨🇳 开发日志 / Development Logs
- 🇨🇳 实现总结 / Implementation Summaries

---

## 🔄 创建双语文档 / Creating Bilingual Documentation

### 命名规范 / Naming Convention

**模式 / Pattern**:
```
DOCUMENT_NAME.md          # English version (default) / 英文版本（默认）
DOCUMENT_NAME_CN.md       # Chinese version / 中文版本
```

**示例 / Examples**:
```
README.md                 # English (default)
README_CN.md             # 中文

QUICK_START.md            # English (default)
QUICK_START_CN.md        # 中文

API_REFERENCE.md          # English (default)
API_REFERENCE_CN.md      # 中文
```

**原因 / Rationale**:
- English is the international standard / 英文是国际标准
- Better for AI tools (Cursor, GitHub Copilot) / 对 AI 工具更友好
- More accessible to global developers / 对全球开发者更友好

### 双向链接 / Bidirectional Links

每个文档应在开头添加指向另一语言版本的链接：

Each document should include a link to the other language version at the beginning:

**英文版本添加 / Add to English version (default)**:
```markdown
> 📖 **中文版本**: [FILENAME_CN.md](./FILENAME_CN.md)
```

**中文版本添加 / Add to Chinese version**:
```markdown
> 📖 **English Version**: [FILENAME.md](./FILENAME.md)
```

---

## 📝 文档翻译指南 / Translation Guidelines

### 何时创建双语版本 / When to Create Bilingual Versions

**应该创建双语版本 / Should create bilingual**:
- ✅ 项目概述文档 / Project overview documents
- ✅ 安装和配置指南 / Installation and configuration guides
- ✅ API 参考 / API references
- ✅ 架构设计文档 / Architecture design documents
- ✅ 贡献指南 / Contribution guidelines

**可以只用一种语言 / Can use single language**:
- ⚪ 开发日志和进度 / Development logs and progress
- ⚪ 临时笔记 / Temporary notes
- ⚪ 具体实现细节 / Specific implementation details

### 翻译原则 / Translation Principles

1. **准确性 / Accuracy**: 保持技术术语的准确性
2. **一致性 / Consistency**: 使用统一的术语翻译
3. **可读性 / Readability**: 符合目标语言的表达习惯
4. **同步更新 / Sync Updates**: 更新一个版本时，同步更新另一个版本

---

## 🤖 AI 使用建议 / AI Usage Recommendations

### 对于 Cursor AI / For Cursor AI

- 使用 `.cursorrules` (English) 作为规则文件
- AI 会自动识别文档类型和位置
- 可以要求 AI 创建双语版本：
  - "Create a bilingual quick start guide (Chinese and English)"
  - "创建一个双语快速启动指南（中英文）"

### AI 翻译提示 / AI Translation Prompts

**英文翻译为中文 / Translate English to Chinese**:
```
请将以下英文文档翻译为中文，保持技术术语准确，Markdown 格式保持一致：
[English content]
```

**中文翻译为英文 / Translate Chinese to English**:
```
Please translate the following Chinese document to English, keep technical terms accurate and maintain Markdown format:
[中文内容]
```

---

## 🌟 最佳实践 / Best Practices

### 1. 技术术语 / Technical Terms

保持关键技术术语的一致性：

Maintain consistency for key technical terms:

| 中文 | English | 说明 / Note |
|-----|---------|------------|
| 策略 | Strategy | 交易策略 |
| 订单 | Order | 交易订单 |
| 交易引擎 | Trading Engine | 核心引擎 |
| 交易所 | Exchange | 交易平台 |
| 订单同步 | Order Sync | 功能名称 |

### 2. 代码示例 / Code Examples

代码示例保持不变，只翻译注释：

Code examples remain the same, only translate comments:

```typescript
// 中文版本：
// 创建交易引擎
const engine = new TradingEngine(config);

// English version:
// Create trading engine
const engine = new TradingEngine(config);
```

### 3. 链接处理 / Link Handling

保持链接的相对路径一致：

Keep relative paths consistent:

```markdown
# 中文版本
详见：[OrderSync 机制](../../packages/core/docs/ORDER_SYNC_MECHANISM.md)

# English version
See: [OrderSync Mechanism](../../packages/core/docs/ORDER_SYNC_MECHANISM.md)
```

---

## 📊 当前双语文档统计 / Current Bilingual Docs Stats

| 类别 / Category | 双语文档数 / Bilingual Docs | 仅英文 / English Only | 仅中文 / Chinese Only |
|----------------|---------------------------|---------------------|---------------------|
| AI 配置 / AI Config | 1 | 1 (.cursorrules) | 0 |
| 开发文档 / Dev Docs | 1 | 0 | 7 |
| 用户指南 / Guides | 0 | 0 | 6 |
| API 文档 / API Docs | 0 | 5+ | 0 |
| **总计 / Total** | **2** | **6+** | **13+** |

---

## 🚀 未来计划 / Future Plans

### 短期计划 / Short-term Plans
- [ ] 为主要用户指南添加英文版本
- [ ] Add English versions for main user guides
- [ ] 为 Core 包文档添加英文版本
- [ ] Add English versions for Core package docs

### 长期计划 / Long-term Plans
- [ ] 建立自动翻译工作流
- [ ] Establish automated translation workflow
- [ ] 创建翻译贡献指南
- [ ] Create translation contribution guidelines
- [ ] 添加更多语言支持（如日语、韩语）
- [ ] Add more language support (e.g., Japanese, Korean)

---

## 🤝 贡献翻译 / Contributing Translations

欢迎贡献翻译！/ Translations are welcome!

### 如何贡献 / How to Contribute

1. **选择文档 / Choose a document**: 选择需要翻译的文档
2. **创建翻译 / Create translation**: 使用命名规范创建新文件
3. **添加链接 / Add links**: 在两个版本间添加双向链接
4. **提交 PR / Submit PR**: 提交 Pull Request 进行审核

### 翻译质量标准 / Translation Quality Standards

- ✅ 技术准确 / Technically accurate
- ✅ 语言流畅 / Fluent language
- ✅ 格式一致 / Consistent formatting
- ✅ 链接有效 / Valid links

---

## 📖 相关资源 / Related Resources

### 文档中心 / Documentation Center
- [中文文档中心](./README.md)
- [Documentation Center (English)](./README.md) (Coming soon)

### AI 配置 / AI Configuration
- [AI Configuration](../.ai/README.md) - English (default)
- [AI 配置说明](../.ai/README_CN.md) - 中文

### 开发文档 / Development Docs
- [Documentation Organization](./development/DOCUMENTATION_ORGANIZATION.md) - English (default)
- [文档组织说明](./development/DOCUMENTATION_ORGANIZATION_CN.md) - 中文

---

## 🎊 总结 / Summary

**中文**：
- iTrade 现已支持双语文档系统
- `.cursorrules` 使用英文（最佳 AI 支持）
- 关键文档提供中英文双语版本
- 使用统一的命名和链接规范

**English**:
- iTrade now supports bilingual documentation
- `.cursorrules` uses English (best AI support)
- Key documents available in both Chinese and English
- Uses unified naming and linking conventions

---

**让我们一起构建国际化的 iTrade 项目！**  
**Let's build an international iTrade project together!** 🌍✨

---

**Last Updated**: 2025-10-09

