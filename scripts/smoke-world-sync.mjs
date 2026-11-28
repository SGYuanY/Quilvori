import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import nativeFiles from '../electron/world-sync.js';

export async function worldSyncFixture({scratch,profile,web,tavern}) {
  const name='Quilvori acceptance tides', filename=name+'.json';
  const worlds=tavern?tavern.worlds:path.join(scratch,'worlds');
  await mkdir(worlds,{recursive:true});await mkdir(profile,{recursive:true});
  const file=path.join(worlds,filename);
  const put=tavern?d=>tavern.write(name,d):d=>writeFile(file,JSON.stringify(d,null,4));
  const get=tavern?()=>tavern.read(name):async()=>JSON.parse(await readFile(file,'utf8'));
  const base={name,entries:{0:{uid:0,comment:'Tide gauge',content:'The tide is rising.',key:['tide'],
    extensions:{fictionalPublisher:{edition:2}}}}};
  await put(base);
  assert.deepEqual(await get(),base);
  // Represents the one OS picker selection in the private package test profile.
  // Subsequent reads, replacement and restore go through the shipped IPC and ASAR.
  const grant=web?null:await nativeFiles.createWorldSync(profile).bind(file);
  const other=structuredClone(base);other.entries[0].key=['spring tide'];
  const combined=structuredClone(other);combined.entries[0].content='The tide is falling.';
  let original;
  async function compare({read,click,waitFor},from) {
    if(web)await read((doc,filename)=>{
      const picker=TAUI.pickFile;
      TAUI.pickFile=async()=>{TAUI.pickFile=picker;return new File([JSON.stringify(doc)],filename,{type:'application/json'});};
    },from,filename);
    await click('[data-sync-open]');await waitFor('[data-sync-review]');
  }
  async function exercise(ctx) {
    const {read,click,until}=ctx;
    await read(async(doc,grant)=>{
      const book=TAFolderImport.makeBook(doc,doc.name);book.id='smoke-sync';book.entries[0].id=0;
      const lib=TAUI.state.lib;
      await TAUI.commitLibrary({...lib,worldBooks:[...lib.worldBooks,book]});
      if(grant)await TAUI.commitLibrary(TAUI.state.lib,[],false,null,{scopes:[['meta']],worldSync:{
        id:book.id,expected:null,next:{stamp:'picked',name:grant.name,target:grant.target,base:null},
      }});
      TAUI.state.sel.book=book.id;TAUI.go('lore');
    },base,grant && {name:grant.name,target:grant.target});
    await compare(ctx,base);
    assert.equal(await read(()=>document.querySelectorAll('[data-sync-kind]').length),0);
    await click('[data-act=sync-apply]');
    await until(()=>read(async()=>!!(await TALibraryDB.worldBinding('smoke-sync'))?.base),'first confirmed common version');
    await read(text=>{
      const field=document.querySelector('#lore-editor [data-field=content]');
      field.value=text;field.dispatchEvent(new Event('input',{bubbles:true}));
    },combined.entries[0].content);
    await put(other);original=await readFile(file);
    await compare(ctx,other);
    assert.deepEqual(await read(()=>[...document.querySelectorAll('[data-sync-kind]')].map(e=>e.dataset.syncKind).sort()),['disk','local']);
    if(web)await read(()=>{
      document.addEventListener('tavern-export',async event=>{window.syncDownload=JSON.parse(await event.detail.blob.text());},{once:true});
    });
    await click('[data-act=sync-apply]');
    await until(()=>read(()=>TAUI.state.lib.worldBooks.find(b=>b.id==='smoke-sync').entries[0].keys[0]==='spring tide'),'incoming field in local manuscript');
    if(web){
      const outgoing=await until(()=>read(()=>window.syncDownload),'browser merged download');
      assert.deepEqual(outgoing,combined);await put(outgoing);
      assert.equal(await read(async()=>(await TALibraryDB.worldBinding('smoke-sync')).needsVerify),true);
      await compare(ctx,await get());await click('[data-act=sync-apply]');
      await until(()=>read(async()=>(await TALibraryDB.worldBinding('smoke-sync')).needsVerify===false),'verified installed browser file');
    }
    assert.deepEqual(await get(),combined);
    await read(()=>TAUI.go('home'));
  }
  async function reopen(ctx) {
    const {read,click,until}=ctx;
    await read(()=>{TAUI.state.sel.book='smoke-sync';TAUI.go('lore');});
    const rec=await read(()=>TALibraryDB.worldBinding('smoke-sync'));
    assert.deepEqual(rec.base,combined);assert.equal(rec.pending,undefined);
    assert.equal(await read(()=>TAUI.state.lib.worldBooks.find(b=>b.id==='smoke-sync').entries[0].id),0);
    if(!web) {
      await until(()=>read(()=>document.querySelector('[data-sync-undo]')?.hidden===false),'verified desktop file backup');
      await click('[data-sync-undo]');await click('[data-act=undo-file]');
      await until(()=>read(async()=>{const r=await TALibraryDB.worldBinding('smoke-sync');return !r.pending && !r.lastWrite;}),'file restore receipt');
      assert.deepEqual(await readFile(file),original);assert.deepEqual(await get(),other);
    }
    await read(()=>TAUI.go('home'));
  }
  return {exercise,reopen,combined,other};
}
