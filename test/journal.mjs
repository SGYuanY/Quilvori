import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const env=vm.createContext({console,structuredClone,Date,TextEncoder,TextDecoder,crypto:webcrypto,Uint8Array,Uint32Array,btoa,atob});
for(const file of ['formats','store','ai-tasks','journal','creation-assist']){
  vm.runInContext(fs.readFileSync(new URL('../js/'+file+'.js',import.meta.url),'utf8'),env,{filename:file});
}
const {TAJournal:J,TAFormats:F,NIJANAI:A,TAStore:S,TACreationAssist:Assist}=env;
const object=v=>JSON.parse(JSON.stringify(v));
const line=(name,mes)=>({name,mes,send_date:'fixture-date',is_user:name==='Author'});
function library() {
  const lib=S.emptyLibrary();
  lib.chats=[
    {id:'A',name:'A conversation',messages:[line('Author','PRIVATE A INTRO'),line('Keeper','The map is blue'),line('Author','A place to go')],bookmarks:[]},
    {id:'B',name:'B conversation',messages:[line('Author','PRIVATE B INTRO'),line('Keeper','The map is blue')],bookmarks:[]},
  ];
  return lib;
}
let count=0;
function test(name,run){run();console.log('ok',name);count++;}
function box(chatId='',from='1',to='1') {
  const selectors={'[data-journal-source]':chatId,'[data-journal-range="from"]':from,'[data-journal-range="to"]':to};
  return {querySelector(selector){return Object.hasOwn(selectors,selector)?{value:selectors[selector]}:null;}};
}
test('unlinked legacy floors and chat-only plans resolve without guessing a message or chat',()=>{
  const lib=library();
  assert.equal(J.resolve(lib,{id:'legacy',floor:1}).state,'unlinked');
  for(const floor of [null,undefined]) assert.equal(J.resolve(lib,{chatId:'A',floor}).state,'chat');
  assert.equal(J.resolve(lib,{chatId:'A',floor:99}).state,'changed');
  assert.equal(J.resolve(lib,{chatId:'missing',floor:1}).state,'missing');
  assert.throws(()=>J.attachment(lib.chats[0],-1));
});
test('a journal anchor follows a unique moved message only within its own conversation',()=>{
  const lib=library(),chat=lib.chats[0],anchor=J.attachment(chat,1);
  chat.messages.unshift(line('Keeper','A new first line'));
  assert.equal(J.resolve(lib,anchor).floor,2);
  chat.messages=chat.messages.filter(msg=>msg.mes!=='The map is blue');
  assert.equal(J.resolve(lib,anchor).state,'changed');
  chat.messages.push(lib.chats[1].messages[1],lib.chats[1].messages[1]);
  assert.equal(J.resolve(lib,anchor).state,'changed');
  lib.chats.shift();assert.equal(J.resolve(lib,anchor).state,'missing');
});
test('journal links keep integer IDs, and old dropdown strings resolve by their exact spelling',()=>{
  const lib=library();
  lib.chats[0].id=0;
  lib.chats[1].id=7;
  lib.chats.push({...lib.chats[1],id:'007',name:'Separate conversation'});
  const anchor=J.attachment(lib.chats[0],0);
  assert.equal(anchor.chatId,0);
  assert.equal(J.resolve(lib,anchor).state,'message');
  const oldLink={chatId:'7',floor:1};
  assert.equal(J.resolve(lib,oldLink).chat.id,7);
  assert.equal(oldLink.chatId,'7','reading an older note leaves the saved value intact');
  assert.equal(J.resolve(lib,{chatId:'007',floor:1}).chat.id,'007');
  assert.equal(J.resolve(lib,{chatId:'07',floor:1}).state,'missing');
  env.TAUI={state:{lib}};
  for(const [selection,id] of [['0',0],['7',7],['007','007']]){
    const source=Assist.context('timeline',box(selection,2,2),'outline').journalSource;
    assert.equal(source.chatId,id);
    assert.equal(J.proposalLink(lib,source,1).chatId,id);
  }
  const numericLink=J.attachment(lib.chats[1],1);
  const pendingScope=J.assistScope(lib,7,2,2);
  lib.chats[1].id='7';
  assert.equal(J.resolve(lib,numericLink).state,'missing','a stored number belongs to its original chat');
  assert.throws(()=>J.proposalLink(lib,pendingScope,1));
});
test('the page AI request defaults to instructions only and sends exactly the explicit range',()=>{
  const lib=library();env.TAUI={state:{lib,sel:{chat:'B'}}};
  assert.deepEqual(object(Assist.context('timeline',box(),'outline')),{brief:'outline'});
  const result=Assist.context('timeline',box('A',2,3),'outline');
  assert.deepEqual(result.journalSource.messages.map(m=>m.floor).join(','),'1,2');
  assert.ok(result.journalSource.messages.every(m=>m.sourceStamp));
  assert.ok(!JSON.stringify(result).includes('PRIVATE'));
  assert.ok(!JSON.stringify(result).includes('B conversation'));
  for(const [id,from,to] of [['A',2,1],['A',0,1],['A',1,99],['A','',1],['B',1,2.5],['removed',1,1]]) assert.throws(()=>J.assistScope(lib,id,from,to));
});
test('AI citations are bound by the local client and out-of-range or invented links are rejected',()=>{
  const lib=library(),chat=lib.chats[0],scope=J.assistScope(lib,'A',2,2);
  const raw={timeline:{notes:[{title:'Blue',body:'The map.',floor:1}],beats:[{title:'Next',summary:'Pick a route'}]}};
  const plan=A.proposal(lib,'create:timeline',raw,{journalSource:scope});
  assert.equal(plan.operations[0].value.messageStamp,J.attachment(chat,1).messageStamp);
  assert.equal(plan.operations[1].value.chatId,'A');assert.equal(plan.operations[1].value.floor,null);
  A.commit(lib,plan);assert.equal(lib.timeline.notes[0].chatId,'A');
  for(const item of [{title:'X',body:'Outside',floor:0},{title:'X',body:'Injected',floor:1,chatId:'B'}]){
    assert.throws(()=>A.proposal(lib,'create:timeline',{timeline:{notes:[item]}},{journalSource:scope}));
  }
  assert.deepEqual(object(J.proposalLink(lib,null,8)),{floor:8});
});
test('a delayed AI apply refuses a removed or replaced source without partially writing a batch',()=>{
  const lib=library(),scope=J.assistScope(lib,'A',1,2);
  const result={timeline:{notes:[{title:'Intro',body:'Read it.',floor:0},{title:'Map',body:'Blue.',floor:1}]}};
  const plan=A.proposal(lib,'create:timeline',result,{journalSource:scope});
  lib.chats[0].messages[1]=line('Keeper','A different record');
  assert.throws(()=>A.commit(lib,plan));assert.equal(lib.timeline.notes.length,0);
  lib.chats.shift();assert.throws(()=>A.proposal(lib,'create:timeline',result,{journalSource:scope}));
});
test('a changed message in chat zero also prevents a pending AI journal addition',()=>{
  const lib=library();
  lib.chats[0].id=0;
  const scope=J.assistScope(lib,0,2,2);
  const result={timeline:{notes:[{title:'Map',body:'Read it.',floor:1}]}};
  const plan=A.proposal(lib,'create:timeline',result,{journalSource:scope});
  assert.equal(plan.operations[0].value.chatId,0);
  lib.chats[0].messages[1].mes='Revised dialogue';
  assert.throws(()=>A.commit(lib,plan));
  assert.deepEqual(object(lib.timeline.notes),[]);
});
test('full backup, restore, merge and journal export preserve stable IDs and links without dialogue transcripts',()=>{
  const lib=library();
  const legacy={id:'old',title:'Earlier',body:'Draft',floor:4};
  const note={id:'note-id',title:'Map',body:'Find the coast.',...J.attachment(lib.chats[0],1)};
  lib.timeline.notes=[legacy,note];
  const restored=F.backupLibrary(F.backupOf(lib));
  const merged=S.merge(library(),restored);
  assert.deepEqual(object(merged.timeline.notes),[legacy,note]);
  const journal=object(F.timelineToExport(merged));
  assert.equal(journal.format,'tavern-atelier.timeline.v1');assert.deepEqual(journal.notes,[legacy,note]);
  assert.ok(!JSON.stringify(journal).includes('PRIVATE'));assert.equal(journal.notes[1].id,'note-id');
});
console.log(count+' story journal checks passed');
