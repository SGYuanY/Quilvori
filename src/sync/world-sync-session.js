/* Device-local link and two-phase write-back for standalone ST world books. */
(function(root) {
  'use strict';
  const ui=()=>root.TAUI;
  const core=()=>root.TAWorldSync;
  const db=()=>root.TALibraryDB;
  const native=()=>root.nijanDesktop;
  const fault=(code,detail='')=>Object.assign(new Error(code),{code,detail});
  const live=id=>root.TAStore.byId(ui().state.lib.worldBooks,id);
  const binding=id=>db().worldBinding(id);
  const limit=32*1024*1024;
  const active=new Map();

  function withBook(id,task) {
    if(root.navigator?.locks?.request)return navigator.locks.request('quilvori-world-sync-'+JSON.stringify(id),task);
    const job=(active.get(id) || Promise.resolve()).catch(()=>{}).then(task);
    active.set(id,job);
    return job.finally(()=>{if(active.get(id)===job)active.delete(id);});
  }

  function agreed(before) {
    const current=live(before.id);
    if(!current || !core().same(current,before))throw fault('sync.staleWork');
    return current;
  }
  function keepReferences(before,next) {
    const state=ui().state;
    const refs=[...(state.lib.quickReplySets || []).map(set=>set.workSource),state.replyReference];
    for(const reference of refs){
      if(reference?.bookId==null || String(reference.bookId)!==String(before.id))continue;
      for(const id of reference.entryIds || []){
        const old=root.TAStore.byId(before.entries,id);
        if(old && !root.TAStore.byId(next.entries,id))throw fault('sync.referenced',old.comment || String(id));
      }
    }
  }
  // Include the local-only entry IDs and links in the restart guard. IndexedDB readers
  // may return object fields in a different order from the original editor.
  async function workHash(book) {
    const normalized=root.TAStore.verify({worldBooks:[book]}).worldBooks[0];
    const sorted=(_key,value)=>value && typeof value==='object' && !Array.isArray(value)
      ? Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])) : value;
    const bytes=new TextEncoder().encode(JSON.stringify(normalized,sorted));
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  }
  async function save(before,old,value,updated,reason,fileChanges=[]) {
    const current=agreed(before), lib=ui().state.lib;
    const record=value ? {...value,stamp:root.TAStore.uid('link')} : null;
    const worldSync={id:current.id,expected:old?.stamp ?? null,next:record};
    if(updated && (!core().same(current,updated) || fileChanges.length)){
      keepReferences(current,updated);
      const next={...lib,worldBooks:lib.worldBooks.map(item=>item.id===current.id ? updated : item)};
      await root.TAHistory.commitWorks(next,[['worldBooks',before]],{reason,historyRequired:true,
        recordChanges:true,fileChanges,scopes:[['worldBooks',current.id]],worldSync});
    }else{
      await ui().commitLibrary(lib,[],false,null,{scopes:[['meta']],worldSync});
    }
    return record;
  }
  async function choose(record) {
    if(native()?.worldSyncPick){
      return record?.target ? native().worldSyncRead(record.target) : native().worldSyncPick();
    }
    const file=await ui().pickFile('.json,application/json');
    if(!file)return null;
    if(record && record.name!==file.name)throw fault('sync.filename',record.name);
    if(file.size>limit)throw fault('world-sync-too-large');
    let document;
    try {document=JSON.parse((await file.text()).replace(/^\uFEFF/,''));}
    catch {throw fault('world-sync-invalid');}
    core().validate(document);
    return {name:file.name,document};
  }
  function context(record,file) {
    return {mode:file.target?'desktop':'web',name:file.name,target:file.target ?? null,
      base:record?.base ?? null,hash:record?.hash ?? null,checkedAt:record?.checkedAt ?? null,
      lastWrite:record?.lastWrite ?? null,needsVerify:record?.needsVerify ?? false};
  }
  function confirmed(record,file) {
    return {...context(record,file),base:file.document,hash:file.hash ?? null,checkedAt:Date.now(),needsVerify:false};
  }
  async function flush() {
    if(!await ui().flush())throw fault('sync.staleWork');
  }
  async function inspect(id) {
    await flush();
    const before=structuredClone(live(id));
    if(!before)throw fault('sync.staleWork');
    const record=await binding(id);
    const file=await choose(record);
    if(!file)return null;
    core().validate(file.document);
    if(record?.pending){
      const result=await recover(before,record,file);
      if(result.finished)return {recovered:result.message};
      return preview(before,result.record,file,result.message);
    }
    return preview(before,record,file,'');
  }
  function preview(before,record,file,message) {
    agreed(before);
    return {before,record,file,message,plan:core().review(record?.base ?? null,before,file.document,file.name)};
  }
  async function apply(view,choices) {
    const {before,record,file,plan}=view;
    agreed(before);
    const result=core().resolve(plan,choices);
    root.TAStore.verify({worldBooks:[result.book]});
    keepReferences(before,result.book);
    const changedFile=!core().same(result.document,file.document);
    if(!db().database()){
      if(file.target)throw fault('sync.storage');
      ui().downloadJson(file.name,result.document);
      return 'sync.downloadOnly';
    }
    if(!file.target){
      const next={...confirmed(record,file),needsVerify:changedFile};
      await save(before,record,next,result.book,'同步世界书前');
      if(changedFile)ui().downloadJson(file.name,result.document);
      return changedFile?'sync.exported':'sync.matched';
    }
    if(!changedFile){
      const latest=await native().worldSyncRead(file.target);
      if(latest.hash!==file.hash)throw fault('world-sync-changed');
      await save(before,record,confirmed(record,latest),result.book,'同步世界书前');
      return 'sync.matched';
    }
    const fileChanges=plan.rows.filter(row=>(choices[row.key] || row.kind)==='local').map(row=>({
      side:'file',path:row.uid==null?row.field:(row.label || '#'+row.uid)+' / '+row.field,
      ...(row.diskPresent?{before:row.disk}:{}),...(row.localPresent?{after:row.local}:{}),
    }));
    const pending={operationId:crypto.randomUUID(),kind:'write',expectedWork:await workHash(before),book:result.book,fileChanges};
    const staged=await save(before,record,{...context(record,file),pending});
    const readback=await native().worldSyncWrite(file.target,file.hash,result.document,pending.operationId);
    if(!core().same(readback.document,result.document))throw fault('world-sync-recovery');
    const outcome=await recover(before,staged,readback);
    if(!outcome.finished)throw fault('sync.recheck');
    return outcome.message;
  }
  // A crash can occur between replacing the file and committing the local manuscript.
  // Only complete the reviewed edit if both the durable native receipt and the local
  // manuscript still match. Otherwise compare again from the last common version.
  async function recover(before,record,file) {
    const job=record.pending, receipt=file.receipt;
    const applied=receipt?.operationId===job.operationId && receipt.kind===job.kind && receipt.hash===file.hash;
    const next=context(record,file);
    if(applied && job.kind==='restore'){
      next.lastWrite=null;
      await save(before,record,next);
      return {finished:true,message:'sync.restored'};
    }
    let compatible=applied && await workHash(before)===job.expectedWork;
    if(compatible){
      try {keepReferences(before,job.book);}
      catch(error){if(error.code!=='sync.referenced')throw error;compatible=false;}
    }
    if(compatible){
      const nextConfirmed={...confirmed(record,file),lastWrite:job.operationId};
      await save(before,record,nextConfirmed,job.book,'同步世界书前',job.fileChanges);
      return {finished:true,message:'sync.written'};
    }
    if(applied)next.lastWrite=job.operationId;
    const cleared=await save(before,record,next);
    return {finished:false,record:cleared,message:'sync.recheck'};
  }
  function canRestore(record,file) {
    return !!(record?.lastWrite && !record.pending && file?.canRestore &&
      file.receipt?.operationId===record.lastWrite && file.receipt.hash===file.hash);
  }
  async function restore(before,record,file) {
    if(!canRestore(record,file))throw fault('world-sync-no-backup');
    const pending={kind:'restore',operationId:crypto.randomUUID()};
    const staged=await save(before,record,{...record,pending});
    const readback=await native().worldSyncRestore(record.target,file.hash,pending.operationId);
    const result=await recover(before,staged,readback);
    if(!result.finished)throw fault('sync.recheck');
    return result.message;
  }
  async function unlink(id,record) {
    const before=live(id);if(!before || !record)throw fault('sync.staleWork');
    await save(before,record,null);
  }
  // Hold the per-work lock only for reading/recovery or applying confirmed choices.
  // An editor reopened during a write must not clear a live job as an interrupted one.
  root.TAWorldSyncSession={
    binding,canRestore,
    inspect:id=>withBook(id,()=>inspect(id)),
    apply:(view,choices)=>withBook(view.before.id,()=>apply(view,choices)),
    restore:(before,record,file)=>withBook(before.id,()=>restore(before,record,file)),
    unlink:(id,record)=>withBook(id,()=>unlink(id,record)),
  };
})(globalThis);
