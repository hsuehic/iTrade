# AI Agent 配置

这个目录包含 AI Agent 的配置和规则文件。

> 📖 **English Version**: [README.md](./README.md)

## 📁 文件

### `.cursorrules`

位于项目根目录，包含：

- 文档组织规则
- 文件命名规范
- 目录结构定义
- AI 决策树

## 🤖 AI Agent 工作方式

当 AI 创建文档时，会自动：

1. **识别文档类型**
   - Quick Start
   - User Guide
   - Development Doc
   - API Reference
   - Architecture Doc

2. **确定位置**
   - 应用特定 → `apps/{app}/docs/`
   - 包特定 → `packages/{package}/docs/`
   - 项目级 → `docs/{category}/`

3. **遵循规范**
   - 使用正确的命名
   - 创建必要的目录
   - 更新相关索引

## 📚 规则文件

主要规则文件在项目根目录：

- [`../.cursorrules`](../.cursorrules)

## 🔄 更新规则

修改规则后，AI 会在下次对话中自动应用新规则。

## 📖 相关文档

- [文档组织说明](../DOCUMENTATION_ORGANIZATION.md)
- [文档使用指南](../docs/guides/DOCUMENTATION_GUIDE.md)
- [文档中心](../docs/README.md)
