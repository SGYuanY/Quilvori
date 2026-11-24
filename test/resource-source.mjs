import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { clean, sourceUrl } = require('../js/resource-source');
const context = vm.createContext({ console, URL, TextEncoder, TextDecoder, Uint8Array, Uint32Array, DataView,
  structuredClone, btoa, atob, crypto: webcrypto, setTimeout, clearTimeout, AbortController });
for (const name of ['resource-source', 'png', 'formats', 'store', 'ai-tasks', 'link-import']) {
  vm.runInContext(fs.readFileSync(new URL(`../js/${name}.js`, import.meta.url), 'utf8'), context, { filename: name });
}
const { TAFormats: F, TAStore: S, TALinkImport: L, NIJANAI: A, TAPng: P } = context;
const native = value => JSON.parse(JSON.stringify(value));
const encode = value => new TextEncoder().encode(JSON.stringify(value));
const file = value => ({ url: 'https://example.com/resource.json?signature=temporary', filename: 'resource.json', bytes: encode(value) });
const credit = (name = 'Original author') => ({ catalogId: 'resource-1', author: { name, profileUrl: 'https://example.com/author' },
  postUrl: 'https://discord.com/channels/1/2/3', license: { status: 'personal', note: 'Personal use only.', evidenceUrl: 'https://example.com/license' } });
const entry = { comment: 'A small rule', content: 'The gate closes at dusk.', keys: ['gate'], secondaryKeys: [],
  constant: false, selective: true, order: 110, position: 'before_char', enabled: true, depth: 4 };
const book = source => ({ name: 'Gate notes', description: 'A companion book.', entries: [{ ...entry }], ...(source ? { source } : {}) });
const card = source => ({ name: 'Gatekeeper', description: 'Keeps the gate.', personality: '', scenario: '', first_mes: 'Welcome.',
  creator: 'Creator recorded in the original card', creator_notes: 'Keep this note.', alternate_greetings: [], tags: [], ...(source ? { source } : {}) });
let count = 0;
async function test(name, run) { await run(); count++; console.log('ok', name); }
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }

await test('attribution is copied through a field allowlist without mutating frozen input', () => {
  const raw = credit();
  raw.url = 'https://example.com/download?token=private-download-token';
  raw.localPath = 'C:\\private\\collection.json'; raw.apiKey = 'synthetic-private-key'; raw.kind = 'link';
  raw.author.email = 'private@example.com'; raw.license.session = 'private-session';
  const before = JSON.stringify(raw), result = clean(freeze(raw));
  assert.deepEqual(result, credit());
  assert.equal(JSON.stringify(raw), before);
  result.author.name = 'Changed copy'; assert.equal(raw.author.name, 'Original author');
  assert.deepEqual(native(context.TAResourceSource.clean(raw)), clean(raw));
});

await test('original Discord and GitHub posts stay source links while sensitive query and fragments disappear', () => {
  assert.equal(sourceUrl('https://discord.com/channels/1/2/3?utm_source=feed&token=private#access_token=private'), 'https://discord.com/channels/1/2/3');
  assert.equal(sourceUrl('https://github.com/example/project/discussions/7?thread=3&a%70i_key=private&X-Amz-Signature=private'), 'https://github.com/example/project/discussions/7?thread=3');
  assert.equal(sourceUrl('https://example.com/post?id=7&ex=123&is=456&hm=private&session_id=private'), 'https://example.com/post?id=7');
  assert.equal(sourceUrl('https://example.com/post?id=7&AWSAccessKeyId=private&access_key=private&oauth_verifier=private'), 'https://example.com/post?id=7');
  assert.throws(() => L.normalizeUrl('https://discord.com/channels/1/2/3'));
});

