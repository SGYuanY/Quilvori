'use strict';
const assert = require('node:assert/strict');
const suite = require('./desktop-fixture.cjs');

suite('selective-history', async ({open,run}) => {
  await open('backup');
  await run(async () => {
    const lib=TAStore.emptyLibrary();
    lib.characters=[{id:0,name:'Keeper',description:'Current manuscript'}];
    lib.worldBooks=[{id:'archive',name:'Other book',entries:[]}];
    await TAUI.commitLibrary(TAStore.verify(lib),[],true);
    const saved=TAUI.state.lib;
    await TAHistory.save('characters',saved.characters[0],'Original snapshot');
    await TAHistory.save('worldBooks',saved.worldBooks[0],'Unrelated history');
    await TAHistory.clean(TAHistory.cleanupPlan(await TAHistory.inventory('characters',0),1));
    const draft=NIJANAI.proposal(saved,'create:character',{character:{name:'Pending draft',description:'Still waiting'}},{brief:'Fixture'});
    draft.batchId='untouched-batch';draft.result={character:{name:'Pending draft',description:'Still waiting'}};
    await TAStudioDrafts.keep(draft);
    await TACreationRecords.save({id:'untouched-response',task:'create:character',startedAt:'2026-01-01T00:00:00Z',
      status:'validated',workKinds:['character'],workBatch:'untouched-batch',epoch:TACreationRecords.epoch(),
      output:'{"character":{"name":"Pending draft","description":"Still waiting"}}'});
  });
  const read = () => run(async () => {
    const {library,state}=await TALibraryDB.workingState(true);
    const history=await TAHistory.inventory('characters',0);
    return {card:library.characters[0],unrelated:library.worldBooks,others:state.versions.filter(v=>v.kind==='worldBooks'),
      history:history.rows.map(v=>v.label||v.reason),keep:history.limit,drafts:state.drafts,records:state.records,epoch:TACreationRecords.epoch()};
  });
  const before=await read();
  const snapshot={kind:'characters',id:0,time:100,reason:'Archived edit',label:'From the backup',
    value:{id:0,name:'Keeper',description:'Archived snapshot'}};
  await run(async row => {
    const current=TAUI.state.lib.characters[0], next=structuredClone(TAUI.state.lib);
    next.characters[0].description='Selected manuscript';
    await TAHistory.commitWorks(next,[['characters',current]],{reason:'Before restoring',historyRequired:true,importSnapshots:[row]});
  },snapshot);
  const restored=await read();
  assert.equal(restored.card.description,'Selected manuscript');
  assert.deepEqual(restored.history,['Before restoring','Original snapshot','From the backup']);
  assert.equal(restored.keep,3);
  for(const field of ['unrelated','others','drafts','records','epoch'])assert.deepEqual(restored[field],before[field]);
  await run(async row=>TAUI.commitLibrary(TAUI.state.lib,[],false,null,{importSnapshots:[row]}),snapshot);
  assert.deepEqual(await read(),restored,'the same historical snapshot is not imported twice');

  const aborted=await run(async row => {
    const candidate=structuredClone(TAUI.state.lib);
    candidate.characters[0].description='Uncommitted manuscript';
    const add=IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add=function(value,...args){
      if(this.name==='versions' && value.label==='Injected failure')throw new DOMException('Fixture write failed','AbortError');
      return add.call(this,value,...args);
    };
    try {
      await TAUI.commitLibrary(candidate,[],false,null,{importSnapshots:[{...row,label:'Injected failure'}]});
      return false;
    } catch(_) {return true;}
    finally {IDBObjectStore.prototype.add=add;}
  },snapshot);
  assert.ok(aborted);
  assert.deepEqual(await read(),restored,'an aborted snapshot write preserves both the work and its history');
  await open('backup');
  assert.deepEqual(await read(),restored);
  const dates=await run(async()=>{
    const info=await TAHistory.inventory('characters',0);
    const preview=TAHistory.cleanupPlan(info,2);
    const marked=await TAHistory.get(preview.remove[0]);
    const visible=(await TAHistory.list('characters',0)).map(row=>row.label||row.reason);
    await TAHistory.save('characters',TAUI.state.lib.characters[0],'Next local snapshot');
    return {marked:marked.label,visible};
  });
  assert.equal(dates.marked,'From the backup','the cleanup preview selects the oldest date');
  assert.deepEqual(dates.visible,restored.history);
  assert.deepEqual((await read()).history,['Next local snapshot','Before restoring','Original snapshot'],
    'the saved limit expires an older imported snapshot before newer local revisions');
  console.log('Selected snapshots commit with the manuscript, deduplicate, roll back on failure and follow their original dates in history and retention.');
});
