#!/usr/bin/env node
'use strict';

// Links between AntennaComparison and AP Comparison must agree with the AP site's slugs.
const assert = require('assert');
const path = require('path');
const { apComparisonSlug, apComparisonDetailUrl } = require('../../antenna-format.js');

// Real slugs from apcomparison.com ap_data.json (slugify(`${vendor} ${model}`)).
assert.strictEqual(apComparisonSlug('Cisco', '9115AXE'), 'cisco-9115axe');
assert.strictEqual(apComparisonSlug('Cisco Meraki', 'CW9163E'), 'cisco-meraki-cw9163e');
assert.strictEqual(apComparisonSlug('Aruba', 'AP-574'), 'aruba-ap-574');
assert.strictEqual(apComparisonSlug('Allied Telesis', 'TQ6702e GEN2'), 'allied-telesis-tq6702e-gen2');
assert.strictEqual(apComparisonSlug('Alcatel-Lucent', 'AP1572'), 'alcatel-lucent-ap1572');
assert.strictEqual(
  apComparisonDetailUrl({ vendor: 'Juniper', model: 'AP45E' }),
  'https://apcomparison.com/ap.html?id=juniper-ap45e'
);

// Every pinned AP profile produces a usable slug.
const envelope = require(path.join(__dirname, '..', '..', 'data', 'compatibility', 'ap-profiles.json'));
const slugs = new Set();
envelope.profiles.forEach(p => {
  const slug = apComparisonSlug(p.vendor, p.model);
  assert.ok(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug), `bad slug for ${p.ap_id}: ${slug}`);
  assert.ok(!slugs.has(slug), `duplicate slug ${slug}`);
  slugs.add(slug);
});

console.log(`OK: AP Comparison links (${slugs.size} pinned APs map to detail slugs)`);
