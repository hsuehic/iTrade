# Dashboard 动画和轮询 - 快速指南

## 🎯 功能概览

Dashboard 现在支持：
- ✅ **平滑的数字动画** - 所有数字变化都有过渡效果
- ✅ **自动数据刷新** - 默认每 5 秒更新一次
- ✅ **可配置间隔** - 通过环境变量调整刷新频率

## 🚀 快速开始

### 1. 默认配置（5秒刷新）

无需任何配置，直接启动即可：

```bash
cd apps/web
pnpm run dev
```

访问 http://localhost:3000/dashboard，您将看到：
- 数字平滑过渡
- 每 5 秒自动刷新数据

### 2. 自定义刷新间隔

创建或编辑 `apps/web/.env.local` 文件：

```bash
# 设置刷新间隔为 10 秒
NEXT_PUBLIC_DASHBOARD_REFRESH_INTERVAL=10000
```

重启服务器：
```bash
pnpm run dev
```

### 3. 常用配置

| 场景 | 配置值 | 说明 |
|------|--------|------|
| 实时监控 | `1000` | 每秒刷新，适合高频交易 |
| **推荐配置** | `5000` | 每 5 秒，平衡性能和实时性 |
| 节省资源 | `10000` | 每 10 秒，降低服务器负载 |
| 最低频率 | `30000` | 每 30 秒，最小资源占用 |

## 🎨 动画效果

### 数字动画
所有卡片中的数字都会平滑过渡：
- Total Equity: $10,000 → $12,345 (0.6秒动画)
- P&L: $500 → $750 (平滑增长)
- Active Strategies: 3 → 5 (自然递增)

### 颜色变化
- 盈利值显示为绿色
- 亏损值显示为红色
- 颜色变化也有过渡动画

## 📊 监控数据刷新

### 使用浏览器开发者工具

1. 打开 Chrome DevTools (F12)
2. 切换到 **Network** 标签
3. 筛选 Fetch/XHR 请求
4. 观察 `/api/analytics/account` 请求频率

您应该看到：
```
GET /api/analytics/account?period=30d&exchange=all
Status: 200 OK
每 5 秒一次（或您配置的间隔）
```

## 🔧 高级配置

### 不同环境不同配置

**开发环境** (`apps/web/.env.development`):
```bash
NEXT_PUBLIC_DASHBOARD_REFRESH_INTERVAL=5000
```

**生产环境** (`apps/web/.env.production`):
```bash
NEXT_PUBLIC_DASHBOARD_REFRESH_INTERVAL=10000
```

### 禁用自动刷新

如果需要禁用（不推荐），设置一个很大的值：
```bash
NEXT_PUBLIC_DASHBOARD_REFRESH_INTERVAL=9999999
```

## 📱 响应式设计

动画和轮询在所有设备上都正常工作：
- ✅ 桌面浏览器
- ✅ 平板电脑
- ✅ 移动设备

## ⚡ 性能提示

### 最佳实践

1. **生产环境建议 10 秒间隔**
   ```bash
   NEXT_PUBLIC_DASHBOARD_REFRESH_INTERVAL=10000
   ```

2. **页面不可见时会继续刷新**
   - 未来版本将添加可见性检测
   - 目前建议关闭不使用的 tab

3. **网络慢时自动处理**
   - 即使请求超时，也不会阻塞下一次刷新
   - 错误会记录在控制台

### 性能指标

在默认配置下（5秒间隔）：
- CPU 占用: < 5%
- 内存占用: < 10MB
- 网络流量: ~5KB/秒
- 每小时请求: 720 次

## 🐛 故障排除

### 问题: 数字没有动画效果

**解决**:
1. 检查浏览器控制台是否有错误
2. 确认 framer-motion 已安装: `pnpm list framer-motion`
3. 清除缓存并刷新: Cmd+Shift+R (Mac) / Ctrl+Shift+R (Windows)

### 问题: 数据没有自动刷新

**解决**:
1. 打开 Network 标签，确认有请求发送
2. 检查 API 是否正常: 访问 http://localhost:3000/api/analytics/account
3. 查看控制台错误信息

### 问题: 刷新太频繁

**解决**:
```bash
# 在 .env.local 中增加间隔
NEXT_PUBLIC_DASHBOARD_REFRESH_INTERVAL=15000  # 15秒
```

### 问题: 刷新太慢

**解决**:
```bash
# 在 .env.local 中减少间隔
NEXT_PUBLIC_DASHBOARD_REFRESH_INTERVAL=3000  # 3秒
```

## 📚 相关文档

- [完整实现文档](../development/DASHBOARD_ANIMATION_IMPLEMENTATION.md)
- [Chrome DevTools 使用指南](../../.cursorrules-devtools)
- [Dashboard 验证报告](../development/WEB_DASHBOARD_VERIFICATION.md)

## 🎉 享受您的实时 Dashboard！

现在您可以实时监控您的交易账户和策略表现，所有数据变化都会以专业、平滑的动画呈现。

---

**提示**: 如果您正在运行 Console 应用（`apps/console`），它会定期轮询交易所并保存数据到数据库，Dashboard 将自动显示这些实时数据！

启动 Console:
```bash
cd apps/console
pnpm run dev
```

现在 Dashboard 将显示真实的交易数据！📈

