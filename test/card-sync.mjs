import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {deflateSync} from 'node:zlib';

const require = createRequire(import.meta.url);
globalThis.TAResourceSource = require('../js/resource-source.js');
for (const script of ['png','formats','world-sync','card-sync']) require('../js/'+script+'.js');
const {TACardSync:sync,TAFormats:formats,TAPng:png} = globalThis;
const copy = structuredClone;
const error = code => failure => failure?.code === code;
const fieldRows = plan => plan.rows.map(row => [row.uid,row.field,row.kind]);
const decisions = (plan,side) => Object.fromEntries(plan.rows.filter(row => row.kind === 'conflict').map(row => [row.key,side]));
const decode = (bytes,name='Harbor.png') => sync.decode(bytes,name);
const v2 = () => ({spec:'chara_card_v2',spec_version:'2.0',data:{name:'Harbor',description:'A harbor pilot.'}});
const v3 = () => ({...v2(),spec:'chara_card_v3',spec_version:'3.0'});
const source = (name='Sample author') => ({author:{name},postUrl:'https://example.org/original',license:{status:'personal'}});
function library(raw) {
  const {book:native,...fields} = formats.cardToCharacter(raw);
  const card = {...fields,id:0,avatarAssetId:'local-portrait',expressionAssetIds:['wave'],pinned:true};
  if (!native) return {card,book:null};
  const imported = formats.worldInfoToBook(native,'',true);
  const book = {...imported,id:0,coverAssetId:'cover',entries:imported.entries.map((row,index) => ({...row,id:index,graphSource:{index}}))};
  card.embeddedBookId = book.id;
  return {card,book};
}
function review(base,work,disk) {return sync.review(base,work.card,work.book,disk,'Harbor.png');}
function result(plan,choices) {return sync.resolve(JSON.parse(JSON.stringify(plan)),choices);}

