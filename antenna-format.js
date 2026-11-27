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

/**
 * Shared URL sanitizer for display and submission paths.
 * Absolute: http(s) only. Relative (opt-in): no scheme, no //, no \, no
 * absolute-root "/", and no ".." path segments (encoded or raw).
 */
function safeUrl(value, options = {}) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  // Reject control characters used to obfuscate schemes (e.g. java\tscript:).
  // eslint-disable-next-line no-control-regex -- matching control characters is the point
  if (/[\u0000-\u001F\u007F]/.test(raw)) return "";
  const allowRelative = options.allowRelative === true;
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw);
  if (!hasScheme) {
    if (!allowRelative) return "";
    if (raw.startsWith("//") || raw.startsWith("/") || raw.includes("\\")) return "";
    // Reject traversal before and after percent-decoding (e.g. %2e%2e).
    let decoded = raw;
    try {
      decoded = decodeURIComponent(raw);
    } catch (err) {
      return "";
    }
    if (
      decoded.includes("\\") ||
      decoded.split(/[/?#]/).some(part => part === "..") ||
      raw.split(/[/?#]/).some(part => part === "..")
    ) {
      return "";
    }
    return raw;
  }
  try {
    const parsed = new URL(raw);
    // Keep the caller’s string when valid so Unicode path segments round-trip
    // unchanged (URL.href would percent-encode them).
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? raw : "";
  } catch (err) {
    return "";
  }
}

/** Allowed same-origin return targets for detail Back links (no open redirects). */
const SAFE_RETURN_PAGES = new Set([
  "index.html",
  "finder.html",
  "compare.html",
  "submit.html",
  "edit.html"
]);

/** sessionStorage key for Browse/Finder → Detail → Back restoration. */
const DETAIL_BACK_STORAGE_KEY = "antennaComparison.detailBack";

/**
 * Validate a relative return path used across Browse/Finder → Detail → Back.
 * Accepts only known HTML pages with a safe query string; rejects schemes,
 * protocol-relative URLs, path traversal, and fragments.
 */
function safeReturnPath(value) {
  const raw = String(value || "").trim();
  if (!raw || raw.includes("\\") || raw.includes("//") || raw.includes("..")) return "";
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("/") || raw.includes("#")) return "";
  const match = raw.match(/^(index|finder|compare|submit|edit)\.html(\?[^#]*)?$/i);
  if (!match) return "";
  const page = `${match[1].toLowerCase()}.html`;
  if (!SAFE_RETURN_PAGES.has(page)) return "";
  const qs = match[2] || "";
  // Allow encoded and raw query characters used by Finder/Browse state
  // (vendors may include "/", spaces as "+" / "%20", etc.).
  if (qs && !/^\?[a-zA-Z0-9._~&=%+\-|,/* ]*$/.test(qs)) return "";
  return page + qs;
}

/** Stash a validated list path so Detail Back can restore filters without a long URL. */
function saveDetailBackPath(path) {
  const safe = safeReturnPath(path);
  if (!safe) return;
  try {
    sessionStorage.setItem(DETAIL_BACK_STORAGE_KEY, safe);
  } catch (_) {
    /* private mode / quota — Back falls back to defaults */
  }
}

/** Read the stashed Detail Back path, or "" if missing/invalid. */
function readDetailBackPath() {
  try {
    return safeReturnPath(sessionStorage.getItem(DETAIL_BACK_STORAGE_KEY) || "");
  } catch (_) {
    return "";
  }
}

/** Short detail URL: antenna.html?id=… only (no return= query). */
function buildAntennaDetailHref(slug) {
  const params = new URLSearchParams();
  params.set("id", String(slug || ""));
  return `antenna.html?${params.toString()}`;
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

const PATTERN_GHZ = /(\d+(?:\.\d+)?(?:\s*[/,–—-]\s*\d+(?:\.\d+)?)*)\s*GHz/gi;
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

/**
 * Per-port pattern grouping for the detail page.
 *
 * Some datasheets publish one H and one V plot for every port (Cisco C-ANT9101
 * has 30). The detail page shows one port at a time with chips to switch.
 * A plot belongs to a port when its label (minus band and plane words) is
 * "Port A", "Element 1", "Lead 2", "Cable 3", "AUX" or "BLE". Anything else
 * (a combined chart, a downtilt cut, a named radio) is shared and always shown.
 *
 * Returns null when there are fewer than two ports, or when the whole set is
 * small enough to show at once (minItems, default 7), so ordinary antennas
 * keep the plain gallery.
 */
const PATTERN_PORT_RE = /^(?:(port|element|lead|cable)\s+([a-z0-9]+)|(aux|ble))$/i;

function patternPortKey(label, url) {
  const group = patternGroupKey(label, url);
  const match = String(group || "").match(PATTERN_PORT_RE);
  if (!match) return "";
  if (match[3]) return match[3].toUpperCase();
  const kind = match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
  const id = /^\d+$/.test(match[2]) ? String(Number(match[2])) : match[2].toUpperCase();
  return `${kind} ${id}`;
}

function patternPortOrder(key) {
  if (key === "AUX") return [1, 0];
  if (key === "BLE") return [1, 1];
  const id = key.split(" ")[1] || "";
  return /^\d+$/.test(id) ? [0, Number(id)] : [0, 1000 + id.charCodeAt(0)];
}

function groupPatternsByPort(items, options) {
  const minItems = options && options.minItems != null ? options.minItems : 7;
  if (!Array.isArray(items) || items.length < minItems) return null;
  const ordered = sortPatternImages(items);
  const ports = [];
  const byKey = new Map();
  const shared = [];
  ordered.forEach(item => {
    const fields = patternImageFields(item);
    const key = patternPortKey(fields.label, fields.url);
    if (!key) {
      shared.push(item);
      return;
    }
    if (!byKey.has(key)) {
      const group = { key, label: key, items: [], bands: new Set() };
      byKey.set(key, group);
      ports.push(group);
    }
    const group = byKey.get(key);
    group.items.push(item);
    ghzBandsInText(fields.label).forEach(band => group.bands.add(band));
  });
  if (ports.length < 2) return null;
  ports.sort((a, b) => comparePatternRank(patternPortOrder(a.key), patternPortOrder(b.key)));
  // Default to the port with the most bands (Cisco Port A is 5 GHz only while
  // Port E carries 2.4 and 5); ties keep datasheet order.
  let best = ports[0];
  ports.forEach(group => {
    // ties keep chip order
    if (group.bands.size > best.bands.size) best = group;
  });
  return {
    ports: ports.map(group => ({
      key: group.key,
      label: group.label,
      items: group.items,
      bands: PATTERN_BAND_ORDER.filter(band => group.bands.has(band))
    })),
    shared,
    defaultKey: best.key
  };
}

/**
 * Install environment for display. The field is Indoor / Outdoor /
 * Indoor/Outdoor, or null when the datasheet does not say.
 */
function formatEnvironment(value) {
  const v = value == null ? "" : String(value).trim();
  return v || "Not specified";
}

/**
 * AP Comparison detail slug: mirrors slugify(`${vendor} ${model}`) in
 * apcomparison.com index.html / ap.html, so "Cisco Meraki" + "CW9163E"
 * becomes "cisco-meraki-cw9163e" (ap.html?id=cisco-meraki-cw9163e).
 */
function apComparisonSlug(vendor, model) {
  return `${vendor || ""} ${model || ""}`
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const AP_COMPARISON_BASE = "https://apcomparison.com";

function apComparisonDetailUrl(profile) {
  const slug = apComparisonSlug(profile && profile.vendor, profile && profile.model);
  return slug ? `${AP_COMPARISON_BASE}/ap.html?id=${encodeURIComponent(slug)}` : AP_COMPARISON_BASE;
}

/**
 * Label for legacy_sku, which holds a vendor's alternate number:
 * the former AccelTex part number for AccelTex / Hubbell, the Ventev/Tessco
 * SKU for Ventev (whose primary sku is the manufacturer part number).
 */
function altSkuLabel(entry) {
  const vendor = String((entry && entry.vendor) || "").toLowerCase();
  if (vendor.includes("acceltex")) return "Former AccelTex part number";
  if (vendor === "ventev") return "Ventev SKU";
  return "Alternate part number";
}

/**
 * Find an antenna by detail-page id. Ids are slugifyAntenna(vendor + sku);
 * an id built from the alternate number (legacy_sku) also resolves, so links
 * made before a vendor's primary number changed (e.g. ventev-610484) keep
 * working. Returns { entry, canonical } where canonical is false for a
 * legacy-id match.
 */
function findAntennaById(data, id) {
  if (!Array.isArray(data) || !id) return null;
  const direct = data.find(e => slugifyAntenna(e) === id);
  if (direct) return { entry: direct, canonical: true };
  const legacy = data.find(e => e && e.legacy_sku &&
    slugifyAntenna({ vendor: e.vendor, sku: e.legacy_sku }) === id);
  return legacy ? { entry: legacy, canonical: false } : null;
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

/**
 * Build a datasheet action link with a text-only label.
 * Catalog-controlled labels must never be parsed as HTML.
 */
function createDatasheetActionLink(doc, sheet) {
  if (!doc || !sheet) return null;
  const href = safeUrl(sheet.url);
  if (!href) return null;
  const a = doc.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.className = "btn-inline-action";
  const span = doc.createElement("span");
  span.textContent = sheet.label || "Datasheet";
  a.appendChild(span);
  return a;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    FORM_TYPES,
    normalizeForSlug,
    slugifyAntenna,
    safeUrl,
    safeReturnPath,
    DETAIL_BACK_STORAGE_KEY,
    saveDetailBackPath,
    readDetailBackPath,
    buildAntennaDetailHref,
    createDatasheetActionLink,
    formatBands,
    frequencyToBand,
    formatPatternCaption,
    sortPatternImages,
    patternPortKey,
    groupPatternsByPort,
    formatEnvironment,
    apComparisonSlug,
    altSkuLabel,
    findAntennaById,
    apComparisonDetailUrl,
    formatBandObject,
    formatBeamwidthCompact,
    formatBeamwidthStacked,
    formatGainCompact,
    searchBlob
  };
}
