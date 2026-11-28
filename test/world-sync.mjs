import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const context = vm.createContext({structuredClone});
for (const name of ['resource-source','formats','world-sync']) {
  vm.runInContext(readFileSync(new URL('../js/'+name+'.js',import.meta.url),'utf8'),context);
}
const {TAWorldSync:sync,TAFormats:formats} = context;
const plain = value => JSON.parse(JSON.stringify(value));
const filename = 'Harbor.json';
const raw = () => ({entries:{0:{uid:0,comment:'Dock',content:'High tide.',key:['pier']}}});
function library(file=raw()) {
  const book = plain(formats.worldInfoToBook(file,'Harbor'));
  return {...book,id:0,entries:book.entries.map((e,i) => ({...e,id:i===0?0:'old-'+i}))};
}
function review(base,work,disk) { return sync.review(base,work,disk,filename); }
function solve(plan,choices) { return plain(sync.resolve(plan,choices)); }
const choices = (plan,side) => Object.fromEntries(plan.rows.filter(row=>row.kind==='conflict').map(row=>[row.key,side]));
const keys = plan => Array.from(plan.rows,row=>[row.uid,row.field,row.kind]);
const error = code => e => e.code===code;

test('a sparse World Info file keeps its exact original fields and scalar representations',()=>{
  const file={version:'v2',entries:{7:{comment:'Lamp',content:'On duty',constant:'0',key:'amber,green',opaque:{nested:[],color:null}},20:{uid:'20',content:'Signal',order:'90'}}};
  const work=library(file);work.entries[1].stUid=20;work.pinned=true;work.entries[0].graphSource={node:0};
  const first=review(null,work,file);
  assert.deepEqual(keys(first),[]);
  const out=solve(first);
  assert.deepEqual(out.document,file);assert.deepEqual(out.book,work);
  assert.deepEqual(keys(review(file,out.book,file)),[]);
  assert.equal(sync.hasLocalChanges(file,out.book,filename),false);
  assert.equal(sync.same({b:[3,1],a:4},{a:4,b:[3,1]}),true);assert.equal(sync.same([0,1],[1,0]),false);
});

test('combines independent edits by native UID and nested field without leaking local metadata',()=>{
  const base=raw();base.entries[0].extensions={addon:{accent:'blue',level:1}};
  base.extensionHeader={opaque:{a:1,b:2}};const work=library(base);
  work.entries[0].content='The lamps are lit.';work.entries[0].stExtensions.addon.accent='red';
  work.entries[0].graphSource={node:'dock'};work.coverAssetId=0;work.creationRecordKeys=['receipt'];
  work.stBookFields.extensionHeader.opaque.a=3;
  const disk=structuredClone(base);disk.entries[0].key=['pier','lantern'];disk.entries[0].extensions.addon.level=2;
  disk.extensionHeader.opaque.b=5;disk.entries[0].customPlugin={filters:[{query:'keep'}]};
  const p=review(base,work,disk);
  assert.deepEqual(keys(p).sort(),[
    [0,'content','local'],[0,'key','disk'],[0,'customPlugin','disk'],
    [0,'extensions.addon.accent','local'],[0,'extensions.addon.level','disk'],
    [null,'extensionHeader.opaque.a','local'],[null,'extensionHeader.opaque.b','disk'],
  ].sort());
  const out=solve(JSON.parse(JSON.stringify(p)));
  const expected=structuredClone(disk);expected.entries[0].content=work.entries[0].content;
  expected.entries[0].extensions.addon.accent='red';expected.extensionHeader.opaque.a=3;
  assert.deepEqual(out.document,expected);assert.equal(out.book.id,0);assert.equal(out.book.entries[0].id,0);
  assert.deepEqual(out.book.entries[0].graphSource,{node:'dock'});assert.deepEqual(out.book.creationRecordKeys,['receipt']);assert.equal(out.book.coverAssetId,0);
  assert.deepEqual(out.book.entries[0].keys,['pier','lantern']);assert.equal(sync.hasLocalChanges(out.document,out.book,filename),false);
  assert.equal(base.entries[0].content,'High tide.');assert.deepEqual(disk.entries[0].extensions.addon,{accent:'blue',level:2});
});

