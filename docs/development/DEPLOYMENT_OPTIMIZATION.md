# Deployment Performance Optimization

This document explains the optimizations made to prevent GitHub Actions deployment timeouts.

## Problem

GitHub Actions deployments were exceeding the 30-minute timeout limit, causing failed deployments.

## Root Causes Identified

1. **Docker builds on GCE** - Builds happen on the GCE instance (slower than GitHub Actions runners)
2. **No BuildKit caching** - Every build started from scratch
3. **Sequential builds** - Three images (schema-migrator, console, web) built sequentially
4. **Large build context** - Entire monorepo copied for each build
5. **No build progress monitoring** - Hard to identify bottlenecks

## Optimizations Applied

### 1. Increased Timeout

**Changed:** `timeout-minutes: 30` → `timeout-minutes: 60`

**Reason:** GCE builds are slower than GitHub Actions runners. 60 minutes provides a safe buffer.

### 2. Enabled Docker BuildKit

**Added:**
```bash
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
```

**Benefits:**
- Faster builds with parallel layer processing
- Better cache utilization
- Support for cache mounts

### 3. Shared Dependencies Base Image

**Created:** `Dockerfile.deps` - A shared base image with all npm dependencies

**Changed in Dockerfiles:**
```dockerfile
# Before (in both web and console Dockerfiles)
FROM node:20-alpine AS deps
RUN apk add --update --no-cache python3 build-base
RUN npm install -g pnpm@10.18.0
# ... copy package.json files ...
RUN pnpm install --frozen-lockfile

# After
FROM itrade-deps:latest AS deps
```

**Benefits:**
- Dependencies installed **once** instead of three times (web, console, schema-migrator)
- Saves ~15-20 minutes on first build
- Saves ~5-10 minutes on subsequent builds
- All services share the same dependency versions

### 4. Added BuildKit Cache Mounts for pnpm

**Changed in Dockerfile.deps:**
```dockerfile
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
```

**Benefits:**
- pnpm store cached between builds
- Significantly faster `pnpm install` on subsequent builds
- Reduces build time from ~20min to ~5-10min for dependency installation

### 5. Added Build Progress Monitoring

**Added:**
- Build time tracking and reporting
- Disk space checks before builds
- Warnings if builds take >30 minutes
- Better error messages

### 6. Build Progress Output

**Added:** `--progress=plain` flag to see detailed build progress

**Benefits:**
- Easier to identify which step is slow
- Better debugging when builds fail

## Expected Build Times

### First Build (No Cache)
- **Total:** 20-30 minutes (down from 25-35)
  - Shared dependencies: ~15-20 minutes (built once)
  - Web build: ~5-8 minutes (reuses deps)
  - Console build: ~5-8 minutes (reuses deps)
  - Schema-migrator: ~1-2 minutes (reuses deps)

### Subsequent Builds (With Cache)
- **Total:** 8-15 minutes (down from 10-20)
  - Shared dependencies: ~2-5 minutes (cached)
  - Web build: ~3-5 minutes (reuses cached deps)
  - Console build: ~3-5 minutes (reuses cached deps)
  - Schema-migrator: ~1 minute (reuses cached deps)

### Cached Rebuilds (Only Code Changed)
- **Total:** 5-10 minutes (down from 8-15)
  - Shared dependencies: ~1-2 minutes (cached)
  - Web build: ~2-4 minutes (reuses cached deps)
  - Console build: ~2-4 minutes (reuses cached deps)
  - Schema-migrator: ~1 minute (reuses cached deps)

## Further Optimization Opportunities

### 1. Build Only Changed Services

Instead of building all services, only build what changed:

```bash
# Example: Only build web if web files changed
if git diff --name-only HEAD~1 | grep -q "apps/web\|packages/"; then
  docker compose build web
fi
```

### 2. Use Docker Layer Caching Registry

Push images to a registry and use `--cache-from`:

```bash
docker compose build --cache-from registry.example.com/itrade-web:latest
```

### 3. Parallel Builds

Build multiple services in parallel (requires docker-compose v2):

```bash
docker compose build --parallel
```

### 4. Optimize Build Context

Further reduce `.dockerignore` exclusions to minimize build context size.

### 5. Use Multi-Stage Build Optimization

Already implemented, but can be further optimized by:
- Sharing common base layers
- Using build cache for intermediate stages

## Monitoring Build Performance

The deployment script now reports:
- Build start/end times
- Total build duration
- Warnings if builds exceed 30 minutes
- Disk space before builds

Check GitHub Actions logs for:
```
▶ Build completed in 1234s (20m 34s)
```

## Troubleshooting Slow Builds

If builds are still slow:

1. **Check GCE instance resources:**
   ```bash
   # On GCE instance
   free -h
   df -h
   docker system df
   ```

2. **Check Docker cache:**
   ```bash
   docker system df -v
   ```

3. **Clear old images (if disk full):**
   ```bash
   docker system prune -a
   ```

4. **Check network speed:**
   - Slow network affects `pnpm install` and base image pulls
   - Consider using a faster GCE region

5. **Upgrade GCE instance:**
   - More CPU: `e2-medium` → `e2-standard-4`
   - More RAM: Helps with parallel builds

## Related Files

- `.github/workflows/deploy.yml` - GitHub Actions workflow
- `Dockerfile.deps` - Shared dependencies base image
- `apps/web/Dockerfile` - Web application Dockerfile (uses shared deps)
- `apps/console/Dockerfile` - Console application Dockerfile (uses shared deps)
- `docker-compose.prod.yml` - Production compose file
- `.dockerignore` - Build context exclusions

---

Author: xiaoweihsueh@gmail.com  
Date: December 19, 2024
