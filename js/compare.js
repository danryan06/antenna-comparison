// Page script for compare.html. Loaded as a classic script at the end of <body>,
// after the shared helpers it uses, so top-level names stay global.
const DATA_URL = 'antenna_catalog.json';
const FIELDS = [
  ['form', 'Form'],
  ['bands', 'Bands'],
  ['gain_dbi', 'Gain'],
  ['beamwidth', 'Beamwidth'],
  ['connector', 'Connector'],
  ['lead_count', 'Leads'],
  ['indoor_outdoor', 'Indoor/Outdoor'],
  ['polarization', 'Polarization'],
  ['cable_length', 'Cable Length'],
  ['cable_type', 'Cable Type'],
  ['dimensions', 'Dimensions'],
  ['weight', 'Weight'],
  ['ip_rating', 'IP Rating'],
  ['radome', 'Radome'],
  ['mount_type', 'Mount'],
  ['wind_rating', 'Wind Rating'],
  ['vswr', 'VSWR'],
  ['isolation', 'Isolation'],
  ['operating_temp', 'Operating Temp'],
  ['legacy_sku', 'Alt. part number']
];
const hidden = new Set(['cable_type', 'radome', 'wind_rating', 'vswr', 'isolation', 'operating_temp']);
let selected = [];

function formatField(key, value) {
  if (key === 'indoor_outdoor') return formatEnvironment(value);
  if (key === 'bands') return formatBands(value);
  if (key === 'gain_dbi') return formatGainCompact(value) || formatBandObject(value, 'gain');
  if (key === 'beamwidth') return formatBeamwidthCompact(value) || formatBandObject(value, 'beam');
  if (value == null) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function escapeCsvValue(value) {
  const s = String(value || '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function buildColumnsPanel() {
  const grid = document.getElementById('columns-grid');
  grid.innerHTML = '';
  FIELDS.forEach(([key, label]) => {
    const lab = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !hidden.has(key);
    input.addEventListener('change', () => {
      if (input.checked) hidden.delete(key);
      else hidden.add(key);
      render();
    });
    const span = document.createElement('span');
    span.textContent = label;
    lab.appendChild(input);
    lab.appendChild(span);
    grid.appendChild(lab);
  });
}

function render() {
  const root = document.getElementById('comparison');
  root.innerHTML = '';
  selected.forEach(entry => {
    const card = document.createElement('div');
    card.className = 'comparison-card';
    const imgWrap = document.createElement('div');
    imgWrap.className = 'card-image';
    const imgUrl = safeUrl(entry.image_url, { allowRelative: true });
    if (imgUrl) {
      const img = document.createElement('img');
      img.decoding = 'async';
      img.src = imgUrl;
      img.alt = entry.sku || '';
      imgWrap.appendChild(img);
    } else {
      imgWrap.textContent = 'No image';
    }
    card.appendChild(imgWrap);
    const title = document.createElement('div');
    title.className = 'card-title';
    // Empty structural shell; vendor/SKU filled via textContent below.
    title.innerHTML = `<div class="card-vendor"></div><div class="card-model"></div>`;
    title.querySelector('.card-vendor').textContent = entry.vendor || '';
    title.querySelector('.card-model').textContent = entry.sku || '';
    card.appendChild(title);
    const body = document.createElement('div');
    body.className = 'card-body';
    FIELDS.forEach(([key, label]) => {
      if (hidden.has(key)) return;
      const row = document.createElement('div');
      row.className = 'spec-row';
      // Empty structural shell; label/value filled via textContent below.
      row.innerHTML = `<div class="spec-label"></div><div class="spec-value"></div>`;
      row.querySelector('.spec-label').textContent = label;
      row.querySelector('.spec-value').textContent = formatField(key, entry[key]);
      body.appendChild(row);
    });
    card.appendChild(body);
    root.appendChild(card);
  });
}

function exportCsv() {
  const keys = ['vendor', 'sku', ...FIELDS.map(([k]) => k).filter(k => !hidden.has(k))];
  const lines = [keys.map(escapeCsvValue).join(',')];
  selected.forEach(entry => {
    lines.push(keys.map(k => escapeCsvValue(k === 'vendor' || k === 'sku' ? (entry[k] || '') : formatField(k, entry[k]))).join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'antenna-comparison.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function load() {
  const errorEl = document.getElementById('error-message');
  try {
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const ids = (new URLSearchParams(location.search).get('ids') || '').split(',').filter(Boolean);
    selected = ids.map(id => {
      const found = findAntennaById(data, id);
      return found ? found.entry : null;
    }).filter(Boolean);
    if (selected.length < 2) {
      errorEl.style.display = 'block';
      errorEl.textContent = 'Select at least two antennas from the browse table to compare.';
      return;
    }
    buildColumnsPanel();
    render();
  } catch (err) {
    errorEl.style.display = 'block';
    errorEl.textContent = 'Failed to load comparison: ' + err.message;
  }
}

document.getElementById('toggle-columns').addEventListener('click', () => {
  const panel = document.getElementById('columns-panel');
  const isOpen = panel.style.display === 'block';
  panel.style.display = isOpen ? 'none' : 'block';
});
document.getElementById('export-csv').addEventListener('click', exportCsv);
load();
