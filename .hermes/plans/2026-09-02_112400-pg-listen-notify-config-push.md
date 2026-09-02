# iTrade PG LISTEN/NOTIFY 推送通知 — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** 在 iTrade Web 写入账号/策略后，通过 Postgres LISTEN/NOTIFY 毫秒级唤醒 Console,消除 60s 轮询延迟。

**Architecture:** Web 数据写入 commit 后追加一条 `SELECT pg_notify(...)`(fire-and-forget,不阻塞请求);Console 在 TypeORM PG driver 上占一条专用 client 做 `LISTEN`,收到通知后调现有 `refreshBots()` / `syncStrategiesWithDatabase()` 幂等函数。**保留 60s 轮询作为 fallback**(生产环境通过 env 改成 600s)。

**Tech Stack:** Next.js App Router API routes · TypeORM 0.3.27 · pg 8.16.3 · PostgreSQL(services-db-1 本地 / itrade-db GCE)

**Spike 验证：** `/Users/xiaowei.xue/Documents/Xiaowei/project/iTrade/spikes/001-pg-listen-notify/` — Q1 latency p50=0.8ms;Q2 占 1/5 池连接跑 LISTEN 不影响并发查询；Q3 重启期间消息丢失证实必须保留 fallback。

---

## 关键决策（与用户对齐)

| 决策点               | 结论                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------- |
| 通信协议             | PG `LISTEN/NOTIFY`,不走 HTTP/RPC、不引入 Redis/NATS                                                                 |
| 通道名               | `itrade_config_changed` (hardcoded,共享常量在 web `lib/console-notify.ts` 和 console `BotManager.ts`)               |
| Payload              | `{ kind: 'account' \| 'strategy', userId: string, strategyId?: number }` — 只作 hint,console 收后仍走 DB 查最新状态 |
| Fallback 频率        | 60s → 600s,通过 `BOT_REFRESH_INTERVAL_MS` / `STRATEGY_SYNC_INTERVAL_MS` env 覆盖，代码默认值不动                    |
| 参数热更新           | **不在范围**(YAGNI)。本期 NOTIFY 只承诺新增/启停/删除立即生效；参数修改依然需要 stop→start 走原流程                 |
| NOTIFY 失败处理      | fire-and-forget。业务 commit 已成功 → NOTIFY 失败仅 log,不 500                                                      |
| `pg_notify` 调用位置 | 在业务 commit **之后**、response 返回之前追加，不包在业务事务里（如果业务回滚，无异步消息)                          |

---

## 覆盖面（代码已核实)

| 用户操作           | 路径                                    | payload.kind                                     |
| ------------------ | --------------------------------------- | ------------------------------------------------ |
| 新用户注册         | `auth/[...all]` — 不写 account/strategy | **不发**(console 不需要知道，首次添加账号会触发) |
| 添加账号           | `POST /api/accounts`                    | `account`                                        |
| 修改账号           | `POST /api/accounts`(带 id)             | `account`                                        |
| 删除账号           | `DELETE /api/accounts/[id]`             | `account`                                        |
| 添加策略 (STOPPED) | `POST /api/strategies`                  | `strategy`                                       |
| 修改策略参数       | `PATCH /api/strategies/[id]`            | `strategy`                                       |
| 启动/停止/暂停策略 | `POST /api/strategies/[id]/status`      | `strategy`                                       |
| 删除策略           | `DELETE /api/strategies/[id]`           | `strategy`                                       |
| 克隆策略 (STOPPED) | `POST /api/strategies/[id]/clone`       | `strategy`                                       |

---

## Task 1: Web — `lib/console-notify.ts` helper

**Objective:** 给 web 一个共享的、fallible 的 notify 函数。

**Files:**

- Create: `apps/web/lib/console-notify.ts`

**Implementation:**

```ts
import { getDataManager } from './data-manager';

const CHANNEL = 'itrade_config_changed';

export type NotifyPayload =
  | { kind: 'account'; userId: string }
  | { kind: 'strategy'; userId: string; strategyId: number };

/**
 * Fire-and-forget: publish a PG NOTIFY to wake the console.
 * Never throws; failures are logged but MUST NOT 500 the request —
 * the console's 600s polling fallback will pick up the change.
 */
export async function notifyConfigChange(payload: NotifyPayload): Promise<void> {
  try {
    const dm = await getDataManager();
    await dm.dataSource.query(`SELECT pg_notify($1, $2)`, [
      CHANNEL,
      JSON.stringify(payload),
    ]);
  } catch (err) {
    console.warn(
      '[console-notify] pg_notify failed (fallback polling will recover)',
      err,
    );
  }
}
```

**Verify:**

```bash
cd apps/web && pnpm run typecheck
```

Expected: 0 errors in new file.

**Commit:**

```bash
git add apps/web/lib/console-notify.ts
git commit -m "feat(web): add pg_notify helper for console config push"
```

---

## Task 2: Web — 在 6 条 route 里调用 `notifyConfigChange`

**Files:**

