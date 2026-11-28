/* IndexedDB stores editable works separately and retains the preceding transaction for recovery. */
(function(root) {
  'use strict';
  const headKey = 'current', undoKey = 'previous', archiveKey = 'migration', checkpointKey = 'recoveryCheckpoint';
  const format = 'records-v1', records = 'libraryRecords', layoutKey = 'layout';
  const payloadFields = new Map([['assets','dataUrl'],['chats','messages'],['stickerPacks','stickers']]);
  let activeDatabase, currentRevision = 0, clearEpoch = 0;
  const conflict = () => new Error('资料库已变化，请重新打开。');
  const staleRevision = () => Object.assign(conflict(),{code:'library-revision'});
  const unavailable = () => new Error('无法打开本机资料库');
  const storageError = error => {
    if (error?.name !== 'QuotaExceededError') return error || unavailable();
    const wrapped = new Error('本机存储空间不足，请导出备份后释放空间。');
    wrapped.code = 'quota'; return wrapped;
  };
  function request(req) {
    return new Promise((resolve,reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function open() {
    // Older clients do not track independent draft/history writes during backup reviews.
    const req = indexedDB.open('quilvori-library',6);
    let blocked = false;
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('library')) db.createObjectStore('library');
      if (!db.objectStoreNames.contains(records)) db.createObjectStore(records,{keyPath:'key'});
      if (!db.objectStoreNames.contains('creationRecords')) {
        const table = db.createObjectStore('creationRecords',{keyPath:'id'});
        table.createIndex('startedAt','startedAt');
      }
      if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts',{keyPath:'id'});
      if (!db.objectStoreNames.contains('versions')) {
        const table = db.createObjectStore('versions',{keyPath:'seq',autoIncrement:true});
        table.createIndex('entity','entity');
      }
      if (!db.objectStoreNames.contains('versionLimits')) db.createObjectStore('versionLimits');
      if (!db.objectStoreNames.contains('versionInfo')) {
        const index = db.createObjectStore('versionInfo',{keyPath:'seq'});
        index.createIndex('entity','entity');
        const cursor = req.transaction.objectStore('versions').openCursor();
        cursor.onsuccess = () => {
          const row=cursor.result;
          if (row) { index.put(root.TAHistory.summary(row.value,row.primaryKey)); row.continue(); }
        };
      }
    };
    return new Promise((resolve,reject) => {
      req.onsuccess = () => {
        const db=req.result;
        if (blocked) { db.close(); return; }
        db.onversionchange=()=>db.close(); resolve(db);
      };
      req.onblocked = () => { blocked=true; reject(new Error('请关闭其他工作台窗口后重试。')); };
      req.onerror = () => reject(req.error);
    });
  }
  const keyOf = (field,id) => JSON.stringify(id===undefined ? [field] : [field,id]);
  const payloadKey = (field,id) => JSON.stringify([field,id,'payload']);
  function metadata(field,item) {
    const body=payloadFields.get(field);
    const key=keyOf(field,item.id);
    if (!body || !Object.hasOwn(item,body)) return {key,value:item};
    const value={...item};
    delete value[body];
    return {key,value,body};
  }
  function pack(library) {
    const rows=[], layout=[];
    for (const [field,value] of Object.entries(library)) {
      if (root.TAStore.collections.includes(field)) {
        layout.push([field,value.map(item=>item.id)]);
        for (const item of value) {
          const row=metadata(field,item);
          rows.push(row);
          if (row.body) rows.push({key:payloadKey(field,item.id),value:item[row.body]});
        }
      } else {
        layout.push([field,null]);
        rows.push({key:keyOf(field),value});
      }
    }
    rows.push({key:layoutKey,value:layout});
    return {full:true,rows};
  }
  function unpack(rows, undo = []) {
    const items=new Map(rows.map(row=>[row.key,row]));
    for (const row of undo) items.set(row.key,row);
    const take = key => {
      if (!items.has(key)) throw unavailable();
      const value=items.get(key); items.delete(key); return value;
    };
    const fields=take(layoutKey).value;
    if (!Array.isArray(fields)) throw unavailable();
    const library=Object.fromEntries(fields.map(([field,ids])=>[field,
      ids===null ? take(keyOf(field)).value : ids.map(id=>{
        const row=take(keyOf(field,id));
        if (row.value?.id!==id) throw unavailable();
        if (!row.body) return row.value;
        if (row.body!==payloadFields.get(field)) throw unavailable();
        return {...row.value,[row.body]:take(payloadKey(field,id)).value};
      })]));
    if (items.size || Object.keys(library).length!==fields.length) throw unavailable();
    return root.TAStore.verify(library);
  }
  // Scope hints only describe existing records. Insertions, deletions and bulk operations
  // without a specific scope go through full validation and replace the ordered layout.
  function changes(library,scopes) {
    const store=root.TAStore;
    const keys=new Map(scopes.map(scope=>[keyOf(...scope),scope]));
    keys.set(keyOf('meta'),['meta']);
    const rows=[];
    for (const [key,[field,id]] of keys) {
      let value;
      if (store.collections.includes(field)) {
        const item=library[field].find(row=>row.id===id);
        if (!item) throw conflict();
        const row=metadata(field,item);
        row.value=store.verify({[field]:[structuredClone(row.value)]})[field][0];
        if (row.body) delete row.value[row.body];
        rows.push(row);
        continue;
      } else {
        if (!Object.hasOwn(library,field) || id!==undefined) throw conflict();
        value=store.verify({characters:[],[field]:structuredClone(library[field])})[field];
        if (field==='meta') value.updatedAt=new Date().toISOString();
      }
      rows.push({key,value});
    }
    return {full:false,rows};
  }
  async function loadedState(db) {
    // Read the pointer and its records in a single transaction, including during migration.
    const tx=db.transaction(['library',records]);
    const [head,rows]=await Promise.all([request(tx.objectStore('library').get(headKey)),request(tx.objectStore(records).getAll())]);
    return {head,rows};
  }
  function referenceIssue(library,change,replyReference) {
    if(change.collection==='worldBooks' && change.field==='entries'){
      const book=root.TAStore.byId(library.worldBooks,change.id);
      if(root.TAWorkRestore.entryReferenceChanges(library,book,change.local || [],replyReference).length)return 'history.linkedEntries';
    }
    if(change.collection==='quickReplySets' && change.field==='workSource' && !root.TAStore.hasReplySources(library,change.local)){
      return '参考作品或条目已移除。请重新选择参考资料，再生成这套回复。';
    }
    return '';
  }
  async function reviewEdits(library,scopes,replyReference) {
    // Only an existing, individually tracked work can be replayed. A bulk
    // replacement, deletion, older writer or payload edit requires a backup review.
    const store=root.TAStore, base=currentRevision;
    if(!scopes?.length || !scopes.every(([field,id,mode])=>store.collections.includes(field) && id!=null &&
        (!payloadFields.has(field) || mode==='metadata')))return null;
    const {head,rows}=await loadedState(activeDatabase);
    if(head?.format!==format || !Number.isSafeInteger(head.scopedSince) || head.scopedSince>base)return null;
    const saved=new Map(rows.map(row=>[row.key,row]));
    const local=new Map(changes(library,scopes).rows.map(row=>[row.key,row]));
    const pairs=[];
    for(const [field,id] of scopes){
      const key=keyOf(field,id), before=saved.get(key), proposed=local.get(key);
      if(!before || !proposed || before.body!==proposed.body)return null;
      pairs.push({collection:field,id,saved:before.value,local:proposed.value,
        overlapping:(before.writeSeq ?? head.scopedSince)>base});
    }
    const latest=unpack(rows), edits=root.TARecordEdits.compare(pairs);
    for(const change of edits){
      change.issue=referenceIssue(latest,change,replyReference);
      if(change.issue)change.review=true;
    }
    return {base,seq:head.seq,library:latest,scopes,changes:edits};
  }
  const readControl = (db,key,onlyKey=false) => {
    const table=db.transaction('library').objectStore('library');
    return request(onlyKey ? table.getKey(key) : table.get(key));
  };
  // File authorizations and common versions belong to this device, outside library exports.
  const bindingStores={worldBooks:'worldSync',characters:'cardSync'};
  function workBinding(kind,id) {
    if(!Object.hasOwn(bindingStores,kind))throw conflict();
    return activeDatabase ? readControl(activeDatabase,[bindingStores[kind],id]).then(value=>value ?? null) : Promise.resolve(null);
  }
  function updateBindings(control,batch,options,abort) {
    const change=options.fileBinding, reset=options.clear || options.transfer?.mode==='replace' || change?.reset;
    if(reset || batch.full){
      const layout=batch.full && batch.rows.find(row=>row.key===layoutKey).value;
      for(const [kind,store] of Object.entries(bindingStores)){
        const range=IDBKeyRange.bound([store],[store,[]]);
        if(reset){control.delete(range);continue;}
        const ids=new Set(layout.find(([field])=>field===kind)?.[1]);
        const cursor=control.openKeyCursor(range);
        cursor.onsuccess=()=>{
          const row=cursor.result;
          if(!row)return;
          if(!ids.has(row.key[1]))control.delete(row.key);
          row.continue();
        };
      }
    }
    if(!change || reset)return;
    const kind=change.kind ?? 'worldBooks';
    if(!Object.hasOwn(bindingStores,kind))throw conflict();
    const key=[bindingStores[kind],change.id], prior=control.get(key);
    prior.onsuccess=()=>{
      if((prior.result?.stamp ?? null)!==change.expected){abort(conflict());return;}
      if(change.next)control.put(change.next,key);
      else control.delete(key);
    };
  }
  function touchWork(tx) {
    tx.objectStore('library').put(root.TAStore.uid('state'),'workRevision');
  }
  async function replacementGuard() {
    if(!activeDatabase)throw new Error('完整工作状态需要 IndexedDB');
    // Replacement can repair malformed auxiliary records. Only the commit guards are needed.
    const expected=currentRevision,control=activeDatabase.transaction('library').objectStore('library');
    const [head,token]=await Promise.all([request(control.get(headKey)),request(control.get('workRevision'))]);
    if((head?.seq??0)!==expected)throw conflict();
    return {token:token??null,state:null};
  }
  async function workingState(withLibrary=false,allowDetached=false) {
    const db=activeDatabase;
    if(!db)throw new Error('完整工作状态需要 IndexedDB');
    const names=['library','drafts','creationRecords','versions','versionLimits'];
    if(withLibrary)names.push(records);
    const expected=currentRevision,tx=db.transaction(names),ctrl=tx.objectStore('library'),policies=tx.objectStore('versionLimits');
    const [head,token,drafts,versions,model,keys,limits,parts]=await Promise.all([
      request(ctrl.get(headKey)),request(ctrl.get('workRevision')),request(tx.objectStore('drafts').getAll()),
      request(tx.objectStore('versions').getAll()),request(tx.objectStore('creationRecords').getAll()),
      request(policies.getAllKeys()),request(policies.getAll()),withLibrary?request(tx.objectStore(records).getAll()):null,
    ]);
    if(!allowDetached && (head?.seq??0)!==expected)throw conflict();
    const work=root.TAWorkBackup.normalize({drafts,versions,records:model,limits:keys.map((key,i)=>{
      const [kind,id]=JSON.parse(key);return {kind,id,keep:limits[i]};
    })});
    return {token:token??null,state:work,library:withLibrary?unpack(parts):null};
  }
  function restoreWork(tx,transfer) {
    const history=root.TAHistory, state=transfer.data;
    for(const name of ['drafts','creationRecords',...history.tables])tx.objectStore(name).clear();
    for(const row of state.drafts)tx.objectStore('drafts').add(row);
    for(const row of state.records)tx.objectStore('creationRecords').add(row);
    // Source sequence numbers are device-local. Fresh keys also invalidate previously opened comparisons.
    history.append(tx,state.versions,false);
    for(const row of state.limits)tx.objectStore('versionLimits').put(row.keep,row.key);
    tx.objectStore('library').put(transfer.epoch,'creationEpoch');
  }
  function commit(db,expected,batch,options={}) {
    const {guard,snapshots=[],importSnapshots=[],draft,clear,archive,epoch,transfer}=options;
    const history=root.TAHistory;
    const tables=['library',records];
    if (clear || transfer || snapshots.length || importSnapshots.length || options.restore) tables.push(...history.tables);
    if (clear || transfer || draft) tables.push('drafts');
    if (clear || transfer) tables.push('creationRecords');
    return new Promise((resolve,reject) => {
      const tx=db.transaction(tables,'readwrite'),control=tx.objectStore('library'),parts=tx.objectStore(records);
      let failure;
      const abort=error=>{if (!failure) {failure=error;tx.abort();}};
      tx.onabort=()=>reject(failure || storageError(tx.error));
      tx.oncomplete=()=>resolve(expected+1);
      const get=control.get(headKey);
      get.onsuccess=()=>{
        const old=get.result;
        if ((old?.seq ?? 0)!==expected) { abort(staleRevision()); return; }
        if (guard && !guard()) { abort(conflict()); return; }
        if (transfer) {
          const token=control.get('workRevision');
          token.onsuccess=()=>{if((token.result??null)!==transfer.expected)abort(conflict());};
        }
        if (options.restore) {
          // A different window may prune the selected revision after the comparison was opened.
          const source=tx.objectStore('versionInfo').get(options.restore.seq);
          source.onsuccess=()=>{if (source.result?.entity!==options.restore.entity) abort(conflict());};
        }
        function finish(previous) {
          try {
            if (guard && !guard()) { abort(conflict());return; }
            if (options.undo==='discard') {control.delete(undoKey);control.delete(checkpointKey);}
            else if (previous?.full || previous?.data) {
              // A bulk operation already has the independent recovery copy. Keep it if a later
              // incremental write needs to replace its much smaller one-step inverse.
              control.put(previous,checkpointKey);
              control.put({checkpoint:true},undoKey);
            } else if (previous) control.put(previous,undoKey);
            if (batch.full) parts.clear();
            for (const row of batch.rows) parts.put(batch.full ? row : {...row,writeSeq:expected+1});
            updateBindings(control,batch,options,abort);
            const boundary=batch.full || transfer || clear || draft || snapshots.length || importSnapshots.length || options.restore || options.fileBinding;
            control.put({seq:expected+1,format,scopedSince:boundary ? expected+1 : old?.scopedSince ?? expected},headKey);
            if (archive) control.put(archive,archiveKey);
            if (draft) root.TAStudioDrafts.writeTo(tx.objectStore('drafts'),draft,abort);
            if (transfer) restoreWork(tx,transfer);
            if (clear) {
              control.put(epoch,'creationEpoch'); control.delete(archiveKey);
              for (const name of [...history.tables,'drafts','creationRecords']) tx.objectStore(name).clear();
            }
            if (importSnapshots.length) history.appendImported(tx,importSnapshots,snapshots,abort);
            else if (snapshots.length) history.append(tx,snapshots);
            if (clear || transfer || draft || snapshots.length || importSnapshots.length) touchWork(tx);
          } catch (error) { abort(error); }
        }
        if (batch.full) {
          if (options.undo==='keep' && old?.format===format) {
            const getAll=parts.getAll();
            getAll.onsuccess=()=>finish({full:true,rows:getAll.result});
          } else if (options.undo==='migrate') {
            const previous=control.get(undoKey);
            previous.onsuccess=()=>finish(previous.result?.data ? previous.result : {data:old.data});
          } else {
            finish(options.fallback ? {data:options.fallback} : options.undo==='keep' && old ? {data:old.data} : null);
          }
          return;
        }
        if (old?.format!==format) {abort(conflict());return;}
        // Only read the persisted values actually needed to undo this edit.
        let remaining=batch.rows.length;
        const prior=[];
        for (const row of batch.rows) {
          const getOld=parts.get(row.key);
          getOld.onsuccess=()=>{
            if (!getOld.result || getOld.result.body!==row.body) {abort(conflict());return;}
            prior.push(getOld.result);
            if (--remaining===0) finish({full:false,rows:prior});
          };
        }
      };
    });
  }
  async function adapt() {
    const store=root.TAStore, marker=store.databaseMarker;
    let migrated=false;
    try { migrated=localStorage.getItem(marker)==='1' || localStorage.getItem(store.KEY)===store.databaseRedirect; } catch (_) {}
    if (!root.indexedDB) {
      if (migrated) throw unavailable();
      return store.load();
    }
    const db=await open();
    let {head,rows}=await loadedState(db);
    let initial,archive,legacyDamage;
    async function previousVersion() {
      const prior=await readControl(db,undoKey);
      try {
        if (prior?.rows) return unpack(prior.full ? prior.rows : rows,prior.full ? [] : prior.rows);
        if (prior?.data) return store.verify(prior.data);
      } catch (_) {}
      const checkpoint=await readControl(db,checkpointKey);
      try {
        if (checkpoint?.full) return unpack(checkpoint.rows);
        if (checkpoint?.data) return store.verify(checkpoint.data);
      } catch (_) {}
      const archived=await readControl(db,archiveKey);
      try {return store.verify(JSON.parse(archived?.raw));} catch (_) {return null;}
    }
    if (!head) {
      const legacyRaw=localStorage.getItem(store.KEY), legacy=store.load();
      if (migrated || rows.length) {
        let fallback=await previousVersion();
        if (!fallback && rows.length) {try {fallback=unpack(rows);} catch (_) {}}
        initial={corrupt:true,missing:true,raw:null,previous:fallback || (legacy.fresh ? null : legacy.library || legacy.previous)};
      } else if(legacy.corrupt) {
        legacyDamage={raw:legacyRaw,previous:localStorage.getItem(store.KEY+'.previous')};
        initial=legacy;
      } else {
        if (!legacy.persistent && !legacy.fresh) {db.close();throw unavailable();}
        archive=legacyRaw===null ? null : {raw:legacyRaw,previous:localStorage.getItem(store.KEY+'.previous')};
        try {
          const seq=await commit(db,0,pack(legacy.library),{undo:'discard',archive,guard:()=>localStorage.getItem(store.KEY)===legacyRaw});
          head={seq,format}; initial={...legacy,persistent:true,fresh:false};
        } catch (error) {
          ({head,rows}=await loadedState(db));
          if (!head) {db.close();throw error;}
        }
      }
    }
    if (!initial) {
      try {
        initial={library:head.format===format ? unpack(rows) : store.verify(head.data),persistent:true,fresh:false};
      } catch (_) {
        initial={corrupt:true,raw:head.format===format ? JSON.stringify({head,rows}) :
          typeof head.data==='string' ? head.data : JSON.stringify(head.data),previous:await previousVersion()};
      }
      if (!initial.corrupt && head.format!==format) {
        // A v4 database is kept intact if conversion runs out of space or another tab wins.
        try {
          const batch=pack(initial.library);
          let seq;
          try {seq=await commit(db,head.seq,batch,{undo:'migrate'});}
          catch(error) {
            if (error.code!=='quota') throw error;
            seq=await commit(db,head.seq,batch,{undo:'preserve'});
          }
          head={seq,format};
        }
        catch (error) {
          const current=await loadedState(db);
          if (current.head?.format!==format) {db.close();throw error;}
          head=current.head; initial.library=unpack(current.rows);
        }
      }
    }
    let locked=!!initial.corrupt, chain=Promise.resolve();
    const damaged=locked ? {raw:initial.raw,previous:initial.previous} : null;
    const enqueue=fn=>{const job=chain.then(fn);chain=job.catch(()=>{});return job;};
    activeDatabase=db; currentRevision=head?.seq ?? 0;
    // Discard startup record copies. Recovery only needs its verified fallback and export text.
    rows=null; head=null;
    const write=async (expected,batch,options)=>{
      try { return await commit(db,expected,batch,options); }
      catch (error) {
        if (error.code!=='quota' || options.undo!=='keep') throw error;
        return commit(db,expected,batch,{...options,undo:'discard'});
      }
    };
    const persist=async (batch,options)=>{ currentRevision=await write(currentRevision,batch,options); };
    store.backend='indexedDB';
    root.TALibraryDB.applyReviewedEdits=(review,selected,guard,replyReference)=>enqueue(async()=>{
      if(locked || currentRevision!==review.base || !guard())throw staleRevision();
      const affected=new Set();
      for(const change of review.changes){
        if(change.review && !selected.has(change.key))continue;
        const issue=referenceIssue(review.library,change,replyReference);
        if(issue)throw new Error(issue);
        const target=store.byId(review.library[change.collection],change.id);
        root.TARecordEdits.apply(target,change);
        affected.add(keyOf(change.collection,change.id));
      }
      const scopes=review.scopes.filter(([field,id])=>affected.has(keyOf(field,id)));
      let revision=review.seq;
      if(scopes.length)revision=await write(revision,changes(review.library,scopes),{guard,undo:'keep'});
      else if((await readControl(db,headKey))?.seq!==revision)throw staleRevision();
      if(!guard())throw staleRevision();
      currentRevision=revision;
      return review.library;
    });
    store.save=(library,guard,snapshots,draft,scopes,restore,transfer,importSnapshots,fileBinding)=>{
      if (locked) throw new Error('请先恢复资料库。');
      let batch;
      if (scopes?.length && scopes.every(([field,,mode])=>!payloadFields.has(field) || mode==='metadata')) batch=changes(library,scopes);
      else {
        const data=store.verify(structuredClone(library));
        data.meta.updatedAt=new Date().toISOString();
        batch=pack(data);
      }
      return enqueue(async()=>{
        await persist(batch,{guard,undo:'keep',snapshots,draft,restore,transfer,importSnapshots,fileBinding});
        if(transfer)clearEpoch=transfer.epoch;
      });
    };
    store.erase=(library,guard)=>{
      if (locked) throw new Error('请先恢复资料库。');
      const batch=pack(store.verify(structuredClone(library)));
      return enqueue(async()=>{
        const epoch=store.uid('clear');
        await persist(batch,{guard,undo:'discard',clear:true,epoch}); clearEpoch=epoch;
        store.hasMigrationBackup=false;
        try {localStorage.removeItem(store.KEY);localStorage.removeItem(store.KEY+'.previous');}
        catch (_) {return '旧迁移副本未能清除';}
      });
    };
    store.recover=async(raw,library,transfer)=>{
      if (!locked || raw!==damaged.raw) throw conflict();
      const batch=pack(store.verify(structuredClone(library)));
      const guard=legacyDamage ? ()=>localStorage.getItem(store.KEY)===legacyDamage.raw : undefined;
      await enqueue(()=>persist(batch,{undo:damaged.previous?'preserve':'discard',fallback:damaged.previous,archive:legacyDamage,guard,transfer,fileBinding:{reset:true}}));
      if(transfer)clearEpoch=transfer.epoch;
      locked=false;
    };
    store.hasMigrationBackup=!!(await readControl(db,archiveKey,true));
    store.migrationBackup=async()=>(await readControl(db,archiveKey))?.raw;
    if (!migrated && store.hasMigrationBackup) {
      archive ||= await readControl(db,archiveKey);
      try {
        if (archive.raw===localStorage.getItem(store.KEY)) localStorage.setItem(store.KEY,store.databaseRedirect);
        if (archive.previous && archive.previous===localStorage.getItem(store.KEY+'.previous')) localStorage.removeItem(store.KEY+'.previous');
      } catch (_) {}
    }
    if(!legacyDamage){try {localStorage.setItem(marker,'1');} catch (_) {}}
    return initial;
  }
  async function start(views) {
    let loaded;
    try {
      loaded=await adapt();
      if (loaded.library) {
        await root.TAStudioDrafts?.load(activeDatabase).catch(()=>{loaded.draftWarning=true;});
        await root.TACreationRecords?.load(activeDatabase).catch(()=>{loaded.archiveWarning=true;});
        if(activeDatabase && !loaded.draftWarning)await root.NIJANStudio?.migrateSessionDrafts(loaded.library);
      }
    } catch(error) {loaded={unavailable:true,message:error.message};}
    root.TAUI.mount(views,loaded);
  }
  root.TALibraryDB={start,workingState,reviewEdits,replacementGuard,touchWork,workBinding,worldBinding:id=>workBinding('worldBooks',id),database:()=>activeDatabase,revision:()=>currentRevision,clearEpoch:()=>clearEpoch};
})(globalThis);
