import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { test } from 'node:test';

function environment() {
  const storage=new Map();
  const ctx=vm.createContext({console,crypto:webcrypto,TextEncoder,TextDecoder,Uint8Array,Uint32Array,DataView,structuredClone,atob,btoa,
    localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)}});
  for (const file of ['resource-source','png','formats','store','folder-import','model','history']) {
    vm.runInContext(fs.readFileSync(new URL('../js/'+file+'.js',import.meta.url),'utf8'),ctx,{filename:file});
  }
  return {ctx,storage,S:ctx.TAStore,F:ctx.TAFormats,I:ctx.TAFolderImport};
}
const native=v=>JSON.parse(JSON.stringify(v));
test('a corrupt or malformed legacy library stays byte-for-byte recoverable until explicit recovery',()=>{
  for(const raw of ['','{','{}','{"characters":5}','{"worldBooks":[{"id":"b","entries":null}]}']) {
    const {storage,S}=environment();
    const previous=S.emptyLibrary(); previous.meta.name='Last good draft';
    storage.set(S.KEY+'.previous',JSON.stringify(previous));storage.set(S.KEY,raw);
    const result=S.load();assert.ok(result.corrupt);assert.equal(result.raw,raw);assert.equal(result.previous.meta.name,'Last good draft');
    assert.throws(()=>S.save(S.emptyLibrary()));assert.equal(storage.get(S.KEY),raw);
    assert.throws(()=>S.recover(raw,{}));assert.equal(storage.get(S.KEY),raw);
    S.recover(raw,previous);assert.equal(S.load().library.meta.name,'Last good draft');
  }
});

test('old optional collections become usable without modifying the saved bytes or authored metadata', () => {
  const {storage,S} = environment();
  const author = { publisher:'Fixture Press', flags:[false,0], extra:{credits:['author','editor']} };
  const old = { characters:[{id:'c',name:'Keeper',stMetadata:author}],
    worldBooks:[{id:'empty'},{id:'b',entries:[{id:'e',content:'East',secondary_keys:['gate']}]}],
    groups:[{id:'g'}], scripts:[{id:'s'}], chats:[{id:'c'}], stickerPacks:[{id:'p'}],
    quickReplySets:[{id:'q'}], promptPresets:[{id:'t'}], themes:[{id:'theme'}], regexScripts:[{id:'regex'}],
    sections:{style:{custom:'Ink',publisher:author},future:{edition:3}}, graph:{nodes:[{id:'n',label:'Gate'}]} };
  const raw = JSON.stringify(old,null,2);
  storage.set(S.KEY,raw);
  const {library} = S.load();
  assert.equal(storage.get(S.KEY),raw);
  for (const value of [library.characters[0].tags,library.characters[0].alternate_greetings,library.characters[0].expressionAssetIds,
    library.worldBooks[0].entries,library.worldBooks[1].entries[0].keys,library.groups[0].members,library.chats[0].messages,
    library.chats[0].bookmarks,library.scripts[0].beats,library.stickerPacks[0].stickers,library.promptPresets[0].blocks,
    library.quickReplySets[0].replies,library.graph.edges,library.timeline.notes,library.timeline.beats]) assert.deepEqual(native(value),[]);
  assert.deepEqual(native(library.worldBooks[1].entries[0].secondaryKeys),['gate']);
  assert.deepEqual(native(library.sections.future),{edition:3});
  assert.deepEqual(native(library.sections.style.publisher),author);
  assert.deepEqual(native(library.characters[0].stMetadata),author);
  assert.ok(Number.isFinite(library.graph.nodes[0].x) && Number.isFinite(library.graph.nodes[0].y));
  const original = JSON.parse(raw);
  const normalized = S.verify(original);
  assert.equal(JSON.stringify(original,null,2),raw);
  assert.deepEqual(native(S.verify(normalized)),native(normalized));
});