- `apps/web/app/api/accounts/route.ts` — POST 在 `upsertAccount` 成功后
- `apps/web/app/api/accounts/[id]/route.ts` — DELETE 在 `removeAccount` 成功后
- `apps/web/app/api/strategies/route.ts` — POST 在 `createStrategy` + `logIfImpersonating` 后、return 前
- `apps/web/app/api/strategies/[id]/route.ts` — PATCH 在 `updateStrategy` 后；DELETE 在 `deleteStrategy` 后
- `apps/web/app/api/strategies/[id]/status/route.ts` — POST 在 `updateStrategyStatus` 后
- `apps/web/app/api/strategies/[id]/clone/route.ts` — POST 在 `createStrategy`(clone）后

每条 PATCH/DELETE 里都已经有 ownership-check 的 `strategy.user.id` / `session.user.id`,payload 直接用 `session.user.id` 和 strategy id。

**Diff pattern (1 处示例,其它 5 处同构):**

```diff
// accounts/route.ts POST
     const account = await accountService.upsertAccount({
       ...body,
       userId: session.user.id,
     });
+    await notifyConfigChange({ kind: 'account', userId: session.user.id });
     return NextResponse.json({ success: true, account });
```

不放在 `accountService.upsertAccount()` 内部的理由：service 层保持纯净，web routes 是通信层边界；后续如果有别的 caller（如 mobile admin API，见 `mobile-feature-port-prompt.md`）会自动继承。

**Verify:**

```bash
cd apps/web && pnpm run typecheck && pnpm run lint
# runtime check 在 Task 4 做
```

**Commit:**

```bash
git add apps/web/app/api
git commit -m "feat(web): notify console on account/strategy writes"
```

---

## Task 3: Console — `BotManager` 加 LISTEN

**Files:**

- Modify: `apps/console/src/BotManager.ts`
- Modify: `apps/console/src/BotInstance.ts`(把每个 bot 的 `strategyManager` 暴露给 BotManager，让单条 PG LISTEN 同时驱动 bot 刷新和策略同步）

**Approach:**

`BotManager.start()` 末尾追加 LISTEN 注册。类型上 TypeORM PG driver 的 `obtainMasterConnection()` 返回 `[PoolClient, release]`(`PostgresDriver.js:911` 已核实）。我们 hold 住 client 不 release,`client.on('notification')` 监听。

**关键代码（完整):**

```ts
// BotManager.ts — 新成员
private pgListenClient: { release: () => void } | null = null;
private notifyDebounceTimer: NodeJS.Timeout | null = null;

// start() 尾部追加
await this.setupConfigChangeListener();

private async setupConfigChangeListener(): Promise<void> {
  try {
    const driver = this.dataManager.dataSource.driver;
    // PostgresDriver.obtainMasterConnection: returns [client, release]
    const obtainMaster = (driver as unknown as {
      obtainMasterConnection?: () => Promise<[
        { on: (evt: string, cb: (msg: { channel: string; payload: string }) => void) => void;
          query: (sql: string) => Promise<unknown> },
        () => void,
      ]>;
    }).obtainMasterConnection;
    if (typeof obtainMaster !== 'function') {
      this.logger.warn?.('[BotManager] driver lacks obtainMasterConnection, LISTEN disabled');
      return;
    }
    const [client, release] = await obtainMaster.call(driver);
    this.pgListenClient = { release };

    client.on('notification', (msg) => {
      if (msg.channel !== 'itrade_config_changed') return;
      // debounce: 连续操作合并到 50ms 内一次 refresh
      if (this.notifyDebounceTimer) clearTimeout(this.notifyDebounceTimer);
      this.notifyDebounceTimer = setTimeout(() => {
        this.notifyDebounceTimer = null;
        this.logger.debug('[BotManager] pg_notify received, refreshing bots');
        this.refreshBots().catch((err) => {
          this.logger.warn?.(`[BotManager] refreshBots after notify failed: ${(err as Error).message}`);
        });
      }, 50);
    });

    await client.query('LISTEN itrade_config_changed');
    this.logger.debug('[BotManager] LISTEN itrade_config_changed registered');
  } catch (err) {
    this.logger.warn?.(`[BotManager] LISTEN setup failed (polling fallback intact): ${(err as Error).message}`);
  }
}

// stop() 开头追加
if (this.pgListenClient) {
  try { this.pgListenClient.release(); } catch { /* ignore */ }
  this.pgListenClient = null;
}
if (this.notifyDebounceTimer) {
  clearTimeout(this.notifyDebounceTimer);
  this.notifyDebounceTimer = null;
}
```

**`BotInstance` 修改：** 让 `BotManager.refreshBots()` 触发某个 bot 的 strategyManager 即时同步（现在 `refreshBots` 只调 `bot.syncExchanges()`，不调 strategy sync)。在 `BotInstance` 加：

```ts
public async syncStrategiesNow(): Promise<void> {
  // 触发 strategyManager 立即 sync(不调它自己的定时器)
  await (this.strategyManager as unknown as {
    syncStrategiesWithDatabase?: () => Promise<void>;
  }).syncStrategiesWithDatabase?.();
}
```

并在 `BotManager.refreshBots()` 中 `try { await bot.syncExchanges(userAccounts); }` 之后加：

```ts
try {
  await bot.syncStrategiesNow();
} catch (err) {
  this.logger.warn?.(
    `[BotManager] strategy sync failed for ${userId}: ${(err as Error).message}`,
  );
}
```

理由：单条 PG LISTEN 同时驱动 account 变化（syncExchanges，已经做）和 strategy 变化（新加的 syncStrategiesNow)。这样 600s fallback 也由 `STRATEGY_SYNC_INTERVAL_MS` env 独立控制，两者频率解耦。

