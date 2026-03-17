# Local Deployment Testing Guide

This guide explains how to test deployment steps locally before pushing to GitHub Actions.

## Overview

The `deploy/test-local.sh` script tests each deployment step locally to catch issues before they reach production. This helps debug GitHub Actions failures and ensures your deployment will work correctly.

## Prerequisites

- Docker installed and running
- Access to the project repository
- Basic understanding of bash scripts

## Quick Start

Run all tests at once:

```bash
bash deploy/test-local.sh
```

Or test individual components:

```bash
bash deploy/test-local.sh web      # Test web build
bash deploy/test-local.sh console  # Test console build
bash deploy/test-local.sh certbot  # Validate certbot script
bash deploy/test-local.sh sync     # Validate env sync script
bash deploy/test-local.sh compose  # Validate docker-compose
```

## Step-by-Step Testing

### Step 1: Test Web Docker Image Build

This tests the exact same build process used in GitHub Actions for the web application.

```bash
bash deploy/test-local.sh web
```

**What it does:**
- Builds the web Docker image using `apps/web/Dockerfile`
- Uses the same multi-stage build process as production
- Verifies the image is created successfully
- Reports build time and image size

**Expected output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Test 1: Web Docker Image Build
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▶ Building web Docker image...
▶ This tests the same build process used in GitHub Actions

[Build output...]

✅ Web image built successfully in 45s
Image size: 450MiB
✅ Web build test PASSED
```

**If it fails:**
- Check build logs: `/tmp/web-build.log`
- Verify Docker is running: `docker ps`
- Check disk space: `df -h`
- Review Dockerfile syntax: `apps/web/Dockerfile`

### Step 2: Test Console Docker Image Build

This tests the console application Docker build process.

```bash
bash deploy/test-local.sh console
```

**What it does:**
- Builds the console Docker image using `apps/console/Dockerfile`
- Compiles TypeScript packages in the correct dependency order
- Verifies the image is created successfully
- Reports build time and image size

**Expected output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Test 2: Console Docker Image Build
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▶ Building console Docker image...
▶ This tests the same build process used in GitHub Actions

[Build output...]

✅ Console image built successfully in 38s
Image size: 380MiB
✅ Console build test PASSED
```

**If it fails:**
- Check build logs: `/tmp/console-build.log`
- Verify all packages build correctly: `pnpm build --filter "./packages/*"`
- Check TypeScript compilation: `cd apps/console && pnpm typecheck`

### Step 3: Validate Certbot Script

This validates the certbot initialization script without actually running it (dry-run).

```bash
bash deploy/test-local.sh certbot
```

**What it does:**
- Checks `deploy/certbot-init.sh` exists and is executable
- Validates bash syntax
- Verifies required files exist (nginx.conf.template, docker-compose.prod.yml)
- Checks script logic for reading env files and generating nginx config

**Expected output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Test 3: Certbot Initialization Validation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▶ Validating certbot-init.sh script...

▶ Checking bash syntax...
✅ Script syntax is valid

▶ Checking required files...
✅ All required files present

▶ Validating certbot script logic...
✅ Script reads .env.certbot file
✅ Script generates nginx.conf

✅ Certbot validation test PASSED
Note: This is a dry-run validation. Actual certbot requires:
  - DNS pointing to server
  - Services running on GCE
  - Valid .env.certbot file
```

**If it fails:**
- Fix bash syntax errors in `deploy/certbot-init.sh`
- Ensure `deploy/nginx.conf.template` exists
- Verify `docker-compose.prod.yml` is in project root

### Step 4: Validate Environment Sync Script

This validates the environment file sync script without actually syncing (dry-run).

```bash
bash deploy/test-local.sh sync
```

**What it does:**
- Checks `deploy/sync-env.sh` exists and is executable
- Validates bash syntax
- Verifies template files exist
- Checks script supports both gcloud and scp modes

**Expected output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Test 4: Environment Sync Validation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▶ Validating sync-env.sh script...

▶ Checking bash syntax...
✅ Script syntax is valid

▶ Checking envs directory structure...
✅ envs directory exists
✅ All template files present

▶ Validating sync script logic...
✅ Script supports gcloud mode
✅ Script supports scp mode
✅ Script reads .env.gce configuration

✅ Environment sync validation test PASSED
Note: This is a dry-run validation. Actual sync requires:
  - Valid .env.gce file with GCE connection info
  - SSH access to GCE instance
  - Env files in deploy/envs/ directory
```

