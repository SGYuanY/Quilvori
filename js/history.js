/* IndexedDB snapshots are scoped to a single character or world book. */
(function (root) {
  'use strict';
  const collections = new Set(['characters','worldBooks']);
  const idFor = (kind,id) => JSON.stringify([kind,id]);
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  function database() {
    const db = root.TALibraryDB?.database();
    if (!db) throw new Error('版本库存储不可用');
    return db;
  }
  const tables = ['versions','versionInfo','versionLimits'];
  const read = req => new Promise((resolve,reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const conflict = () => new Error('资料库已变化，请重新打开。');
  function summary(row,seq) {
    return {seq,entity:row.entity,kind:row.kind,id:row.id,name:row.value?.name || '',time:row.time,label:row.label,reason:row.reason,
      bytes:new TextEncoder().encode(JSON.stringify(row.value)).byteLength};
  }
  function remove(tx,keys) {
    for (const seq of keys) {
      tx.objectStore('versions').delete(seq);
      tx.objectStore('versionInfo').delete(seq);
    }
  }
  function append(tx,rows,prune=true) {
    const versions=tx.objectStore('versions'),info=tx.objectStore('versionInfo');
    for (const row of rows) {
      const entry=summary(row);
      const add=versions.add(row);
      add.onsuccess=()=>{entry.seq=add.result;info.put(entry);};
    }
    if(!prune)return;
    for (const entity of new Set(rows.map(row=>row.entity))) {
      const policy=tx.objectStore('versionLimits').get(entity);
      policy.onsuccess=()=>{
        if (!policy.result) return;
        const all=versions.index('entity').getAllKeys(entity);
        all.onsuccess=()=>remove(tx,all.result.slice(0,Math.max(0,all.result.length-policy.result)));
      };
    }
  }
  function guardedWrite(action) {
    const expected=root.TALibraryDB.revision();
    return new Promise((resolve,reject)=>{
      const tx=database().transaction(['library',...tables],'readwrite');
      let failure;
      const abort=error=>{failure=error;tx.abort();};
      const head=tx.objectStore('library').get('current');
      head.onsuccess=()=>{
        if (head.result?.seq!==expected) {abort(conflict());return;}
        try {root.TALibraryDB.touchWork(tx);action(tx,abort);} catch(error){abort(error);}
      };
      tx.oncomplete=resolve;
      tx.onabort=()=>reject(failure || tx.error || new Error('版本库存储不可用'));
    });
  }
  async function inventory(kind,id) {
    const entity=idFor(kind,id);
    const tx=database().transaction(['versionInfo','versionLimits']);
    const [rows,limit]=await Promise.all([read(tx.objectStore('versionInfo').index('entity').getAll(entity)),
      read(tx.objectStore('versionLimits').get(entity))]);
    rows.reverse();
    return {entity,rows,limit:limit ?? null,bytes:rows.reduce((total,row)=>total+row.bytes,0)};
  }
  async function overview() {
    const rows=await read(database().transaction('versionInfo').objectStore('versionInfo').getAll());
    const works=new Map();
    let bytes=0;
    for (const row of rows) {
      if (!works.has(row.entity)) works.set(row.entity,{entity:row.entity,kind:row.kind,id:row.id,count:0,bytes:0,name:''});
      const work=works.get(row.entity);
      work.count++;work.bytes+=row.bytes;work.name=row.name || work.name;bytes+=row.bytes;
    }
    return {works:[...works.values()].sort((a,b)=>b.bytes-a.bytes),count:rows.length,bytes};
  }
  function cleanupPlan(source,limit,clear=false) {
    if (limit!==null && !(Number.isSafeInteger(limit) && limit>=1)) throw new Error('请输入正整数');
    const expired=clear ? source.rows : limit===null ? [] : source.rows.slice(limit);
    return {entity:source.entity,expected:source.rows.map(row=>row.seq),previousLimit:source.limit,
      limit:clear ? source.limit : limit,remove:expired.map(row=>row.seq),bytes:expired.reduce((total,row)=>total+row.bytes,0)};
  }
  function clean(plan) {
    return guardedWrite((tx,abort)=>{
      const policies=tx.objectStore('versionLimits');
      const prior=policies.get(plan.entity),ids=tx.objectStore('versions').index('entity').getAllKeys(plan.entity);
      ids.onsuccess=()=>{
        const current=ids.result.reverse();
        const keys=new Set(current);
        // A preview belongs to one work and the exact snapshot list the user reviewed.
        if (!same(current,plan.expected) || (prior.result ?? null)!==plan.previousLimit ||
          plan.remove.some(id=>!keys.has(id))) {abort(conflict());return;}
        remove(tx,plan.remove);
        if (plan.limit===null) policies.delete(plan.entity);
        else policies.put(plan.limit,plan.entity);
      };
    });
  }
  function version(kind, item, reason, label = '') {
    if (!collections.has(kind) || item?.id==null) throw new Error('请选择要保存的作品');
    return {entity:idFor(kind,item.id), kind, id:item.id, reason, label, time:Date.now(), value:structuredClone(item)};
  }
  async function list(kind,id) {
    const db = await database();
    return new Promise((resolve,reject) => {
      const request = db.transaction('versions').objectStore('versions').index('entity').getAll(idFor(kind,id));
      request.onsuccess = () => resolve(request.result.reverse());
      request.onerror = () => reject(request.error);
    });
  }
  function diff(before, after) {
    const changes = [];
    function fields(a,b,prefix='') {
      for (const key of new Set([...Object.keys(a),...Object.keys(b)])) {
        if (['entries','id','updatedAt'].includes(key) || same(a[key],b[key])) continue;
        changes.push({path:prefix+key, before:a[key], after:b[key]});
      }
    }
    fields(before,after);
    if (before.entries || after.entries) {
      const old = new Map((before.entries || []).map(e=>[e.id,e])), current = new Map((after.entries || []).map(e=>[e.id,e]));
      for (const id of new Set([...old.keys(),...current.keys()])) {
        const a=old.get(id), b=current.get(id), label=(b?.comment || a?.comment || id);
        if (!a || !b) changes.push({path:label, before:a, after:b});
        else fields(a,b,label+' / ');
      }
      if (!same([...old.keys()].filter(k=>current.has(k)),[...current.keys()].filter(k=>old.has(k)))) {
        changes.push({path:'条目顺序',before:[...old.values()].map(e=>e.comment || e.id),after:[...current.values()].map(e=>e.comment || e.id)});
      }
    }
    return changes;
  }
  // Discrete work edits and their snapshots share the same library transaction.
  // Legacy storage still supports manual writes. AI adoption and rollback keep
  // their existing requirement for durable version history.
  function commitWorks(next, targets, {reason, historyRequired=false, draft=null, ...options} = {}) {
    const history = reason && targets.length && (historyRequired ? database() : root.TALibraryDB?.database());
    const rows=[], seen=new Set();
    for (const [kind,expected] of targets) {
      if (!collections.has(kind) || expected?.id == null) throw conflict();
      const live=root.TAStore.byId(root.TAUI.state.lib[kind],expected.id);
      if (!live || live.id !== expected.id || (live !== expected && !same(live,expected))) throw conflict();
      const key=idFor(kind,live.id);
      if (history && !seen.has(key)) { rows.push(version(kind,live,reason)); seen.add(key); }
    }
    return root.TAUI.commitLibrary(next,rows,false,draft,options);
  }
  async function apply(plan, keys, reason = 'AI 改稿前') {
    const ui = root.TAUI, ai = root.NIJANAI;
    const chosen = plan.operations.filter(op => !op.applied && (!keys || keys.includes(op.key)));
    const targets = new Map();
    for (const op of chosen) {
      const kind = op.path[0];
      if (!collections.has(kind) || op.kind === 'add') continue;
      const item = ui.state.lib[kind].find(item=>item.id===op.id);
      if (item) targets.set(idFor(kind,item.id),[kind,item]);
    }
    const works = [...targets.values()];
    const scoped=chosen.length && chosen.every(op=>op.kind==='set' && op.path.length===1 && op.id!=null && targets.has(idFor(op.path[0],op.id)));
    const next=scoped ? {...ui.state.lib} : structuredClone(ui.state.lib);
    if (scoped) {
      for (const kind of new Set(works.map(([kind])=>kind))) {
        next[kind]=next[kind].map(item=>targets.has(idFor(kind,item.id)) ? structuredClone(item) : item);
      }
    }
    const copy=structuredClone(plan),receipt=ai.commit(next,copy,keys);
    const draft=root.TAStudioDrafts?.onAdopt(plan,receipt);
    await commitWorks(next,works,{reason,historyRequired:true,draft,
      scopes:scoped ? works.map(([kind,item])=>[kind,item.id]) : undefined});
    if(draft){delete plan.draftRevision;delete plan.draftSaveError;}
    for (const op of receipt.operations) plan.operations.find(row=>row.key===op.key).applied = true;
    return receipt;
  }
  async function restore(row, expected) {
    if (!collections.has(row.kind) || row.value?.id !== row.id) throw new Error('请选择要保存的作品');
    const current = () => root.TAUI.state.lib[row.kind].find(e=>e.id===row.id);
    if (!same(current(),expected)) throw new Error('资料库已变化，请重新打开。');
    const library=root.TAUI.state.lib;
    const next={...library,[row.kind]:library[row.kind].map(item=>item.id===row.id ? structuredClone(row.value) : item)};
    await commitWorks(next,[[row.kind,expected]],{reason:'回滚前',historyRequired:true,
      scopes:[[row.kind,row.id]],restore:{seq:row.seq,entity:row.entity}});
  }
  root.TAHistory = {tables,summary,append,list,inventory,overview,cleanupPlan,clean,diff,apply,restore,commitWorks,
    get:seq=>read(database().transaction('versions').objectStore('versions').get(seq)),
    save:(kind,item,label)=>{
      const snapshot=version(kind,item,'手动快照',label);
      return guardedWrite((tx,abort)=>{
        if (!root.TAUI.state.lib[kind].some(row=>row.id===item.id)) {abort(conflict());return;}
        append(tx,[snapshot]);
      });
    }};
})(globalThis);