test('sparse tagged and flat JSON round-trip byte-for-byte, including BOM, newline and scalar types',() => {
  const flat = {name:'Legacy Harbor',description:'',creatorcomment:'Legacy notes',talkativeness:'0.5',avatar:'legacy.png',chat:'thread',plugin:{x:1}};
  const normal = v2(); normal.data.character_version = 3; normal.data.extensions = {talkativeness:'0.50'};
  for (const raw of [normal,v3(),flat]) {
    const bytes = Buffer.from('\uFEFF'+JSON.stringify(raw,null,'\t').replaceAll('\n','\r\n')+'\r\n');
    const file = decode(bytes,'card.JSON'), work = library(raw), p = review(null,work,file.document);
    assert.deepEqual(fieldRows(p),[]); const out = result(p);
    assert.deepEqual(out.card,work.card); assert.deepEqual(out.document,raw);
    assert.deepEqual(Buffer.from(sync.encode(file,out.document)),bytes);
    work.card.creator_notes = 'Edited notes'; const edited = result(review(raw,work,file.document));
    const serialized = Buffer.from(sync.encode(file,edited.document));
    assert.equal(serialized.subarray(0,3).toString('hex'),'efbbbf');
    assert.match(serialized.toString(),/\r\n\t"/); assert.ok(serialized.toString().endsWith('\r\n'));
    if (raw === flat) {assert.equal(edited.document.creatorcomment,'Edited notes'); assert.ok(!Object.hasOwn(edited.document,'creator_notes'));}
    else assert.equal(edited.document.data.creator_notes,'Edited notes');
    assert.deepEqual(decode(serialized,'card.json').document,edited.document);
  }
});

test('independent authored changes combine while file-owned chat, external world and local identities stay intact',() => {
  const base = {...v2(),name:'Harbor',description:'A harbor pilot.',chat:'Conversation - 19',avatar:'Harbor.png',fav:true,create_date:'2020'};
  base.data.extensions = {world:'External Harbor',fav:true,widget:{level:3,style:'ink'},talkativeness:'0.50'};
  base.data.addon = {a:1,b:2}; base.headerTool = {n:1};
  const work = library(base); work.card.description = 'Draws charts.';
  work.card.stMetadata.extensions.widget.style = 'paper'; work.card.stMetadata.extra.addon.b = 4;
  work.card.stMetadata.header.chat = 'Unrelated local chat'; work.card.stMetadata.extensions.world = 'Another local work';
  const disk = copy(base); disk.data.scenario = 'On shore'; disk.data.extensions.widget.level = 9;
  disk.data.addon.a = 7; disk.chat = 'Current ST chat'; disk.headerTool.n = 6;
  const plan = review(base,work,disk);
  assert.deepEqual(fieldRows(plan).sort(),[[null,'description','local'],[null,'scenario','disk'],
    [null,'extensions.widget.style','local'],[null,'extensions.widget.level','disk'],
    [null,'extra.addon.b','local'],[null,'extra.addon.a','disk'],[null,'header.headerTool.n','disk']].sort());
  const out = result(plan); const expected = copy(disk);
  expected.description = expected.data.description = work.card.description;
  expected.data.extensions.widget.style = 'paper'; expected.data.addon.b = 4;
  assert.deepEqual(out.document,expected);
  assert.equal(out.card.id,0); assert.equal(out.card.avatarAssetId,'local-portrait'); assert.deepEqual(out.card.expressionAssetIds,['wave']);
  assert.equal(out.card.scenario,'On shore'); assert.deepEqual(out.card.stMetadata.extensions.widget,{style:'paper',level:9});
  assert.deepEqual(fieldRows(review(out.document,{card:out.card,book:null},out.document)),[]);
  assert.equal(base.data.description,'A harbor pilot.'); assert.equal(disk.data.extensions.widget.style,'ink');
});

test('initial differences and concurrent edits require explicit field choices, including null versus missing',() => {
  const base = v2(); base.data.extensions = {plugin:{value:null}};
  const work = library(base); work.card.description = 'Local'; delete work.card.stMetadata.extensions.plugin.value;
  const initial = review(null,work,base);
  assert.throws(() => result(initial),error('card.unresolved'));
  const nullable = initial.rows.find(row => row.field === 'extensions.plugin.value');
  assert.deepEqual([nullable.basePresent,nullable.localPresent,nullable.diskPresent,nullable.disk],[false,false,true,null]);
  const disk = copy(base); disk.data.description = 'Disk'; disk.data.extensions.plugin.value = 2;
  const p = review(base,work,disk);
  for (const side of ['local','disk']) {
    const out = result(p,decisions(p,side));
    assert.equal(out.document.data.description,side === 'local' ? 'Local' : 'Disk');
    assert.deepEqual(out.document.data.extensions.plugin,side === 'local' ? {} : {value:2});
  }
});

function embeddedCard() {
  const raw = v3();
  raw.data.character_book = {name:'Port register',extensions:{edition:'first'},entries:[
    {id:'0',comment:'East pier',content:'Open',keys:['pier'],extra:{origin:'east'},extensions:{widget:{x:1,y:2}}},
    {id:7,comment:'West pier',content:'Closed',keys:['lamp']},
  ]};
  return raw;
}
test('embedded-book changes merge by native ID including zero, without changing representation or library links',() => {
  const base = embeddedCard(), work = library(base);
  assert.deepEqual(fieldRows(review(null,work,base)),[]);
  work.book.entries[0].content = '{"content":"literal JSON prose"}';
  work.book.entries[0].stExtensions.widget.x = 3; work.book.entries[0].stEmbedded.extra.origin = 'old east';
  const disk = copy(base);
  disk.data.character_book.entries[0].keys = ['pier','boat']; disk.data.character_book.entries[0].extensions.widget.y = 8;
  disk.data.character_book.entries[1].comment = 'Western quay'; disk.data.character_book.extensions.edition = 'second';
  const p = review(base,work,disk);
  assert.deepEqual(fieldRows(p).sort(),[[0,'character_book.content','local'],[0,'character_book.keys','disk'],
    [0,'character_book.extensions.widget.x','local'],[0,'character_book.extensions.widget.y','disk'],
    [0,'character_book.extra.origin','local'],[7,'character_book.comment','disk'],[null,'character_book.extensions.edition','disk']].sort());
  const out = result(p); const first = out.document.data.character_book.entries[0];
  assert.equal(first.id,'0'); assert.equal(first.content,work.book.entries[0].content); assert.equal(first.extra.origin,'old east');
  assert.deepEqual(first.extensions.widget,{x:3,y:8}); assert.deepEqual(first.keys,['pier','boat']);
  assert.deepEqual(Object.keys(first).sort(),Object.keys(base.data.character_book.entries[0]).sort());
  assert.deepEqual(out.book.entries[0].graphSource,{index:0}); assert.equal(out.book.entries[0].id,0);
  assert.equal(out.book.coverAssetId,'cover'); assert.equal(out.book.entries[1].comment,'Western quay');
  assert.equal(out.card.embeddedBookId,0); assert.equal(out.book.id,0);
  assert.deepEqual(fieldRows(review(out.document,{card:out.card,book:out.book},out.document)),[]);
});

test('embedded additions use distinct IDs, merged order and durable entry references; edits conflict with deletion',() => {
  const base = embeddedCard(), work = library(base), disk = copy(base);
  work.book.entries.splice(1,0,{id:'new-local',comment:'Soundings',content:'Depth',keys:['lead']});
  disk.data.character_book.entries.splice(1,0,{id:1,comment:'Tides',content:'Two',keys:['tide']});
  const p = review(base,work,disk); assert.ok(p.rows.every(row => row.kind !== 'conflict'));
  const out = result(p), entries = out.document.data.character_book.entries;
  assert.deepEqual(entries.map(row => Number(row.id)).sort((a,b) => a-b),[0,1,2,7]);
  assert.equal(entries.at(-1).id,7);
  assert.equal(out.book.entries.find(row => row.stUid === 2).id,'new-local');
  assert.equal(out.book.entries.find(row => row.stUid === 1).id,'lore_sync_1');
  assert.deepEqual(fieldRows(review(out.document,{card:out.card,book:out.book},out.document)),[]);
  const altered = library(base); altered.book.entries[0].content = 'New';
  const deleted = copy(base); delete deleted.data.character_book;
  const conflict = review(base,altered,deleted);
  assert.deepEqual(fieldRows(conflict),[[null,'character_book','conflict']]);
  const detached = result(conflict,decisions(conflict,'disk'));
  assert.equal(detached.book,null); assert.equal(detached.card.embeddedBookId,undefined);
  const restored = result(conflict,decisions(conflict,'local')), baseline = copy(base.data.character_book);
  baseline.entries[0].content = 'New'; assert.deepEqual(restored.document.data.character_book,baseline);
  const missing = copy(base); missing.data.character_book.entries.shift();
  const partial = review(base,altered,missing);
  assert.deepEqual(result(partial,decisions(partial,'local')).document.data.character_book.entries[0],baseline.entries[0]);
  const newCard = library(deleted), add = result(review(deleted,newCard,base));
  assert.equal(add.book.id,'book_sync_0'); assert.equal(add.card.embeddedBookId,add.book.id);
  assert.equal(add.book.entries[1].stUid,7);
});

test('implicit array IDs, sparse entry aliases and vendor fields named like envelopes stay synchronized',() => {
  const raw = v3();
  raw.data.character_book = {name:'Mixed identifiers',data:{entries:[{content:'Vendor only'}]},originalData:{stamp:3},entries:[
    {id:'7',content:'Numbered'},{content:'Implicit UID one',depth:4,enabled:true,disable:false,order:100,
      body:'Implicit UID one',extensions:{depth:4}},{id:12,content:'Later'},
  ]};
  const work = library(raw);
  // Simulate a legacy card import that used the embedded format but did not assign
  // the missing positional ID or recognize object fields named like import envelopes.
  const book = formats.worldInfoToBook({data:{character_book:raw.data.character_book}},'',true);
  work.book = {...book,id:0,stBookFields:{data:raw.data.character_book.data,originalData:{stamp:3}},
    entries:book.entries.map((entry,index) => ({...entry,id:index}))};
  assert.deepEqual(fieldRows(review(null,work,raw)),[]);
  const first = result(review(null,work,raw)); assert.equal(first.book.entries[1].stUid,1);
  first.book.entries[1].depth = 7; first.book.entries[1].order = 80; first.book.entries[1].enabled = false;
  first.book.entries[1].content = 'Updated';
  const out = result(review(raw,first,raw)), entry = out.document.data.character_book.entries[1];
  assert.equal(entry.id,undefined); assert.equal(entry.depth,7); assert.equal(entry.extensions.depth,7);
  assert.equal(entry.order,80); assert.equal(entry.disable,true); assert.equal(entry.body,'Updated');
  assert.deepEqual(out.document.data.character_book.data,raw.data.character_book.data);
  assert.deepEqual(out.document.data.character_book.originalData,{stamp:3});
  assert.deepEqual(fieldRows(review(out.document,out,out.document)),[]);
});

test('model-free validation rejects malformed documents and invalid native IDs before review',() => {
  assert.doesNotThrow(() => sync.validate({name:'Sketch',alternate_greetings:['The tide comes in.']}));
  for (const value of [null,[],{name:'World',entries:{}},{name:'Theme',blur:5}, {spec:'unknown',data:{name:'x'}},
    {spec:'chara_card_v2',data:{name:'x',alternate_greetings:[25]}},JSON.parse('{"name":"x","description":"","__proto__":{}}')]) {
    assert.throws(() => sync.validate(value),error('card.format'));
  }
  for (const rows of [[{id:0,content:'A'},{id:'0',content:'B'}],[{id:0,uid:1,content:'X'}],[{id:-1,content:'N'}]]) {
    const doc = v2(); doc.data.character_book = {entries:rows};
    assert.throws(() => sync.validate(doc),error('card.uid'));
  }
  const raw = embeddedCard(), work = library(raw); work.book.entries[1].id = 0;
  assert.throws(() => review(raw,work,raw),error('card.uid'));
  assert.throws(() => decode(Buffer.from('not json'),'card.json'),error('card.format'));
});

function chunk(type,data) {
  const name = Buffer.from(type), raw = Buffer.alloc(12+data.length);
  raw.writeUInt32BE(data.length,0); name.copy(raw,4); Buffer.from(data).copy(raw,8);
  raw.writeUInt32BE(png.crc32(raw.subarray(4,-4)),raw.length-4);
  return raw;
}
function cardChunk(name,raw,type='tEXt') {
  const payload = Buffer.from(JSON.stringify(raw),'utf8').toString('base64');
  return chunk(type,Buffer.concat([Buffer.from(name),Buffer.alloc(type === 'iTXt' ? 5 : 1),Buffer.from(payload)]));
}
function picture(texts=[],{width=13,color=49,extra=[],tail=Buffer.alloc(0)}={}) {
  const head = Buffer.alloc(13); head.writeUInt32BE(width,0); head.writeUInt32BE(3,4); head[8] = 8; head[9] = 2;
  const pixels = Buffer.alloc(3*(1+width*3),color); for (let y=0;y<3;y++) pixels[y*(1+width*3)] = 0;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),...extra,
    chunk('IDAT',deflateSync(pixels)),...texts,chunk('IEND',Buffer.alloc(0)),tail]);
}
const chunksOf = data => png.parseChunks(data).map(chunk => [chunk.type,Buffer.from(chunk.raw).toString('hex')]);
const imageChunks = data => chunksOf(data).filter(([type]) => ['IHDR','IDAT','IEND'].includes(type));

