#!/usr/bin/env node
'use strict';

/**
 * Inventory HTML sinks in page scripts. Fail if catalog/user strings are
 * interpolated into innerHTML assignments. Constant clears and compile-time
 * SVG markup are allowed; document them here when the pattern is intentional.
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

const ALLOWED_INNERHTML_PATTERNS = [
  /\.innerHTML\s*=\s*['"`]\s*['"`]/, // clear
  /\.innerHTML\s*=\s*markup\b/, // antenna.html copy-icon SVG constants
  /\.innerHTML\s*=\s*CHECK_ICON\b/,
  /\.innerHTML\s*=\s*COPY_ICON\b/,
  // compare.html builds empty structural shells then fills via textContent
  /\.innerHTML\s*=\s*`<div class="card-vendor"><\/div><div class="card-model"><\/div>`/,
  /\.innerHTML\s*=\s*`<div class="spec-label"><\/div><div class="spec-value"><\/div>`/
];

function isAllowed(statement) {
  const normalized = statement.replace(/\s+/g, ' ').trim();
  return ALLOWED_INNERHTML_PATTERNS.some(re => re.test(normalized));
}

const violations = [];

files.forEach(rel => {
  const source = fs.readFileSync(path.join(root, rel), 'utf8');
  // Flag template-literal or concatenated innerHTML that embeds ${...}
  const re = /(?:\w+\.)?innerHTML\s*=\s*(`[^`]*`|"[^"]*"|'[^']*'|[^;\n]+)/g;
  let match;
  while ((match = re.exec(source))) {
    const stmt = match[0];
    if (/\$\{/.test(stmt) || /\+\s*[a-zA-Z_$]/.test(stmt)) {
      violations.push({ file: rel, snippet: stmt.slice(0, 160) });
      continue;
    }
    if (!isAllowed(stmt) && !/\.innerHTML\s*=\s*['"`]\s*['"`]/.test(stmt) && !/\.innerHTML\s*=\s*''/.test(stmt)) {
      // Allow bare clears via variable? still inventory non-allowed assignments
      if (/\.innerHTML\s*=\s*['"`]/.test(stmt) || /\.innerHTML\s*=\s*[A-Z_]/.test(stmt)) {
        if (!isAllowed(stmt)) {
          violations.push({ file: rel, snippet: stmt.slice(0, 160) });
        }
      }
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
  violations.forEach(v => console.error('- ' + v.file + ': ' + v.snippet));
  process.exit(1);
}

console.log('OK: HTML sink inventory — no catalog/user string → innerHTML interpolations');
