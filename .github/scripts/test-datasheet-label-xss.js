#!/usr/bin/env node
'use strict';

/**
 * Regression: catalog-controlled datasheet labels must never reach HTML parsing.
 * Mirrors the detail-page action link builder with a hostile label fixture.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { createDatasheetActionLink } = require('../../antenna-format.js');

const HOSTILE_LABEL = '<img src=x onerror=alert(1)>';
const SAFE_URL = 'https://example.com/datasheet.pdf';

function createMockDocument() {
  function createElement(tagName) {
    const children = [];
    const el = {
      tagName: String(tagName).toUpperCase(),
      children,
      className: '',
      href: '',
      target: '',
      rel: '',
      _text: '',
      _htmlSetViaInnerHTML: false,
      set textContent(value) {
        this._text = value == null ? '' : String(value);
        this._htmlSetViaInnerHTML = false;
      },
      get textContent() {
        if (this.children.length) {
          return this.children.map(child => child.textContent).join('');
        }
        return this._text;
      },
      set innerHTML(value) {
        this._htmlSetViaInnerHTML = true;
        this._text = value == null ? '' : String(value);
        this.children.length = 0;
      },
      get innerHTML() {
        return this._text;
      },
      appendChild(child) {
        this.children.push(child);
        return child;
      }
    };
    return el;
  }
  return { createElement };
}

const doc = createMockDocument();
const link = createDatasheetActionLink(doc, {
  label: HOSTILE_LABEL,
  url: SAFE_URL
});

assert.ok(link, 'expected a datasheet action link');
assert.strictEqual(link.tagName, 'A');
assert.strictEqual(link.href, SAFE_URL);
assert.strictEqual(link.target, '_blank');
assert.strictEqual(link.rel, 'noopener noreferrer');
assert.strictEqual(link.className, 'btn-inline-action');
assert.strictEqual(link.children.length, 1, 'label should be a child span');

const span = link.children[0];
assert.strictEqual(span.tagName, 'SPAN');
assert.strictEqual(span.textContent, HOSTILE_LABEL, 'hostile markup must remain plain text');
assert.strictEqual(span._htmlSetViaInnerHTML, false, 'label must not be assigned via innerHTML');
assert.ok(!span.children.some(Boolean), 'label span must not parse nested HTML nodes');

assert.strictEqual(
  createDatasheetActionLink(doc, { label: 'Spec', url: 'javascript:alert(1)' }),
  null,
  'non-http(s) datasheet URLs must be rejected'
);

assert.strictEqual(
  createDatasheetActionLink(doc, { url: SAFE_URL }).children[0].textContent,
  'Datasheet',
  'missing label falls back to Datasheet'
);

const antennaHtml = fs.readFileSync(path.join(__dirname, '..', '..', 'antenna.html'), 'utf8');
assert.ok(
  !/a\.innerHTML\s*=\s*`[\s\S]*\$\{[^}]*sheet\.label/.test(antennaHtml),
  'antenna.html must not interpolate sheet.label into innerHTML'
);
assert.ok(
  antennaHtml.includes('createDatasheetActionLink(document, sheet)'),
  'antenna.html must build datasheet actions via createDatasheetActionLink'
);

console.log('OK: datasheet labels use textContent (hostile-label regression)');
