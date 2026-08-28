#!/usr/bin/env node
// verify-web-i18n.js — verify en.json / zh.json key parity for the iTrade web app.
//
// Usage (run from the iTrade repo root):
//   node scripts/verify-web-i18n.js                 # full parity check
//   node scripts/verify-web-i18n.js clone           # scoped: keys matching /clone/i
//   node scripts/verify-web-i18n.js 'strategy\.'    # scoped: keys matching /strategy\./i
//
// Exits 1 if any keys are missing in either direction (CI-friendly).
// Prints: matching keys + values for each locale, then missing-key lists.
//
// Skill: itrade-web-dev (web i18n conventions — "EVERY new key goes in BOTH files").
// The Flutter side has a documented copy-key verification workflow; this is the
// web equivalent. Run it whenever you add or review new i18n keys.

const fs = require('fs');
const path = require('path');

const DIR = path.resolve('apps/web/messages');
const EN = JSON.parse(fs.readFileSync(path.join(DIR, 'en.json'), 'utf8'));
const ZH = JSON.parse(fs.readFileSync(path.join(DIR, 'zh.json'), 'utf8'));

// Flatten nested JSON into dot-paths → leaf values.
function flatten(obj, prefix) {
  prefix = prefix || '';
  const out = {};
  for (const k in obj) {
    const np = prefix ? prefix + '.' + k : k;
    if (typeof obj[k] === 'object' && obj[k] !== null && !Array.isArray(obj[k])) {
      Object.assign(out, flatten(obj[k], np));
    } else {
      out[np] = obj[k];
    }
  }
  return out;
}

const fe = flatten(EN);
const fz = flatten(ZH);
const eKeys = Object.keys(fe);
const zKeys = Object.keys(fz);

const filter = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;

let enMissing = eKeys.filter((k) => !(k in fz));
let zhMissing = zKeys.filter((k) => !(k in fe));

if (filter) {
  console.log(`Scoped check: keys matching /${filter.source}/${filter.flags}\n`);
  const scopeE = eKeys.filter((k) => filter.test(k));
  const scopeZ = zKeys.filter((k) => filter.test(k));
  console.log('EN keys:');
  scopeE.forEach((k) => console.log('  ' + k + ' = ' + JSON.stringify(fe[k])));
  console.log('ZH keys:');
  scopeZ.forEach((k) => console.log('  ' + k + ' = ' + JSON.stringify(fz[k])));
  enMissing = enMissing.filter((k) => filter.test(k));
  zhMissing = zhMissing.filter((k) => filter.test(k));
} else {
  console.log(`Full parity check: ${eKeys.length} EN keys, ${zKeys.length} ZH keys\n`);
}

console.log('\nKeys in EN missing from ZH:', enMissing.length);
enMissing.forEach((k) => console.log('  ' + k + ' = ' + JSON.stringify(fe[k])));
console.log('\nKeys in ZH missing from EN:', zhMissing.length);
zhMissing.forEach((k) => console.log('  ' + k + ' = ' + JSON.stringify(fz[k])));

if (enMissing.length > 0 || zhMissing.length > 0) {
  console.log('\n❌ FAIL — i18n keys are out of sync.');
  process.exit(1);
} else {
  console.log('\n✅ PASS — all keys present in both locales.');
}
