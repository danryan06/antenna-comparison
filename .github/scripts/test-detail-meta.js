#!/usr/bin/env node
'use strict';

// Per-antenna <title>/description/canonical (set by js/antenna.js) and the
// sitemap must agree, so every detail URL indexes as its own page.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const fmt = require('../../antenna-format.js');

const root = path.join(__dirname, '..', '..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'antenna_catalog.json'), 'utf8'));
const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');

const canonicals = new Set();
catalog.forEach(entry => {
  const meta = fmt.antennaDetailMeta(entry);
  const label = entry.vendor + ' ' + entry.sku;
  assert.ok(meta.title.endsWith(' — AntennaComparison'), label + ' title');
  assert.ok(meta.description.length >= 40 && meta.description.length <= 320, label + ' description length ' + meta.description.length);
  assert.ok(!/undefined|null|NaN/.test(meta.description), label + ' description has a placeholder: ' + meta.description);
  assert.strictEqual(meta.canonical, 'https://antennacomparison.com/antenna.html?id=' + fmt.slugifyAntenna(entry));
  assert.ok(sitemap.includes('<loc>' + meta.canonical + '</loc>'), label + ' missing from sitemap.xml');
  assert.ok(!canonicals.has(meta.canonical), label + ' duplicate canonical');
  canonicals.add(meta.canonical);
});

// Old (legacy SKU) links resolve to the primary entry, whose canonical is the primary slug.
const legacy = catalog.find(entry => entry.legacy_sku && fmt.slugifyAntenna({ vendor: entry.vendor, sku: entry.legacy_sku }) !== fmt.slugifyAntenna(entry));
if (legacy) {
  const found = fmt.findAntennaById(catalog, fmt.slugifyAntenna({ vendor: legacy.vendor, sku: legacy.legacy_sku }));
  assert.strictEqual(fmt.antennaDetailMeta(found.entry).canonical, fmt.antennaDetailUrl(legacy));
}

const sample = fmt.antennaDetailMeta({ vendor: 'Example', sku: 'EX-1', form: 'Patch', bands: ['5', '6'], gain_dbi: { 5: 8, 6: 9 }, connector: 'RP-SMA', lead_count: 2, indoor_outdoor: 'Indoor' });
assert.strictEqual(sample.description, 'Example EX-1: Patch Wi-Fi antenna, 5 / 6 GHz, up to 9 dBi, RP-SMA connector, 2 leads, indoor. Specs, radiation patterns, dimensions, and vendor datasheets.');

console.log('OK: detail page metadata (' + catalog.length + ' canonical URLs, all in sitemap.xml)');
