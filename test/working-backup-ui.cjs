/* Real JSON download and restore between two independent IndexedDB profiles, without a model service. */
const {app,BrowserWindow,session}=require('electron');
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const home=process.env.QUILVORI_TEST_PROFILE;
if(!home || path.dirname(home)!==os.tmpdir() || !path.basename(home).startsWith('quilvori-ui-'))throw Error('An isolated test profile is required');
app.setPath('userData',home);
const root=path.resolve(__dirname,'..'),sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
async function client(name){
  const isolated=session.fromPartition('persist:portable-backup-'+name);
  isolated.webRequest.onBeforeRequest((req,done)=>done({cancel:/^https?:/.test(req.url)}));
  const win=new BrowserWindow({show:false,webPreferences:{session:isolated,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  const run=(fn,...args)=>win.webContents.executeJavaScript('('+fn.toString()+')(...'+JSON.stringify(args)+')',true);
  async function wait(fn,label){
    for(let i=0;i<150;i++){if(await run(fn))return;await sleep(40);}
    throw Error(label+' timed out: '+await run(()=>[...document.querySelectorAll('.toast-message,[role=status]')].map(el=>el.textContent).join(' | ').slice(-400)));
  }
  async function open(page='backup.html'){await win.loadFile(path.join(root,page));await wait(()=>!!TAUI?.state.lib && !!document.querySelector('#stage > *'),'library startup');}
  const click=selector=>run(q=>{const el=document.querySelector(q);if(!el||el.disabled)throw Error('Control unavailable: '+q);el.click();},selector);
  async function review(data,reopen=true){
    if(reopen)await open();
    await run(text=>{TAUI.pickFile=async()=>new File([text],'fixture.json',{type:'application/json'});},JSON.stringify(data));
    await click('#load-backup');
    await wait(()=>!!document.querySelector('#modal-root [data-act=replace]'),'working-state restore choices');
  }
  async function restore(data,mode='replace'){
    await review(data);await click('#modal-root [data-act='+mode+']');
    await wait(()=>!document.querySelector('#app').inert && !document.querySelector('#modal-root [data-act=replace]') &&
      [...document.querySelectorAll('.toast-message')].some(el=>/restored|merged|replaced|还原|合并|替换/i.test(el.textContent)),'confirmed restore');
  }
  const dump=()=>run(async()=>{const x=await TALibraryDB.workingState(true);return TAFormats.backupOf(x.library,x.state);});
  await open();return {win,isolated,run,wait,open,click,review,restore,dump};
}
async function seed(c,tag){
  return c.run(async tag=>{
    const lib=TAStore.emptyLibrary();lib.meta.name=tag+' collection';
    lib.characters=[{id:'card',name:'Archive keeper',description:tag+' first'}];
    lib.worldBooks=[{id:'orphan-'+tag,name:'Forgotten '+tag,entries:[{id:'leaf',content:'First page',comment:'First'}]}];
    lib.settings.folderImports={'c:/private/test-user/library/secret.json':{kind:'cards',id:'card',hash:'123'}};
    lib.backupAlternatives=[{id:'private-copy',address:['settings'],value:{theme:'light',folderImports:lib.settings.folderImports}}];
    await TAUI.commitLibrary(lib,[],true);
    localStorage.setItem('nijan-folders',JSON.stringify({cards:'C:/private/test-user/cards'}));
    localStorage.setItem('fixture-model-config',JSON.stringify({key:'fixture-private-credential'}));
    const card=TAUI.state.lib.characters[0],book=TAUI.state.lib.worldBooks[0];
    await TAHistory.save('characters',card,'Revision '+tag);await TAHistory.save('worldBooks',book,'Removed '+tag);
    await TAHistory.clean(TAHistory.cleanupPlan(await TAHistory.inventory('characters',card.id),tag==='source'?2:4));
    await TAHistory.clean(TAHistory.cleanupPlan(await TAHistory.inventory('worldBooks',book.id),3));
    const next=structuredClone(TAUI.state.lib);next.characters[0].description=tag+' current';next.worldBooks=[];
    await TAUI.commitLibrary(next);
    const result={character:{name:tag+' pending',description:tag+' draft body'}};
    const p=NIJANAI.proposal(next,'create:character',result,{brief:'Write '+tag});
    p.batchId='shared-batch';p.id='shared-plan';p.operations[0].key='shared-operation';p.operations[0].value.id='pending-work';
    p.creationInput={brief:'Write '+tag,modules:['character'],questions:['Which season?'],answers:[{question:'Which season?',answer:'Autumn'}],ideas:[]};
    p.result=result;
    await TAStudioDrafts.keep(p);
    const record={id:'shared-record',task:'create:world',label:'Response '+tag,startedAt:'2026-03-02T10:00:00.000Z',finishedAt:'2026-03-02T10:01:00.000Z',
      model:'Fixture model',status:'validated',workBatch:'shared-batch',workKinds:['world'],workBrief:'Make an atlas',epoch:TACreationRecords.epoch(),
      output:JSON.stringify({world:{name:tag+' archived atlas',entries:[{comment:'Quay',content:'Fishing boats arrive at dawn.',keys:['quay']}]}}),
      headers:{Authorization:'fixture-private-credential'},endpoint:'C:/private/test-user/endpoint'};
    await TACreationRecords.save(record);
    return await TALibraryDB.workingState();
  },tag);
}
async function checkedCopies(c,file){
  await seed(c,'local');await c.open('studio.html');await c.click('[data-mode=create]');
  await c.run(()=>TAUI.go('backup'));await c.review(file,false);
  await c.run(()=>{
    const field=[...document.querySelectorAll('[data-merge-choice]')].find(node=>JSON.parse(node.dataset.mergeChoice)[1].at(-1)==='description');
    field.value='copy';field.dispatchEvent(new Event('change'));
  });
  await c.click('[data-act=merge]');
  await c.wait(()=>TAUI.state.lib.characters.some(card=>card.backupCopyOf==='card'),'separate copy from an actual field conflict');
  await c.run(()=>TAUI.go('studio'));
  await c.wait(()=>!!document.querySelector('[data-plan="shared-plan~backup"]'),'merged draft visible directly in the open studio');
  await c.click('[data-plan="shared-plan"] [data-apply]');
  await c.wait(()=>TAUI.state.lib.characters.some(v=>v.name==='local pending'),'preexisting draft still adoptable without reloading the studio');
  await c.open();
  const {library,workState}=await c.dump(),copy=library.characters.find(card=>card.backupCopyOf==='card');
  assert.equal(copy.description,'source current');
  for(const [id,tag,keep] of [['card','local',4],[copy.id,'source',2]]){
    const rows=workState.versions.filter(v=>v.kind==='characters'&&v.id===id);
    assert.deepEqual(rows.map(v=>[v.value.id,v.value.description]),[[id,tag+' first']]);
    assert.equal(workState.limits.find(l=>l.id===id).keep,keep);
    await c.run(async id=>{
      const version=(await TAHistory.list('characters',id))[0];
      await TAHistory.restore(version,TAUI.state.lib.characters.find(v=>v.id===id));
    },id);
  }
  assert.deepEqual((await c.dump()).library.characters.filter(v=>v.id==='card'||v.id===copy.id).map(v=>v.description),['local first','source first']);
}
async function atomicFailure(c,file){
  await c.review(file);
  const original=await c.dump();
  await c.run(()=>{
    const add=IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add=function(...args){
      if(this.name==='creationRecords'){
        IDBObjectStore.prototype.add=add;
        throw Error('Synthetic response archive write failure');
      }
      return add.apply(this,args);
    };
  });
  await c.click('[data-act=replace]');
  await c.wait(()=>[...document.querySelectorAll('.toast-message')].some(n=>n.textContent.includes('Synthetic response archive write failure')),'failed write surfaced');
  await c.open();const reopened=await c.dump();
  assert.deepEqual(reopened.library,original.library);
  assert.deepEqual(reopened.workState,original.workState);
}
async function recoveryScreen(c,file){
  await c.win.loadFile(path.join(root,'backup.html'));
  await c.wait(()=>!!document.querySelector('.recovery [data-file]'),'damaged library screen');
  await c.run(data=>{
    window.confirm=()=>true;
    const click=HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click=function(){
      if(this.type!=='file')return click.call(this);
      HTMLInputElement.prototype.click=click;
      const dt=new DataTransfer();dt.items.add(new File([data],'complete.json',{type:'application/json'}));
      this.files=dt.files;this.dispatchEvent(new Event('change'));
    };
    document.querySelector('.recovery [data-file]').click();
  },JSON.stringify(file));
  await c.wait(()=>globalThis.TAUI?.state?.lib?.characters[0]?.description==='source current' && !!document.querySelector('#load-backup'),'full recovery from a damaged library');
  assert.deepEqual((await c.dump()).workState,file.workState);
}
async function damagedRecovery(c,file){
  async function damage(library){
    await c.run(async alsoLibrary=>new Promise((ok,fail)=>{
      const tx=TALibraryDB.database().transaction(['library','drafts','libraryRecords'],'readwrite');
      tx.objectStore('drafts').put({id:'malformed-draft',time:0,plan:{}});
      if(alsoLibrary)tx.objectStore('libraryRecords').put({key:'layout',value:'unreadable'});
      TALibraryDB.touchWork(tx);tx.oncomplete=ok;tx.onabort=()=>fail(tx.error);
    }),library);
  }
  await damage(false);await c.review(file);
  assert.equal(await c.run(()=>!!document.querySelector('[data-act=merge]')),false);
  await c.click('[data-act=no]');await c.click('#save-backup');
  await c.wait(()=>!!document.querySelector('[data-act=works]'),'library-only rescue export is offered explicitly');
  await c.click('[data-act=cancel]');
  await c.review(file);await c.click('[data-act=replace]');
  await c.wait(()=>TAUI.state.lib.characters[0]?.description==='source current' && !document.querySelector('#app').inert,'replacement despite invalid local drafts');
  assert.deepEqual((await c.dump()).workState,file.workState);
  await damage(true);await recoveryScreen(c,file);
  const old=await client('legacy-recovery');
  await old.run(async()=>{
    await TAUI.flush();TALibraryDB.database().close();
    await new Promise((ok,fail)=>{const remove=indexedDB.deleteDatabase('quilvori-library');remove.onsuccess=ok;remove.onerror=()=>fail(remove.error);});
    localStorage.removeItem(TAStore.databaseMarker);localStorage.removeItem(TAStore.KEY+'.previous');
    localStorage.setItem(TAStore.KEY,'damaged legacy bytes');
  });
  await recoveryScreen(old,file);
  assert.equal(await old.run(()=>TAStore.migrationBackup()),'damaged legacy bytes');
  old.win.destroy();
}
async function combinedArchives(c){
  async function archive(tag,offset){
    return c.run(async(tag,offset)=>{
      const records=[];
      for(let i=0;i<24;i++){
        const output=JSON.stringify({world:{name:tag+' atlas '+i,entries:[{comment:'Court',content:'The fair opens at noon.',keys:['court']}]}});
        records.push({id:i===0?'shared':tag+i,task:'create:world',label:tag+' '+i,startedAt:new Date(Date.UTC(2025,0,1+offset+i)).toISOString(),
          model:'Fixture',status:'validated',workBatch:i===0?'shared-batch':tag+i,workKinds:['world'],sourceKey:await TACreationRecords.sourceKey(output),output});
      }
      return {atelier:'tavern-atelier',libraryVersion:1,backupVersion:2,library:{characters:[]},workState:{drafts:[],versions:[],limits:[],records}};
    },tag,offset);
  }
  const first=await archive('east',0),second=await archive('west',24);
  await c.restore(first);await c.restore(second,'merge');await c.open('studio.html');
  await c.run(()=>{document.querySelector('[data-mode=create]').click();document.querySelector('.ai-task-log').open=true;});
  for(const [id,tag] of [['shared','east'],['shared~backup','west']]){
    await c.run(id=>{const picker=document.querySelector('#ai-task-select');picker.value=id;picker.dispatchEvent(new Event('change'));},id);
    await c.click('[data-recover-record="'+id+'"]');
    await c.wait(()=>TAStudioDrafts.pending().length===(document.querySelector('#ai-task-select').value==='shared'?1:2),'distinct drafts from responses sharing a batch');
    assert.ok((await c.dump()).workState.drafts.some(d=>d.plan.operations[0].value.name===tag+' atlas 0'));
  }
  await c.restore(second,'merge');await c.open();
  assert.equal((await c.dump()).workState.records.length,48);
  await c.run(async()=>{await TACreationRecords.save({id:'next',task:'create:world',label:'Newest',output:'new output',startedAt:'2026-01-01T00:00:00.000Z',epoch:TACreationRecords.epoch()});});
  await c.open();const kept=(await c.dump()).workState.records;
  assert.equal(kept.length,48);assert.ok(kept.some(r=>r.id==='next'));assert.ok(!kept.some(r=>r.id==='shared'));
}
async function main(){
  const src=await client('source'),dest=await client('target');
  await seed(src,'source');
  const savedFile=path.join(home,'portable-state.json');
  const writing=new Promise((ok,fail)=>src.isolated.once('will-download',(_event,item)=>{
    item.setSavePath(savedFile);item.once('done',(_e,status)=>status==='completed'?ok():fail(Error(status)));
  }));
  await src.open();await src.click('#save-backup');await writing;
  const raw=await fs.readFile(savedFile,'utf8'),file=JSON.parse(raw);
  assert.equal(file.backupVersion,2);assert.equal(file.workState.drafts.length,1);
  assert.equal(file.workState.versions.length,2);assert.equal(file.workState.records.length,1);
  assert.equal(file.workState.limits.find(rule=>rule.id==='orphan-source').keep,3);
  assert.ok(!raw.includes('private/test-user')&&!raw.includes('fixture-private-credential')&&!raw.includes('Authorization'));
  await dest.run(()=>TAUI.commitLibrary(TAStore.emptyLibrary(),[],true));
  await dest.restore(file);
  await dest.open();
  let round=await dest.dump();assert.deepEqual(round.workState,file.workState);
  assert.equal(round.library.characters[0].description,'source current');
  await dest.run(()=>TAUI.go('home'));
  await dest.click('[data-open-draft="shared-plan"]');await dest.wait(()=>!!document.querySelector('[data-plan="shared-plan"] [data-apply]'),'opened imported draft');
  await dest.click('[data-plan="shared-plan"] [data-apply]');
  await dest.wait(()=>TAUI.state.lib.characters.some(c=>c.id==='pending-work'&&c.description==='source draft body'),'applied imported draft');
  await dest.open('characters.html');
  await dest.run(()=>{TAUI.state.sel.character='card';TAUI.state.cardView='edit';TAUI.renderStage();document.querySelector('.revision-panel').open=true;});
  await dest.wait(()=>!!document.querySelector('[data-restore]:not(:disabled)'),'imported revision comparison');
  await dest.click('[data-restore]');await dest.click('#modal-root [data-act=yes]');
  await dest.wait(()=>TAUI.state.lib.characters.find(c=>c.id==='card').description==='source first','rollback from imported history');
  await dest.open('studio.html');
  await dest.run(()=>{document.querySelector('[data-mode=create]').click();document.querySelector('.ai-task-log').open=true;});
  await dest.wait(()=>!!document.querySelector('[data-recover-record="shared-record"]'),'opened imported model output');
  assert.ok(await dest.run(()=>document.querySelector('[data-task-output]').textContent.includes('source archived atlas')));
  await dest.click('[data-recover-record="shared-record"]');
  await dest.wait(()=>TAStudioDrafts.pending().some(d=>d.plan.operations[0].value.name==='source archived atlas'),'recovered output to a new draft');
  console.log('A downloaded complete backup restores usable drafts, rollback, deleted-work history, policies and model-response recovery.');

  await seed(dest,'local');
  await dest.restore(file,'merge');await dest.open();
  const merged=await dest.dump();const names=merged.workState.drafts.map(d=>d.plan.operations[0].value.name).sort();
  assert.deepEqual(names,['local pending','source pending']);
  assert.equal(new Set(merged.workState.drafts.map(d=>d.plan.id)).size,2);
  assert.equal(new Set(merged.workState.drafts.map(d=>d.plan.operations[0].value.id)).size,2);
  assert.equal(merged.workState.versions.length,4);assert.equal(merged.workState.limits.find(l=>l.id==='card').keep,4);
  assert.equal(merged.workState.records.length,2);assert.equal(new Set(merged.workState.records.map(row=>row.id)).size,2);
  for(const tag of ['local','source']){
    const draft=merged.workState.drafts.find(d=>d.plan.operations[0].value.name===tag+' pending');
    assert.equal(merged.workState.records.find(row=>row.label==='Response '+tag).workBatch,draft.plan.batchId);
  }
  assert.equal(merged.library.characters.find(c=>c.id==='card').description,'local current');
  await dest.restore(file,'merge');await dest.open();
  assert.deepEqual((await dest.dump()).workState,merged.workState,'Repeated merge must keep exactly the already imported associations');
  const before=await dest.dump();
  const legacy={atelier:'tavern-atelier',libraryVersion:1,library:{characters:[{id:'legacy',name:'Older backup'}]}};
  await dest.restore(legacy);await dest.open();
  assert.deepEqual((await dest.dump()).workState,before.workState,'Old library-only backups preserve existing working state');
  await dest.review(file);
  await dest.run(async()=>{await TAHistory.save('characters',TAUI.state.lib.characters[0],'Saved after preview');});
  await dest.click('#modal-root [data-act=replace]');
  await dest.wait(()=>[...document.querySelectorAll('.toast-message')].some(e=>/changed|变化/i.test(e.textContent)),'stale work-state preview error');
  assert.equal((await dest.dump()).library.characters[0].id,'legacy');
  const latest=await dest.dump();const invalid=structuredClone(file);invalid.workState.drafts[0].plan.operations[0].path=['settings'];
  await dest.run(async text=>{TAUI.pickFile=async()=>new File([text],'damaged.json');document.querySelector('#load-backup').click();},JSON.stringify(invalid));
  await dest.wait(()=>[...document.querySelectorAll('.toast-message')].some(e=>/invalid|无效/i.test(e.textContent)),'invalid auxiliary backup rejected');
  assert.deepEqual((await dest.dump()).workState,latest.workState);
  console.log('Conflict copies, repeat merge, legacy restore, stale previews and malformed archive rejection passed.');
  await checkedCopies(dest,file);await atomicFailure(dest,file);await damagedRecovery(dest,file);
  console.log('Separate work copies retain their own history and limits. Failed writes roll back all stores. Corrupt drafts and library data can be replaced.');
  await combinedArchives(dest);
  console.log('Two archives of 24 responses survive merging, duplicate batch IDs remain recoverable, and the next save rotates only the oldest response.');
  await dest.restore({atelier:'tavern-atelier',libraryVersion:1,backupVersion:2,library:{characters:[]},workState:{drafts:[],versions:[],limits:[],records:[]}});
  await dest.open();round=await dest.dump();
  assert.deepEqual(Object.values(round.workState).map(rows=>rows.length),[0,0,0,0]);
  assert.equal(round.library.characters.length,0);
  src.win.destroy();dest.win.destroy();
}
app.whenReady().then(main).then(()=>app.exit(0),error=>{console.error(error);app.exit(1);});
