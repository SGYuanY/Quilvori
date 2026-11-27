/* Library operations share one confirmation surface. Authored text is always inserted as text. */
(function(root){
  'use strict';
  const ui=()=>root.TAUI,tr=key=>ui().t(key);
  function element(tag,text,cls) {
    const el=document.createElement(tag);
    if(text!==undefined)el.textContent=text;
    if(cls)el.className=cls;
    return el;
  }
  function original(el) {el.dataset.noTranslate='';return el;}
  function select(items,label) {
    const node=element('select');node.setAttribute('aria-label',label);
    for(const [value,text] of items) {const opt=element('option',text); opt.value=value;node.append(opt);}
    return node;
  }
  let generation=0;
  function resetUndo(){generation++;}
  async function remove(collection,item,body='') {
    const ops=root.TALibraryActions;
    try {
      const planned=ops.plan(ui().state.lib,collection,item.id),token=generation;
      const content=element('div',undefined,'integrity-content'),name=item.name || item.scriptName || String(item.id);
      let mode,who,targets;
      if(planned.refs.length) {
        content.append(element('strong',tr('引用位置')));
        const list=element('ul',undefined,'integrity-references');
        for(const ref of planned.refs) list.append(original(element('li',ops.referenceLabel(ref,tr))));
        content.append(list);
        if(collection==='characters') {
          const offers=planned.refs.some(r=>r.type==='speaker')?[['keep',tr('解绑并保留原说话人名称')]]:[];
          offers.push(['unlink',tr('解除关联')]);
          targets=ui().state.lib.characters.filter(c=>c.id!==item.id);
          if(targets.length)offers.push(['replace',tr('替换为其他角色')]);
          mode=select(offers,tr('处理角色引用'));mode.dataset.deleteMode='';
          const label=element('label',tr('处理角色引用'),'field');label.append(mode);content.append(label);
          if(targets.length) {
            who=select(targets.map((c,i)=>[String(i),c.name || String(c.id)]),tr('替换为其他角色'));who.dataset.deleteReplacement='';who.dataset.noTranslate='';
            who.hidden=true;content.append(who);mode.onchange=()=>{who.hidden=mode.value!=='replace';};
          }
        }
      }
      const answer=await ui().ask({title:tr('删除')+' · '+name,body:body?tr(body):'',content,
        actions:[{id:'no',label:tr('取消')},{id:'yes',label:tr('删除'),kind:'btn-danger'}]});
      if(answer!=='yes')return;
      if(token!==generation)throw new Error('资料库已变化，请重新打开。');
      const result=ops.remove(ui().state.lib,planned,mode?.value || 'keep',who && targets[Number(who.value)]?.id);
      await ui().commitLibrary(result.library);
      if(collection==='assets' && ui().state.sel.asset===item.id)ui().state.sel.asset=null;
      ui().renderStage();
      ui().toast(tr('已删除')+' · '+name,{kind:'success',duration:15000,id:'removed-'+collection+'-'+item.id,action:{
        label:tr('撤销删除'),onClick:async()=>{
          try {
            if(token!==generation)throw new Error('资料库已变化，请重新打开。');
            await ui().commitLibrary(ops.undo(ui().state.lib,result.receipt));
            if(collection==='assets' && ui().state.route==='assets' && ui().state.sel.asset==null)ui().state.sel.asset=item.id;
            ui().renderStage();ui().toast(tr('已恢复')+' · '+name,{kind:'success'});
          } catch(error){ui().toast(tr(error.message),{kind:'error'});}
        }
      }});
    }catch(error){ui().toast(tr(error.message),{kind:'error'});}
  }
  function printable(value) {return typeof value==='string'?value:JSON.stringify(value,null,2) ?? '';}
  function imageValue(value) {return typeof value==='string' && /^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(value);}
  function changedLines(before,after) {
    const left=before.split('\n'),right=after.split('\n');
    let start=0,end=0,limit=Math.min(left.length,right.length);
    while(start<limit && left[start]===right[start])start++;
    while(start+end<limit && left[left.length-end-1]===right[right.length-end-1])end++;
    const parts=lines=>[lines.slice(Math.max(0,start-1),start).join('\n'),
      lines.slice(start,lines.length-end).join('\n'),lines.slice(lines.length-end,lines.length-end+1).join('\n')];
    return [parts(left),parts(right)];
  }
  function difference(left,right,labels=['保留当前','采用备份']) {
    const columns=element('div',undefined,'integrity-diff');
    const pictures=imageValue(left)||imageValue(right);
    const pair=pictures?null:changedLines(printable(left),printable(right));
    for(const [i,name] of labels.entries()) {
      const col=element('section'),value=i===0?left:right;col.append(element('b',tr(name)));
      if(imageValue(value)) {
        const image=element('img');image.alt=tr(name);image.src=value;col.append(image);
        col.append(element('small',Math.round((value.length-value.indexOf(',')-1)*3/4/1024)+' KiB'));
      }else{
        const pre=original(element('pre')),parts=pair?.[i] || ['',printable(value),''];
        if(parts[0])pre.append(document.createTextNode(parts[0]+'\n'));
        pre.append(element('mark',parts[1] || '∅'));
        if(parts[2])pre.append(document.createTextNode('\n'+parts[2]));
        col.append(pre);
      }
      columns.append(col);
    }
    return columns;
  }
  function review(preview) {
    const content=element('div',undefined,'integrity-content'),choices=new Map();
    if(!preview.conflicts.length)return {content,choices};
    content.append(element('strong',tr('合并冲突')+' · '+preview.conflicts.length));
    const workChoices=[['keep',tr('保留当前')],['backup',tr('采用备份')],['copy',tr('另存一份')]];
    const labels={name:'名称',description:'描述',personality:'性格',scenario:'情景',content:'正文',entries:'条目',
      messages:'聊天消息',bookmarks:'书签',memoryHtml:'HTML 记忆',label:'标签',members:'群组成员',settings:'设置'};
    const list=element('div',undefined,'integrity-conflicts');
    const pageSize=30,pages=Math.ceil(preview.conflicts.length/pageSize);
    let page=0;
    function paint() {
      list.replaceChildren();
      for(const c of preview.conflicts.slice(page*pageSize,(page+1)*pageSize)) {
        const row=element('article',undefined,'integrity-conflict'),detail=element('details');
        const title=c.names.map((s,i)=>typeof c.path[i]==='string' || i>=c.path.length
          ?tr(Object.hasOwn(labels,s)?labels[s]:s):s).join(' › ');
        detail.append(original(element('summary',title)));
        detail.ontoggle=()=>{
          if(detail.open && detail.children.length===1)detail.append(difference(c.before,c.after));
        };
        const choice=select(workChoices,title);choice.dataset.mergeChoice=c.key;choice.value=choices.get(c.key) || 'keep';
        choice.onchange=()=>choices.set(c.key,choice.value);
        row.append(detail,choice);list.append(row);
      }
      list.scrollTop=0;
    }
    if(pages>1) {
      const nav=element('div',undefined,'row'),prev=element('button',tr('上一页'),'btn btn-small'),
        next=element('button',tr('下一页'),'btn btn-small'),count=element('span');
      prev.type=next.type='button';count.setAttribute('aria-live','polite');
      const turn=(n,focus=false)=>{
        page=n;prev.disabled=!page;next.disabled=page===pages-1;count.textContent=(page+1)+' / '+pages;paint();
        if(focus)list.querySelector('summary')?.focus();
      };
      prev.onclick=()=>turn(page-1,true);next.onclick=()=>turn(page+1,true);
      nav.append(prev,count,next);content.append(nav);turn(0);
    } else paint();
    content.append(list,element('small',tr('另存时保留本地字段，并为备份作品建立独立副本。独立设置的副本可在备份页查看。'),'help'));
    return {content,choices};
  }
  function alternatives(stage,lib) {
    if(!Array.isArray(lib.backupAlternatives))return;
    const saved=lib.backupAlternatives.filter(a=>a && Array.isArray(a.address) && a.address.every(k=>typeof k==='string') && Object.hasOwn(a,'value'));
    if(!saved.length)return;
    const section=element('section',undefined,'paper stack');section.append(element('h3',tr('备份字段副本')));
    for(const row of saved){
      const detail=element('details');detail.append(original(element('summary',row.address.join(' › '))));
      detail.ontoggle=()=>{if(detail.open && detail.children.length===1) detail.append(original(element('pre',printable(row.value))));};
      section.append(detail);
    }
    stage.append(section);
  }
  function displayName(row) {
    const name=row.name || row.scriptName || tr('未命名');
    return row.backupCopyOf==null ? name : name+' · '+tr('备份副本')+(row.backupCopyIndex>1?' '+row.backupCopyIndex:'');
  }
  root.TAIntegrityPanel={remove,review,alternatives,resetUndo,displayName,difference};
})(globalThis);