test('requires an explicit initial comparison and respects null, missing, and reserved-looking label text',()=>{
  const disk=raw();disk.entries[0].metadata={nullable:null};disk.entries[0].comment='Dock <B>';
  const local=library(disk);local.entries[0].content='Different.';delete local.entries[0].stSettings.metadata.nullable;
  const plan=review(null,local,disk);
  assert.deepEqual(keys(plan),[[0,'content','conflict'],[0,'metadata.nullable','conflict']]);
  assert.throws(()=>solve(plan),error('sync.unresolved'));
  const nullable=plan.rows.find(x=>x.field==='metadata.nullable');
  assert.deepEqual([nullable.localPresent,nullable.diskPresent,nullable.disk,nullable.basePresent],[false,true,null,false]);
  assert.equal(nullable.label,'Dock <B>');
  assert.deepEqual(solve(plan,choices(plan,'disk')).document,disk);
  const localResult=solve(plan,choices(plan,'local'));
  assert.deepEqual(localResult.document.entries[0].metadata,{});assert.equal(localResult.document.entries[0].content,'Different.');
  assert.equal(sync.hasLocalChanges(localResult.document,localResult.book,filename),false);
});

test('a changed field in both editions is the only conflict and agreeing edits require no choice',()=>{
  const base=raw(), work=library(base),disk=structuredClone(base);
  work.entries[0].content='Local';work.entries[0].comment='Harbormaster';
  disk.entries[0].content='SillyTavern';disk.entries[0].comment='Harbormaster';
  const plan=review(base,work,disk);
  assert.deepEqual(keys(plan),[[0,'content','conflict']]);
  for(const side of ['local','disk']){
    const out=solve(plan,choices(plan,side));
    assert.equal(out.document.entries[0].content,side==='local'?'Local':'SillyTavern');
    assert.equal(out.book.entries[0].content,out.document.entries[0].content);
    assert.equal(out.book.entries[0].id,0);
  }
});

test('a deletion against a modified entry and different additions at the same UID require whole-entry decisions',()=>{
  const base=raw(),work=library(base),disk=structuredClone(base);
  work.entries=[];disk.entries[0].key=['wharf'];disk.entries[5]={uid:5,content:'Remote arrival'};
  work.entries.push({id:'local-five',stUid:5,comment:'Arrival',content:'Local arrival'});
  const plan=review(base,work,disk);
  assert.deepEqual(keys(plan),[[0,'entry','conflict'],[5,'entry','conflict']]);
  const zero=plan.rows[0];assert.equal(zero.localPresent,false);assert.equal(zero.basePresent,true);
  const result=solve(plan,{[zero.key]:'disk',[plan.rows[1].key]:'local'});
  assert.equal(result.document.entries[5].content,'Local arrival');assert.deepEqual(result.document.entries[0].key,['wharf']);
  assert.equal(result.book.entries.find(e=>e.stUid===5).id,'local-five');
  assert.ok(result.book.entries.find(e=>e.stUid===0).id);
  const deleted=solve(plan,choices(plan,'local'));assert.equal(deleted.document.entries[0],undefined);
  work.entries=library(base).entries;disk.entries={};
  const ordinary=review(base,work,disk);assert.deepEqual(keys(ordinary),[[0,'entry','disk']]);
  assert.equal(solve(ordinary,{[ordinary.rows[0].key]:'local'}).book.entries[0].id,0);
});

test('unassigned new local rows cannot claim a new remote UID and imported local IDs cannot collide',()=>{
  const base=raw(), work=library(base), disk=structuredClone(base);
  work.entries[0].id='lore_sync_1';
  work.entries.push({id:'signal',content:'New local',keys:['lamp']});
  disk.entries[1]={uid:1,comment:'Tide',content:'New remote'};
  const plan=review(base,work,disk),out=solve(plan);
  assert.deepEqual(keys(plan),[[1,'entry','disk'],[2,'entry','local']]);
  const imported=out.book.entries.find(e=>e.stUid===1);
  assert.notEqual(imported.id,'lore_sync_1');assert.equal(out.book.entries.find(e=>e.stUid===2).id,'signal');
  assert.equal(out.document.entries[1].content,'New remote');assert.equal(out.document.entries[2].content,'New local');
  assert.equal(sync.hasLocalChanges(out.document,out.book,filename),false);
});

