// Shared display helpers for antenna bands, gain, and beamwidth.
const FORM_TYPES = ["Omni", "Patch", "High-density patch"];

const BAND_GROUPS = [
  { keys: ["2.4", "2.4GHz"], gain: "2.4", beam: "2.4 GHz" },
  { keys: ["5", "5GHz", "5GHz_full"], gain: "5", beam: "5 GHz" },
  { keys: ["5-lower", "5_low"], gain: "5-lower", beam: "5 GHz lower" },
  { keys: ["5-upper", "5_high", "5GHz_high"], gain: "5-upper", beam: "5 GHz upper" },
  { keys: ["6", "6GHz"], gain: "6", beam: "6 GHz" }
];

function normalizeForSlug(value) {
  if (!value) return "";
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ");
}

function slugifyAntenna(entry) {
  const sku = entry && (entry.sku || entry.model || "");
  const vendor = entry && entry.vendor ? entry.vendor : "";
  return normalizeForSlug(`${vendor} ${sku}`)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function safeUrl(value, options = {}) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const allowRelative = options.allowRelative === true;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw);
  if (!hasScheme) {
    if (!allowRelative || raw.startsWith("//") || raw.includes("\\")) return "";
    return raw;
  }
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch (err) {
    return "";
  }
}

function formatBands(bands) {
  if (Array.isArray(bands)) return bands.map(b => String(b)).join(" / ");
  return bands == null ? "" : String(bands);
}

/** Map a numeric frequency (GHz) to a Wi-Fi band label key. */
function frequencyToBand(n) {
  if (!Number.isFinite(n)) return null;
  if (n >= 2.3 && n <= 2.6) return "2.4";
  if (n >= 4.8 && n < 5.95) return "5";
  if (n >= 5.95 && n <= 7.2) return "6";
  return null;
}

const PATTERN_GHZ = /(\d+(?:\.\d+)?(?:\s*[\/,–—-]\s*\d+(?:\.\d+)?)*)\s*GHz/gi;
const PATTERN_BAND_ORDER = ["2.4", "5", "6"];

/**
 * Simplify radiation-pattern figure captions for display.
 * Collapses mid-band frequency lists to band labels, e.g.
 *   "2.4 / 2.45 / 2.5 GHz Horizontal" → "2.4 GHz Horizontal"
 *   "4.9 / 5.4 / 5.8 GHz Vertical" → "5 GHz Vertical"
 * Already-simple labels (and non-Wi-Fi captions) pass through.
 */

function ghzBandsInText(text) {
  const found = new Set();
  const re = new RegExp(PATTERN_GHZ.source, "gi");
  let match;
  while ((match = re.exec(String(text || "")))) {
    const nums = String(match[1]).match(/\d+(?:\.\d+)?/g) || [];
    nums.forEach(raw => {
      const band = frequencyToBand(Number(raw));
      if (band) found.add(band);
    });
  }
  return PATTERN_BAND_ORDER.filter(band => found.has(band));
}

function formatPatternCaption(label) {
  if (label == null || label === "") return "";
  return String(label).replace(
    new RegExp(PATTERN_GHZ.source, "gi"),
    (match, freqPart) => {
      const nums = String(freqPart).match(/\d+(?:\.\d+)?/g);
      if (!nums || !nums.length) return match;
      const bands = [];
      const seen = new Set();
      nums.forEach(raw => {
        const band = frequencyToBand(Number(raw));
        if (!band || seen.has(band)) return;
        seen.add(band);
        bands.push(band);
      });
      if (!bands.length) return match;
      if (bands.length === 1) return `${bands[0]} GHz`;
      return `${bands.join("/")} GHz`;
    }
  );
}

/**
 * Gallery order for radiation patterns:
 *   band low → high (2.4, then 5, then 6; a multi-band chart stays one image
 *   and sorts by the bands it covers, so 2.4 comes before 2.4/5 before 5 before 5/6 before 6),
 *   then element (1, 2, 3… then A, B, C…; Port / Cable / Slot use the same idea),
 *   then Horizontal, then a combined Horizontal + Vertical chart, then Vertical.
 * Charts with no band stay after banded ones, in their original relative order
 * aside from the plane sort. Duplicate plots of the same band, element, and plane
 * keep the order they were stored in.
 */
