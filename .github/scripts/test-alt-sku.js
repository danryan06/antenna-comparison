#!/usr/bin/env node
'use strict';

// Vendor alternate numbers (legacy_sku) and old detail links.
const assert = require('assert');
const path = require('path');
const { altSkuLabel, findAntennaById, slugifyAntenna } = require('../../antenna-format.js');

assert.strictEqual(altSkuLabel({ vendor: 'AccelTex / Hubbell' }), 'Former AccelTex part number');
assert.strictEqual(altSkuLabel({ vendor: 'Ventev' }), 'Ventev SKU');
assert.strictEqual(altSkuLabel({ vendor: 'Cisco' }), 'Alternate part number');

const catalog = require(path.join(__dirname, '..', '..', 'antenna_catalog.json'));

// Ventev: primary sku is the manufacturer part number; the Ventev SKU is the alias.
const ventev = catalog.filter(e => e.vendor === 'Ventev');
const switched = ventev.filter(e => e.legacy_sku);
assert.ok(switched.length >= 100, `expected most Ventev entries to use MFG part numbers (got ${switched.length})`);
switched.forEach(e => {
  assert.ok(!/^\d+$/.test(e.sku), `${e.sku}: Ventev primary sku should be the MFG part number, not a numeric SKU`);
  // Old link built from the Ventev SKU still resolves to this entry, flagged non-canonical.
  const oldId = slugifyAntenna({ vendor: e.vendor, sku: e.legacy_sku });
  const found = findAntennaById(catalog, oldId);
  assert.ok(found && found.entry === e, `${oldId} should resolve to ${e.sku}`);
  assert.strictEqual(found.canonical, false);
});

// Spot check from the Ventev product page: SKU 611751 is M7060060D3D43607E.
const e611751 = catalog.find(e => e.legacy_sku === '611751');
assert.strictEqual(e611751.sku, 'M7060060D3D43607E');
assert.strictEqual(findAntennaById(catalog, 'ventev-611751').entry, e611751);
assert.strictEqual(findAntennaById(catalog, 'ventev-m7060060d3d43607e').canonical, true);

// Every detail id (canonical and legacy) maps to exactly one antenna.
const ids = new Map();
catalog.forEach(e => {
  [slugifyAntenna(e), e.legacy_sku ? slugifyAntenna({ vendor: e.vendor, sku: e.legacy_sku }) : null]
    .filter(Boolean)
    .forEach(id => {
      assert.ok(!ids.has(id) || ids.get(id) === e, `detail id ${id} is ambiguous`);
      ids.set(id, e);
    });
});

assert.strictEqual(findAntennaById(catalog, 'nope-nothing'), null);
console.log(`OK: alternate part numbers (${switched.length} Ventev entries on MFG part numbers; old SKU links resolve)`);