**Verify:**

```bash
cd apps/console
pnpm --filter @itrade/console run typecheck
pnpm --filter @itrade/console run lint
```

**Commit:**

```bash
git add apps/console/src/BotManager.ts apps/console/src/BotInstance.ts
git commit -m "feat(console): LISTEN itrade_config_changed to wake BotManager"
```

---

## Task 4: 本地 E2E 验证

不做单元测试（通信层，本质依赖 PG)。做一个集成验证：

**Steps:**

1. 启动本地 PG（已经在跑 `services-db-1`)、本地 web dev server、本地 console
2. 用 `LISTEN itrade_config_changed` 在 psql 里监听，或者用 `tail -f` console 日志
3. 浏览器 web UI 添加一个账号 → 观察 console 日志 < 1s 出现 `pg_notify received` + `refreshBots` 触发
4. `docker exec services-db-1 psql -U postgres -d itrade -c "SELECT pg_notify('itrade_config_changed', '{\"kind\":\"strategy\",\"userId\":\"<test-uid>\",\"strategyId\":1}');"` 直接手动注入一条，确认 console 收到
5. 重启 console 进程 — 模拟丢消息场景，观察 600s 内自动通过轮询恢复

**Expected(量化):**

- Web POST → console 日志 `pg_notify received` **延迟 < 2s**(本地应 < 100ms)
- 重启期间丢消息，600s fallback 兜底
- 现有 60s/600s 轮询继续工作，不回归

---

## Task 5: `docker-compose.prod.yml` / `deploy/envs/gce` 配置 fallback interval

**Files:**

- Modify: 生产 `.env.console` (GCE 服务器上 `/opt/itrade/.env.console`)，加：
  ```
  BOT_REFRESH_INTERVAL_MS=600000
  STRATEGY_SYNC_INTERVAL_MS=600000
  ```
- **不改代码默认值**(60s default 保留，本地 dev / 未设 env 环境不受影响，防御回退）

部署清单：

1. `git push origin main` → CD 自动部署（**用户明确禁止手动部署到 GCE**)
2. CD 部署完后 SSH GCE 验证：
   ```bash
   ssh -i deploy/envs/gce_deploy_key xiaoweihsueh@34.143.244.107 \
     "docker logs itrade-console --tail 100 | grep LISTEN"
   ```
3. 期望看到 `LISTEN itrade_config_changed registered`
4. 生产 UI 改一次账号/策略 → `docker logs itrade-console --tail 20 | grep pg_notify` 期望 < 1s 触发

**Commit:**

```bash
git add deploy/
git commit -m "chore(deploy): raise console polling fallback to 600s (LISTEN is primary)"
```

---

## 风险与回滚

| 风险                                        | 缓解                                                                                      |
| ------------------------------------------- | ----------------------------------------------------------------------------------------- |
| NOTIFY 消息丢失（重启）                     | 保留 600s 轮询 fallback                                                                   |
| `obtainMasterConnection` 在 driver 上不存在 | try/catch + 仅 log，不影响轮询                                                            |
| web 多发 NOTIFY 导致 console 抖动           | 50ms debounce                                                                             |
| pool 占用 1 连接只做 LISTEN                 | Spike Q2 已验证：50 并发查询用 4 剩余池槽 208ms 完成；生产池 max=10,LISTEN 占 1 后剩 9 槽 |
| 回滚                                        | `git revert` 两个 commit。轮询依然在，功能完全不受影响                                    |

---

## 明确不做（YAGNI)

- ❌ 参数热更新（修改 strategy 参数后自动重启）— 需要 stop/start 流程变更，不在本期
- ❌ NOTIFY 持久化 / replay — 已经有 600s fallback，重复实现 PG 持久队列无意义
- ❌ RPC / HTTP 端口 / Unix Socket / 合并部署 — spike 阶段已否决
- ❌ 删除 `setInterval` 轮询 — 保留作为 fallback,spike Q3 证明需要

---

## Success criteria

- [ ] Web UI 操作账号/策略 → console < 2s 触发 refresh（本地实测)
- [ ] `pnpm run typecheck && pnpm run lint && pnpm run build` 全部干净
- [ ] 60s → 600s fallback 生效（生产 `.env.console` 改动后）
- [ ] 无 regression：重启后 600s 兜底能自动同步；轮询日志继续工作
