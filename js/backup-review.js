/* Build a read-only merge preview from the same keyed merge used to import a backup. */
(function(root) {
  'use strict';
  const store=()=>root.TAStore, clone=value=>structuredClone(value);
  const object=value=>value!==null && typeof value==='object' && !Array.isArray(value);
  const own=(value,key)=>Object.hasOwn(value,key);
  const workOrigins=['creationSource','creationRecordKeys','creationPeerKeys'];
  function copyOrigins(target,owner,related){
    for(const field of workOrigins){
      if(own(owner,field))target[field]=clone(owner[field]);else delete target[field];
    }
    const local=target.creationRecordKeys, incoming=related?.creationRecordKeys;
    if(Array.isArray(local) && Array.isArray(incoming) && incoming.some(key=>local.includes(key) && root.TAWorkOutcomes.isRecordKey(key))){
      target.creationRecordKeys=[...new Set([...local,...incoming.filter(root.TAWorkOutcomes.isRecordKey)])];
      const peers=related?.creationPeerKeys;
      if(Array.isArray(peers) && (target.creationPeerKeys===undefined || Array.isArray(target.creationPeerKeys))){
        const combined=new Set([...(target.creationPeerKeys || []),...peers.filter(root.TAWorkOutcomes.isRecordKey)]);
        if(combined.size)target.creationPeerKeys=[...combined];
      }
    }
  }
  function equal(a,b) {
    if(a===b) return true;
    if(!a || !b || typeof a!=='object' || typeof b!=='object' || Array.isArray(a)!==Array.isArray(b)) return false;
    const keys=Object.keys(a);
    return keys.length===Object.keys(b).length && keys.every(key=>own(b,key) && equal(a[key],b[key]));
  }
  const typeNames={characters:'角色卡',worldBooks:'世界书',groups:'群组',scripts:'剧本',chats:'聊天',assets:'素材',themes:'主题',
    regexScripts:'正则',quickReplySets:'快捷回复',promptPresets:'提示词',stickerPacks:'表情包','timeline.notes':'剧情手记','timeline.beats':'剧情手记',
    'graph.nodes':'关系图','graph.edges':'关系图'};
  const schema=path=>path.filter(step=>typeof step==='string').map(key=>key.includes('.')?JSON.stringify([key]):key).join('.');
  const rowKey=(row,by)=>store().mergeRowKey(row,by);
  function selector(by,row) {return {by,key:rowKey(row,by)};}
  function resolve(value,path) {
    for(const step of path) {
      if(typeof step==='object' && step.by) value=value.find(row=>rowKey(row,step.by)===step.key);
      else if(typeof step==='object') value=value[step.index];
      else value=value[step];
    }
    return value;
  }
  function assign(value,path,newValue) {
    const node=resolve(value,path.slice(0,-1)),last=path.at(-1);
    const key=typeof last==='object' ? last.by?node.findIndex(row=>rowKey(row,last.by)===last.key):last.index : last;
    Object.defineProperty(node,key,{enumerable:true,configurable:true,writable:true,value:newValue});
  }
  function label(row) {
    return [row.name,row.scriptName,row.title,row.comment,row.label,row.id,row.characterId]
      .find(v=>(typeof v==='string' && v) || typeof v==='number');
  }
  function listKey(kind,a,b) {
    const by=store().mergeKeyType(kind);
    if(by==='extensionId' && (!a.every(row=>rowKey(row,by)!==undefined) || !b.every(row=>rowKey(row,by)!==undefined)))return null;
    return by;
  }
  function plan(local,incoming) {
    const current=store().verify(structuredClone(local)), source=clone(incoming), divergent=new Set();
    const proposed=store().merge(current,source,{divergedChats:divergent}),conflicts=[];
    // An ID collision does not make a handwritten work the destination of another device's request.
    for(const kind of ['characters','worldBooks']){
      const localById=new Map(current[kind].map(row=>[store().idKey(row.id),row]));
      const incomingById=new Map((source[kind] || []).map(row=>[store().idKey(row.id),row]));
      for(const row of proposed[kind]){
        const key=store().idKey(row.id),original=localById.get(key);
        if(original)copyOrigins(row,original,incomingById.get(key));
      }
    }
    // Save timestamps describe writes on this device and are never choices in a content merge.
    proposed.meta.updatedAt=current.meta.updatedAt;
    function add(path,names,owner,before,after,kind='value',by=null) {
      conflicts.push({key:JSON.stringify([kind,path]),path,names,owner,before,after,kind,by});
    }
    function walk(a,b,path,names,owner) {
      if(equal(a,b))return;
      if(Array.isArray(a) && Array.isArray(b)) {
        const kind=schema(path);
        if(kind==='chats.messages') {
          for(let i=0;i<Math.min(a.length,b.length);i++) walk(a[i],b[i],[...path,{index:i}],[...names,'#'+(i+1)],owner);
          return;
        }
        const by=listKey(kind,a,b);
        if(!by) {add(path,names,owner,a,b);return;}
        const old=new Map(a.map(row=>[rowKey(row,by),row]));
        const next=new Map(b.map(row=>[rowKey(row,by),row]));
        const oldOrder=[...old.keys()].filter(key=>next.has(key)),nextOrder=[...next.keys()].filter(key=>old.has(key));
        if(!equal(oldOrder,nextOrder)) add(path,[...names,'顺序'],owner,oldOrder,nextOrder,'order',by);
        for (const row of b) {
          const step=selector(by,row);
          if(!old.has(step.key))continue;
          const before=old.get(step.key),where=[...path,step],address=[...names,String(label(before) || '#'+(a.indexOf(before)+1))];
          const work=owner || (own(typeNames,kind)?{collection:kind,path:where,id:before.id,label:String(label(before) || before.id)}:null);
          walk(before,row,where,address,work);
        }
      } else if(object(a) && object(b)) {
        const branched=owner?.collection==='chats' && owner.path.length===path.length && divergent.has(String(owner.id));
        if(branched) add(path,[...names,'消息与书签'],owner,{messages:a.messages,bookmarks:a.bookmarks},{messages:b.messages,bookmarks:b.bookmarks},'chat');
        for(const key of Object.keys(a)) {
          if(!own(b,key) || (branched && ['messages','bookmarks'].includes(key)))continue;
          if(owner?.path.length===path.length && ['characters','worldBooks'].includes(owner.collection) && workOrigins.includes(key))continue;
          const next=[...path,key],type=schema(next);
          walk(a[key],b[key],next,[...names,own(typeNames,type)?typeNames[type]:key],owner);
        }
      } else add(path,names,owner,a,b);
    }
    walk(current,proposed,[],[],null);
    return {current,proposed,incoming:source,conflicts};
  }

  function chooseValue(lib,c,value) {
    if(c.kind==='chat') {Object.assign(resolve(lib,c.path),clone(value));return;}
    if(c.kind==='order') {
      const rows=resolve(lib,c.path), byKey=new Map(rows.map(row=>[rowKey(row,c.by),row]));
      // Leave records exclusive to either version in place when reordering shared siblings.
      const seq=value.filter(key=>byKey.has(key)).map(key=>byKey.get(key)), positions=new Set(value);
      let index=0;
      assign(lib,c.path,rows.map(row=>positions.has(rowKey(row,c.by))?seq[index++]:row));
      return;
    }
    assign(lib,c.path,clone(value));
  }

  function apply(preview,choices,live=preview.current,copies=new Map()) {
    const active=live===preview.current?preview:plan(live,preview.incoming);
    const initial=new Map(preview.conflicts.map(c=>[c.key,c])),chosen=new Set();
    const result=clone(active.proposed),works=new Map();
    for(const c of active.conflicts) if(c.owner && choices.get(c.key)==='copy')works.set(JSON.stringify(c.owner.path),c.owner);
    // Keep the local work intact, including its exact membership and order. The user
    // may explicitly accept other backup fields on that same work in the same preview.
    for(const work of works.values())assign(result,work.path,clone(resolve(active.current,work.path)));
    for(const c of active.conflicts) {
      const old=initial.get(c.key);
      if(!old || !equal(c.before,old.before) || !equal(c.after,old.after))throw new Error('资料库已变化，请重新打开。');
      const choice=choices.get(c.key) || 'keep';
      if(!['keep','backup','copy'].includes(choice))throw new Error('存档结构无效');
      chosen.add(c.key);
      const split=c.owner && works.has(JSON.stringify(c.owner.path));
      if(split) {
        if(choice==='backup')chooseValue(result,c,c.after);
      } else if(choice!=='backup')chooseValue(result,c,c.before);
      if(choice==='copy') {
        if(!c.owner) {
          if(!own(result,'backupAlternatives'))result.backupAlternatives=[];
          if(!Array.isArray(result.backupAlternatives))throw new Error('存档结构无效 (backupAlternatives)');
          result.backupAlternatives.push({id:store().uid('alternative'),address:c.names,value:clone(c.after)});
        }
      }
    }
    for(const old of preview.conflicts) if(!chosen.has(old.key)) {
      const choice=choices.get(old.key) || 'keep';
      if(choice==='copy')throw new Error('资料库已变化，请重新打开。');
      if(choice==='backup') {
        let value;
        try {value=resolve(active.current,old.path);} catch(_) {}
        if(old.kind==='chat' && value)value={messages:value.messages,bookmarks:value.bookmarks};
        if(old.kind==='order' && Array.isArray(value))value=value.map(row=>rowKey(row,old.by)).filter(key=>old.after.includes(key));
        if(!equal(value,old.after))throw new Error('资料库已变化，请重新打开。');
      }
      // A locally removed work must not be silently recreated from the backup.
      if(old.owner) {
        let liveWork;
        try {liveWork=resolve(active.current,old.owner.path);} catch(_) {}
        if(!liveWork)throw new Error('资料库已变化，请重新打开。');
      }
    }
    for(const work of works.values()) {
      const path=work.path.slice(0,-1),rows=resolve(result,path),merged=resolve(active.proposed,work.path);
      const source=resolve(active.incoming,work.path);
      // A full backup copy keeps its own nested membership and order. For a partial
      // legacy record, retain fields the incoming work did not supply at all.
      const duplicate=clone({...merged,...source});
      if(['characters','worldBooks'].includes(work.collection))copyOrigins(duplicate,source);
      let newId;do {newId=store().uid('copy');}while(rows.some(row=>String(row.id)===newId));
      duplicate.id=newId;duplicate.backupCopyOf=work.id;
      duplicate.backupCopyIndex=1+rows.reduce((max,row)=>String(row.backupCopyOf)===String(work.id)
        ?Math.max(max,Number.isSafeInteger(row.backupCopyIndex)?row.backupCopyIndex:1):max,0);
      rows.push(duplicate);
      if(!copies.has(work.collection))copies.set(work.collection,new Map());
      copies.get(work.collection).set(String(work.id),newId);
    }
    if(copies.size)store().remapBackupReferences(result,active.current,copies);
    return store().verify(result);
  }
  root.TABackupReview={plan,apply,typeNames};
})(globalThis);
