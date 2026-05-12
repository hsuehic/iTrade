---
name: sync-env-gce
description: >
  Syncs local env files from deploy/envs/ to the GCE production server at /opt/itrade/.
  Use this skill whenever the user wants to push, sync, or deploy env files (like .env.web,
  .env.db, .env.console) to GCE — including after editing API keys, secrets, database
  credentials, or any other environment variables. Trigger on phrases like "sync env to GCE",
  "push env", "update env on GCE", "deploy env", "update keys on GCE", or any mention of
  pushing local env changes to the remote server.
---

# Sync Env Files to GCE

This skill pushes all `.env.*` files from `deploy/envs/` to `/opt/itrade/` on the GCE
production server, using the `deploy/sync-env.sh` script. It does **not** restart any
services — env changes take effect on the next service restart.

## How it works

The script reads connection details from `.env.gce` in the project root:

- **gcloud mode** (preferred): uses `GCE_INSTANCE` + `GCE_ZONE` + `GCE_USER`
- **scp mode** (fallback): uses `GCE_HOST` + `GCE_USER` + `GCE_KEY`

Because the Claude sandbox cannot reach GCE directly over SSH, always run the script via
`osascript` on the user's Mac.

## Steps

1. **Run the sync script via osascript:**

```applescript
do shell script "cd /Users/xiaowei.xue/Documents/Xiaowei/project/iTrade && bash deploy/sync-env.sh 2>&1"
```

Use `mcp__Control_your_Mac__osascript` with the script above.

2. **Report the result** — show the script output to the user so they can confirm which
   files were synced and to which host.

3. **Remind about restarts (if relevant)** — if the user edited env vars that affect a
   running service (e.g. API keys consumed at startup), note that a service restart is
   needed for the changes to take effect. Don't restart automatically unless the user asks.

## Common scenarios

| User says                       | What to do                                   |
| ------------------------------- | -------------------------------------------- |
| "sync env to GCE"               | Run the script, report output                |
| "push the new API keys"         | Run the script, note restart may be needed   |
| "update .env.web on the server" | Run the script (it syncs all env files)      |
| "deploy env without restart"    | Run the script, confirm no restart performed |

## Troubleshooting

- **`gcloud not found`**: The script falls back to scp if `GCE_INSTANCE` is set but gcloud
  is missing. This is expected on dev machines without the Cloud SDK.
- **Permission denied on key**: The deploy key at `deploy/envs/gce_deploy_key` needs mode
  `600`. The script sets this automatically, but if it fails, run:
  `chmod 600 /Users/xiaowei.xue/Documents/Xiaowei/project/iTrade/deploy/envs/gce_deploy_key`
- **`.env.gce` not found**: The file must exist at the project root. Check
  `deploy/env.gce.template` for the required format.
