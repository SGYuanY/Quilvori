import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { clean, sourceUrl } = require('../js/resource-source');
const calls = [];
const inaccessible = new Proxy({}, { get() { throw new Error('Catalog touched private data'); } });
const context = vm.createContext({
  TAResourceSource: { clean }, TAUI: inaccessible, TAStore: inaccessible, localStorage: inaccessible,
  TALinkImportPanel: { open(options) { calls.push({ kind: 'link', options }); return 'link-opened'; } },
  TAWallpaperImport: { open(options) { calls.push({ kind: 'wallpaper', options }); return 'wallpaper-opened'; } },
});
vm.runInContext(fs.readFileSync(new URL('../js/resource-catalog.js', import.meta.url), 'utf8'), context, { filename: 'resource-catalog.js' });
const catalog = context.TAResourceCatalog;
const native = value => JSON.parse(JSON.stringify(value));
let passed = 0;
const failures = [];
function test(name, run) {
  try { run(); passed++; console.log('ok', name); }
  catch (error) { failures.push(name); console.error('not ok', name, '\n' + error.stack); }
}

test('catalog loads without private-library access or automatic imports', () => {
  assert.equal(calls.length, 0);
  assert.ok(catalog.entries.length >= 3);
  assert.deepEqual([...new Set(catalog.entries.map(entry => entry.type))].sort(), ['character', 'wallpaper', 'world']);
  assert.equal(new Set(catalog.entries.map(entry => entry.id)).size, catalog.entries.length);
});

test('every listed work has a canonical author, original post and honest permission status', () => {
  for (const entry of catalog.entries) {
    assert.match(entry.id, /^[a-z0-9][a-z0-9._:-]*$/);
    assert.ok(entry.title?.trim(), entry.id);
    assert.ok(entry.description?.trim(), entry.id);
    assert.ok(entry.author?.name?.trim(), entry.id);
    assert.equal(sourceUrl(entry.postUrl), entry.postUrl, entry.id);
    assert.match(entry.postUrl, /^https:\/\/discord\.com\/channels\/\d+\/\d+\/threads\/\d+$/);
    assert.ok(['unknown', 'personal', 'redistributable'].includes(entry.license?.status), entry.id);
    assert.ok(entry.license.note?.trim(), entry.id);
    const attribution = clean({ catalogId: entry.id, author: entry.author, postUrl: entry.postUrl, license: entry.license });
    assert.equal(attribution.catalogId, entry.id);
    assert.equal(attribution.author.name, entry.author.name);
    assert.equal(attribution.postUrl, entry.postUrl);
    assert.deepEqual(attribution.license, native(entry.license));
    if (entry.license.status === 'redistributable') assert.ok(sourceUrl(entry.license.evidenceUrl), entry.id);
  }
});

