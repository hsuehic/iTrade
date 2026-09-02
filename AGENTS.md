# iTrade Project Conventions

This file is read by AI agents and collaborators working in this repo. The
`CLAUDE.md` file in this directory holds the detailed engineering guidelines
(static checks, runtime verification, hygiene) and is authoritative for those.
This file captures cross-cutting **team conventions** that must be respected by
ALL agents (Claude, Codex, Gemini, etc.) and humans.

## Mobile i18n → Firestore sync (MANDATORY)

The Flutter mobile app (`apps/mobile`) loads user-facing copy from **Firestore
at runtime** (`configs_copy/{en_v1,zh_hans_v1}`), which OVERWRITES the bundled
JSON in `apps/mobile/assets/copy/`. Files that exist locally but were never
pushed to Firestore silently degrade: `CopyText` components with `fallback: ''`
render **BLANK** (real bug seen 2026-09-02: onboarding wizard "Required API
permissions" badges showing no items), and others fall back to English.

**Therefore: ANY change to `apps/mobile/assets/copy/*_v1.json` (adding UI copy
or editing values) REQUIRES a Firestore re-sync before the change is done.**

Workflow — always pull-then-push to avoid clobbering remote-only edits:

```bash
cd apps/mobile/scripts
export SA=../../../deploy/envs/firebase-service-account.json

# 1) Pull current remote -> local (merge any remote-only edits first)
node sync_copy_firestore.js --cred "$SA" --base remote --apply

# 2) Dry-run diff local vs remote: MUST be missing=0 extra=0 changed=0
#    for BOTH locales (en + zh-Hans) before pushing.
node sync_copy_firestore.js --cred "$SA" --base local --dry-run

# 3) Push local -> remote (both locales synced in one run)
node sync_copy_firestore.js --cred "$SA" --base local --apply

# 4) Re-verify idempotent: again missing=0 extra=0 changed=0
node sync_copy_firestore.js --cred "$SA" --base local --dry-run
```

Rules:

- Never push only one locale — both `en` and `zh-Hans` are synced together.
- If step 2 shows `changed!=0`, run `--verbose` and inspect which remote value
  differs before overwriting (someone may have hot-edited copy in the
  Firestore console).
- New UI copy must always be added to **both** `en_v1.json` and
  `zh_hans_v1.json`, using `screen.<screen>.<key>` naming (see
  `references/mobile-copy-i18n.md` in the `itrade-web-dev` skill for the full
  i18n architecture and copy-key verification workflow).
