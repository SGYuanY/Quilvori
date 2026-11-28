import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';

const env=vm.createContext({structuredClone,Date,TextDecoder,TextEncoder,crypto:webcrypto,btoa,atob});
for(const name of ['formats','store','library-actions','work-outcomes','backup-review']) {
  vm.runInContext(readFileSync(new URL('../js/'+name+'.js',import.meta.url),'utf8'),env);
}
const {TAStore:S,TAFormats:F,TALibraryActions:D,TABackupReview:B}=env;
const plain=v=>JSON.parse(JSON.stringify(v));
const header={user_name:'Reader',character_name:'Writer',create_date:'native',chat_metadata:{topic:'cloud',authors:{local:true}}};
const message={name:'Writer',mes:'The original message',is_user:false,is_system:false,send_date:'day one',swipes:['The original message','Second draft'],extra:{format:'fixture'}};

test('standalone chats restore the original header, authors, bookmarks, indices, swipes and extension fields',()=>{
  const native=F.chatFromText([header,message].map(r=>JSON.stringify(r)).join('\n'),'writer.jsonl');
  assert.deepEqual(plain(native.stHeader),header);assert.deepEqual(plain(native.messages[0].swipes),message.swipes);
  native.id='chat-one';native.bookmarks=[{id:'mark',index:0,note:'bookmark note',excerpt:'original',future:27}];
  native.custom={version:2};native.messages[0].name='';native.messages[0].send_date=0;
  const restored=F.chatFromText(JSON.stringify(native,null,2),'reading.json');
  assert.deepEqual(plain(restored),plain(native));
  assert.equal(S.verify({chats:[restored]}).chats[0].messages[restored.bookmarks[0].index].mes,message.mes);
  assert.equal(F.chatFromText(JSON.stringify([message]),'legacy.json').messages[0].mes,message.mes);
  assert.equal(F.chatFromText(JSON.stringify({messages:[message],user_name:'Legacy'}),'legacy.json').userName,'Legacy');
  const generic=F.chatFromText(JSON.stringify({messages:[{role:'user',content:'Generic text'}],bookmarks:[{index:0}],stHeader:header}),'generic.json');
  assert.equal(generic.messages[0].mes,'Generic text');assert.equal(generic.messages[0].is_user,true);
  assert.deepEqual(plain(generic.stHeader),header);
  assert.throws(()=>F.chatFromText('{"messages":[],"bookmarks":{}}','bad.json'));
});

function fixture(){
  return S.normalize({
    characters:[{id:'c',name:'Otter',description:'one\nLocal paragraph\nthree',personality:'Local persona',scenario:'Local scene',embeddedBookId:'w'},
      {id:'r',name:'Other'}],
    worldBooks:[{id:'w',name:'Harbor',entries:[{id:'entry',content:'Local lore',comment:'Weather'}]}],
    groups:[{id:'g',name:'Cast',members:[{characterId:'c',talkativeness:.3}]}],
    scripts:[{id:'s',name:'Scene',beats:[{id:'b',speaker:'c',line:'My line'},{id:'n',speaker:'narrator',line:'Narration'}]}],
    graph:{nodes:[{id:'n1',characterId:'c',label:'Reader'},{id:'n2',characterId:null,label:'Gate'}],edges:[{id:'edge',from:'n1',to:'n2',label:'at'}]},
    chats:[{id:'chat',name:'Chat',stHeader:header,messages:[message],bookmarks:[{index:0,excerpt:'original'}]}],
    timeline:{notes:[{id:'journal',chatId:'chat',floor:0,messageStamp:'original'}]},
    regexScripts:[{id:'rx',scriptName:'Script',findRegex:'a'}],
    quickReplySets:[{id:'qr',name:'Replies',workSource:{characterId:'c',bookId:'w',entryIds:['entry']},replies:[{id:'reply',message:'Hello'}]}],
    settings:{folderImports:{source:{kind:'cards',id:'c',hash:'abc'}}},
  });
}

