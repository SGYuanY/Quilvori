/* Portable working state. Database revision numbers, local credentials and file selections belong to the device. */
(function(root){
  'use strict';
  const collections={'create:character':'characters','create:world':'worldBooks'};
  const kinds=new Set(Object.values(collections));
  const own=(x,k)=>Object.hasOwn(x,k);
  const object=x=>x!==null && typeof x==='object' && !Array.isArray(x);
  const text=x=>typeof x==='string';
  const id=x=>(text(x)&&x.trim()!=='')||Number.isSafeInteger(x);
  const fail=path=>{throw new Error((root.TAI18n?.t('工作状态备份内容无效') || '工作状态备份内容无效')+' ('+path+')');};
  const only=(value,keys)=>Object.fromEntries(keys.filter(key=>own(value,key)).map(key=>[key,structuredClone(value[key])]));
  const entity=(kind,id)=>JSON.stringify([kind,id]);
  const groupKey=p=>p.batchId+'|'+p.task;
  const stable=x=>Array.isArray(x)?x.map(stable):object(x)?Object.fromEntries(Object.keys(x).sort().map(key=>[key,stable(x[key])])):x;
  const signature=x=>JSON.stringify(stable(x));
  const equal=(a,b)=>signature(a)===signature(b);
  // A backup may contain two deliberately identical snapshots. Match their counts,
  // ignoring the database sequence and entity index that belong to this device.
  function missingVersions(existing,incoming) {
    const key=row=>signature([row.kind,row.id,row.time,row.reason,row.label??'',row.value]);
    const counts=new Map();
    for(const row of existing){
      const id=key(row);counts.set(id,(counts.get(id)||0)+1);
    }
    return incoming.filter(row=>{
      const id=key(row),left=counts.get(id)||0;
      if(!left)return true;
      counts.set(id,left-1);return false;
    });
  }
  const all=['drafts','versions','limits','records'];
  function unique(list,key,path) {
    const keys=new Set();
    for (const row of list) {const value=key(row);if(keys.has(value))fail(path);keys.add(value);}
  }
  function item(kind,value,path) {
    if (!kinds.has(kind)||!object(value)||!id(value.id))fail(path);
    root.TAStore.verify({[kind]:[value]});
    return structuredClone(value);
  }
  function draft(raw) {
    if(!object(raw)||!object(raw.plan)||!Number.isFinite(raw.time))fail('drafts');
    const p=raw.plan,kind=collections[p.task],op=p.operations?.[0];
    if(!own(collections,p.task)||!text(p.id)||!p.id||!text(p.batchId)||!p.batchId||
      !Array.isArray(p.operations)||p.operations.length!==1||op?.kind!=='add'||op.applied||
      !Array.isArray(op.path)||op.path.length!==1||op.path[0]!==kind||!text(op.key)||!op.key)fail('draft.plan');
    const work=item(kind,op.value,'draft.work'),module=p.task.slice(7);
    const plan=only(p,['id','batchId','task','request','createdAt','scope','sourceKey']);
    for(const field of ['request','scope','sourceKey'])if(own(plan,field)&&!text(plan[field]))fail('draft.'+field);
    plan.operations=[{key:op.key,kind:'add',path:[kind],value:work,label:text(op.label)?op.label:String(work.name||'')}];
    if(p.result!=null && (!object(p.result)||!object(p.result[module])))fail('draft.result');
    plan.result=p.result ? {[module]:structuredClone(p.result[module])} :
      {[module]:kind==='characters'?only(work,Object.keys(root.NIJANAI.CARD_FIELDS)):{name:work.name,entries:structuredClone(work.entries||[])}};
    if(kind==='worldBooks' && (!Array.isArray(plan.result.world.entries)||!plan.result.world.entries.every(object)))fail('draft.result.entries');
    if(p.creationInput!=null){
      if(!object(p.creationInput)||!Array.isArray(p.creationInput.modules)||!p.creationInput.modules.every(m=>text(m)&&own(root.NIJANAI.MODULES,m)))fail('draft.creationInput.modules');
      const input=only(p.creationInput,['brief','modules','questions','answers','ideas','cardId','bookId']);
      if(own(input,'brief')&&!text(input.brief))fail('draft.brief');
      for(const k of ['cardId','bookId'])if(input[k]!=null && input[k]!=='' && !id(input[k]))fail('draft.'+k);
      if(input.questions!=null && (!Array.isArray(input.questions)||!input.questions.every(text)))fail('draft.questions');
      for(const key of ['answers','ideas'])if(input[key]!=null&&(!Array.isArray(input[key])||
        !input[key].every(v=>object(v) && (key==='answers'?text(v.question)&&text(v.answer):text(v.text)))))fail('draft.'+key);
      plan.creationInput=input;
    }
    if(p.draftDiff!=null){
      if(!Array.isArray(p.draftDiff)||!p.draftDiff.every(object))fail('draft.draftDiff');
      plan.draftDiff=p.draftDiff.map(op=>only(op,['key','kind','path','id','entryId','field','before','after','label','group']));
    }
    return {time:raw.time,plan};
  }
  function snapshot(row) {
    if(!object(row)||!kinds.has(row.kind)||!id(row.id)||row.value?.id!==row.id||!Number.isFinite(row.time)||
      !text(row.reason)||!text(row.label??''))fail('versions');
    return {kind:row.kind,id:row.id,time:row.time,reason:row.reason,label:row.label??'',value:item(row.kind,row.value,'snapshot.value')};
  }
  function limit(row) {
    if(!object(row)||!kinds.has(row.kind)||!id(row.id)||!Number.isSafeInteger(row.keep)||row.keep<1)fail('limits');
    return {kind:row.kind,id:row.id,keep:row.keep};
  }
  function record(raw) {
    if(!object(raw)||!own(collections,raw.task)||!text(raw.id)||!raw.id||!text(raw.output)||!text(raw.startedAt))fail('records');
    if(!raw.output && (!['error','cancelled'].includes(raw.status)||!['empty','reasoning'].includes(raw.emptyReason)))fail('record.output');
    const row=root.TACreationRecords.portable(raw);
    for(const k of ['label','model','finishedAt','status','error','errorCode','sourceKey','workOrigin','workBatch','workRun','workBrief','reasoningEffort']){
      if(row[k]!=null&&!text(row[k]))fail('record.'+k);
    }
    for(const key of ['workKinds','workSelection','failedDraftKinds']){
      if(row[key]!=null&&(!Array.isArray(row[key])||!row[key].every(kind=>kind==='character'||kind==='world')))fail('record.'+key);
    }
    if(row.bytesReceived!=null&&(!Number.isSafeInteger(row.bytesReceived)||row.bytesReceived<0))fail('record.bytesReceived');
    return row;
  }
  function normalize(input) {
    if(!object(input)||!all.every(key=>Array.isArray(input[key])))fail('workState');
    const state={drafts:input.drafts.map(draft),versions:input.versions.map(snapshot),limits:input.limits.map(limit),records:input.records.map(record)};
    unique(state.drafts,d=>groupKey(d.plan),'draft.batch');unique(state.drafts,d=>d.plan.id,'draft.id');
    unique(state.drafts,d=>entity(collections[d.plan.task],String(d.plan.operations[0].value.id)),'draft.work.id');
    unique(state.limits,row=>entity(row.kind,row.id),'limits');unique(state.records,r=>r.id,'records');
    return state;
  }
  function remapWork(row,kind,maps) {
    const ref=(collection,value)=>maps.get(collection)?.get(String(value))??value;
    function prop(obj,k,collection){if(obj && obj[k]!=null)obj[k]=ref(collection,obj[k]);}
    if(kind==='characters'){
      prop(row,'embeddedBookId','worldBooks');prop(row.source,'embeddedBookId','worldBooks');prop(row,'avatarAssetId','assets');
      if(Array.isArray(row.expressionAssetIds))row.expressionAssetIds=row.expressionAssetIds.map(v=>ref('assets',v));
    }else prop(row,'coverAssetId','assets');
    prop(row,'stickerPackId','stickerPacks');
  }
  function merge(local,incoming,library,maps=new Map()) {
    const out=structuredClone(local), copies=[], batchMap=new Map();
    const keyName=(id,n)=>n===0?id:String(id)+'~backup'+(n===1?'':n);
    function available(id,used) {
      let n=0;while(used.has(String(keyName(id,n))))n++;
      return keyName(id,n);
    }
    // A published work added by the incoming library must not make an existing pending draft disappear.
    for(const d of out.drafts){
      const p=d.plan,kind=collections[p.task],work=p.operations[0].value;
      if(!library[kind].some(item=>String(item.id)===String(work.id)))continue;
      const taken=new Set(library[kind].map(item=>String(item.id)));
      for(const other of out.drafts)if(other!==d && collections[other.plan.task]===kind)taken.add(String(other.plan.operations[0].value.id));
      const old=work.id;work.id=available(old,taken);
      for(const diff of p.draftDiff || [])if(diff.id===old)diff.id=work.id;
      copies.push(work.name || p.id);
    }
    // Conflict aliases are stable across retries. Compare a candidate with its actual
    // stored contents before deciding whether to reuse its slot or allocate a new one.
    const groups=new Map();
    for(const d of incoming.drafts){
      if(!groups.has(d.plan.batchId))groups.set(d.plan.batchId,[]);
      groups.get(d.plan.batchId).push(d);
    }
    const byKey=new Map(out.drafts.map(d=>[groupKey(d.plan),d]));
    for(const [batch,group] of groups){
      function project(name) {
        const projected=[];
        for(const source of group) {
          const d=structuredClone(source),p=d.plan,kind=collections[p.task],w=p.operations[0].value;
          p.batchId=name;
          if(p.scope==='create:'+batch+':'+p.task.slice(7))p.scope='create:'+name+':'+p.task.slice(7);
          const old=byKey.get(groupKey(p));
          const others=[...out.drafts.filter(x=>x!==old),...projected];
          p.id=available(p.id,new Set(others.map(x=>x.plan.id)));
          p.operations[0].key=available(p.operations[0].key,new Set(others.map(x=>x.plan.operations[0].key)));
          const occupied=new Set(library[kind].map(x=>String(x.id)));
          for(const row of others)if(collections[row.plan.task]===kind)occupied.add(String(row.plan.operations[0].value.id));
          const initial=w.id;
          w.id=available(w.id,occupied);remapWork(w,kind,maps);
          if(w.id!==initial && p.draftDiff)for(const diff of p.draftDiff)if(diff.id===initial)diff.id=w.id;
          if(p.creationInput)for(const [k,bucket] of [['cardId','characters'],['bookId','worldBooks']]){
            const value=p.creationInput[k];if(value!=null)p.creationInput[k]=maps.get(bucket)?.get(String(value))??value;
          }
          projected.push(d);
        }
        return projected;
      }
      const occupiedBatches=new Set(out.drafts.map(row=>row.plan.batchId));
      // Prefer a matching existing import even when its original slot was subsequently vacated.
      const aliases=[batch,...[...occupiedBatches].filter(name=>name.startsWith(batch+'~backup'))];
      let selected;
      for(const name of aliases) {
        const next=project(name),known=next.map(d=>byKey.get(groupKey(d.plan)));
        if(known.some(Boolean) && known.every((row,i)=>!row || equal(row,next[i]))) {selected=next;break;}
      }
      if(!selected){
        const next=project(batch);
        selected=next.every(d=>!byKey.has(groupKey(d.plan))) ? next : project(available(batch,occupiedBatches));
      }
      batchMap.set(batch,selected[0].plan.batchId);
      for(let i=0;i<selected.length;i++){
        const row=selected[i],p=row.plan;
        if(byKey.has(groupKey(p)))continue;
        if(p.batchId!==batch || p.id!==group[i].plan.id || p.operations[0].value.id!==group[i].plan.operations[0].value.id)copies.push(p.operations[0].value.name||p.id);
        out.drafts.push(row);byKey.set(groupKey(p),row);
      }
    }

    const byRecord=new Map(out.records.map(r=>[r.id,r]));
    for(const source of incoming.records) {
      const row=structuredClone(source);
      if(batchMap.has(row.workBatch))row.workBatch=batchMap.get(row.workBatch);
      const asId=id=>id===row.id ? row : {...row,id,workOrigin:row.workOrigin || row.id};
      const sameAt=id=>{
        const known=byRecord.get(id);
        return known && (equal(known,asId(id)) || (!known.workOrigin && !row.workOrigin && equal(known,{...row,id})));
      };
      if(sameAt(row.id) || [...byRecord.keys()].some(id=>id.startsWith(row.id+'~backup') && sameAt(id)))continue;
      const name=available(row.id,new Set(byRecord.keys()));
      if(name!==row.id)copies.push(row.label || row.id);
      const added=asId(name);out.records.push(added);byRecord.set(name,added);
    }

    const target=(kind,id)=>maps.get(kind)?.get(String(id))??id;
    const incomingVersions=incoming.versions.map(source=>{
      const row=structuredClone(source);row.id=target(row.kind,row.id);row.value.id=row.id;
      remapWork(row.value,row.kind,maps);
      return row;
    });
    for(const row of missingVersions(out.versions,incomingVersions))out.versions.push(row);
    out.versions.sort((a,b)=>a.time-b.time);
    const sourceEntities=(versions,limits)=>new Set([...versions,...limits].map(v=>entity(v.kind,v.id)));
    const localEntities=sourceEntities(local.versions,local.limits);
    const left=new Map(local.limits.map(v=>[entity(v.kind,v.id),v.keep]));
    const incomingLimits=incoming.limits.map(v=>({...v,id:target(v.kind,v.id)}));
    const incomingEntities=sourceEntities(incomingVersions,incomingLimits);
    const right=new Map(incomingLimits.map(v=>[entity(v.kind,v.id),v.keep]));
    const total=new Map();
    for(const v of out.versions){const key=entity(v.kind,v.id);total.set(key,(total.get(key)||0)+1);}
    out.limits=[];
    for(const key of new Set([...left.keys(),...right.keys()])){
      if((localEntities.has(key)&&!left.has(key)) || (incomingEntities.has(key)&&!right.has(key)))continue;
      const [kind,id]=JSON.parse(key);
      out.limits.push({kind,id,keep:Math.max(left.get(key)||0,right.get(key)||0,total.get(key)||0)});
    }
    return {state:out,copies};
  }
  function materialize(state) {
    return {
      drafts:state.drafts.map(d=>{const plan=structuredClone(d.plan),revision=root.TAStore.uid('draftrev');plan.draftRevision=revision;
        return {id:groupKey(plan),time:d.time,revision,plan};}),
      versions:state.versions.map(v=>({...v,entity:entity(v.kind,v.id)})),
      limits:state.limits.map(v=>({key:entity(v.kind,v.id),keep:v.keep})),
      records:state.records,
    };
  }
  function transfer(baseline,state,mode){
    return {expected:baseline.token,data:materialize(state),epoch:root.TAStore.uid('restore'),mode};
  }
  root.TAWorkBackup={normalize,merge,transfer,readSnapshot:snapshot,missingVersions};
})(globalThis);
