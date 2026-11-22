#!/usr/bin/env node
'use strict';

/**
 * Build data/compatibility/ap_antenna_index.json from the pinned AP export
 * and authoring antenna_data.json. Matcher is the source of truth.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const matcher = require('../../compatibility-matcher.js');

const root = path.join(__dirname, '..', '..');
const profilesPath = path.join(root, 'data/compatibility/ap-profiles.json');
const pinMetaPath = path.join(root, 'data/compatibility/ap-profiles.pin.json');
const dataPath = path.join(root, 'antenna_data.json');
const indexPath = path.join(root, 'data/compatibility/ap_antenna_index.json');

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    fail(p + ': ' + err.message);
  }
}

function publicResult(result) {
  // Compact CI/deploy artifact. Finder recomputes full reason messages client-side.
  return {
    antenna_id: result.antenna_id,
    status: result.status,
    confidence: result.confidence,
    units_required: result.units_required,
    vendor_listed: !!result.vendor_listed,
    evidence: result.evidence || [],
    reason_codes: (result.reasons || []).map(function (r) { return r.code; }),
    warning_codes: (result.warnings || []).map(function (r) { return r.code; })
  };
}

function exclusionTallies(results) {
  const tallies = {};
  results.forEach(function (r) {
    if (r.status !== 'incompatible') return;
    (r.reasons || []).forEach(function (reason) {
      if (!reason || !reason.code) return;
      tallies[reason.code] = (tallies[reason.code] || 0) + 1;
    });
  });
  return tallies;
}

function main() {
  const checkOnly = process.argv.includes('--check');
  const envelope = readJson(profilesPath);
  const pinMeta = fs.existsSync(pinMetaPath) ? readJson(pinMetaPath) : null;
  const antennas = readJson(dataPath);
  if (!Array.isArray(antennas)) fail('antenna_data.json must be an array');

  matcher.assertEnvelope(envelope);
  const indexed = matcher.indexProfiles(envelope);

  const rawProfiles = fs.readFileSync(profilesPath);
  const sha256 = crypto.createHash('sha256').update(rawProfiles).digest('hex');
  if (pinMeta && pinMeta.sha256 && pinMeta.sha256 !== sha256) {
    fail('Pinned AP profiles sha256 mismatch. Update ap-profiles.pin.json after refreshing the snapshot.');
  }

  const byAp = {};
  const statusCounts = {
    direct_fit: 0,
    requires_cable: 0,
    requires_adapter: 0,
    vendor_listed_unverified: 0,
    review_required: 0,
    incompatible: 0
  };

  indexed.list.forEach(function (profile) {
    const results = matcher.matchAllForAp(antennas, profile, { showExcluded: true });
    results.forEach(function (r) {
      if (statusCounts[r.status] != null) statusCounts[r.status] += 1;
    });
    const included = results.filter(function (r) {
      return r.status !== 'incompatible';
    });
    const excluded = results.filter(function (r) {
      return r.status === 'incompatible';
    });
    byAp[profile.ap_id] = {
      ap_id: profile.ap_id,
      display_name: profile.display_name,
      completeness: profile.completeness,
      datasheet_url: profile.datasheet_url || null,
      result_count: included.length,
      excluded_count: excluded.length,
      exclusion_reason_counts: exclusionTallies(results),
      // Full incompatible rows omitted to keep the artifact small; matcher remains authoritative.
      results: included.map(publicResult)
    };
  });

  const index = {
    schema_name: 'antennacomparison.ap-antenna-index',
    schema_version: '1.0.0',
    generated_at: new Date().toISOString(),
    ap_export: {
      schema_name: envelope.schema_name,
      schema_version: envelope.schema_version,
      source_revision: envelope.source_revision,
      generated_at: envelope.generated_at,
      profile_count: envelope.profile_count,
      sha256: sha256,
      pin: pinMeta
    },
    antenna_count: antennas.length,
    status_counts: statusCounts,
    disclaimer: matcher.DISCLAIMERS.exportNotice,
    by_ap: byAp
  };

  const text = JSON.stringify(index, null, 2) + '\n';

  if (checkOnly) {
    if (!fs.existsSync(indexPath)) {
      fail('Missing ap_antenna_index.json. Run: node .github/scripts/build-compatibility-index.js');
    }
    const committed = fs.readFileSync(indexPath, 'utf8');
    const committedObj = JSON.parse(committed);
    // Compare without generated_at volatility: rebuild committed shape with same timestamp.
    index.generated_at = committedObj.generated_at;
    const stable = JSON.stringify(index, null, 2) + '\n';
    if (stable !== committed) {
      fail('ap_antenna_index.json is stale. Run: node .github/scripts/build-compatibility-index.js');
    }
    console.log('OK: compatibility index matches matcher output');
    return;
  }

  fs.writeFileSync(indexPath, text);
  console.log('Wrote ' + indexPath);
  console.log('APs: ' + indexed.list.length + '  antennas: ' + antennas.length);
  console.log('Status totals:', statusCounts);
}

main();