test('malformed nested collections, identity collisions and non-text values enter recovery before rendering', () => {
  for (const invalid of [
    {graph:{nodes:[null]}}, {graph:{edges:[3]}}, {timeline:{notes:[[]]}}, {timeline:{beats:[null]}},
    {graph:{nodes:[{id:'n',label:9}]}}, {graph:{nodes:[{id:'n',x:'left'}]}}, {timeline:{notes:[{id:'n',floor:'first'}]}},
    {groups:[{id:'g',members:[null]}]}, {groups:[{id:'g',members:[{}]}]},
    {scripts:[{id:'s',beats:[[]]}]}, {stickerPacks:[{id:'s',stickers:[{name:22}]}]},
    {chats:[{id:'t',messages:[null]}]}, {chats:[{id:'t',bookmarks:[false]}]}, {chats:[{id:'t',bookmarks:[{index:-2}]}]},
    {characters:[{id:'c',tags:'one'}]}, {characters:[{id:'c',alternate_greetings:[null]}]},
    {characters:[{id:'c',expressionAssetIds:[{}]}]}, {characters:[{id:'c',description:{}}]},
    {characters:[{id:3},{id:'3'}]}, {characters:[{name:'Missing ID'}]}, {worldBooks:[{id:'w',entries:[{id:'e',keys:'gate'}]}]},
    {themes:[{id:'blue',vars:[]}]}, {sections:{pov:'first'}}, {settings:{folderImports:[]}},
  ]) {
    const {storage,S} = environment();
    const raw = JSON.stringify({characters:[],...invalid},null,2), good = JSON.stringify(S.emptyLibrary());
    storage.set(S.KEY,raw);
    storage.set(S.KEY+'.previous',good);
    const result = S.load();
    assert.equal(result.corrupt,true,raw);
    assert.equal(result.raw,raw);
    assert.ok(result.previous,raw);
    assert.throws(() => S.save(S.emptyLibrary()));
    assert.equal(storage.get(S.KEY),raw);
    assert.equal(storage.get(S.KEY+'.previous'),good);
  }
});

test('invalid legacy writes and failed quota retries keep both saved copies', () => {
  const {ctx,storage,S} = environment(), previous=S.emptyLibrary();
  previous.meta.name='Last good version';
  const current=JSON.stringify(S.emptyLibrary()), backup=JSON.stringify(previous);
  storage.set(S.KEY,current);storage.set(S.KEY+'.previous',backup);
  const {library}=S.load();
  assert.throws(()=>S.save({...library,graph:{edges:[null]}}),/graph\.edges/);
  assert.equal(storage.get(S.KEY),current);
  assert.equal(storage.get(S.KEY+'.previous'),backup);
  ctx.localStorage.setItem=(key,value)=>{
    if(key===S.KEY)throw Object.assign(new Error('quota'),{name:'QuotaExceededError'});
    storage.set(key,value);
  };
  assert.throws(()=>S.save(library),error=>error.code==='quota');
  assert.equal(storage.get(S.KEY),current);
  assert.equal(storage.get(S.KEY+'.previous'),backup);
  const fresh = environment();
  fresh.storage.set(fresh.S.KEY,' {broken ');
  assert.throws(()=>fresh.S.save(fresh.S.emptyLibrary()));
  assert.equal(fresh.storage.get(fresh.S.KEY),' {broken ');
});

