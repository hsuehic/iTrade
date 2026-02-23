#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function getArg(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0 || idx + 1 >= process.argv.length) return null;
  return process.argv[idx + 1];
}

const credPath = getArg('--cred') || process.env.GOOGLE_APPLICATION_CREDENTIALS;
const indexPath =
  getArg('--index') || path.join(__dirname, '..', 'assets', 'copy', 'index_v1.json');
const apply = process.argv.includes('--apply');
const dryRun = process.argv.includes('--dry-run');
const base = (getArg('--base') || 'local').toLowerCase();
const verbose = process.argv.includes('--verbose');

if (!credPath || !fs.existsSync(credPath)) {
  console.error(
    'Missing credentials. Provide --cred <path> or set GOOGLE_APPLICATION_CREDENTIALS.',
  );
  process.exit(1);
}

if (!fs.existsSync(indexPath)) {
  console.error(`Missing index file at ${indexPath}`);
  process.exit(1);
}

if (!['local', 'remote'].includes(base)) {
  console.error('Invalid --base. Use "local" or "remote".');
  process.exit(1);
}

const admin = require('firebase-admin');
const serviceAccount = JSON.parse(fs.readFileSync(credPath, 'utf8'));
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

function parseFirestorePath(raw) {
  if (!raw) return null;
  if (raw.startsWith('firestore:/')) return raw.replace('firestore:/', '');
  if (raw.startsWith('/')) return raw.substring(1);
  return raw;
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function diffStrings(localStrings, remoteStrings) {
  const localKeys = Object.keys(localStrings || {});
  const remoteKeys = Object.keys(remoteStrings || {});
  const localSet = new Set(localKeys);
  const remoteSet = new Set(remoteKeys);

  const missing = localKeys.filter((k) => !remoteSet.has(k));
  const extra = remoteKeys.filter((k) => !localSet.has(k));
  const changed = localKeys.filter(
    (k) => remoteSet.has(k) && localStrings[k] !== remoteStrings[k],
  );
  return { missing, extra, changed };
}

function writeLocalDoc(filePath, doc) {
  const json = JSON.stringify(doc, null, 2) + '\n';
  fs.writeFileSync(filePath, json, 'utf8');
}

async function main() {
  const index = readJson(indexPath);
  const locales = index.locales || {};
  const db = admin.firestore();

  let totalMissing = 0;
  let totalExtra = 0;
  let totalChanged = 0;
  let updated = 0;

  for (const [localeTag, ref] of Object.entries(locales)) {
    const firestorePath = parseFirestorePath(ref);
    if (!firestorePath) {
      console.warn(`[copy] skip ${localeTag} (invalid ref)`);
      continue;
    }
    const docId = firestorePath.split('/').pop();
    const localPath = path.join(__dirname, '..', 'assets', 'copy', `${docId}.json`);
    if (!fs.existsSync(localPath)) {
      console.warn(`[copy] local file missing: ${localPath}`);
      continue;
    }

    const localDoc = readJson(localPath);
    const remoteSnap = await db.doc(firestorePath).get();
    const remoteDoc = remoteSnap.exists ? remoteSnap.data() : null;
    if (!remoteDoc && base === 'remote') {
      console.warn(`[copy] remote missing: ${firestorePath}`);
      continue;
    }

    const localStrings = localDoc.strings || {};
    const remoteStrings = remoteDoc?.strings || {};
    const { missing, extra, changed } = diffStrings(localStrings, remoteStrings);

    totalMissing += missing.length;
    totalExtra += extra.length;
    totalChanged += changed.length;

    console.log(
      `[copy] ${localeTag} -> ${firestorePath}: missing=${missing.length} extra=${extra.length} changed=${changed.length}`,
    );

    if (verbose) {
      if (missing.length) console.log(`  missing: ${missing.join(', ')}`);
      if (extra.length) console.log(`  extra: ${extra.join(', ')}`);
      if (changed.length) console.log(`  changed: ${changed.join(', ')}`);
    }

    if (apply && !dryRun) {
      if (base === 'local') {
        await db.doc(firestorePath).set(localDoc);
        updated += 1;
        console.log(`  synced -> remote: ${firestorePath}`);
      } else {
        writeLocalDoc(localPath, remoteDoc);
        updated += 1;
        console.log(`  synced -> local: ${localPath}`);
      }
    } else if (apply && dryRun) {
      console.log(`  dry-run: skipped write (${base})`);
    }
  }

  console.log(
    `[copy] summary: missing=${totalMissing} extra=${totalExtra} changed=${totalChanged} synced=${updated}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
