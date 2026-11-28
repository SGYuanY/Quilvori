'use strict';
const assert=require('node:assert/strict');
const suite=require('./desktop-fixture.cjs');

suite('world-sync',async({open,run,click,wait,file,download,win})=>{
  const name='Harbor.json';
  const base={name:'Harbor',entries:{0:{uid:0,comment:'Quay',content:'Original',key:['quay'],extensions:{otherTool:{rank:3}}}}};
  const on='[data-sync-open]',confirm='[data-act="sync-apply"]';
  const seed=async()=>{
    await open('index');
    await run(async doc=>{
      TAI18n.save({lang:'en'});
      const book=TAFolderImport.makeBook(doc,'Harbor');book.id=0;book.entries[0].id=0;
      const lib=TAStore.emptyLibrary();lib.worldBooks.push(book);
      await TAUI.commitLibrary(TAStore.verify(lib),[],true);TAUI.go('lore');
    },base);
  };
  const modal=()=>wait(()=>!!document.querySelector('[data-sync-review]'),'file comparison');
  const done=()=>wait(()=>!document.querySelector('[data-sync-review]') && !document.querySelector('[data-sync-open]').disabled,'sync completion');
  const edit=async text=>run(value=>{
    const field=document.querySelector('#lore-editor [data-field=content]');field.value=value;field.dispatchEvent(new Event('input',{bubbles:true}));
  },text);
  const record=()=>run(()=>TALibraryDB.worldBinding(0));
  await seed();
  await file(base,name);await click(on);await modal();
  assert.equal(await run(()=>document.querySelectorAll('[data-sync-kind]').length),0);
  await click(confirm);await done();assert.deepEqual((await record()).base,base);
  await edit('Edited in Quilvori');
  const other=structuredClone(base);other.entries[0].key=['tide'];other.entries[0].extensions.otherTool.rank=8;
  await file(other,name);await click(on);await modal();
  assert.ok(await run(()=>!document.querySelector('[data-sync-kind=conflict]') && !!document.querySelector('[data-sync-kind=local]') && !!document.querySelector('[data-sync-kind=disk]')));
  const downloaded=await download(confirm), merged=JSON.parse(downloaded.bytes);
  await done();assert.equal(downloaded.filename,name);
  assert.equal(merged.entries[0].content,'Edited in Quilvori');assert.deepEqual(merged.entries[0].key,['tide']);
  assert.deepEqual(merged.entries[0].extensions,{otherTool:{rank:8}});
  assert.equal((await record()).needsVerify,true);
  assert.deepEqual((await record()).base,base,'a download retains the last verified common edition');
  assert.match((await record()).downloadHash,/^[a-f0-9]{64}$/);
  await edit(other.entries[0].content);
  const unverified=structuredClone(other);unverified.entries[0].content='Another disk revision';
  await file(unverified,name);await click(on);await modal();
  assert.ok(await run(()=>!!document.querySelector('[data-sync-kind=conflict]') && document.querySelector('[data-act="sync-apply"]').disabled),
    'a new local edit matching the previously selected input must not be silently replaced');
  await click('[data-act=no]');await done();
  assert.equal(await run(()=>TAUI.state.lib.worldBooks[0].entries[0].content),other.entries[0].content);
  await edit('A newer local revision');await file(merged,name);await click(on);await modal();
  assert.ok(await run(()=>!!document.querySelector('[data-sync-kind=local]') && !document.querySelector('[data-sync-kind=conflict]')),
    'reselecting the actual download verifies its contents and retains intervening local edits');
  await click('[data-act=no]');await done();
  await edit('Edited in Quilvori');
  await file(merged,name);await click(on);await modal();await click(confirm);await done();
  assert.equal((await record()).needsVerify,false);assert.equal((await record()).downloadHash,undefined);
  assert.equal(await run(()=>TAUI.state.lib.worldBooks[0].entries[0].id),0);
  await run(async()=>{const set={id:'reply',name:'Source',replies:[],workSource:{bookId:0,entryIds:[0]}};
    const lib=TAUI.state.lib;await TAUI.commitLibrary({...lib,quickReplySets:[set]});});
  await file({name:'Harbor',entries:{}},name);await click(on);await modal();await click(confirm);await done();
  assert.equal(await run(()=>TAUI.state.lib.worldBooks[0].entries.length),1,'a merge cannot orphan the reply');
  assert.match(await run(()=>document.querySelector('[data-sync-status]').textContent),/quick reply/i);
  await file(merged,'Different.json');await click(on);await done();
  assert.match(await run(()=>document.querySelector('[data-sync-status]').textContent),/linked filename/i);
  await edit('Local conflict');const conflict=structuredClone(merged);conflict.entries[0].content='File conflict';
  await file(conflict,name);await click(on);await modal();
  assert.ok(await run(()=>document.querySelector('[data-act="sync-apply"]').disabled));
  await click('[data-sync-all=disk]');await click(confirm);await done();
  assert.equal(await run(()=>TAUI.state.lib.worldBooks[0].entries[0].content),'File conflict');
  const history=await run(async()=>{const rows=await TAHistory.list('worldBooks',0);return rows[0].operationChanges;});
  assert.ok(history.some(row=>row.before==='Local conflict' && row.after==='File conflict'));
  await edit('A later change');await run(()=>TAUI.flush());
  await click('.revision-panel > summary');
  await wait(()=>!!document.querySelector('[data-operation]:not([hidden])'),'recorded operation manifest');
  await click('[data-operation] > summary');
  await wait(()=>document.querySelector('[data-operation]').textContent.includes('File conflict'),'recorded historical field');
  assert.ok(!(await run(()=>document.querySelector('[data-operation]').textContent)).includes('A later change'));

  await seed();
  // The native transport is exercised in the packaged-download smoke. Here a durable
  // fake file lets the UI lose its receipt exactly between writing and saving locally.
  async function bridge(first=false){
    await run((doc,first)=>{
      const key='fixture-private-world';if(first)localStorage.setItem(key,JSON.stringify({target:'qa-token',name:'Harbor.json',hash:'v1',document:doc,receipt:null,canRestore:false}));
      window.getDisk=()=>JSON.parse(localStorage.getItem(key));window.putDisk=value=>localStorage.setItem(key,JSON.stringify(value));
      window.nijanDesktop={worldSyncPick:async()=>getDisk(),worldSyncRead:async()=>getDisk(),
        worldSyncWrite:async(_target,hash,document,operationId)=>{
          const prev=getDisk();if(prev.hash!==hash)throw {code:'world-sync-changed'};
          const updated={...prev,document,hash:hash+'w',backup:prev.document,canRestore:true,receipt:{kind:'write',operationId,hash:hash+'w'}};
          putDisk(updated);if(window.interruptSave)throw Error('Injected interrupted save');return updated;
        },
        worldSyncRestore:async(_target,hash,operationId)=>{
          const prev=getDisk();if(prev.hash!==hash)throw {code:'world-sync-changed'};
          const restored={...prev,document:prev.backup,hash:hash+'r',canRestore:false,receipt:{kind:'restore',operationId,hash:hash+'r'}};
          putDisk(restored);return restored;
        }};
      TAUI.go('lore');
    },base,first);
  }
  await bridge(true);await click(on);await modal();await click(confirm);await done();
  await edit('Local manuscript');await run(()=>{const d=getDisk();d.document.entries[0].key=['incoming'];d.hash='v2';putDisk(d);});
  await click(on);await modal();
  await run(()=>{const d=getDisk();d.document.entries[0].key=['last minute'];d.hash='v3';putDisk(d);});
  await click(confirm);await done();
  assert.equal(await run(()=>getDisk().document.entries[0].content),'Original');
  await click(on);await modal();await run(()=>{window.interruptSave=true;});await click(confirm);await done();
  assert.ok((await record()).pending);
  assert.equal(await run(()=>getDisk().document.entries[0].content),'Local manuscript');
  await open('index');await bridge();
  await wait(()=>document.querySelector('[data-sync-open]').textContent.includes('Verify'),'interrupted state after reload');
  await click(on);await done();assert.equal((await record()).pending,undefined);
  assert.deepEqual(await run(()=>TAUI.state.lib.worldBooks[0].entries[0].keys),['last minute']);
  await wait(()=>!document.querySelector('[data-sync-undo]').hidden,'recoverable original file');
  const privateBackup=await run(async()=>JSON.stringify(await TALibraryDB.workingState(true)));
  assert.ok(!privateBackup.includes('qa-token') && !privateBackup.includes('"operationId"'));
  const changes=await run(async()=>(await TAHistory.list('worldBooks',0))[0].operationChanges);
  assert.ok(changes.some(c=>c.side==='file' && c.after==='Local manuscript'));
  await click('[data-sync-undo]');await click('[data-act="undo-file"]');await done();
  assert.equal(await run(()=>getDisk().document.entries[0].content),'Original');
  assert.equal(await run(()=>TAUI.state.lib.worldBooks[0].entries[0].content),'Local manuscript');
  await edit('Second local edit');
  await run(()=>{const d=getDisk();d.document.entries[0].content='Another choice';d.hash='v4';putDisk(d);});
  await click(on);await modal();await click('[data-sync-all=local]');
  await run(()=>{window.interruptSave=true;});await click(confirm);await done();
  assert.ok((await record()).pending);
  await edit('Written after the interruption');await run(()=>TAUI.flush());
  await open('index');await bridge();await click(on);await modal();
  assert.ok(!(await record()).pending);
  assert.equal(await run(()=>TAUI.state.lib.worldBooks[0].entries[0].content),'Written after the interruption');
  assert.equal(await run(()=>getDisk().document.entries[0].content),'Second local edit');
  await click('[data-act=no]');await done();
  await click(on);await modal();
  for(const [width,lang] of [[1152,'en'],[1024,'zh'],[850,'ja'],[700,'ko'],[500,'th'],[390,'ru']]){
    win.setContentSize(width,760);
    const fits=await run(async lang=>{
      TAI18n.save({lang});TAI18n.apply();await new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok)));
      const pane=document.querySelector('[data-sync-review]');
      return pane.clientWidth>0 && pane.scrollWidth<=pane.clientWidth+1 && document.documentElement.scrollWidth<=innerWidth+1;
    },lang);
    assert.ok(fits,width+'px '+lang);
    await click('[data-act=no]');await done();await run(()=>TAUI.renderStage());await click(on);await modal();
  }
  await click('[data-act=no]');await done();
  await click('[data-sync-unlink]');await click('[data-act=unlink]');await done();assert.equal(await record(),null);
  await run(async()=>{
    const lib=TAUI.state.lib, opts={scopes:[['meta']],worldSync:{id:0,expected:null,next:{stamp:'test-only',target:'qa-token'}}};
    await TAUI.commitLibrary(lib,[],false,null,opts);
    await TAUI.commitLibrary({...lib,worldBooks:[]});
    await TAUI.commitLibrary(lib);
  });
  assert.equal(await record(),null,'deleting a manuscript revokes its library association even if its numeric ID is reused');
  await seed();await bridge(true);await click(on);await modal();await click(confirm);await done();
  await edit('A slow write');
  await run(()=>{
    const original=nijanDesktop.worldSyncWrite;
    nijanDesktop.worldSyncWrite=async(...args)=>{
      await new Promise(ok=>{window.continueSyncWrite=ok;});
      return original(...args);
    };
  });
  await click(on);await modal();await click(confirm);
  await wait(()=>!!window.continueSyncWrite,'the active write has a durable local journal');
  await run(()=>{window.concurrentCheck=TAWorldSyncSession.inspect(0);});
  await run(()=>new Promise(ok=>setTimeout(ok,80)));
  assert.ok((await record()).pending,'reopening the work while its write is active retains the pending operation');
  await run(()=>window.continueSyncWrite());await done();
  assert.equal(await run(async()=>(await window.concurrentCheck).plan.rows.length),0);
  console.log('World sync browser downloads, real history, numeric IDs, conflict decisions, references, stale file, interrupted write recovery, device-only bindings, file restore and six responsive layouts passed.');
});
