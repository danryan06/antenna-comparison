#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const submit = require('../../antenna-submit.js');
const apply = require('./apply-antenna-submission.js');
const { spawnSync } = require('child_process');

const dataPath = path.join(__dirname, '..', '..', 'antenna_data.json');
const catalog = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

function comparable(entry) {
  const copy = submit.stripPrivateFields(entry);
  submit.PUBLIC_KEYS.forEach(key => {
    if (copy[key] == null || copy[key] === '') delete copy[key];
    if (Array.isArray(copy[key]) && copy[key].length === 0) delete copy[key];
  });
  return copy;
}

function assertRoundTrip(entry) {
  const fields = submit.entryToFormFields(entry);
  const rebuilt = submit.buildAntennaEntry(fields, entry);
  if (entry.dimension_image_kind === 'mechanical') {
    assert.strictEqual(rebuilt.dimension_image_kind, 'mechanical', entry.sku + ' dropped mechanical dimension kind');
  }
  const vertical = entry.beamwidth && entry.beamwidth.vertical;
  if (vertical && typeof vertical === 'object' && !Object.keys(vertical).length) {
    assert.ok(rebuilt.beamwidth && rebuilt.beamwidth.vertical && !Object.keys(rebuilt.beamwidth.vertical).length, entry.sku + ' dropped empty vertical beamwidth');
  }
  ['images', 'pattern_images', 'sources', 'datasheet_urls'].forEach(key => {
    (entry[key] || []).forEach((item, index) => {
      if (!item || typeof item !== 'object') return;
      Object.keys(item).forEach(field => {
        assert.deepStrictEqual(rebuilt[key] && rebuilt[key][index] && rebuilt[key][index][field], item[field], entry.sku + ' dropped ' + key + '.' + field);
      });
    });
  });
  assert.deepStrictEqual(rebuilt, comparable(entry), entry.sku + ' did not round-trip');
  assert.ok(!Object.prototype.hasOwnProperty.call(rebuilt, 'internal_notes'), entry.sku + ' leaked internal_notes');
  assert.ok(!Object.prototype.hasOwnProperty.call(rebuilt, 'field_notes'), entry.sku + ' leaked field_notes');
  const json = submit.formatAntennaJson(rebuilt);
  assert.ok(!json.includes('compatible_aps'), entry.sku + ' leaked compatible_aps into JSON');
  assert.ok(!json.includes('internal_notes'), entry.sku + ' leaked internal_notes into JSON');
  assert.strictEqual(submit.validateSubmission(rebuilt).length, 0, entry.sku + ' failed validation: ' + submit.validateSubmission(rebuilt).join(' '));
}

catalog.forEach(assertRoundTrip);

const catalogText = fs.readFileSync(dataPath, 'utf8');
assert.strictEqual(apply.elementRanges(catalogText).length, catalog.length, 'catalog entry spans');

const seeded = catalog.find(entry => entry.sku === 'ATS-03414');
const seededJson = submit.formatAntennaJson(submit.buildAntennaEntry(submit.entryToFormFields(seeded), seeded));
assert.ok(seededJson.indexOf('"2.4"') < seededJson.indexOf('"5"'), 'gain bands should stay in 2.4 then 5 order');
assert.ok(!seeded.internal_notes || seededJson.indexOf('AP-654') === -1, 'compatible AP names must stay out of the public JSON');

const issue = submit.buildIssue({
  kind: 'edit',
  vendor: seeded.vendor,
  sku: seeded.sku,
  existingLabel: seeded.vendor + ' ' + seeded.sku,
  json: seededJson
});
assert.ok(issue.title.startsWith('Edit Antenna: '));
assert.ok(issue.body.includes('Requested edit for: ' + seeded.vendor + ' ' + seeded.sku));
assert.ok(issue.body.includes('```json'));
const url = submit.githubIssueUrl(issue.title, issue.body);
assert.ok(url.startsWith('https://github.com/danryan06/antenna-comparison/issues/new?'));
assert.ok(url.includes('title='));
assert.ok(url.includes('body='));

