/* Device-only source text for the most recent card and world-book requests. */
(function(root){
  'use strict';
  const limit=24, saved=new Map(), hashes=new WeakMap();
  let generation=0;
  const works=['character','world'];
  const isWork=record=>works.some(kind=>record?.task==='create:'+kind);
  const time=row=>typeof row.startedAt==='string' ? row.startedAt : '';
  function portable(record){
    const row={};
    for(const key of ['id','task','label','model','startedAt','finishedAt','status','error','errorCode','output','sourceKey','workBatch','workKinds','workBrief','reasoningEffort','bytesReceived']){
      if(record[key]!==undefined)row[key]=record[key];
    }
    if(row.status==='received')row.status='received_raw';
    return row;
  }
  function replace(rows,epoch){
    saved.clear();generation=epoch??0;
    for(const row of rows)if(isWork(row))saved.set(row.id,row);
  }
  function history(live){
    const rows=new Map(saved);
    for(const row of live)rows.set(row.id,row);
    return [...rows.values()].sort((a,b)=>time(a).localeCompare(time(b)));
  }
  async function load(db){
    if(!db)return;
    const tx=db.transaction(['creationRecords','library']);
    const read=request=>new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    const [rows,epoch]=await Promise.all([read(tx.objectStore('creationRecords').getAll()),read(tx.objectStore('library').get('creationEpoch'))]);
    replace(rows,epoch);
  }
  function sourceKey(text){
    return crypto.subtle.digest('SHA-256',new TextEncoder().encode(text.trim()))
      .then(buffer=>Array.from(new Uint8Array(buffer),byte=>byte.toString(16).padStart(2,'0')).join(''));
  }
  async function save(record){
    if(!isWork(record) || !record.output || record.epoch!==generation)return;
    const db=root.TALibraryDB?.database();
    try{
      if(!hashes.has(record))hashes.set(record,sourceKey(record.output));
      record.sourceKey=await hashes.get(record);
      if(record.epoch!==generation)return;
      if(!db)throw new Error('存储不可用');
      // Persist the response and its recovery metadata, omitting credentials and reference material.
      const row=portable(record);
      let current=false;
      let kept=[];
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(['library','creationRecords'],'readwrite'),table=tx.objectStore('creationRecords');
        const epoch=tx.objectStore('library').get('creationEpoch');
        epoch.onsuccess=()=>{
          current=(epoch.result ?? 0)===record.epoch;
          if(!current)return;
          root.TALibraryDB.touchWork(tx);
          // A merge can combine two full archives. Keep that larger window on subsequent saves.
          const count=table.count();
          count.onsuccess=()=>{
            const capacity=Math.max(limit,count.result);
            table.put(row);
            const keys=table.index('startedAt').getAllKeys();
            keys.onsuccess=()=>{
              kept=keys.result.slice(-capacity);
              for(const id of keys.result.slice(0,Math.max(0,keys.result.length-capacity)))table.delete(id);
            };
          };
        };
        tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
      });
      if(current && record.epoch===generation){
        saved.set(row.id,row);
        const currentIds=new Set(kept);
        for(const id of saved.keys())if(!currentIds.has(id))saved.delete(id);
        delete record.archiveWarning;
      }
    }catch(_){record.archiveWarning='原始正文只保留在当前窗口，请复制后再关闭。';}
  }
  function reset(epoch){generation=epoch ?? generation+1;saved.clear();}
  root.TACreationRecords={load,save,history,reset,replace,portable,sourceKey,isWork,epoch:()=>generation};
})(globalThis);
