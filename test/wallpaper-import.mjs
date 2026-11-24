import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const pixel = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZlsAAAAASUVORK5CYII=', 'base64'));
const attribution = { catalogId: 'wallpaper-sample', author: { name: 'Example artist' }, postUrl: 'https://example.com/art/1', license: { status: 'personal', note: 'Personal use only.' } };
const imageUrl = (size = 24) => 'data:image/webp;base64,' + Buffer.alloc(size, 7).toString('base64');
const native = value => JSON.parse(JSON.stringify(value));
function environment() {
  const nodes = new Map(), classes = new Set();
  const host = { innerHTML: '', onclick: null, classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)) },
    querySelector(selector) {
      const name = selector.match(/\[([^\]]+)\]/)?.[1];
      if (!name || !this.innerHTML.includes(name)) return null;
      if (!nodes.has(name)) nodes.set(name, { focus() {}, remove() {}, value: '' });
      return nodes.get(name);
    }, querySelectorAll() { return []; } };
  const document = { activeElement: { isConnected: true, focus() {} }, getElementById: () => host,
    addEventListener() {}, removeEventListener() {}, createElement: () => ({ getContext: () => ({ drawImage() {} }), toDataURL: () => imageUrl() }) };
  const context = vm.createContext({ console, URL, Blob, TextEncoder, TextDecoder, Uint8Array, DataView, AbortController,
    crypto: webcrypto, document, setTimeout, clearTimeout, structuredClone,
    createImageBitmap: async () => ({ width: 1, height: 1, close() {} }) });
  for (const name of ['resource-source', 'store', 'link-import', 'wallpaper-import']) {
    vm.runInContext(fs.readFileSync(new URL(`../js/${name}.js`, import.meta.url), 'utf8'), context, { filename: name });
  }
  const saved = [], toasts = [], routes = [];
  context.TAUI = { state: { lib: context.TAStore.emptyLibrary(), save: 'saved', sel: {} }, t: value => value, esc: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;'),
    go: route => routes.push(route), toast: (message, options) => toasts.push({ message, options }), renderStage() {}, pickFile: async () => null };
  context.TAStore.save = library => saved.push(native(library));
  return { context, W: context.TAWallpaperImport, host, saved, toasts, routes, classes };
}
function pngSize(width, height) { const bytes = pixel.slice(); const view = new DataView(bytes.buffer); view.setUint32(16, width); view.setUint32(20, height); return bytes; }
function jpegSize(width, height) {
  const metadata = Buffer.from('private-location-data'), app = Buffer.alloc(metadata.length + 4);
  app[0] = 255; app[1] = 225; app.writeUInt16BE(metadata.length + 2, 2); metadata.copy(app, 4);
  const sof = Buffer.from([255,192,0,11,8,0,0,0,0,1,1,17,0]); sof.writeUInt16BE(height, 5); sof.writeUInt16BE(width, 7);
  return Uint8Array.from(Buffer.concat([Buffer.from([255,216]), app, sof, Buffer.from([255,217])]));
}
function webpSize(width, height) {
  const bytes = Buffer.alloc(30); bytes.write('RIFF'); bytes.writeUInt32LE(22, 4); bytes.write('WEBP', 8); bytes.write('VP8X', 12); bytes.writeUInt32LE(10, 16);
  bytes.writeUIntLE(width - 1, 24, 3); bytes.writeUIntLE(height - 1, 27, 3); return Uint8Array.from(bytes);
}
const main = environment(), { W } = main;
let total = 0;
async function test(name, run) { await run(); total++; console.log('ok', name); }
const prepared = await W.prepare(pixel, { decode: async () => ({ width: 1, height: 1, close() {} }), encode: () => imageUrl() });

await test('PNG, JPEG and WebP are recognized from bytes instead of a supplied extension or MIME label', () => {
  assert.deepEqual(native(W.inspect(pixel)), { mime: 'image/png', width: 1, height: 1 });
  assert.deepEqual(native(W.inspect(jpegSize(640, 480))), { mime: 'image/jpeg', width: 640, height: 480 });
  assert.deepEqual(native(W.inspect(webpSize(1920, 1080))), { mime: 'image/webp', width: 1920, height: 1080 });
});

await test('unsafe formats, truncated containers and resource limits are rejected before decoding', async () => {
  let decoded = 0;
  for (const bytes of [new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), new TextEncoder().encode('<html>not an image</html>'),
    new TextEncoder().encode('GIF89a'), new Uint8Array(), pixel.slice(0, 12), webpSize(100, 100).slice(0, 25),
    jpegSize(10, 10).slice(0, 12), pngSize(8193, 1), pngSize(8000, 6000), pngSize(0, 10),
    new Uint8Array(W.MAX_BYTES + 1)]) {
    await assert.rejects(() => W.prepare(bytes, { decode: async () => { decoded++; throw new Error('decoder should not run'); } }));
  }
  assert.equal(decoded, 0);
  assert.equal(W.inspect(pngSize(8192, 1)).width, 8192);
});

