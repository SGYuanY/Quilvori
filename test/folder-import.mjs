import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const ctx=vm.createContext({ console, JSON, TextEncoder, TextDecoder, Uint8Array, Uint32Array, DataView, crypto:webcrypto, structuredClone, btoa, atob, Date, Map, Set });
for(const file of ['png','formats','store','folder-import']) vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`,import.meta.url),'utf8'),ctx,{filename:file});
const S=ctx.TAStore, I=ctx.TAFolderImport, encoder=new TextEncoder();
const pixel=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZlsAAAAASUVORK5CYII=','base64'));
const card=(name,description='内容')=>({spec:'chara_card_v2',data:{name,description,personality:'',scenario:'',first_mes:'',mes_example:''}});
const json=(value)=>encoder.encode(JSON.stringify(value));
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
