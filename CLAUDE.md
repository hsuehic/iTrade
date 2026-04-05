# Claude Guidelines for iTrade

## Verification After Fixing Issues

Whenever source files are modified (TypeScript, JavaScript, configs, etc.), always run the following checks before considering the fix complete:

```bash
# 1. Lint — catch style and static analysis errors
pnpm run lint

# 2. Type-check — ensure no TypeScript errors across all packages
pnpm run typecheck

# 3. Build — confirm the full monorepo compiles without errors
pnpm run build
```

All three must pass cleanly. If any step fails, fix the new errors before closing out the task.

### Scope-limited runs (faster feedback loop)

When changes are isolated to a single package, you can target that package directly:

```bash
# Replace <package-name> with e.g. @itrade/core, @itrade/web-manager, etc.
pnpm --filter <package-name> run lint
pnpm --filter <package-name> run typecheck
pnpm --filter <package-name> run build
```

Always follow up with a root-level `pnpm run build` to confirm no cross-package regressions.
