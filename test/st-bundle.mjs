import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
require('../js/png');
require('../js/formats');
const bundle = require('../js/st-bundle');
const {installBundle} = require('../electron/st-bundle');
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZlsAAAAASUVORK5CYII=','base64');
const url = 'data:image/png;base64,' + pixel.toString('base64');
const card = {id:'c',name:'Fixture',description:'Synthetic fixture',expressionAssetIds:['attached'],stickerPackId:'chosen'};
const book = {name:'書架',entries:[{id:'e',keys:['shelf'],comment:'Fixture shelf',content:'A shelf facing the window.'}]};
const library = {assets:[{id:'attached',name:'surprise.png',dataUrl:url}], stickerPacks:[
  {id:'chosen',stickers:[{name:'joy.png',dataUrl:url}]}, {id:'other',stickers:[{name:'anger.png',dataUrl:url}]},
], quickReplySets:[{id:'r',name:'読書',replies:[{label:'Again',message:'Continue.'}]},{id:'unused',name:'Unused',replies:[]}]};
const selection = {name:'雪の司書',worldFile:true,packs:['chosen'],expressions:['attached'],quickReplies:['r']};
const makeCard = async (character,book) => TAPng.embedChara(pixel,JSON.stringify(TAFormats.characterToCard(character,book)));
const decode = bytes => JSON.parse(new TextDecoder().decode(bytes));
const expected = ['characters/雪の司書.png','worlds/書架.json','characters/雪の司書/joy.png','characters/雪の司書/surprise.png','QuickReplies/読書.json'];
const create = async()=>bundle.materialize(bundle.plan(library,card,book,selection),makeCard);

async function fixture(t) {
  const parent = await fs.realpath(os.tmpdir());
  const sandbox = await fs.mkdtemp(path.join(parent,'quilvori-st-bundle-test-'));
  t.after(async()=>{
    const actual = await fs.realpath(sandbox);
    assert.equal(path.dirname(actual),parent); assert.ok(path.basename(actual).startsWith('quilvori-st-bundle-test-'));
    await fs.rm(actual,{recursive:true,force:true});
  });
  const root = path.join(sandbox,'profile');
  await fs.mkdir(path.join(root,'characters'),{recursive:true});
  await fs.mkdir(path.join(root,'worlds'));
  return {sandbox,root};
}
function crc32(data) {
  let sum = -1;
  for (const b of data) {
    sum ^= b;
    for (let bit=0;bit<8;bit++) sum = (sum>>>1) ^ (sum&1 ? 0xedb88320 : 0);
  }
  return (sum^-1)>>>0;
}

test('the reviewed selection becomes native files with the selected world embedded and all originals intact',async()=>{
  const before = structuredClone({library,card,book}), files = await create();
  assert.deepEqual(files.map(row=>row.path),expected);
  const exported = JSON.parse(TAPng.readChara(files[0].bytes));
  assert.equal(exported.data.name,selection.name);
  assert.equal(exported.data.character_book.name,book.name);
  assert.equal(exported.data.extensions.world,book.name);
  assert.equal(exported.data.character_book.entries[0].content,book.entries[0].content);
  assert.equal(decode(files[1].bytes).entries['0'].content,book.entries[0].content);
  for (const row of files.slice(2,4)) assert.deepEqual(Buffer.from(row.bytes),pixel);
  assert.equal(decode(files[4].bytes).qrList[0].message,'Continue.');
  assert.deepEqual({library,card,book},before);
  const onlyCard = {...selection,worldFile:false,expressions:[],packs:[],quickReplies:[]};
  const embeddedOnly = await bundle.materialize(bundle.plan(library,card,book,onlyCard),makeCard);
  assert.equal(embeddedOnly.length,1); assert.equal(JSON.parse(TAPng.readChara(embeddedOnly[0].bytes)).data.character_book.name,book.name);
  const standalone = await bundle.materialize(bundle.plan(library,card,null,onlyCard),makeCard);
  assert.equal(JSON.parse(TAPng.readChara(standalone[0].bytes)).data.character_book,undefined);
});

