#!/usr/bin/env node
'use strict';

/**
 * Inventory HTML sinks in page scripts.
 *
 * Flag every innerHTML / outerHTML assignment unless the RHS is:
 *   - a string literal with no interpolation, or
 *   - an allowlisted constant / trusted empty shell
 * Lowercase identifiers are violations unless allowlisted.
 * Flag every insertAdjacentHTML( unless allowlisted.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.join(__dirname, '..', '..');
const files = [
  'index.html',
  'finder.html',
  'antenna.html',
  'compare.html',
  'submit.html',
  'edit.html',
  'antenna-format.js',
  'antenna-submit.js',
  'compatibility-matcher.js',
  'connector-normalize.js'
];

// Trusted constant markup only — keep why-comments next to real assignments.
const ALLOWED_RHS = new Set([
  "''",
  '""',
  '``',
  'markup', // antenna.html copy/check SVG path constants
  'CHECK_ICON',
  'COPY_ICON',
  '`<div class="card-vendor"></div><div class="card-model"></div>`', // compare empty shell
  '`<div class="spec-label"></div><div class="spec-value"></div>`' // compare empty shell
]);

const ALLOWED_INSERT_ADJACENT = new Set();

function normalizeRhs(rhs) {
  return String(rhs || '').replace(/\s+/g, ' ').trim();
}

function isPlainStringLiteral(rhs) {
  const s = normalizeRhs(rhs);
  if (!s) return false;
  if (/\$\{/.test(s)) return false;
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    return true;
  }
  if (s.startsWith('`') && s.endsWith('`')) {
    return !/\$\{/.test(s);
  }
  return false;
}

function isAllowedRhs(rhs) {
  const s = normalizeRhs(rhs);
  if (ALLOWED_RHS.has(s)) return true;
  if (isPlainStringLiteral(s)) return true;
  return false;
}

const violations = [];

files.forEach(rel => {
  const source = fs.readFileSync(path.join(root, rel), 'utf8');

  const assignRe = /\b(?:innerHTML|outerHTML)\s*=\s*([^;]+);/g;
  let match;
  while ((match = assignRe.exec(source))) {
    const rhs = match[1];
    if (!isAllowedRhs(rhs)) {
      violations.push({
        file: rel,
        kind: 'assign',
        snippet: match[0].replace(/\s+/g, ' ').trim().slice(0, 160)
      });
    }
  }

  const insertRe = /\binsertAdjacentHTML\s*\(/g;
  while ((match = insertRe.exec(source))) {
    const start = match.index;
    const snippet = source.slice(start, start + 120).replace(/\s+/g, ' ').trim();
    const key = rel + ':' + start;
    if (!ALLOWED_INSERT_ADJACENT.has(key) && !ALLOWED_INSERT_ADJACENT.has(snippet)) {
      violations.push({ file: rel, kind: 'insertAdjacentHTML', snippet });
    }
  }
});

// Explicit regressions called out in the audit
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.ok(
  !/td\.innerHTML\s*=\s*`[\s\S]*empty-state-enhanced/.test(indexHtml),
  'index.html empty state must not use innerHTML with a template'
);

const antennaHtml = fs.readFileSync(path.join(root, 'antenna.html'), 'utf8');
assert.ok(
  !/a\.innerHTML\s*=\s*`[\s\S]*\$\{[^}]*sheet\.label/.test(antennaHtml),
  'antenna.html must not interpolate sheet.label into innerHTML'
);

if (violations.length) {
  console.error('Unexpected HTML sinks:');
  violations.forEach(v => console.error('- ' + v.file + ' [' + v.kind + ']: ' + v.snippet));
  process.exit(1);
}

console.log('OK: HTML sink inventory — no catalog/user string → HTML parse sinks');
