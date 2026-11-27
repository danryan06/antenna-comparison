#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const submit = require('../../antenna-submit.js');
const connectors = require('../../connector-normalize.js');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function arg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || !process.argv[index + 1]) return '';
  return process.argv[index + 1];
}

function normalize(value) {
  return String(value || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function extractJson(body) {
  const fenced = body.match(/```json\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : (body.match(/\{\s*[\s\S]*\}/) || [])[0];
  if (!raw) fail('No JSON snippet found in the issue body.');
  try {
    return JSON.parse(raw.trim());
  } catch (err) {
    fail('Invalid JSON in issue: ' + err.message);
  }
}

function elementRanges(text) {
  const ranges = [];
  let depth = 0;
  let inString = false;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') {
        i += 1;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{' || ch === '[') {
      if (ch === '{' && depth === 1) start = i;
      depth += 1;
      continue;
    }
    if (ch === '}' || ch === ']') {
      depth -= 1;
      if (ch === '}' && depth === 1 && start >= 0) {
        ranges.push([start, i + 1]);
        start = -1;
      }
    }
  }
  return ranges;
}

function indentBlock(json, spaces) {
  const pad = ' '.repeat(spaces);
  return json.split('\n').map(line => (line.length ? pad + line : line)).join('\n');
}

function requestedLabel(body) {
  const match = body.match(/^Requested edit for:\s*(.+)$/m);
  return match ? match[1].trim() : '';
}

function findEditIndex(entries, body, submitted) {
  const label = normalize(requestedLabel(body));
  if (label) {
    const exact = entries.findIndex(entry => normalize((entry.vendor || '') + ' ' + (entry.sku || '')) === label);
    if (exact >= 0) return exact;
    const sku = label.split(' ').pop();
    const hits = [];
    entries.forEach((entry, index) => {
      if (normalize(entry.sku) === sku) hits.push(index);
    });
    if (hits.length === 1) return hits[0];
  }
  const hits = [];
  entries.forEach((entry, index) => {
    if (normalize(entry.vendor) === normalize(submitted.vendor) && normalize(entry.sku) === normalize(submitted.sku)) {
      hits.push(index);
    }
  });
  return hits.length === 1 ? hits[0] : -1;
}

function publicSubmitted(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Submission JSON must be an object.');
  return submit.stripPrivateFields(value);
}

function mergeEdit(existing, submitted) {
  const clean = publicSubmitted(submitted);
  const merged = {};
  Object.keys(existing).forEach(key => {
    // Maintainer notes and curated structured fields (antenna_id is immutable,
    // rf_interfaces / compatibility_claims / applications are not form-editable)
    // always come from the existing entry, whatever the issue JSON says.
    if (key === 'internal_notes' || key === 'field_notes' || submit.PRESERVE_FROM_BASE.indexOf(key) !== -1) {
      merged[key] = existing[key];
      return;
    }
    if (submit.PRIVATE_KEYS.indexOf(key) !== -1) return;
    if (submit.PUBLIC_KEYS.indexOf(key) !== -1) {
      if (Object.prototype.hasOwnProperty.call(clean, key)) merged[key] = clean[key];
      return;
    }
    merged[key] = existing[key];
  });
  submit.PUBLIC_KEYS.forEach(key => {
    if (submit.PRESERVE_FROM_BASE.indexOf(key) !== -1) return;
    if (!Object.prototype.hasOwnProperty.call(merged, key) && Object.prototype.hasOwnProperty.call(clean, key)) {
      merged[key] = clean[key];
    }
  });
  return merged;
}

function writeOutput(vendor, sku) {
  const block = [
    'vendor<<ANTENNA_EOF',
    String(vendor || '').replace(/\r?\n/g, ' '),
    'ANTENNA_EOF',
    'sku<<ANTENNA_EOF',
    String(sku || '').replace(/\r?\n/g, ' '),
    'ANTENNA_EOF',
    ''
  ].join('\n');
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, block);
  console.log('Updated ' + vendor + ' ' + sku);
}

function main() {
  const dataPath = arg('--data');
  const bodyPath = arg('--body-file');
  const kind = arg('--kind');
  if (!dataPath || !bodyPath || (kind !== 'new' && kind !== 'edit')) {
    fail('Usage: apply-antenna-submission.js --data antenna_data.json --body-file issue.md --kind new|edit');
  }
  const body = fs.readFileSync(bodyPath, 'utf8');
  const raw = fs.readFileSync(dataPath, 'utf8');
  let entries;
  try {
    entries = JSON.parse(raw);
  } catch (err) {
    fail('antenna_data.json is not valid JSON: ' + err.message);
  }
  if (!Array.isArray(entries)) fail('antenna_data.json must be an array.');
  const ranges = elementRanges(raw);
  if (ranges.length !== entries.length) {
    fail('Could not locate every catalog entry in antenna_data.json (' + ranges.length + ' spans, ' + entries.length + ' entries).');
  }

  const submitted = publicSubmitted(extractJson(body));
  const errors = submit.validateSubmission(submitted);
  if (errors.length) fail(errors.join(' '));

  let nextText;
  if (kind === 'new') {
    const duplicate = entries.findIndex(entry => {
      return submit.submissionSlug(entry.vendor, entry.sku) === submit.submissionSlug(submitted.vendor, submitted.sku);
    });
    if (duplicate >= 0) fail('An antenna with this vendor and SKU already exists. Use the edit form.');
    // New entries get a derived antenna_id (never a caller-chosen one) and a
    // conservative inferred rf_interfaces list, matching migrate-rf-interfaces.js.
    const fresh = Object.assign({}, submitted);
    delete fresh.antenna_id;
    delete fresh.rf_interfaces;
    delete fresh.compatibility_claims;
    const entry = connectors.ensureStructuredFields(fresh);
    if (!/^[a-z0-9-]+:[a-z0-9.-]+$/.test(entry.antenna_id)) {
      fail('Could not derive a valid antenna_id from vendor and SKU: ' + entry.antenna_id);
    }
    if (entries.some(existing => existing.antenna_id === entry.antenna_id)) {
      fail('antenna_id ' + entry.antenna_id + ' is already taken. Use the edit form, or ask a maintainer.');
    }
    const block = indentBlock(submit.formatAntennaJson(entry, { escapeUnicode: true }), 2);
    if (!ranges.length) {
      nextText = '[\n' + block + '\n]\n';
    } else {
      const end = ranges[ranges.length - 1][1];
      nextText = raw.slice(0, end) + ',\n' + block + raw.slice(end);
      if (!nextText.endsWith('\n')) nextText += '\n';
    }
  } else {
    const index = findEditIndex(entries, body, submitted);
    if (index < 0) {
      fail('Could not find an existing antenna to edit for "' + (submitted.vendor || '') + ' ' + (submitted.sku || '') + '".');
    }
    const merged = mergeEdit(entries[index], submitted);
    const block = indentBlock(submit.formatAntennaJson(merged, { escapeUnicode: true }), 2);
    const range = ranges[index];
    nextText = raw.slice(0, range[0]) + block + raw.slice(range[1]);
  }

  JSON.parse(nextText);
  fs.writeFileSync(dataPath, nextText);
  writeOutput(submitted.vendor, submitted.sku);
}

if (require.main === module) main();

module.exports = { elementRanges: elementRanges };
