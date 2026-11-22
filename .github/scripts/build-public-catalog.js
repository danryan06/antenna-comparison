#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const submit = require('../../antenna-submit.js');

const root = path.join(__dirname, '..', '..');
const authoringPath = path.join(root, 'antenna_data.json');
const catalogPath = path.join(root, 'antenna_catalog.json');
const metaPath = path.join(root, 'antenna_catalog.meta.json');

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    fail(filePath + ' is not valid JSON: ' + err.message);
  }
}

function gitSourceRevision() {
  try {
    return String(execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8'
    })).trim();
  } catch (err) {
    return 'unknown';
  }
}

function buildPublicCatalog(entries) {
  if (!Array.isArray(entries)) fail('Authoring catalog must be an array.');
  return entries.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      fail('Authoring entry[' + index + '] is not an object.');
    }
    const privateKeys = submit.findPrivateCatalogKeys(entry);
    // Authoring may contain private keys; the public projection must not.
    const publicEntry = submit.toPublicCatalogEntry(entry);
    const leaked = submit.findPrivateCatalogKeys(publicEntry);
    if (leaked.length) {
      fail('Public projection for entry[' + index + '] leaked: ' + leaked.join(', '));
    }
    // Silence unused in check path; authoring private keys are expected.
    void privateKeys;
    return publicEntry;
  });
}

function assertNoPrivateKeys(entries, label) {
  if (!Array.isArray(entries)) fail(label + ' must be an array.');
  entries.forEach((entry, index) => {
    const leaked = submit.findPrivateCatalogKeys(entry);
    if (leaked.length) {
      fail(label + ' entry[' + index + '] contains private keys: ' + leaked.join(', '));
    }
    Object.keys(entry || {}).forEach(key => {
      if (submit.PUBLIC_KEYS.indexOf(key) === -1) {
        fail(label + ' entry[' + index + '] contains non-allowlisted key: ' + key);
      }
    });
  });
}

function renderCatalog(entries) {
  return submit.formatAntennaJson(entries, { escapeUnicode: true }) + '\n';
}

function renderMeta(entries, sourceRevision) {
  const meta = {
    schema_name: 'antennacomparison.public-catalog',
    schema_version: '1.0.0',
    generated_from: 'antenna_data.json',
    public_artifact: 'antenna_catalog.json',
    entry_count: entries.length,
    source_revision: sourceRevision,
    generated_at: new Date().toISOString(),
    public_keys: submit.PUBLIC_KEYS.slice(),
    private_keys_excluded: submit.PRIVATE_KEYS.slice()
  };
  return JSON.stringify(meta, null, 2) + '\n';
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const authoring = readJson(authoringPath);
  const publicEntries = buildPublicCatalog(authoring);
  assertNoPrivateKeys(publicEntries, 'generated public catalog');

  const catalogText = renderCatalog(publicEntries);
  const sourceRevision = gitSourceRevision();

  if (checkOnly) {
    if (!fs.existsSync(catalogPath)) {
      fail('Missing public catalog artifact: antenna_catalog.json. Run: node .github/scripts/build-public-catalog.js');
    }
    if (!fs.existsSync(metaPath)) {
      fail('Missing public catalog metadata: antenna_catalog.meta.json. Run: node .github/scripts/build-public-catalog.js');
    }

    const committedCatalog = fs.readFileSync(catalogPath, 'utf8');
    const committedEntries = readJson(catalogPath);
    assertNoPrivateKeys(committedEntries, 'antenna_catalog.json');

    if (committedCatalog !== catalogText) {
      fail('antenna_catalog.json is out of date with antenna_data.json. Run: node .github/scripts/build-public-catalog.js');
    }

    const committedMeta = readJson(metaPath);
    if (committedMeta.entry_count !== publicEntries.length) {
      fail('antenna_catalog.meta.json entry_count does not match public catalog.');
    }
    if (committedMeta.public_artifact !== 'antenna_catalog.json') {
      fail('antenna_catalog.meta.json public_artifact must be antenna_catalog.json');
    }
    if (!Array.isArray(committedMeta.private_keys_excluded) || !committedMeta.private_keys_excluded.length) {
      fail('antenna_catalog.meta.json must list private_keys_excluded');
    }

    console.log('OK: public catalog allowlist check passed (' + publicEntries.length + ' entries)');
    console.log('OK: antenna_catalog.json matches authoring projection');
    return;
  }

  const metaText = renderMeta(publicEntries, sourceRevision);
  fs.writeFileSync(catalogPath, catalogText);
  fs.writeFileSync(metaPath, metaText);
  console.log('Wrote antenna_catalog.json (' + publicEntries.length + ' public entries)');
  console.log('Wrote antenna_catalog.meta.json (source_revision ' + sourceRevision + ')');
}

if (require.main === module) main();

module.exports = {
  buildPublicCatalog,
  assertNoPrivateKeys,
  authoringPath,
  catalogPath,
  metaPath
};