test('deleting a character previews each live dependency and supports preserved names, unlinking and replacement',()=>{
  const lib=fixture(),p=D.plan(lib,'characters','c');
  assert.deepEqual(Array.from(p.refs,row=>row.type).sort(),['member','node','replyCard','source','speaker']);
  for(const [mode,who] of [['keep','Otter'],['unlink','未指定发言人'],['replace','Other']]){
    const {library:next,receipt}=D.remove(lib,p,mode,'r');
    assert.equal(F.scriptToExport(next.scripts[0],next).beats[0].speaker,who);
    assert.equal(F.scriptToExport(next.scripts[0],next).beats[1].speaker,'旁白');
    assert.equal(next.graph.nodes[0].characterId,mode==='replace'?'r':null);
    assert.deepEqual(plain(next.graph.edges),plain(lib.graph.edges));
    assert.equal(next.quickReplySets[0].workSource.characterId,mode==='replace'?'r':'');
    assert.equal(next.groups[0].members.length,mode==='replace'?1:0);
    assert.equal(next.settings.folderImports.source,undefined);
    assert.deepEqual(plain(D.undo(next,receipt)),plain(lib));
    next.scripts[0].beats[0].line='Later independent line';
    assert.equal(D.undo(next,receipt).scripts[0].beats[0].line,'Later independent line');
    next.scripts[0].beats[0].speaker='narrator';assert.throws(()=>D.undo(next,receipt));
  }
  const changed=structuredClone(lib);changed.scripts[0].beats.push({id:'unseen',speaker:'c',line:'After preview'});
  assert.throws(()=>D.remove(changed,p));
  lib.groups[0].members.push({characterId:'r',talkativeness:.9});
  const duplicate=D.remove(lib,D.plan(lib,'characters','c'),'replace','r');
  assert.equal(duplicate.library.groups[0].members.length,1);
  assert.deepEqual(plain(D.undo(duplicate.library,duplicate.receipt)),plain(lib));
});

test('asset deletion previews and restores portrait, expressions, book cover, chat and theme links through one receipt',()=>{
  const lib=fixture(),src={id:'art',name:'Harbor light',kind:'background',dataUrl:'data:image/png;base64,AA==',source:{author:{name:'Fixture Atelier'}}};
  lib.assets.push(src,{id:'other',name:'Other picture'});
  Object.assign(lib.characters[0],{avatarAssetId:'art',expressionAssetIds:['left','art','art','right']});
  lib.worldBooks[0].coverAssetId='art';
  lib.themes.push({id:'theme',name:'Evening',backgroundAssetId:'art',vars:{}});
  lib.settings.chatBackgroundAssetId='art';
  const start=JSON.stringify(lib),planned=D.plan(lib,'assets','art');
  assert.deepEqual(Array.from(planned.refs,r=>r.type).sort(),['avatar','bookCover','chatBackground','expressions','themeBackground']);
  assert.equal(JSON.stringify(lib),start);
  const {library:after,receipt}=D.remove(lib,planned);
  assert.equal(D.dependencies(after,'assets','art').length,0);
  assert.deepEqual(plain(after.characters[0].expressionAssetIds),['left','right']);
  assert.deepEqual(plain(D.undo(after,receipt)),plain(lib));
  after.characters[0].description='New sentence';
  after.characters[0].expressionAssetIds=['left','added','right'];
  after.themes[0].name='Edited theme';
  const restored=D.undo(after,receipt);
  assert.deepEqual(plain(restored.assets[0]),src);
  assert.deepEqual(plain(restored.characters[0].expressionAssetIds),['left','added','art','art','right']);
  assert.equal(restored.characters[0].description,'New sentence');
  assert.equal(restored.themes[0].name,'Edited theme');
  after.settings.chatBackgroundAssetId='other';
  const later=JSON.stringify(after);
  assert.throws(()=>D.undo(after,receipt));assert.equal(JSON.stringify(after),later);
  lib.characters[1].avatarAssetId='art';assert.throws(()=>D.remove(lib,planned));
  lib.characters[0].expressionAssetIds=['left','right','art','left','art'];
  const repeated=D.remove(lib,D.plan(lib,'assets','art'));
  repeated.library.characters[0].expressionAssetIds=['left','extra','right','left','later'];
  assert.deepEqual(plain(D.undo(repeated.library,repeated.receipt).characters[0].expressionAssetIds),
    ['left','extra','right','art','left','art','later']);
});