function patternPlaneRank(label) {
  const text = String(label || "").toLowerCase();
  const horizontal = /\bhorizontal\b/.test(text);
  const vertical = /\bvertical\b/.test(text);
  if (horizontal && vertical) return 1;
  if (horizontal) return 0;
  if (vertical) return 2;
  return 3;
}

function patternGroupKey(label, url) {
  let rest = String(label || "")
    .replace(new RegExp(PATTERN_GHZ.source, "gi"), " ")
    .replace(/\bhorizontal\b/gi, " ")
    .replace(/\bvertical\b/gi, " ")
    .replace(/\band\b/gi, " ")
    .replace(/[+/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!rest) {
    const fromFile = String(url || "").match(/element-(\d+|[a-z])(?=-|\.)/i);
    if (fromFile) {
      rest = /^\d+$/.test(fromFile[1])
        ? `Element ${Number(fromFile[1])}`
        : `Element ${fromFile[1].toUpperCase()}`;
    }
  }
  return rest;
}

function patternGroupRank(group, firstSeen) {
  const text = String(group || "").trim();
  if (!text) return [2, 0, 0];
  let match = text.match(/^element\s+(\d+)$/i);
  if (match) return [0, 0, Number(match[1])];
  match = text.match(/^element\s+([a-z])$/i);
  if (match) return [0, 1, match[1].toUpperCase().charCodeAt(0)];
  match = text.match(/^(?:port|cable|slot)\s+(\d+)$/i);
  if (match) return [1, 0, Number(match[1])];
  match = text.match(/^(?:port|cable|slot)\s+([a-z])$/i);
  if (match) return [1, 1, match[1].toUpperCase().charCodeAt(0)];
  // Named planes that are not elements (AUX, BLE, a radio, an elevation cut)
  // keep the order they first appear in, so only band and H-before-V move them.
  const seen = firstSeen && firstSeen.get(text.toLowerCase());
  return [3, seen == null ? 0 : seen, 0];
}

function comparePatternRank(a, b) {
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    if (i >= a.length) return -1;
    if (i >= b.length) return 1;
    if (a[i] === b[i]) continue;
    if (typeof a[i] === "number" && typeof b[i] === "number") return a[i] - b[i];
    return String(a[i]).localeCompare(String(b[i]), undefined, { numeric: true, sensitivity: "base" });
  }
  return 0;
}

function comparePatternBands(a, b) {
  if (!a.length && !b.length) return 0;
  if (!a.length) return 1;
  if (!b.length) return -1;
  const length = Math.max(a.length, b.length);
  for (let i = 0; i < length; i++) {
    if (i >= a.length) return -1;
    if (i >= b.length) return 1;
    const diff = PATTERN_BAND_ORDER.indexOf(a[i]) - PATTERN_BAND_ORDER.indexOf(b[i]);
    if (diff) return diff;
  }
  return 0;
}

function patternImageFields(item) {
  if (typeof item === "string") return { label: "", url: item };
  const label = item && item.label != null ? String(item.label) : "";
  const url = item && item.url != null ? String(item.url) : "";
  return { label, url };
}

function comparePatternImages(a, b, firstSeen) {
  const left = patternImageFields(a);
  const right = patternImageFields(b);
  const bandDiff = comparePatternBands(ghzBandsInText(left.label), ghzBandsInText(right.label));
  if (bandDiff) return bandDiff;
  const groupDiff = comparePatternRank(
    patternGroupRank(patternGroupKey(left.label, left.url), firstSeen),
    patternGroupRank(patternGroupKey(right.label, right.url), firstSeen)
  );
  if (groupDiff) return groupDiff;
  return patternPlaneRank(left.label) - patternPlaneRank(right.label);
}

function sortPatternImages(items) {
  if (!Array.isArray(items)) return [];
  const firstSeen = new Map();
  items.forEach((item, index) => {
    const fields = patternImageFields(item);
    const key = patternGroupKey(fields.label, fields.url).toLowerCase();
    if (!firstSeen.has(key)) firstSeen.set(key, index);
  });
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => comparePatternImages(a.item, b.item, firstSeen) || a.index - b.index)
    .map(entry => entry.item);
}