test('disk display ordering, explicit library reordering and mid-list insertion keep a stable next baseline',()=>{
  const file={entries:{4:{uid:4,comment:'Old A',content:'A',displayIndex:8},9:{uid:9,comment:'Old B',content:'B',displayIndex:1}}};
  const first=review(null,library(file),file);assert.deepEqual(keys(first),[]);
  const saved=solve(first);assert.deepEqual(saved.book.entries.map(e=>e.stUid),[9,4]);
  assert.equal(sync.hasLocalChanges(file,saved.book,filename),false);
  saved.book.entries.reverse();
  const changed=solve(review(file,saved.book,file));
  assert.deepEqual(changed.book.entries.map(e=>e.stUid),[4,9]);
  assert.ok(changed.document.entries[4].displayIndex<changed.document.entries[9].displayIndex);
  assert.equal(sync.hasLocalChanges(changed.document,changed.book,filename),false);
  const disk=structuredClone(changed.document);disk.entries[4].displayIndex=12;
  const pulled=solve(review(changed.document,changed.book,disk));
  assert.deepEqual(pulled.book.entries.map(e=>e.stUid),[9,4]);
  const sparse={entries:{0:{content:'First'},1:{content:'Last'}}},local=library(sparse);
  local.entries.splice(1,0,{id:'new',content:'Middle'});
  const inserted=solve(review(sparse,local,sparse));assert.deepEqual(inserted.book.entries.map(e=>e.content),['First','Middle','Last']);
  assert.equal(sync.hasLocalChanges(inserted.document,inserted.book,filename),false);
});

test('reconciles the embedded mirror after field choices and retains unrelated metadata in both copies',()=>{
  const base=raw();base.originalData={name:'Harbor',version:42,entries:[
    {id:0,comment:'Dock',content:'High tide.',keys:['pier'],vendor:{colors:[1,2]},extensions:{unusual:'original'}},
  ]};
  const work=library(base);work.entries[0].content='Local account';
  const disk=structuredClone(base);disk.entries[0].content='Disk account';disk.entries[0].key=['quay'];
  disk.originalData.entries[0].content='Disk account';disk.originalData.entries[0].keys=['quay'];
  disk.originalData.entries[0].vendor.colors=[1,2,3];
  const plan=review(base,work,disk);assert.equal(plan.rows.filter(x=>x.kind==='conflict').length,1);
  const out=solve(plan,choices(plan,'local'));
  assert.equal(out.document.entries[0].content,'Local account');assert.equal(out.document.originalData.entries[0].content,'Local account');
  assert.deepEqual(out.document.originalData.entries[0].keys,['quay']);assert.deepEqual(out.document.originalData.entries[0].vendor.colors,[1,2,3]);
  assert.deepEqual(out.document.originalData.entries[0].extensions,{unusual:'original'});assert.equal(out.document.originalData.version,42);
  assert.equal(sync.hasLocalChanges(out.document,out.book,filename),false);
});

test('a plan is detached from ensuing edits and works after JSON serialization',()=>{
  const base=raw(), work=library(base), disk=structuredClone(base);
  work.entries[0].content='Selected local';disk.entries[0].comment='Selected disk';const plan=review(base,work,disk);
  disk.entries[0].comment='Changed later';work.entries[0].content='Changed later';base.entries[0].key.push('later');
  const a=solve(plan),b=solve(plain(plan));assert.deepEqual(a,b);
  assert.equal(a.document.entries[0].content,'Selected local');assert.equal(a.document.entries[0].comment,'Selected disk');assert.deepEqual(a.document.entries[0].key,['pier']);
});

test('ambiguous native identities, conflicting local IDs and malformed inputs fail before a plan is produced',()=>{
  for(const bad of [null,[],{data:raw()},{entries:[]},{entries:{0:null}},{entries:{0:{content:true,key:1,comment:{wrong:true}}}}]){
    assert.throws(()=>sync.validate(bad),error('sync.format'));
  }
  for(const [key,value] of [['0',{uid:1}],['01',{uid:1}],['0',{uid:-1}],['9007199254740992',{uid:9007199254740992}]]){
    assert.throws(()=>sync.validate({entries:{[key]:{content:'Fixture',...value}}}),error('sync.uid'));
  }
  const unsafe=JSON.parse('{"entries":{"0":{"content":"Fixture","extensions":{"constructor":1}}}}');
  assert.throws(()=>sync.validate(unsafe),error('sync.unsafe'));
  const work=library(),disk=raw();
  work.entries.push({...work.entries[0],id:'another'});assert.throws(()=>review(null,work,disk),error('sync.uid'));
  work.entries[1].stUid=1;work.entries[1].id='0';assert.throws(()=>review(null,work,disk),error('sync.uid'));
});

