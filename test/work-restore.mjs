import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const env=vm.createContext({structuredClone, Date});
for(const name of ['store','work-restore']){
  vm.runInContext(readFileSync(new URL('../js/'+name+'.js',import.meta.url),'utf8'),env);
}
const {TAStore:S, TAWorkRestore:R}=env;
const plain=value=>JSON.parse(JSON.stringify(value));
const key=(kind,id)=>JSON.stringify([kind,String(id)]);
const uid=()=>{let n=0;return kind=>kind+'-'+(++n);};
const asset=(id,name,dataUrl)=>({id,name,kind:'avatar',dataUrl});
const book=(id,name,cover)=>({id,name,entries:[{id:0,stUid:44,comment:'Harbor',content:'Tide signal',keys:['quay']}],coverAssetId:cover});
function fixture(){
  const local=S.verify({
    characters:[{id:0,name:'Revised Keeper',description:'Current manuscript',creationSource:'local source',creationRecordKeys:['local receipt'],creationPeerKeys:['local companion']}],
    worldBooks:[book(0,'Current atlas',0)],assets:[asset(0,'Current portrait','current'),asset('shared','Shared illustration','shared'),asset('missing','Unrelated local image','other')],
    stickerPacks:[{id:0,name:'Modern pack',stickers:[]}],
    chats:[{id:0,name:'Local chat',messages:[{mes:'Private local dialogue'}]}],settings:{backupNote:'keep'},
  });
  const incoming=S.verify({
    characters:[{id:0,name:'Keeper',description:'Older manuscript',personality:'A careful navigator',avatarAssetId:0,
      expressionAssetIds:['shared','missing'],stickerPackId:0,embeddedBookId:0,source:{embeddedBookId:0,author:'Fixture author'},
      creationSource:'file source',creationRecordKeys:['file receipt'],creationPeerKeys:['file companion'],folderTextHash:'device hash',extra:{native:true}}],
    worldBooks:[book(0,'Old atlas','cover'),book('historic','Lost tides','old-cover')],assets:[
      asset(0,'Old portrait','old'),asset('shared','Shared illustration','shared'),asset('cover','Old cover','cover'),
      asset('old-cover','Past cover','past'),asset('past','Former portrait','earlier'),asset('unrelated','Unused media','outside'),
    ],
    stickerPacks:[{id:0,name:'Old pack',stickers:[{name:'smile',dataUrl:'fixture image'}]}],
    chats:[{id:'outside',name:'Outside',messages:[]}],settings:{backupNote:'outside'},
  });
  const earlier={...incoming.characters[0],name:'First edition',avatarAssetId:'past',embeddedBookId:'historic',expressionAssetIds:[]};
  const state={versions:[
    {kind:'characters',id:0,time:1,label:'Earlier',reason:'手动快照',value:earlier},
    {kind:'characters',id:'0',time:2,label:'Deleted other edition',reason:'手动快照',value:{id:'0',name:'Different identity'}},
  ]};
  return {local,incoming,state};
}
function choices(plan,snapshots=[],omit=[],mode='copy'){
  const history=new Set(snapshots);
  return {mode,snapshots:history,dependencies:new Set(R.dependencies(plan,history).filter(d=>d.row&&!omit.includes(d.key)).map(d=>d.key))};
}
test('finds cards and books by name, ID, text and keywords without indexing outside works',()=>{
  const {incoming}=fixture();
  assert.deepEqual(plain(R.search(incoming,'KEEPER navigator')),[{kind:'characters',id:0,name:'Keeper'}]);
  assert.deepEqual(Array.from(R.search(incoming,'ATLAS quai')),[]);
  assert.equal(R.search(incoming,'atlas Quay')[0].kind,'worldBooks');
  assert.equal(R.search(incoming,'outside').length,0);
  assert.equal(R.search(incoming,'0').length,2);
});
test('independent copies remap colliding assets, books, packs, null references and numeric IDs',()=>{
  const {local,incoming,state}=fixture(),before=JSON.stringify(local),source=JSON.stringify(incoming);
  const plan=R.review(local,incoming,state,'characters',0);
  const selected=choices(plan);
  const {candidate,work,importSnapshots,previous}=R.materialize(local,plan,selected,uid());
  assert.equal(previous,null);
  assert.equal(work.backupCopyOf,0);assert.notEqual(work.id,0);
  assert.equal(work.name,'Keeper');assert.equal(work.extra.native,true);assert.equal(work.source.author,'Fixture author');
  assert.ok(!('creationSource' in work)&&!('creationRecordKeys' in work)&&!('creationPeerKeys' in work)&&!('folderTextHash' in work));
  assert.equal(candidate.assets.find(a=>a.id===0).dataUrl,'current');
  assert.equal(candidate.assets.find(a=>a.id===work.avatarAssetId).dataUrl,'old');
  assert.deepEqual(Array.from(work.expressionAssetIds),['shared']);
  const linked=candidate.worldBooks.find(b=>b.id===work.embeddedBookId);
  assert.equal(linked.name,'Old atlas');assert.notEqual(linked.id,0);assert.equal(work.source.embeddedBookId,linked.id);
  assert.equal(candidate.assets.find(a=>a.id===linked.coverAssetId).name,'Old cover');
  assert.equal(candidate.stickerPacks.find(p=>p.id===work.stickerPackId).name,'Old pack');
  assert.equal(candidate.characters[0],local.characters[0]);assert.equal(candidate.chats,local.chats);assert.equal(candidate.settings,local.settings);
  assert.equal(importSnapshots.length,0);assert.equal(candidate.worldBooks.length,2);
  assert.equal(candidate.assets.some(a=>a.name==='Unused media' || a.name==='Former portrait'),false);
  assert.equal(JSON.stringify(local),before);assert.equal(JSON.stringify(incoming),source);
});
test('selecting a snapshot includes only its chosen historical dependencies under the restored ID',()=>{
  const {local,incoming,state}=fixture();
  const plan=R.review(local,incoming,state,'characters',0);
  assert.equal(plan.versions.length,1);
  const selected=choices(plan,[0],[key('worldBooks',0),key('assets',0),key('assets','old-cover')]);
  const {candidate,work,importSnapshots:[rev]}=R.materialize(local,plan,selected,uid());
  assert.equal(work.avatarAssetId,null);assert.equal(work.embeddedBookId,null);assert.ok(!('embeddedBookId' in work.source));
  assert.equal(rev.id,work.id);assert.equal(rev.value.id,work.id);assert.equal(rev.entity,JSON.stringify(['characters',work.id]));
  assert.equal(rev.value.name,'First edition');assert.equal(rev.time,1);assert.equal(rev.label,'Earlier');
  assert.ok(!('creationRecordKeys' in rev.value));assert.equal(rev.value.source.embeddedBookId,undefined);
  const referenced=candidate.worldBooks.find(row=>row.id===rev.value.embeddedBookId);
  assert.equal(referenced.name,'Lost tides');assert.equal(referenced.coverAssetId,null);
  assert.equal(candidate.assets.find(a=>a.id===rev.value.avatarAssetId).name,'Former portrait');
  assert.ok(!candidate.assets.some(a=>['Old portrait','Old cover','Past cover'].includes(a.name)));
});
test('replacing preserves local work identity and rejects a stale review while keeping unrelated edits',()=>{
  const {local,incoming,state}=fixture(),plan=R.review(local,incoming,state,'characters',0);
  const selected=choices(plan,[0],[],'replace');
  const independent=structuredClone(local);independent.chats[0].name='Later chat edit';
  const result=R.materialize(independent,plan,selected,uid());
  assert.equal(result.work.id,0);assert.equal(result.work.creationSource,'local source');
  assert.deepEqual(Array.from(result.work.creationRecordKeys),['local receipt']);assert.equal(result.work.backupCopyOf,undefined);
  assert.deepEqual(Array.from(result.work.creationPeerKeys),['local companion']);
  assert.equal(result.importSnapshots[0].value.creationSource,'local source');assert.equal(result.candidate.chats[0].name,'Later chat edit');
  assert.equal(result.previous.description,'Current manuscript');
  local.characters[0].description='Later card edit';
  assert.throws(()=>R.materialize(local,plan,selected,uid()),/资料库已变化/);
  local.characters[0].id='0';
  const mismatched=R.review(local,incoming,state,'characters',0);
  assert.equal(mismatched.blocked,'restore.differentIds');
  assert.throws(()=>R.materialize(local,mismatched,selected,uid()),/资料库已变化/);
});
test('only safe world-book replacements are offered, including links added after the review',()=>{
  const {local,incoming}=fixture();
  const plan=R.review(local,incoming,null,'worldBooks',0);
  assert.equal(plan.blocked,'');
  local.quickReplySets.push({workSource:{bookId:0,entryIds:['other']}});
  assert.equal(R.review(local,incoming,null,'worldBooks',0).blocked,'restore.linkedEntries');
  assert.throws(()=>R.materialize(local,plan,choices(plan,[],[],'replace'),uid()),/资料库已变化/);
  local.quickReplySets[0].workSource.entryIds=[0];
  assert.equal(R.review(local,incoming,null,'worldBooks',0).blocked,'');
  incoming.worldBooks[0].entries[0].stUid=99;
  assert.equal(R.review(local,incoming,null,'worldBooks',0).blocked,'restore.linkedEntries');
  local.quickReplySets=[];local.graph.exportBookId=0;
  assert.equal(R.review(local,incoming,null,'worldBooks',0).blocked,'restore.managedBook');
  incoming.worldBooks[0].graphSource={kind:'relationship-graph',bookId:0};
  incoming.worldBooks[0].entries[0].graphSource={edgeId:0};
  const result=R.materialize(local,plan,choices(plan),uid());
  assert.equal(result.work.graphSource,undefined);assert.equal(result.work.entries[0].graphSource,undefined);
  assert.equal(result.candidate.graph,local.graph);
});
test('unchecked replacement attachments preserve the local links while imported snapshots remain independent',()=>{
  const {local,incoming,state}=fixture(),live=local.characters[0];
  Object.assign(live,{avatarAssetId:0,stickerPackId:0,source:{embeddedBookId:0},expressionAssetIds:[0,'shared']});
  const plan=R.review(local,incoming,state,'characters',0);
  const options={mode:'replace',snapshots:new Set([0]),dependencies:new Set()};
  const kept=R.materialize(local,plan,options,uid());
  assert.equal(kept.work.avatarAssetId,0);assert.equal(kept.work.stickerPackId,0);
  assert.ok(!Object.hasOwn(kept.work,'embeddedBookId'));assert.equal(kept.work.source.embeddedBookId,0);
  assert.equal(kept.work.source.author,'Fixture author');assert.deepEqual(Array.from(kept.work.expressionAssetIds),[0,'shared']);
  const old=kept.importSnapshots[0].value;
  assert.equal(old.avatarAssetId,null);assert.equal(old.stickerPackId,null);assert.equal(old.embeddedBookId,null);
  assert.ok(!Object.hasOwn(old.source,'embeddedBookId'));assert.equal(old.expressionAssetIds.length,0);
  live.embeddedBookId='';incoming.characters[0].expressionAssetIds.push('past');
  const partial=R.materialize(local,R.review(local,incoming,state,'characters',0),{
    ...options,dependencies:new Set([key('assets','shared'),key('assets','past')]),
  },uid());
  assert.equal(partial.work.embeddedBookId,'');assert.equal(partial.work.source.embeddedBookId,0);
  assert.deepEqual(Array.from(partial.work.expressionAssetIds).slice(0,2),[0,'shared']);
  assert.equal(partial.work.expressionAssetIds.length,3);
  assert.equal(partial.candidate.assets.find(a=>a.id===partial.work.expressionAssetIds[2]).name,'Former portrait');
  const oldBook=R.review(local,incoming,null,'worldBooks',0);
  const restored=R.materialize(local,oldBook,{...options,snapshots:new Set()},uid());
  assert.equal(restored.work.coverAssetId,0);
});
test('a repeated replacement reuses its unchanged linked works and media without reclaiming a later edit',()=>{
  const {local,incoming,state}=fixture(),allocate=uid();
  function restore(library){
    const p=R.review(library,incoming,state,'characters',0);
    return R.materialize(library,p,choices(p,[0],[],'replace'),allocate);
  }
  const first=restore(local),again=restore(first.candidate);
  assert.equal(again.changed,false);
  assert.equal(again.candidate.worldBooks.length,first.candidate.worldBooks.length);
  assert.equal(again.candidate.assets.length,first.candidate.assets.length);
  assert.deepEqual(plain(again.importSnapshots),plain(first.importSnapshots));
  const localBook=again.candidate.worldBooks.find(b=>b.id===again.work.embeddedBookId);
  localBook.description='Revised after restore';
  const revised=restore(again.candidate);
  assert.equal(revised.changed,true);assert.notEqual(revised.work.embeddedBookId,localBook.id);
  assert.equal(revised.candidate.worldBooks.find(b=>b.id===localBook.id).description,'Revised after restore');
});
test('local snapshot rollback reviews each missing link and applies only the confirmed choices',()=>{
  const {local}=fixture(), current=local.characters[0];
  Object.assign(current,{avatarAssetId:0,expressionAssetIds:['shared','0','absent'],source:{embeddedBookId:'0'},stickerPackId:0});
  const saved={...current,avatarAssetId:'lost',expressionAssetIds:['lost','shared','lost'],stickerPackId:'lost',
    embeddedBookId:'missing book',source:{embeddedBookId:'former source',author:'Original credit'}};
  const before=JSON.stringify([local,saved]);
  const {missing}=R.snapshotReview(local,'characters',saved,current);
  const options=new Map(missing.map(link=>[link.field,link]));
  assert.deepEqual(plain(options.get('embeddedBookId').currentIds),[0]);
  assert.deepEqual(plain(options.get('expressionAssetIds').currentIds),['shared',0]);
  assert.equal(missing.length,5);
  const decisions=new Map(missing.map(link=>[link.key,{mode:'unlink'}]));
  for(const field of ['expressionAssetIds','embeddedBookId']) {
    const link=options.get(field);decisions.set(link.key,{mode:'keep',ids:link.currentIds});
  }
  decisions.set(options.get('avatarAssetId').key,{mode:'replace',id:'0'});
  assert.throws(()=>R.restoreSnapshot(local,'characters',saved,current),/history.reviewLinks/);
  const next=R.restoreSnapshot(local,'characters',saved,current,decisions);
  assert.equal(next.avatarAssetId,0);assert.equal(next.embeddedBookId,0);
  assert.deepEqual(plain(next.expressionAssetIds),['shared',0]);assert.equal(next.stickerPackId,null);
  assert.deepEqual(next.source,{author:'Original credit'});
  assert.equal(JSON.stringify([local,saved]),before);
  const missingTarget=structuredClone(local);missingTarget.assets=missingTarget.assets.filter(r=>r.id!==0);
  assert.throws(()=>R.restoreSnapshot(missingTarget,'characters',saved,current,decisions),/history.reviewLinks/);
  local.worldBooks.push(book('missing book','Restored elsewhere'));
  assert.throws(()=>R.restoreSnapshot(local,'characters',saved,current,decisions),/history.reviewLinks/);
});
test('unlinking the effective legacy book leaves the original attribution and no fallback to the missing ID',()=>{
  const {local}=fixture(),current=local.characters[0],saved={...current,source:{embeddedBookId:'missing book',credit:'studio'}};
  const {missing}=R.snapshotReview(local,'characters',saved,current);
  assert.equal(missing.length,1);
  const next=R.restoreSnapshot(local,'characters',saved,current,new Map([[missing[0].key,{mode:'unlink'}]]));
  assert.equal(next.embeddedBookId,'');assert.deepEqual(next.source,{credit:'studio'});
});
test('local world-book rollback resolves missing covers and packs and preserves live quick-reply entry links',()=>{
  const {local}=fixture(),current=local.worldBooks[0];
  const saved={...current,coverAssetId:'former-cover',stickerPackId:'former-pack'};
  const {missing}=R.snapshotReview(local,'worldBooks',saved,current);
  assert.deepEqual(Array.from(missing,link=>link.field),['coverAssetId','stickerPackId']);
  const options=new Map(missing.map(link=>[link.key,{mode:'replace',id:'0'}]));
  const next=R.restoreSnapshot(local,'worldBooks',saved,current,options);
  assert.equal(next.coverAssetId,0);assert.equal(next.stickerPackId,0);
  local.quickReplySets.push({workSource:{bookId:'0',entryIds:['0']}});
  assert.throws(()=>R.restoreSnapshot(local,'worldBooks',{...saved,entries:[]},current,options),/history.linkedEntries/);
  assert.throws(()=>R.restoreSnapshot(local,'worldBooks',{...saved,entries:[{...saved.entries[0],stUid:11}]},current,options),/history.linkedEntries/);
});
test('entry changes identify only affected saved sets and active choices, including zero IDs',()=>{
  const current={id:0,entries:[{id:0,stUid:3},{id:'active',stUid:4},{id:2,stUid:5}]};
  const set={id:0,name:'Dock replies',workSource:{bookId:'0',entryIds:['0',0,'broken',2]}};
  const lib={quickReplySets:[set,{id:1,workSource:{bookId:1,entryIds:[0]}}]};
  const selection={bookId:0,entryIds:['active'],scope:'selected'};
  const proposed=[{id:'active',stUid:9},{id:2,stUid:5,content:'Edited text'}];
  const before=JSON.stringify([lib,current,proposed,selection]);
  assert.deepEqual(plain(R.entryReferenceChanges(lib,current,proposed,selection)),[
    {set,entryIds:[0]},{set:null,entryIds:['active']},
  ]);
  assert.equal(R.entryReferenceChanges(lib,current,proposed,{...selection,scope:'relevant'}).length,1);
  assert.equal(R.entryReferenceChanges(lib,current,current.entries,selection).length,0);
  assert.equal(JSON.stringify([lib,current,proposed,selection]),before);
});