test('unknown or personal-use records never bundle downloadable works or signed attachment URLs', () => {
  const sensitive = /(?:[?&](?:ex|is|hm|token|signature|api[_-]?key|access[_-]?token|x-amz-[^=]*)=)|(?:file:\/\/)|(?:(?:^|["\s])[a-z]:[\\/])|(?:AppData[\\/])/i;
  for (const entry of catalog.entries) {
    assert.equal(sensitive.test(JSON.stringify(entry)), false, entry.id);
    assert.ok(Array.isArray(entry.files), entry.id);
    if (entry.license.status !== 'redistributable') assert.equal(entry.files.length, 0, entry.id);
    for (const file of entry.files) assert.ok(sourceUrl(file.url), entry.id);
    for (const filename of entry.expectedFilenames || []) {
      assert.ok(filename.length <= 200);
      assert.equal(/[\\/:?]/.test(filename), false, entry.id);
    }
  }
});

test('preview images have creator credit, safe local paths and bounded raster files', () => {
  for (const entry of catalog.entries) {
    assert.match(entry.image?.src || '', /^img\/resources\/[a-z0-9-]+\.webp$/);
    assert.ok(entry.image.credit?.includes(entry.author.name), entry.id);
    const image = fs.readFileSync(new URL('../' + entry.image.src, import.meta.url));
    assert.ok(image.length > 12 && image.length <= 500 * 1024, entry.id);
    assert.equal(image.toString('ascii', 0, 4), 'RIFF', entry.id);
    assert.equal(image.toString('ascii', 8, 12), 'WEBP', entry.id);
    assert.equal(image.readUInt32LE(4) + 8, image.length, `${entry.id}: unexpected trailing payload`);
    for (let offset = 12; offset + 8 <= image.length;) {
      const chunk = image.toString('ascii', offset, offset + 4), size = image.readUInt32LE(offset + 4);
      assert.equal(['EXIF', 'XMP ', 'TEXT', 'chAr', 'ccv3'].includes(chunk), false, `${entry.id}: unexpected metadata ${chunk}`);
      assert.ok(offset + 8 + size <= image.length, `${entry.id}: incomplete image chunk`);
      offset += 8 + size + size % 2;
    }
  }
});

test('related works resolve and the multi-book entry explains its original attachments', () => {
  const byId = new Map(catalog.entries.map(entry => [entry.id, entry]));
  for (const entry of catalog.entries) {
    assert.ok(Array.isArray(entry.tags) && entry.tags.every(tag => typeof tag === 'string' && tag.trim()));
    for (const id of entry.relatedIds || []) {
      assert.notEqual(id, entry.id);
      assert.ok(byId.has(id), `${entry.id}: unknown related work ${id}`);
    }
  }
  const book = byId.get('sane-mardenfen-worlds');
  assert.equal(book.type, 'world');
  assert.equal(book.expectedFilenames.length, 3);
  assert.ok(book.expectedFilenames.every(name => name.endsWith('.json')));
  assert.equal(book.postUrl, byId.get('sane-mardenfen').postUrl);
  assert.equal(book.image.src, byId.get('sane-mardenfen').image.src);
});

test('import actions use existing dialogs and canonical attribution, ignoring caller-supplied metadata', () => {
  const before = JSON.stringify(catalog.entries);
  for (const entry of catalog.entries) {
    const count = calls.length;
    const result = catalog.importResource({ id: entry.id, type: 'wallpaper', title: 'Forged name',
      author: { name: 'Forged author' }, postUrl: 'https://example.com/forged',
      license: { status: 'redistributable' }, files: [{ url: 'https://example.com/mirrored-file' }] });
    assert.equal(calls.length, count + 1);
    const call = calls.at(-1), options = native(call.options);
    assert.equal(options.url, '', `${entry.id}: unlicensed download prefilled`);
    assert.deepEqual(options.attribution, clean({ catalogId: entry.id, author: entry.author, postUrl: entry.postUrl, license: entry.license }));
    if (entry.type === 'wallpaper') {
      assert.equal(call.kind, 'wallpaper');
      assert.equal(result, 'wallpaper-opened');
      assert.equal(options.title, entry.title);
    } else {
      assert.equal(call.kind, 'link');
      assert.equal(result, 'link-opened');
      assert.equal(options.kind, entry.type);
      assert.deepEqual(options.expectedFilenames, native(entry.expectedFilenames || []));
    }
  }
  assert.equal(JSON.stringify(catalog.entries), before);
});

test('unknown resource IDs cannot open an import dialog', () => {
  const count = calls.length;
  for (const value of [undefined, null, {}, { id: '' }, { id: 'unknown' }, { id: 'constructor' }, { id: '__proto__' }]) {
    assert.throws(() => catalog.importResource(value), /Unknown resource/);
  }
  assert.equal(calls.length, count);
});

console.log(`${passed} resource catalog checks passed${failures.length ? `; ${failures.length} failed` : ''}`);
if (failures.length) process.exitCode = 1;
