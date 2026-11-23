#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  safeReturnPath,
  buildAntennaDetailHref,
  DETAIL_BACK_STORAGE_KEY,
  saveDetailBackPath,
  readDetailBackPath
} = require('../../antenna-format.js');

assert.strictEqual(
  buildAntennaDetailHref('aruba-ap-ant-1b'),
  'antenna.html?id=aruba-ap-ant-1b',
  'detail href must be id-only'
);
assert.ok(
  !buildAntennaDetailHref('x', 'index.html?vendor=Aruba').includes('return='),
  'extra args must not reintroduce return='
);

assert.strictEqual(safeReturnPath('index.html?vendor=Aruba'), 'index.html?vendor=Aruba');
assert.strictEqual(safeReturnPath('https://evil.example/'), '');
assert.strictEqual(safeReturnPath('../index.html'), '');

const store = Object.create(null);
global.sessionStorage = {
  getItem(key) { return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
  setItem(key, value) { store[key] = String(value); }
};

saveDetailBackPath('index.html?vendor=Aruba&hide=lead_count');
assert.strictEqual(store[DETAIL_BACK_STORAGE_KEY], 'index.html?vendor=Aruba&hide=lead_count');
assert.strictEqual(readDetailBackPath(), 'index.html?vendor=Aruba&hide=lead_count');

saveDetailBackPath('javascript:alert(1)');
assert.strictEqual(readDetailBackPath(), 'index.html?vendor=Aruba&hide=lead_count', 'reject unsafe writes');

console.log('OK: detail back helpers keep short URLs and validate session paths');
