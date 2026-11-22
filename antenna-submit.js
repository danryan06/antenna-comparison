// Shared helpers for the public edit and submit forms.
// Maintainer-only keys are stripped before a submission is shown or filed.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const GITHUB_USER = 'danryan06';
  const GITHUB_REPO = 'antenna-comparison';
  const STANDARD_BANDS = ['2.4', '5', '6'];
  const BAND_KEY_ORDER = ['2.4', '5-lower', '5', '5-upper', '6', 'GPS', 'LTE', 'WiFi'];
  const FORMS = ['Omni', 'Patch', 'High-density patch'];
  const DIMENSION_KINDS = ['mechanical', 'mechanical_drawing', 'assembly', 'assembly_render'];
  const MEDIA_KINDS = ['photo', 'pattern', 'assembly_render', 'mechanical_drawing'];
  const ENVIRONMENTS = ['Indoor', 'Outdoor', 'Indoor/Outdoor'];
  const PRIVATE_KEYS = [
    'internal_notes',
    'field_notes',
    'compatible_aps',
    'compatibleAPs',
    'compatible_ap_list'
  ];
  const PUBLIC_KEYS = [
    'antenna_id', 'vendor', 'sku', 'legacy_sku', 'name', 'form', 'indoor_outdoor',
    'bands', 'frequency_range', 'gain_dbi', 'beamwidth', 'connector',
    'lead_count', 'polarization', 'cable_length', 'cable_type', 'dimensions',
    'weight', 'ip_rating', 'radome', 'mount_type', 'included_parts',
    'wind_rating', 'vswr', 'isolation', 'operating_temp', 'image_url',
    'images', 'pattern_images', 'dimension_image_url', 'dimension_image_kind',
    'datasheet_urls', 'sources', 'rf_interfaces', 'compatibility_claims'
  ];
  // Structured compatibility fields are public in the catalog but not editable via
  // the GitHub issue form. Preserve them on edit merges so submissions cannot wipe them.
  const PRESERVE_FROM_BASE = ['antenna_id', 'rf_interfaces', 'compatibility_claims'];

  function trim(value) {
    return String(value == null ? '' : value).trim();
  }

  function isPrivateKey(key) {
    return PRIVATE_KEYS.indexOf(key) !== -1;
  }

  function stripPrivateFields(entry) {
    const out = {};
    if (!entry || typeof entry !== 'object') return out;
    Object.keys(entry).forEach(key => {
      if (isPrivateKey(key)) return;
      out[key] = entry[key];
    });
    return out;
  }

  // Allowlisted public catalog entry for Pages. Unknown keys and maintainer-only
  // fields are dropped so the deployed JSON cannot carry private notes.
  function toPublicCatalogEntry(entry) {
    const out = {};
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return out;
    PUBLIC_KEYS.forEach(key => {
      if (Object.prototype.hasOwnProperty.call(entry, key)) out[key] = entry[key];
    });
    PRIVATE_KEYS.forEach(key => {
      delete out[key];
    });
    return out;
  }

  function findPrivateCatalogKeys(entry) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    return Object.keys(entry).filter(key => isPrivateKey(key));
  }

  function numericOrString(raw) {
    const text = trim(raw);
    if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
    return text;
  }

  function emptyValue(value) {
    if (value == null || value === '') return true;
    if (Array.isArray(value) && value.length === 0) return true;
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return true;
    return false;
  }

  function sanitizeHttpUrl(value) {
    const raw = trim(value);
    if (!raw) return '';
    try {
      const parsed = new URL(raw);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
      return raw;
    } catch (err) {
      return '';
    }
  }

  function sanitizeAssetUrl(value) {
    const raw = trim(value);
    if (!raw) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return sanitizeHttpUrl(raw);
    if (raw.startsWith('//') || raw.startsWith('/') || raw.includes('\\') || raw.includes('..')) return '';
    return raw;
  }

  function splitList(text) {
    return trim(text).split(/[,;\n]/).map(part => part.trim()).filter(Boolean);
  }

  function parseGainLines(text) {
    const gain = {};
    String(text || '').split('\n').forEach(line => {
      const match = line.trim().match(/^([^:]+):\s*(.+)$/);
      if (!match) return;
      const key = match[1].trim();
      if (!key) return;
      gain[key] = numericOrString(match[2]);
    });
    return gain;
  }

  function formatGainLines(gain) {
    if (!gain || typeof gain !== 'object') return '';
    return Object.keys(gain)
      .filter(key => STANDARD_BANDS.indexOf(key) === -1)
      .map(key => key + ': ' + gain[key])
      .join('\n');
  }

  function formatParts(parts) {
    if (!Array.isArray(parts)) return '';
    return parts.map(part => {
      if (!part || !part.item) return '';
      const pn = part.part_number == null ? '' : String(part.part_number);
      const qty = part.qty == null ? '' : String(part.qty);
      return [part.item, pn, qty].join(' | ');
    }).filter(Boolean).join('\n');
  }

  function parseParts(text) {
    return String(text || '').split('\n').map(line => line.trim()).filter(Boolean).map(line => {
      const parts = line.split('|').map(piece => piece.trim());
      const item = parts[0] || '';
      if (!item) return null;
      const partNumber = parts.length > 1 ? (parts[1] ? parts[1] : null) : null;
      let qty = 1;
      if (parts.length > 2) {
        if (parts[2] === '') qty = null;
        else qty = /^\d+$/.test(parts[2]) ? Number(parts[2]) : parts[2];
      }
      return { item: item, part_number: partNumber, qty: qty };
    }).filter(Boolean);
  }

  function formatLabeled(items) {
    if (!Array.isArray(items)) return '';
    return items.map(item => {
      if (!item || !item.url) return '';
      const kind = item.kind ? String(item.kind) : '';
      if (kind) return [item.label || '', item.url, kind].join(' | ');
      return (item.label ? item.label + ' | ' : '') + item.url;
    }).filter(Boolean).join('\n');
  }

  function parseLabeled(text, options) {
    const allowRelative = !options || options.allowRelative !== false;
    return String(text || '').split('\n').map(line => line.trim()).filter(Boolean).map(line => {
      const parts = line.split('|').map(piece => piece.trim());
      let label = '';
      let rawUrl = '';
      let kind = '';
      if (parts.length <= 1) {
        rawUrl = parts[0] || '';
      } else if (parts.length === 2) {
        label = parts[0];
        rawUrl = parts[1];
      } else {
        label = parts[0];
        kind = parts[parts.length - 1];
        if (MEDIA_KINDS.indexOf(kind) === -1) {
          rawUrl = parts.slice(1).join('|').trim();
          kind = '';
        } else {
          rawUrl = parts.slice(1, -1).join('|').trim();
        }
      }
      const url = allowRelative ? sanitizeAssetUrl(rawUrl) : sanitizeHttpUrl(rawUrl);
      if (!url) return null;
      const row = {};
      if (label) row.label = label;
      row.url = url;
      if (kind) row.kind = kind;
      return row;
    }).filter(Boolean);
  }

  function formatSources(sources) {
    if (!Array.isArray(sources)) return '';
    return sources.map(src => {
      if (!src) return '';
      const label = src.label || '';
      const id = src.id || '';
      const url = src.url || '';
      const note = src.note || '';
      const lastChecked = src.last_checked || '';
      if (!label && !id && !url) return '';
      const parts = [label, id, url];
      if (lastChecked) {
        parts.push(note || '');
        parts.push(lastChecked);
      } else if (note) {
        parts.push(note);
      }
      return parts.join(' | ');
    }).filter(Boolean).join('\n');
  }

  function parseSources(text) {
    return String(text || '').split('\n').map(line => line.trim()).filter(Boolean).map(line => {
      if (line.indexOf('|') === -1) {
        const url = sanitizeHttpUrl(line);
        return url ? { label: 'Datasheet', url: url } : null;
      }
      const parts = line.split('|').map(piece => piece.trim());
      const src = {};
      if (parts[0]) src.label = parts[0];
      if (parts[1]) src.id = parts[1];
      if (parts.length > 2) {
        src.url = parts[2] ? (sanitizeHttpUrl(parts[2]) || null) : null;
      }
      const dateRe = /^\d{4}-\d{2}-\d{2}$/;
      if (parts.length >= 5 && dateRe.test(parts[4])) {
        if (parts[3]) src.note = parts[3];
        src.last_checked = parts[4];
      } else if (parts[3] && dateRe.test(parts[3]) && !parts[4]) {
        src.last_checked = parts[3];
      } else if (parts[3]) {
        src.note = parts[3];
      }
      if (!src.label && !src.id && !src.url) return null;
      return src;
    }).filter(Boolean);
  }

  function entryToFormFields(entry) {
    const source = entry || {};
    const bands = Array.isArray(source.bands) ? source.bands.map(band => String(band)) : [];
    const gain = source.gain_dbi && typeof source.gain_dbi === 'object' ? source.gain_dbi : {};
    const beam = source.beamwidth && typeof source.beamwidth === 'object' ? source.beamwidth : {};
    const horizontal = beam.horizontal;
    const vertical = beam.vertical;
    const horizontalMap = horizontal && typeof horizontal === 'object' ? horizontal : {};
    const verticalMap = vertical && typeof vertical === 'object' ? vertical : {};
    const gainFields = {};
    const beamFields = {};
    STANDARD_BANDS.forEach(band => {
      gainFields[band] = gain[band] == null ? '' : String(gain[band]);
      beamFields[band] = {
        h: horizontalMap[band] == null ? '' : String(horizontalMap[band]),
        v: verticalMap[band] == null ? '' : String(verticalMap[band])
      };
    });
    const extraBeamKeys = [];
    Object.keys(horizontalMap).concat(Object.keys(verticalMap)).forEach(key => {
      if (STANDARD_BANDS.indexOf(key) === -1 && extraBeamKeys.indexOf(key) === -1) extraBeamKeys.push(key);
    });
    return {
      vendor: source.vendor || '',
      sku: source.sku || '',
      legacy_sku: source.legacy_sku || '',
      name: source.name || '',
      form: source.form || '',
      indoor_outdoor: source.indoor_outdoor || '',
      bands: bands.filter(band => STANDARD_BANDS.indexOf(band) !== -1),
      other_bands: bands.filter(band => STANDARD_BANDS.indexOf(band) === -1).join(', '),
      frequency_range: source.frequency_range || '',
      gain: gainFields,
      other_gain: formatGainLines(gain),
      beam: beamFields,
      other_beam: extraBeamKeys.map(key => {
        const h = horizontalMap[key] == null ? '' : String(horizontalMap[key]);
        const v = verticalMap[key] == null ? '' : String(verticalMap[key]);
        return key + ' | ' + h + ' | ' + v;
      }).join('\n'),
      beam_scalar_h: typeof horizontal === 'string' || typeof horizontal === 'number' ? String(horizontal) : '',
      beam_scalar_v: typeof vertical === 'string' || typeof vertical === 'number' ? String(vertical) : '',
      beam_empty_h: horizontal && typeof horizontal === 'object' && !Object.keys(horizontal).length ? '1' : '',
      beam_empty_v: vertical && typeof vertical === 'object' && !Object.keys(vertical).length ? '1' : '',
      connector: source.connector || '',
      lead_count: source.lead_count == null ? '' : String(source.lead_count),
      polarization: source.polarization || '',
      cable_length: source.cable_length || '',
      cable_type: source.cable_type || '',
      dimensions: source.dimensions || '',
      weight: source.weight || '',
      ip_rating: source.ip_rating || '',
      radome: source.radome || '',
      mount_type: source.mount_type || '',
      included_parts_text: formatParts(source.included_parts),
      wind_rating: source.wind_rating || '',
      vswr: source.vswr || '',
      isolation: source.isolation || '',
      operating_temp: source.operating_temp || '',
      image_url: source.image_url || '',
      images_text: formatLabeled(source.images),
      pattern_images_text: formatLabeled(source.pattern_images),
      dimension_image_url: source.dimension_image_url || '',
      dimension_image_kind: DIMENSION_KINDS.indexOf(source.dimension_image_kind) === -1 ? '' : source.dimension_image_kind,
      datasheet_text: formatLabeled(source.datasheet_urls),
      sources_text: formatSources(source.sources)
    };
  }

  function buildBands(fields) {
    const selected = Array.isArray(fields.bands) ? fields.bands : [];
    const bands = STANDARD_BANDS.filter(band => selected.indexOf(band) !== -1);
    splitList(fields.other_bands).forEach(band => {
      if (bands.indexOf(band) === -1) bands.push(band);
    });
    return bands;
  }

  function buildGain(fields) {
    const gain = {};
    const typed = fields.gain || {};
    STANDARD_BANDS.forEach(band => {
      const raw = trim(typed[band]);
      if (raw) gain[band] = numericOrString(raw);
    });
    const extra = parseGainLines(fields.other_gain);
    Object.keys(extra).forEach(key => {
      gain[key] = extra[key];
    });
    return gain;
  }

  function buildBeamwidth(fields) {
    const horizontal = {};
    const vertical = {};
    const typed = fields.beam || {};
    STANDARD_BANDS.forEach(band => {
      const cell = typed[band] || {};
      const h = trim(cell.h);
      const v = trim(cell.v);
      if (h) horizontal[band] = h;
      if (v) vertical[band] = v;
    });
    String(fields.other_beam || '').split('\n').forEach(line => {
      const parts = line.trim().split('|').map(piece => piece.trim());
      if (!parts[0]) return;
      if (parts[1]) horizontal[parts[0]] = parts[1];
      if (parts[2]) vertical[parts[0]] = parts[2];
    });
    function plane(map, keepEmpty) {
      if (Object.keys(map).length) return map;
      if (keepEmpty === '1' || keepEmpty === true) return {};
      return null;
    }
    const horizontalPlane = plane(horizontal, fields.beam_empty_h);
    const verticalPlane = plane(vertical, fields.beam_empty_v);
    if (horizontalPlane || verticalPlane) {
      const beam = {};
      if (horizontalPlane) beam.horizontal = horizontalPlane;
      if (verticalPlane) beam.vertical = verticalPlane;
      return beam;
    }
    const scalarH = trim(fields.beam_scalar_h);
    const scalarV = trim(fields.beam_scalar_v);
    const beam = {};
    if (scalarH) beam.horizontal = scalarH;
    if (scalarV) beam.vertical = scalarV;
    return beam;
  }

  function buildAntennaEntry(fields, baseEntry) {
    const input = fields || {};
    const leadRaw = trim(input.lead_count);
    const values = {
      vendor: trim(input.vendor),
      sku: trim(input.sku),
      legacy_sku: trim(input.legacy_sku),
      name: trim(input.name),
      form: trim(input.form),
      indoor_outdoor: trim(input.indoor_outdoor),
      bands: buildBands(input),
      frequency_range: trim(input.frequency_range),
      gain_dbi: buildGain(input),
      beamwidth: buildBeamwidth(input),
      connector: trim(input.connector),
      lead_count: leadRaw === '' ? '' : numericOrString(leadRaw),
      polarization: trim(input.polarization),
      cable_length: trim(input.cable_length),
      cable_type: trim(input.cable_type),
      dimensions: trim(input.dimensions),
      weight: trim(input.weight),
      ip_rating: trim(input.ip_rating),
      radome: trim(input.radome),
      mount_type: trim(input.mount_type),
      included_parts: parseParts(input.included_parts_text),
      wind_rating: trim(input.wind_rating),
      vswr: trim(input.vswr),
      isolation: trim(input.isolation),
      operating_temp: trim(input.operating_temp),
      image_url: sanitizeAssetUrl(input.image_url),
      images: parseLabeled(input.images_text),
      pattern_images: parseLabeled(input.pattern_images_text),
      dimension_image_url: sanitizeAssetUrl(input.dimension_image_url),
      dimension_image_kind: DIMENSION_KINDS.indexOf(trim(input.dimension_image_kind)) === -1 ? '' : trim(input.dimension_image_kind),
      datasheet_urls: parseLabeled(input.datasheet_text, { allowRelative: false }),
      sources: parseSources(input.sources_text)
    };

    const result = {};
    if (baseEntry && typeof baseEntry === 'object') {
      Object.keys(baseEntry).forEach(key => {
        if (isPrivateKey(key) || PUBLIC_KEYS.indexOf(key) !== -1) return;
        result[key] = baseEntry[key];
      });
      PRESERVE_FROM_BASE.forEach(key => {
        if (Object.prototype.hasOwnProperty.call(baseEntry, key) && !emptyValue(baseEntry[key])) {
          result[key] = baseEntry[key];
        }
      });
    }
    PUBLIC_KEYS.forEach(key => {
      if (PRESERVE_FROM_BASE.indexOf(key) !== -1) return;
      if (emptyValue(values[key])) return;
      result[key] = values[key];
    });
    PRIVATE_KEYS.forEach(key => {
      delete result[key];
    });
    return result;
  }

  function validateSubmission(entry) {
    const errors = [];
    if (!entry || !trim(entry.vendor)) errors.push('Vendor is required.');
    if (!entry || !trim(entry.sku)) errors.push('SKU is required.');
    if (!entry || FORMS.indexOf(entry.form) === -1) {
      errors.push('Form factor must be Omni, Patch, or High-density patch.');
    }
    if (!entry || !Array.isArray(entry.bands) || !entry.bands.length) {
      errors.push('Select at least one band.');
    }
    if (!entry || !entry.gain_dbi || !Object.keys(entry.gain_dbi).length) {
      errors.push('Enter gain for at least one band.');
    }
    if (!entry || !entry.beamwidth || !Object.keys(entry.beamwidth).length) {
      errors.push('Enter a beamwidth.');
    }
    if (!entry || !trim(entry.connector)) errors.push('Connector is required.');
    const sheets = entry && Array.isArray(entry.datasheet_urls) ? entry.datasheet_urls : [];
    const sources = entry && Array.isArray(entry.sources) ? entry.sources : [];
    const hasLink = sheets.some(sheet => sheet && sanitizeHttpUrl(sheet.url)) ||
      sources.some(source => source && sanitizeHttpUrl(source.url));
    if (!hasLink) errors.push('Add at least one http(s) datasheet or source URL.');
    return errors;
  }

  function submissionSlug(vendor, sku) {
    return trim(vendor).toLowerCase().replace(/\s+/g, ' ') + '|' + trim(sku).toLowerCase();
  }

  function buildIssue(options) {
    const kind = options && options.kind === 'edit' ? 'edit' : 'new';
    const vendor = trim(options && options.vendor);
    const sku = trim(options && options.sku);
    const json = options && options.json ? String(options.json) : '';
    const title = (kind === 'edit' ? 'Edit Antenna: ' : 'New Antenna: ') + (vendor + ' ' + sku).trim();
    const lines = [];
    if (kind === 'edit') {
      lines.push('Requested edit for antenna via antennacomparison.com');
      if (options.existingLabel) lines.push('Requested edit for: ' + options.existingLabel);
    } else {
      lines.push('New antenna submission via antennacomparison.com');
    }
    lines.push(
      '',
      'JSON entry (do not edit unless you know what you\'re doing):',
      '',
      '```json',
      json,
      '```',
      '',
      kind === 'edit' ? 'Submitted via on-site edit form.' : 'Submitted via on-site form.'
    );
    return { title: title, body: lines.join('\n') };
  }

  function githubIssueUrl(title, body) {
    return 'https://github.com/' + GITHUB_USER + '/' + GITHUB_REPO +
      '/issues/new?title=' + encodeURIComponent(title) +
      '&body=' + encodeURIComponent(body);
  }

  function isBandMap(value) {
    const keys = Object.keys(value);
    if (!keys.length) return false;
    return keys.every(key => BAND_KEY_ORDER.indexOf(key) !== -1 || /^\d/.test(key));
  }

  function keysFor(value) {
    const keys = Object.keys(value);
    if (!isBandMap(value)) return keys;
    const preferred = BAND_KEY_ORDER.filter(key => Object.prototype.hasOwnProperty.call(value, key));
    const rest = keys.filter(key => BAND_KEY_ORDER.indexOf(key) === -1);
    return preferred.concat(rest);
  }

  function pad(depth) {
    return '  '.repeat(depth);
  }

  function stringifyValue(value, depth) {
    if (value === null) return 'null';
    const type = typeof value;
    if (type === 'number') return Number.isFinite(value) ? String(value) : 'null';
    if (type === 'boolean') return value ? 'true' : 'false';
    if (type === 'string') return JSON.stringify(value);
    if (Array.isArray(value)) {
      if (!value.length) return '[]';
      const inner = value.map(item => pad(depth + 1) + stringifyValue(item, depth + 1)).join(',\n');
      return '[\n' + inner + '\n' + pad(depth) + ']';
    }
    if (type === 'object') {
      const keys = keysFor(value);
      if (!keys.length) return '{}';
      const inner = keys.map(key => {
        return pad(depth + 1) + JSON.stringify(key) + ': ' + stringifyValue(value[key], depth + 1);
      }).join(',\n');
      return '{\n' + inner + '\n' + pad(depth) + '}';
    }
    return 'null';
  }

  function escapeNonAscii(text) {
    return text.replace(/[^\n\r\t\x20-\x7e]/g, ch => {
      const cp = ch.codePointAt(0);
      return '\\u' + cp.toString(16).padStart(4, '0');
    });
  }

  function formatAntennaJson(entry, options) {
    const escapeUnicode = options && options.escapeUnicode === true;
    const text = stringifyValue(entry, 0);
    return escapeUnicode ? escapeNonAscii(text) : text;
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(key => {
      if (key === 'className') node.className = attrs[key];
      else if (key === 'text') node.textContent = attrs[key];
      else node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(child => {
      if (child) node.appendChild(child);
    });
    return node;
  }

  function fieldRow(id, label, control, hint) {
    const row = el('div', { className: 'form-row' });
    row.appendChild(el('label', { for: id, text: label }));
    control.id = id;
    row.appendChild(control);
    if (hint) row.appendChild(el('p', { className: 'hint', text: hint }));
    return row;
  }

  function textInput(placeholder) {
    const input = document.createElement('input');
    input.type = 'text';
    if (placeholder) input.placeholder = placeholder;
    return input;
  }

  function renderAntennaForm(root) {
    root.innerHTML = '';

    const identity = el('div', { className: 'form-section' }, [
      el('h3', { text: 'Identity' }),
      el('p', { className: 'hint', text: 'Primary SKU is the catalog number visitors see. Legacy SKU is the older alias, when there is one.' })
    ]);
    identity.appendChild(fieldRow('vendor', 'Vendor', textInput('AccelTex / Hubbell, Ventev, Cisco…')));
    identity.appendChild(fieldRow('sku', 'SKU', textInput('ATS-03414')));
    identity.appendChild(fieldRow('legacy_sku', 'Legacy SKU', textInput('ATS-OHDP-2456-14-8RPSP-36')));
    identity.appendChild(fieldRow('name', 'Name', textInput('Short product name')));
    const formSelect = el('select');
    formSelect.appendChild(el('option', { value: '', text: 'Select form factor' }));
    FORMS.forEach(form => formSelect.appendChild(el('option', { value: form, text: form })));
    identity.appendChild(fieldRow('form', 'Form factor', formSelect));
    const envSelect = el('select');
    envSelect.appendChild(el('option', { value: '', text: 'Select indoor / outdoor' }));
    ENVIRONMENTS.forEach(env => envSelect.appendChild(el('option', { value: env, text: env })));
    identity.appendChild(fieldRow('indoor_outdoor', 'Indoor / outdoor', envSelect));
    root.appendChild(identity);

    const radio = el('div', { className: 'form-section' }, [
      el('h3', { text: 'Radio' }),
      el('p', { className: 'hint', text: 'Gain is dBi. Beamwidth is per band, horizontal then vertical. Use the single-value fields only when the datasheet gives one beamwidth for the whole antenna.' })
    ]);
    const bandRow = el('div', { className: 'form-row' });
    bandRow.appendChild(el('span', { text: 'Bands' }));
    const bandOptions = el('div', { className: 'antenna-type-options', id: 'band-options' });
    STANDARD_BANDS.forEach(band => {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.name = 'band';
      box.value = band;
      box.id = 'band-' + band.replace('.', '-');
      const label = el('label', { text: band + ' GHz' });
      label.insertBefore(box, label.firstChild);
      bandOptions.appendChild(label);
    });
    bandRow.appendChild(bandOptions);
    radio.appendChild(bandRow);
    radio.appendChild(fieldRow('other-bands', 'Other bands', textInput('GPS, LTE'), 'Comma-separated. Use this for non-Wi-Fi bands.'));
    radio.appendChild(fieldRow('frequency_range', 'Frequency range', textInput('2.4-2.48/5.15-5.85/6-7.125 GHz')));

    const gainRow = el('div', { className: 'form-row' });
    gainRow.appendChild(el('span', { text: 'Gain (dBi)' }));
    const gainGrid = el('div', { className: 'band-grid' });
    STANDARD_BANDS.forEach(band => {
      const input = textInput('14');
      input.id = 'gain-' + band.replace('.', '-');
      input.setAttribute('inputmode', 'decimal');
      const wrap = el('label', { className: 'hint', text: band + ' GHz' });
      wrap.appendChild(input);
      gainGrid.appendChild(wrap);
    });
    gainRow.appendChild(gainGrid);
    radio.appendChild(gainRow);
    const otherGain = document.createElement('textarea');
    otherGain.placeholder = 'GPS: 25\nLTE: 3';
    radio.appendChild(fieldRow('other-gain', 'Other gain', otherGain, 'One extra band per line, as Band: value.'));

    const beamRow = el('div', { className: 'form-row' });
    beamRow.appendChild(el('span', { text: 'Beamwidth' }));
    const table = document.createElement('table');
    table.className = 'beam-table';
    const head = document.createElement('tr');
    head.appendChild(el('th', { text: '' }));
    STANDARD_BANDS.forEach(band => head.appendChild(el('th', { text: band + ' GHz' })));
    const thead = document.createElement('thead');
    thead.appendChild(head);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    [['h', 'Horizontal'], ['v', 'Vertical']].forEach(pair => {
      const tr = document.createElement('tr');
      tr.appendChild(el('th', { text: pair[1] }));
      STANDARD_BANDS.forEach(band => {
        const td = document.createElement('td');
        const input = textInput('25°');
        input.id = 'bw-' + pair[0] + '-' + band.replace('.', '-');
        td.appendChild(input);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    beamRow.appendChild(table);
    const emptyH = document.createElement('input');
    emptyH.type = 'hidden';
    emptyH.id = 'bw-empty-h';
    const emptyV = document.createElement('input');
    emptyV.type = 'hidden';
    emptyV.id = 'bw-empty-v';
    beamRow.appendChild(emptyH);
    beamRow.appendChild(emptyV);
    radio.appendChild(beamRow);
    const otherBeam = document.createElement('textarea');
    otherBeam.placeholder = 'GPS | 360° | 90°';
    radio.appendChild(fieldRow('other-beam', 'Other beamwidth', otherBeam, 'One band per line: band | horizontal | vertical.'));
    const scalar = el('div', { className: 'band-grid' });
    const scalarH = textInput('360°');
    scalarH.id = 'bw-h-scalar';
    const scalarV = textInput('90°');
    scalarV.id = 'bw-v-scalar';
    const scalarHWrap = el('label', { className: 'hint', text: 'Horizontal (single value)' });
    scalarHWrap.appendChild(scalarH);
    const scalarVWrap = el('label', { className: 'hint', text: 'Vertical (single value)' });
    scalarVWrap.appendChild(scalarV);
    scalar.appendChild(scalarHWrap);
    scalar.appendChild(scalarVWrap);
    const scalarRow = el('div', { className: 'form-row' });
    scalarRow.appendChild(scalar);
    radio.appendChild(scalarRow);

    radio.appendChild(fieldRow('connector', 'Connector', textInput('RPSMA, N-Style Plug')));
    const lead = textInput('8');
    lead.setAttribute('inputmode', 'numeric');
    radio.appendChild(fieldRow('lead_count', 'Lead count', lead));
    radio.appendChild(fieldRow('polarization', 'Polarization', textInput('4 Vertical, 4 Horizontal')));
    radio.appendChild(fieldRow('vswr', 'VSWR', textInput('<1.5:1 (max 2.0)')));
    radio.appendChild(fieldRow('isolation', 'Isolation', textInput('>30 dB')));
    root.appendChild(radio);

    const mechanical = el('div', { className: 'form-section' }, [
      el('h3', { text: 'Cable and mechanical' })
    ]);
    mechanical.appendChild(fieldRow('cable_length', 'Cable length', textInput('36 in (910 mm)')));
    mechanical.appendChild(fieldRow('cable_type', 'Cable type', textInput('ATS-200')));
    mechanical.appendChild(fieldRow('dimensions', 'Dimensions', textInput('24 × 24 × 1.6 in')));
    mechanical.appendChild(fieldRow('weight', 'Weight', textInput('2.5 lb (0.68 kg)')));
    mechanical.appendChild(fieldRow('ip_rating', 'IP rating', textInput('IP67')));
    mechanical.appendChild(fieldRow('radome', 'Radome', textInput('ASA')));
    mechanical.appendChild(fieldRow('mount_type', 'Mount / install type', textInput('Flush mount or articulating wall/pole mount')));
    const parts = document.createElement('textarea');
    parts.placeholder = 'Articulating wall/pole mount | | 1';
    mechanical.appendChild(fieldRow('included-parts', 'Included parts', parts, 'One part per line: item | part number | qty. Leave the part number blank if there is none.'));
    mechanical.appendChild(fieldRow('wind_rating', 'Wind rating', textInput('134 mph (216 km/h)')));
    mechanical.appendChild(fieldRow('operating_temp', 'Operating temperature', textInput('-40 to 70 °C')));
    root.appendChild(mechanical);

    const media = el('div', { className: 'form-section' }, [
      el('h3', { text: 'Photos, patterns, and sources' }),
      el('p', { className: 'hint', text: 'Image paths can be a site path such as images/vendor/sku.jpg, or an https URL. You can also drop image files onto the GitHub issue after it opens.' })
    ]);
    const imageUrl = document.createElement('input');
    imageUrl.type = 'text';
    imageUrl.placeholder = 'images/vendor/sku.jpg';
    media.appendChild(fieldRow('image_url', 'Primary photo', imageUrl));
    const images = document.createElement('textarea');
    images.placeholder = 'Product | images/vendor/sku-alt.jpg';
    media.appendChild(fieldRow('images', 'Additional photos', images, 'One photo per line: label | url | kind. Kind is optional (photo or assembly_render).'));
    const patterns = document.createElement('textarea');
    patterns.placeholder = '2.4 GHz Horizontal | images/vendor/sku-pattern-2-4-ghz-horizontal.jpg';
    media.appendChild(fieldRow('pattern-images', 'Radiation patterns', patterns, 'One plot per line: label | url | kind. Kind is optional (pattern). Put the orientation in the label (Horizontal or Vertical).'));
    const dimUrl = document.createElement('input');
    dimUrl.type = 'text';
    dimUrl.placeholder = 'images/vendor/sku-dimensions.jpg';
    media.appendChild(fieldRow('dimension_image_url', 'Dimension image', dimUrl));
    const kind = el('select');
    kind.appendChild(el('option', { value: '', text: 'Not set' }));
    kind.appendChild(el('option', { value: 'mechanical', text: 'Mechanical drawing' }));
    kind.appendChild(el('option', { value: 'assembly', text: '3D assembly render' }));
    media.appendChild(fieldRow('dimension_image_kind', 'Dimension image type', kind, 'Choose Mechanical drawing when the vendor ships a real 2D drawing. That stores dimension_image_kind as mechanical. Use 3D assembly render for isometric views.'));
    const sheets = document.createElement('textarea');
    sheets.placeholder = 'Hubbell SPEC | https://example.com/spec.pdf';
    media.appendChild(fieldRow('datasheets', 'Datasheet URLs', sheets, 'One datasheet per line: label | https URL. A datasheet or a source URL is required.'));
    const sources = document.createElement('textarea');
    sources.placeholder = 'Hubbell SPEC | ATS-ATS03414-SPEC-EN | https://example.com/spec.pdf';
    media.appendChild(fieldRow('sources', 'Sources', sources, 'One source per line: label | id | url | note. The note is optional.'));
    root.appendChild(media);
  }

  function checkedBands() {
    return Array.from(document.querySelectorAll('input[name="band"]:checked')).map(box => box.value);
  }

  function readAntennaForm() {
    function value(id) {
      const node = document.getElementById(id);
      return node ? node.value : '';
    }
    const gain = {};
    const beam = {};
    STANDARD_BANDS.forEach(band => {
      const slug = band.replace('.', '-');
      gain[band] = value('gain-' + slug);
      beam[band] = { h: value('bw-h-' + slug), v: value('bw-v-' + slug) };
    });
    return {
      vendor: value('vendor'),
      sku: value('sku'),
      legacy_sku: value('legacy_sku'),
      name: value('name'),
      form: value('form'),
      indoor_outdoor: value('indoor_outdoor'),
      bands: checkedBands(),
      other_bands: value('other-bands'),
      frequency_range: value('frequency_range'),
      gain: gain,
      other_gain: value('other-gain'),
      beam: beam,
      other_beam: value('other-beam'),
      beam_scalar_h: value('bw-h-scalar'),
      beam_scalar_v: value('bw-v-scalar'),
      beam_empty_h: value('bw-empty-h'),
      beam_empty_v: value('bw-empty-v'),
      connector: value('connector'),
      lead_count: value('lead_count'),
      polarization: value('polarization'),
      cable_length: value('cable_length'),
      cable_type: value('cable_type'),
      dimensions: value('dimensions'),
      weight: value('weight'),
      ip_rating: value('ip_rating'),
      radome: value('radome'),
      mount_type: value('mount_type'),
      included_parts_text: value('included-parts'),
      wind_rating: value('wind_rating'),
      vswr: value('vswr'),
      isolation: value('isolation'),
      operating_temp: value('operating_temp'),
      image_url: value('image_url'),
      images_text: value('images'),
      pattern_images_text: value('pattern-images'),
      dimension_image_url: value('dimension_image_url'),
      dimension_image_kind: value('dimension_image_kind'),
      datasheet_text: value('datasheets'),
      sources_text: value('sources')
    };
  }

  function entryId(entry) {
    if (typeof slugifyAntenna === 'function') return slugifyAntenna(entry);
    return trim((entry && entry.vendor) + ' ' + (entry && entry.sku))
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function showFormErrors(list) {
    const errors = document.getElementById('form-errors');
    if (!errors) return;
    if (!list.length) {
      errors.style.display = 'none';
      errors.textContent = '';
      return;
    }
    errors.style.display = 'block';
    errors.textContent = list.join(' ');
  }

  function initAntennaSubmissionPage(options) {
    const kind = options && options.kind === 'edit' ? 'edit' : 'new';
    renderAntennaForm(document.getElementById('form-fields'));
    if (kind === 'new') {
      const skuRow = document.getElementById('sku').closest('.form-row');
      const dup = document.createElement('div');
      dup.className = 'form-row';
      dup.id = 'dup-row';
      dup.style.display = 'none';
      const box = document.createElement('div');
      box.id = 'dup-warning';
      box.className = 'error';
      dup.appendChild(box);
      skuRow.insertAdjacentElement('afterend', dup);
    }
    const form = document.getElementById('antenna-form');
    const output = document.getElementById('output');
    let catalog = [];
    let selected = null;
    const known = new Set();

    function currentEntry() {
      return buildAntennaEntry(readAntennaForm(), kind === 'edit' ? selected : null);
    }

    function generate() {
      if (kind === 'edit' && !selected) {
        showFormErrors(['Choose the antenna you are editing.']);
        output.value = '';
        return null;
      }
      const entry = currentEntry();
      const problems = validateSubmission(entry);
      if (problems.length) {
        showFormErrors(problems);
        output.value = '';
        return null;
      }
      showFormErrors([]);
      output.value = formatAntennaJson(entry);
      return entry;
    }

    form.addEventListener('submit', event => {
      event.preventDefault();
      const entry = generate();
      if (!entry) return;
      output.focus();
      output.select();
    });

    document.getElementById('open-issue-btn').addEventListener('click', () => {
      const entry = generate();
      if (!entry) return;
      if (kind === 'new' && known.has(submissionSlug(entry.vendor, entry.sku))) {
        const label = (entry.vendor + ' ' + entry.sku).trim();
        if (!window.confirm('"' + label + '" is already in the catalog. Open a new-antenna issue anyway?')) return;
      }
      const select = document.getElementById('existing');
      const existingLabel = select && select.selectedOptions[0]
        ? (select.selectedOptions[0].getAttribute('data-label') || '')
        : '';
      const issue = buildIssue({
        kind: kind,
        vendor: entry.vendor,
        sku: entry.sku,
        existingLabel: existingLabel,
        json: output.value
      });
      window.open(githubIssueUrl(issue.title, issue.body), '_blank', 'noopener');
    });

    function refreshDuplicate() {
      const row = document.getElementById('dup-row');
      const box = document.getElementById('dup-warning');
      if (!row || !box) return;
      const vendor = document.getElementById('vendor').value;
      const sku = document.getElementById('sku').value;
      const duplicate = known.has(submissionSlug(vendor, sku));
      if (duplicate && trim(vendor) && trim(sku)) {
        box.textContent = 'Heads up: "' + (trim(vendor) + ' ' + trim(sku)) + '" is already in the catalog. Edit that antenna instead.';
        row.style.display = 'block';
      } else {
        row.style.display = 'none';
      }
    }

    ['vendor', 'sku'].forEach(id => {
      const node = document.getElementById(id);
      if (!node) return;
      node.addEventListener('input', refreshDuplicate);
      node.addEventListener('blur', refreshDuplicate);
    });

    const select = document.getElementById('existing');
    if (select) {
      select.addEventListener('change', () => {
        const index = select.value === '' ? -1 : Number(select.value);
        selected = catalog[index] || null;
        if (selected) fillAntennaForm(entryToFormFields(selected));
        output.value = '';
        showFormErrors([]);
      });
    }

    fetch('antenna_catalog.json', { cache: 'no-store' })
      .then(res => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(data => {
        if (!Array.isArray(data)) throw new Error('Catalog is not a list');
        catalog = data;
        data.forEach(entry => known.add(submissionSlug(entry.vendor, entry.sku)));
        if (!select) return;
        const rows = data.map((entry, index) => ({
          index: index,
          label: trim((entry.vendor || '') + ' ' + (entry.sku || '')),
          display: trim((entry.vendor || '') + ' ' + (entry.sku || '') + (entry.legacy_sku ? ' (' + entry.legacy_sku + ')' : ''))
        })).sort((a, b) => a.label.localeCompare(b.label));
        rows.forEach(row => {
          const option = document.createElement('option');
          option.value = String(row.index);
          option.setAttribute('data-label', row.label);
          option.textContent = row.display;
          select.appendChild(option);
        });
        const requested = new URLSearchParams(window.location.search).get('id') || '';
        const match = requested ? data.findIndex(entry => entryId(entry) === requested) : -1;
        if (match >= 0) {
          select.value = String(match);
          selected = data[match];
          fillAntennaForm(entryToFormFields(selected));
        }
      })
      .catch(err => {
        showFormErrors(['Could not load the antenna catalog (' + err.message + '). You can still fill in the form.']);
      });
  }

  function fillAntennaForm(fields) {
    const data = fields || {};
    function set(id, value) {
      const node = document.getElementById(id);
      if (node) node.value = value == null ? '' : String(value);
    }
    set('vendor', data.vendor);
    set('sku', data.sku);
    set('legacy_sku', data.legacy_sku);
    set('name', data.name);
    set('form', data.form);
    set('indoor_outdoor', data.indoor_outdoor);
    const selected = new Set(data.bands || []);
    document.querySelectorAll('input[name="band"]').forEach(box => {
      box.checked = selected.has(box.value);
    });
    set('other-bands', data.other_bands);
    set('frequency_range', data.frequency_range);
    STANDARD_BANDS.forEach(band => {
      const slug = band.replace('.', '-');
      const gain = data.gain || {};
      const beam = (data.beam && data.beam[band]) || {};
      set('gain-' + slug, gain[band]);
      set('bw-h-' + slug, beam.h);
      set('bw-v-' + slug, beam.v);
    });
    set('other-gain', data.other_gain);
    set('other-beam', data.other_beam);
    set('bw-h-scalar', data.beam_scalar_h);
    set('bw-v-scalar', data.beam_scalar_v);
    set('bw-empty-h', data.beam_empty_h);
    set('bw-empty-v', data.beam_empty_v);
    set('connector', data.connector);
    set('lead_count', data.lead_count);
    set('polarization', data.polarization);
    set('cable_length', data.cable_length);
    set('cable_type', data.cable_type);
    set('dimensions', data.dimensions);
    set('weight', data.weight);
    set('ip_rating', data.ip_rating);
    set('radome', data.radome);
    set('mount_type', data.mount_type);
    set('included-parts', data.included_parts_text);
    set('wind_rating', data.wind_rating);
    set('vswr', data.vswr);
    set('isolation', data.isolation);
    set('operating_temp', data.operating_temp);
    set('image_url', data.image_url);
    set('images', data.images_text);
    set('pattern-images', data.pattern_images_text);
    set('dimension_image_url', data.dimension_image_url);
    set('dimension_image_kind', data.dimension_image_kind);
    set('datasheets', data.datasheet_text);
    set('sources', data.sources_text);
  }

  return {
    GITHUB_USER: GITHUB_USER,
    GITHUB_REPO: GITHUB_REPO,
    STANDARD_BANDS: STANDARD_BANDS,
    FORMS: FORMS,
    PRIVATE_KEYS: PRIVATE_KEYS,
    PUBLIC_KEYS: PUBLIC_KEYS,
    PRESERVE_FROM_BASE: PRESERVE_FROM_BASE,
    stripPrivateFields: stripPrivateFields,
    toPublicCatalogEntry: toPublicCatalogEntry,
    findPrivateCatalogKeys: findPrivateCatalogKeys,
    entryToFormFields: entryToFormFields,
    buildAntennaEntry: buildAntennaEntry,
    validateSubmission: validateSubmission,
    submissionSlug: submissionSlug,
    buildIssue: buildIssue,
    githubIssueUrl: githubIssueUrl,
    formatAntennaJson: formatAntennaJson,
    renderAntennaForm: renderAntennaForm,
    readAntennaForm: readAntennaForm,
    fillAntennaForm: fillAntennaForm,
    initAntennaSubmissionPage: initAntennaSubmissionPage,
    sanitizeAssetUrl: sanitizeAssetUrl,
    sanitizeHttpUrl: sanitizeHttpUrl
  };
});
