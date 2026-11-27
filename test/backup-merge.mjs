import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const ctx = vm.createContext({ structuredClone, Date });
for (const file of ['store', 'formats']) vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`, import.meta.url),'utf8'), ctx);
const store = ctx.TAStore;
const base = store.emptyLibrary();
base.characters = [{id:'c', name:'Local', scenario:'Local scene', tags:['old']}];
base.worldBooks = [{id:'w', name:'Local book', description:'Notes', entries:[
  {id:'one',comment:'One',content:'First',enabled:true,keys:['key']},
  {id:'two',comment:'Two',content:'Second'},
  {id:'new-local',comment:'Local only',content:'Keep me'},
]}];
base.promptPresets = [{id:'p',name:'Prompt',blocks:[{id:'b',name:'Keep',content:'Original'},{id:'b-local',name:'Addition'}]}];
base.quickReplySets = [{id:'q',name:'Replies',replies:[{id:'r',label:'Old',message:'Original'},{id:'r-local',message:'Local only'}]}];
base.groups = [{id:'g',members:[{characterId:'c',talkativeness:.8},{characterId:'c-new',talkativeness:.4}]}];
base.scripts = [{id:'s',beats:[{id:'beat',line:'Local'},{id:'local-beat',line:'New line'}]}];
base.chats = [{id:'thread',messages:[{id:'m1',mes:'Old text'},{mes:'Local tail'}],bookmarks:[{id:'mark',index:0}]}];
base.assets = [{id:'a',name:'Image',dataUrl:'data:text/plain,a'}];
base.sections.style.custom = 'Keep writing style';
base.settings.folderImports = { 'previous-key':{id:'a',hash:'hash-a'} };
base.memoryHtml = '<p>My current note</p>';
const incoming = {
  characters:[{id:'c',name:'From backup',tags:[]},{id:'new',name:'Imported'}],
  worldBooks:[{id:'w',name:'Renamed',entries:[{id:'two',comment:'First in backup'},{id:'one',content:'Edited',enabled:false},{id:'three',content:'Imported'}]}],
  promptPresets:[{id:'p',blocks:[{id:'b',content:'Updated'}]}],
  quickReplySets:[{id:'q',replies:[{id:'r',label:'Updated'}]}],
  groups:[{id:'g',members:[{characterId:'c',talkativeness:0}]}],
  scripts:[{id:'s',beats:[{id:'beat',line:'Restored'}]}],
  chats:[{id:'thread',messages:[{id:'m1',mes:'Restored'}],bookmarks:[]}],
  settings:{folderImports:{'restored-key':{id:'w',hash:'hash-w'}}},
  memoryHtml:'<p>Other note</p>',
};
const original = JSON.stringify(base), exported = JSON.stringify(ctx.TAFormats.backupOf(incoming));
const raw = ctx.TAFormats.backupLibrary(JSON.parse(exported));
store.verify(raw);
const merged = store.merge(base,raw);
assert.deepEqual(Array.from(merged.characters,c=>c.id),['c','new']);
assert.equal(merged.characters[0].name,'From backup');
assert.equal(merged.characters[0].scenario,'Local scene');
assert.equal(merged.characters[0].tags.length,0);
const world = merged.worldBooks[0];
assert.deepEqual(Array.from(world.entries,e=>e.id),['two','one','three','new-local']);
assert.equal(world.entries[0].content,'Second');
assert.equal(world.entries[1].content,'Edited');
assert.equal(world.entries[1].enabled,false);
assert.equal(world.entries[1].keys[0],'key');
assert.equal(world.description,'Notes');
assert.deepEqual(Array.from(merged.promptPresets[0].blocks,b=>b.id),['b','b-local']);
assert.equal(merged.promptPresets[0].blocks[0].name,'Keep');
assert.equal(merged.quickReplySets[0].replies[0].message,'Original');
assert.equal(merged.quickReplySets[0].replies.length,2);
assert.equal(merged.groups[0].members[0].talkativeness,0);
assert.equal(merged.groups[0].members[1].characterId,'c-new');
assert.equal(merged.scripts[0].beats[1].id,'local-beat');
assert.equal(merged.chats[0].bookmarks[0].id,'mark');
assert.equal(merged.chats[0].messages[0].mes,'Restored');
assert.equal(merged.chats[0].messages[1].mes,'Local tail');
assert.equal(merged.assets[0].dataUrl,'data:text/plain,a');
assert.equal(merged.sections.style.custom,'Keep writing style');
assert.deepEqual(Object.keys(merged.settings.folderImports),['previous-key','restored-key']);
assert.equal(merged.memoryHtml,base.memoryHtml);
assert.equal(store.merge({...base,memoryHtml:'  '},raw).memoryHtml,incoming.memoryHtml);
assert.equal(JSON.stringify(store.merge(merged,raw)),JSON.stringify(merged));
assert.equal(JSON.stringify(base),original);
assert.deepEqual(raw,incoming);
for (const entries of [[{id:'one'},{id:'one'}],[{comment:'Missing ID'}]]) {
  assert.throws(()=>store.merge(base,{worldBooks:[{id:'w',entries}]}),/编号/);
  assert.equal(JSON.stringify(base),original);
}

const asChat = (messages,bookmarks=[]) => ({characters:[],chats:[{id:'thread',messages,bookmarks}]});
const line = (mes,extra={}) => ({name:'Keeper',is_user:false,mes,...extra});
const opening = line('East gate',{swipes:['East gate','West gate'],stExtra:{publisher:'Folio'}});
const shortChat = asChat([line('East gate',{swipes:['East gate']})]);
const fullChat = asChat([opening,line('Second arrival')],[{index:1,excerpt:'Second'}]);
for (const [local,backup] of [[shortChat,fullChat],[fullChat,shortChat]]) {
  const joined = store.merge(local,backup).chats[0];
  assert.deepEqual(Array.from(joined.messages,item=>item.mes),['East gate','Second arrival']);
  assert.deepEqual(Array.from(joined.messages[0].swipes),['East gate','West gate']);
  assert.deepEqual(Array.from(joined.bookmarks,item=>item.excerpt),['Second']);
  assert.equal(joined.messages[0].stExtra.publisher,'Folio');
}
const histories = JSON.stringify(fullChat);
for (const split of [asChat([line('A different gate')]),asChat([line('East gate',{swipes:['East gate','North gate']})])]) {
  const raw = JSON.stringify(split);
  assert.throws(()=>store.merge(fullChat,split),/聊天记录/);
  assert.equal(JSON.stringify(fullChat),histories);
  assert.equal(JSON.stringify(split),raw);
}
const repeatedIds=asChat([line('One',{id:'native'}),line('Two',{id:'native'})]);
assert.throws(()=>store.merge(repeatedIds,asChat([line('Changed',{id:'native'})])),/聊天记录/);

const withPack = stickers => ({characters:[],stickerPacks:[{id:'pack',stickers}]});
const smile={name:'smile.png',dataUrl:'data:image/png;base64,AA=='},frown={name:'frown.png',dataUrl:'data:image/png;base64,AQ=='};
const oldPack=withPack([{...smile,author:'Folio'}]), newPack=withPack([frown,smile]);
const expressions=store.merge(oldPack,newPack).stickerPacks[0].stickers;
assert.deepEqual(Array.from(expressions,image=>image.name),['frown.png','smile.png']);
assert.equal(expressions[1].author,'Folio');
assert.deepEqual(Array.from(store.merge(newPack,withPack([])).stickerPacks[0].stickers,image=>image.name),['frown.png','smile.png']);
assert.throws(()=>store.merge(oldPack,withPack([{...smile,dataUrl:frown.dataUrl}])),/同名/);
assert.deepEqual(oldPack.stickerPacks[0].stickers,[{...smile,author:'Folio'}]);

const marker = JSON.parse('{"__proto__":{"edition":"personal"},"constructor":{"credit":"bookbinder"},"prototype":{"ink":"gold"}}');
const metadata = JSON.parse('{"characters":[{"id":"c","stMetadata":{}}],"settings":{},"sections":{"style":{}}}');
metadata.characters[0].stMetadata.extensions=marker;
Object.defineProperty(metadata.settings,'__proto__',{enumerable:true,value:{edition:'paper'}});
Object.defineProperty(metadata.sections.style,'__proto__',{enumerable:true,value:{edition:'oak'}});
Object.defineProperty(metadata,'__proto__',{enumerable:true,value:{edition:'first'}});
metadata['graph.nodes']=['custom extension data'];
const safe=store.merge(base,metadata);
for (const branch of [safe,safe.settings,safe.sections.style,safe.characters[0].stMetadata.extensions]) {
  assert.ok(Object.hasOwn(branch,'__proto__'));
  assert.equal(Object.getPrototypeOf(branch).edition,undefined);
  assert.equal(branch.edition,undefined);
}
assert.deepEqual(JSON.parse(JSON.stringify(safe.characters[0].stMetadata.extensions)),marker);
assert.deepEqual(Array.from(safe['graph.nodes']),['custom extension data']);
const inherited=Object.create({edition:'not stored'});inherited.print='linen';
const copied=store.merge(base,{characters:[{id:'c',stMetadata:inherited}]}).characters[0].stMetadata;
assert.equal(Object.hasOwn(copied,'edition'),false);assert.equal(copied.print,'linen');
const legacyKeys=store.merge(base,{worldBooks:[{id:'w',entries:[{id:'one',secondary_keys:['new key']}]}]}).worldBooks[0].entries[0];
assert.deepEqual(Array.from(legacyKeys.secondaryKeys),['new key']);

console.log('Backup merge preserves nested drafts, author metadata, chat history, bookmarks, expression files and local HTML notes.');

for (const file of ['creation-records','work-backup']) {
  vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`,import.meta.url),'utf8'),ctx);
}
const response={id:'ok',task:'create:character',startedAt:'2026-01-01T00:00:00Z',status:'validated',output:'A short draft.'};
const empty={...response,id:'empty',status:'error',output:'',emptyReason:'reasoning',errorCode:'empty-output'};
const state=ctx.TAWorkBackup.normalize({drafts:[],versions:[],limits:[],records:[empty,response,{...empty,id:'other'}]});
const packet=ctx.TAFormats.backupOf(base,state);
assert.deepEqual(Array.from(packet.workState.records,row=>row.id),['ok'],'older v2 readers receive responses with text');
assert.deepEqual(Array.from(packet.workState.requestsWithoutOutput,row=>row.index),[0,2]);
assert.deepEqual(Array.from(ctx.TAFormats.readBackup(packet).workState.records,row=>row.id),['empty','ok','other']);
const legacyPacket=structuredClone(packet);
delete legacyPacket.workState.requestsWithoutOutput;
assert.deepEqual(Array.from(ctx.TAFormats.readBackup(legacyPacket).workState.records,row=>row.id),['ok']);
for (const badIndex of [-1,0,3,'2']) {
  const invalid=structuredClone(packet);
  invalid.workState.requestsWithoutOutput[1].index=badIndex;
  assert.throws(()=>ctx.TAFormats.readBackup(invalid),/requestsWithoutOutput/);
}
console.log('Backups keep legacy v2 response rows readable and restore terminal notices in order.');
