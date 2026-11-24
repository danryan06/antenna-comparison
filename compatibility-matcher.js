/**
 * AP → antenna compatibility matcher (browser + Node).
 * Statuses: direct_fit | requires_cable | requires_adapter | vendor_listed_unverified
 *           | review_required | incompatible
 *
 * Prefers structured antenna rf_interfaces + pinned AP profiles
 * (apcomparison.external-antenna-profiles v1). When rf_interfaces are missing,
 * only uses antenna.connector free text for clear family mismatches (e.g. DART
 * vs RP-SMA) and lead_count for surplus-lead exclusion — never invents a fit.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AntennaCompatibility = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SUPPORTED_SCHEMA = 'apcomparison.external-antenna-profiles';
  var SUPPORTED_MAJOR = 1;

  var STATUSES = [
    'direct_fit',
    'requires_cable',
    'requires_adapter',
    'vendor_listed_unverified',
    'review_required',
    'incompatible'
  ];

  var STATUS_RANK = {
    direct_fit: 0,
    requires_cable: 1,
    requires_adapter: 2,
    vendor_listed_unverified: 3,
    review_required: 4,
    incompatible: 5
  };

  var PROPRIETARY_FAMILIES = {
    dart: true,
    mpc: true,
    msoc: true,
    qn: true,
    'juniper-pin-block': true,
    'vendor-proprietary': true
  };

  var WIFI_PURPOSES = {
    client_radio: true,
    scan_radio: true
  };

  var DISCLAIMERS = {
    bannerTitle: 'Best-effort compatibility guidance',
    bannerBody:
      'Results are based on published specifications and the evidence shown for each match. They may be incomplete, outdated, region-specific, or affected by firmware, connector variants, cables, adaptors, installation, and regulatory limits. Verify compatibility with the manufacturers before purchase or installation.',
    compact:
      'Best-effort match — verify with the manufacturers before purchase or installation.',
    exportNotice:
      'Compatibility results are best-effort informational guidance, not a manufacturer approval, warranty, installation instruction, regulatory determination, or guarantee of performance. Verify all part numbers, accessories, restrictions, and regional requirements with the manufacturers before purchase or installation.',
    aboutLinkLabel: 'About compatibility results'
  };

  function reason(code, message) {
    return { code: code, message: message };
  }

  function parseSchemaMajor(version) {
    var m = String(version || '').match(/^(\d+)\./);
    return m ? Number(m[1]) : NaN;
  }

  function assertEnvelope(envelope) {
    if (!envelope || typeof envelope !== 'object') {
      throw new Error('AP profiles envelope missing');
    }
    if (envelope.schema_name !== SUPPORTED_SCHEMA) {
      throw new Error('Unsupported schema_name: ' + envelope.schema_name);
    }
    var major = parseSchemaMajor(envelope.schema_version);
    if (major !== SUPPORTED_MAJOR) {
      throw new Error('Unsupported schema major version: ' + envelope.schema_version);
    }
    if (!Array.isArray(envelope.profiles)) {
      throw new Error('AP profiles envelope missing profiles[]');
    }
    return envelope;
  }

  function indexProfiles(envelope) {
    assertEnvelope(envelope);
    var byId = Object.create(null);
    envelope.profiles.forEach(function (profile) {
      if (profile && profile.ap_id) byId[profile.ap_id] = profile;
    });
    return {
      envelope: envelope,
      byId: byId,
      list: envelope.profiles.slice()
    };
  }

  function defaultConfiguration(profile) {
    var configs = (profile && profile.antenna_configurations) || [];
    var found = null;
    configs.forEach(function (cfg) {
      if (cfg && cfg.is_default) found = cfg;
    });
    return found || configs[0] || null;
  }

  function wifiInterfaces(configuration) {
    if (!configuration || !Array.isArray(configuration.external_interfaces)) return [];
    return configuration.external_interfaces.filter(function (iface) {
      if (!iface) return false;
      if (iface.requirement === 'not_part_of_wifi_antenna_solution') return false;
      if (iface.purpose && !WIFI_PURPOSES[iface.purpose] && iface.purpose !== 'other') {
        // IoT / GNSS / LTE / LoRaWAN are not Wi-Fi antenna matching targets.
        if (iface.purpose === 'iot' || iface.purpose === 'gnss' ||
            iface.purpose === 'lorawan' || iface.purpose === 'lte') {
          return false;
        }
      }
      return iface.requirement !== 'optional' || iface.purpose === 'client_radio';
    }).filter(function (iface) {
      // Required client/scan (and other required wifi-ish) interfaces only for hard matching.
      return iface.requirement === 'required';
    });
  }

  function complementaryGender(a, b) {
    if (!a || !b) return null;
    if (a === b) return false;
    return (a === 'male' && b === 'female') || (a === 'female' && b === 'male');
  }

  function normalizeBand(token) {
    var t = String(token || '').trim().toLowerCase();
    if (t === '2.4' || t === '2.4ghz') return '2.4';
    if (t === '5' || t === '5ghz' || t === '5ghz_full') return '5';
    if (t === '5-lower' || t === '5_low' || t === '5ghz_low') return '5-lower';
    if (t === '5-upper' || t === '5_high' || t === '5ghz_high') return '5-upper';
    if (t === '6' || t === '6ghz') return '6';
    return t;
  }

  function bandCovers(antennaBands, requiredBand) {
    var req = normalizeBand(requiredBand);
    var set = {};
    (antennaBands || []).forEach(function (b) {
      set[normalizeBand(b)] = true;
    });
    if (req === '5-lower' || req === '5-upper') {
      return !!(set[req] || set['5']);
    }
    if (req === '5') {
      return !!(set['5'] || (set['5-lower'] && set['5-upper']));
    }
    return !!set[req];
  }

  function antennaPathBands(iface) {
    if (iface.path_bands && typeof iface.path_bands === 'object' && !Array.isArray(iface.path_bands)) {
      return iface.path_bands;
    }
    if (Array.isArray(iface.bands) && iface.bands.length) {
      var out = {};
      var n = iface.rf_path_count || 0;
      for (var i = 1; i <= n; i++) out[String(i)] = iface.bands.slice();
      return out;
    }
    return null;
  }

  function flattenAntennaBands(iface, antenna) {
    var fromPaths = antennaPathBands(iface);
    if (fromPaths) {
      var set = {};
      Object.keys(fromPaths).forEach(function (k) {
        (fromPaths[k] || []).forEach(function (b) {
          set[normalizeBand(b)] = true;
        });
      });
      return Object.keys(set);
    }
    if (Array.isArray(iface.bands) && iface.bands.length) {
      return iface.bands.map(normalizeBand);
    }
    if (Array.isArray(antenna.bands)) return antenna.bands.map(normalizeBand);
    return [];
  }

  function claimForAp(antenna, apId) {
    var claims = antenna && Array.isArray(antenna.compatibility_claims)
      ? antenna.compatibility_claims
      : [];
    for (var i = 0; i < claims.length; i++) {
      if (claims[i] && claims[i].ap_id === apId) return claims[i];
    }
    return null;
  }

  function hardRestrictions(iface) {
    return ((iface && iface.restrictions) || []).filter(function (r) {
      return r && r.severity === 'hard';
    });
  }

  function missingMatingFacts(apIface, antIface) {
    var missing = [];
    var apConn = (apIface && apIface.connector) || {};
    var antConn = antIface || {};
    if (!apConn.family) missing.push('ap.connector.family');
    if (!antConn.connector_family) missing.push('antenna.connector_family');
    if (PROPRIETARY_FAMILIES[apConn.family] && !apConn.variant) {
      missing.push('ap.connector.variant');
    }
    if (PROPRIETARY_FAMILIES[antConn.connector_family] && !antConn.connector_variant) {
      missing.push('antenna.connector_variant');
    }
    if (!PROPRIETARY_FAMILIES[apConn.family] && !apConn.gender) {
      missing.push('ap.connector.gender');
    }
    if (!PROPRIETARY_FAMILIES[antConn.connector_family] && !antConn.gender) {
      missing.push('antenna.connector.gender');
    }
    if (apIface && (!Array.isArray(apIface.path_groups) || !apIface.path_groups.length)) {
      missing.push('ap.path_groups');
    }
    if (antIface && antIface.rf_path_count == null) {
      missing.push('antenna.rf_path_count');
    }
    if (antIface && antIface.cable && antIface.cable.included == null) {
      missing.push('antenna.cable.included');
    }
    return missing;
  }

  function matchConnector(apIface, antIface, reasons, warnings) {
    var apConn = apIface.connector || {};
    var antFamily = antIface.connector_family;
    var antVariant = antIface.connector_variant || null;
    var antGender = antIface.gender == null ? null : antIface.gender;

    if (!apConn.family || !antFamily) {
      return { status: 'review_required', code: 'CONNECTOR_UNKNOWN' };
    }

    if (apConn.family !== antFamily) {
      reasons.push(reason(
        'CONNECTOR_FAMILY_MISMATCH',
        'AP connector family "' + apConn.family + '" does not match antenna "' + antFamily + '".'
      ));
      return { status: 'incompatible', code: 'CONNECTOR_FAMILY_MISMATCH' };
    }

    if (PROPRIETARY_FAMILIES[apConn.family]) {
      if (!apConn.variant || !antVariant) {
        reasons.push(reason(
          'CONNECTOR_VARIANT_UNKNOWN',
          'Proprietary family "' + apConn.family + '" requires an exact connector variant on both sides.'
        ));
        return { status: 'review_required', code: 'CONNECTOR_VARIANT_UNKNOWN' };
      }
      // Allow dart-8 ↔ octal / octal-straight style aliases via normalized compare.
      var apVar = String(apConn.variant).toLowerCase();
      var antVar = String(antVariant).toLowerCase();
      var dartAlias =
        apConn.family === 'dart' &&
        ((apVar === 'dart-8' || apVar === 'octal') &&
          (antVar.indexOf('octal') !== -1 || antVar.indexOf('dart-8') !== -1 || antVar.indexOf('8-port') !== -1));
      var dart4Alias =
        apConn.family === 'dart' &&
        ((apVar === 'dart-4' || apVar === 'quad') &&
          (antVar.indexOf('dart-4') !== -1 || antVar.indexOf('4-port') !== -1 || antVar === 'dart'));
      if (apVar !== antVar && !dartAlias && !dart4Alias) {
        reasons.push(reason(
          'CONNECTOR_VARIANT_MISMATCH',
          'AP variant "' + apConn.variant + '" does not match antenna variant "' + antVariant + '".'
        ));
        return { status: 'incompatible', code: 'CONNECTOR_VARIANT_MISMATCH' };
      }
      reasons.push(reason('CONNECTOR_EXACT', 'Proprietary connector family and variant match.'));
      return { status: 'ok', code: 'CONNECTOR_EXACT' };
    }

    // Standard coax: complementary gender required for direct fit.
    if (!apConn.gender || !antGender) {
      reasons.push(reason(
        'CONNECTOR_GENDER_UNKNOWN',
        'Standard connector family matches, but mating gender is not fully sourced.'
      ));
      return { status: 'review_required', code: 'CONNECTOR_GENDER_UNKNOWN' };
    }

    var mate = complementaryGender(apConn.gender, antGender);
    if (mate === false) {
      reasons.push(reason(
        'CONNECTOR_GENDER_MISMATCH',
        'AP gender "' + apConn.gender + '" does not mate with antenna gender "' + antGender + '".'
      ));
      return { status: 'incompatible', code: 'CONNECTOR_GENDER_MISMATCH' };
    }

    reasons.push(reason(
      'CONNECTOR_EXACT',
      'Connector family "' + apConn.family + '" mates (' + apConn.gender + ' ↔ ' + antGender + ').'
    ));
    return { status: 'ok', code: 'CONNECTOR_EXACT' };
  }

  function resolveAntennaPathCount(antIface, antenna) {
    if (antIface && antIface.rf_path_count != null) return antIface.rf_path_count;
    if (antIface && antIface.physical_lead_count != null) return antIface.physical_lead_count;
    if (antIface && antIface.connector_count != null) return antIface.connector_count;
    if (antenna && antenna.lead_count != null) return antenna.lead_count;
    return null;
  }

  function surplusLeadIncompatible(apPaths, antPaths, reasons) {
    reasons.push(reason(
      'PATHS_EXTRA',
      'Antenna provides ' + antPaths + ' RF path(s); AP has ' + apPaths +
        '. Surplus leads are not a match — choose an antenna with the same lead count.'
    ));
    return { status: 'incompatible', units_required: null };
  }

  /**
   * Conservative free-text family hint for hard excludes only.
   * Returns null when ambiguous / composite / unknown.
   */
  function obviousConnectorFamilyFromText(raw) {
    var text = String(raw || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!text) return null;
    if (text.indexOf(' and ') !== -1 || text.indexOf('/') !== -1) {
      // Composite listing — still catch proprietary-only composites (e.g. "4 MPC and 6 MPC").
      if (/\bmpc\b/.test(text) && !/\b(rp[\s-]?sma|rpsma|sma|n[\s-]?type|rp[\s-]?tnc|tnc|dart|qn)\b/.test(
        text.replace(/\bmpc\b/g, '')
      )) {
        return 'mpc';
      }
      return null;
    }
    if (/\bdart\b/.test(text)) return 'dart';
    if (/\bmpc\b/.test(text)) return 'mpc';
    if (/\bmsoc\b/.test(text)) return 'msoc';
    if (/\bqn\b/.test(text)) return 'qn';
    if (/rp[\s-]?sma|rpsma/.test(text) && !/\bsma\b/.test(text.replace(/rp[\s-]?sma|rpsma/g, ''))) {
      return 'rp-sma';
    }
    if (/\bsma\b/.test(text) && !/rp[\s-]?sma|rpsma/.test(text)) return 'sma';
    if (/rp[\s-]?tnc|rptnc/.test(text)) return 'rp-tnc';
    if (/\bn[\s-]?type\b|\bn[\s-]?female\b|\bn[\s-]?male\b/.test(text)) return 'n';
    return null;
  }

  function freeTextConnectorMismatch(apIface, antenna, reasons) {
    var apFamily = apIface && apIface.connector && apIface.connector.family;
    var antFamily = obviousConnectorFamilyFromText(antenna && antenna.connector);
    if (!apFamily || !antFamily) return false;
    if (apFamily === antFamily) return false;
    reasons.push(reason(
      'CONNECTOR_FAMILY_MISMATCH',
      'Antenna connector "' + antenna.connector + '" does not match AP family "' + apFamily + '".'
    ));
    return true;
  }

  function matchPathsAndBands(apIface, antIface, antenna, reasons) {
    var apPaths = apIface.rf_path_count;
    if (apPaths == null && apIface.connector_count != null) apPaths = apIface.connector_count;
    var antPaths = resolveAntennaPathCount(antIface, antenna);
    var groups = Array.isArray(apIface.path_groups) ? apIface.path_groups : [];

    if (apPaths == null || antPaths == null) {
      reasons.push(reason('PATHS_UNKNOWN', 'RF path counts are incomplete on the AP or antenna profile.'));
      return { status: 'review_required', units_required: null };
    }

    // Hard rule: never list antennas with more leads than the AP has ports.
    if (antPaths > apPaths) {
      return surplusLeadIncompatible(apPaths, antPaths, reasons);
    }

    if (!groups.length) {
      reasons.push(reason(
        'PATH_GROUPS_UNKNOWN',
        'AP path-to-band mapping is incomplete; cannot confirm per-path coverage.'
      ));
      // Still check coarse path count for hard fewer-paths when counts known.
      if (antPaths < apPaths) {
        // Multi-unit only when all ports equivalent — unknown groups ⇒ review, not multi-unit.
        reasons.push(reason(
          'PATHS_INSUFFICIENT',
          'Antenna provides ' + antPaths + ' RF path(s); AP requires ' + apPaths + '.'
        ));
        return { status: 'review_required', units_required: null };
      }
      return { status: 'review_required', units_required: 1 };
    }

    var requiredPaths = 0;
    groups.forEach(function (g) {
      requiredPaths += g.count || 0;
    });
    if (requiredPaths && requiredPaths !== apPaths) {
      reasons.push(reason(
        'PATH_GROUP_SUM_MISMATCH',
        'AP path_groups sum does not equal rf_path_count.'
      ));
      return { status: 'review_required', units_required: null };
    }

    var interchangeable = groups.every(function (g) {
      return g.interchangeable !== false;
    });
    var sameBands = groups.length === 1 || groups.every(function (g) {
      var a = (groups[0].bands || []).map(normalizeBand).sort().join(',');
      var b = (g.bands || []).map(normalizeBand).sort().join(',');
      return a === b;
    });

    var antBands = flattenAntennaBands(antIface, antenna);
    var bandFail = false;
    groups.forEach(function (g) {
      (g.bands || []).forEach(function (b) {
        if (!bandCovers(antBands, b)) {
          bandFail = true;
          reasons.push(reason(
            'BAND_MISSING',
            'Antenna does not cover required band ' + b + ' GHz for path group "' + g.path_group_id + '".'
          ));
        }
      });
    });
    if (bandFail) {
      return { status: 'incompatible', units_required: null };
    }

    if (antPaths === apPaths) {
      reasons.push(reason('PATHS_EXACT', 'RF path count matches (' + apPaths + ').'));
      reasons.push(reason('BANDS_COVERED', 'Required path-group bands are covered.'));
      return { status: 'ok', units_required: 1 };
    }

    if (antPaths < apPaths) {
      if (interchangeable && sameBands && apPaths % antPaths === 0) {
        var units = apPaths / antPaths;
        reasons.push(reason(
          'MULTI_UNIT',
          'AP ports are equivalent; ' + units + ' antenna unit(s) needed to fill ' + apPaths + ' paths.'
        ));
        reasons.push(reason('BANDS_COVERED', 'Required path-group bands are covered per unit.'));
        return { status: 'ok', units_required: units };
      }
      reasons.push(reason(
        'PATHS_INSUFFICIENT',
        'Antenna provides ' + antPaths + ' RF path(s); AP requires ' + apPaths + ' with non-equivalent roles.'
      ));
      return { status: 'incompatible', units_required: null };
    }

    // antPaths > apPaths already returned incompatible above.
    return { status: 'review_required', units_required: null };
  }

  function evaluateCable(antIface, reasons) {
    var cable = antIface && antIface.cable;
    var attachment = antIface && antIface.attachment;

    if (!cable || cable.included == null) {
      reasons.push(reason(
        'CABLE_UNKNOWN',
        'Cable inclusion is unknown; cannot confirm a direct mechanical mate.'
      ));
      return { status: 'review_required' };
    }

    if (cable.included === true) {
      reasons.push(reason('CABLE_INCLUDED', 'Antenna includes a pigtail/cable assembly.'));
      return { status: 'ok' };
    }

    // No included cable: direct bulkhead N-female typically needs a cable.
    if (attachment === 'bulkhead' || attachment === 'direct') {
      reasons.push(reason(
        'CABLE_REQUIRED',
        'No included pigtail; a qualified cable assembly is required to reach the AP.'
      ));
      // First release: accessory SKUs not modeled → review_required, not requires_cable.
      reasons.push(reason(
        'ACCESSORY_UNMODELED',
        'Cable/adaptor SKUs are not yet curated; treating as review required.'
      ));
      return { status: 'review_required' };
    }

    reasons.push(reason('CABLE_NOT_INCLUDED', 'Cable is not included.'));
    reasons.push(reason(
      'ACCESSORY_UNMODELED',
      'Cable/adaptor SKUs are not yet curated; treating as review required.'
    ));
    return { status: 'review_required' };
  }

  function pickBestAntennaInterface(antenna, apIface) {
    var list = (antenna && Array.isArray(antenna.rf_interfaces)) ? antenna.rf_interfaces : [];
    if (!list.length) return null;
    var apFamily = apIface && apIface.connector && apIface.connector.family;
    var exact = null;
    list.forEach(function (iface) {
      if (!exact && apFamily && iface.connector_family === apFamily) exact = iface;
    });
    return exact || list[0];
  }

  function emptyResult(antennaId, status, reasons, extra) {
    return Object.assign({
      antenna_id: antennaId,
      status: status,
      confidence: status === 'direct_fit' ? 'high' : (status === 'incompatible' ? 'high' : 'low'),
      units_required: null,
      required_accessories: [],
      evidence: [],
      reasons: reasons || [],
      warnings: [],
      vendor_listed: false
    }, extra || {});
  }

  function matchAntennaToAp(antenna, profile, options) {
    options = options || {};
    var antennaId = (antenna && (antenna.antenna_id || antenna._antenna_id)) || null;
    var reasons = [];
    var warnings = [];
    var evidence = [];

    if (!profile) {
      return emptyResult(antennaId, 'review_required', [
        reason('AP_PROFILE_MISSING', 'AP profile is unavailable for this id.')
      ]);
    }

    if (profile.status === 'retired') {
      warnings.push(reason('AP_RETIRED', 'This AP profile is marked retired.'));
    }

    var claim = claimForAp(antenna, profile.ap_id);
    var vendorListed = !!(claim && claim.claim === 'vendor_listed');
    if (vendorListed) evidence.push('vendor_claim');

    var cfg = defaultConfiguration(profile);
    if (!cfg) {
      return emptyResult(antennaId, 'review_required', [
        reason('AP_CONFIG_MISSING', 'AP has no antenna configuration in the pinned export.')
      ], { vendor_listed: vendorListed });
    }

    var interfaces = wifiInterfaces(cfg);
    if (!interfaces.length) {
      return emptyResult(antennaId, 'review_required', [
        reason('AP_NO_WIFI_INTERFACE', 'No required Wi-Fi external interface on the default configuration.')
      ], { vendor_listed: vendorListed });
    }

    // First release: match against the primary required Wi-Fi interface.
    var apIface = interfaces[0];
    if (interfaces.length > 1) {
      warnings.push(reason(
        'MULTI_INTERFACE',
        'AP has multiple required Wi-Fi interfaces; evaluating the primary interface only in v1.'
      ));
    }

    hardRestrictions(apIface).forEach(function (r) {
      warnings.push(reason(
        'AP_HARD_RESTRICTION',
        'AP restriction "' + r.code + '"' + (r.value ? ': ' + r.value : '')
      ));
    });

    var completeness = profile.completeness || {};
    if (completeness.status === 'incomplete') {
      reasons.push(reason(
        'AP_PROFILE_INCOMPLETE',
        'Pinned AP profile lists missing hard facts: ' +
          ((completeness.missing || []).slice(0, 4).join(', ') || 'unspecified') + '.'
      ));
    }

    var antIface = pickBestAntennaInterface(antenna, apIface);
    if (!antIface) {
      var apPathCount = apIface.rf_path_count;
      if (apPathCount == null && apIface.connector_count != null) {
        apPathCount = apIface.connector_count;
      }
      var antLeadCount = resolveAntennaPathCount(null, antenna);
      if (apPathCount != null && antLeadCount != null && antLeadCount > apPathCount) {
        surplusLeadIncompatible(apPathCount, antLeadCount, reasons);
        return emptyResult(antennaId, 'incompatible', reasons, {
          vendor_listed: vendorListed,
          warnings: warnings,
          confidence: 'high',
          evidence: evidence
        });
      }
      if (freeTextConnectorMismatch(apIface, antenna, reasons)) {
        return emptyResult(antennaId, 'incompatible', reasons, {
          vendor_listed: vendorListed,
          warnings: warnings,
          confidence: 'high',
          evidence: evidence
        });
      }
      var noIfaceStatus = vendorListed ? 'vendor_listed_unverified' : 'review_required';
      reasons.push(reason(
        'ANTENNA_RF_INTERFACE_MISSING',
        'Antenna has no structured rf_interfaces; physical fit cannot be evaluated.'
      ));
      return emptyResult(antennaId, noIfaceStatus, reasons, {
        vendor_listed: vendorListed,
        warnings: warnings,
        confidence: 'low',
        evidence: vendorListed ? ['vendor_claim'] : []
      });
    }

    var missing = missingMatingFacts(apIface, antIface);
    var conn = matchConnector(apIface, antIface, reasons, warnings);
    if (conn.status === 'incompatible') {
      return emptyResult(antennaId, 'incompatible', reasons, {
        vendor_listed: vendorListed,
        warnings: warnings,
        confidence: 'high',
        evidence: evidence
      });
    }

    var paths = matchPathsAndBands(apIface, antIface, antenna, reasons);
    if (paths.status === 'incompatible') {
      return emptyResult(antennaId, 'incompatible', reasons, {
        vendor_listed: vendorListed,
        warnings: warnings,
        confidence: 'high',
        evidence: evidence
      });
    }

    var cable = evaluateCable(antIface, reasons);

    if (conn.status === 'ok') evidence.push('connector');
    if (paths.status === 'ok') {
      evidence.push('path_count');
      evidence.push('bands');
    }

    // Known physical conflict already returned. Missing hard data → review / unverified.
    var needsReview =
      conn.status === 'review_required' ||
      paths.status === 'review_required' ||
      cable.status === 'review_required' ||
      missing.length > 0 ||
      completeness.status === 'incomplete' ||
      hardRestrictions(apIface).length > 0;

    if (needsReview) {
      if (vendorListed) {
        return emptyResult(antennaId, 'vendor_listed_unverified', reasons, {
          vendor_listed: true,
          warnings: warnings,
          confidence: 'medium',
          evidence: evidence,
          units_required: paths.units_required
        });
      }
      return emptyResult(antennaId, 'review_required', reasons, {
        vendor_listed: false,
        warnings: warnings,
        confidence: 'low',
        evidence: evidence,
        units_required: paths.units_required
      });
    }

    // All hard rules passed with complete data.
    return emptyResult(antennaId, 'direct_fit', reasons, {
      vendor_listed: vendorListed,
      warnings: warnings,
      confidence: vendorListed ? 'high' : 'medium',
      evidence: evidence,
      units_required: paths.units_required || 1
    });
  }

  function matchAllForAp(antennas, profile, options) {
    options = options || {};
    var showExcluded = !!options.showExcluded;
    var results = [];
    (antennas || []).forEach(function (antenna) {
      var result = matchAntennaToAp(antenna, profile, options);
      result.antenna = antenna;
      if (result.status === 'incompatible' && !showExcluded) return;
      results.push(result);
    });
    results.sort(function (a, b) {
      var ra = STATUS_RANK[a.status] != null ? STATUS_RANK[a.status] : 99;
      var rb = STATUS_RANK[b.status] != null ? STATUS_RANK[b.status] : 99;
      if (ra !== rb) return ra - rb;
      var va = String((a.antenna && a.antenna.vendor) || '');
      var vb = String((b.antenna && b.antenna.vendor) || '');
      if (va !== vb) return va.localeCompare(vb);
      return String((a.antenna && a.antenna.sku) || '').localeCompare(String((b.antenna && b.antenna.sku) || ''));
    });
    return results;
  }

  function statusLabel(status) {
    switch (status) {
      case 'direct_fit': return 'Direct match';
      case 'requires_cable': return 'Requires cable';
      case 'requires_adapter': return 'Requires adaptor';
      case 'vendor_listed_unverified': return 'Vendor listed; verify';
      case 'review_required': return 'Needs review';
      case 'incompatible': return 'Excluded';
      default: return status;
    }
  }

  function groupResults(results) {
    var groups = [
      { id: 'direct', title: 'Direct matches', statuses: ['direct_fit'], items: [] },
      { id: 'accessory', title: 'Requires cable/adaptor', statuses: ['requires_cable', 'requires_adapter'], items: [] },
      { id: 'vendor', title: 'Vendor listed; verify', statuses: ['vendor_listed_unverified'], items: [] },
      { id: 'review', title: 'Needs review', statuses: ['review_required'], items: [] },
      { id: 'excluded', title: 'Excluded', statuses: ['incompatible'], items: [] }
    ];
    (results || []).forEach(function (r) {
      for (var i = 0; i < groups.length; i++) {
        if (groups[i].statuses.indexOf(r.status) !== -1) {
          groups[i].items.push(r);
          return;
        }
      }
    });
    return groups.filter(function (g) {
      return g.id === 'excluded' ? g.items.length > 0 : true;
    });
  }

  // ---------------------------------------------------------------------------
  // Plain-language explanations for the Finder's "Why this result?" panel.
  // The matcher's own reason codes and messages stay as-is (CSV export, tests);
  // this only rewrites them for people. Every code the matcher emits must have
  // an entry here (test-compat-explain.js checks).
  // tone: "match" = in its favor, "check" = could not confirm, "mismatch" = rules it out.
  // ---------------------------------------------------------------------------
  function quoted(text) {
    var out = [];
    String(text || '').replace(/"([^"]*)"/g, function (_, v) { out.push(v); return _; });
    return out;
  }

  function familyName(f) {
    var v = String(f || '').trim();
    var known = { dart: 'DART', 'rp-sma': 'RP-SMA', rpsma: 'RP-SMA', sma: 'SMA', n: 'N-type', 'n-type': 'N-type', 'rp-tnc': 'RP-TNC', rptnc: 'RP-TNC', tnc: 'TNC', mpc: 'MPC', msoc: 'MSOC', qn: 'QN' };
    return known[v.toLowerCase()] || v;
  }

  function variantName(v) {
    var m = String(v || '').match(/^dart-(\d+)$/i);
    if (m) return m[1] + '-port DART';
    if (/^octal$/i.test(v)) return '8-port DART';
    if (/^quad$/i.test(v)) return '4-port DART';
    return String(v || '');
  }

  function firstNumber(text, re) {
    var m = String(text || '').match(re);
    return m ? m[1] : null;
  }

  var EXPLAIN = {
    CONNECTOR_EXACT: function (msg) {
      var gender = String(msg || '').match(/\(([^)]*)\)/);
      return {
        tone: 'match',
        text: gender
          ? 'Connector mates with the AP (' + gender[1].replace('↔', 'to') + ').'
          : 'Connector type and variant match the AP.'
      };
    },
    PATHS_EXACT: function (msg) {
      var n = firstNumber(msg, /\((\d+)\)/);
      return { tone: 'match', text: n ? 'Lead count matches the AP’s ' + n + ' RF paths.' : 'Lead count matches the AP.' };
    },
    BANDS_COVERED: function (msg) {
      return {
        tone: 'match',
        text: /per unit/.test(msg || '')
          ? 'Each antenna covers the bands the AP’s ports need.'
          : 'Covers the bands the AP’s ports need.'
      };
    },
    CABLE_INCLUDED: function () {
      return { tone: 'match', text: 'Leads are built in, so no separate cable is needed.' };
    },
    MULTI_UNIT: function (msg) {
      var units = firstNumber(msg, /;\s*(\d+) antenna/);
      var paths = firstNumber(msg, /fill (\d+) paths/);
      return {
        tone: 'match',
        text: units && paths
          ? 'Takes ' + units + ' of these antennas to fill all ' + paths + ' of the AP’s ports.'
          : 'Takes more than one of these antennas to fill the AP’s ports.'
      };
    },
    AP_PROFILE_INCOMPLETE: function () {
      return { tone: 'check', text: 'Some AP details aren’t in our data yet, so this can’t be fully confirmed.' };
    },
    PATH_GROUPS_UNKNOWN: function () {
      return { tone: 'check', text: 'Which AP ports carry which bands isn’t published in our data, so per-port band coverage can’t be confirmed.' };
    },
    PATHS_UNKNOWN: function () {
      return { tone: 'check', text: 'The lead count or the AP’s RF path count is missing, so the port count can’t be confirmed.' };
    },
    PATH_GROUP_SUM_MISMATCH: function () {
      return { tone: 'check', text: 'The AP’s port groups don’t add up to its RF path count in our data.' };
    },
    CONNECTOR_UNKNOWN: function () {
      return { tone: 'check', text: 'Connector details are missing for the AP or the antenna.' };
    },
    CONNECTOR_VARIANT_UNKNOWN: function () {
      return { tone: 'check', text: 'This connector type needs an exact variant match, and the variant isn’t confirmed.' };
    },
    CONNECTOR_GENDER_UNKNOWN: function () {
      return { tone: 'check', text: 'Connector type matches, but male/female isn’t confirmed.' };
    },
    CABLE_UNKNOWN: function () {
      return { tone: 'check', text: 'Not confirmed whether a cable or leads are included.' };
    },
    CABLE_REQUIRED: function () {
      return { tone: 'check', text: 'No leads included; you’ll need a cable assembly to reach the AP.' };
    },
    CABLE_NOT_INCLUDED: function () {
      return { tone: 'check', text: 'Cable not included.' };
    },
    ACCESSORY_UNMODELED: function () {
      return { tone: 'check', text: 'We don’t list cable or adaptor part numbers yet.' };
    },
    ANTENNA_RF_INTERFACE_MISSING: function () {
      return { tone: 'check', text: 'This antenna’s connector details aren’t structured yet, so physical fit can’t be checked.' };
    },
    MULTI_INTERFACE: function () {
      return { tone: 'check', text: 'The AP has more than one antenna interface; only the primary one is checked.' };
    },
    AP_HARD_RESTRICTION: function (msg) {
      return { tone: 'check', text: String(msg || 'The AP vendor lists a restriction for this configuration.') };
    },
    AP_RETIRED: function () {
      return { tone: 'check', text: 'This AP is retired.' };
    },
    CONNECTOR_FAMILY_MISMATCH: function (msg) {
      // Two message shapes: 'Antenna connector "X" does not match AP family "y".'
      // and 'AP connector family "y" does not match antenna "x".'
      var q = quoted(msg);
      if (q.length === 2) {
        var apFirst = /^AP connector/.test(String(msg || ''));
        var ant = apFirst ? q[1] : q[0];
        var ap = familyName(apFirst ? q[0] : q[1]);
        return { tone: 'mismatch', text: 'Antenna connector (' + familyName(ant) + ') doesn’t fit the AP’s ' + ap + ' ports.' };
      }
      return { tone: 'mismatch', text: 'Connector type doesn’t match the AP.' };
    },
    CONNECTOR_VARIANT_MISMATCH: function (msg) {
      var q = quoted(msg);
      return {
        tone: 'mismatch',
        text: q.length === 2
          ? 'Connector variant doesn’t match: the AP uses ' + variantName(q[0]) + ', this antenna is ' + variantName(q[1]) + '.'
          : 'Connector variant doesn’t match the AP (for example, 4-port vs 8-port DART).'
      };
    },
    CONNECTOR_GENDER_MISMATCH: function (msg) {
      var q = quoted(msg);
      return {
        tone: 'mismatch',
        text: q.length === 2
          ? 'Connectors don’t mate: the AP is ' + q[0] + ' and this antenna is ' + q[1] + '.'
          : 'Connector male/female doesn’t mate with the AP.'
      };
    },
    PATHS_INSUFFICIENT: function (msg) {
      var ant = firstNumber(msg, /provides (\d+)/);
      var ap = firstNumber(msg, /requires (\d+)/);
      return {
        tone: 'mismatch',
        text: ant && ap ? 'Has ' + ant + ' lead(s); the AP needs ' + ap + '.' : 'Not enough leads for the AP.'
      };
    },
    PATHS_EXTRA: function (msg) {
      var ant = firstNumber(msg, /provides (\d+)/);
      var ap = firstNumber(msg, /AP has (\d+)/);
      return {
        tone: 'mismatch',
        text: ant && ap ? 'Has ' + ant + ' leads; the AP has ' + ap + ' ports. Pick an antenna with the same lead count.' : 'More leads than the AP has ports.'
      };
    },
    BAND_MISSING: function (msg) {
      var band = firstNumber(msg, /required band ([\d.]+) GHz/);
      return { tone: 'mismatch', text: band ? 'Doesn’t cover ' + band + ' GHz, which the AP needs.' : 'Doesn’t cover a band the AP needs.' };
    },
    AP_CONFIG_MISSING: function () {
      return { tone: 'mismatch', text: 'No external-antenna configuration is published for this AP.' };
    },
    AP_NO_WIFI_INTERFACE: function () {
      return { tone: 'mismatch', text: 'This AP has no external Wi-Fi antenna ports.' };
    },
    AP_PROFILE_MISSING: function () {
      return { tone: 'mismatch', text: 'This AP isn’t in our compatibility data.' };
    }
  };

  function explainReason(r) {
    var code = r && r.code;
    var fn = code && EXPLAIN[code];
    if (fn) {
      var out = fn(r.message);
      return { code: code, tone: out.tone, text: out.text, detail: r.message || '' };
    }
    return { code: code || '', tone: 'check', text: (r && r.message) || String(code || ''), detail: (r && r.message) || '' };
  }

  // Group a result's reasons and warnings by tone, dropping exact duplicates.
  function explainResult(result) {
    var groups = { match: [], check: [], mismatch: [] };
    var seen = {};
    var all = ((result && result.reasons) || []).concat((result && result.warnings) || []);
    var hasPathGroupsUnknown = all.some(function (r) { return r && r.code === 'PATH_GROUPS_UNKNOWN'; });
    all.forEach(function (r) {
      // "AP profile incomplete" only restates PATH_GROUPS_UNKNOWN when the only
      // missing facts are path_groups; show the more specific line alone.
      if (r && r.code === 'AP_PROFILE_INCOMPLETE' && hasPathGroupsUnknown) {
        var listed = String(r.message || '').replace(/^[^:]*:\s*/, '').replace(/\.$/, '').split(/,\s*/).filter(Boolean);
        if (listed.length && listed.every(function (f) { return /path_groups$/.test(f); })) return;
      }
      var e = explainReason(r);
      var key = e.tone + '|' + e.text;
      if (seen[key]) return;
      seen[key] = true;
      groups[e.tone].push(e);
    });
    return groups;
  }

  return {
    SUPPORTED_SCHEMA: SUPPORTED_SCHEMA,
    SUPPORTED_MAJOR: SUPPORTED_MAJOR,
    STATUSES: STATUSES,
    DISCLAIMERS: DISCLAIMERS,
    assertEnvelope: assertEnvelope,
    indexProfiles: indexProfiles,
    defaultConfiguration: defaultConfiguration,
    matchAntennaToAp: matchAntennaToAp,
    matchAllForAp: matchAllForAp,
    statusLabel: statusLabel,
    groupResults: groupResults,
    explainReason: explainReason,
    explainResult: explainResult,
    EXPLAINED_CODES: Object.keys(EXPLAIN),
    normalizeBand: normalizeBand
  };
});
