#!/usr/bin/env node
'use strict';

// The Finder's "Why this result?" panel shows plain language, not matcher codes.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', '..');
const C = require(path.join(root, 'compatibility-matcher.js'));
const catalog = require(path.join(root, 'antenna_catalog.json'));
const envelope = require(path.join(root, 'data', 'compatibility', 'ap-profiles.json'));

// 1. Every code the matcher source can emit has an explanation.
const source = fs.readFileSync(path.join(root, 'compatibility-matcher.js'), 'utf8');
const sourceCodes = new Set();
source.replace(/reason\(\s*'([A-Z_]+)'/g, (_, code) => { sourceCodes.add(code); return _; });
assert.ok(sourceCodes.size > 20, 'expected to find the matcher reason codes');
const missing = [...sourceCodes].filter(code => !C.EXPLAINED_CODES.includes(code));
assert.deepStrictEqual(missing, [], `reason codes without a plain-language explanation: ${missing.join(', ')}`);

// 2. Across every AP and antenna, explanations are plain language.
let checked = 0;
envelope.profiles.forEach(profile => {
  C.matchAllForAp(catalog, profile, { showExcluded: true }).forEach(result => {
    const groups = C.explainResult(result);
    ['match', 'check', 'mismatch'].forEach(tone => {
      groups[tone].forEach(item => {
        checked += 1;
        assert.ok(item.text && item.text.length > 5, `${item.code}: empty explanation`);
        assert.ok(!/[A-Z]{3,}_[A-Z_]+/.test(item.text), `${item.code}: explanation shows a code: ${item.text}`);
        assert.ok(!/antenna_configurations|path_groups|rf_path_count|external_interfaces/.test(item.text),
          `${item.code}: explanation shows a data field path: ${item.text}`);
        assert.strictEqual(item.tone, tone);
      });
    });
    if (result.status === 'incompatible') {
      assert.ok(groups.mismatch.length > 0, `${profile.ap_id}: excluded result has no "doesn't fit" reason`);
    }
  });
});

// 3. Spot checks.
const e = C.explainReason({ code: 'PATHS_EXACT', message: 'RF path count matches (8).' });
assert.strictEqual(e.tone, 'match');
assert.ok(/8 RF paths/.test(e.text));
assert.ok(/RP-SMA/.test(C.explainReason({
  code: 'CONNECTOR_FAMILY_MISMATCH',
  message: 'Antenna connector "rp-sma" does not match AP family "dart".'
}).text));
assert.ok(/8-port DART/.test(C.explainReason({
  code: 'CONNECTOR_VARIANT_MISMATCH',
  message: 'AP variant "dart-8" does not match antenna variant "dart-4".'
}).text));
// AP_PROFILE_INCOMPLETE is dropped when it only restates PATH_GROUPS_UNKNOWN.
const dup = C.explainResult({ reasons: [
  { code: 'AP_PROFILE_INCOMPLETE', message: 'Pinned AP profile lists missing hard facts: antenna_configurations.default.external_interfaces.dart-8.path_groups.' },
  { code: 'PATH_GROUPS_UNKNOWN', message: 'AP path-to-band mapping is incomplete; cannot confirm per-path coverage.' }
] });
assert.deepStrictEqual(dup.check.map(i => i.code), ['PATH_GROUPS_UNKNOWN']);

console.log(`OK: compatibility explanations (${C.EXPLAINED_CODES.length} codes, ${checked} explanations checked across ${envelope.profiles.length} APs)`);
