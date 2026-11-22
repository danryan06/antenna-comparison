#!/usr/bin/env node
'use strict';

const assert = require('assert');
const matcher = require('../../compatibility-matcher.js');

function pass(name) {
  console.log('  ✓ ' + name);
}

function makeAp(overrides) {
  return Object.assign({
    ap_id: 'test:ap-complete',
    hardware_profile_id: 'test:ap-complete',
    vendor: 'Test',
    model: 'AP-Complete',
    display_name: 'Test AP-Complete',
    status: 'active',
    supported_bands: ['2.4', '5', '6'],
    antenna_architecture: 'external_only',
    antenna_configurations: [
      {
        configuration_id: 'default',
        label: 'Default',
        is_default: true,
        active_bands: ['2.4', '5', '6'],
        integrated_antenna_groups: [],
        external_interfaces: [
          {
            interface_id: 'wifi-rpsma',
            purpose: 'client_radio',
            requirement: 'required',
            attachment: 'bulkhead',
            connector: {
              family: 'rp-sma',
              variant: null,
              gender: 'female',
              orientation: null
            },
            connector_count: 4,
            rf_path_count: 4,
            path_groups: [
              {
                path_group_id: 'all',
                count: 4,
                bands: ['2.4', '5', '6'],
                interchangeable: true
              }
            ],
            included_accessory_ids: [],
            capabilities: [],
            restrictions: [],
            source_ids: ['test-ds']
          }
        ]
      }
    ],
    rf_sources: [{ source_id: 'test-ds', url: 'https://example.com', title: 'Test' }],
    completeness: { status: 'complete', missing: [] }
  }, overrides || {});
}

function makeAntenna(overrides) {
  return Object.assign({
    antenna_id: 'test:ant-1',
    vendor: 'TestAnt',
    sku: 'ANT-1',
    bands: ['2.4', '5', '6'],
    connector: 'RPSMA Male',
    lead_count: 4,
    rf_interfaces: [
      {
        interface_id: 'main',
        attachment: 'pigtail',
        connector_family: 'rp-sma',
        connector_variant: null,
        gender: 'male',
        orientation: null,
        connector_count: 4,
        physical_lead_count: 4,
        rf_path_count: 4,
        bands: ['2.4', '5', '6'],
        cable: { included: true, length_mm: 910, type: 'LMR-100', removable: false }
      }
    ]
  }, overrides || {});
}

console.log('compatibility matcher tests');

{
  const r = matcher.matchAntennaToAp(makeAntenna(), makeAp());
  assert.strictEqual(r.status, 'direct_fit');
  assert.strictEqual(r.units_required, 1);
  assert.ok(r.reasons.some(x => x.code === 'CONNECTOR_EXACT'));
  pass('direct_fit when connector/paths/bands/cable complete');
}

{
  const ant = makeAntenna({
    lead_count: 1,
    rf_interfaces: [
      Object.assign({}, makeAntenna().rf_interfaces[0], {
        connector_count: 1,
        physical_lead_count: 1,
        rf_path_count: 1
      })
    ]
  });
  const r = matcher.matchAntennaToAp(ant, makeAp());
  assert.strictEqual(r.status, 'direct_fit');
  assert.strictEqual(r.units_required, 4);
  assert.ok(r.reasons.some(x => x.code === 'MULTI_UNIT'));
  pass('multi-unit solution when AP ports are equivalent');
}

{
  const ant = makeAntenna({
    rf_interfaces: [
      Object.assign({}, makeAntenna().rf_interfaces[0], { connector_family: 'n', gender: 'male' })
    ]
  });
  const r = matcher.matchAntennaToAp(ant, makeAp());
  assert.strictEqual(r.status, 'incompatible');
  assert.ok(r.reasons.some(x => x.code === 'CONNECTOR_FAMILY_MISMATCH'));
  pass('incompatible on connector family mismatch');
}

{
  const ant = makeAntenna({
    bands: ['2.4', '5'],
    rf_interfaces: [
      Object.assign({}, makeAntenna().rf_interfaces[0], { bands: ['2.4', '5'] })
    ]
  });
  const r = matcher.matchAntennaToAp(ant, makeAp());
  assert.strictEqual(r.status, 'incompatible');
  assert.ok(r.reasons.some(x => x.code === 'BAND_MISSING'));
  pass('incompatible when required 6 GHz path uncovered');
}

