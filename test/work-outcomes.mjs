import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const root=vm.createContext({structuredClone});
for(const name of ['work-outcomes','creation-records','work-backup','store','formats','backup-review']){
  vm.runInContext(readFileSync(new URL('../js/'+name+'.js',import.meta.url),'utf8'),root);
}
const {TAWorkOutcomes:out,TACreationRecords:archive,TAWorkBackup:backups}=root;
const record=(id,hash,fields={})=>({id,task:'create:character',startedAt:'2026-01-01T08:00:00Z',
  workKinds:['character','world'],workBatch:'shared',workRun:'run-'+id,sourceKey:hash,output:'fixture text',status:'validated',...fields});
const lib=(characters=[],worldBooks=[])=>({characters,worldBooks});
const plan=(id,kind,work,fields={})=>({id,batchId:'shared',task:'create:'+kind,operations:[{kind:'add',
  path:[kind==='world'?'worldBooks':'characters'],value:work}],...fields});
const parse=(_record,kind)=>({ready:kind==='character',name:'From response',error:'No valid world entries'});
const resolve=(r,records,library=lib(),drafts=[],session=[],parser=parse)=>out.resolve(r,records,library,drafts,session,parser);
const state=(rows,kind)=>rows.find(row=>row.kind===kind);
const work=(id,name,r,previous)=>{const w={id,name};out.stamp(w,previous,r.id,r.sourceKey);return w;};

test('records with identical bytes and a reused batch open their own works, including numeric ID zero',()=>{
  const a=record('first','same'),b=record('second','same');
  const original=work(0,'Renamed keeper',a),other=work('other','Renamed keeper',b);
  const drafts=[plan('p2','character',other)];
  assert.equal(state(resolve(a,[a,b],lib([original]),drafts),'character').workId,0);
  assert.equal(state(resolve(b,[a,b],lib([original]),drafts),'character').draftId,'p2');
  assert.equal(state(resolve(b,[a,b],lib([original])),'character').status,'recoverable');
  assert.equal(state(resolve(a,[a,b],lib([original,{...original,id:'fork'}])),'character').status,'attention');
  assert.equal(state(resolve(a,[a,b],lib([original,{...original,id:'fork'}])),'character').workId,undefined);
});

test('revisions retain earlier provenance; undo and deletion follow the current shelf',()=>{
  const a=record('initial','hash1'),b=record('revision','hash2'),first=work('paper','Original',a);
  const revised=work('paper','Revised',b,first),p=plan('p','character',revised);
  for(const r of [a,b]){
    assert.equal(state(resolve(r,[a,b],lib([revised])),'character').name,'Revised');
    assert.equal(state(resolve(r,[a,b],lib(),[p]),'character').draftId,'p');
    assert.equal(state(resolve(r,[a,b]),'character').status,'recoverable');
  }
  assert.equal(state(resolve(a,[a,b],lib([{id:'paper',name:'Unrelated replacement'}])),'character').workId,undefined);
});

test('one click may use two provider replies; a previous click with the same batch stays separate',()=>{
  const card=record('card','hash-card',{workRun:'one',workSelection:['character','world']});
  const book=record('book','hash-book',{workRun:'one',task:'create:world',workKinds:['world'],workSelection:['character','world']});
  const previous=record('previous','hash0',{workSelection:['character']});
  const records=[previous,card,book],stateOf=lib([work('c','Card',card)],[work('b','Book',book)]);
  for(const selected of [card,book]){
    const rows=resolve(selected,records,stateOf);
    assert.equal(state(rows,'character').workId,'c');
    assert.equal(state(rows,'world').workId,'b');
    assert.equal(state(rows,'world').source.id,'book');
  }
  assert.equal(resolve(previous,records,stateOf).length,1);
  assert.equal(state(resolve(previous,records,stateOf),'character').workId,undefined);
});

test('legacy drafts and receipts require matching batch, kind, output and stored ID',()=>{
  const r=record('legacy','old',{workRun:undefined,workKinds:['character']});
  const w={id:0,name:'Older card',creationSource:'old'},p=plan('prior','character',w,{sourceKey:'old'});
  assert.equal(state(resolve(r,[r],lib(),[p]),'character').draftId,'prior');
  assert.equal(state(resolve(r,[r],lib([w]),[],[p]),'character').workId,0);
  assert.equal(state(resolve(r,[r],lib([w])),'character').status,'attention');
  assert.equal(state(resolve(r,[r],lib([{...w,id:'different'}]),[],[p]),'character').workId,undefined);
  const repeat={...r,id:'second'};
  assert.equal(state(resolve(r,[r,repeat],lib(),[p]),'character').status,'attention');
  assert.equal(state(resolve(r,[r],lib(),[{...p,batchId:'other'}]),'character').draftId,undefined);
});

