/* Device-local journal for a single explicitly selected character PNG or JSON. */
(function(root) {
  'use strict';
  const ui=()=>root.TAUI, db=()=>root.TALibraryDB, core=()=>root.TACardSync, images=()=>root.TACardPortraits;
  const byId=(rows,id)=>root.TAStore.byId(rows,id);
  const fault=code=>Object.assign(new Error(code),{code});
  const cardId=id=>byId(ui().state.lib.characters,id)?.id ?? id;
  const binding=id=>db().workBinding('characters',cardId(id));
  const same=(a,b)=>core().same(a,b);
  const cache=new WeakMap();
  const withCard=(id,task)=>root.TAFileSync.withWork('card',cardId(id),task);

  function current(id) {
    const lib=ui().state.lib,card=byId(lib.characters,id);
    if(!card)throw fault('sync.staleWork');
    return {card,book:byId(lib.worldBooks,card.embeddedBookId ?? card.source?.embeddedBookId),
      asset:byId(lib.assets,card.avatarAssetId)};
  }
  function agreed(snapshot) {
    if(!same(current(snapshot.card.id),snapshot))throw fault('sync.staleWork');
  }
  function assetHash(asset) {
    if(!asset?.dataUrl)return null;
    let item=cache.get(asset);
    if(item?.data!==asset.dataUrl){
      item={data:asset.dataUrl,hash:root.TAFileSync.digest(new TextEncoder().encode(asset.dataUrl))};
      cache.set(asset,item);
    }
    return item.hash;
  }
  async function workHash(snapshot) {
    const lib=root.TAStore.verify({characters:[snapshot.card],worldBooks:snapshot.book?[snapshot.book]:[]});
    return root.TAFileSync.jsonHash([lib.characters[0],lib.worldBooks[0] ?? null,await assetHash(snapshot.asset)]);
  }
  async function choose(record) {
    const native=root.nijanDesktop;
    if(native?.cardSyncPick)return record?.target ? native.cardSyncRead(record.target) : native.cardSyncPick();
    const file=await ui().pickFile('.png,.json,image/png,application/json');
    if(!file)return null;
    if(record && record.name!==file.name)throw fault('sync.filename');
    if(file.size>64*1024*1024)throw fault('card-sync-too-large');
    const bytes=new Uint8Array(await file.arrayBuffer());
    return {name:file.name,bytes,hash:await root.TAFileSync.digest(bytes)};
  }
  function link(record,file) {
    const clean={...record,name:file.name,target:file.target ?? null,mode:file.target?'desktop':'web'};
    delete clean.pending;
    return clean;
  }
  async function persist(snapshot,record,next,job,asset) {
    const lib=ui().state.lib,card=snapshot.card;
    const fileBinding={kind:'characters',id:card.id,expected:record?.stamp ?? null,
      next:next ? {...next,stamp:root.TAStore.uid('link')} : null};
    agreed(snapshot);
    if(!job) {
      await ui().commitLibrary(lib,[],false,null,{fileBinding,scopes:[['meta']]});
      return fileBinding.next;
    }
    const targets=[['characters',card]],scopes=[['characters',card.id]];
    let candidate={...lib,characters:lib.characters.map(item=>item.id===card.id ? job.card : item)};
    if(job.book){
      const existing=byId(lib.worldBooks,job.book.id);
      if(job.replaceBook){
        if(!existing || !same(existing,snapshot.book) || !exclusive(card.id,existing.id))throw fault('sync.staleWork');
        targets.push(['worldBooks',existing]);scopes.push(['worldBooks',existing.id]);
        candidate.worldBooks=lib.worldBooks.map(item=>item.id===existing.id?job.book:item);
      }else{
        if(existing)throw fault('sync.staleWork');
        candidate.worldBooks=[job.book,...lib.worldBooks];
      }
    }
    if(asset) {
      if(byId(lib.assets,asset.id))throw fault('sync.staleWork');
      candidate.assets=[...lib.assets,asset];
    }
    const changed=!same(card,job.card) || !!job.book || !!asset || !!job.fileChanges.length;
    if(changed)await root.TAHistory.commitWorks(candidate,targets,{reason:'同步角色卡前',historyRequired:true,
      recordChanges:true,fileChanges:job.fileChanges,fileChangesWork:['characters',card.id],fileBinding,
      scopes:asset || (job.book && !job.replaceBook) ? undefined : scopes});
    else await ui().commitLibrary(lib,[],false,null,{fileBinding,scopes:[['meta']]});
    return fileBinding.next;
  }
  function exclusive(cardId,bookId) {
    const state=ui().state,ref=state.replyReference;
    if(ref?.bookId!=null && String(ref.bookId)===String(bookId))return false;
    return !root.TALibraryActions.dependencies(state.lib,'worldBooks',bookId).some(ref=>
      ref.type!=='embedded' || String(ref.path[1].value)!==String(cardId));
  }
  function unique(collection,prefix) {
    let id;
    do {id=root.TAStore.uid(prefix);} while(byId(ui().state.lib[collection],id));
    return id;
  }
  function download(name,bytes) {
    ui().downloadBlob(name,new Blob([bytes],{type:/\.png$/i.test(name)?'image/png':'application/json'}));
  }
  async function inspect(id) {
    if(!await ui().flush())throw fault('sync.staleWork');
    const snapshot=structuredClone(current(id));
    let record=await binding(id);
    const file=await choose(record);
    if(!file)return null;
    const decoded=core().decode(file.bytes,file.name);
    let message='';
    if(record?.pending) {
      const result=await recover(snapshot,record,file,decoded);
      if(result.finished)return {recovered:result.message};
      record=result.record;message=result.message;
    }
    agreed(snapshot);
    return {before:snapshot.card,snapshot,record,file,decoded,message};
  }
  function editionFor(decoded,preferred) {
    return preferred && decoded.variants[preferred] ? preferred : null;
  }
  async function prepare(view,edition) {
    const {snapshot,record,file,decoded}=view;
    if(decoded.needsVariant && !edition)throw fault('card.variant');
    const variant=editionFor(decoded,edition || record?.variant);
    const raw=core().select(decoded,variant);
    const installed=record?.needsVerify && !!record.downloadHash && record.downloadHash===file.hash;
    const base=record?.needsVerify ? (installed ? raw : null) : record?.base;
    const baseArt=record?.needsVerify ? (installed ? record.downloadArt : null) : record?.baseArt;
    const baseLocalArt=record?.needsVerify ? (installed ? record.downloadLocalArt : null) : record?.baseLocalArt;
    const art=await images().inspect(snapshot,decoded,record,baseArt,baseLocalArt ?? baseArt);
    const plan=core().review(base,snapshot.card,snapshot.book,raw,file.name);
    agreed(snapshot);
    return {...view,variant,plan,art,rows:art?.row?[art.row,...plan.rows]:plan.rows,
      instruction:base?'sync.compareHelp':'card.firstHelp'};
  }
  async function makeJob(view,choices,result) {
    const {snapshot,art,record}=view;
    const row=art?.row, artSide=row ? (choices[row.key] || row.kind) : null;
    if(row && !row.allowedSides.includes(artSide))throw fault('card.unresolved');
    const replacement=artSide==='local' ? art.localBytes : null;
    const bytes=core().encode(view.decoded,result.document,replacement,view.variant);
    if(bytes.length>64*1024*1024)throw fault('card-sync-too-large');
    const decoded=core().decode(bytes,view.file.name);
    if(decoded.needsVariant)throw fault('card.variant');
    const job={kind:'write',operationId:crypto.randomUUID(),card:result.card,book:null,replaceBook:false,
      variant:view.variant,expectedWork:await workHash(snapshot),outputHash:await root.TAFileSync.digest(bytes),
      baseArt:replacement ? await core().portraitFingerprint(bytes) : art?.disk ?? null,
      baseLocalArt:artSide==='disk' ? art.disk : art?.local ?? null,ownedBookId:record?.ownedBookId ?? null,
      fileChanges:view.rows.filter(r=>(choices[r.key] || r.kind)==='local').map(r=>({
        side:'file',path:r.uid==null?r.field:(r.label || '#'+r.uid)+' / '+r.field,
        ...(r.diskPresent?{before:r.disk}:{}),...(r.localPresent?{after:r.local}:{})}))};
    if(view.decoded.needsVariant)job.fileChanges.push({side:'file',path:'PNG · chara / ccv3',after:view.variant});
    if(result.book && !same(snapshot.book,result.book)) {
      const existing=snapshot.book;
      job.replaceBook=!!existing && record?.ownedBookId===existing.id && exclusive(snapshot.card.id,existing.id) &&
        !await db().worldBinding(existing.id);
      const id=job.replaceBook?existing.id:unique('worldBooks','book');
      job.book={...result.book,id};job.card.embeddedBookId=id;job.ownedBookId=id;
    }else if(!result.book || job.ownedBookId!==snapshot.book?.id)job.ownedBookId=null;
    if(art && artSide==='disk'){
      job.assetId=unique('assets','asset');job.card.avatarAssetId=job.assetId;
      delete job.card.folderAvatarPending;
      if(job.card.folderPortraitHash)job.card.folderPortraitHash=art.disk;
    }
    if(!same(job.card,snapshot.card) || job.book)job.card.updatedAt=new Date().toISOString();
    // Validate imported fields before changing the authorized file. The work guard
    // includes the attached book and the original avatar from the time of review.
    root.TAStore.verify({characters:[job.card],worldBooks:job.book?[job.book]:[]});
    agreed(snapshot);
    return {job,bytes,decoded};
  }
  async function finish(snapshot,record,file,decoded,job,needsVerify,asset) {
    if(job.replaceBook && (await db().worldBinding(job.book.id) || !exclusive(snapshot.card.id,job.book.id)))throw fault('sync.staleWork');
    const next={...link(record,file),variant:job.variant,ownedBookId:job.ownedBookId,needsVerify,
      localArtId:job.card.avatarAssetId ?? null,localArtHash:job.baseArt ? await assetHash(asset || snapshot.asset) : null};
    if(needsVerify){
      next.downloadHash=job.outputHash;next.downloadArt=job.baseArt;next.downloadLocalArt=job.baseLocalArt;
    }else{
      next.base=core().select(decoded,editionFor(decoded,job.variant));next.baseArt=job.baseArt;next.baseLocalArt=job.baseLocalArt;
      next.hash=file.hash;next.checkedAt=Date.now();delete next.downloadHash;delete next.downloadArt;delete next.downloadLocalArt;
    }
    if(file.receipt?.kind==='write' && file.receipt.operationId===job.operationId)next.lastWrite=job.operationId;
    await persist(snapshot,record,next,job,asset);
  }
  async function adopt(job,bytes) {
    return job.assetId ? images().makeAsset(job.assetId,job.card.name+' · '+ui().t('头像'),bytes) : null;
  }
  async function apply(view,choices) {
    const {snapshot,record,file,plan}=view;
    agreed(snapshot);
    const {job,bytes,decoded}=await makeJob(view,choices,core().resolve(plan,choices));
    const changed=job.outputHash!==file.hash;
    const asset=await adopt(job,bytes);
    agreed(snapshot);
    if(!db().database()){
      if(file.target)throw fault('sync.storage');
      download(file.name,bytes);return 'sync.downloadOnly';
    }
    if(!file.target){
      await finish(snapshot,record,file,decoded,job,changed,asset);
      if(changed)download(file.name,bytes);
      return changed?'card.exported':'sync.matched';
    }
    if(!changed){
      const latest=await root.nijanDesktop.cardSyncRead(file.target);
      if(latest.hash!==file.hash)throw fault('card-sync-changed');
      await finish(snapshot,record,latest,decoded,job,false,asset);return 'sync.matched';
    }
    const staged=await persist(snapshot,record,{...link(record,file),pending:job});
    agreed(snapshot);
    const latest=await root.nijanDesktop.cardSyncWrite(file.target,file.hash,bytes,job.operationId);
    const result=await recover(snapshot,staged,latest,core().decode(latest.bytes,file.name),asset);
    if(!result.finished)throw fault('sync.recheck');
    return result.message;
  }
  async function recover(snapshot,record,file,decoded,asset) {
    const job=record.pending,receipt=file.receipt,next=link(record,file);
    const applied=receipt?.operationId===job.operationId && receipt.kind===job.kind && receipt.hash===file.hash;
    if(applied && job.kind==='restore'){
      next.lastWrite=null;await persist(snapshot,record,next);return {finished:true,message:'sync.restored'};
    }
    if(applied && job.outputHash===file.hash && await workHash(snapshot)===job.expectedWork){
      try{
        await finish(snapshot,record,file,decoded,job,false,asset ?? await adopt(job,file.bytes));
        return {finished:true,message:'card.written'};
      }catch(error){if(error.code!=='sync.staleWork')throw error;}
    }
    if(applied)next.lastWrite=job.operationId;
    return {finished:false,record:await persist(snapshot,record,next),message:'sync.recheck'};
  }
  function canRestore(record,file) {
    return !!(record?.lastWrite && !record.pending && file?.canRestore &&
      file.receipt?.operationId===record.lastWrite && file.receipt.hash===file.hash);
  }
  async function restore(before,record,file) {
    if(!canRestore(record,file))throw fault('card-sync-no-backup');
    const snapshot=structuredClone(current(before.id));
    if(!same(before,snapshot.card))throw fault('sync.staleWork');
    const pending={kind:'restore',operationId:crypto.randomUUID()};
    const staged=await persist(snapshot,record,{...record,pending});
    const latest=await root.nijanDesktop.cardSyncRestore(record.target,file.hash,pending.operationId);
    const result=await recover(snapshot,staged,latest,core().decode(latest.bytes,file.name));
    if(!result.finished)throw fault('sync.recheck');
    return result.message;
  }
  async function dirty(record,work) {
    const snapshot=current(work.id);
    return !!core().review(record.base,snapshot.card,snapshot.book,record.base,record.name).rows.length ||
      !!record.baseArt && record.localArtHash!==await assetHash(snapshot.asset);
  }
  root.TACardSyncSession={binding,canRestore,dirty,prepare,inspect:id=>withCard(id,()=>inspect(id)),
    apply:(view,choices)=>withCard(view.before.id,()=>apply(view,choices)),
    restore:(before,record,file)=>withCard(before.id,()=>restore(before,record,file)),
    unlink:(id,record)=>withCard(id,()=>persist(structuredClone(current(id)),record,null))};
})(globalThis);