test('advanced ST quick reply metadata, IDs and context links survive editing and packaging',async()=>{
  const source = {version:2,name:'Evening: set',disableSend:true,placeBeforeInput:true,injectInput:false,color:'#70a058',onlyBorderColor:true,idIndex:81,customSet:{extension:'sample'},qrList:[
    {id:42,icon:'book',showLabel:false,label:'Read',title:'Open a book',message:'Original text',contextList:[{set:'Evening: set',isChained:true}],preventAutoExecute:false,isHidden:true,executeOnUser:true,executeOnChatChange:true,executeBeforeGeneration:true,automationId:'reading',extraFlag:{nested:[2]}},
    {id:3,label:'',title:'No label',message:'',executeOnStartup:true,atelierColor:'#3b5770'},
  ]};
  const before = structuredClone(source), imported = TAFormats.qrFromImport(source);
  assert.deepEqual(TAFormats.qrToExport(imported),source);
  imported.id = 'set'; imported.replies.forEach((reply,i)=>{ reply.id='local_'+i; });
  imported.replies[0].message = 'Updated text'; imported.replies.reverse();
  imported.replies.unshift({id:'new',label:'Note',title:'',message:'Add a note.',color:'#c6a15a'});
  const standalone = TAFormats.qrToExport(imported), data = {...library,quickReplySets:[imported]};
  const records = bundle.plan(data,card,book,{...selection,quickReplies:['set']});
  const files = await bundle.materialize(records,makeCard), exported = decode(files.find(item=>item.path==='QuickReplies/Evening set.json').bytes);
  assert.deepEqual(exported,standalone);
  assert.deepEqual(exported.qrList.map(row=>row.id),[82,3,42]); assert.equal(exported.idIndex,82);
  assert.deepEqual(exported.qrList[2],{...source.qrList[0],message:'Updated text'});
  assert.equal(exported.qrList[0].preventAutoExecute,true);
  assert.equal(exported.qrList[0].executeOnStartup,false);
  assert.deepEqual(source,before);
});

test('portable names, selected references and case-insensitive duplicate targets are enforced before writing',async()=>{
  assert.equal(bundle.portableStem('../A:B','fallback'),'AB');
  assert.equal(bundle.portableStem('CON','fallback'),'_CON');
  for (const name of ['../x','C:\\root','/root','file:stream','aux','hidden.','x\u0000y']) assert.throws(()=>bundle.segment(name),{code:'invalid-name'});
  for (const extra of ['outside.json','worlds/../x.json','characters/unrelated/x.png','QuickReplies/x.exe']) {
    assert.throws(()=>bundle.validatePaths([expected[0],extra]));
  }
  assert.throws(()=>bundle.validatePaths([expected[0],expected[2],expected[2].replace('joy','JOY')]),{code:'duplicate'});
  assert.throws(()=>bundle.plan(library,card,book,{...selection,expressions:['unknown']}),{code:'invalid-image'});
  const overlong = Array.from({length:4100},(_,i)=>'QuickReplies/'+i+'.json');
  assert.throws(()=>bundle.validatePaths([expected[0],...overlong]),{code:'size'});
});