test('archive aliases preserve stable record identity and merging the same backup is idempotent',()=>{
  const a=record('shared','left'),b=record('shared','right');
  const blank=()=>({drafts:[],versions:[],limits:[],records:[]});
  const local={...blank(),records:[a]},incoming={...blank(),records:[b]};
  const library=lib([work('L','Left',a),work('remapped','Incoming',b)]);
  const merged=backups.merge(local,incoming,library).state;
  const renamed=merged.records.find(r=>r.id!=='shared');
  assert.equal(renamed.workOrigin,'shared');
  assert.equal(state(resolve(renamed,merged.records,library),'character').workId,'remapped');
  assert.equal(state(resolve(merged.records[0],merged.records,library),'character').workId,'L');
  assert.equal(backups.merge(merged,incoming,library).state.records.length,2);
});

test('a full-backup merge assigns a response only to the work that owns it',()=>{
  const r=record('request','first-hash'),later=record('revision','next-hash');
  const manual={id:'shared',name:'Untitled',description:'Written by hand'};
  const generated={...work('shared','Untitled',r),description:'Generated text'};
  function merge(localCard,incomingCard,choice){
    const local=root.TAStore.emptyLibrary(), incoming=root.TAStore.emptyLibrary();
    local.characters=[localCard];incoming.characters=[incomingCard];
    const preview=root.TABackupReview.plan(local,incoming);
    assert.ok(!preview.conflicts.some(c=>c.path.some(key=>['creationRecordKeys','creationSource','creationPeerKeys'].includes(key))));
    const field=preview.conflicts.find(c=>c.path.at(-1)==='description');
    assert.ok(field);
    return root.TABackupReview.apply(preview,new Map([[field.key,choice]]),local);
  }
  for(const choice of ['keep','backup']){
    const merged=merge(manual,generated,choice);
    assert.equal(state(resolve(r,[r],merged),'character').status,'recoverable');
    assert.equal(merged.characters[0].description,choice==='keep' ? manual.description : generated.description);
  }
  const split=merge(manual,generated,'copy'), copy=split.characters.find(c=>c.id!=='shared');
  assert.equal(state(resolve(r,[r],split),'character').workId,copy.id);
  const reversed=merge(generated,manual,'copy'), handwritten=reversed.characters.find(c=>c.id!=='shared');
  assert.equal(handwritten.creationRecordKeys,undefined);assert.equal(handwritten.creationSource,undefined);
  assert.equal(state(resolve(r,[r],reversed),'character').workId,'shared');
  const peerKey=out.recordKey(record('peer','peer-hash'));
  const revised={...work('shared','Untitled',later,generated),description:'Revised text',creationPeerKeys:[peerKey]};
  const related=merge(generated,revised,'backup');
  assert.deepEqual(Array.from(related.characters[0].creationPeerKeys),[peerKey]);
  for(const original of [r,later])assert.equal(state(resolve(original,[r,later],related),'character').workId,'shared');
  const unrelated=merge({...manual,creationRecordKeys:['old-extension-value']},
    {...generated,creationRecordKeys:['old-extension-value',...generated.creationRecordKeys]},'backup');
  assert.equal(state(resolve(r,[r],unrelated),'character').status,'recoverable');
  assert.equal(merge(manual,revised,'backup').characters[0].creationPeerKeys,undefined);
});

test('reasoning-only and other failures keep a small exportable status without prompt or model diagnostics',()=>{
  const r=record('no-text','unused',{output:'',status:'error',emptyReason:'reasoning',errorCode:'empty-output',
    reasoning:'private trace',workBrief:'private request',error:'private response header',headers:{Authorization:'private token'}});
  const saved=archive.portable(r),empty={drafts:[],versions:[],limits:[],records:[saved]};
  assert.doesNotMatch(JSON.stringify(saved),/private|unused/);
  assert.equal(backups.normalize(empty).records[0].emptyReason,'reasoning');
  assert.throws(()=>backups.normalize({...empty,records:[{...saved,status:'validated'}]}));
  for(const row of resolve(saved,[saved])){assert.equal(row.status,'attention');assert.match(row.detail,/推理/);}
  const interrupted={...saved,errorCode:'idle-timeout'};
  assert.match(state(resolve(interrupted,[interrupted]),'character').detail,/超时/);
  const failed=record('failed','hash',{workKinds:['character'],failedDraftKinds:['character']});
  assert.match(state(resolve(failed,[failed]),'character').detail,/写入失败/);
  assert.equal(state(resolve(failed,[failed],lib(),[plan('retry','character',work('id','Recovered',failed))]),'character').status,'draft');
});