await test('images are decoded and reencoded to a bounded thumbnail rather than storing original metadata', async () => {
  let closed = false; const attempts = [];
  const result = await W.prepare(jpegSize(3840, 2160), {
    decode: async (_bytes, mime) => { assert.equal(mime, 'image/jpeg'); return { width: 3840, height: 2160, close() { closed = true; } }; },
    encode: (_bitmap, width, height, quality) => { attempts.push({ width, height, quality }); return imageUrl(attempts.length === 1 ? W.MAX_SAVED_BYTES + 1 : 240); },
  });
  assert.equal(closed, true); assert.equal(attempts.length, 2);
  assert.ok(attempts[0].width <= 1600); assert.ok(attempts[1].width < attempts[0].width);
  assert.equal(result.mime, 'image/webp'); assert.equal(result.bytes, 240);
  assert.equal(result.originalWidth, 3840); assert.equal(result.width, attempts[1].width);
  assert.ok(!result.dataUrl.includes('private-location-data')); assert.match(result.fingerprint, /^[a-f0-9]{64}$/);
});

await test('decode failures, excessive decoded dimensions and incompressible results release image resources', async () => {
  await assert.rejects(() => W.prepare(pixel, { decode: async () => { throw new Error('corrupt file'); } }), error => error.code === 'wallpaper-decode');
  let closed = 0;
  await assert.rejects(() => W.prepare(pixel, { decode: async () => ({ width: 9000, height: 9000, close() { closed++; } }) }), error => error.code === 'wallpaper-dimensions');
  await assert.rejects(() => W.prepare(pixel, { decode: async () => ({ width: 100, height: 100, close() { closed++; } }), encode: () => imageUrl(W.MAX_SAVED_BYTES + 1) }), error => error.code === 'wallpaper-save-size');
  assert.equal(closed, 2);
});

await test('cancellation during image decoding prevents encoding and closes the decoded bitmap', async () => {
  const controller = new AbortController(); let finish, encoded = false, closed = false;
  const pending = W.prepare(pixel, { signal: controller.signal, decode: () => new Promise(resolve => { finish = resolve; }), encode: () => { encoded = true; return imageUrl(); } });
  controller.abort(); finish({ width: 1, height: 1, close() { closed = true; } });
  await assert.rejects(() => pending, error => error.code === 'cancelled'); assert.equal(encoded, false); assert.equal(closed, true);
});

await test('import plans only add a background asset, preserve public attribution and leave the current background unchanged', () => {
  const library = main.context.TAStore.emptyLibrary(); library.settings.chatBackgroundAssetId = 'existing-background';
  const before = JSON.stringify(library);
  const result = W.buildImport(library, prepared, { title: 'Evening', url: 'https://example.com/wallpaper.webp?token=temporary', attribution: { ...attribution, apiKey: 'private', localPath: 'C:\\private\\art.png' } });
  assert.equal(JSON.stringify(library), before); assert.equal(result.library.assets.length, 1);
  const asset = result.library.assets[0]; assert.equal(asset.kind, 'background'); assert.equal(asset.name, 'Evening');
  assert.equal(asset.source.author.name, attribution.author.name); assert.equal(asset.source.postUrl, attribution.postUrl);
  assert.deepEqual(native(asset.source.license), attribution.license); assert.equal(asset.source.url, 'https://example.com/wallpaper.webp');
  assert.ok(!JSON.stringify(asset).includes('private')); assert.ok(!JSON.stringify(asset).includes('temporary'));
  assert.equal(result.library.settings.chatBackgroundAssetId, 'existing-background');
});

await test('missing attribution, missing title and insufficient local capacity never produce a changed library', () => {
  const library = main.context.TAStore.emptyLibrary(), before = JSON.stringify(library);
  assert.throws(() => W.buildImport(library, prepared, { title: 'Photo' }), error => error.code === 'wallpaper-source');
  assert.throws(() => W.buildImport(library, prepared, { title: ' ', attribution }), error => error.code === 'wallpaper-name');
  assert.equal(JSON.stringify(library), before);
  library.extra = 'x'.repeat(4.2 * 1024 * 1024);
  const full = JSON.stringify(library);
  assert.throws(() => W.buildImport(library, prepared, { title: 'Photo', attribution }), error => error.code === 'wallpaper-capacity');
  assert.equal(JSON.stringify(library), full);
});

await test('a repeated image reuses the existing asset without overwriting its name or attribution', () => {
  const first = W.buildImport(main.context.TAStore.emptyLibrary(), prepared, { title: 'My original name', attribution });
  const before = JSON.stringify(first.library);
  const second = W.buildImport(first.library, prepared, { title: 'Replacement name', attribution: { ...attribution, author: { name: 'Another artist' } } });
  assert.equal(second.existingId, first.assetId); assert.equal(second.library, undefined); assert.equal(JSON.stringify(first.library), before);
});

