#!/usr/bin/env node
'use strict';

/**
 * Add antenna_id + conservative rf_interfaces to antenna_data.json.
 * Does not invent compatibility_claims from internal_notes.compatible_aps.
 */
const fs = require('fs');
const path = require('path');
const submit = require('../../antenna-submit.js');
const normalize = require('../../connector-normalize.js');

const root = path.join(__dirname, '..', '..');
const dataPath = path.join(root, 'antenna_data.json');

const raw = fs.readFileSync(dataPath, 'utf8');
const data = JSON.parse(raw);
if (!Array.isArray(data)) {
  console.error('antenna_data.json must be an array');
  process.exit(1);
}

let withIface = 0;
let without = 0;
const ids = new Set();
const next = data.map((entry, index) => {
  const migrated = normalize.ensureStructuredFields(entry);
  if (!migrated.antenna_id) {
    console.error('entry[' + index + ']: failed to assign antenna_id');
    process.exit(1);
  }
  if (ids.has(migrated.antenna_id)) {
    console.error('Duplicate antenna_id: ' + migrated.antenna_id);
    process.exit(1);
  }
  ids.add(migrated.antenna_id);
  if (migrated.rf_interfaces && migrated.rf_interfaces.length) withIface += 1;
  else without += 1;
  return migrated;
});

const text = submit.formatAntennaJson(next, { escapeUnicode: true }) + '\n';
fs.writeFileSync(dataPath, text);
console.log('Migrated ' + next.length + ' antennas');
console.log('  with rf_interfaces: ' + withIface);
console.log('  without (review):  ' + without);