test('consistent dual PNG variants keep original image, annotations, opaque data and original bytes',async () => {
  const old = v2(), newer = v3(); newer.data.assets = [{type:'icon',uri:'ccdefault:'}]; newer.data.nickname = 'Pilot';
  const comment = chunk('tEXt',Buffer.from('Comment\0An original print')),opaque = chunk('vpAg',Buffer.from('edition'));
  const bytes = picture([cardChunk('ChArA',old),cardChunk('CCV3',newer,'iTXt')],{extra:[comment,opaque],tail:Buffer.from('opaque trailer')});
  const file = decode(bytes); assert.equal(file.needsVariant,false); assert.equal(file.document.spec,'chara_card_v3');
  assert.deepEqual(Buffer.from(sync.encode(file,file.document)),bytes);
  const work = library(newer); work.card.description = 'Changed'; const out = result(review(newer,work,file.document));
  const encoded = sync.encode(file,out.document), read = decode(encoded);
  assert.deepEqual(imageChunks(encoded),imageChunks(bytes)); assert.ok(Buffer.from(encoded).includes(opaque)); assert.ok(Buffer.from(encoded).includes(comment));
  assert.ok(Buffer.from(encoded).subarray(-14).equals(Buffer.from('opaque trailer')));
  assert.equal(read.variants.chara.spec,'chara_card_v2'); assert.equal(read.variants.ccv3.spec,'chara_card_v3');
  assert.equal(read.variants.chara.data.description,'Changed'); assert.equal(read.variants.ccv3.data.description,'Changed');
  assert.equal(read.variants.chara.data.assets,undefined); assert.deepEqual(read.variants.ccv3.data.assets,newer.data.assets);
  assert.equal(JSON.parse(png.readChara(encoded)).data.nickname,'Pilot');
  const bare = sync.portraitBytes(bytes); assert.deepEqual(png.cardVariants(bare),{}); assert.deepEqual(imageChunks(bare),imageChunks(bytes));
  const expected = createHash('sha256');
  for (const part of png.parseChunks(bytes)) if (!['tEXt','iTXt','zTXt','tIME'].includes(part.type)) expected.update(part.raw);
  assert.equal(await sync.portraitFingerprint(bytes),expected.digest('hex'));
  assert.equal(await sync.portraitFingerprint(encoded),await sync.portraitFingerprint(bare));
});

