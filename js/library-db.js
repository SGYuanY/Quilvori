/* The old Web Storage copy is read only during the first successful migration. */
(function(root) {
  'use strict';
  const primary = 'current', previous = 'previous', migration = 'migration';
  let activeDatabase, clearEpoch=0;
  const conflict = () => new Error('资料库已变化，请重新打开。');
  const storageError = error => {
    if (error?.name !== 'QuotaExceededError') return error || new Error('版本库存储不可用');
    const wrapped = new Error('本机存储空间不足，请导出备份后释放空间。');
    wrapped.code = 'quota'; return wrapped;
  };
  function open() {
    return new Promise((resolve,reject) => {
      const request = indexedDB.open('quilvori-library',4);
      let blocked=false;
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('library')) db.createObjectStore('library');
        if (!db.objectStoreNames.contains('creationRecords')) {
          const records=db.createObjectStore('creationRecords',{keyPath:'id'});
          records.createIndex('startedAt','startedAt');
        }
        if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts',{keyPath:'id'});
        if (!db.objectStoreNames.contains('versions')) {
          const versions = db.createObjectStore('versions',{keyPath:'seq',autoIncrement:true});
          versions.createIndex('entity','entity');
        }
      };
      request.onsuccess = () => {
        const db=request.result;
        if(blocked){db.close();return;}
        db.onversionchange=()=>db.close();resolve(db);
      };
      request.onblocked = () => {blocked=true;reject(new Error('请关闭其他工作台窗口后重试。'));};
      request.onerror = () => reject(request.error);
    });
  }
  function read(db,key=primary,onlyKey=false) {
    return new Promise((resolve,reject) => {
      const table = db.transaction('library').objectStore('library');
      const req = onlyKey ? table.getKey(key) : table.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function replace(db,expected,data,keepPrevious,guard,snapshots = [],clearVersions = false,archive = null,draft = null,epoch = null) {
    return new Promise((resolve,reject) => {
      const tables=['library'];
      if(clearVersions || snapshots.length)tables.push('versions');
      if(clearVersions || draft)tables.push('drafts');
      if(clearVersions)tables.push('creationRecords');
      const tx=db.transaction(tables,'readwrite'),table=tx.objectStore('library');
      const get = table.get(primary);
      let failure;
      tx.onabort = () => reject(failure || storageError(tx.error));
      tx.oncomplete = () => resolve(expected + 1);
      get.onsuccess = () => {
        const old = get.result;
        if ((old?.seq ?? 0) !== expected || (guard && !guard())) { failure=conflict(); tx.abort(); return; }
        if(draft) root.TAStudioDrafts.writeTo(tx.objectStore('drafts'),draft,error=>{failure=error;tx.abort();});
        if (keepPrevious === true && old) table.put(old,previous);
        else if (keepPrevious === false) table.delete(previous);
        table.put({seq:expected+1,data},primary);
        if (archive) table.put(archive,migration);
        if (clearVersions) { table.put(epoch,'creationEpoch'); tx.objectStore('versions').clear(); tx.objectStore('drafts').clear(); tx.objectStore('creationRecords').clear(); table.delete(migration); }
        if (snapshots.length) for (const row of snapshots) tx.objectStore('versions').add(row);
      };
    });
  }
  async function adapt() {
    const store = root.TAStore, marker = store.databaseMarker;
    let migrated = false;
    try { migrated = localStorage.getItem(marker) === '1' || localStorage.getItem(store.KEY) === store.databaseRedirect; } catch (_) {}
    if (!root.indexedDB) {
      if (migrated) throw new Error('无法打开本机资料库');
      return store.load();
    }
    const db = await open();
    async function previousVersion() {
      const prior = await read(db,previous);
      try { return store.verify(prior?.data); } catch (_) {}
      const archived = await read(db,migration);
      try { return store.verify(JSON.parse(archived?.raw)); } catch (_) { return null; }
    }
    let record = await read(db), initial, archive;
    if (!record) {
      const legacyRaw = localStorage.getItem(store.KEY);
      const legacy = store.load();
      if (migrated) {
        // Offer explicit recovery if the active record was removed while the migration marker survived.
        record = {seq:0,data:null};
        initial = {corrupt:true,missing:true,raw:null,previous:await previousVersion() || (legacy.fresh ? null : legacy.library || legacy.previous)};
      } else {
        if (legacy.corrupt) { db.close(); return legacy; }
        if (!legacy.persistent && !legacy.fresh) throw new Error('无法读取原始存档');
        try {
          archive = legacyRaw === null ? null : {raw:legacyRaw,previous:localStorage.getItem(store.KEY+'.previous')};
          const seq = await replace(db,0,legacy.library,false,()=>localStorage.getItem(store.KEY)===legacyRaw,[],false,archive);
          record = {seq,data:legacy.library};
          initial = {...legacy,persistent:true,fresh:false};
        } catch (error) {
          record = await read(db);
          if (!record) throw error;
        }
      }
    }
    let seq = record.seq, locked = !!initial?.corrupt, chain = Promise.resolve();
    const enqueue = fn => {
      const job = chain.then(fn); chain = job.catch(()=>{}); return job;
    };
    const write = async (data,guard,keepPrevious=true,snapshots=[],draft=null) => {
      try { seq = await replace(db,seq,data,keepPrevious,guard,snapshots,false,null,draft); }
      catch(error) {
        if (error.code !== 'quota' || !keepPrevious) throw error;
        seq = await replace(db,seq,data,false,guard,snapshots,false,null,draft);
      }
    };
    if (!initial) {
      try { initial = {library:store.verify(record.data),persistent:true,fresh:false}; }
      catch (_) {
        locked = true;
        const fallback = await previousVersion();
        initial = {corrupt:true,raw:typeof record.data==='string'?record.data:JSON.stringify(record.data),previous:fallback};
      }
    }
    // The revision is checked inside every IndexedDB write transaction, including from another window.
    activeDatabase = db;
    store.backend = 'indexedDB';
    store.save = (library,guard,snapshots,draft) => {
      if (locked) throw new Error('请先恢复资料库。');
      const data = store.verify(structuredClone(library));
      data.meta ||= {}; data.meta.updatedAt = new Date().toISOString();
      return enqueue(()=>write(data,guard,true,snapshots,draft));
    };
    store.erase = (library,guard) => enqueue(async () => {
      if (locked) throw new Error('请先恢复资料库。');
      const epoch=store.uid('clear');
      seq = await replace(db,seq,library,false,guard,[],true,null,null,epoch);
      clearEpoch=epoch;
      store.hasMigrationBackup = false;
      try {
        localStorage.removeItem(store.KEY);
        localStorage.removeItem(store.KEY+'.previous');
      } catch (_) { return '旧迁移副本未能清除'; }
    });
    store.recover = async (raw,library) => {
      if (!locked || raw !== initial.raw) throw conflict();
      const verified = store.verify(structuredClone(library));
      await enqueue(()=>write(verified,null,'preserve')); locked = false;
    };
    store.hasMigrationBackup = Boolean(await read(db,migration,true));
    store.migrationBackup = async () => (await read(db,migration))?.raw;
    // Only compact the old keys after both the new active record and the exact
    // original bytes have committed in one transaction. Preserve later legacy edits.
    if (!migrated && store.hasMigrationBackup) {
      archive ||= await read(db,migration);
      try {
        if (archive.raw === localStorage.getItem(store.KEY)) localStorage.setItem(store.KEY,store.databaseRedirect);
        if (archive.previous && archive.previous === localStorage.getItem(store.KEY+'.previous')) localStorage.removeItem(store.KEY+'.previous');
      } catch (_) { /* The old copy is still safe if Web Storage is read-only. */ }
    }
    try { localStorage.setItem(marker,'1'); } catch (_) {}
    return initial;
  }
  async function start(views) {
    let loaded;
    try {
      loaded = await adapt();
      if(loaded.library){
        await root.TAStudioDrafts?.load(activeDatabase).catch(()=>{loaded.draftWarning=true;});
        await root.TACreationRecords?.load(activeDatabase).catch(()=>{loaded.archiveWarning=true;});
        if(activeDatabase && !loaded.draftWarning)await root.NIJANStudio?.migrateSessionDrafts(loaded.library);
      }
    }
    catch (error) { loaded = {unavailable:true,message:error.message}; }
    root.TAUI.mount(views,loaded);
  }
  root.TALibraryDB = { start, database:()=>activeDatabase, clearEpoch:()=>clearEpoch };
})(globalThis);