**If it fails:**
- Fix bash syntax errors in `deploy/sync-env.sh`
- Create missing template files in `deploy/` directory
- Ensure script handles both gcloud and scp modes

### Step 5: Validate Docker Compose Configuration

This validates the production docker-compose file syntax and structure.

```bash
bash deploy/test-local.sh compose
```

**What it does:**
- Validates `docker-compose.prod.yml` syntax
- Checks all required services are defined
- Verifies healthcheck configurations

**Expected output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Test 5: Docker Compose Configuration Validation
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▶ Validating docker-compose.prod.yml...

▶ Validating docker-compose syntax...
✅ Docker Compose syntax is valid

▶ Checking required services...
✅ All required services defined: db schema-migrator console web nginx certbot

▶ Checking healthcheck configurations...
✅ Healthchecks are configured

✅ Docker Compose validation test PASSED
```

**If it fails:**
- Fix YAML syntax errors in `docker-compose.prod.yml`
- Ensure all required services are defined
- Check service dependencies are correct

## Running All Tests

To run all tests in sequence:

```bash
bash deploy/test-local.sh all
```

Or simply:

```bash
bash deploy/test-local.sh
```

**Expected output:**
```
[All test outputs...]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Test Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Total tests: 5
  ✅ Passed:   5
  ❌ Failed:   0

🎉 All tests PASSED!

You can now push to GitHub. The deployment should work.
```

## Cleanup

After testing, remove test Docker images to free up disk space:

```bash
bash deploy/test-local.sh cleanup
```

Or manually:

```bash
docker image rm itrade-web:test itrade-console:test
```

## Troubleshooting

### Build Failures

**Problem:** Web or console build fails

**Solutions:**
1. Check Docker is running: `docker ps`
2. Verify disk space: `df -h` (need at least 10GB free)
3. Check build logs: `/tmp/web-build.log` or `/tmp/console-build.log`
4. Try building packages locally first:
   ```bash
   pnpm build --filter "./packages/*"
   ```

### Script Validation Failures

**Problem:** Certbot or sync script validation fails

**Solutions:**
1. Check bash syntax: `bash -n deploy/certbot-init.sh`
2. Make scripts executable: `chmod +x deploy/*.sh`
3. Verify required files exist (templates, docker-compose, etc.)

### Docker Compose Validation Failures

**Problem:** Docker Compose validation fails

**Solutions:**
1. Check YAML syntax: `docker compose -f docker-compose.prod.yml config`
2. Verify all services are defined correctly
3. Check for indentation errors (YAML is sensitive to spacing)

## Integration with GitHub Actions

The local tests mirror what GitHub Actions does:

1. **Web build** → Same as GitHub Actions `docker build` for web
2. **Console build** → Same as GitHub Actions `docker build` for console
3. **Certbot validation** → Ensures certbot script will work on GCE
4. **Sync validation** → Ensures env sync will work
5. **Compose validation** → Ensures docker-compose config is valid

If all local tests pass, the GitHub Actions deployment should work (assuming GCE setup is correct).

## Next Steps

After all tests pass:

1. **Commit your changes:**
   ```bash
   git add .
   git commit -m "Fix deployment issues"
   ```

2. **Push to main branch:**
   ```bash
   git push origin main
   ```

3. **Monitor GitHub Actions:**
   - Go to your repository → Actions tab
   - Watch the "Deploy to GCE" workflow
   - Check logs if it fails

4. **Verify deployment on GCE:**
   ```bash
   ssh user@gce-host
   cd /opt/itrade/app
   docker compose -f docker-compose.prod.yml ps
   ```

## Related Documentation

- [Deployment Guide](../DEPLOY.md) - Full deployment documentation
- [GCE Setup Script](../deploy/setup-gce.sh) - One-time GCE instance setup
- [Environment Sync](../deploy/sync-env.sh) - Sync env files to GCE
- [Database Sync](../deploy/db-sync.sh) - Sync database between local and GCE

---

Author: xiaoweihsueh@gmail.com  
Date: December 19, 2024
