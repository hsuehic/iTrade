#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}

const fromEnv = getArg('--from') || 'base';
const toEnv = getArg('--to');
const credPath =
  getArg('--cred') || process.env.GOOGLE_APPLICATION_CREDENTIALS;
const dryRun = process.argv.includes('--dry-run');

if (!toEnv) {
  console.error('Missing --to <env> (e.g. stage, production)');
  process.exit(1);
}

if (!credPath || !fs.existsSync(credPath)) {
  console.error(
    'Missing credentials. Provide --cred <path> or set GOOGLE_APPLICATION_CREDENTIALS.',
  );
  process.exit(1);
}

const admin = require('firebase-admin');
const serviceAccount = JSON.parse(fs.readFileSync(credPath, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const keys = [
  'theme_base_ref_v3',
  'copy_index_ref_v5',
  'copy_default_ref_v5',
  'copy_admin_emails',
];

function envKey(baseKey, env) {
  if (env === 'base') return baseKey;
  return `${baseKey}_${env}`;
}

async function main() {
  const rc = admin.remoteConfig();
  const template = await rc.getTemplate();
  template.parameters = template.parameters || {};

  let updated = 0;
  for (const baseKey of keys) {
    const srcKey = envKey(baseKey, fromEnv);
    const dstKey = envKey(baseKey, toEnv);
    const srcParam = template.parameters[srcKey];
    if (!srcParam || !srcParam.defaultValue?.value) {
      console.warn(`[sync] skip ${srcKey} (missing)`);
      continue;
    }
    const value = srcParam.defaultValue.value;
    template.parameters[dstKey] = {
      defaultValue: { value },
    };
    updated += 1;
    console.log(`[sync] ${srcKey} -> ${dstKey}`);
  }

  if (updated === 0) {
    console.warn('[sync] no parameters updated');
    return;
  }

  if (dryRun) {
    console.log('[sync] dry-run, not publishing');
    return;
  }

  template.version = template.version || {};
  template.version.description = `Sync dynamic config ${fromEnv} -> ${toEnv}`;
  await rc.publishTemplate(template);
  console.log(`[sync] published ${updated} parameters`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
