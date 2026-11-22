#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const matcher = require('../../compatibility-matcher.js');

const root = path.join(__dirname, '..', '..');
const dataPath = path.join(root, 'antenna_data.json');
const profilesPath = path.join(root, 'data/compatibility/ap-profiles.json');
const pinMetaPath = path.join(root, 'data/compatibility/ap-profiles.pin.json');
const schemaPath = path.join(root, 'data/compatibility/ap-profiles.schema.json');

const FAMILIES = new Set([
  'rp-sma', 'sma', 'rp-tnc', 'tnc', 'n', 'qn', 'dart', 'mpc', 'msoc',
  'juniper-pin-block', 'vendor-proprietary'
]);
const GENDERS = new Set(['male', 'female']);
const ATTACHMENTS = new Set(['pigtail', 'direct', 'bulkhead', 'proprietary_multiport', 'breakout']);
const CLAIMS = new Set(['vendor_listed', 'inferred']);

let exitCode = 0;
function fail(msg) {
  console.error(msg);
  exitCode = 1;
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    fail(p + ' invalid JSON: ' + err.message);
    process.exit(1);
  }
}

const data = readJson(dataPath);
const envelope = readJson(profilesPath);
const pinMeta = readJson(pinMetaPath);
readJson(schemaPath);

try {
  matcher.assertEnvelope(envelope);
} catch (err) {
  fail(err.message);
  process.exit(1);
}

if (envelope.profile_count !== envelope.profiles.length) {
  fail('profile_count does not match profiles.length');
}

const sha256 = crypto.createHash('sha256').update(fs.readFileSync(profilesPath)).digest('hex');
if (pinMeta.sha256 !== sha256) fail('ap-profiles.pin.json sha256 does not match ap-profiles.json');
if (pinMeta.pin_commit !== envelope.source_revision) {
  fail('pin_commit does not match envelope source_revision');
}
if (pinMeta.schema_version !== envelope.schema_version) {
  fail('pin schema_version mismatch');
}

const apIds = new Set(envelope.profiles.map(p => p.ap_id));
const antennaIds = new Set();

if (!Array.isArray(data)) {
  fail('antenna_data.json must be an array');
  process.exit(1);
}

data.forEach((entry, index) => {
  const label = 'entry[' + index + '] ' + (entry && entry.sku ? entry.sku : '');
  if (!entry || typeof entry !== 'object') {
    fail(label + ': not an object');
    return;
  }
  if (!entry.antenna_id || typeof entry.antenna_id !== 'string') {
    fail(label + ': missing antenna_id');
    return;
  }
  if (!/^[a-z0-9-]+:[a-z0-9.-]+$/i.test(entry.antenna_id)) {
    fail(label + ': antenna_id format invalid: ' + entry.antenna_id);
  }
  if (antennaIds.has(entry.antenna_id)) fail(label + ': duplicate antenna_id ' + entry.antenna_id);
  antennaIds.add(entry.antenna_id);

  if (entry.rf_interfaces != null && !Array.isArray(entry.rf_interfaces)) {
    fail(label + ': rf_interfaces must be an array');
    return;
  }

  (entry.rf_interfaces || []).forEach((iface, i) => {
    const where = label + ' rf_interfaces[' + i + ']';
    if (!iface || typeof iface !== 'object') {
      fail(where + ': not an object');
      return;
    }
    if (!iface.interface_id) fail(where + ': missing interface_id');
    if (iface.connector_family && !FAMILIES.has(iface.connector_family)) {
      fail(where + ': unknown connector_family ' + iface.connector_family);
    }
    if (iface.gender != null && !GENDERS.has(iface.gender)) {
      fail(where + ': invalid gender');
    }
    if (iface.attachment && !ATTACHMENTS.has(iface.attachment)) {
      fail(where + ': invalid attachment');
    }
    ['connector_count', 'physical_lead_count', 'rf_path_count'].forEach(key => {
      if (iface[key] != null && (!Number.isInteger(iface[key]) || iface[key] < 1)) {
        fail(where + ': ' + key + ' must be a positive integer when set');
      }
    });
    if (iface.path_bands && typeof iface.path_bands === 'object') {
      const keys = Object.keys(iface.path_bands);
      if (iface.rf_path_count != null && keys.length && keys.length !== iface.rf_path_count) {
        fail(where + ': path_bands keys must agree with rf_path_count');
      }
    }
    if (iface.cable) {
      if (iface.cable.included != null && typeof iface.cable.included !== 'boolean') {
        fail(where + ': cable.included must be boolean or null');
      }
    }
  });

  (entry.compatibility_claims || []).forEach((claim, i) => {
    const where = label + ' compatibility_claims[' + i + ']';
    if (!claim || !claim.ap_id) {
      fail(where + ': missing ap_id');
      return;
    }
    if (!apIds.has(claim.ap_id)) fail(where + ': unknown ap_id ' + claim.ap_id);
    if (claim.claim && !CLAIMS.has(claim.claim)) fail(where + ': invalid claim type');
    if (claim.claim === 'vendor_listed' && !claim.source_id) {
      fail(where + ': vendor_listed claims require source_id');
    }
  });

  // Private notes must stay nested.
  ['compatible_aps', 'compatibleAPs', 'compatible_ap_list'].forEach(bad => {
    if (Object.prototype.hasOwnProperty.call(entry, bad)) {
      fail(label + ': ' + bad + ' must live under internal_notes only');
    }
  });
});

if (!exitCode) {
  console.log('OK: compatibility data validated (' + data.length + ' antennas, ' +
    envelope.profiles.length + ' AP profiles)');
}
process.exit(exitCode);
