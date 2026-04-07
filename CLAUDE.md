# Claude Guidelines for iTrade

## Verification After Fixing Issues

**Every fix must be verified before it is considered complete.** This includes both static checks and runtime/functional verification.

### 1. Static checks (always run after any source change)

```bash
# Lint — catch style and static analysis errors
pnpm run lint

# Type-check — ensure no TypeScript errors across all packages
pnpm run typecheck

# Build — confirm the full monorepo compiles without errors
pnpm run build
```

All three must pass cleanly. If any step fails, fix the new errors before closing out the task.

#### Scope-limited runs (faster feedback loop)

When changes are isolated to a single package, target that package directly:

```bash
# Replace <package-name> with e.g. @itrade/core, @itrade/web-manager, etc.
pnpm --filter <package-name> run lint
pnpm --filter <package-name> run typecheck
pnpm --filter <package-name> run build
```

Always follow up with a root-level `pnpm run build` to confirm no cross-package regressions.

### 2. Runtime / functional verification (always run after any bug fix)

Static checks alone are not sufficient — a fix must also be verified to actually work at runtime. After fixing a bug, always confirm the fix end-to-end using one or more of the following methods:

**Database queries (via docker exec):**

```bash
docker exec services-db-1 psql -U postgres -d itrade -c "\timing on" -c "<query>"
```

Use this to verify: data exists, queries return quickly (no timeouts), schema changes took effect.

**HTTP API (via curl with timing):**

```bash
curl -s -o /dev/null -w '%{http_code} %{time_total}s' \
  -b <session-cookie> 'http://localhost:3000/api/...'
```

Confirm: correct HTTP status code, response time is within acceptable range (not timing out).

**Browser console (via osascript + Chrome JS execution):**

```applescript
tell application "Google Chrome"
  do JavaScript "<verification script>" in tab 1 of window 1
end tell
```

Use this to confirm UI behaviour, network responses, or console errors after a UI/API fix.

**What to check and report:**

- For query-timeout fixes: confirm individual query times (should be milliseconds, not seconds)
- For API fixes: confirm the endpoint returns 200 with the expected payload shape
- For UI fixes: confirm the affected component renders correctly and data is present
- Always state the measured result (e.g. "query returned 529 rows in 2ms") — not just "no errors"

**Never mark a fix complete without runtime verification.** If runtime testing is not possible (e.g. test environment unavailable), state this explicitly and document what verification was performed instead.

**Claude must perform runtime verification autonomously — never instruct the user to run a backtest or test manually.** Use the browser (via osascript or Chrome MCP tools) to trigger runs directly. For backtests:

1. Navigate to `http://localhost:3000/backtest` in Chrome
2. Click the Run button on any existing config (or create one)
3. Wait for completion, then query the DB to confirm the expected data was written

---

## Tool & Terminal Hygiene

**After every use of Terminal, browser tabs, or other external tools, close or quit them.** Leaving stale terminals or tabs open clutters the user's environment.

**Rules:**

- After running shell commands via `osascript` Terminal, close the Terminal window/tab when done:
  ```applescript
  tell application "Terminal"
    close (every window whose name contains "iTrade")
  end tell
  ```
- After opening browser tabs for verification, close them when done:
  ```applescript
  tell application "Google Chrome"
    -- close any tab opened for testing
  end tell
  ```
- Prefer reusing a single Terminal window across multiple commands in the same task rather than opening a new window per command.
- Never leave behind idle terminal processes or orphaned browser tabs.