await test('required attribution rejects unsafe, private, credential-bearing and oversized source URLs', () => {
  for (const url of ['http://example.com/post', 'file:///C:/private/a.json', 'javascript:alert(1)',
    'https://user:password@example.com/post', 'https://localhost/post', 'https://host.local/post', 'https://host.internal/post',
    'https://127.0.0.1/post', 'https://127.1/post', 'https://2130706433/post', 'https://0x7f000001/post',
    'https://10.0.0.1/post', 'https://172.16.0.1/post', 'https://192.168.1.1/post', 'https://169.254.1.1/post',
    'https://100.64.0.1/post', 'https://[::1]/post', 'https://[::ffff:127.0.0.1]/post', 'https://[fe80::1]/post',
    'https://[fc00::1]/post', 'https://[2001:db8::1]/post', 'https://example.com:8443/post',
    'https://example.com/' + 'a'.repeat(2048)]) {
    assert.equal(clean({ ...credit(), postUrl: url }), null, url.split('?')[0]);
  }
  assert.equal(clean({ ...credit(), author: { name: ' ' } }), null);
  assert.equal(clean({ ...credit(), author: { name: 'x'.repeat(161) } }), null);
  for (const value of [null, undefined, [], {}, { postUrl: 'https://example.com' }]) assert.equal(clean(value), null);
  assert.ok(sourceUrl('https://[2606:4700:4700::1111]/post'));
});

await test('invalid optional details are omitted and unrecognized permission states remain unknown', () => {
  const source = credit(); source.catalogId = '../private.json'; source.author.profileUrl = 'file:///C:/private';
  source.license = { status: 'allowed-everywhere', note: 'x'.repeat(4001), evidenceUrl: 'https://localhost/license' };
  assert.deepEqual(clean(source), { author: { name: 'Original author' }, postUrl: source.postUrl, license: { status: 'unknown' } });
  assert.equal(clean({ ...credit(), license: undefined }).license.status, 'unknown');
});

await test('character JSON and PNG round trips retain creator, notes and only public source metadata', () => {
  const source = { ...credit(), url: 'https://example.com/card?token=private', localPath: 'C:\\private', apiKey: 'secret' };
  const original = freeze(card(source)), exported = F.characterToCard(original);
  assert.deepEqual(native(exported.data.extensions.quilvori_source), clean(source));
  assert.ok(!JSON.stringify(exported).includes('private'));
  const pixel = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZlsAAAAASUVORK5CYII=', 'base64'));
  for (const json of [JSON.parse(JSON.stringify(exported)), JSON.parse(P.readChara(P.embedChara(pixel, JSON.stringify(exported))))]) {
    const imported = F.cardToCharacter(json);
    assert.deepEqual(native(imported.source), clean(source));
    assert.equal(imported.creator, original.creator); assert.equal(imported.creator_notes, original.creator_notes);
    assert.equal(imported.description, original.description);
  }
});

await test('standalone, wrapped and embedded world books preserve their own attribution and entry settings', () => {
  const source = credit('World author'), original = freeze(book(source));
  const worldInfo = F.bookToWorldInfo(original), embedded = F.bookToCharacterBook(original);
  const exportedCard = F.characterToCard(card(credit('Card author')), original);
  for (const value of [worldInfo, { data: worldInfo }, embedded, exportedCard, { character: exportedCard }]) {
    const imported = F.worldInfoToBook(value, 'Fallback title');
    assert.deepEqual(native(imported.source), source);
    assert.equal(imported.entries[0].content, entry.content);
    assert.equal(imported.entries[0].order, entry.order); assert.equal(imported.entries[0].depth, entry.depth);
    assert.equal(imported.entries[0].constant, false);
  }
});

await test('world envelopes retain outer attribution without borrowing attribution from the enclosing character', () => {
  const source = credit('World author'), exported = F.bookToWorldInfo(book(source));
  const envelope = { data: { entries: exported.entries }, extensions: exported.extensions };
  assert.deepEqual(native(F.worldInfoToBook(envelope).source), source);
  const character = F.characterToCard(card(credit('Card author')), book());
  assert.equal(F.worldInfoToBook(character).source, undefined);
  assert.equal(F.worldInfoToBook({ character }).source, undefined);
  assert.equal(F.worldInfoToBook([character]).source, undefined);
});