test('divergent chara / ccv3 editions require a choice and reconcile authored fields, retaining each edition’s extras',() => {
  const older = embeddedCard(); older.spec='chara_card_v2'; older.spec_version='2.0';
  const newer = structuredClone(older); newer.spec='chara_card_v3'; newer.spec_version='3.0';
  newer.data.description = 'A V3 revision'; newer.data.source = ['https://example.org/card'];
  newer.data.nickname = 'Pilot'; newer.data.character_book.entries[0].content = 'Revised.';
  newer.data.character_book.entries[0].extensions.v3Only = {ink:'blue'};
  older.data.character_book.entries[0].v2Only = true; older.data.extensions = {oldAddon:8};
  const file = decode(picture([cardChunk('chara',older),cardChunk('ccv3',newer)]));
  assert.equal(file.needsVariant,true); assert.ok(file.variantFields.includes('description'));
  assert.ok(file.variantFields.includes('character_book.content [0]'));
  const differing = file.variantRows.find(row => row.field === 'character_book.content');
  assert.equal(differing.local,newer.data.character_book.entries[0].content);
  assert.equal(differing.disk,older.data.character_book.entries[0].content);
  assert.throws(() => sync.encode(file,file.document),error('card.variant'));
  for (const name of ['chara','ccv3']) {
    const selected = sync.select(file,name), read = decode(sync.encode(file,selected,null,name));
    assert.equal(read.needsVariant,false);
    for (const variant of Object.values(read.variants)) {
      assert.equal(variant.data.description,selected.data.description);
      assert.equal(variant.data.character_book.entries[0].content,selected.data.character_book.entries[0].content);
    }
    assert.equal(read.variants.ccv3.data.nickname,'Pilot'); assert.deepEqual(read.variants.ccv3.data.source,newer.data.source);
    assert.equal(read.variants.chara.data.nickname,undefined);
    assert.deepEqual(read.variants.ccv3.data.character_book.entries[0].extensions.v3Only,{ink:'blue'});
    assert.equal(read.variants.chara.data.character_book.entries[0].v2Only,true);
  }
});

