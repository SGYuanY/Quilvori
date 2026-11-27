/* Competing Chromium renderers use the same real credential database and separate localStorage caches. */
'use strict';
const {app,BrowserWindow,session}=require('electron');
const path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const profile=process.env.QUILVORI_TEST_PROFILE;
if(!profile || path.dirname(profile)!==os.tmpdir() || !path.basename(profile).startsWith('quilvori-ui-'))throw Error('Isolated UI profile required');
app.setPath('userData',profile);
app.on('window-all-closed',()=>{});
const page=path.join(__dirname,'..','backup.html');
const damaged='{"key":"synthetic-damaged-source","profiles":[';
async function exercise(withLocks) {
  const storage=session.fromPartition('persist:credential-concurrency-'+withLocks),windows=[];
  storage.webRequest.onBeforeRequest((request,done)=>done({cancel:/^https?:/.test(request.url)}));
  async function client(){
    const win=new BrowserWindow({show:false,webPreferences:{session:storage,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
    windows.push(win);await win.loadFile(page);
    const run=(fn,...args)=>win.webContents.executeJavaScript('('+fn.toString()+')(...'+JSON.stringify(args)+')',true);
    await run(()=>NIJANModel.ready);
    const hasLocks=await run(use=>{
      if(!use)Object.defineProperty(navigator,'locks',{configurable:true,value:undefined});
      return !!navigator.locks;
    },withLocks);assert.equal(hasLocks,withLocks);
    return run;
  }
  // Stop one legitimate save after the user has typed but before it can publish to disk.
  const pauseSave=run=>run(async()=>{
    const seal=TAModelKeyCodec.seal,gate=new Promise(ok=>{window.releaseFixtureSave=ok;});
    let entered;
    const blocked=new Promise(ok=>{entered=ok;});
    TAModelKeyCodec.seal=async(...args)=>{entered();await gate;return seal(...args);};
    NIJANModel.save({model:'stale settings',key:'synthetic-stale-key'});
    window.fixtureSaved=NIJANModel.flushCredentials().then(()=>true,()=>false);
    await blocked;
  });
  try{
    const older=await client();
    await older(async()=>{NIJANModel.save({model:'before',key:'synthetic-before'});await NIJANModel.flushCredentials();});
    await pauseSave(older);
    const seed=await client();await seed(raw=>localStorage.setItem('nijan-model',raw),damaged);
    const contenders=[await client(),await client()];
    const tokens=await Promise.all(contenders.map(run=>run(()=>NIJANModel.credentialStatus().recoveryToken)));
    assert.ok(tokens.every(t=>t!=null));
    const recover=(run,token)=>run(async t=>{try{await NIJANModel.rebuildCredentials(t);return true;}catch(_){return false;}},token);
    const outcomes=await Promise.all(contenders.map((run,i)=>recover(run,tokens[i])));
    assert.equal(outcomes.filter(Boolean).length,1,'exactly one renderer may confirm the same damaged source');
    const winner=contenders[outcomes.indexOf(true)],loser=outcomes.indexOf(false);
    const staleRebuilt=await client();await pauseSave(staleRebuilt);
    await winner(async()=>{NIJANModel.save({model:'chosen connection',key:'synthetic-winning-key'});await NIJANModel.flushCredentials();});
    assert.equal(await recover(contenders[loser],tokens[loser]),false);
    for(const held of [older,staleRebuilt]){
      assert.equal(await held(async()=>{window.releaseFixtureSave();return window.fixtureSaved;}),false,'an in-flight stale write must fail');
    }
    const fresh=await client();
    const checks=await fresh(raw=>{
      const config=NIJANModel.load(),values=Object.values(localStorage);
      return [localStorage.getItem('nijan-model')===raw,config.model==='chosen connection',config.key==='synthetic-winning-key',
        !values.some(v=>v.includes('synthetic-winning-key')),values.filter(v=>v.includes('synthetic-damaged-source')).length===1];
    },damaged);
    assert.deepEqual(checks,[true,true,true,true,true]);
    // A repaired browser keystore should be usable again. Opening an existing envelope may
    // never generate a different AES key in place of one temporarily missing from IndexedDB.
    assert.ok(await fresh(async()=>{
      const sealed=await TAModelKeyCodec.seal('probe','synthetic-probe');
      const db=await new Promise((ok,fail)=>{const req=indexedDB.open('quilvori-credentials',1);req.onsuccess=()=>ok(req.result);req.onerror=()=>fail(req.error);});
      try{
        const key=()=>new Promise((ok,fail)=>{const req=db.transaction('keys').objectStore('keys').get('model');req.onsuccess=()=>ok(req.result);req.onerror=()=>fail(req.error);});
        const change=fn=>new Promise((ok,fail)=>{const tx=db.transaction('keys','readwrite');fn(tx.objectStore('keys'));tx.oncomplete=ok;tx.onabort=()=>fail(tx.error);});
        const original=await key();await change(s=>s.delete('model'));
        let refused=false;try{await TAModelKeyCodec.open('probe',sealed);}catch(_){refused=true;}
        const missing=(await key())===undefined;await change(s=>s.add(original,'model'));
        return refused && missing && await TAModelKeyCodec.open('probe',sealed)==='synthetic-probe';
      }finally{db.close();}
    }));
    await fresh(()=>new Promise((ok,fail)=>{const req=indexedDB.deleteDatabase('quilvori-credentials');req.onsuccess=ok;req.onerror=()=>fail(req.error);}));
    const missing=await client();
    assert.ok(await missing(()=>NIJANModel.credentialStatus().locked && !NIJANModel.credentialStatus().recoverable));
    assert.equal(await missing(()=>localStorage.getItem('nijan-model')),damaged);
    console.log('Confirmed recovery once, blocked stale writes, preserved key and database loss with Web Locks '+(withLocks?'enabled':'disabled')+'.');
  } finally{for(const win of windows)if(!win.isDestroyed())win.destroy();}
}
async function interruptedMigration(interruptRollback){
  const s=session.fromPartition('persist:credential-write-failure-'+interruptRollback);
  s.webRequest.onBeforeRequest((request,done)=>done({cancel:/^https?:/.test(request.url)}));
  const windows=[];
  async function client(){
    const win=new BrowserWindow({show:false,webPreferences:{session:s,contextIsolation:true,nodeIntegration:false}});
    windows.push(win);await win.loadFile(page);
    const run=(f,...args)=>win.webContents.executeJavaScript('('+f.toString()+')(...'+JSON.stringify(args)+')',true);
    await run(()=>NIJANModel.ready);return run;
  }
  const original=' { "model": "migration fixture", "key": "synthetic-held-key" } ';
  try{
    const first=await client();
    const failed=await first(async(raw,interrupt)=>{
      localStorage.setItem('nijan-model',raw);
      const put=IDBObjectStore.prototype.put,set=Storage.prototype.setItem;
      let wrote=false,rollbackAttempted=false;
      IDBObjectStore.prototype.put=function(data,key){
        if(this.name==='keys' && key==='connections.head'){
          IDBObjectStore.prototype.put=put;
          const attempted=localStorage.getItem('nijan-model');
          wrote=attempted!==raw && !attempted.includes('synthetic-held-key');
          throw new DOMException('Synthetic post-write abort','QuotaExceededError');
        }
        return put.call(this,data,key);
      };
      Storage.prototype.setItem=function(key,value){
        if(key==='nijan-model' && value===raw){rollbackAttempted=true;if(interrupt)throw Error('Synthetic interrupted rollback');}
        return set.call(this,key,value);
      };
      try{
        window.dispatchEvent(new StorageEvent('storage',{key:'nijan-model'}));await NIJANModel.ready;
        const db=await new Promise((ok,fail)=>{const req=indexedDB.open('quilvori-credentials',1);req.onsuccess=()=>ok(req.result);req.onerror=()=>fail(req.error);});
        let journal;
        try{
          const req=db.transaction('keys').objectStore('keys').get('connections.pending');
          journal=await new Promise((ok,fail)=>{req.onsuccess=()=>ok(req.result);req.onerror=()=>fail(req.error);});
        }finally{db.close();}
        const protectedIntent=interrupt?journal?.length===1 && !JSON.stringify(journal).includes('synthetic-held-key'):journal===undefined;
        return [wrote,rollbackAttempted,NIJANModel.credentialStatus().locked,localStorage.getItem('nijan-model')===raw,protectedIntent];
      }finally{IDBObjectStore.prototype.put=put;Storage.prototype.setItem=set;}
    },original,interruptRollback);
    assert.deepEqual(failed,[true,true,true,!interruptRollback,true]);
    if(!interruptRollback){await first(()=>NIJANModel.retryCredentials());assert.equal(await first(()=>NIJANModel.load().key==='synthetic-held-key'),true);}
    windows[0].destroy();
    const again=await client(),reopened=await again(async()=>{
      const db=await new Promise((ok,fail)=>{const req=indexedDB.open('quilvori-credentials',1);req.onsuccess=()=>ok(req.result);req.onerror=()=>fail(req.error);});
      try{
        const req=db.transaction('keys').objectStore('keys').get('connections.pending');
        const noIntent=await new Promise((ok,fail)=>{req.onsuccess=()=>ok(req.result===undefined);req.onerror=()=>fail(req.error);});
        return [!NIJANModel.credentialStatus().locked,NIJANModel.load().key==='synthetic-held-key',noIntent,!localStorage.getItem('nijan-model').includes('synthetic-held-key')];
      }finally{db.close();}
    });
    assert.deepEqual(reopened,[true,true,true,true]);
    console.log('Reopened a verified primary registry after a post-localStorage abort with rollback '+(interruptRollback?'interrupted':'completed')+'.');
  }finally{for(const win of windows)if(!win.isDestroyed())win.destroy();}
}
app.whenReady().then(async()=>{await exercise(true);await exercise(false);await interruptedMigration(false);await interruptedMigration(true);})
  .then(()=>app.exit(0),err=>{console.error(err.stack||err);app.exit(1);});