await test('old cards and world books without source metadata remain importable and export no invented credit', () => {
  const exported = F.characterToCard(card(), book());
  assert.equal(exported.data.extensions.quilvori_source, undefined);
  assert.equal(F.cardToCharacter(exported).source, undefined);
  assert.equal(F.worldInfoToBook(F.bookToWorldInfo(book())).source, undefined);
  assert.equal(F.bookToCharacterBook(book()).extensions.quilvori_source, undefined);
  const invalid = F.characterToCard(card()); invalid.data.extensions.quilvori_source = { postUrl: 'https://example.com/post' };
  assert.equal(F.cardToCharacter(invalid).source, undefined);
});

await test('explicit directory credit takes priority without rewriting the original creator or authored text', async () => {
  const original = F.characterToCard(card(credit('File author'))), directory = credit('Directory author');
  const prepared = await L.prepare(file(original), { kind: 'character', attribution: freeze(directory) });
  assert.deepEqual(native(prepared.attribution), directory);
  assert.equal(prepared.character.creator, original.data.creator);
  const library = S.emptyLibrary(), receipt = A.commit(library, L.plan(library, prepared, 'Imported card'));
  const imported = library.characters[0];
  assert.equal(imported.source.kind, 'link'); assert.equal(imported.source.url, 'https://example.com/resource.json');
  assert.deepEqual(native(clean(imported.source)), directory); assert.equal(imported.creator, original.data.creator);
  assert.ok(!JSON.stringify(imported.source).includes('temporary'));
  L.undo(library, receipt); assert.equal(library.characters.length, 0);
});

await test('file-provided attribution is read when no directory source was supplied', async () => {
  const source = credit(), cardFile = F.characterToCard(card(source)), worldFile = F.bookToWorldInfo(book(source));
  for (const [value, options] of [[cardFile, { kind: 'character' }], [worldFile, {}]]) {
    const prepared = await L.prepare(file(value), options);
    assert.deepEqual(native(prepared.attribution), source);
    const library = S.emptyLibrary(); A.commit(library, L.plan(library, prepared, 'Imported'));
    const imported = options.kind ? library.characters[0] : library.worldBooks[0];
    assert.deepEqual(native(clean(imported.source)), source);
  }
});

await test('companion books keep independent attribution rather than assuming the enclosing card author owns them', async () => {
  const directory = credit('Directory author'), companion = credit('Companion author');
  for (const ownSource of [companion, null]) {
    const exported = F.characterToCard(card(credit()), book(ownSource));
    const prepared = await L.prepare(file(exported), { kind: 'character', attribution: directory });
    const library = S.emptyLibrary(); A.commit(library, L.plan(library, prepared, 'Bundle'));
    assert.deepEqual(native(clean(library.characters[0].source)), directory);
    assert.deepEqual(native(clean(library.worldBooks[0].source)), ownSource);
    assert.equal(library.characters[0].source.embeddedBookId, library.worldBooks[0].id);
  }
  const exported = F.characterToCard(card(credit()), book());
  const prepared = await L.prepare(file(exported), { kind: 'character', attribution: directory, embeddedAttribution: companion });
  assert.deepEqual(native(prepared.embedded.attribution), companion);
});

await test('repeated imports keep existing creator, attribution, IDs and manual edits untouched', async () => {
  const exported = F.characterToCard(card(credit())), library = S.emptyLibrary();
  const prepared = await L.prepare(file(exported), { kind: 'character' });
  A.commit(library, L.plan(library, prepared, 'First copy'));
  library.characters[0].creator = 'Local creator edit'; library.characters[0].description += ' A local note.';
  const before = JSON.stringify(library);
  const incoming = await L.prepare(file(exported), { kind: 'character', attribution: credit('Different directory credit') });
  const plan = L.plan(library, incoming, 'Second copy');
  assert.equal(plan.existingId, library.characters[0].id); assert.equal(plan.operations.length, 0);
  assert.equal(JSON.stringify(library), before);
});

console.log(`${count} resource attribution checks passed`);