test('only explicit portrait replacement swaps full-resolution image chunks, retaining the original card and credit',async () => {
  const credit = chunk('tEXt',Buffer.from('Author\0Test artist'));
  const original = picture([cardChunk('chara',v2())],{extra:[credit]});
  const foreign = v3(); foreign.data.name = 'Other';
  const replacement = picture([cardChunk('ccv3',foreign)],{width:43,color:88});
  const file = decode(original), encoded = sync.encode(file,file.document,replacement);
  assert.deepEqual(imageChunks(encoded),imageChunks(replacement)); assert.ok(Buffer.from(encoded).includes(credit));
  const parsed = decode(encoded); assert.equal(parsed.document.data.name,'Harbor'); assert.deepEqual(Object.keys(parsed.variants),['chara']);
  assert.equal(await sync.portraitFingerprint(encoded),await sync.portraitFingerprint(replacement));
  assert.notEqual(await sync.portraitFingerprint(encoded),await sync.portraitFingerprint(original));
  const corrupted = Buffer.from(original); corrupted[30] ^= 1;
  assert.throws(() => decode(corrupted),error('card.png')); assert.throws(() => sync.encode(file,file.document,corrupted),error('card.png'));
  assert.throws(() => decode(picture()),error('card.png'));
  assert.throws(() => decode(picture([cardChunk('chara',v2()),cardChunk('CHARA',v2())])),error('card.variant'));
  const international = decode(picture([cardChunk('ccv3',v3(),'iTXt')]));
  const replaced = sync.encode(international,international.document,replacement);
  assert.equal(png.parseChunks(replaced).filter(chunk => chunk.type === 'tEXt').length,1);
  assert.deepEqual(decode(replaced).document,v3());
});