const fresh = submit.buildAntennaEntry({
  vendor: 'Example',
  sku: 'EX-1',
  legacy_sku: '',
  name: 'Example Omni',
  form: 'Omni',
  indoor_outdoor: 'Outdoor',
  bands: ['2.4', '5'],
  other_bands: '',
  frequency_range: '2.4-2.5/5.15-5.85 GHz',
  gain: { '2.4': '4', '5': '6', '6': '' },
  other_gain: '',
  beam: {
    '2.4': { h: '360°', v: '40°' },
    '5': { h: '360°', v: '20°' },
    '6': { h: '', v: '' }
  },
  other_beam: '',
  beam_scalar_h: '999°',
  beam_scalar_v: '999°',
  connector: 'N-Style',
  lead_count: '4',
  polarization: 'Vertical',
  cable_length: '',
  cable_type: '',
  dimensions: '6 in',
  weight: '',
  ip_rating: 'IP67',
  radome: '',
  mount_type: 'Pole',
  included_parts_text: 'Mount kit | | 1',
  wind_rating: '',
  vswr: '<2.0:1',
  isolation: '',
  operating_temp: '',
  image_url: 'javascript:alert(1)',
  images_text: 'Alt | javascript:alert(1)\nProduct | images/example/ex-1.jpg',
  pattern_images_text: '',
  dimension_image_url: '../secret.jpg',
  dimension_image_kind: 'mechanical',
  datasheet_text: 'Spec | https://example.com/spec.pdf',
  sources_text: 'Spec | EX-1 | https://example.com/spec.pdf'
}, {
  internal_notes: { compatible_aps: ['Secret AP'] },
  field_notes: { gain_dbi: 'hidden' },
  surprise: 'keep-me'
});
assert.strictEqual(fresh.image_url, undefined);
assert.deepStrictEqual(fresh.images, [{ label: 'Product', url: 'images/example/ex-1.jpg' }]);
assert.strictEqual(fresh.dimension_image_url, undefined);
assert.strictEqual(fresh.dimension_image_kind, 'mechanical');
assert.strictEqual(fresh.surprise, 'keep-me');
assert.ok(!fresh.internal_notes && !fresh.field_notes);
assert.deepStrictEqual(fresh.beamwidth.horizontal, { '2.4': '360°', '5': '360°' });
assert.strictEqual(submit.validateSubmission(fresh).length, 0);

function runApply(kind, body, fixture) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'antenna-submit-'));
  const dataFile = path.join(dir, 'antenna_data.json');
  const bodyFile = path.join(dir, 'issue.md');
  fs.writeFileSync(dataFile, fixture);
  fs.writeFileSync(bodyFile, body);
  const result = spawnSync(process.execPath, [
    path.join(__dirname, 'apply-antenna-submission.js'),
    '--data', dataFile,
    '--body-file', bodyFile,
    '--kind', kind
  ], { encoding: 'utf8' });
  return { result, dataFile, text: fs.readFileSync(dataFile, 'utf8') };
}

