/* Scoped, reversible removals. Paths identify stable records, including group members. */
(function(root) {
  'use strict';
  const copy = value => structuredClone(value);
  const eqId = (a,b) => a != null && b != null && String(a) === String(b);
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
  const types = {characters:'角色卡',worldBooks:'世界书',chats:'聊天',groups:'群组',regexScripts:'正则',quickReplySets:'快捷回复',scripts:'剧本',promptPresets:'提示词'};
  function dependencies(lib,collection,work) {
    const refs=[], target=work.id;
    function add(type,path,location,keys) {
      const row=at(lib,path);
      refs.push({type,path,location,before:keys ? fields(row,keys) : copy(row)});
    }
    if (collection==='characters') {
      for(const group of lib.groups) for(const member of group.members) if(eqId(member.characterId,target))
        add('member',['groups',id(group.id),'members',match('characterId',member.characterId)],['群组',group.name || group.id]);
      for(const script of lib.scripts) script.beats.forEach((beat,i)=>{
        if(beat.speaker!=='narrator' && eqId(beat.speaker,target))
          add('speaker',['scripts',id(script.id),'beats',id(beat.id)],['剧本',script.name || script.id,'#'+(i+1)],['speaker','speakerName']);
      });
      for(const node of lib.graph.nodes) if(eqId(node.characterId,target))
        add('node',['graph','nodes',id(node.id)],['关系图',node.label || node.id],['characterId','label']);
    }
    if(collection==='worldBooks') {
      for (const card of lib.characters) {
        if(eqId(card.embeddedBookId,target)) add('embedded',['characters',id(card.id)],['角色卡',card.name || card.id],['embeddedBookId']);
        if(eqId(card.source?.embeddedBookId,target)) add('embedded',['characters',id(card.id),'source'],['角色卡',card.name || card.id,'来源'],['embeddedBookId']);
      }
    }
    if(collection==='worldBooks' || collection==='characters') {
      const isCard=collection==='characters',key=isCard?'characterId':'bookId';
      for(const set of lib.quickReplySets) if(eqId(set.workSource?.[key],target))
        add(isCard?'replyCard':'replyBook',['quickReplySets',id(set.id),'workSource'],['快捷回复',set.name || set.id],
          isCard?['characterId','characterName']:['bookId','bookName','entryIds']);
    }
    if(collection==='chats') {
      for(const key of ['notes','beats']) for(const note of lib.timeline[key]) if(eqId(note.chatId,target))
        add('journal',['timeline',key,id(note.id)],['剧情手记',note.title || note.id],['chatId','floor','messageStamp']);
    }
    const folderKind={characters:'cards',worldBooks:'worlds',chats:'chats'}[collection];
    if(folderKind) for(const [key,source] of Object.entries(lib.settings.folderImports || {})) {
      if(source?.kind===folderKind && eqId(source.id,target))
        add('source',['settings','folderImports'],['文件夹导入',key],[key]);
    }
    return refs;
  }
  function plan(lib,collection,workId) {
    if(!Object.hasOwn(types,collection)) throw new Error('存档结构无效');
    const row=at(lib,[collection,id(workId)]);
    if(!row) stale();
    return {collection,id:row.id,work:copy(row),refs:dependencies(lib,collection,row)};
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
      } else if(type==='embedded') patch(path,['embeddedBookId'],{embeddedBookId:null});
      else if(type==='replyBook') patch(path,['bookId','bookName','entryIds'],{bookId:'',bookName:before.bookName || work.name || '',entryIds:[]});
      else if(type==='journal') patch(path,['chatId','floor','messageStamp'],{floor:null});
      else if(type==='source') patch(path,keys,{});
    }
    drop([collection],id(work.id));
    return {library:next,receipt:ops};
  }
  function undo(lib,ops) {
    const next=copy(lib);
    for(const op of [...ops].reverse()) {
      const row=at(next,op.path);
      if(!row) stale();
      if(op.selector) {
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
  root.TALibraryActions={plan,remove,undo,types};
})(globalThis);