test('undo restores each supported deletion and all attached references without reviving a colliding ID',()=>{
  const lib=fixture();
  for(const [collection,key] of [['worldBooks','w'],['chats','chat'],['groups','g'],['regexScripts','rx'],['quickReplySets','qr'],['scripts','s']]){
    const {library,receipt}=D.remove(lib,D.plan(lib,collection,key));
    assert.ok(!library[collection].some(r=>r.id===key));
    if(collection==='chats')assert.equal(library.timeline.notes[0].chatId,undefined);
    if(collection==='worldBooks')assert.equal(library.characters[0].embeddedBookId,null);
    assert.deepEqual(plain(D.undo(library,receipt)),plain(lib));
    library[collection].push({id:key,name:'New item with this ID'});
    assert.throws(()=>D.undo(library,receipt));
  }
});

test('merge preview resolves individual fields with local-safe defaults, without mutating either input',()=>{
  const lib=fixture();
  lib.worldBooks[0].entries.push({id:'local-only',content:'New paragraph'});
  const raw={characters:[{id:'c',description:'one\nOld paragraph\nthree',personality:'Old persona',scenario:'Old scene'}],
    worldBooks:[{id:'w',entries:[{id:'entry',content:'Old lore'},{id:'backup-only',content:'Earlier paragraph'}]}]};
  const before=JSON.stringify(lib),source=JSON.stringify(raw),p=B.plan(lib,raw);
  const decision=new Map(p.conflicts.map(c=>[c.key,({content:'copy',description:'copy',personality:'backup'})[c.path.at(-1)] || 'keep']));
  assert.deepEqual(Array.from(p.conflicts,c=>c.path.at(-1)).sort(),['content','description','personality','scenario']);
  const out=B.apply(p,decision),original=out.characters.find(c=>c.id==='c'),copy=out.characters.find(c=>c.backupCopyOf==='c');
  assert.equal(original.description,lib.characters[0].description);assert.equal(original.personality,'Old persona');assert.equal(original.scenario,'Local scene');
  assert.ok(copy && copy.id!=='c');assert.equal(copy.description,'one\nOld paragraph\nthree');assert.equal(copy.name,'Otter');
  const book=out.worldBooks.find(b=>b.backupCopyOf==='w');assert.ok(book && book.id!=='w');
  assert.equal(out.worldBooks[0].entries[0].content,'Local lore');assert.equal(book.entries[0].content,'Old lore');
  assert.deepEqual(Array.from(out.worldBooks[0].entries,e=>e.id),['entry','local-only']);
  assert.deepEqual(Array.from(book.entries,e=>e.id),['entry','backup-only']);
  assert.equal(copy.embeddedBookId,book.id);assert.equal(original.embeddedBookId,'w');
  assert.equal(JSON.stringify(lib),before);assert.equal(JSON.stringify(raw),source);
  const live=structuredClone(lib);live.characters[0].creator='Simultaneous local edit';
  assert.equal(B.apply(p,decision,live).characters[0].creator,'Simultaneous local edit');
  live.characters[0].description='Edited since preview';assert.throws(()=>B.apply(p,decision,live));
  const deleted=structuredClone(lib);deleted.characters.splice(0,1);assert.throws(()=>B.apply(p,decision,deleted));
});