test('legacy quota and concurrent writers preserve the current good library',()=>{
  const {ctx,storage,S}=environment();storage.set(S.KEY,JSON.stringify(S.emptyLibrary()));
  const live=S.load().library;const prior=storage.get(S.KEY);
  live.meta.name='Next';ctx.localStorage.setItem=()=>{throw Object.assign(new Error('quota'),{name:'QuotaExceededError'});};
  assert.throws(()=>S.save(live),error=>error.code==='quota');assert.equal(storage.get(S.KEY),prior);
  storage.set(S.KEY,prior+' ');assert.throws(()=>S.save(live));assert.equal(storage.get(S.KEY),prior+' ');
});
test('ST character metadata, V3 PNG, companion book IDs and activation settings survive editing',()=>{
  const {ctx,F}=environment();
  const custom={nested:{theme:'plum'}};
  const original={spec:'chara_card_v3',spec_version:'3.0',fav:true,create_date:'2025-01-01',data:{name:'Atlas',description:'Original',tags:[],group_only_greetings:['Hello'],extensions:{custom,fav:true,talkativeness:0,depth_prompt:{depth:0,role:'user',prompt:'Local cue'},quilvori_source:{postUrl:'file:///private'}}}};
  const card=F.cardToCharacter(original);card.description='Edited';
  const nativeBook={name:'Index',description:'Archive',extensions:{publisher:'Fixture'},entries:{12:{uid:12,comment:'Door',key:['door'],content:'Closed',depth:0,position:4,group:'Doors',ignoreBudget:true,probability:87,selectiveLogic:3,extensions:{custom}}}};
  const book=F.worldInfoToBook(nativeBook);
  const result=F.characterToCard(card,book);
  assert.equal(result.spec,'chara_card_v3');assert.equal(result.create_date,'2025-01-01');
  assert.equal(result.data.extensions.talkativeness,0);assert.deepEqual(native(result.data.extensions.depth_prompt),original.data.extensions.depth_prompt);
  assert.deepEqual(native(result.data.extensions.custom),custom);assert.deepEqual(native(result.data.group_only_greetings),['Hello']);
  assert.equal(result.data.extensions.quilvori_source,undefined);assert.equal(result.data.description,'Edited');
  const back=F.bookToWorldInfo(F.worldInfoToBook(result.data.character_book));
  assert.equal(back.entries[12].depth,0);assert.equal(back.entries[12].group,'Doors');assert.equal(back.entries[12].ignoreBudget,true);
  assert.equal(back.entries[12].selectiveLogic,3);assert.equal(back.entries[12].probability,87);assert.deepEqual(native(back.entries[12].extensions.custom),custom);
  const pixel=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZlsAAAAASUVORK5CYII=','base64'));
  const png=ctx.TAPng.embedChara(pixel,JSON.stringify(result));
  assert.equal(JSON.parse(ctx.TAPng.readChara(png)).data.character_book.entries[0].id,12);
});
test('standard user folder scanning reads only supported files, reports bad chats and retains header and swipes',async()=>{
  const {S,I}=environment();
  const file=(path,contents)=>({webkitRelativePath:path,name:path.split('/').at(-1),arrayBuffer:async()=>new TextEncoder().encode(contents).buffer});
  const qrHeader={user_name:'u',character_name:'Atlas',chat_metadata:{note:'fixture'}};
  const chat=JSON.stringify(qrHeader)+'\n'+JSON.stringify({name:'Atlas',mes:'Map',swipes:['Map','Atlas'],extra:{id:17}});
  const files=[file('profile/characters/test.json',JSON.stringify({data:{name:'Atlas',character_book:{name:'Empty',entries:[]}}})),
    file('profile/worlds/book.json','{"entries":{"0":{"key":["map"],"content":"A path"}}}'),
    file('profile/chats/Atlas/session.jsonl',chat),file('profile/chats/Atlas/bad.jsonl','{'),
    file('profile/secrets.json','ignored'),file('profile/characters/Atlas/expression.png','ignored')];
  const source=I.profileFiles(files), initial=S.emptyLibrary();
  const {library,report}=await I.importAll(initial,source.paths,source);
  assert.equal(report.cards,1);assert.equal(report.books,2);assert.equal(report.chats,1);assert.equal(report.failed[0].name,'Atlas/bad.jsonl');
  assert.equal(initial.chats.length,0);const saved=library.chats[0];assert.equal(saved.stOwner,'Atlas');assert.deepEqual(native(saved.stHeader),qrHeader);
  assert.deepEqual(native(saved.messages[0].swipes),['Map','Atlas']);assert.equal(saved.messages[0].extra.id,17);
  assert.ok(library.worldBooks.some(b=>b.id===library.characters[0].embeddedBookId && b.name==='Empty'));
  saved.messages[0].mes='Edited locally';
  const again=await I.importAll(library,source.paths,source);assert.equal(again.report.unchanged,3);assert.equal(again.library.chats[0].messages[0].mes,'Edited locally');
});
test('model profile switches and stale provider responses keep credentials and capabilities scoped',async()=>{
  const {ctx,storage}=environment(),M=ctx.NIJANModel;
  ctx.AbortController=AbortController;ctx.setTimeout=setTimeout;ctx.clearTimeout=clearTimeout;
  storage.set('nijan-model',JSON.stringify({baseUrl:'https://fixture.invalid/v1',key:'test-only',model:'legacy'}));
  let resolveFetch;
  ctx.fetch=()=>new Promise(resolve=>{resolveFetch=resolve;});
  const request=M.listModels();M.newProfile('Checking');assert.equal(M.load().key,'');
  resolveFetch({ok:true,json:async()=>({data:[{id:'foreign',context_length:10000}]})});
  await assert.rejects(request);assert.deepEqual(native(M.rememberedModels()),[]);
  M.selectProfile('default');assert.equal(M.load().key,'test-only');assert.equal(M.load().model,'legacy');
  ctx.fetch=async()=>({ok:true,json:async()=>({data:[{id:'legacy',context_length:12345,supported_reasoning_efforts:['low','medium'],default_reasoning_effort:'low'}]})});
  await M.listModels();assert.equal(M.capabilities().context,12345);assert.equal(M.capabilities().recommended,'low');
  M.save({model:'unlisted'});assert.equal(M.capabilities().context,0);
});
test('world snapshot diff names individual fields, entry membership, and ordering',()=>{
  const {ctx}=environment();
  const old={id:'a',name:'Old title',entries:[{id:'1',comment:'Map',content:'North'},{id:'2',comment:'Road',content:'West'}]};
  const next={id:'a',name:'New title',entries:[{...old.entries[1]},{...old.entries[0],content:'South'},{id:'3',comment:'Key',content:'Iron'}]};
  const diffs=native(ctx.TAHistory.diff(old,next));
  assert.ok(diffs.some(row=>row.path==='Map / content' && row.before==='North' && row.after==='South'));
  assert.ok(diffs.some(row=>row.path==='Key' && row.after.id==='3'));assert.ok(diffs.some(row=>row.path==='条目顺序'));
});
