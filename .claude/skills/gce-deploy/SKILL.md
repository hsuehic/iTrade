---
name: gce-deploy
description: >
  Deploy iTrade to Google Compute Engine (GCE). Use this skill whenever the
  user wants to deploy, push, or release changes to the production server —
  including syncing updated environment variables (.env files), restarting
  Docker containers, or doing a full hot-redeploy of the web or console
  service. Triggers on phrases like "deploy to GCE", "push to production",
  "update env on server", "restart web on GCE", "sync env files", "deploy
  the changes", "release to prod", or any mention of GCE + deploy/restart/update.
---

# GCE Deploy Skill

This skill handles deploying iTrade updates to the production Google Compute
Engine instance. All shell commands run on the **user's local Mac** via
`osascript`, because the Cowork sandbox cannot reach GCE directly.

---

## Deployment types

### A — Env-file hot deploy (most common)

Use when only `.env` files changed (e.g. a new API key was added).
No new Docker image is needed — just sync the files and restart the
affected containers with their current images.

### B — Full redeploy via CI/CD

Use when source code changed. Push to `main` and GitHub Actions will
build new images and deploy automatically. This skill does not handle
the build step — just remind the user to push/merge to `main`.

---

## Step 1 — Find the project root

Run this to locate the iTrade project on the user's Mac:

```applescript
do shell script "find /Users -maxdepth 7 -name 'sync-env.sh' -path '*/iTrade/*' 2>/dev/null | head -1 | xargs -I{} dirname {} | xargs -I{} dirname {}"
```

Store the result as `PROJECT_ROOT` (e.g. `/Users/xiaowei.xue/Documents/Xiaowei/project/iTrade`).

Verify `.env.gce` exists at `$PROJECT_ROOT/.env.gce`. If missing, tell the user
to create it from `deploy/env.gce.template`.

---

## Step 2 — Sync env files to GCE

```applescript
do shell script "cd '<PROJECT_ROOT>' && bash deploy/sync-env.sh 2>&1"
```

Timeout: 120 seconds (gcloud IAP tunnel setup takes ~20–30 s on first run).

Expected success output contains: `All env files synced successfully`.

If it fails with `gcloud not found`, the user needs to install the
[Google Cloud SDK](https://cloud.google.com/sdk/docs/install).

---

## Step 3 — Fix env file permissions on GCE

After syncing, `sync-env.sh` sets files to `chmod 600`. Docker Compose needs
`644` to read them. Fix this immediately after every sync:

```applescript
do shell script "gcloud compute ssh <INSTANCE> --zone=<ZONE> --tunnel-through-iap --command='sudo chmod 644 /opt/itrade/.env.web /opt/itrade/.env.console /opt/itrade/.env.db' 2>&1"
```

Read `INSTANCE` and `ZONE` from `$PROJECT_ROOT/.env.gce`
(`GCE_INSTANCE` and `GCE_ZONE`).

---

## Step 4 — Restart affected containers

Only restart the services whose env files changed. For each service you
need to restart:

### 4a — Get the currently running image tag

```applescript
do shell script "gcloud compute ssh <INSTANCE> --zone=<ZONE> --tunnel-through-iap --command='docker inspect itrade-<SERVICE> --format=\"{{.Config.Image}}\"' 2>&1"
```

Where `<SERVICE>` is `web`, `console`, etc.

### 4b — Recreate the container with that image

```applescript
do shell script "gcloud compute ssh <INSTANCE> --zone=<ZONE> --tunnel-through-iap --command='cd /opt/itrade/app && <IMAGE_ENV>=<IMAGE_TAG> docker compose -f docker-compose.prod.yml up -d --force-recreate --no-deps <SERVICE> 2>&1' 2>&1"
```

Image env var names per service:
| Service | Env var |
|------------------|----------------------|
| `web` | `WEB_IMAGE` |
| `console` | `CONSOLE_IMAGE` |
| `schema-migrator`| `SCHEMA_MIGRATOR_IMAGE` |

**Why `--no-deps`?** We pass this flag so Docker Compose doesn't touch
the database or other services — we're only hot-reloading the app.

---

## Step 5 — Verify health

After recreating, poll until the container reports `(healthy)`:

```applescript
do shell script "sleep 20 && gcloud compute ssh <INSTANCE> --zone=<ZONE> --tunnel-through-iap --command='docker ps --filter name=itrade-<SERVICE> --format \"{{.Names}}  {{.Status}}\"' 2>&1"
```

Expected: `itrade-web  Up 20 seconds (healthy)`

If still `(health: starting)` after 30 s, wait another 15 s and recheck.
If `(unhealthy)` or container exited, fetch logs:

```applescript
do shell script "gcloud compute ssh <INSTANCE> --zone=<ZONE> --tunnel-through-iap --command='docker logs --tail 50 itrade-<SERVICE>' 2>&1"
```

---

## Quick-reference: common scenarios

| User asks                       | Steps to run                                          |
| ------------------------------- | ----------------------------------------------------- |
| "Deploy the new Gemini API key" | 1 → 2 → 3 → 4 (web only) → 5                          |
| "Restart the web container"     | 4 → 5 (skip sync)                                     |
| "Sync env files to GCE"         | 1 → 2 → 3                                             |
| "Deploy my code changes"        | Remind user to push to `main`; CI/CD handles the rest |
| "What's running on GCE?"        | Run `docker ps` via gcloud ssh                        |

---

## GCE connection reference

All values come from `$PROJECT_ROOT/.env.gce`:

| Variable       | Example                      |
| -------------- | ---------------------------- |
| `GCE_INSTANCE` | `instance-20260318-140156`   |
| `GCE_ZONE`     | `asia-southeast1-a`          |
| `GCE_HOST`     | `34.143.244.107`             |
| `GCE_USER`     | `xiaoweihsueh`               |
| `GCE_KEY`      | `deploy/envs/gce_deploy_key` |

Direct SSH (`GCE_HOST`) is often unreachable from the local network —
always prefer `gcloud compute ssh --tunnel-through-iap` which routes
through Google's IAP proxy and doesn't require firewall rules.

---

## Troubleshooting

**"pull access denied for itrade-web"**
Docker Compose tried to pull the image without the `WEB_IMAGE` env var set.
Always fetch the current image tag from the running container first (Step 4a)
and pass it explicitly.

**"open /opt/itrade/.env.web: permission denied"**
Env file is `600` (owner-only). Run Step 3 to set `644`.

**"lstat /opt/itrade/app/apps: no such file or directory"**
Docker Compose tried to build locally — source code isn't on GCE.
Pass `--no-deps` and ensure the image tag env var is set.

**gcloud IAP tunnel is slow (~20–30 s)**
Normal for first connection in a session. Subsequent SSH calls in the
same script are faster.
