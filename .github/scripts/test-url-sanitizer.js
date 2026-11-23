#!/usr/bin/env node
'use strict';

/**
 * Shared URL policy: http(s) only for absolute URLs; relative asset paths may
 * not traverse, use backslashes, or absolute-root form. Control characters
 * that obfuscate schemes are rejected.
 */

const assert = require('assert');
const { safeUrl } = require('../../antenna-format.js');
const submit = require('../../antenna-submit.js');

function assertRejected(label, value, options) {
  assert.strictEqual(safeUrl(value, options), '', label + ' (safeUrl)');
}

function assertAccepted(label, value, options, expected) {
  assert.strictEqual(safeUrl(value, options), expected, label + ' (safeUrl)');
}

assertAccepted('https ok', 'https://example.com/a.pdf', {}, 'https://example.com/a.pdf');
assertAccepted('http ok', 'http://example.com/a.pdf', {}, 'http://example.com/a.pdf');
assertRejected('javascript rejected', 'javascript:alert(1)', {});
assertRejected('data rejected', 'data:text/html,<script>alert(1)</script>', {});
assertRejected('relative without allowRelative', 'images/x.png', {});

assertAccepted(
  'relative asset',
  'images/cisco/foo.png',
  { allowRelative: true },
  'images/cisco/foo.png'
);
assertRejected('protocol-relative', '//evil.example/x', { allowRelative: true });
assertRejected('absolute-root', '/etc/passwd', { allowRelative: true });
assertRejected('backslash', 'images\\cisco\\foo.png', { allowRelative: true });
assertRejected('dotdot segment', 'images/../secret.png', { allowRelative: true });
assertRejected('dotdot alone', '../secret.png', { allowRelative: true });
assertRejected('encoded dotdot', 'images/%2e%2e/secret.png', { allowRelative: true });
assertRejected('encoded dotdot upper', 'images/%2E%2E/secret.png', { allowRelative: true });

const controlCases = [
  ['tab scheme', 'java\tscript:alert(1)'],
  ['newline scheme', 'java\nscript:alert(1)'],
  ['cr scheme', 'java\rscript:alert(1)'],
  ['nul path', 'images/\u0000x.png']
];

controlCases.forEach(([label, value]) => {
  assertRejected(label + ' allowRelative false', value, { allowRelative: false });
  assertRejected(label + ' allowRelative true', value, { allowRelative: true });
  assert.strictEqual(
    submit.sanitizeHttpUrl(value),
    '',
    label + ' (submit.sanitizeHttpUrl)'
  );
  assert.strictEqual(
    submit.sanitizeAssetUrl(value),
    '',
    label + ' (submit.sanitizeAssetUrl)'
  );
});

assert.strictEqual(
  submit.sanitizeAssetUrl('images/../x.png'),
  '',
  'submit.sanitizeAssetUrl must reject traversal'
);
assert.strictEqual(
  submit.sanitizeAssetUrl('images/%2e%2e/x.png'),
  '',
  'submit.sanitizeAssetUrl must reject encoded traversal'
);
assert.strictEqual(
  submit.sanitizeHttpUrl('javascript:alert(1)'),
  '',
  'submit.sanitizeHttpUrl must reject non-http(s)'
);
assert.strictEqual(
  submit.sanitizeAssetUrl('images/cisco/foo.png'),
  'images/cisco/foo.png',
  'submit.sanitizeAssetUrl accepts normal relative assets'
);

console.log('OK: URL sanitizer rejects traversal and unexpected schemes');
