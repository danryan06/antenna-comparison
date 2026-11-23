#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const dataPath = path.join(root, 'antenna_data.json');
const FORMS = new Set(['Omni', 'Patch', 'High-density patch']);
const required = ['vendor', 'sku', 'form', 'bands', 'gain_dbi', 'beamwidth', 'connector'];
const { ENVIRONMENTS } = require(path.join(root, 'antenna-submit.js'));
// Install environment is only ever Indoor / Outdoor / Indoor/Outdoor (or unset when
// the datasheet does not say). Where an antenna is used goes in applications.
const APPLICATIONS = new Set(['Warehouse']);

const { frequencyToBand } = require(path.join(root, 'antenna-format.js'));
const warnings = [];

function fail(msg) {
  console.error(msg);
  process.exitCode = 1;
}

const raw = fs.readFileSync(dataPath, 'utf8');
let data;
try {
  data = JSON.parse(raw);
} catch (err) {
  fail(`antenna_data.json is not valid JSON: ${err.message}`);
  process.exit(1);
}

if (!Array.isArray(data)) {
  fail('antenna_data.json must be an array');
  process.exit(1);
}

const seen = new Map();
data.forEach((entry, index) => {
  const label = `entry[${index}] ${entry && entry.sku ? entry.sku : ''}`.trim();
  if (!entry || typeof entry !== 'object') {
    fail(`${label}: not an object`);
    return;
  }
  required.forEach(key => {
    if (entry[key] == null || entry[key] === '') fail(`${label}: missing ${key}`);
  });
  if (entry.form && !FORMS.has(entry.form)) {
    fail(`${label}: form must be one of ${Array.from(FORMS).join(' | ')}`);
  }
  if (entry.indoor_outdoor != null && ENVIRONMENTS.indexOf(entry.indoor_outdoor) === -1) {
    fail(`${label}: indoor_outdoor must be one of ${ENVIRONMENTS.join(' | ')} or null (got "${entry.indoor_outdoor}"); use applications for things like Warehouse`);
  }
  if (entry.applications != null) {
    if (!Array.isArray(entry.applications)) {
      fail(`${label}: applications must be an array`);
    } else {
      entry.applications.forEach(app => {
        if (!APPLICATIONS.has(app)) fail(`${label}: unknown application "${app}" (known: ${Array.from(APPLICATIONS).join(', ')})`);
      });
    }
  }
  const slug = `${String(entry.vendor || '').toLowerCase()}|${String(entry.sku || '').toLowerCase()}`;
  if (seen.has(slug)) fail(`${label}: duplicate vendor+sku (also entry[${seen.get(slug)}])`);
  else seen.set(slug, index);

  // Ensure internal compatibility notes never leak into public-looking fields
  ['compatible_aps', 'compatibleAPs', 'compatible_ap_list'].forEach(bad => {
    if (Object.prototype.hasOwnProperty.call(entry, bad)) {
      fail(`${label}: ${bad} must live under internal_notes only`);
    }
  });

  if (entry.antenna_id != null && typeof entry.antenna_id !== 'string') {
    fail(`${label}: antenna_id must be a string`);
  }
  if (entry.rf_interfaces != null && !Array.isArray(entry.rf_interfaces)) {
    fail(`${label}: rf_interfaces must be an array`);
  }
  if (entry.compatibility_claims != null && !Array.isArray(entry.compatibility_claims)) {
    fail(`${label}: compatibility_claims must be an array`);
  }

  const checkImage = (rel, where) => {
    if (!rel) return;
    if (/^https?:/i.test(rel)) return;
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) fail(`${label}: missing image for ${where}: ${rel}`);
  };
  checkImage(entry.image_url, 'image_url');
  (entry.images || []).forEach((img, i) => checkImage(img && img.url, `images[${i}]`));
  (entry.pattern_images || []).forEach((img, i) => checkImage(img && img.url, `pattern_images[${i}]`));
  checkImage(entry.dimension_image_url, 'dimension_image_url');

  // A pattern labeled for a band the antenna does not list is usually a plot
  // borrowed from a sibling product, or a bands list that is missing a band.
  // Warn rather than fail so a known gap does not block unrelated changes.
  const bands = new Set((entry.bands || []).map(String));
  (entry.pattern_images || []).forEach((img, i) => {
    const text = String((img && img.label) || '');
    const re = /(\d+(?:\.\d+)?(?:\s*\/\s*\d+(?:\.\d+)?)*)\s*GHz/gi;
    let match;
    while ((match = re.exec(text))) {
      // "5/6 GHz" on a 5/6 dBi antenna is a gain label, not a band list, so
      // only flag when no band in the label is one the antenna supports.
      const labelBands = (match[1].match(/\d+(?:\.\d+)?/g) || [])
        .map(n => frequencyToBand(Number(n)))
        .filter(Boolean);
      if (labelBands.length && !labelBands.some(b => bands.has(b))) {
        warnings.push(`${label}: pattern_images[${i}] "${text}" is for ${labelBands.join('/')} GHz but bands are [${Array.from(bands).join(', ')}]`);
      }
    }
  });
});

if (warnings.length) {
  console.warn(`WARN: ${warnings.length} pattern plot(s) for bands the antenna does not list:`);
  warnings.forEach(w => console.warn(`  ${w}`));
}

if (!process.exitCode) {
  console.log(`OK: ${data.length} antenna entr${data.length === 1 ? 'y' : 'ies'} validated`);
}

