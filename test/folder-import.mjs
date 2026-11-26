import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { deflateSync } from 'node:zlib';
const ctx=vm.createContext({ console, JSON, TextEncoder, TextDecoder, Uint8Array, Uint32Array, DataView, crypto:webcrypto, structuredClone, btoa, atob, Date, Map, Set });
for(const file of ['png','formats','store','folder-import']) vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`,import.meta.url),'utf8'),ctx,{filename:file});
const S=ctx.TAStore, I=ctx.TAFolderImport, encoder=new TextEncoder();
const pixel=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZlsAAAAASUVORK5CYII=','base64'));
const card=(name,description='内容')=>({spec:'chara_card_v2',data:{name,description,personality:'',scenario:'',first_mes:'',mes_example:''}});
const json=(value)=>encoder.encode(JSON.stringify(value));
function portrait(rgb, character, indent=0) {
  function chunk(kind, data) {
    const name=Buffer.from(kind), block=Buffer.alloc(12+data.length);
    block.writeUInt32BE(data.length); name.copy(block,4); data.copy(block,8);
    block.writeUInt32BE(ctx.TAPng.crc32(block.subarray(4,-4)),block.length-4);
    return block;
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(1);header.writeUInt32BE(1,4);header[8]=8;header[9]=2;
  const png=Buffer.concat([pixel.slice(0,8),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,...rgb]))),chunk('IEND',Buffer.alloc(0))]);
  return ctx.TAPng.embedChara(png,JSON.stringify(character,null,indent));
}
function adapter(files){
 const calls=[];
 return { calls, list:async(folder)=>{calls.push(folder);return Object.keys(files).filter(path=>path.startsWith(folder+'/')).map(full=>({full,name:full.split('/').pop()}));},read:async(path)=>{if(files[path] instanceof Error)throw files[path];return files[path];},write(){throw new Error('Source files must not be written');} };
}
let total=0;
async function test(name,fn){await fn();total++;console.log('ok',name);}
await test('JSON and PNG cards populate the library and bring their embedded world book',async()=>{
 const pngCard=card('雨夜书店');pngCard.data.character_book={name:'店里的规矩',entries:[{keys:['雨'],content:'可以借伞。'}]};
 const a=adapter({'/cards/a.json':json(card('书店主人')),'/cards/b.png':ctx.TAPng.embedChara(pixel,JSON.stringify(pngCard))});
 const before=S.emptyLibrary(), snapshot=JSON.stringify(before);
 const {library,report}=await I.importAll(before,{cards:'/cards'},a);
 assert.equal(report.cards,2);assert.equal(report.books,1);assert.equal(library.characters[1].name,'雨夜书店');assert.ok(library.characters[1].avatarAssetId);
 assert.equal(library.worldBooks[0].entries[0].content,'可以借伞。');assert.equal(JSON.stringify(before),snapshot);
});
await test('reading unchanged files twice preserves manual edits and stable IDs',async()=>{
 const a=adapter({'/cards/a.json':json(card('店主'))});
 const first=await I.importAll(S.emptyLibrary(),{cards:'/cards'},a),id=first.library.characters[0].id;
 first.library.characters[0].description='手工改好的正文';
 const next=await I.importAll(first.library,{cards:'/cards'},a);
 assert.equal(next.report.cards,0);assert.equal(next.report.unchanged,1);assert.equal(next.library.characters.length,1);assert.equal(next.library.characters[0].id,id);assert.equal(next.library.characters[0].description,'手工改好的正文');
});
await test('shared embedded books are imported once even with different internal entry IDs',async()=>{
 const firstCard=card('店主'),secondCard=card('常客');
 firstCard.data.character_book={name:'店里的规矩',entries:[{id:1,keys:['雨'],content:'可以借伞。'}]};
 secondCard.data.character_book={name:'店里的规矩',entries:[{id:99,content:'可以借伞。',keys:['雨']}]};
 const a=adapter({'/cards/a.json':json(firstCard),'/cards/b.json':json(secondCard),'/worlds/book.json':json({data:{entries:[{keys:['门'],content:'门常开。'}]}})});
 const {library,report}=await I.importAll(S.emptyLibrary(),{cards:'/cards',worlds:'/worlds'},a);
 assert.equal(report.cards,2);assert.equal(report.books,2);assert.equal(library.worldBooks.filter(book=>book.name==='店里的规矩').length,1);
 assert.equal(library.worldBooks.find(book=>book.name==='book').entries[0].content,'门常开。');
});
await test('PNG and JSON copies are deduplicated while different cards with the same name survive',async()=>{
 const item=card('同名角色');
 const a=adapter({'/cards/a.json':json(item),'/cards/b.png':ctx.TAPng.embedChara(pixel,JSON.stringify(item)),'/cards/c.json':json(card('同名角色','另一张卡'))});
 const {library,report}=await I.importAll(S.emptyLibrary(),{cards:'/cards'},a);
 assert.equal(report.cards,2);assert.equal(report.unchanged,1);assert.equal(library.characters.length,2);
 assert.ok(library.characters[0].avatarAssetId,'a JSON import can acquire the matching PNG cover');
});
await test('a portrait-only revision keeps both editions and matches the right cover across paths',async()=>{
 const contents=card('Studio fixture'), red=[230,16,20], blue=[10,24,210], key='/cards/card.png';
 const files={[key]:portrait(red,contents)}, scan=(lib)=>I.importAll(lib,{cards:'/cards'},adapter(files));
 const first=await scan(S.emptyLibrary()), old=first.library.characters[0];
 old.description='Manually edited first edition';
 files[key]=portrait(blue,contents);
 const second=await scan(first.library), fresh=second.library.characters[1];
 assert.equal(second.report.cards,1);assert.equal(second.library.settings.folderImports[key].id,fresh.id);
 assert.notEqual(fresh.avatarAssetId,old.avatarAssetId);assert.equal(second.library.characters[0].avatarAssetId,old.avatarAssetId);
 const covers=second.library.assets.map(asset=>asset.dataUrl);
 assert.notEqual(covers[0],covers[1]);
 files['/cards/red-copy.png']=portrait(red,contents,2);
 files['/cards/blue-copy.png']=portrait(blue,contents,2);
 const third=await scan(second.library);
 assert.equal(third.report.cards,0);assert.equal(third.library.assets.length,2);
 assert.equal(third.library.settings.folderImports['/cards/red-copy.png'].id,old.id);
 assert.equal(third.library.characters[0].description,'Manually edited first edition');
 assert.equal(third.library.settings.folderImports['/cards/blue-copy.png'].id,fresh.id);
 third.library.characters[1].description='Keep this local revision';
 files[key]=portrait(blue,contents,4);
 const fourth=await scan(third.library);
 assert.equal(fourth.report.cards,0);assert.equal(fourth.library.characters[1].description,'Keep this local revision');
 assert.deepEqual(fourth.library.assets.map(asset=>asset.dataUrl),covers);
});
await test('legacy whole-file hashes are checked against the actual PNG or legacy thumbnail before skipping',async()=>{
 const contents=card('Legacy fixture'),key='/cards/card.png', red=portrait([232,32,32],contents), blue=portrait([17,32,211],contents);
 for (const useThumb of [false,true]) {
   const opts=useThumb?{makeAvatar:async(bytes)=>({dataUrl:'data:image/jpeg;base64,'+Buffer.from(ctx.TAPng.parseChunks(bytes).find(c=>c.type==='IDAT').data).toString('base64'),bytes:48,mime:'image/jpeg'})}:{};
   const scan=(lib,bytes)=>I.importAll(lib,{cards:'/cards'},adapter({[key]:bytes}),opts);
   const first=await scan(S.emptyLibrary(),red), old=first.library.characters[0];
   delete old.folderPortraitHash;
   old.description='Manually revised';
   const imports=first.library.settings.folderImports;
   imports[key]={id:old.id,kind:'cards',hash:imports[key].hash};
   const same=await scan(first.library,red);
   assert.equal(same.report.cards,0);assert.equal(same.library.characters[0].description,'Manually revised');
   imports[key].hash=Buffer.from(await webcrypto.subtle.digest('SHA-256',blue)).toString('hex');
   const next=await scan(first.library,blue), fixed=next.library.settings.folderImports[key];
   assert.equal(next.report.cards,1);assert.notEqual(fixed.id,old.id);assert.ok(fixed.portraitHash);
   assert.equal(next.library.characters[0].description,'Manually revised');
   assert.equal(next.library.characters[1].description,contents.data.description);
   assert.equal((await scan(next.library,blue)).report.cards,0);
 }
});
await test('omitted covers keep their source identity and can be retried without duplicating the card',async()=>{
 const contents=card('Small budget'),key='/cards/card.png',files={[key]:portrait([222,31,32],contents)};
 const scan=(lib,avatarBudget)=>I.importAll(lib,{cards:'/cards'},adapter(files),{avatarBudget});
 const first=await scan(S.emptyLibrary(),0);assert.equal(first.report.avatarsOmitted,1);
 files[key]=portrait([17,21,218],contents);
 const next=await scan(first.library,0);assert.equal(next.report.cards,1);assert.equal(next.library.assets.length,0);
 const id=next.library.settings.folderImports[key].id;
 const retry=await scan(next.library,Infinity);assert.equal(retry.report.cards,0);assert.equal(retry.library.assets.length,1);
 assert.equal(retry.library.characters.find(c=>c.id===id).avatarAssetId,retry.library.assets[0].id);
 retry.library.characters.find(c=>c.id===id).avatarAssetId=null;
 const cleared=await scan(retry.library,Infinity);assert.equal(cleared.library.characters.find(c=>c.id===id).avatarAssetId,null);
});
await test('bad files do not block valid cards and errors are reported per file',async()=>{
 const a=adapter({'/cards/a.png':pixel,'/cards/b.json':json({entries:[]} ),'/cards/c.json':encoder.encode('{bad'),'/cards/d.json':json(card('可读取')),'/cards/e.json':new Error('无法读取')});
 const {library,report}=await I.importAll(S.emptyLibrary(),{cards:'/cards'},a);
 assert.equal(report.cards,1);assert.equal(report.failed.length,4);assert.equal(library.characters[0].name,'可读取');
});
await test('a changed source creates a separate version without overwriting the edited local card',async()=>{
 const files={'/cards/a.json':json(card('店主'))},a=adapter(files),first=await I.importAll(S.emptyLibrary(),{cards:'/cards'},a);
 first.library.characters[0].description='本地修改';files['/cards/a.json']=json(card('店主','文件里的新版本'));
 const next=await I.importAll(first.library,{cards:'/cards'},a);
 assert.equal(next.report.cards,1);assert.equal(next.library.characters.length,2);assert.equal(next.library.characters[0].description,'本地修改');assert.equal(next.library.characters[1].description,'文件里的新版本');
});
await test('folder reads are additive, repeatable, and can read only cards',async()=>{
 const a=adapter({'/cards/a.json':json(card('店主')),'/worlds/book.json':json({name:'设定',entries:[{comment:'规矩',keys:['门'],content:'门常开。'}]})});
 const base=S.demoLibrary(),first=await I.importAll(base,{cards:'/cards',worlds:'/worlds'},a);
 assert.equal(first.library.characters.length,base.characters.length+1);assert.equal(first.library.worldBooks.length,base.worldBooks.length+1);
 const second=await I.importAll(first.library,{cards:'/cards',worlds:'/worlds'},a);
 assert.equal(second.report.cards,0);assert.equal(second.report.books,0);assert.equal(second.report.unchanged,2);
 const only=adapter({'/cards/a.json':json(card('新卡'))});await I.importAll(base,{cards:'/cards',worlds:'/worlds'},only,{cardsOnly:true});assert.deepEqual(only.calls,['/cards']);
});
await test('missing folders do not accidentally list the current working directory',async()=>{
 const a=adapter({});const result=await I.importAll(S.emptyLibrary(),{cards:'',worlds:''},a);assert.deepEqual(a.calls,[]);assert.equal(result.report.cards,0);
});
await test('avatar thumbnails stay within a bounded local storage budget',async()=>{
 const files={};for(let n=0;n<8;n++)files[`/cards/${n}.png`]=ctx.TAPng.embedChara(pixel,JSON.stringify(card(`角色${n}`)));
 const result=await I.importAll(S.emptyLibrary(),{cards:'/cards'},adapter(files),{makeAvatar:async()=>({dataUrl:'data:image/jpeg;base64,AA==',mime:'image/jpeg',bytes:240000})});
 assert.equal(result.report.cards,8);assert.ok(result.library.assets.reduce((sum,asset)=>sum+asset.bytes,0)<=750000);assert.equal(result.library.assets[0].mime,'image/jpeg');
});
await test('multiple cards in one JSON or PNG are refused while batch siblings import normally',async()=>{
 const multi=[card('First'),card('Second')], png=ctx.TAPng.embedChara(pixel,JSON.stringify(multi));
 assert.throws(()=>ctx.TAFormats.cardToCharacter(multi),e=>e.code==='multiple-cards');
 assert.equal(ctx.TAFormats.cardToCharacter([multi[0]]).name,'First');
 const result=await I.importAll(S.emptyLibrary(),{cards:'/cards'},adapter({'/cards/pair.json':json(multi),'/cards/pair.png':png,'/cards/valid.json':json(card('Only imported'))}));
 assert.equal(result.report.cards,1);assert.equal(result.report.failed.length,2);
 assert.ok(result.report.failed.every(row=>row.reason.includes('多张角色卡')));assert.deepEqual(Array.from(result.library.characters,c=>c.name),['Only imported']);
});
await test('malformed books cannot partially enter the library; explicit empty books and literal blank entries remain valid',async()=>{
 const saved=[];ctx.TAUI={state:{lib:S.emptyLibrary()},t:key=>key,commitLibrary:async value=>saved.push(value)};
 const file=value=>({name:'book.json',arrayBuffer:async()=>json(value).buffer});
 for(const entries of [null,'bad',[null],['x'],[{},4],{0:{key:[],content:'Valid'},1:'invalid'}]){
   await assert.rejects(()=>I.importDocument('world',file({entries})),e=>e.code==='invalid-entries');
 }
 assert.equal(saved.length,0);
 const withBadBook=card('Surviving character');withBadBook.data.character_book={entries:'bad'};
 const result=await I.importAll(S.emptyLibrary(),{cards:'/cards',worlds:'/worlds'},adapter({'/cards/a.json':json(withBadBook),'/worlds/bad.json':json({entries:[null]}),'/worlds/empty.json':json({entries:{}}),'/worlds/blank.json':json({entries:[{comment:'',content:''}]})}));
 assert.equal(result.report.cards,1);assert.equal(result.report.books,2);assert.equal(result.report.failed.length,2);
 assert.equal(result.library.worldBooks.reduce((n,b)=>n+b.entries.length,0),1);
});
console.log(`${total} folder import checks passed`);
