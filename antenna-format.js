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

/**
 * Simplify radiation-pattern figure captions for display.
 * Collapses mid-band frequency lists to band labels, e.g.
 *   "2.4 / 2.45 / 2.5 GHz Horizontal" → "2.4 GHz Horizontal"
 *   "4.9 / 5.4 / 5.8 GHz Vertical" → "5 GHz Vertical"
 * Already-simple labels (and non-Wi-Fi captions) pass through.
 */
function formatPatternCaption(label) {
  if (label == null || label === "") return "";
  return String(label).replace(
    /(\d+(?:\.\d+)?(?:\s*[\/,–—-]\s*\d+(?:\.\d+)?)*)\s*GHz/gi,
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

function formatBeamwidthCompact(beamwidth) {
  if (!beamwidth || typeof beamwidth !== "object") return "";
  // Prefer "H 25/20/20° · V 25/20/20°" when planes share band keys
  const planes = ["horizontal", "vertical"].filter(p => beamwidth[p] && typeof beamwidth[p] === "object");
  if (planes.length) {
    return planes.map(plane => {
      const bands = beamwidth[plane];
      const order = ["2.4", "5", "6"];
      const vals = order.map(b => bands[b]).filter(v => v != null && v !== "");
      if (vals.length) {
        const short = plane === "horizontal" ? "H" : "V";
        return `${short} ${vals.join("/")}`;
      }
      return `${beamPlaneLabel(plane)}: ${formatBandObject(bands, "beam")}`;
    }).join(" · ");
  }
  return formatBandObject(beamwidth, "beam");
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
    formatBandObject,
    formatBeamwidthCompact,
    formatGainCompact,
    searchBlob
  };
}