test('confirming a portrait replacement retains safe vendor chunks and does not offer the same change on recheck',async () => {
  const context = vm.createContext({structuredClone,Uint8Array,ArrayBuffer,TextEncoder,TextDecoder,crypto:globalThis.crypto,
    atob,btoa,URL,Blob,createImageBitmap:async blob=>{
      const bytes=Buffer.from(await blob.arrayBuffer());
      assert.ok(png.hasSignature(bytes));
      return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),close(){}};
    }});
  for (const script of ['resource-source','store','png','formats','world-sync','card-sync'])
    vm.runInContext(readFileSync(new URL('../js/'+script+'.js',import.meta.url),'utf8'),context);
  const raw = v2(), extra = chunk('vpAg',Buffer.from('archive provenance'));
  const original = picture([cardChunk('chara',raw)],{extra:[extra]}), replacement = picture([],{width:31,color:102});
  const card = library(raw).card;
  const asset = {id:card.avatarAssetId,kind:'avatar',name:'Synthetic local cover',mime:'image/png',
    bytes:replacement.length,dataUrl:'data:image/png;base64,'+replacement.toString('base64')};
  const state = {lib:context.TAStore.verify({characters:[card],assets:[asset]})};
  let link = null, writes = 0, file = {name:'Harbor.png',target:'fixture',bytes:original,hash:await context.TAFileSync.digest(original)};
  const commit = async (next,...args) => {
    const record = args.at(-1).fileBinding;
    assert.equal(record.expected,link?.stamp ?? null); link = copy(record.next); state.lib = next;
  };
  context.TAUI={state,t:text=>text,flush:async()=>true,commitLibrary:commit};
  context.TALibraryDB={database:()=>true,workBinding:async()=>link};
  context.TAHistory={commitWorks:commit};
  context.nijanDesktop={cardSyncPick:async()=>file,cardSyncRead:async()=>file,
    cardSyncWrite:async(target,expected,bytes,operationId)=>{
      assert.equal(target,file.target); assert.equal(expected,file.hash); writes++;
      const hash=await context.TAFileSync.digest(bytes); file={...file,bytes,hash,receipt:{kind:'write',operationId,hash}}; return file;
    }};
  const session=context.TACardSyncSession, check=async()=>session.prepare(await session.inspect(card.id));
  const first=await check(); assert.equal(first.art.row.kind,'conflict');
  assert.equal(await session.apply(first,{[first.art.row.key]:'local'}),'card.written');
  assert.deepEqual(imageChunks(file.bytes),imageChunks(replacement)); assert.ok(Buffer.from(file.bytes).includes(extra));
  assert.equal(link.baseArt,await sync.portraitFingerprint(file.bytes));
  assert.equal(link.baseLocalArt,await sync.portraitFingerprint(replacement)); assert.notEqual(link.baseArt,link.baseLocalArt);
  const next=await check(); assert.equal(next.art.row,null); assert.equal(next.rows.length,0);
  assert.equal(await session.apply(next,{}),'sync.matched'); assert.equal(writes,1);
});