test('several copy decisions on a work create one alternative and redirect only incoming references',()=>{
  const local=fixture(),before=JSON.stringify(local);
  const backup={characters:[{id:'c',name:'Old name',description:'Old draft',personality:'Old personality',scenario:'Old scene',creator_notes:'Incoming-only note'}],
    groups:[{id:'new-group',name:'Imported cast',members:[{characterId:'c',enabled:false}]}],
    scripts:[{id:'new-script',beats:[{id:'new-beat',speaker:'c',line:'Incoming'}]}],
    quickReplySets:[{id:'other-replies',workSource:{characterId:'c',characterName:'Old name'},replies:[]}],
    graph:{nodes:[{id:'new-node',label:'Imported',characterId:'c'}]}};
  const p=B.plan(local,backup),inputs=JSON.stringify(backup),choices=new Map();
  for(const c of p.conflicts) choices.set(c.key,({description:'copy',personality:'copy',scenario:'backup'})[c.path.at(-1)] || 'keep');
  const result=B.apply(p,choices),copies=result.characters.filter(c=>c.backupCopyOf==='c');
  assert.equal(copies.length,1);const copy=copies[0],original=result.characters.find(c=>c.id==='c');
  assert.equal(copy.name,'Old name');assert.equal(copy.personality,'Old personality');
  assert.equal(copy.creator_notes,'Incoming-only note');
  assert.equal(original.creator_notes,undefined);assert.equal(original.scenario,'Old scene');
  assert.equal(original.description,local.characters[0].description);assert.equal(original.name,'Otter');
  assert.equal(result.groups[0].members[0].characterId,'c');assert.equal(result.groups[1].members[0].characterId,copy.id);
  assert.equal(result.scripts[0].beats[0].speaker,'c');assert.equal(result.scripts[1].beats[0].speaker,copy.id);
  assert.equal(result.quickReplySets[0].workSource.characterId,'c');assert.equal(result.quickReplySets[1].workSource.characterId,copy.id);
  assert.equal(result.graph.nodes.find(n=>n.id==='n1').characterId,'c');assert.equal(result.graph.nodes.find(n=>n.id==='new-node').characterId,copy.id);
  assert.equal(JSON.stringify(local),before);assert.equal(JSON.stringify(backup),inputs);
  backup.characters[0].description='Changes after preview';
  assert.equal(B.apply(p,choices).characters.find(row=>row.backupCopyOf==='c').description,'Old draft');
});

test('a separate copy of divergent conversations keeps bookmarks with the proper message branch',()=>{
  const lib=fixture(),incoming={chats:[{id:'chat',name:'Chat',
    messages:[{...message,mes:'Completely different ending'}],bookmarks:[{index:0,excerpt:'different ending'}]}],
    timeline:{notes:[{id:'incoming',chatId:'chat',floor:0}]}};
  const p=B.plan(lib,incoming),c=p.conflicts.find(x=>x.kind==='chat');assert.ok(c);
  const kept=B.apply(p,new Map());assert.equal(kept.chats[0].bookmarks[0].excerpt,'original');
  const replaced=B.apply(p,new Map([[c.key,'backup']]));assert.equal(replaced.chats[0].bookmarks[0].excerpt,'different ending');
  const both=B.apply(p,new Map([[c.key,'copy']])),copy=both.chats.find(item=>item.id!=='chat');
  assert.equal(copy.messages[0].mes,'Completely different ending');assert.equal(copy.bookmarks[0].excerpt,'different ending');
  assert.equal(both.timeline.notes.find(note=>note.id==='incoming').chatId,copy.id);
  assert.equal(both.timeline.notes.find(note=>note.id==='journal').chatId,'chat');
});

test('standalone settings and HTML alternatives retain both values as inert data',()=>{
  const lib=fixture();lib.memoryHtml='<em>local text</em>';
  const p=B.plan(lib,{memoryHtml:'<p>old draft</p>',characters:[]}),c=p.conflicts.find(row=>row.path[0]==='memoryHtml');
  const next=B.apply(p,new Map([[c.key,'copy']]));assert.equal(next.memoryHtml,lib.memoryHtml);
  assert.equal(next.backupAlternatives[0].value,'<p>old draft</p>');
  assert.deepEqual(plain(S.verify(F.backupLibrary(F.backupOf(next))).backupAlternatives),plain(next.backupAlternatives));
});