test('stored ZIP records resolve through the central directory with correct UTF-8 names, sizes and CRCs',async()=>{
  const files = await create(), blob = bundle.zip(files,new Date(2026,0,1)), raw = Buffer.from(await blob.arrayBuffer());
  const end = raw.length-22; assert.equal(raw.readUInt32LE(end),0x06054b50); assert.equal(raw.readUInt16LE(end+10),files.length);
  const directory = raw.readUInt32LE(end+16); assert.equal(directory+raw.readUInt32LE(end+12),end);
  let p = directory;
  for (const file of files) {
    assert.equal(raw.readUInt32LE(p),0x02014b50);
    const size = raw.readUInt32LE(p+20), length = raw.readUInt16LE(p+28), member = raw.readUInt32LE(p+42);
    assert.equal(raw.toString('utf8',p+46,p+46+length),file.path); assert.equal(raw.readUInt16LE(p+8),0x800);
    assert.equal(raw.readUInt32LE(member),0x04034b50); assert.equal(raw.readUInt16LE(member+6),0x800);
    assert.equal(raw.readUInt16LE(member+8),0); assert.equal(raw.readUInt32LE(member+18),size); assert.equal(size,file.bytes.length);
    assert.equal(raw.readUInt16LE(member+26),length);
    assert.equal(raw.toString('utf8',member+30,member+30+length),file.path);
    const content = raw.subarray(member+30+length,member+30+length+size);
    assert.deepEqual(content,Buffer.from(file.bytes)); assert.equal(raw.readUInt32LE(member+14),crc32(content)); assert.equal(raw.readUInt32LE(p+16),crc32(content));
    p += 46+length;
  }
  assert.equal(p,end);
});

test('direct export publishes only the previewed native paths and refuses an existing destination',async t=>{
  const {root} = await fixture(t), files = await create();
  assert.equal((await installBundle(root,files)).count,files.length);
  for (const file of files) assert.deepEqual(await fs.readFile(path.join(root,file.path)),Buffer.from(file.bytes));
  assert.ok(!(await fs.readdir(root)).some(name=>name.startsWith('.quilvori-')));
  await fs.writeFile(path.join(root,expected[0]),'kept');
  await assert.rejects(installBundle(root,files),{code:'conflict'});
  assert.equal(await fs.readFile(path.join(root,expected[0]),'utf8'),'kept');
});

test('profile validation and a redirected expression directory leave outside files untouched',async t=>{
  const {root,sandbox} = await fixture(t), files = await create();
  await assert.rejects(installBundle(sandbox,files),{code:'invalid-profile'});
  const outside = path.join(sandbox,'outside');
  await fs.mkdir(outside);
  await fs.symlink(outside,path.join(root,'characters',selection.name),process.platform==='win32'?'junction':'dir');
  await assert.rejects(installBundle(root,files),{code:'unsafe-directory'});
  assert.deepEqual(await fs.readdir(outside),[]);
  assert.deepEqual(await fs.readdir(path.join(root,'worlds')),[]);
});

test('a mid-publication collision rolls back the new files and preserves the file created by another writer',async t=>{
  const {root} = await fixture(t), files = await create();
  const occupied = path.join(root,expected[0]);
  const io = {...fs, async link(from,to) {
    if (to===occupied) await fs.writeFile(occupied,'other writer',{flag:'wx'});
    return fs.link(from,to);
  }};
  await assert.rejects(installBundle(root,files,io),{code:'conflict'});
  assert.equal(await fs.readFile(occupied,'utf8'),'other writer');
  assert.deepEqual((await fs.readdir(root)).sort(),['characters','worlds']);
  assert.deepEqual(await fs.readdir(path.join(root,'characters')),[selection.name+'.png']);
  assert.deepEqual(await fs.readdir(path.join(root,'worlds')),[]);
});

test('malformed native content and staging failures leave the profile intact',async t=>{
  const {root} = await fixture(t), files = await create();
  for (const index of [0,1,2,4]) {
    const invalid = files.map((row,i)=>i===index?{...row,bytes:new TextEncoder().encode('oops')}:row);
    await assert.rejects(installBundle(root,invalid),{code:'invalid-file'});
  }
  let opened=0;
  const io = {...fs, async open(...args) { if (++opened===2) throw Object.assign(new Error('mock disk full'),{code:'ENOSPC'}); return fs.open(...args); }};
  await assert.rejects(installBundle(root,files,io),{code:'ENOSPC'});
  assert.deepEqual((await fs.readdir(root)).sort(),['characters','worlds']);
  assert.deepEqual(await fs.readdir(path.join(root,'characters')),[]);
});