test('ordinary ST default expansion does not conflict with an independent local field edit or a local deletion',()=>{
  const base=raw(),disk=structuredClone(base),work=library(base);work.entries[0].enabled=false;
  Object.assign(disk.entries[0],{disable:false,constant:false,selective:false,probability:100,keysecondary:[],depth:4,addMemo:true});
  disk.entries[0].key=['ferry'];
  const plan=review(base,work,disk);assert.deepEqual(keys(plan),[[0,'disable','local'],[0,'key','disk']]);
  const out=solve(plan);
  assert.deepEqual(out.document.entries[0],{...disk.entries[0],disable:true});assert.equal(sync.hasLocalChanges(out.document,out.book,filename),false);
  work.entries=[];disk.entries[0].key=base.entries[0].key;
  const removed=review(base,work,disk);assert.deepEqual(keys(removed),[[0,'entry','local']]);
  assert.deepEqual(solve(removed).document.entries,{});
});

test('opaque metadata named like a generic import envelope or an inherited property survives native sync',()=>{
  const base=raw();base.data={entries:{other:'independent metadata'}};
  base.entries[0].vendor={};
  const work=library(raw());work.stBookFields={data:structuredClone(base.data)};work.entries[0].stSettings={vendor:{field:'local'}};
  const disk=structuredClone(base);disk.entries[0].vendor.toString='native vendor data';disk.data.entries.other='updated';
  const out=solve(review(base,work,disk));
  assert.deepEqual(out.document.data,disk.data);assert.deepEqual(out.book.stBookFields.data,disk.data);
  assert.deepEqual(out.document.entries[0].vendor,{field:'local',toString:'native vendor data'});
  assert.equal(out.book.entries[0].content,'High tide.');assert.equal(sync.hasLocalChanges(out.document,out.book,filename),false);
});

test('existing native aliases track local edits without erasing their neighbors',()=>{
  const base={entries:{0:{uid:0,comment:'Shift',body:'Previous',enabled:true,extensions:{position:4,plugin:'kept'}}}};
  const work=library(base);Object.assign(work.entries[0],{content:'Changed',enabled:false,position:'after_char'});
  const result=solve(review(base,work,base));
  assert.equal(result.document.entries[0].body,'Changed');assert.equal(result.document.entries[0].content,'Changed');
  assert.equal(result.document.entries[0].disable,true);assert.equal(result.document.entries[0].enabled,false);
  assert.deepEqual(result.document.entries[0].extensions,{position:1,plugin:'kept'});assert.equal(result.book.entries[0].position,'after_char');
  assert.equal(sync.hasLocalChanges(result.document,result.book,filename),false);
});

test('independent vendor changes in embedded copies compare by UID and field rather than replacing an array',()=>{
  const base=raw();base.originalData={name:'Harbor',entries:[
    {id:0,comment:'Dock',content:'High tide.',keys:['pier'],secondary_keys:[],insertion_order:100,vendor:{tone:'cool',scale:1}},
  ]};
  const local=library(base);local.entries[0].stEmbedded.vendor.tone='warm';
  const disk=structuredClone(base);disk.originalData.entries[0].vendor.scale=2;
  disk.entries[0].content='Later tide';disk.originalData.entries[0].content='Later tide';
  const plan=review(base,local,disk);
  assert.deepEqual(keys(plan).sort(),[[0,'content','disk'],[0,'originalData.vendor.tone','local'],[0,'originalData.vendor.scale','disk']].sort());
  const result=solve(plan);
  assert.deepEqual(result.document.originalData.entries[0].vendor,{tone:'warm',scale:2});
  assert.deepEqual(result.book.entries[0].stEmbedded.vendor,{tone:'warm',scale:2});
  assert.equal(result.document.originalData.entries[0].content,'Later tide');assert.equal(sync.hasLocalChanges(result.document,result.book,filename),false);
});

test('keeping a locally revised entry after a disk deletion also restores its original companion metadata',()=>{
  const base=raw();base.originalData={entries:[{id:0,content:'High tide.',keys:['pier'],secondary_keys:[],vendor:{stamp:'amber'}}]};
  const local=library(base);local.entries[0].content='Local restoration';
  const disk=structuredClone(base);delete disk.entries[0];disk.originalData.entries=[];
  const plan=review(base,local,disk),out=solve(plan,choices(plan,'local'));
  assert.deepEqual(out.document.originalData.entries[0].vendor,{stamp:'amber'});
  assert.equal(out.document.originalData.entries[0].content,'Local restoration');
  assert.equal(out.book.entries[0].id,0);assert.equal(sync.hasLocalChanges(out.document,out.book,filename),false);
});
