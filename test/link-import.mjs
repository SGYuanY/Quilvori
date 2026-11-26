import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
const require=createRequire(import.meta.url),{createDownloader,isPublicAddress}=require('../electron/remote-import');
const context=vm.createContext({console,JSON,TextEncoder,TextDecoder,Uint8Array,Uint32Array,DataView,URL,crypto:webcrypto,structuredClone,btoa,atob,Date,Map,Set,AbortController,setTimeout,clearTimeout,fetch:()=>{throw Error('No live network in import tests');}});
for(const file of ['png','formats','store','library-actions','link-import','ai-tasks'])vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`,import.meta.url),'utf8'),context,{filename:file});
const L=context.TALinkImport,S=context.TAStore,A=context.NIJANAI,encode=value=>new TextEncoder().encode(JSON.stringify(value)),native=value=>JSON.parse(JSON.stringify(value));
const source='https://example.com/books/book.json?download=1',entry={uid:7,comment:'规矩',content:'听雨楼夜里不劝酒。',key:[],keysecondary:['夜里'],constant:true,selective:true,disable:true,position:4,depth:9,order:407};
const world=()=>({name:'听雨楼志',entries:{7:{...entry}}}),file=value=>({url:source,filename:'book.json',bytes:encode(value)});
let count=0;async function test(name,run){await run();count++;console.log('ok',name);}
await test('GitHub file URLs normalize to raw downloads while attachment signatures stay transient',()=>{
 assert.equal(L.normalizeUrl(' <https://github.com/author/repo/blob/main/books/a.json?raw=1#x> '),'https://raw.githubusercontent.com/author/repo/main/books/a.json');
 const signed='https://cdn.discordapp.com/attachments/123/456/book.json?ex=123&is=456&hm=abc';assert.equal(L.normalizeUrl(signed),signed);assert.equal(L.safeUrl(signed),'https://cdn.discordapp.com/attachments/123/456/book.json');
});
await test('unsupported protocols, account credentials, private addresses and Discord post URLs are rejected',()=>{
 for(const url of ['file:///C:/data.json','http://example.com/book.json','https://user:secret@example.com/book.json','https://127.0.0.1/a','https://2130706433/a','https://10.1.2.3/a','https://[::1]/a','https://192.168.2.1/a','https://100.64.0.1/a','https://localhost/a','https://machine.local/a','https://example.com:8443/a'])assert.throws(()=>L.normalizeUrl(url));
 assert.throws(()=>L.normalizeUrl('https://discord.com/channels/1/2/3'),err=>err.code==='discord-message');assert.throws(()=>L.normalizeUrl('https://github.com/author/repo'),err=>err.code==='github-file');
});
await test('world-book parsing preserves untitled entries, always-on blanks and injection settings',async()=>{
 const prepared=await L.prepare(file(world())),item=prepared.book.entries[0];
 assert.equal(prepared.total,1);assert.equal(prepared.constant,1);assert.equal(item.content,entry.content);assert.equal(item.depth,9);assert.equal(item.order,407);assert.equal(item.enabled,false);assert.equal(item.constant,true);assert.deepEqual(native(item.keys),[]);assert.deepEqual(native(item.secondaryKeys),['夜里']);assert.equal(prepared.url,'https://example.com/books/book.json');
 const blank=world();blank.entries[7].comment='';assert.equal((await L.prepare(file(blank))).unnamed,1);
});
await test('entry arrays, nested book data, Unicode filenames and single-entry objects are recognized',async()=>{
 for(const value of [[entry],{data:{entries:[entry]}},{条目名:'店规',触发关键词:['听雨楼'],正文:'不劝酒。'}])assert.equal((await L.prepare(file(value))).total,1);
 const noTitle=world();delete noTitle.name;const data=await L.prepare({...file(noTitle),filename:'江雾城.json'});assert.equal(data.book.name,'江雾城');
});
await test('embedded books in JSON and PNG cards import only the book',async()=>{
 const card={spec:'chara_card_v2',data:{name:'店主',description:'人物资料',character_book:{name:'店内设定',entries:[entry]}}};
 const pixel=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZlsAAAAASUVORK5CYII=','base64'));
 for(const bytes of [encode(card),context.TAPng.embedChara(pixel,JSON.stringify(card))]){
  const prepared=await L.prepare({url:'https://example.com/card.png',filename:'card.png',bytes});assert.equal(prepared.kind,'embedded');assert.equal(prepared.book.name,'店内设定');
  const library=S.emptyLibrary();A.commit(library,L.plan(library,prepared,'店内设定'));assert.equal(library.worldBooks.length,1);assert.equal(library.characters.length,0);assert.equal(library.assets.length,0);
 }
 await assert.rejects(()=>L.prepare({...file(null),bytes:pixel}),err=>err.code==='no-card-data');delete card.data.character_book;await assert.rejects(()=>L.prepare(file(card)),err=>err.code==='no-embedded-book');
});
await test('character links preserve fields, optional blanks, alternate greetings and zero talkativeness',async()=>{
 const card={spec:'chara_card_v2',data:{name:'店主',description:'三十二岁，雨夜营业。',personality:'',scenario:'',first_mes:'请进。',alternate_greetings:['晚些再来。'],extensions:{talkativeness:0}}};
 for(const value of [card,[card],{character:card}]){
  const preview=await L.prepare(file(value),{kind:'character'}),library=S.emptyLibrary(),plan=L.plan(library,preview,'店主');
  assert.equal(library.characters.length,0);A.commit(library,plan);const imported=library.characters[0];
  assert.equal(imported.description,card.data.description);assert.equal(imported.personality,'');assert.equal(imported.scenario,'');assert.equal(imported.talkativeness,0);assert.deepEqual(native(imported.alternate_greetings),['晚些再来。']);assert.equal(library.worldBooks.length,0);
 }
 await assert.rejects(()=>L.prepare(file(world()),{kind:'character'}),err=>err.code==='not-character-card');card.data.alternate_greetings='bad';await assert.rejects(()=>L.prepare(file(card),{kind:'character'}),err=>err.code==='invalid-card');
});
await test('PNG character import adds an avatar and optional embedded book in one undoable plan',async()=>{
 const pixel=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZlsAAAAASUVORK5CYII=','base64'));
 const card={spec:'chara_card_v2',data:{name:'店主',description:'人物资料',character_book:{name:'店内设定',entries:[entry]}}};
 const preview=await L.prepare({url:'https://example.com/card.png?temporary=signature',bytes:context.TAPng.embedChara(pixel,JSON.stringify(card))},{kind:'character'}),library=S.emptyLibrary(),before=JSON.stringify(library),plan=L.plan(library,preview,'店主'),receipt=A.commit(library,plan);
 assert.equal(library.characters.length,1);assert.equal(library.assets.length,1);assert.equal(library.worldBooks.length,1);assert.equal(library.characters[0].source.embeddedBookId,library.worldBooks[0].id);assert.equal(library.characters[0].avatarAssetId,library.assets[0].id);
 assert.ok(!JSON.stringify(library).includes('temporary=signature'));L.undo(library,receipt);assert.equal(JSON.stringify(library),before);
});
await test('users can import a card alone then bring in its embedded book without duplicating or overwriting the card',async()=>{
 const card={spec:'chara_card_v2',data:{name:'店主',description:'原文',character_book:{name:'设定',entries:[entry]}}},preview=await L.prepare(file(card),{kind:'character'}),library=S.emptyLibrary();
 A.commit(library,L.plan(library,preview,'店主',{includeBook:false}));assert.equal(library.worldBooks.length,0);const id=library.characters[0].id;library.characters[0].description='手工改稿';
 const plan=L.plan(library,preview,'店主',{includeBook:true});assert.equal(plan.existingId,id);assert.ok(plan.operations.filter(op=>op.kind==='add').every(op=>op.path[0]==='worldBooks'));const receipt=A.commit(library,plan);assert.equal(library.characters.length,1);assert.equal(library.worldBooks.length,1);assert.equal(library.characters[0].description,'手工改稿');assert.equal(library.characters[0].source.embeddedBookId,library.worldBooks[0].id);
 const again=L.plan(library,preview,'店主');assert.equal(again.operations.length,0);
 L.undo(library,receipt);assert.equal(library.worldBooks.length,0);assert.equal(library.characters[0].description,'手工改稿');assert.equal(library.characters[0].source.embeddedBookId,undefined);
});
await test('changed character sources create a separate card while equal names remain distinct',async()=>{
 const sourceCard={spec:'chara_card_v2',data:{name:'同名人物',description:'第一版'}},library=S.emptyLibrary(),first=await L.prepare(file(sourceCard),{kind:'character'});A.commit(library,L.plan(library,first,'同名人物'));library.characters[0].description='本地修改';sourceCard.data.description='第二版';
 const newer=await L.prepare(file(sourceCard),{kind:'character'});A.commit(library,L.plan(library,newer,'同名人物'));assert.equal(library.characters.length,2);assert.equal(library.characters[0].description,'本地修改');assert.equal(library.characters[1].description,'第二版');
});
await test('card undo refuses to remove an avatar or embedded book referenced by later work',async()=>{
 const pixel=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZlsAAAAASUVORK5CYII=','base64'));
 const card={spec:'chara_card_v2',data:{name:'店主',description:'人物资料',character_book:{name:'设定',entries:[entry]}}},library=S.emptyLibrary(),preview=await L.prepare({url:'https://example.com/card.png',bytes:context.TAPng.embedChara(pixel,JSON.stringify(card))},{kind:'character'}),receipt=A.commit(library,L.plan(library,preview,'店主'));
 library.characters.push({...library.characters[0],id:'later_card'});assert.throws(()=>L.undo(library,receipt),err=>err.code==='import-in-use');assert.equal(library.assets.length,1);assert.equal(library.worldBooks.length,1);
});
await test('link undo checks surviving quick replies for a card, its companion book or both without partially rolling back',async()=>{
 const card={spec:'chara_card_v2',data:{name:'Keeper',description:'Port',character_book:{name:'Harbor',entries:[entry]}}};
 const prepared=await L.prepare(file(card),{kind:'character'}),lib=S.emptyLibrary(),receipt=A.commit(lib,L.plan(lib,prepared,'Keeper'));
 const cardId=lib.characters[0].id,bookId=lib.worldBooks[0].id;
 for(const source of [{characterId:cardId},{bookId},{characterId:cardId,bookId}]){
  const live=structuredClone(lib);live.quickReplySets.push({id:'later',name:'Harbor replies',workSource:source,replies:[]});
  const snapshot=JSON.stringify(live);
  assert.throws(()=>L.undo(live,receipt),e=>e.code==='import-in-use' && e.references.every(ref=>ref.location.includes('Harbor replies')));
  assert.equal(JSON.stringify(live),snapshot);
 }
 L.undo(lib,receipt);assert.equal(lib.characters.length,0);assert.equal(lib.worldBooks.length,0);
 const existing=S.emptyLibrary();A.commit(existing,L.plan(existing,prepared,'Keeper',{includeBook:false}));
 const next=L.plan(existing,prepared,'Keeper'),attached=A.commit(existing,next),retainedCard=existing.characters[0].id;
 const replies={id:'other',name:'Keep replies',workSource:{characterId:retainedCard},replies:[]};
 existing.quickReplySets.push(replies);
 replies.workSource.bookId=next.bookId;assert.throws(()=>L.undo(existing,attached),e=>e.code==='import-in-use');
 delete replies.workSource.bookId;
 L.undo(existing,attached);assert.equal(existing.characters[0].id,retainedCard);
 assert.equal(existing.characters[0].source.embeddedBookId,undefined);assert.equal(existing.worldBooks.length,0);
 assert.equal(existing.quickReplySets[0].workSource.characterId,retainedCard);
});
await test('oversized avatars are omitted while invalid embedded books do not block valid card text',async()=>{
 const pixel=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZlsAAAAASUVORK5CYII=','base64'));
 const card={spec:'chara_card_v2',data:{name:'店主',description:'人物资料',character_book:{unexpected:true}}};
 const preview=await L.prepare({url:'https://example.com/card.png',bytes:context.TAPng.embedChara(pixel,JSON.stringify(card))},{kind:'character',makeAvatar:async()=>({dataUrl:'data:image/jpeg;base64,AA==',mime:'image/jpeg',bytes:400000})});
 assert.equal(preview.avatar,null);assert.equal(preview.embedded,null);assert.equal(preview.embeddedError,true);assert.equal(preview.character.description,'人物资料');
});
await test('HTML, invalid JSON, unrelated objects, bare empty arrays and oversized data never become a library',async()=>{
 for(const bytes of [new TextEncoder().encode('<!doctype html><script>ignored</script>'),new TextEncoder().encode('{bad'),encode({unexpected:true}),encode([]),new Uint8Array(),new Uint8Array(L.MAX_BYTES+1)])await assert.rejects(()=>L.prepare({url:source,bytes}));
});
await test('explicit empty world-info remains importable, but malformed rows and multicard attachments are identifiable errors',async()=>{
 for(const entries of [{},[]]){const prepared=await L.prepare(file({name:'Empty',entries}));assert.equal(prepared.total,0);assert.equal(prepared.book.name,'Empty');}
 for(const entries of ['text',[null,'text'],{0:{content:'Valid'},1:{unrelated:true}}])await assert.rejects(()=>L.prepare(file({entries})),e=>e.code==='invalid-entries');
 const pair=[{name:'A',description:'A'},{name:'B',description:'B'}],pixel=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZlsAAAAASUVORK5CYII=','base64'));
 for(const sourceFile of [file(pair),{url:'https://example.com/pair.png',bytes:context.TAPng.embedChara(pixel,JSON.stringify(pair))}])await assert.rejects(()=>L.prepare(sourceFile,{kind:'character'}),e=>e.code==='multiple-cards');
});
await test('link-import undo follows the current explicit attachment on a card',async()=>{
 const library=S.emptyLibrary(),preview=await L.prepare(file(world())),receipt=A.commit(library,L.plan(library,preview,'Atlas')),id=library.worldBooks[0].id;
 library.characters.push({id:'old-card',name:'Keeper',embeddedBookId:id});
 assert.throws(()=>L.undo(library,receipt),e=>e.code==='import-in-use');assert.equal(library.worldBooks[0].id,id);
 library.characters[0].embeddedBookId='';library.characters[0].source={embeddedBookId:id};
 L.undo(library,receipt);assert.equal(library.worldBooks.length,0);
});
await test('preview is read-only and application adds a separate book with a credential-free source',async()=>{
 const library=S.demoLibrary(),before=JSON.stringify(library),prepared=await L.prepare(file(world())),plan=L.plan(library,prepared,'我的副本');assert.equal(JSON.stringify(library),before);const receipt=A.commit(library,plan);
 const imported=library.worldBooks.at(-1);assert.equal(imported.name,'我的副本');assert.notEqual(imported.entries[0].id,entry.uid);assert.equal(imported.source.url,'https://example.com/books/book.json');assert.ok(!JSON.stringify(imported.source).includes('download=1'));
 A.undo(library,receipt,plan);assert.equal(JSON.stringify(library),before);
});
await test('repeat imports preserve edited local text and IDs; source changes create another version',async()=>{
 const library=S.emptyLibrary(),prepared=await L.prepare(file(world()));A.commit(library,L.plan(library,prepared,prepared.book.name));const saved=library.worldBooks[0],id=saved.id;saved.entries[0].content='本地改好的原稿';
 assert.equal(L.plan(library,prepared,'再次导入').existingId,id);assert.equal(saved.entries[0].content,'本地改好的原稿');
 const changed=world();changed.entries[7].content='来源里的新版规则。';const newer=await L.prepare(file(changed));A.commit(library,L.plan(library,newer,newer.book.name));assert.equal(library.worldBooks.length,2);assert.equal(saved.entries[0].content,'本地改好的原稿');
});
await test('content deduplication ignores internal IDs and same-name different content remains distinct',async()=>{
 const library=S.emptyLibrary(),prepared=await L.prepare(file(world()));A.commit(library,L.plan(library,prepared,prepared.book.name));
 const copy=await L.prepare({...file(world()),url:'https://another.example.net/a.json'});assert.equal(L.findExisting(library,copy).id,library.worldBooks[0].id);
 const different=world();different.entries[7].content='另一条同名设定。';const other=await L.prepare(file(different));assert.ok(L.plan(library,other,other.book.name).operations.length);
});
await test('undo refuses to remove a world book edited after importing',async()=>{
 const library=S.emptyLibrary(),prepared=await L.prepare(file(world())),receipt=A.commit(library,L.plan(library,prepared,prepared.book.name));library.worldBooks[0].entries[0].content+='后续编辑';assert.throws(()=>A.undo(library,receipt));assert.equal(library.worldBooks.length,1);
});
await test('browser download sends no credentials, referrer or model headers and honors cancellation',async()=>{
 let options;context.fetch=async(url,opts)=>{options=opts;return new Response(encode(world()),{headers:{'content-type':'application/json'}});};
 const result=await L.downloadBrowser(source);assert.ok(result.bytes.length);assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');assert.ok(!options.headers.Authorization&&!options.headers.Cookie);
 const stop=new AbortController();stop.abort();await assert.rejects(()=>L.downloadBrowser(source,{signal:stop.signal}),err=>err.code==='cancelled');
});
await test('browser reads enforce both advertised and actual byte limits and preserve HTTP errors',async()=>{
 await assert.rejects(()=>L.readResponse(new Response('small',{headers:{'content-length':String(L.MAX_BYTES+1)}})),err=>err.code==='too-large');
 await assert.rejects(()=>L.readResponse(new Response(new Uint8Array(L.MAX_BYTES+1))),err=>err.code==='too-large');
 context.fetch=async()=>new Response('',{status:403});await assert.rejects(()=>L.downloadBrowser(source),err=>err.code==='http-403');
});
await test('desktop CDN downloads use the system-network browser path without redirects, cookies or API keys',async()=>{
 let browserOptions,calls=0;context.nijanDesktop={downloadLink:async()=>{calls++;return{ok:true,bytes:encode(world()),url:source};},cancelLink:()=>{}};
 try {
  context.fetch=async(url,options)=>{browserOptions=options;return new Response(encode(world()));};
  assert.ok((await L.download('https://raw.githubusercontent.com/author/repo/main/book.json')).bytes.length);assert.equal(calls,0);assert.equal(browserOptions.redirect,'error');assert.equal(browserOptions.credentials,'omit');assert.equal(browserOptions.referrerPolicy,'no-referrer');
  await L.download(source);assert.equal(calls,1);
  context.fetch=async()=>{throw Error('CORS');};await L.download('https://cdn.discordapp.com/attachments/1/2/book.json');assert.equal(calls,2);
  context.fetch=async()=>new Response('',{status:403});await assert.rejects(()=>L.download('https://cdn.discordapp.com/attachments/1/2/book.json'),err=>err.code==='http-403');assert.equal(calls,2);
 } finally {delete context.nijanDesktop;}
});
function transport(routes){
 const calls=[];
 const request=(url,options,ready)=>{
  const req=new EventEmitter();calls.push({url:url.href,options});req.end=()=>queueMicrotask(()=>{
   if(options.signal.aborted){req.emit('error',Error('aborted'));return;}
   const route=routes[url.href]||{status:404};if(route.error){req.emit('error',Error('network'));return;}const res=new PassThrough();res.statusCode=route.status||200;res.headers=route.headers||{};
   ready(res);res.end(route.body||'');
  });return req;
 };return {request,calls};
}
const publicLookup=async()=>[{address:'93.184.216.34',family:4}];
await test('desktop validates public DNS and pins the selected address without authentication headers',async()=>{
 const t=transport({[source]:{body:JSON.stringify(world())}}),download=createDownloader({lookup:publicLookup,request:t.request}),result=await download(source);
 assert.ok(result.bytes.length);assert.equal(t.calls.length,1);assert.ok(!t.calls[0].options.headers.Authorization&&!t.calls[0].options.headers.Cookie);
 let pinned;t.calls[0].options.lookup('example.com',{all:true},(err,addresses)=>{assert.equal(err,null);pinned=addresses;});assert.equal(pinned[0].address,'93.184.216.34');
});
await test('desktop retries another validated public address after connection failure, but never retries HTTP errors',async()=>{
 const addresses=[{address:'93.184.216.34',family:4},{address:'93.184.216.35',family:4}],t=transport({[source]:{body:JSON.stringify(world())}}),first=transport({[source]:{error:true}});let attempts=0;
 const request=(...args)=>(attempts++===0?first.request:t.request)(...args),download=createDownloader({lookup:async()=>addresses,request}),result=await download(source);
 assert.ok(result.bytes.length);assert.equal(attempts,2);let pinned;t.calls[0].options.lookup('example.com',{},(err,address)=>{assert.equal(err,null);pinned=address;});assert.equal(pinned,addresses[1].address);
 const forbidden=transport({[source]:{status:403}});await assert.rejects(()=>createDownloader({lookup:async()=>addresses,request:forbidden.request})(source),err=>err.code==='http-403');assert.equal(forbidden.calls.length,1);
});
await test('desktop rejects private, reserved and mapped addresses, including private DNS resolutions',async()=>{
 for(const address of ['127.0.0.1','10.1.2.3','100.64.0.1','192.168.1.1','169.254.1.1','192.0.2.1','224.0.0.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1','2002:7f00:1::1'])assert.equal(isPublicAddress(address),false,address);
 assert.equal(isPublicAddress('93.184.216.34'),true);assert.equal(isPublicAddress('2606:4700:4700::1111'),true);
 const t=transport({});await assert.rejects(()=>createDownloader({lookup:async()=>[{address:'127.0.0.1',family:4}],request:t.request})(source),err=>err.code==='private-url');assert.equal(t.calls.length,0);
});
await test('desktop validates each redirect and rejects redirects to private networks before requesting them',async()=>{
 const t=transport({[source]:{status:302,headers:{location:'https://private.example.net/a'}}});
 await assert.rejects(()=>createDownloader({lookup:async(host)=>host==='private.example.net'?[{address:'10.0.0.1',family:4}]:publicLookup(),request:t.request})(source),err=>err.code==='private-url');assert.equal(t.calls.length,1);
 const good=transport({[source]:{status:302,headers:{location:'https://files.example.net/a.json'}},'https://files.example.net/a.json':{body:JSON.stringify(world())}});
 assert.ok((await createDownloader({lookup:publicLookup,request:good.request})(source)).bytes.length);assert.equal(good.calls.length,2);
});
await test('desktop byte limits, redirect loops and HTTP errors return clear codes',async()=>{
 const big=transport({[source]:{headers:{'content-length':String(L.MAX_BYTES+1)}}});await assert.rejects(()=>createDownloader({lookup:publicLookup,request:big.request})(source),err=>err.code==='too-large');
 const loop=transport({[source]:{status:302,headers:{location:source}}});await assert.rejects(()=>createDownloader({lookup:publicLookup,request:loop.request})(source),err=>err.code==='redirect');assert.equal(loop.calls.length,6);
 const missing=transport({});await assert.rejects(()=>createDownloader({lookup:publicLookup,request:missing.request})(source),err=>err.code==='http-404');
});
await test('cancellation interrupts a pending DNS lookup instead of waiting for its completion',async()=>{
 const controller=new AbortController(),download=createDownloader({lookup:()=>new Promise(()=>{}),request:()=>{throw Error('must not request');}}),pending=download(source,{signal:controller.signal});controller.abort();await assert.rejects(()=>pending,err=>err.code==='cancelled');
});
console.log(`${count} link import checks passed`);
