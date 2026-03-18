# iTrade Deployment Strategy

## 🚀 Optimized Docker Deployment (No Full Source Code)

Since we're using pre-built Docker images from GitHub Container Registry (GHCR), we don't need the full source code on the GCE instance. We only need:

### Required Files on GCE:

1. **`docker-compose.prod.yml`** - Container orchestration configuration
2. **`deploy/` scripts** - Deployment utilities and templates
3. **Environment files** - Already present at `/opt/itrade/.env.*`

### What We DON'T Need:

- ❌ Full source code (`packages/`, `apps/src/`)
- ❌ Node.js dependencies (`node_modules/`, `pnpm-lock.yaml`)
- ❌ TypeScript source files
- ❌ Git history (`.git/` directory)

## 📁 Deployment Files Structure

```
/opt/itrade/
├── app/
│   ├── docker-compose.prod.yml          ← Container orchestration
│   └── deploy/
│       ├── certbot-init.sh              ← SSL certificate setup
│       ├── nginx.conf.template          ← Nginx configuration template
│       ├── env.*.template               ← Environment file templates
│       └── *.sh                         ← Utility scripts
├── .env.console                         ← Console app environment
├── .env.web                             ← Web app environment
├── .env.db                              ← Database environment
├── .env.certbot                         ← SSL certificate environment
├── nginx.conf                           ← Generated Nginx config
└── certbot/                             ← SSL certificates
    ├── certs/
    └── webroot/
```

## 🔄 Deployment Process

### 1. Build Phase (GitHub Actions Runner)

- ✅ Build Docker images with full source code
- ✅ Push images to GHCR with commit SHA tags
- ✅ Images contain compiled applications (no source needed)

### 2. Deploy Phase (GCE Instance)

- ✅ Download only deployment files (lightweight)
- ✅ Pull pre-built Docker images from GHCR
- ✅ Start containers with `docker compose up -d`
- ✅ No compilation or build steps on GCE

## 📊 Benefits

| Aspect            | Before (Full Repo)            | After (Files Only)    |
| ----------------- | ----------------------------- | --------------------- |
| **Download Size** | ~50MB (full repo)             | ~50KB (files only)    |
| **Download Time** | 5-15 seconds                  | <1 second             |
| **Disk Usage**    | ~200MB with node_modules      | ~1MB                  |
| **Git Issues**    | Permission errors, corruption | No Git dependency     |
| **Security**      | Full source exposed           | Only config files     |
| **Maintenance**   | Git permissions, cleanup      | Simple file downloads |

## 🛠️ Implementation

### Current Workflow (Optimized)

```bash
# Download deployment files
curl -fsSL "https://raw.githubusercontent.com/REPO/SHA/docker-compose.prod.yml" -o docker-compose.prod.yml
curl -fsSL "https://raw.githubusercontent.com/REPO/SHA/deploy/certbot-init.sh" -o deploy/certbot-init.sh

# Pull pre-built images
docker compose -f docker-compose.prod.yml pull

# Start services
docker compose -f docker-compose.prod.yml up -d
```

### Fallback Strategy

If GitHub raw file download fails, we can still fall back to Git clone, but this should be rare.

## 🔧 Migration Path

### For Existing Deployments

1. **Keep current setup working** - No breaking changes
2. **Gradual migration** - New deployments use file download
3. **Cleanup option** - Remove Git repo after verification

### For New Deployments

1. **Use `deploy/download-deployment-files.sh`** for initial setup
2. **GitHub Actions uses file download** by default
3. **No Git repository needed** on GCE instance

## 🚨 Considerations

### Advantages

- ✅ **Faster deployments** - No Git operations
- ✅ **No Git permission issues** - No `.git` directory
- ✅ **Smaller footprint** - Only essential files
- ✅ **Better security** - No source code exposure
- ✅ **Simpler maintenance** - No Git repository to manage

### Potential Drawbacks

- ⚠️ **Manual debugging** - No source code for troubleshooting
- ⚠️ **Script dependencies** - Deploy scripts must be self-contained
- ⚠️ **Network dependency** - Requires internet for file download

### Mitigation

- 📝 **Comprehensive logging** - Docker containers log everything needed
- 🔍 **Remote debugging** - Use `docker exec` to inspect containers
- 💾 **Backup strategy** - Keep deployment files cached locally
- 🔄 **Fallback to Git** - If file download fails

## 🎯 Recommendation

**Use the optimized file-download approach** for all new deployments. It's:

- **Faster** - Sub-second deployment file updates
- **More reliable** - No Git permission issues
- **Cleaner** - Minimal disk usage
- **More secure** - No source code exposure

The full source code is already compiled into Docker images, so we don't need it on the deployment server.
