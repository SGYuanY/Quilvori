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
  async function write(rows) {
    if (!rows.length) return;
    const db = await database();
    await new Promise((resolve,reject) => {
      const tx = db.transaction('versions','readwrite'), table = tx.objectStore('versions');
      tx.oncomplete = resolve;
      tx.onabort = () => reject(tx.error || new Error('版本库存储不可用'));
      for (const row of rows) table.add(row);
    });
  }
  function version(kind, item, reason, label = '') {
    if (!collections.has(kind) || !item?.id) throw new Error('请选择要保存的作品');
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
  function publish(next,rows,draft=null) {
    if (rows.length) database();
    return root.TAUI.commitLibrary(next,rows,false,draft);
  }
  async function apply(plan, keys, reason = 'AI 改稿前') {
    const ui = root.TAUI, ai = root.NIJANAI;
    const chosen = plan.operations.filter(op => !op.applied && (!keys || keys.includes(op.key)));
    const targets = new Map();
    for (const op of chosen) {
      const kind = op.path[0];
      if (!collections.has(kind) || op.kind === 'add') continue;
      const item = ui.state.lib[kind].find(item=>item.id===op.id);
      if (item) targets.set(idFor(kind,item.id),version(kind,item,reason));
    }
    const snapshots = [...targets.values()];
    const next = structuredClone(ui.state.lib), copy = structuredClone(plan), receipt = ai.commit(next,copy,keys);
    const draft=root.TAStudioDrafts?.onAdopt(plan,receipt);
    await publish(next,snapshots,draft);
    if(draft){delete plan.draftRevision;delete plan.draftSaveError;}
    for (const op of receipt.operations) plan.operations.find(row=>row.key===op.key).applied = true;
    return receipt;
  }
  async function restore(row, expected) {
    if (!collections.has(row.kind) || row.value?.id !== row.id) throw new Error('请选择要保存的作品');
    const current = () => root.TAUI.state.lib[row.kind].find(e=>e.id===row.id);
    if (!same(current(),expected)) throw new Error('资料库已变化，请重新打开。');
    const snapshots = [version(row.kind,expected,'回滚前')];
    const next = structuredClone(root.TAUI.state.lib);
    next[row.kind][next[row.kind].findIndex(e=>e.id===row.id)] = structuredClone(row.value);
    await publish(next,snapshots);
  }
  root.TAHistory = { list, diff, apply, restore, save:(kind,item,label) => write([version(kind,item,'手动快照',label)]) };
})(globalThis);
