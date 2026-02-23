# Scripts: Sync Theme and Copy

## Prerequisites

- Node.js installed.
- Firebase Admin SDK service account JSON.
- Set credentials with `--cred <path>` or `GOOGLE_APPLICATION_CREDENTIALS`.

Example:

```
export GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
```

## Sync Remote Config (theme + copy pointers)

Script: `scripts/sync_dynamic_config.js`

Copies Remote Config parameters between environments:

Keys:

- `theme_base_ref_v3`
- `copy_index_ref_v5`
- `copy_default_ref_v5`
- `copy_admin_emails`

Usage:

```
node scripts/sync_dynamic_config.js --to stage
node scripts/sync_dynamic_config.js --from base --to production
node scripts/sync_dynamic_config.js --from stage --to production --dry-run
node scripts/sync_dynamic_config.js --to stage --cred /absolute/path/to/service-account.json
```

Notes:

- `--from` defaults to `base`.
- `--to` is required.
- `--dry-run` prints actions without publishing.

## Sync Copy Firestore Documents

Script: `scripts/sync_copy_firestore.js`

Compares local JSON under `assets/copy/` with Firestore docs referenced by
`assets/copy/index_v1.json`, then optionally syncs.

Usage:

```
# Compare only (no write)
node scripts/sync_copy_firestore.js

# Sync local -> remote
node scripts/sync_copy_firestore.js --apply --base local

# Sync remote -> local
node scripts/sync_copy_firestore.js --apply --base remote

# Use custom index file
node scripts/sync_copy_firestore.js --index /absolute/path/to/index.json

# Print per-key diffs
node scripts/sync_copy_firestore.js --verbose

# Dry run (no write even with --apply)
node scripts/sync_copy_firestore.js --apply --dry-run
```

Notes:

- `--base` defaults to `local`.
- `--index` defaults to `assets/copy/index_v1.json`.
