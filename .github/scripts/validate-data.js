#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const dataPath = path.join(root, 'antenna_data.json');
const FORMS = new Set(['Omni', 'Patch', 'High-density patch']);
const required = ['vendor', 'sku', 'form', 'bands', 'gain_dbi', 'beamwidth', 'connector'];

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
  const slug = `${String(entry.vendor || '').toLowerCase()}|${String(entry.sku || '').toLowerCase()}`;
  if (seen.has(slug)) fail(`${label}: duplicate vendor+sku (also entry[${seen.get(slug)}])`);
  else seen.set(slug, index);

  // Ensure internal compatibility notes never leak into public-looking fields
  ['compatible_aps', 'compatibleAPs', 'compatible_ap_list'].forEach(bad => {
    if (Object.prototype.hasOwnProperty.call(entry, bad)) {
      fail(`${label}: ${bad} must live under internal_notes only`);
    }
  });

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
});

if (!process.exitCode) {
  console.log(`OK: ${data.length} antenna entr${data.length === 1 ? 'y' : 'ies'} validated`);
}

