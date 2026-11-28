/* Scoped, reversible removals. Paths identify stable records, including group members. */
(function(root) {
  'use strict';
  const copy = value => structuredClone(value);
  const store = typeof module !== 'undefined' && module.exports ? require('./store') : root.TAStore;
  const eqId = store.sameId;
  const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  const match = (key,value) => ({key,value});
  const id = value => match('id',value);
  const stale = () => { throw new Error('资料库已变化，请重新打开。'); };
  function at(value,path) {
    for(const step of path) {
      if (typeof step === 'object') value = Array.isArray(value) ? value.find(row => eqId(row[step.key],step.value)) : undefined;
      else value = value != null && Object.hasOwn(value,step) ? value[step] : undefined;
    }
    return value;
  }
  function fields(row,keys) {
    return Object.fromEntries(keys.filter(k=>Object.hasOwn(row,k)).map(k=>[k,copy(row[k])]));
  }
  const types = {characters:'角色卡',worldBooks:'世界书',chats:'聊天',groups:'群组',regexScripts:'正则',quickReplySets:'快捷回复',scripts:'剧本',promptPresets:'提示词',assets:'素材'};
  function dependencies(lib,collection,target) {
    const refs=[];
    function add(type,path,location,keys,active=true) {
      refs.push({type,path,location,keys,active});
    }
    if(collection==='assets') {
      for(const card of lib.characters || []) {
        const path=['characters',id(card.id)], name=card.name || card.id;
        if(eqId(card.avatarAssetId,target)) add('avatar',path,['角色头像',name],['avatarAssetId']);
        if((card.expressionAssetIds || []).some(value=>eqId(value,target))) add('expressions',path,['角色表情',name],['expressionAssetIds']);
      }
      for(const book of lib.worldBooks || []) if(eqId(book.coverAssetId,target))
        add('bookCover',['worldBooks',id(book.id)],['世界书封面',book.name || book.id],['coverAssetId']);
      if(eqId(lib.settings?.chatBackgroundAssetId,target)) add('chatBackground',['settings'],['聊天背景'],['chatBackgroundAssetId']);
      for(const theme of lib.themes || []) if(eqId(theme.backgroundAssetId,target))
        add('themeBackground',['themes',id(theme.id)],['主题壁纸',theme.name || theme.id],['backgroundAssetId']);
    }
    if (collection==='characters') {
      for(const group of lib.groups || []) for(const member of group.members || []) if(eqId(member.characterId,target))
        add('member',['groups',id(group.id),'members',match('characterId',member.characterId)],['群组',group.name || group.id]);
      for(const script of lib.scripts || []) (script.beats || []).forEach((beat,i)=>{
        if(beat.speaker!=='narrator' && eqId(beat.speaker,target))
          add('speaker',['scripts',id(script.id),'beats',id(beat.id)],['剧本',script.name || script.id,'#'+(i+1)],['speaker','speakerName']);
      });
      for(const node of lib.graph?.nodes || []) if(eqId(node.characterId,target))
        add('node',['graph','nodes',id(node.id)],['关系图',node.label || node.id],['characterId','label']);
    }
    if(collection==='worldBooks') {
      for (const card of lib.characters || []) {
        if(eqId(card.embeddedBookId,target)) add('embedded',['characters',id(card.id)],['角色卡',card.name || card.id],['embeddedBookId']);
        // The source's original pairing is live only while the card has no explicit selection.
        if(eqId(card.source?.embeddedBookId,target)) add('embedded',['characters',id(card.id),'source'],['角色卡',card.name || card.id,'来源'],['embeddedBookId'],card.embeddedBookId==null);
      }
    }
    if(collection==='worldBooks' || collection==='characters') {
      const isCard=collection==='characters',key=isCard?'characterId':'bookId';
      for(const set of lib.quickReplySets || []) if(eqId(set.workSource?.[key],target))
        add(isCard?'replyCard':'replyBook',['quickReplySets',id(set.id),'workSource'],['快捷回复',set.name || set.id],
          isCard?['characterId','characterName']:['bookId','bookName','entryIds']);
    }
    if(collection==='graph.nodes') {
      for(const edge of lib.graph?.edges || []) if(eqId(edge.from,target) || eqId(edge.to,target))
        add('edge',['graph','edges',id(edge.id)],['关系图',edge.label || edge.id],['from','to']);
    }
    if(collection==='stickerPacks') {
      for(const bucket of ['characters','worldBooks']) for(const work of lib[bucket] || []) if(eqId(work.stickerPackId,target))
        add('pack',[bucket,id(work.id)],[types[bucket],work.name || work.id],['stickerPackId']);
    }
    if(collection==='chats') {
      for(const key of ['notes','beats']) for(const note of lib.timeline?.[key] || []) if(eqId(note.chatId,target))
        add('journal',['timeline',key,id(note.id)],['剧情手记',note.title || note.id],['chatId','floor','messageStamp']);
    }
    const folderKind={characters:'cards',worldBooks:'worlds',chats:'chats'}[collection];
    if(folderKind) for(const [key,source] of Object.entries(lib.settings?.folderImports || {})) {
      if(source?.kind===folderKind && eqId(source.id,target))
        add('source',['settings','folderImports'],['文件夹导入',key],[key]);
    }
    return refs;
  }
  // Apply the inverse receipt to a structural copy of its affected paths. A
  // surviving owner may lose a link or regain one through a field in this receipt.
  function undoReferences(lib,operations) {
    const removed=new Map();
    for(const op of operations) if(op.kind==='add') {
      const bucket=op.path.join('.');
      if(!removed.has(bucket))removed.set(bucket,{path:op.path,ids:new Set()});
      removed.get(bucket).ids.add(String(op.value.id));
    }
    if(!removed.size)return [];
    function update(value,path,replace) {
      if(!path.length)return replace(value);
      const [step,...rest]=path;
      const key=typeof step==='string'?step:value.findIndex(row=>eqId(row[step.key],step.value));
      const next=Array.isArray(value)?value.slice():{...value};
      next[key]=update(value[key],rest,replace);
      return next;
    }
    let surviving=lib;
    for(const op of operations.slice().reverse()) if(op.kind==='set') {
      const path=[...op.path];
      if(op.id!=null)path.push(id(op.id));
      if(op.entryId!=null)path.push('entries',id(op.entryId));
      surviving=update(surviving,path,row=>{
        const next={...row,[op.field]:op.before};
        if(op.before===undefined)delete next[op.field];
        return next;
      });
    }
    for(const {path,ids} of removed.values())
      surviving=update(surviving,path,rows=>rows.filter(row=>!ids.has(String(row.id))));
    const refs=[];
    for(const [bucket,{ids}] of removed) for(const target of ids)
      refs.push(...dependencies(surviving,bucket,target).filter(ref=>ref.active));
    return refs;
  }
  function plan(lib,collection,workId) {
    if(!Object.hasOwn(types,collection)) throw new Error('存档结构无效');
    const row=at(lib,[collection,id(workId)]);
    if(!row) stale();
    const refs=dependencies(lib,collection,row.id).map(({keys,...ref})=>{
      const owner=at(lib,ref.path);
      return {...ref,before:keys ? fields(owner,keys) : copy(owner)};
    });
    return {collection,id:row.id,work:copy(row),refs};
  }
  function remove(lib,original,mode='keep',replacementId) {
    const {collection,work,refs}=original,current=plan(lib,collection,original.id);
    if(!same(current.work,work) || !same(current.refs,refs)) stale();
    const replacement=mode==='replace'?at(lib,['characters',id(replacementId)]):null;
    if(!['keep','unlink','replace'].includes(mode) || (mode==='replace' && (!replacement || collection!=='characters' || eqId(replacement.id,work.id)))) stale();
    const next=copy(lib),ops=[];
    function patch(path,keys,updates) {
      const row=at(next,path),before=fields(row,keys);
      for(const key of keys) {
        if(Object.hasOwn(updates,key)) Object.defineProperty(row,key,{enumerable:true,configurable:true,writable:true,value:updates[key]});
        else delete row[key];
      }
      ops.push({path,before,after:fields(row,keys),keys});
    }
    function drop(path,selector) {
      const rows=at(next,path),index=rows.findIndex(row=>eqId(row[selector.key],selector.value));
      if(index<0) stale();
      const before=rows[index-1]?.[selector.key],after=rows[index+1]?.[selector.key], [value]=rows.splice(index,1);
      ops.push({path,selector,before,after,index,value});
    }
    for(const ref of refs) {
      const {type,path,before}=ref,keys=Object.keys(before);
      if(type==='member') {
        const parent=path.slice(0,-1),sel=path[path.length-1];
        if(!replacement || at(next,parent).some(row=>eqId(row.characterId,replacement.id))) drop(parent,sel);
        else {
          // The membership's key itself changes. Use the replacement key when validating undo.
          patch(path,['characterId'],{characterId:replacement.id});
          ops[ops.length-1].path=[...parent,match('characterId',replacement.id)];
        }
      } else if(type==='speaker') {
        const desired=replacement?{speaker:String(replacement.id)}:mode==='keep'?{speaker:'',speakerName:work.name || String(work.id)}:{speaker:''};
        patch(path,['speaker','speakerName'],desired);
      } else if(type==='node') {
        patch(path,['characterId','label'],{characterId:replacement?.id ?? null,label:replacement?.name || before.label || work.name || String(work.id)});
      } else if(type==='replyCard') {
        patch(path,['characterId','characterName'],{characterId:replacement?.id ?? '',characterName:replacement?.name || before.characterName || work.name || ''});
      } else if(type==='embedded') {
        const fallback=at(next,path).source?.embeddedBookId;
        patch(path,['embeddedBookId'],{embeddedBookId:fallback!=null && !eqId(fallback,work.id) ? '' : null});
      }
      else if(type==='replyBook') patch(path,['bookId','bookName','entryIds'],{bookId:'',bookName:before.bookName || work.name || '',entryIds:[]});
      else if(type==='journal') patch(path,['chatId','floor','messageStamp'],{floor:null});
      else if(type==='source') patch(path,keys,{});
      else if(type==='expressions') {
        const list=before.expressionAssetIds,remaining=list.filter(value=>!eqId(value,work.id));
        at(next,path).expressionAssetIds=remaining;
        ops.push({path,expressions:{id:work.id,before:list,after:remaining}});
      } else if(['avatar','bookCover','chatBackground','themeBackground'].includes(type)) {
        patch(path,keys,{[keys[0]]:type==='themeBackground'?'':null});
      }
    }
    drop([collection],id(work.id));
    return {library:next,receipt:ops};
  }
  function restoreExpressions(row,receipt) {
    const current=row.expressionAssetIds;
    if(!Array.isArray(current) || current.some(value=>eqId(value,receipt.id)))stale();
    if(same(current,receipt.after)) {row.expressionAssetIds=copy(receipt.before);return;}
    // Match each surviving occurrence once, even when a legacy list repeats a neighbor.
    const positions=new Map(),insertions=new Map();
    for(let i=current.length-1;i>=0;i--) {
      const key=String(current[i]);
      if(!positions.has(key))positions.set(key,[]);
      positions.get(key).push(i);
    }
    let previous=-1,pending=[];
    function insertBefore(index) {
      if(pending.length)insertions.set(index,(insertions.get(index) || []).concat(pending));
      pending=[];
    }
    for(const value of receipt.before) {
      if(eqId(value,receipt.id)) {pending.push(value);continue;}
      const index=positions.get(String(value))?.pop();
      if(index!==undefined) {insertBefore(index);previous=index;}
    }
    insertBefore(previous+1);
    const restored=current.flatMap((value,i)=>(insertions.get(i) || []).concat(value));
    row.expressionAssetIds=restored.concat(insertions.get(current.length) || []);
  }
  function undo(lib,ops) {
    const next=copy(lib);
    for(const op of [...ops].reverse()) {
      const row=at(next,op.path);
      if(!row) stale();
      if(op.expressions) restoreExpressions(row,op.expressions);
      else if(op.selector) {
        if(!Array.isArray(row) || row.some(item=>eqId(item[op.selector.key],op.selector.value))) stale();
        const after=row.findIndex(item=>eqId(item[op.selector.key],op.after)), before=row.findIndex(item=>eqId(item[op.selector.key],op.before));
        const index=after>=0?after:before>=0?before+1:Math.min(op.index,row.length);
        row.splice(index,0,copy(op.value));
      } else {
        if(!same(fields(row,op.keys),op.after)) stale();
        for(const key of op.keys) {
          if(Object.hasOwn(op.before,key)) Object.defineProperty(row,key,{enumerable:true,configurable:true,writable:true,value:copy(op.before[key])});
          else delete row[key];
        }
      }
    }
    return next;
  }
  function referenceLabel(ref,translate) {
    const [kind,...where]=ref.location;
    return [translate(kind),...where].join(' › ');
  }
  const api={dependencies,undoReferences,referenceLabel,plan,remove,undo,types};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  else root.TALibraryActions=api;
})(globalThis);