{
  const ap = makeAp({
    completeness: {
      status: 'incomplete',
      missing: ['antenna_configurations.default.external_interfaces.wifi-rpsma.connector.gender']
    },
    antenna_configurations: [
      {
        configuration_id: 'default',
        label: 'Default',
        is_default: true,
        active_bands: ['2.4', '5', '6'],
        integrated_antenna_groups: [],
        external_interfaces: [
          Object.assign({}, makeAp().antenna_configurations[0].external_interfaces[0], {
            connector: { family: 'rp-sma', variant: null, gender: null, orientation: null }
          })
        ]
      }
    ]
  });
  const r = matcher.matchAntennaToAp(makeAntenna(), ap);
  assert.strictEqual(r.status, 'review_required');
  assert.ok(r.reasons.some(x => x.code === 'CONNECTOR_GENDER_UNKNOWN' || x.code === 'AP_PROFILE_INCOMPLETE'));
  pass('review_required when AP gender missing');
}

{
  const ant = makeAntenna({
    compatibility_claims: [
      { ap_id: 'test:ap-complete', claim: 'vendor_listed', source_id: 'sheet-1', restrictions: [], note: null }
    ],
    rf_interfaces: []
  });
  const r = matcher.matchAntennaToAp(ant, makeAp({
    completeness: { status: 'incomplete', missing: ['gender'] }
  }));
  assert.strictEqual(r.status, 'vendor_listed_unverified');
  pass('vendor_listed_unverified when claim exists but RF data incomplete');
}

{
  const dartAp = makeAp({
    ap_id: 'cisco:cw9174e',
    completeness: { status: 'complete', missing: [] },
    antenna_configurations: [
      {
        configuration_id: 'default',
        label: 'Default',
        is_default: true,
        active_bands: ['2.4', '5', '6'],
        integrated_antenna_groups: [],
        external_interfaces: [
          {
            interface_id: 'dart-8',
            purpose: 'client_radio',
            requirement: 'required',
            attachment: 'proprietary_multiport',
            connector: { family: 'dart', variant: 'dart-8', gender: null, orientation: null },
            connector_count: 1,
            rf_path_count: 8,
            path_groups: [
              { path_group_id: 'all', count: 8, bands: ['2.4', '5', '6'], interchangeable: true }
            ],
            included_accessory_ids: [],
            capabilities: ['self_identifying'],
            restrictions: [],
            source_ids: ['ds']
          }
        ]
      }
    ]
  });
  const ant = makeAntenna({
    antenna_id: 'acceltex:ats-02691',
    rf_interfaces: [
      {
        interface_id: 'main',
        attachment: 'proprietary_multiport',
        connector_family: 'dart',
        connector_variant: 'octal-straight',
        gender: null,
        orientation: 'straight',
        connector_count: 1,
        physical_lead_count: 1,
        rf_path_count: 8,
        bands: ['2.4', '5', '6'],
        cable: { included: true, length_mm: 910, type: 'ATS-100', removable: false }
      }
    ]
  });
  const r = matcher.matchAntennaToAp(ant, dartAp);
  assert.strictEqual(r.status, 'direct_fit');
  pass('proprietary DART variant alias matches for direct_fit');
}

{
  const ant = makeAntenna({
    rf_interfaces: [
      Object.assign({}, makeAntenna().rf_interfaces[0], {
        cable: { included: false, length_mm: null, type: null, removable: null },
        attachment: 'bulkhead'
      })
    ]
  });
  const r = matcher.matchAntennaToAp(ant, makeAp());
  assert.strictEqual(r.status, 'review_required');
  assert.ok(r.reasons.some(x => x.code === 'CABLE_REQUIRED' || x.code === 'ACCESSORY_UNMODELED'));
  pass('cable-required without curated SKU stays review_required');
}

{
  const envelope = {
    schema_name: 'apcomparison.external-antenna-profiles',
    schema_version: '2.0.0',
    generated_at: 'x',
    source_revision: 'y',
    profile_count: 0,
    profiles: []
  };
  assert.throws(() => matcher.assertEnvelope(envelope), /Unsupported schema major/);
  pass('rejects unsupported AP export major version');
}

{
  assert.strictEqual(
    matcher.DISCLAIMERS.bannerTitle,
    'Best-effort compatibility guidance'
  );
  assert.ok(matcher.DISCLAIMERS.bannerBody.indexOf('manufacturers’ current documentation') !== -1);
  assert.strictEqual(
    matcher.DISCLAIMERS.compact,
    'Best-effort match — verify with the manufacturers before purchase or installation.'
  );
  pass('disclaimer wording matches architecture');
}

console.log('OK: all compatibility matcher tests passed');