test('public author credits merge explicitly, survive either reader, and never export local provenance',() => {
  const raw = v2(); const work = library(raw); work.card.description='Edited';
  work.card.source={kind:'link',url:'device-only',embeddedBookId:77};
  const disk = copy(raw); disk.data.extensions = {quilvori_source:source()};
  const p = review(raw,work,disk); assert.ok(p.rows.some(row => row.field === 'attribution' && row.kind === 'disk'));
  const out = result(p);
  assert.deepEqual(out.document.data.extensions.quilvori_source,source());
  assert.deepEqual(out.card.source,{...work.card.source,...source()});
  assert.ok(!JSON.stringify(out.document).includes('device-only'));
  out.card.source.author.name = 'Edited public name';
  const edited = result(review(out.document,{card:out.card,book:null},out.document));
  assert.equal(edited.document.data.extensions.quilvori_source.author.name,'Edited public name');
  assert.deepEqual(Object.keys(edited.document.data.extensions.quilvori_source).sort(),['author','license','postUrl']);
  const newer = {...disk,spec:'chara_card_v3',spec_version:'3.0'};
  const dual = decode(picture([cardChunk('chara',raw),cardChunk('ccv3',newer)]));
  assert.ok(dual.variantFields.includes('attribution'));
  for (const name of ['chara','ccv3']) {
    const selected = sync.select(dual,name);
    assert.deepEqual(selected.data.extensions.quilvori_source,source());
    const synced = decode(sync.encode(dual,selected,null,name));
    for (const edition of Object.values(synced.variants)) assert.deepEqual(edition.data.extensions.quilvori_source,source());
    assert.equal(synced.needsVariant,false);
  }
  const otherCredit = copy(raw); otherCredit.data.extensions = {quilvori_source:source('Second editor')};
  const competing = decode(picture([cardChunk('chara',otherCredit),cardChunk('ccv3',newer)]));
  assert.ok(competing.variantFields.includes('attribution.author.name'));
  const picked = decode(sync.encode(competing,sync.select(competing,'chara'),null,'chara'));
  assert.equal(picked.variants.ccv3.data.extensions.quilvori_source.author.name,'Second editor');
});
