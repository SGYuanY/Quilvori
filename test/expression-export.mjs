import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { exportExpressions } = require('../electron/expression-export');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'quilvori-expression-test-'));
const image = name => ({ name, dataUrl: 'data:image/png;base64,AQID' });
let count = 0;
function test(name, run) { run(); count++; console.log('ok', name); }
function fixture() {
  const root = fs.mkdtempSync(path.join(temporary, 'case-')), folder = path.join(root, 'cards'), outside = path.join(root, 'outside');
  fs.mkdirSync(folder); fs.mkdirSync(outside);
  const writes = [];
  const io = new Proxy(fs, { get(target, key) {
    if (['mkdirSync', 'writeFileSync'].includes(key)) return (...args) => { writes.push(key); return target[key](...args); };
    return target[key];
  } });
  return { root, folder, outside, writes, io };
}

try {
  test('normal Unicode character and image names export to the character expressions directory', () => {
    const env = fixture(), character = '沈听雨 · Rain';
    const dest = exportExpressions({ folder: env.folder, character, files: [image('微笑.png'), image('雨夜 01.webp')] }, env.io);
    assert.equal(dest, path.join(env.folder, character, 'expressions'));
    assert.deepEqual(fs.readFileSync(path.join(dest, '微笑.png')), Buffer.from([1, 2, 3]));
    assert.deepEqual(fs.readdirSync(dest).sort(), ['微笑.png', '雨夜 01.webp'].sort());
    exportExpressions({ folder: env.folder, character, files: [{ name: '微笑.png', dataUrl: 'data:image/png;base64,BAUG' }] }, env.io);
    assert.deepEqual(fs.readFileSync(path.join(dest, '微笑.png')), Buffer.from([4, 5, 6]));
  });

  test('traversal, absolute names, device names and malformed batches cause zero writes', () => {
    const env = fixture();
    const invalid = ['../outside', '..\\outside', '/absolute', 'C:\\absolute', 'C:stream', '.', '..', 'CON', 'nul.png', 'LPT1.png', 'name.', 'name ', 'bad\0name', 'a/b.png', 'a\\b.png'];
    for (const name of invalid) {
      assert.throws(() => exportExpressions({ folder: env.folder, character: name, files: [image('valid.png')] }, env.io));
      assert.throws(() => exportExpressions({ folder: env.folder, character: 'Valid', files: [image('first.png'), image(name)] }, env.io));
    }
    for (const files of [null, {}, [null], [image('first.png'), { name: 'second.png', dataUrl: 'not image data' }]]) {
      assert.throws(() => exportExpressions({ folder: env.folder, character: 'Valid', files }, env.io));
    }
    assert.equal(env.writes.length, 0); assert.deepEqual(fs.readdirSync(env.folder), []);
  });

  test('duplicate filenames are rejected before touching existing files', () => {
    const env = fixture(), dest = path.join(env.folder, 'Existing', 'expressions'); fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'happy.png'), 'keep');
    for (const names of [['happy.png', 'happy.png'], ['Happy.png', 'happy.PNG']]) {
      assert.throws(() => exportExpressions({ folder: env.folder, character: 'Existing', files: names.map(image) }, env.io), error => error.code === 'duplicate-expression-name');
    }
    assert.equal(env.writes.length, 0); assert.equal(fs.readFileSync(path.join(dest, 'happy.png'), 'utf8'), 'keep');
  });

  test('a later invalid target prevents every write in an otherwise valid batch', () => {
    const env = fixture(), dest = path.join(env.folder, 'Existing', 'expressions'); fs.mkdirSync(path.join(dest, 'directory.png'), { recursive: true });
    fs.writeFileSync(path.join(dest, 'first.png'), 'keep');
    assert.throws(() => exportExpressions({ folder: env.folder, character: 'Existing', files: [image('first.png'), image('directory.png')] }, env.io), error => error.code === 'invalid-expression-path');
    assert.equal(env.writes.length, 0); assert.equal(fs.readFileSync(path.join(dest, 'first.png'), 'utf8'), 'keep');
  });

  test('existing character or expressions directory links cannot redirect writes outside the selected folder', () => {
    for (const atCharacter of [true, false]) {
      const env = fixture(), character = path.join(env.folder, 'Linked');
      if (!atCharacter) fs.mkdirSync(character);
      fs.symlinkSync(env.outside, atCharacter ? character : path.join(character, 'expressions'), process.platform === 'win32' ? 'junction' : 'dir');
      assert.throws(() => exportExpressions({ folder: env.folder, character: 'Linked', files: [image('photo.png')] }, env.io), error => error.code === 'invalid-expression-path');
      assert.equal(env.writes.length, 0); assert.deepEqual(fs.readdirSync(env.outside), []);
    }
  });

  test('realpath checks reject redirected files and aliases resolving to duplicate targets', () => {
    const env = fixture(), dest = path.join(env.folder, 'Existing', 'expressions'); fs.mkdirSync(dest, { recursive: true });
    const first = path.join(dest, 'first.png'), second = path.join(dest, 'second.png'), outside = path.join(env.outside, 'private.png');
    fs.writeFileSync(first, 'keep first'); fs.writeFileSync(second, 'keep second'); fs.writeFileSync(outside, 'keep outside');
    // Simulate file-link realpath results without requiring Windows symlink privilege.
    for (const redirected of [outside, first]) {
      const io = new Proxy(env.io, { get(target, key) {
        if (key === 'realpathSync') return value => value === second ? redirected : fs.realpathSync(value);
        return target[key];
      } });
      assert.throws(() => exportExpressions({ folder: env.folder, character: 'Existing', files: [image('first.png'), image('second.png')] }, io), error => error.code === (redirected === outside ? 'invalid-expression-path' : 'duplicate-expression-target'));
    }
    assert.equal(env.writes.length, 0); assert.equal(fs.readFileSync(first, 'utf8'), 'keep first'); assert.equal(fs.readFileSync(outside, 'utf8'), 'keep outside');
  });

  test('links remaining within the selected character folder can still export normally', () => {
    const env = fixture(), target = path.join(env.folder, 'Real character'); fs.mkdirSync(target);
    fs.symlinkSync(target, path.join(env.folder, 'Alias'), process.platform === 'win32' ? 'junction' : 'dir');
    const dest = exportExpressions({ folder: env.folder, character: 'Alias', files: [image('表情.png')] }, env.io);
    assert.equal(dest, path.join(target, 'expressions')); assert.deepEqual(fs.readFileSync(path.join(dest, '表情.png')), Buffer.from([1, 2, 3]));
  });
  console.log(`${count} expression export checks passed`);
} finally {
  const resolved = path.resolve(temporary), parent = path.resolve(os.tmpdir());
  if (path.dirname(resolved) !== parent || !path.basename(resolved).startsWith('quilvori-expression-test-')) throw new Error('Unexpected test cleanup path');
  fs.rmSync(resolved, { recursive: true, force: true });
}