await test('undo removes only the imported asset and refuses references or later manual edits', () => {
  const base = main.context.TAStore.emptyLibrary(); base.assets.push({ id: 'unrelated', name: 'Keep me' });
  const first = W.buildImport(base, prepared, { title: 'Undo sample', attribution });
  const restored = W.undo(first.library, first.receipt); assert.deepEqual(native(restored), native(base));
  for (const use of ['background', 'avatar', 'expression', 'edited']) {
    const later = structuredClone(first.library);
    if (use === 'background') later.settings.chatBackgroundAssetId = first.assetId;
    if (use === 'avatar') later.characters.push({ avatarAssetId: first.assetId });
    if (use === 'expression') later.characters.push({ expressionAssetIds: [first.assetId] });
    if (use === 'edited') later.assets[0].name = 'Edited later';
    const before = JSON.stringify(later);
    assert.throws(() => W.undo(later, first.receipt), error => error.code === (use === 'edited' ? 'wallpaper-edited' : 'import-in-use'));
    assert.equal(JSON.stringify(later), before);
  }
});

await test('closing during download aborts the request and prevents late preview or save', async () => {
  const env = environment(); let finish, signal, decoded = 0;
  env.context.TALinkImport.download = (_url, options) => { signal = options.signal; return new Promise(resolve => { finish = resolve; }); };
  env.context.createImageBitmap = async () => { decoded++; throw new Error('must not decode'); };
  env.W.open({ title: 'Pending', url: 'https://example.com/a.png', attribution });
  const pending = env.host.querySelector('[data-wallpaper-download]').onclick(); env.W.close();
  assert.equal(signal.aborted, true); finish({ bytes: pixel, url: 'https://example.com/a.png' }); await pending;
  assert.equal(env.host.innerHTML, ''); assert.equal(env.saved.length, 0); assert.equal(decoded, 0); assert.equal(env.classes.has('show'), false);
});

await test('save failure leaves the active library untouched and successful local import waits for explicit confirmation', async () => {
  const env = environment(); const original = env.context.TAUI.state.lib;
  original.settings.chatBackgroundAssetId = 'keep-background';
  env.context.TAUI.pickFile = async () => ({ name: 'local-image.png', size: pixel.length, arrayBuffer: async () => pixel.buffer });
  env.W.open({ title: 'Local image', attribution });
  await env.host.querySelector('[data-wallpaper-local]').onclick();
  assert.equal(env.saved.length, 0); assert.equal(env.context.TAUI.state.lib, original);
  env.host.querySelector('[data-wallpaper-apply]').onclick();
  assert.equal(env.saved.length, 0, 'a file selected under an author must be confirmed before attributing it');
  env.host.querySelector('[data-wallpaper-source-confirm]').onchange({ target: { checked: true } });
  env.context.TAStore.save = () => { throw Object.assign(new Error('quota'), { code: 'quota' }); };
  env.host.querySelector('[data-wallpaper-apply]').onclick();
  assert.equal(env.context.TAUI.state.lib, original); assert.equal(original.assets.length, 0); assert.equal(env.routes.length, 0);
  env.context.TAStore.save = next => env.saved.push(native(next));
  env.host.querySelector('[data-wallpaper-apply]').onclick();
  assert.equal(env.saved.length, 1); assert.equal(env.context.TAUI.state.lib.assets.length, 1);
  assert.equal(env.context.TAUI.state.lib.settings.chatBackgroundAssetId, 'keep-background');
  assert.equal(env.context.TAUI.state.lib.assets[0].source.kind, 'file');
  assert.equal(env.context.TAUI.state.lib.assets[0].source.url, undefined);
  assert.equal(env.routes.at(-1), 'assets');
});

await test('changing the selected wallpaper resets source confirmation and does not carry it to another file', async () => {
  const env = environment();
  env.context.TAUI.pickFile = async () => ({ name: 'first.png', size: pixel.length, arrayBuffer: async () => pixel.buffer });
  env.W.open({ title: 'Source-bound image', attribution });
  await env.host.querySelector('[data-wallpaper-local]').onclick();
  env.host.querySelector('[data-wallpaper-source-confirm]').onchange({ target: { checked: true } });
  env.context.TAUI.pickFile = async () => ({ name: 'different.png', size: pixel.length, arrayBuffer: async () => pixel.buffer });
  await env.host.querySelector('[data-wallpaper-local]').onclick();
  env.host.querySelector('[data-wallpaper-apply]').onclick();
  assert.equal(env.saved.length, 0); assert.equal(env.context.TAUI.state.lib.assets.length, 0);
});

await test('standalone resource pages retain the success toast and its usable undo action', async () => {
  const env = environment(); env.context.document.body = { dataset: { page: 'resources' } };
  env.context.TAUI.pickFile = async () => ({ name: 'photo.png', size: pixel.length, arrayBuffer: async () => pixel.buffer });
  env.W.open({ title: 'From source', attribution });
  await env.host.querySelector('[data-wallpaper-local]').onclick();
  env.host.querySelector('[data-wallpaper-source-confirm]').onchange({ target: { checked: true } });
  env.host.querySelector('[data-wallpaper-apply]').onclick();
  assert.equal(env.context.TAUI.state.lib.assets.length, 1); assert.equal(env.routes.length, 0);
  env.toasts.find(toast => toast.options?.action)?.options.action.onClick();
  assert.equal(env.context.TAUI.state.lib.assets.length, 0); assert.equal(env.saved.length, 2);
});

console.log(`${total} wallpaper import checks passed`);
