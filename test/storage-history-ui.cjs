/* Exercise the migration, normal editor, recovery and per-work history in a temporary Chromium profile. */
const {app,BrowserWindow,session}=require('electron');
const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const profile=process.env.QUILVORI_TEST_PROFILE;
if (!profile || path.dirname(profile)!==os.tmpdir() || !path.basename(profile).startsWith('quilvori-ui-')) throw Error('A temporary test profile is required');
app.setPath('userData',profile);
const page=path.join(__dirname,'..','characters.html');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function exercise() {
  const qa=session.fromPartition('persist:revision-storage-fixture');
  let seed=true;
  qa.webRequest.onBeforeRequest((req,done)=>done({cancel:(seed && /\/js\/views.js$/.test(new URL(req.url).pathname)) || /^https?:/.test(req.url)}));
  const win=new BrowserWindow({show:false,webPreferences:{session:qa,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  const run=(fn,...args)=>win.webContents.executeJavaScript('('+fn.toString()+')(...'+JSON.stringify(args)+')',true);
  async function wait(fn,label){
    for(let i=0;i<130;i++){if(await run(fn))return;await sleep(40);}
    throw Error('Timed out waiting for '+label);
  }
  const load=async()=>{
    await win.loadFile(page);
    await wait(()=>TAUI?.state.lib && document.querySelector('[data-act=view-edit]'),'migrated character collection');
    await run(()=>document.querySelector('[data-act=view-edit]').click());
  };
  await win.loadFile(page);
  await run(async()=>{
    const lib=TAStore.emptyLibrary();
    lib.characters.push({id:'editor',name:'Fixture Editor',description:'Pre-migration manuscript',alternate_greetings:[]});
    lib.worldBooks.push({id:'atlas',name:'Fixture Atlas',entries:[{id:'entry',comment:'Cove',content:'A cove'}]});
    const previous=structuredClone(lib);previous.characters[0].description='Older manuscript';
    const req=indexedDB.open('quilvori-library',4);
    req.onupgradeneeded=()=>{
      const db=req.result;
      const library=db.createObjectStore('library');
      library.put({seq:8,data:lib},'current');
      library.put({seq:7,data:previous},'previous');
      library.put({raw:JSON.stringify(lib)},'migration');
      const versions=db.createObjectStore('versions',{keyPath:'seq',autoIncrement:true});
      versions.createIndex('entity','entity');
      for (const [kind,id] of [['characters','editor'],['worldBooks','atlas']]){
        versions.add({entity:JSON.stringify([kind,id]),kind,id,label:'V4 snapshot',time:1,reason:'手动快照',value:lib[kind][0]});
      }
      db.createObjectStore('drafts',{keyPath:'id'});
      db.createObjectStore('creationRecords',{keyPath:'id'}).createIndex('startedAt','startedAt');
    };
    await new Promise((ok,fail)=>{req.onsuccess=()=>{req.result.close();ok();};req.onerror=()=>fail(req.error);});
    localStorage.setItem(TAStore.databaseMarker,'1');
  });
  seed=false;await load();
  const old=await run(async()=>{
    const history=await TAHistory.inventory('characters','editor');
    return [TAUI.state.lib.characters[0].description,history.rows[0].label,history.bytes,history.limit,!!(await TAStore.migrationBackup())];
  });
  assert.equal(old[0],'Pre-migration manuscript');assert.equal(old[1],'V4 snapshot');
  assert.ok(old[2]>0);assert.equal(old[3],null);assert.equal(old[4],true);

  const metrics=await run(async()=>{
    const get=req=>new Promise((ok,fail)=>{req.onsuccess=()=>ok(req.result);req.onerror=()=>fail(req.error);});
    const done=tx=>new Promise((ok,fail)=>{tx.oncomplete=ok;tx.onabort=()=>fail(tx.error);});
    const legacyReq=indexedDB.open('quilvori-storage-baseline',1);
    legacyReq.onupgradeneeded=()=>legacyReq.result.createObjectStore('library');
    const control=await get(legacyReq);
    const median=items=>Number(items.slice().sort((a,b)=>a-b)[Math.floor(items.length/2)].toFixed(2));
    const results=[];
    for (const size of [64*1024,16*1024*1024]) {
      const data=structuredClone(TAUI.state.lib),half=size/2;
      data.assets=[{id:'image',name:'Cover',kind:'background',dataUrl:'data:image/png;base64,'+'A'.repeat(half)}];
      data.chats=[{id:'history',name:'Log',messages:[{name:'Author',mes:'z'.repeat(half)}],bookmarks:[]}];
      await TAUI.commitLibrary(data);TAUI.renderStage();
      const field=document.querySelector('textarea[data-field=description]');
      const init=control.transaction('library','readwrite');
      init.objectStore('library').put({seq:1,data},'current');await done(init);
      const timings={input:[],current:[],legacy:[]};
      let recordKeys,writeBytes;
      for (let i=0;i<5;i++) {
        let start=performance.now();
        field.value='Fixture change '+i;
        field.dispatchEvent(new Event('input',{bubbles:true}));
        timings.input.push(performance.now()-start);
        const proto=IDBObjectStore.prototype,oldPut=proto.put,oldGet=proto.get,oldAll=proto.getAll;
        recordKeys=[];writeBytes=0;
        try {
          proto.put=function(row,...args){
            if(this.name==='libraryRecords' || this.name==='library'){
              if(this.name==='libraryRecords')recordKeys.push(row.key);
              writeBytes+=new Blob([JSON.stringify(row)]).size;
            }
            return oldPut.call(this,row,...args);
          };
          proto.get=function(key){
            if(this.name==='libraryRecords' && !['["meta"]','["characters","editor"]'].includes(key))throw Error('Read unrelated record '+key);
            return oldGet.call(this,key);
          };
          proto.getAll=function(...args){if(this.name==='libraryRecords')throw Error('Scoped edit loaded the entire library');return oldAll.apply(this,args);};
          start=performance.now();
          if(!await TAUI.flush())throw Error('Scoped field save failed');
          timings.current.push(performance.now()-start);
        }finally{proto.put=oldPut;proto.get=oldGet;proto.getAll=oldAll;}
        start=performance.now();
        const full=TAStore.verify(structuredClone(data));
        full.meta.updatedAt=new Date().toISOString();
        const tx=control.transaction('library','readwrite'),table=tx.objectStore('library'),prior=table.get('current');
        prior.onsuccess=()=>{table.put(prior.result,'previous');table.put({seq:prior.result.seq+1,data:full},'current');};
        await done(tx);timings.legacy.push(performance.now()-start);
      }
      results.push({fixtureMiB:size/(1024*1024),medianInputMs:median(timings.input),medianIncrementalMs:median(timings.current),
        medianWholeLibraryMs:median(timings.legacy),recordKeys,writeBytes});
    }
    control.close();return results;
  });
  for (const row of metrics){
    assert.deepEqual(row.recordKeys.sort(),['["characters","editor"]','["meta"]']);assert.ok(row.writeBytes<4000);
    console.log('Single-field storage benchmark',JSON.stringify(row));
  }
  await load();
  const after=await run(()=>[TAUI.state.lib.characters[0].description,TAUI.state.lib.assets[0].dataUrl.length,TAUI.state.lib.chats[0].messages[0].mes.length]);
  assert.deepEqual(after,['Fixture change 4',8*1024*1024+'data:image/png;base64,'.length,8*1024*1024]);
  const scopedMedia=await run(async()=>{
    const lib=TAUI.state.lib,keys=[];lib.assets[0].name='Revised cover';lib.chats[0].bookmarks=[{id:'mark',index:0,note:'Here'}];
    const proto=IDBObjectStore.prototype,oldGet=proto.get,oldPut=proto.put;
    proto.get=function(key){if(this.name==='libraryRecords')keys.push(key);return oldGet.call(this,key);};
    proto.put=function(row,...args){if(this.name==='libraryRecords')keys.push(row.key);return oldPut.call(this,row,...args);};
    try{
      TAUI.markDirty('assets','image','metadata');TAUI.markDirty('chats','history','metadata');
      if(!await TAUI.flush())throw Error('Metadata save failed');
      return keys;
    }finally{proto.get=oldGet;proto.put=oldPut;}
  });
  assert.ok(scopedMedia.length);assert.ok(scopedMedia.every(key=>!key.includes('payload')));
  await load();assert.deepEqual(await run(()=>[TAUI.state.lib.chats[0].messages[0].mes.length,TAUI.state.lib.chats[0].bookmarks[0].note,TAUI.state.lib.assets[0].name]),[8*1024*1024,'Here','Revised cover']);

  await run(()=>document.querySelector('.revision-panel').open=true);
  await wait(()=>document.querySelector('[data-versions]')?.options.length===1,'v4 snapshot metadata');
  await run(async()=>{
    const card=TAUI.state.lib.characters[0];
    for (const label of ['One','Two','Three']) await TAHistory.save('characters',card,label);
    const panel=document.querySelector('.revision-panel');panel.open=false;
  });
  await sleep(60);await run(()=>document.querySelector('.revision-panel').open=true);
  await wait(()=>document.querySelector('[data-versions]')?.options.length===4,'snapshot inventory');
  await run(()=>{
    const input=document.querySelector('[data-limit]');input.value='2';input.dispatchEvent(new Event('input'));
    document.querySelector('[data-preview-policy]').click();
  });
  assert.equal(await run(()=>document.querySelectorAll('[data-clean-list] li').length),2);
  assert.equal(await run(async()=>(await TAHistory.list('characters','editor')).length),4);
  await run(()=>document.querySelector('[data-confirm-clean]').click());
  await wait(()=>document.querySelector('[data-versions]')?.options.length===2,'confirmed cleanup');
  const saved=await run(async()=>{
    const card=TAUI.state.lib.characters[0],head=await TAHistory.inventory('characters',card.id);
    const stale=TAHistory.cleanupPlan(head,null,true);
    const expired=await TAHistory.get(head.rows.at(-1).seq);
    // A pending edit from elsewhere must participate in the same incremental transaction.
    TAUI.state.lib.memoryHtml='Pending independent edit';TAUI.markDirty('memoryHtml');
    const context={instruction:'Edit',targets:[{target:'character',id:card.id,fields:['description'],value:structuredClone(card)}]};
    const plan=NIJANAI.proposal(TAUI.state.lib,'edit',{changes:[{target:'character',id:card.id,fields:{description:'Automatic edit'}}]},context);
    const oldAll=IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll=function(...args){if(this.name==='libraryRecords')throw Error('Scoped AI edit loaded the entire library');return oldAll.apply(this,args);};
    try {await TAHistory.apply(plan);} finally {IDBObjectStore.prototype.getAll=oldAll;}
    let rejected=false,restoreRejected=false;
    try{await TAHistory.clean(stale);}catch(_){rejected=true;}
    try{await TAHistory.restore(expired,TAUI.state.lib.characters[0]);}catch(_){restoreRejected=true;}
    return {rejected,restoreRejected,after:await TAHistory.inventory('characters',card.id),other:await TAHistory.inventory('worldBooks','atlas')};
  });
  assert.equal(saved.rejected,true);assert.equal(saved.restoreRejected,true);assert.equal(saved.after.limit,2);
  assert.equal(saved.after.rows[0].reason,'AI 改稿前');
  assert.deepEqual(saved.after.rows.map(row=>row.label),['','Three']);
  assert.equal(saved.other.rows[0].label,'V4 snapshot');
  await load();
  const kept=await run(async()=>{
    const info=await TAHistory.inventory('characters','editor');
    const snapshot=await TAHistory.get(info.rows[0].seq);
    return {limit:info.limit,previous:snapshot.value.description,current:TAUI.state.lib.characters[0].description,memory:TAUI.state.lib.memoryHtml};
  });
  assert.deepEqual(kept,{limit:2,previous:'Fixture change 4',current:'Automatic edit',memory:'Pending independent edit'});
  const corruption=await run(async()=>{
    const txt=document.querySelector('textarea[data-field=description]');txt.value='Newer';txt.dispatchEvent(new Event('input',{bubbles:true}));
    if(!await TAUI.flush())throw Error('Could not prepare recovery fixture');
    const tx=TALibraryDB.database().transaction('libraryRecords','readwrite');
    tx.objectStore('libraryRecords').put({key:'["characters","editor"]',value:{id:'editor',description:123}});
    return new Promise((ok,fail)=>{tx.oncomplete=()=>ok(true);tx.onabort=()=>fail(tx.error);});
  });
  assert.ok(corruption);
  await win.loadFile(page);await wait(()=>!!document.querySelector('[data-previous]'),'recovery from corrupt current record');
  await run(()=>{window.confirm=()=>true;document.querySelector('[data-previous]').click();});
  await wait(()=>!!TAUI.state.lib?.characters?.length,'recovered field');
  assert.equal(await run(()=>TAUI.state.lib.characters[0].description),'Automatic edit');
  await run(async()=>{
    const card=TAUI.state.lib.characters[0];card.description='Second change';TAUI.markDirty('characters',card.id);
    if(!await TAUI.flush())throw Error('Could not prepare the unrelated corruption fixture');
    const tx=TALibraryDB.database().transaction('libraryRecords','readwrite');
    tx.objectStore('libraryRecords').delete('["worldBooks","atlas"]');
    await new Promise((ok,fail)=>{tx.oncomplete=ok;tx.onabort=()=>fail(tx.error);});
  });
  await win.loadFile(page);await wait(()=>!!document.querySelector('[data-previous]'),'independent recovery checkpoint');
  await run(()=>{window.confirm=()=>true;document.querySelector('[data-previous]').click();});
  await wait(()=>!!TAUI.state.lib?.worldBooks?.length,'recovered independent record');
  assert.equal(await run(()=>TAUI.state.lib.characters[0].description),'Automatic edit');

  const growth=await run(async()=>{
    const data=structuredClone(TAUI.state.lib);
    const card={id:'snapshot-benchmark',name:'Edition measurements',description:''};
    data.characters.push(card);await TAUI.commitLibrary(data);
    const stats=()=>TAHistory.inventory('characters',card.id),samples=[];
    const originUsage=async()=>{try{return (await navigator.storage.estimate()).usage ?? null;}catch(_){return null;}};
    const before=await originUsage();
    for(let n=1;n<=5;n++){
      card.description+='x'.repeat(8*1024);TAUI.markDirty('characters',card.id);
      if(!await TAUI.flush())throw Error('Snapshot benchmark edit failed');
      await TAHistory.save('characters',card,'Edition '+n);
      const current=await stats();
      samples.push({count:current.rows.length,contentBytes:current.bytes});
    }
    const after=await originUsage();
    await TAHistory.clean(TAHistory.cleanupPlan(await stats(),2));
    const final=await stats();
    return {samples,kept:final.rows.length,keptContentBytes:final.bytes,
      originUsageDelta:before===null||after===null?null:after-before,currentLength:TAUI.state.lib.characters.at(-1).description.length};
  });
  assert.deepEqual(growth.samples.map(row=>row.count),[1,2,3,4,5]);
  assert.ok(growth.samples[4].contentBytes>=120*1024);
  assert.ok(growth.keptContentBytes>=72*1024 && growth.keptContentBytes<growth.samples[4].contentBytes);
  assert.equal(growth.kept,2);assert.equal(growth.currentLength,40*1024);
  console.log('Per-work snapshot growth, adding 8 KiB per edit',JSON.stringify(growth));
  await run(async()=>{
    const next=structuredClone(TAUI.state.lib);
    next.characters=next.characters.filter(item=>item.id!=='snapshot-benchmark');
    await TAUI.commitLibrary(next);TAUI.go('backup');
    document.querySelector('.revision-storage').open=true;
  });
  await wait(()=>document.querySelector('[data-history-work]')?.options.length===3,'storage summary including a removed work');
  await run(()=>{
    const box=document.querySelector('.revision-storage'),select=box.querySelector('[data-history-work]');
    select.value=JSON.stringify(['characters','snapshot-benchmark']);select.dispatchEvent(new Event('change'));
  });
  await wait(()=>document.querySelector('.revision-storage [data-manage]')?.hidden===false,'removed work storage controls');
  await run(()=>document.querySelector('.revision-storage [data-clear-history]').click());
  assert.equal(await run(()=>document.querySelectorAll('.revision-storage [data-clean-list] li').length),2);
  assert.equal(await run(async()=>(await TAHistory.inventory('characters','snapshot-benchmark')).rows.length),2);
  await run(()=>document.querySelector('.revision-storage [data-confirm-clean]').click());
  await wait(()=>document.querySelector('[data-history-work]')?.options.length===2,'removed work cleared after confirmation');
  assert.equal(await run(async()=>(await TAHistory.inventory('worldBooks','atlas')).rows.length),1);
  console.log('v4 migration, scoped writes, snapshot retention/preview, stale cleanup and record-level recovery passed.');
}
app.whenReady().then(exercise).then(()=>app.exit(0),error=>{console.error(error);app.exit(1);});
