/**
 * Conservative connector text → structured rf_interfaces helpers.
 * Unknown / composite connectors return null (caller leaves rf_interfaces empty).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ConnectorNormalize = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function slugVendor(vendor) {
    return String(vendor || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function slugSku(sku) {
    return String(sku || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function makeAntennaId(vendor, sku) {
    return slugVendor(vendor) + ':' + slugSku(sku);
  }

  function parseCable(entry) {
    var raw = entry && entry.cable_length;
    if (raw == null || raw === '') {
      return { included: null, length_mm: null, type: entry.cable_type || null, removable: null };
    }
    var text = String(raw);
    var mm = null;
    var mMm = text.match(/(\d+)\s*mm/i);
    var mIn = text.match(/(\d+(?:\.\d+)?)\s*in/i);
    var mFt = text.match(/(\d+(?:\.\d+)?)\s*ft/i);
    if (mMm) mm = Number(mMm[1]);
    else if (mIn) mm = Math.round(Number(mIn[1]) * 25.4);
    else if (mFt) mm = Math.round(Number(mFt[1]) * 304.8);
    return {
      included: true,
      length_mm: mm,
      type: entry.cable_type || null,
      removable: false
    };
  }

  function bandsOf(entry) {
    return Array.isArray(entry.bands) ? entry.bands.map(String) : [];
  }

  function interfaceBase(entry, overrides) {
    var cable = parseCable(entry);
    return Object.assign({
      interface_id: 'main',
      attachment: cable.included ? 'pigtail' : 'bulkhead',
      connector_family: null,
      connector_variant: null,
      gender: null,
      orientation: null,
      connector_count: null,
      physical_lead_count: entry.lead_count == null ? null : Number(entry.lead_count),
      rf_path_count: null,
      bands: bandsOf(entry),
      path_bands: null,
      cable: cable
    }, overrides || {});
  }

  function normalizeConnectorText(raw) {
    return String(raw || '')
      .toLowerCase()
      .replace(/[×x]/g, 'x')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Returns one structured interface, or null when unsafe to infer.
   */
  function inferRfInterface(entry) {
    var text = normalizeConnectorText(entry && entry.connector);
    if (!text) return null;

    // Reject composites / dual families.
    if (
      text.indexOf(' and ') !== -1 ||
      text.indexOf('/') !== -1 ||
      (text.indexOf('mpc') !== -1 && text.indexOf('4') !== -1 && text.indexOf('6') !== -1) ||
      text.indexOf('msoc') !== -1
    ) {
      return null;
    }

    // --- DART ---
    if (text.indexOf('dart') !== -1) {
      var orientation = null;
      if (/right[\s-]*angle|ra\b/.test(text)) orientation = 'right-angle';
      else if (/straight/.test(text)) orientation = 'straight';

      var variant = null;
      var paths = null;
      if (/8[\s-]*port|octal|dart-8/.test(text) || text === 'octal dart') {
        variant = orientation === 'right-angle' ? 'octal-right-angle' : 'octal-straight';
        // Normalize to dart-8 family variant for matching aliases
        if (/octal/.test(text) && !/right|ra\b|straight|8/.test(text.replace('octal', ''))) {
          variant = 'octal';
        }
        if (/8[\s-]*port|octal|dart-8/.test(text)) {
          variant = orientation === 'right-angle' ? 'octal-right-angle' : (/straight/.test(text) ? 'octal-straight' : 'dart-8');
        }
        paths = 8;
      } else if (/4[\s-]*port|dart-4|quad/.test(text)) {
        variant = 'dart-4';
        paths = 4;
      } else if (text === 'dart' || text === 'ra dart') {
        // Ambiguous port count — use lead_count when it is 4 or 8.
        var lc = entry.lead_count;
        if (lc === 4 || lc === 8) {
          paths = lc;
          variant = lc === 8 ? (orientation === 'right-angle' ? 'octal-right-angle' : 'dart-8') : 'dart-4';
        } else {
          return null;
        }
      } else {
        return null;
      }

      return interfaceBase(entry, {
        attachment: 'proprietary_multiport',
        connector_family: 'dart',
        connector_variant: variant,
        gender: null,
        orientation: orientation,
        connector_count: 1,
        physical_lead_count: entry.lead_count == null ? 1 : Number(entry.lead_count),
        rf_path_count: paths,
        bands: bandsOf(entry),
        path_bands: null
      });
    }

    // --- QN ---
    if (/\bqn\b/.test(text)) {
      var qnGender = /female|jack/.test(text) ? 'female' : (/male|plug/.test(text) ? 'male' : null);
      return interfaceBase(entry, {
        connector_family: 'qn',
        connector_variant: null,
        gender: qnGender,
        connector_count: entry.lead_count || 1,
        rf_path_count: entry.lead_count || 1
      });
    }

    // --- RP-TNC ---
    if (/rp[\s-]?tnc|rptnc/.test(text)) {
      var tncGender = /female|jack/.test(text) ? 'female' : (/male|plug/.test(text) ? 'male' : null);
      var tncOrient = /right[\s-]*angle|ra\b/.test(text) ? 'right-angle' : null;
      var tncCount = entry.lead_count || null;
      var countMatch = text.match(/\(x(\d+)\)/);
      if (countMatch) tncCount = Number(countMatch[1]);
      return interfaceBase(entry, {
        connector_family: 'rp-tnc',
        gender: tncGender,
        orientation: tncOrient,
        connector_count: tncCount,
        rf_path_count: tncCount
      });
    }

    // --- RP-SMA ---
    if (/rp[\s-]?sma|rpsma/.test(text) && !/\bsma\b/.test(text.replace(/rp[\s-]?sma|rpsma/g, ''))) {
      var smaGender = /female|jack/.test(text) ? 'female' : (/male|plug/.test(text) ? 'male' : null);
      return interfaceBase(entry, {
        connector_family: 'rp-sma',
        gender: smaGender,
        connector_count: entry.lead_count || null,
        rf_path_count: entry.lead_count || null
      });
    }

    // --- standard SMA (not RP) ---
    if (/\bsma\b/.test(text) && !/rp[\s-]?sma|rpsma/.test(text)) {
      var stdSmaGender = /female|jack/.test(text) ? 'female' : (/male|plug/.test(text) ? 'male' : null);
      return interfaceBase(entry, {
        connector_family: 'sma',
        gender: stdSmaGender,
        connector_count: entry.lead_count || null,
        rf_path_count: entry.lead_count || null
      });
    }

    // --- TNC (not RP) ---
    if (/\btnc\b/.test(text) && !/rp[\s-]?tnc|rptnc/.test(text)) {
      var stdTncGender = /female|jack/.test(text) ? 'female' : (/male|plug/.test(text) ? 'male' : null);
      return interfaceBase(entry, {
        connector_family: 'tnc',
        gender: stdTncGender,
        connector_count: entry.lead_count || null,
        rf_path_count: entry.lead_count || null
      });
    }

    // --- N-type ---
    if (
      text === 'n-style' ||
      text.indexOf('n-style') === 0 ||
      text.indexOf('n male') === 0 ||
      text.indexOf('n female') === 0 ||
      text.indexOf('n plug') === 0 ||
      text.indexOf('n jack') === 0 ||
      text.indexOf('n-male') === 0 ||
      text.indexOf('n-female') === 0 ||
      /^n\b/.test(text)
    ) {
      var nGender = /female|jack/.test(text) ? 'female' : (/male|plug/.test(text) ? 'male' : null);
      var nCount = entry.lead_count || null;
      var nCountMatch = text.match(/\(x(\d+)\)/);
      if (nCountMatch) nCount = Number(nCountMatch[1]);
      var bulkhead = /bulkhead/.test(text);
      return interfaceBase(entry, {
        attachment: bulkhead ? 'bulkhead' : (parseCable(entry).included ? 'pigtail' : 'bulkhead'),
        connector_family: 'n',
        gender: nGender,
        connector_count: nCount,
        rf_path_count: nCount
      });
    }

    return null;
  }

  function ensureStructuredFields(entry) {
    var out = Object.assign({}, entry);
    if (!out.antenna_id) {
      out.antenna_id = makeAntennaId(out.vendor, out.sku);
    }
    if (!Array.isArray(out.rf_interfaces)) {
      var iface = inferRfInterface(out);
      out.rf_interfaces = iface ? [iface] : [];
    }
    // compatibility_claims stay absent unless explicitly authored (legacy lists remain internal).
    return out;
  }

  return {
    makeAntennaId: makeAntennaId,
    inferRfInterface: inferRfInterface,
    ensureStructuredFields: ensureStructuredFields,
    normalizeConnectorText: normalizeConnectorText,
    parseCable: parseCable
  };
});
