# Database Sync — `deploy/db-sync.sh`

Bi-directional PostgreSQL sync between your **local** Docker container and the **GCE production** server.

---

## Prerequisites

| Requirement             | Detail                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| Docker running locally  | Local Postgres container must be up                                                      |
| SSH key                 | `deploy/envs/gce_deploy_key` (already committed, `chmod 600`)                            |
| `.env.gce` in repo root | Contains `GCE_HOST`, `GCE_USER`, `GCE_KEY` — already configured                          |
| Local `.env`            | `apps/console/.env` or `.env` — script reads `DB_USER`, `DB_PASSWORD`, `DB_DB` from here |

> **Container name auto-detection** — the script checks for `itrade-db`, `proxy-manager-db-1`, `services-db-1` in that order. Override with `LOCAL_CONTAINER=<name>` if yours differs.

---

## Quick start

### Pull production → local (most common)

```bash
bash deploy/db-sync.sh pull
```

Downloads a `pg_dump` from GCE and restores it into your local container.  
**This overwrites your local database.**

If your local container has a non-default name:

```bash
LOCAL_CONTAINER=services-db-1 bash deploy/db-sync.sh pull
```

---

### Push local → production

```bash
bash deploy/db-sync.sh sync
```

Dumps your local DB, uploads it to GCE, and restores it there.  
**Prompts for confirmation before overwriting production.**

---

## All commands

```
bash deploy/db-sync.sh <command>
```

| Command         | Direction    | What it does                                   |
| --------------- | ------------ | ---------------------------------------------- |
| `pull`          | GCE → local  | Download + restore in one shot _(most common)_ |
| `download`      | GCE → local  | Only download the dump to `/tmp/`              |
| `restore-local` | file → local | Only restore a previously downloaded dump      |
| `sync`          | local → GCE  | Export + upload + import in one shot           |
| `export`        | local → file | Only dump local DB to `/tmp/`                  |
| `upload`        | file → GCE   | Only scp the dump to GCE                       |
| `import`        | file → GCE   | Only restore on GCE (prompts for confirmation) |
| `version`       | —            | Show PG version and health on both sides       |
| `help`          | —            | Print usage                                    |

---

## Step-by-step (manual flow)

**Pull in steps:**

```bash
bash deploy/db-sync.sh download      # dump GCE → /tmp/itrade_db_gce_<ts>.dump
bash deploy/db-sync.sh restore-local # restore that file → local container
```

**Push in steps:**

```bash
bash deploy/db-sync.sh export   # dump local → /tmp/itrade_db_<ts>.dump
bash deploy/db-sync.sh upload   # scp to GCE
bash deploy/db-sync.sh import   # restore on GCE (confirms before overwriting)
```

---

## Environment variables

All can be set inline or in `.env.gce` / `apps/console/.env`:

| Variable          | Default                        | Source                        |
| ----------------- | ------------------------------ | ----------------------------- |
| `GCE_HOST`        | `34.143.244.107`               | `.env.gce`                    |
| `GCE_USER`        | `xiaoweihsueh`                 | `.env.gce`                    |
| `GCE_KEY`         | `deploy/envs/gce_deploy_key`   | `.env.gce`                    |
| `LOCAL_CONTAINER` | auto-detected                  | `apps/console/.env` or inline |
| `LOCAL_DB_USER`   | read from `.env`               | `apps/console/.env`           |
| `LOCAL_DB_PASS`   | read from `.env`               | `apps/console/.env`           |
| `LOCAL_DB_NAME`   | read from `.env`               | `apps/console/.env`           |
| `DOWNLOAD_FILE`   | `/tmp/itrade_db_gce_<ts>.dump` | inline override               |
| `DUMP_FILE`       | `/tmp/itrade_db_<ts>.dump`     | inline override               |

---

## Full local dev setup

`scripts/setup-local-dev.sh` wraps this script as part of a full onboarding flow:

```bash
bash scripts/setup-local-dev.sh          # upgrade container image + pull + schema sync + seed
bash scripts/setup-local-dev.sh --skip-pull      # skip the GCE pull
bash scripts/setup-local-dev.sh --skip-recreate  # keep existing container, just pull + seed
bash scripts/setup-local-dev.sh --reset-volume   # nuke local data and start fresh
bash scripts/setup-local-dev.sh --diagnose        # inspect container state, no changes
```

---

## How the dump works

- Uses `pg_dump -F c` (custom compressed binary format) for reliable cross-version restores
- `pg_restore --clean --if-exists --no-owner --no-acl` — drops and recreates all objects cleanly, skips ownership (handles user differences between local and prod)
- Existing connections to the target database are terminated before restore so no lock conflicts occur
- Temporary dump files are cleaned up from both the Docker container and the remote host after each step

---

## Troubleshooting

**Container not found**

```
✖ Container 'itrade-db' is not running. Start it first.
```

Find your actual container name and pass it explicitly:

```bash
docker ps --format '{{.Names}}'
LOCAL_CONTAINER=services-db-1 bash deploy/db-sync.sh pull
```

**SSH permission denied**

```bash
chmod 600 deploy/envs/gce_deploy_key
```

**pg_restore errors on restore** — Minor errors about existing objects are normal when `--clean` runs on a non-empty DB. The restore continues and completes successfully. Check the final `✅` line to confirm success.

**Version mismatch warning** — `pg_dump`/`pg_restore` works across Postgres major versions. The warning is informational only.

**Verify the restore worked:**

```bash
docker exec services-db-1 psql -U postgres -d itrade -c "\dt"
```
