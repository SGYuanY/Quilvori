import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../js');
const context = {
  console, TextEncoder, TextDecoder, btoa, atob, crypto, structuredClone,
  Uint8Array, Uint32Array, DataView, Array, Object, String, Number, JSON,
  Math, Date, Map, Set, RegExp, Error, Promise, parseInt, isNaN,
};
context.globalThis = context;
context.window = context;
vm.createContext(context);
for (const file of ['png.js', 'formats.js', 'store.js']) {
  vm.runInContext(fs.readFileSync(path.join(dir, file), 'utf8'), context, { filename: file });
}

const { TAPng, TAFormats: F, TAStore: Store } = context;
const lib = Store.demoLibrary();
const failures = [];
const check = (name, ok, detail) => { if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`); };

check('four complete cards', lib.characters.filter((c) => c.character_version !== '0.1.0').length >= 4);
check('world book', lib.worldBooks[0].entries.length >= 6);
check('group', lib.groups[0].members.length >= 3);
check('chat', lib.chats[0].messages.length >= 6);
check('regex', lib.regexScripts.length >= 3);
check('quick', lib.quickReplySets[0].replies.length >= 4);
check('timeline', lib.timeline.notes.length >= 2 && lib.timeline.beats.length >= 2);
check('graph', lib.graph.nodes.length >= 4 && lib.graph.edges.length >= 4);
check('themes', lib.themes.length >= 3);
check('script', lib.scripts[0].beats.length >= 4);

const shen = lib.characters.find((c) => c.id === 'ch_shen');
const card = F.characterToCard(shen, lib.worldBooks[0]);
check('card spec', card.spec === 'chara_card_v2' && card.spec_version === '2.0');
check('card data', card.data.name === '沈听雨' && card.data.first_mes.includes('说一半'));
check('card book', card.data.character_book.entries.length === lib.worldBooks[0].entries.length);
const back = F.cardToCharacter(card);
check('card roundtrip', back.name === '沈听雨' && back.alternate_greetings.length === shen.alternate_greetings.length);

const wi = F.bookToWorldInfo(lib.worldBooks[0]);
check('wi key', Array.isArray(wi.entries['0'].key) && wi.entries['0'].key.includes('听雨楼'));
check('wi position', wi.entries['0'].position === 0 && wi.entries['0'].disable === false);
const entries = F.worldInfoToEntries(wi);
check('wi roundtrip', entries[0].keys.includes('听雨楼') && entries[0].position === 'before_char');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const embedded = TAPng.embedChara(png, JSON.stringify(card));
const read = TAPng.readChara(embedded);
check('png chara', JSON.parse(read).data.name === '沈听雨');
const chunks = TAPng.parseChunks(embedded);
check('png before iend', chunks.at(-2).type === 'tEXt' && chunks.at(-1).type === 'IEND');

const regex = F.regexToExport(lib.regexScripts);
check('regex array', Array.isArray(regex) && regex[0].placement.includes(2) && regex[0].scriptName);
const qr = F.qrToExport(lib.quickReplySets[0]);
check('qr v2', qr.version === 2 && qr.qrList.length === 4 && qr.qrList[0].message);
const preset = F.presetToExport(lib.promptPresets[0]);
check('preset order', preset.prompts.length === 4 && preset.prompt_order[0].order.length === 4);
const group = F.groupToExport(lib.groups[0], lib);
check('group members', group.members.some((m) => m.name === '白衡' && m.talkativeness === 0.22));

const jsonl = [
  JSON.stringify({ user_name: '客人', character_name: '沈听雨', chat_metadata: {} }),
  JSON.stringify({ name: '客人', is_user: true, mes: '进来了', send_date: 'November 22, 2026 9:14pm' }),
  JSON.stringify({ name: '沈听雨', is_user: false, mes: '说一半', send_date: 'November 22, 2026 9:14pm' }),
].join('\n');
const chat = F.chatFromText(jsonl, '雨.jsonl');
check('jsonl', chat.messages.length === 2 && chat.userName === '客人' && chat.messages[1].mes === '说一半');
const arrayChat = F.chatFromText(JSON.stringify([{ name: '你', is_user: true, mes: '嗯' }]), 'a.json');
check('json array', arrayChat.messages.length === 1);

const findings = Object.fromEntries(lib.characters.map((c) => [c.name, F.checkConsistency(lib, c.id, 'book_tingyu')]));
for (const name of ['沈听雨', '白衡', '顾晚棠', '阿柿']) {
  const errors = findings[name].filter((item) => item.severity === 'error');
  check(`${name} clean`, errors.length === 0, JSON.stringify(errors));
}
const draft = findings['未名客'];
check('draft empty personality', draft.some((item) => item.title.includes('性格')));
check('draft typo', draft.some((item) => item.highlight === '沈听语'));
check('draft eyes', draft.some((item) => item.title.includes('瞳')));
check('draft fire', draft.some((item) => item.severity === 'error' && item.highlight === '烧毁'));
check('draft drink', draft.some((item) => item.title.includes('酒')));

const replaced = Store.normalize(F.backupLibrary(F.backupOf(lib)));
check('backup', replaced.characters.length === lib.characters.length && replaced.chats[0].bookmarks.length === 2);
const merged = Store.merge(Store.emptyLibrary(), lib);
check('merge', merged.graph.edges.length === lib.graph.edges.length && merged.themes.length === 3);

const pattern = F.regexFromString('/[“"]([^”"]+)[”"]/g');
check('regex run', '她说“雨”。'.replace(pattern, '「$1」') === '她说「雨」。');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('roundtrip ok', {
  characters: lib.characters.length,
  lore: lib.worldBooks[0].entries.length,
  draftFindings: draft.map((item) => item.title),
});