function flatBandParts(obj, kind) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
  if (Object.values(obj).some(item => item && typeof item === "object")) return null;
  const parts = [];
  const used = new Set();
  BAND_GROUPS.forEach(group => {
    const key = group.keys.find(candidate => Object.prototype.hasOwnProperty.call(obj, candidate));
    if (!key) return;
    used.add(key);
    const suffix = kind === "gain" ? " dBi" : "";
    parts.push({
      label: kind === "gain" ? group.gain : group.beam,
      text: `${kind === "gain" ? group.gain : group.beam}: ${obj[key]}${suffix}`
    });
  });
  Object.keys(obj).forEach(key => {
    if (used.has(key) || BAND_GROUPS.some(group => group.keys.includes(key))) return;
    const suffix = kind === "gain" ? " dBi" : "";
    parts.push({ label: key, text: `${key}: ${obj[key]}${suffix}` });
  });
  return parts;
}

function beamPlaneLabel(name) {
  const known = {
    horizontal: "Horizontal",
    vertical: "Vertical",
    h: "Horizontal",
    v: "Vertical"
  };
  if (Object.prototype.hasOwnProperty.call(known, String(name).toLowerCase())) {
    return known[String(name).toLowerCase()];
  }
  return String(name).replace(/[_]+/g, " ").replace(/\b[a-z]/g, c => c.toUpperCase());
}

function formatBandObject(obj, kind) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return "";
  const flat = flatBandParts(obj, kind);
  if (flat) return flat.map(part => part.text).join(", ");
  if (Object.values(obj).some(item => item && typeof item === "object")) {
    return Object.entries(obj).map(([name, bands]) => {
      const inner = formatBandObject(bands, kind);
      const label = kind === "beam" ? beamPlaneLabel(name) : name;
      return inner ? `${label}: ${inner}` : "";
    }).filter(Boolean).join("; ");
  }
  return "";
}

function beamwidthPlaneLines(beamwidth) {
  if (!beamwidth || typeof beamwidth !== "object" || Array.isArray(beamwidth)) return [];
  const names = ["horizontal", "vertical"].filter(name => {
    const value = beamwidth[name];
    return value != null && value !== "";
  });
  if (!names.length) {
    const flat = formatBandObject(beamwidth, "beam");
    return flat ? [flat] : [];
  }
  return names.map(name => {
    const value = beamwidth[name];
    const short = name === "horizontal" ? "H" : "V";
    if (typeof value === "string" || typeof value === "number") return `${short} ${value}`;
    if (!value || typeof value !== "object") return "";
    const order = ["2.4", "5", "6"];
    const vals = order.map(band => value[band]).filter(v => v != null && v !== "");
    if (vals.length) return `${short} ${vals.join("/")}`;
    const inner = formatBandObject(value, "beam");
    return inner ? `${beamPlaneLabel(name)}: ${inner}` : "";
  }).filter(Boolean);
}

function formatBeamwidthCompact(beamwidth) {
  // One line for detail, compare, sort, and CSV. Tables use formatBeamwidthStacked.
  return beamwidthPlaneLines(beamwidth).join(" · ");
}

/** Table display. Break before V so the plane label stays with its beamwidths. */
function formatBeamwidthStacked(beamwidth) {
  return beamwidthPlaneLines(beamwidth).join("\n");
}

function formatGainCompact(gain) {
  if (!gain || typeof gain !== "object") return gain == null ? "" : String(gain);
  const order = ["2.4", "5", "6"];
  const vals = order.map(b => gain[b]).filter(v => v != null && v !== "");
  if (vals.length === order.filter(b => Object.prototype.hasOwnProperty.call(gain, b)).length && vals.length) {
    return vals.join("/") + " dBi";
  }
  return formatBandObject(gain, "gain");
}

function searchBlob(entry) {
  if (!entry || typeof entry !== "object") return "";
  const parts = [
    entry.vendor,
    entry.sku,
    entry.legacy_sku,
    entry.model,
    entry.name,
    entry.form,
    entry.indoor_outdoor,
    entry.connector,
    entry.polarization,
    formatBands(entry.bands),
    entry.frequency_range,
    entry.mount_type,
    entry.ip_rating,
    entry.radome
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    FORM_TYPES,
    normalizeForSlug,
    slugifyAntenna,
    safeUrl,
    formatBands,
    frequencyToBand,
    formatPatternCaption,
    sortPatternImages,
    formatBandObject,
    formatBeamwidthCompact,
    formatBeamwidthStacked,
    formatGainCompact,
    searchBlob
  };
}
