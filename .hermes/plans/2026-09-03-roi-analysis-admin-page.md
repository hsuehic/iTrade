# ROI Analysis 管理页面 (Admin) — 实施计划

## 目标

在 iTrade Web 添加一个 admin 管理页面 `ROI Analysis`，展示所有已关联交易所账号的用户的资产情况。

## 列（按用户聚合）

- 用户 (name / email — 从 auth users 关联)
- 交易所账号数 (count of active account_info)
- Balance (总余额 = sum account_info.totalBalance)
- Fee Balance (可用余额 = sum account_info.availableBalance) — 已与用户确认：fee balance = available/free balance
- Locked Balance (锁定余额 = sum account_info.lockedBalance)
- MtoNowROI (本月至今收益率 %)
- YtoNowROI (今年至今收益率 %)

## ROI 计算（参考 dashboard 卡片逻辑，但按 admin 全局聚合）

dashboard 卡片 `balanceChange = (currentTotal - baseline) / baseline * 100`（calendar 对齐）：

- MtoNowROI → baseline = 本月初 (month 1st) 各账号快照 totalBalance 之和
- YtoNowROI → baseline = 本年初 (Jan 1) 各账号快照 totalBalance 之和
  数据源：`account_snapshots` 表(按 accountInfoId + timestamp) 中月初/年初的 totalBalance。
  实现：对每个 userId 的 accounts，取月初/年初最近一次快照 totalBalance 与当前 account_info.totalBalance 计算 ROI。
  沿用 dashboard 的 `calculateChange(current, baseline) = baseline===0 ? 0 : (current-baseline)/baseline*100`。

## 新增文件

1. `apps/web/app/api/admin/roi-analysis/route.ts`
   - `isAdminSession` 守卫（同 admin/users route）
   - 查询 account_info 按 userId 分组聚合（account_count, total_balance, available_balance, locked_balance）
   - 查询 account_snapshots 取月初/年初 baseline per accountInfoId
   - 关联 auth users 拿 name/email
   - 返回 rows
2. `apps/web/app/(console)/admin/roi-analysis/page.tsx`
   - admin 表格页（复刻 admin/users page 的 Card+Table 模式）
   - 列：User, Accounts, Balance, Fee Balance, Locked, MtoNowROI, YtoNowROI
   - ROI 用绿/红着色（>=0 绿, <0 红），Balance 用 USD 格式化
3. 修改 `apps/web/components/nav-admin.tsx`
   - 在 items 数组增加 `{ title: t('roiAnalysis'), url: '/admin/roi-analysis', icon: IconChartInfographic }`
   - 增加 i18n key：messages 中 nav.admin.roiAnalysis

## 数据层

- 用 `dm.getAccountInfoRepository()` (Repository<AccountInfoEntity>) 原生 TypeORM 批量查询：
  - 活跃账号：`account_info WHERE isActive = true`，按 userId 分组 sum
  - baseline：`account_snapshots` 按 accountInfoId 取 timestamp <= 月初/年初 的最近一条 totalBalance
- ROI 计算完全在 route 内 JS 完成，避免 N+1 历史时间序列查询（admin 聚合、轻量一次查询）

## 验证

- `cd apps/web && npx tsc --noEmit` 编译通过
- 手动 curl（若本地可连 DB）或 review diff；不能手动部署 GCE — push main 触发 CD