const fixtureEntry = {
  vendor: 'AccelTex / Hubbell',
  sku: 'ATS-03414',
  name: 'Old name',
  form: 'High-density patch',
  bands: ['2.4', '5', '6'],
  gain_dbi: { '2.4': 13, '5': 15, '6': 15 },
  beamwidth: { horizontal: { '2.4': '25°', '5': '20°', '6': '20°' }, vertical: { '2.4': '25°', '5': '20°', '6': '20°' } },
  connector: 'RPSMA',
  datasheet_urls: [{ label: 'Spec', url: 'https://example.com/old.pdf' }],
  field_notes: { gain_dbi: 'keep this note' },
  internal_notes: { compatible_aps: ['Aruba/HP AP-654'], maintainer: 'secret' }
};
const fixture = submit.formatAntennaJson([fixtureEntry], { escapeUnicode: true }) + '\n';
const edited = Object.assign({}, fixtureEntry, { name: 'New name', datasheet_urls: [{ label: 'Spec', url: 'https://example.com/new.pdf' }] });
delete edited.field_notes;
delete edited.internal_notes;
edited.internal_notes = { compatible_aps: ['should-not-stick'] };
const editBody = submit.buildIssue({
  kind: 'edit',
  vendor: edited.vendor,
  sku: edited.sku,
  existingLabel: edited.vendor + ' ' + edited.sku,
  json: submit.formatAntennaJson(edited)
}).body;
const editRun = runApply('edit', editBody, fixture);
assert.strictEqual(editRun.result.status, 0, editRun.result.stderr);
const editedCatalog = JSON.parse(editRun.text);
assert.strictEqual(editedCatalog[0].name, 'New name');
assert.strictEqual(editedCatalog[0].datasheet_urls[0].url, 'https://example.com/new.pdf');
assert.deepStrictEqual(editedCatalog[0].internal_notes.compatible_aps, ['Aruba/HP AP-654']);
assert.strictEqual(editedCatalog[0].field_notes.gain_dbi, 'keep this note');
assert.ok(editRun.text.includes('\\u00b0'), 'file JSON should keep escaped degree signs');
assert.ok(editRun.text.indexOf('"2.4"') < editRun.text.indexOf('"5"'));

const created = {
  vendor: 'Example',
  sku: 'EX-9',
  name: 'Added',
  form: 'Patch',
  indoor_outdoor: 'Indoor',
  bands: ['5'],
  gain_dbi: { '5': 8 },
  beamwidth: { horizontal: { '5': '30°' }, vertical: { '5': '30°' } },
  connector: 'RPSMA',
  datasheet_urls: [{ label: 'Spec', url: 'https://example.com/ex-9.pdf' }]
};
const newBody = submit.buildIssue({
  kind: 'new',
  vendor: created.vendor,
  sku: created.sku,
  json: submit.formatAntennaJson(created)
}).body;
const newRun = runApply('new', newBody, fixture);
assert.strictEqual(newRun.result.status, 0, newRun.result.stderr);
const added = JSON.parse(newRun.text);
assert.strictEqual(added.length, 2);
assert.strictEqual(added[1].sku, 'EX-9');
assert.ok(!added[1].internal_notes);
assert.strictEqual(added[0].internal_notes.maintainer, 'secret');
assert.ok(newRun.text.indexOf('"sku": "ATS-03414"') < newRun.text.indexOf('"sku": "EX-9"'));

const dup = runApply('new', newBody, newRun.text);
assert.notStrictEqual(dup.result.status, 0);
assert.ok(dup.result.stderr.includes('already exists'));

const missing = runApply('edit', 'no json here', fixture);
assert.notStrictEqual(missing.result.status, 0);


const buildPublic = require('./build-public-catalog.js');
const publicCatalog = buildPublic.buildPublicCatalog(catalog);
assert.strictEqual(publicCatalog.length, catalog.length, 'public catalog entry count');
publicCatalog.forEach((entry, index) => {
  const leaked = submit.findPrivateCatalogKeys(entry);
  assert.deepStrictEqual(leaked, [], 'public entry leaked private keys at ' + index);
  Object.keys(entry).forEach(key => {
    assert.ok(submit.PUBLIC_KEYS.indexOf(key) !== -1, 'non-allowlisted key ' + key + ' at ' + index);
  });
  assert.ok(!Object.prototype.hasOwnProperty.call(entry, 'field_notes'));
  assert.ok(!Object.prototype.hasOwnProperty.call(entry, 'internal_notes'));
});
const sample = catalog.find(entry => entry.field_notes || entry.internal_notes);
assert.ok(sample, 'expected authoring catalog to include maintainer notes');
const projected = submit.toPublicCatalogEntry(sample);
assert.ok(!projected.field_notes && !projected.internal_notes, 'toPublicCatalogEntry must drop maintainer notes');
assert.strictEqual(projected.sku, sample.sku);
console.log('OK: antenna submit helpers and issue apply');
