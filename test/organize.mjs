import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const ctx=vm.createContext({console,JSON,TextEncoder,TextDecoder,Uint8Array,Uint32Array,DataView,crypto:webcrypto,structuredClone,btoa,atob,Date,Map,Set,setTimeout,clearTimeout,AbortController,localStorage:{getItem:()=>null,setItem(){}}});
for(const file of ['formats','store','organize','ai-tasks','model'])vm.runInContext(fs.readFileSync(new URL(`../js/${file}.js`,import.meta.url),'utf8'),ctx,{filename:file});
const A=ctx.NIJANAI,O=ctx.NIJANOrganize,S=ctx.TAStore,F=ctx.TAFormats;
const native=value=>JSON.parse(JSON.stringify(value));
let count=0;
function test(name,run){run();console.log('ok',name);count++;}
function setup(){
 const lib=S.demoLibrary(),card=lib.characters[0],book=lib.worldBooks[0],entry=book.entries[0];
 Object.assign(card,{description:'身份：书店主人，三十二岁。\n性格：慢热，生气也不骂人。\n情境：雨夜等一位旧友，但两人尚未相认。',personality:'原有性格：谨慎。',scenario:'',system_prompt:'不要代替 {{user}} 决定行动。'});
 Object.assign(entry,{comment:'未命名',content:'听雨楼位于江雾城西市。这里临河，夜里不劝酒。',keys:[],secondaryKeys:['夜里'],constant:false,selective:true,enabled:false,position:'at_depth',depth:9,order:407,extensions:{keep:'yes'}});
 const cc={card:O.cardInput(card),fields:O.FIELDS.slice(),instruction:'有序分栏，不遗漏条件'};
 const wc={book:{id:book.id,name:book.name,entries:[O.entryInput(entry)]},options:{keywords:true,renameAll:false,changeActivation:false},instruction:''};
 const moves={moves:[{from:'description',to:'personality',quote:'性格：慢热，生气也不骂人。',reason:'性格与行为'},{from:'description',to:'scenario',quote:'情境：雨夜等一位旧友，但两人尚未相认。',reason:'当前情境'}]};
 const rows={entries:[{id:entry.id,category:'location',comment:'听雨楼的位置与规矩',keys:['听雨楼','江雾城'],activation:'keep',evidence:'听雨楼位于江雾城西市。',reason:'地点设定，按专名触发。'}]};
 return {lib,card,book,entry,cc,wc,moves,rows};
}
test('card organizing creates a preview without changing the library or source metadata',()=>{
 const {lib,card,cc,moves}=setup(),before=JSON.stringify(lib),plan=A.proposal(lib,'organize:character',moves,cc);
 assert.equal(JSON.stringify(lib),before);assert.equal(plan.operations.length,3);assert.ok(plan.operations.every(op=>op.group===`character/${card.id}`));
});
test('moving exact source blocks preserves every detail, existing destination text, IDs and optional blanks',()=>{
 const {lib,card,cc,moves}=setup(),snapshot=A.copy(card),plan=A.proposal(lib,'organize:character',moves,cc),receipt=A.commit(lib,plan);
 assert.equal(card.description,'身份：书店主人，三十二岁。\n\n');
 assert.equal(card.personality,snapshot.personality+'\n\n'+moves.moves[0].quote);
 assert.equal(card.scenario,moves.moves[1].quote);assert.equal(card.first_mes,snapshot.first_mes);assert.equal(card.system_prompt,snapshot.system_prompt);assert.equal(card.id,snapshot.id);assert.equal(card.avatarAssetId,snapshot.avatarAssetId);
 A.undo(lib,receipt,plan);assert.deepEqual(native(card),native(snapshot));
});
test('users may choose one complete move without deleting an unchecked source block',()=>{
 const {lib,card,cc,moves}=setup();moves.moves= moves.moves.slice(0,1);A.commit(lib,A.proposal(lib,'organize:character',moves,cc));
 assert.ok(card.description.includes('但两人尚未相认'));assert.equal(card.scenario,'');
});
test('unmentioned optional blanks and absent fields are never normalized or filled by organizing',()=>{
 const {lib,card,cc,moves}=setup();card.first_mes=null;delete card.creator_notes;cc.card=O.cardInput(card);
 const plan=A.proposal(lib,'organize:character',moves,cc);assert.ok(!plan.operations.some(op=>['first_mes','creator_notes'].includes(op.field)));A.commit(lib,plan);
 assert.equal(card.first_mes,null);assert.equal(Object.hasOwn(card,'creator_notes'),false);
});
test('a full-field move can clear its source only as part of the same atomic group',()=>{
 const {lib,card,cc}=setup();card.scenario='原来的描述内容。';cc.card=O.cardInput(card);
 const plan=A.proposal(lib,'organize:character',{moves:[{from:'scenario',to:'description',quote:card.scenario,reason:'这是稳定背景'}]},cc);
 assert.throws(()=>A.commit(lib,plan,[plan.operations[0].key]),/一起应用/);
 assert.equal(card.scenario,'原来的描述内容。');A.commit(lib,plan);assert.equal(card.scenario,'');assert.ok(card.description.endsWith('原来的描述内容。'));
});
test('rewritten or invented text, unsupported fields, overlapping moves and ambiguous quotes are rejected',()=>{
 const {lib,cc,moves}=setup();
 for(const move of [{...moves.moves[0],quote:'性格：热情开朗。'},{...moves.moves[0],to:'name'},{...moves.moves[0],to:'description'}])assert.throws(()=>A.proposal(lib,'organize:character',{moves:[move]},cc));
 assert.throws(()=>A.proposal(lib,'organize:character',{moves:[moves.moves[0],{...moves.moves[0],quote:'慢热'}]},cc));
 cc.card.description='慢热。慢热。';assert.throws(()=>A.validate('organize:character',{moves:[{from:'description',to:'personality',quote:'慢热。',reason:'性格'}]},cc));
});
test('duplicate source quotes can be moved by an explicit occurrence without deleting the other copy',()=>{
 const {lib,card,cc}=setup();card.description='慢热。慢热。';cc.card=O.cardInput(card);
 const result={moves:[{from:'description',to:'personality',quote:'慢热。',occurrence:1,reason:'性格'}]};
 A.commit(lib,A.proposal(lib,'organize:character',result,cc));assert.equal(card.description,'慢热。');assert.ok(card.personality.endsWith('慢热。'));
});
test('cross-field moves use the original snapshot and preserve both blocks exactly',()=>{
 const {lib,card,cc}=setup();card.description='性格内容。';card.personality='身份内容。';cc.card=O.cardInput(card);
 const result={moves:[{from:'description',to:'personality',quote:'性格内容。',reason:'性格'},{from:'personality',to:'description',quote:'身份内容。',reason:'背景'}]};
 A.commit(lib,A.proposal(lib,'organize:character',result,cc));assert.equal(card.description,'身份内容。');assert.equal(card.personality,'性格内容。');
});
test('changes during the request and edits to an unchanged source field invalidate the full card plan',()=>{
 const {lib,card,cc,moves}=setup();card.description+='后来改的';assert.throws(()=>A.proposal(lib,'organize:character',moves,cc));
 const x=setup(),plan=A.proposal(x.lib,'organize:character',x.moves,x.cc);x.card.system_prompt+='手工补充';assert.throws(()=>A.commit(x.lib,plan),/原稿/);assert.equal(x.card.description,x.cc.card.description);
});
test('undo refuses to overwrite a later manual edit',()=>{
 const {lib,card,cc,moves}=setup(),plan=A.proposal(lib,'organize:character',moves,cc),receipt=A.commit(lib,plan);card.personality+='后续修改';assert.throws(()=>A.undo(lib,receipt,plan));assert.ok(card.personality.endsWith('后续修改'));
});
test('world metadata suggestions leave text and all unrelated injection settings intact',()=>{
 const {lib,entry,wc,rows}=setup(),snapshot=A.copy(entry),before=JSON.stringify(lib),plan=A.proposal(lib,'organize:world',rows,wc);
 assert.equal(JSON.stringify(lib),before);const receipt=A.commit(lib,plan);
 assert.equal(entry.category,'location');assert.equal(entry.comment,'听雨楼的位置与规矩');assert.deepEqual(native(entry.keys),['听雨楼','江雾城']);
 for(const field of ['id','content','secondaryKeys','constant','selective','enabled','position','depth','order','extensions'])assert.deepEqual(native(entry[field]),native(snapshot[field]));
 A.undo(lib,receipt,plan);assert.deepEqual(native(entry),native(snapshot));assert.equal(Object.hasOwn(entry,'category'),false);
});
test('always-on entries may have no keywords and are never automatically converted',()=>{
 const {lib,entry,wc,rows}=setup();entry.constant=true;wc.book.entries=[O.entryInput(entry)];rows.entries[0].keys=[];
 A.commit(lib,A.proposal(lib,'organize:world',rows,wc));assert.equal(entry.constant,true);assert.equal(entry.keys.length,0);
 rows.entries[0].activation='keywords';assert.throws(()=>A.validate('organize:world',rows,wc),/未允许/);
});
test('keyword suggestions append exact source terms and retain existing primary and secondary keys',()=>{
 const {lib,entry,wc,rows}=setup();entry.keys=['旧词'];wc.book.entries=[O.entryInput(entry)];rows.entries[0].keys=['江雾城','江雾城'];
 A.commit(lib,A.proposal(lib,'organize:world',rows,wc));assert.deepEqual(native(entry.keys),['旧词','江雾城']);assert.deepEqual(native(entry.secondaryKeys),['夜里']);
});
test('changing an existing title requires explicit scope and keyword generation can be disabled',()=>{
 const {lib,entry,wc,rows}=setup();entry.comment='原有名称';wc.book.entries=[O.entryInput(entry)];assert.throws(()=>A.proposal(lib,'organize:world',rows,wc),/条目名/);
 wc.options.renameAll=true;assert.ok(A.proposal(lib,'organize:world',rows,wc).operations.length);
 wc.options.keywords=false;assert.throws(()=>A.proposal(lib,'organize:world',rows,wc),/关键词/);delete rows.entries[0].keys;assert.ok(A.proposal(lib,'organize:world',rows,wc));
});
test('switching always-on to keyword mode needs permission and actual trigger words',()=>{
 const {lib,entry,wc,rows}=setup();entry.constant=true;wc.book.entries=[O.entryInput(entry)];wc.options.changeActivation=true;rows.entries[0].activation='keywords';
 const invalid=A.copy(rows);invalid.entries[0].keys=[];assert.throws(()=>A.validate('organize:world',invalid,wc),/至少/);
 A.commit(lib,A.proposal(lib,'organize:world',rows,wc));assert.equal(entry.constant,false);assert.ok(entry.keys.includes('听雨楼'));
});
test('world organizing rejects body changes, foreign IDs, duplicate rows, fabricated evidence and unrelated keywords',()=>{
 const {wc,rows}=setup();
 for(const extra of [{content:'删减后的正文'},{id:'other'},{evidence:'编造的依据'},{keys:['不存在的名字']},{category:'unknown'}]){const bad=A.copy(rows);Object.assign(bad.entries[0],extra);assert.throws(()=>A.validate('organize:world',bad,wc));}
 const bad=A.copy(rows);bad.entries.push(bad.entries[0]);assert.throws(()=>A.validate('organize:world',bad,wc));
});
test('world metadata applies as a group and stale content blocks the selected entry',()=>{
 const {lib,entry,wc,rows}=setup(),plan=A.proposal(lib,'organize:world',rows,wc);
 assert.throws(()=>A.commit(lib,plan,[plan.operations[0].key]),/一起应用/);entry.content+='用户刚补的';assert.throws(()=>A.commit(lib,plan),/原稿/);assert.equal(entry.comment,'未命名');
});
test('selected world entry suggestions do not require unrelated entries to stay unchanged',()=>{
 const {lib,book,wc,rows,entry}=setup();const other=book.entries[1];wc.book.entries.push(O.entryInput(other));rows.entries.push({...rows.entries[0],id:other.id,category:'rule',comment:other.comment,keys:[],evidence:other.content.slice(0,10)});
 const plan=A.proposal(lib,'organize:world',rows,wc);other.content+='随后改动';A.commit(lib,plan,plan.operations.filter(op=>op.entryId===entry.id).map(op=>op.key));assert.equal(entry.category,'location');assert.ok(other.content.endsWith('随后改动'));
});
test('category survives both world-info and embedded-book export/import without changing injection fields',()=>{
 const {book,entry}=setup();entry.category='location';
 for(const payload of [F.bookToWorldInfo(book),F.bookToCharacterBook(book)]){const back=F.worldInfoToEntries(payload)[0];assert.equal(back.category,'location');assert.equal(back.content,entry.content);assert.equal(back.constant,entry.constant);assert.equal(back.depth,entry.depth);}
});
test('empty suggestions preserve optional fields and separate organize prompts exclude creative length and style',()=>{
 const {lib,cc,wc}=setup();assert.equal(A.proposal(lib,'organize:character',{moves:[]},cc).operations.length,0);assert.equal(A.proposal(lib,'organize:world',{entries:[]},wc).operations.length,0);
 for(const task of ['organize:character','organize:world']){const prompt=ctx.NIJANModel.systemPrompt(A.prompt(task,{}),task);assert.ok(!prompt.includes('600'));assert.ok(!prompt.includes('创作正文参考文风'));}
});
console.log(`${count} organize checks passed`);
