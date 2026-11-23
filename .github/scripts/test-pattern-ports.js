#!/usr/bin/env node
'use strict';

// Per-port pattern grouping used by the detail page port picker.
const assert = require('assert');
const { patternPortKey, groupPatternsByPort } = require('../../antenna-format.js');

assert.strictEqual(patternPortKey('5 GHz Port A Horizontal'), 'Port A');
assert.strictEqual(patternPortKey('2.4 GHz Element 3 Vertical'), 'Element 3');
assert.strictEqual(patternPortKey('2.4 GHz Element 03 Horizontal + Vertical'), 'Element 3');
assert.strictEqual(patternPortKey('2.4 GHz AUX Vertical'), 'AUX');
assert.strictEqual(patternPortKey('2.4 GHz BLE Horizontal'), 'BLE');
assert.strictEqual(patternPortKey('5 GHz Horizontal'), '', 'plain band plots are shared');
assert.strictEqual(patternPortKey('5 GHz Vertical (30°)'), '', 'downtilt cuts are shared');
assert.strictEqual(patternPortKey('5 GHz Radio (2MPC) Vertical'), '', 'named radios are shared');

const plot = label => ({ label, url: `images/x/${label.toLowerCase().replace(/\W+/g, '-')}.jpg` });

// Small sets keep the plain gallery.
assert.strictEqual(groupPatternsByPort([
  plot('2.4 GHz Element 1 Horizontal'), plot('2.4 GHz Element 2 Horizontal'), plot('2.4 GHz Element 3 Horizontal')
]), null, 'three plots do not need a picker');

// One port only: no picker even when large.
assert.strictEqual(groupPatternsByPort([
  '2.4', '5', '6'].flatMap(b => [plot(`${b} GHz Horizontal`), plot(`${b} GHz Vertical`)]).concat([
  plot('5 GHz Port A Horizontal')
])), null, 'a single port is not a choice');

// Cisco-style set: A-D are 5 GHz only, E-H carry 2.4 and 5, plus AUX and BLE.
const cisco = [];
['A', 'B', 'C', 'D'].forEach(p => cisco.push(plot(`5 GHz Port ${p} Horizontal`), plot(`5 GHz Port ${p} Vertical`)));
['E', 'F', 'G', 'H'].forEach(p => ['2.4', '5'].forEach(b => cisco.push(plot(`${b} GHz Port ${p} Horizontal`), plot(`${b} GHz Port ${p} Vertical`))));
cisco.push(plot('2.4 GHz BLE Horizontal'), plot('2.4 GHz BLE Vertical'), plot('5 GHz AUX Horizontal'), plot('2.4 GHz AUX Horizontal'));
const g = groupPatternsByPort(cisco);
assert.ok(g, 'cisco set groups');
assert.deepStrictEqual(g.ports.map(p => p.key),
  ['Port A', 'Port B', 'Port C', 'Port D', 'Port E', 'Port F', 'Port G', 'Port H', 'AUX', 'BLE'],
  'chips are in natural order with AUX and BLE last');
assert.strictEqual(g.defaultKey, 'Port E', 'default is the first port with the most bands');
assert.deepStrictEqual(g.ports.find(p => p.key === 'Port E').bands, ['2.4', '5']);
assert.strictEqual(g.ports.reduce((n, p) => n + p.items.length, 0) + g.shared.length, cisco.length,
  'no plot is lost');

// Shared plots stay visible alongside every port.
const mixed = [plot('5 GHz Vertical (30°)')];
['1', '2', '3', '4'].forEach(p => mixed.push(plot(`5 GHz Port ${p} Horizontal`), plot(`5 GHz Port ${p} Vertical`)));
const m = groupPatternsByPort(mixed);
assert.strictEqual(m.shared.length, 1);
assert.strictEqual(m.defaultKey, 'Port 1');

console.log('OK: per-port pattern grouping (chip order, default port, shared plots, thresholds)');
