import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { resolve, isStock } = require('../js/room-theme');

// These are the product's functional groups, rather than snapshots of its colors.
const groups = [
  ['home'], ['studio'], ['characters'], ['lore'],
  ['sections', 'prompts'], ['graph', 'regex', 'quick'],
  ['chat', 'memory', 'tutorial'], ['groups', 'script', 'timeline'],
  ['assets', 'resources'], ['check', 'backup'],
];
const routes = groups.flat();
const neutral = { bg: '#1c1c1c', lacquer: '#141414', paper: '#2e2e2e', ink: '#e8e8e8', accent: '#d0d0d0' };
const green = { bg: '#191b19', lacquer: '#151714', paper: '#212420', ink: '#e7e7dd', accent: '#d6b680' };
const custom = { bg: '#121724', lacquer: '#111321', paper: '#283040', ink: '#edf1fa', accent: '#be83d8' };
let passed = 0;
const failures = [];
function test(name, run) {
  try { run(); passed++; console.log('ok', name); }
  catch (error) { failures.push(name); console.error('not ok', name, '\n' + error.stack); }
}
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function luminance(hex) {
  assert.match(hex, /^#[0-9a-f]{6}$/i);
  const channels = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((left, right) => left - right);
  return (values[1] + 0.05) / (values[0] + 0.05);
}

test('all 19 pages share colors with their functional siblings and differ across groups', () => {
  assert.equal(new Set(routes).size, 19);
  const representatives = [];
  for (const group of groups) {
    const first = resolve(group[0], {}, true);
    representatives.push(first);
    assert.equal(first.useRooms, true);
    for (const route of group) {
      const result = resolve(route, {}, true);
      assert.equal(result.room, first.room, route);
      assert.deepEqual(result.colors, first.colors, route);
      for (const value of Object.values(result.colors)) assert.match(value, /^#[0-9a-f]{6}$/i);
    }
  }
  assert.equal(new Set(representatives.map(result => result.room)).size, groups.length);
  assert.equal(new Set(representatives.map(result => result.colors.bg)).size, groups.length);
  assert.equal(new Set(representatives.map(result => result.colors.accent)).size, groups.length);
});

test('resolution leaves frozen saved settings intact and returns independent display colors', () => {
  for (const colors of [neutral, green, custom]) {
    const stored = freeze({ ...colors, fontScale: 1.15, radius: 9, extra: { note: 'keep me' } });
    const before = JSON.stringify(stored);
    for (const preference of [undefined, true, false]) {
      for (const route of routes) {
        const result = resolve(route, stored, preference);
        assert.notEqual(result.colors, stored);
        result.colors.bg = '#000000';
        assert.equal(JSON.stringify(stored), before);
        assert.notEqual(resolve(route, stored, preference).colors.bg, '#000000');
      }
    }
  }
});

test('legacy gray and green preferences automatically receive room palettes without migration', () => {
  for (const legacy of [neutral, green]) {
    const uppercase = Object.fromEntries(Object.entries(legacy).map(([key, value]) => [key, value.toUpperCase()]));
    for (const stored of [legacy, uppercase]) {
      assert.equal(isStock(stored), true);
      for (const route of routes) assert.deepEqual(resolve(route, stored).colors, resolve(route, {}, true).colors);
    }
  }
});

test('changing any one saved color enables custom colors, including paper and ink alone', () => {
  for (const legacy of [neutral, green]) {
    for (const key of Object.keys(legacy)) {
      const stored = Object.freeze({ ...legacy, [key]: '#aBcDeF' });
      assert.equal(isStock(stored), false, key);
      for (const route of ['home', 'studio', 'lore']) {
        const result = resolve(route, stored);
        assert.equal(result.useRooms, false, key);
        assert.equal(result.colors[key], '#abcdef', key);
        for (const untouched of Object.keys(legacy).filter(name => name !== key)) {
          assert.equal(result.colors[untouched], legacy[untouched], untouched);
        }
      }
    }
  }
});

test('explicit useRoomPalette true or false overrides automatic detection and can be switched back', () => {
  for (const route of routes) {
    assert.deepEqual(resolve(route, custom, true).colors, resolve(route, {}, true).colors);
    assert.equal(resolve(route, custom, true).useRooms, true);
    assert.deepEqual(resolve(route, neutral, false).colors, neutral);
    assert.equal(resolve(route, neutral, false).useRooms, false);
    assert.deepEqual(resolve(route, custom, false).colors, custom);
    assert.deepEqual(resolve(route, custom, undefined).colors, custom);
  }
});

test('invalid colors fall back individually while valid custom colors remain untouched', () => {
  for (const route of ['home', 'studio', 'lore']) {
    const fallback = resolve(route, {}, true).colors;
    for (const key of Object.keys(custom)) {
      for (const invalid of [null, undefined, '', 42, '#abc', '#12345g', 'red', 'url(https://example.invalid/color)']) {
        const stored = Object.freeze({ ...custom, [key]: invalid });
        const result = resolve(route, stored, false);
        assert.equal(result.colors[key], fallback[key], `${route}/${key}/${invalid}`);
        for (const untouched of Object.keys(custom).filter(name => name !== key)) {
          assert.equal(result.colors[untouched], custom[untouched]);
        }
      }
    }
  }
});

test('button and surface foregrounds meet 4.5:1 contrast, including middle gray custom colors', () => {
  const samples = ['#000000', '#ffffff', '#707070', '#777777', '#7a737d', '#808080'];
  for (let red = 0; red <= 255; red += 51) {
    for (let green = 0; green <= 255; green += 51) {
      for (let blue = 0; blue <= 255; blue += 51) {
        samples.push('#' + [red, green, blue].map(channel => channel.toString(16).padStart(2, '0')).join(''));
      }
    }
  }
  for (const route of routes) {
    const result = resolve(route, {}, true);
    assert.ok(contrast(result.colors.accent, result.onAccent) >= 4.5, route);
  }
  for (const sample of samples) {
    const result = resolve('home', { ...custom, accent: sample, paper: sample }, false);
    assert.ok(contrast(sample, result.onAccent) >= 4.5, `button ${sample}/${result.onAccent}`);
    assert.ok(contrast(sample, result.onSurface) >= 4.5, `surface ${sample}/${result.onSurface}`);
  }
});

test('unknown and inherited-property route names safely use the collection fallback', () => {
  for (const route of [undefined, null, '', 'not-a-page', 'constructor', 'toString', '__proto__']) {
    assert.deepEqual(resolve(route, {}, true), resolve('home', {}, true), String(route));
    assert.deepEqual(resolve(route, custom, false), resolve('home', custom, false), String(route));
  }
});

test('room palettes preserve the user font size and square-corner preference', () => {
  for (const preference of [undefined, true, false]) {
    const stored = Object.freeze({ ...custom, fontScale: 1.2, radius: 0 });
    const result = resolve('studio', stored, preference);
    assert.equal(result.fontScale, 1.2);
    assert.equal(result.radius, 0);
  }
});

console.log(`${passed} room theme checks passed${failures.length ? `; ${failures.length} failed` : ''}`);
if (failures.length) process.exitCode = 1;
