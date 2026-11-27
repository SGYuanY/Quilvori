/* The backup page supplies verified library data. All review controls are local to one open file. */
(function(root) {
  'use strict';
  const ui = () => root.TAUI, core = () => root.TAWorkRestore;
  const tr = key => ui().t(key);
  const titles = {characters:'角色卡',worldBooks:'世界书'};
  const labels = ['本机当前稿','备份稿'];
  function node(tag,text,className) {
    const el=document.createElement(tag);
    if(text!==undefined)el.textContent=text;
    if(className)el.className=className;
    return el;
  }
  function authored(tag,text) {
    const el=node(tag,text);el.dataset.noTranslate='';return el;
  }
  function button(label,handler) {
    const el=node('button',tr(label),'btn btn-small');el.type='button';el.onclick=handler;return el;
  }
  function summaryFor(work,kind) {
    if(!work)return tr('restore.noLocal');
    const strings=kind==='characters'?[work.description,work.personality,work.scenario,work.first_mes]:
      [work.description,...(work.entries || []).slice(0,3).map(row=>[row.comment,row.content].filter(Boolean).join('\n'))];
    const excerpt=strings.filter(Boolean).join('\n\n');
    return excerpt.length>600?excerpt.slice(0,600)+'…':excerpt || work.name || String(work.id);
  }
  function compare(plan) {
    const host=node('section'),pair=node('div',undefined,'integrity-diff work-restore-pair');
    [plan.current,plan.work].forEach((work,i)=>{
      const side=node('section');
      side.append(node('h4',tr(labels[i])));
      if(work)side.append(authored('strong',work.name || String(work.id)));
      side.append(authored('pre',summaryFor(work,plan.kind)));
      if(work){
        const full=node('details');
        full.append(node('summary',tr('查看完整内容')));
        full.ontoggle=()=>{
          if(full.open && full.childElementCount===1)full.append(authored('pre',JSON.stringify(work,null,2)));
        };
        side.append(full);
      }
      pair.append(side);
    });
    host.append(pair);
    if(plan.current){
      const details=node('details'),summary=node('summary',tr('字段差异'));
      details.dataset.restoreDiff='';
      details.append(summary);
      details.ontoggle=()=>{
        if(!details.open || details.dataset.loaded)return;
        const changes=root.TAHistory.diff(plan.current,plan.work);
        details.dataset.loaded='1';summary.textContent=tr('字段差异')+' · '+changes.length;
        for(const change of changes){
          const field=node('details');
          field.append(authored('summary',change.path));
          field.ontoggle=()=>{
            if(field.open && field.childElementCount===1)field.append(root.TAIntegrityPanel.difference(change.before,change.after,labels));
          };
          details.append(field);
        }
      };
      host.append(details);
    }
    return host;
  }
  function option(value,text) {
    const item=node('option',text);item.value=value;return item;
  }
  function field(text,control) {
    const label=node('label',undefined,'field');label.append(node('span',tr(text),'field-label'),control);return label;
  }
  function check(label,value,checked,change){
    const input=node('input');
    input.type='checkbox';input.value=value;input.checked=checked;input.onchange=()=>change(input);
    label.className='check';label.prepend(input);
    return input;
  }
  function snapshotList(plan,selected,enabled,onUpdate) {
    const details=node('details'),summary=node('summary');
    const list=node('div',undefined,'work-restore-choices');
    let visible=20;
    const count=()=>{summary.textContent=tr('此作品的历史快照')+' · '+selected.size+' / '+plan.versions.length;};
    details.append(summary,list);count();
    if(!plan.versions.length)return details;
    function draw(){
      list.replaceChildren();
      plan.versions.slice(-visible).reverse().forEach((row,j)=>{
        const index=plan.versions.length-j-1,label=node('label'),time=new Date(row.time);
        const rendered=Number.isFinite(time.getTime())?time.toLocaleString(document.documentElement.lang):'';
        label.append(authored('span',[rendered,row.label || tr(row.reason)].filter(Boolean).join(' · ')));
        const input=check(label,String(index),selected.has(index),el=>{
          if(el.checked)selected.add(index);else selected.delete(index);
          count();onUpdate();
        });
        input.dataset.restoreSnapshot='';input.disabled=!enabled;
        list.append(label);
      });
      if(visible<plan.versions.length){
        list.append(button('显示更多',()=>{
          const next=plan.versions.length-visible-1;visible+=20;draw();
          list.querySelector('input[value="'+next+'"]')?.focus();
        }));
      }
    }
    details.ontoggle=()=>{if(details.open && !list.childElementCount)draw();};
    return details;
  }
  function outcome(kind,work) {
    ui().renderStage();
    const open=()=>root.TASearch.open({kind:kind==='characters'?'character':'book',id:work.id,field:'name',selectOnly:true});
    const box=node('div',undefined,'work-restore-result row');
    box.setAttribute('role','status');
    const link=button('打开已恢复作品',open);link.dataset.openRestoredWork='';
    box.append(node('strong',tr('已恢复单件作品')),authored('span',root.TAIntegrityPanel.displayName(work)),link);
    const note=document.getElementById('backup-note');
    if(note){note.after(box);link.focus();}
    else ui().toast(work.name || String(work.id),{kind:'success',title:tr('已恢复单件作品'),action:{label:tr('打开已恢复作品'),onClick:open}});
  }
  async function open(library,state,filename) {
    const host=node('div',undefined,'integrity-content work-restore');
    const search=node('input'),select=node('select'),pageRow=node('div',undefined,'row'),detail=node('section');
    search.type='search';search.dataset.restoreWorkSearch='';
    select.dataset.restoreWorkList='';select.dataset.noTranslate='';
    const size=50,searchText=new WeakMap();
    let page=0, matches=[], plan, choices, submit;
    const hasHistory=!!root.TALibraryDB.database();
    const prev=button('上一页',()=>{page--;draw();if(prev.disabled)next.focus();});
    const next=button('下一页',()=>{page++;draw();if(next.disabled)prev.focus();});
    const pageText=node('output');pageRow.append(prev,pageText,next);
    if(filename)host.append(authored('small',filename));
    host.append(field('搜索作品名称或正文',search),field('备份中的作品',select),pageRow,detail);
    function preview(){
      const chosen=select.selectedIndex<0?null:matches[page*size+select.selectedIndex];
      if(chosen && plan?.kind===chosen.kind && plan.work.id===chosen.id)return;
      plan=null;choices=null;detail.replaceChildren();
      if(submit)submit.disabled=!chosen;
      if(!chosen){const empty=node('p',tr('备份中没有匹配的作品'),'help');empty.setAttribute('role','status');detail.append(empty);return;}
      plan=core().review(ui().state.lib,library,state,chosen.kind,chosen.id,{reply:ui().state.replyReference});
      const excluded=new Set(),snapshots=new Set();
      choices={mode:'copy',dependencies:new Set(),snapshots};
      const mode=node('select');mode.dataset.restoreMode='';
      mode.append(option('copy',tr('新建独立副本')));
      const replace=option('replace',tr('替换这件作品'));
      replace.disabled=!!plan.blocked || !hasHistory;mode.append(replace);
      const advice=node('small',undefined,'help');
      function modeChanged(){
        choices.mode=mode.value;
        advice.textContent=plan.blocked?tr(plan.blocked):!hasHistory?tr('版本库存储不可用'):
          mode.value==='replace'?tr('替换时保留未选来源对应的本机关联，勾选的表情图会加入现有列表。'):'';
        advice.hidden=!advice.textContent;
        linkNote.textContent=mode.value==='replace'?tr('副本和导入快照只关联选中的备份资料。'):tr('恢复稿只会关联勾选的备份资料。');
      }
      const linkNote=node('small',undefined,'help');
      mode.onchange=modeChanged;modeChanged();
      detail.append(compare(plan),field('恢复方式',mode),advice);
      const deps=node('fieldset');
      function updateDeps(){
        const focus=document.activeElement?.dataset.restoreDep!==undefined?document.activeElement.value:null;
        const possible=core().dependencies(plan,snapshots);
        const selected=new Set(possible.filter(dep=>dep.row && !excluded.has(dep.key)).map(dep=>dep.key));
        const active=core().dependencies(plan,snapshots,selected);
        choices.dependencies=new Set(active.filter(dep=>selected.has(dep.key)).map(dep=>dep.key));
        deps.replaceChildren(node('legend',tr('选择关联资料')));deps.hidden=!active.length;
        if(!active.length)return;
        const list=node('div',undefined,'work-restore-choices');
        for(const dep of active){
          const label=node('label');
          label.append(node('span',tr(dep.role)),authored('span',dep.row?.name || String(dep.id)));
          const input=check(label,dep.key,choices.dependencies.has(dep.key),el=>{
            if(el.checked)excluded.delete(dep.key);else excluded.add(dep.key);
            updateDeps();
          });
          input.dataset.restoreDep=dep.bucket;input.disabled=!dep.row;
          if(!dep.row)label.append(node('small',tr('备份中缺少此项。'),'help'));
          const image=dep.bucket==='assets' && dep.row?.dataUrl;
          if(typeof image==='string' && /^data:image\/(?:png|jpeg|gif|webp|avif);base64,/i.test(image)){
            const thumb=node('img');thumb.alt='';thumb.loading='lazy';thumb.src=image;label.append(thumb);
          }
          list.append(label);
        }
        deps.append(list,linkNote);
        if(focus!==null)[...list.querySelectorAll('input')].find(input=>input.value===focus)?.focus({preventScroll:true});
      }
      updateDeps();
      detail.append(deps,snapshotList(plan,snapshots,hasHistory,updateDeps));
      if(!hasHistory && plan.versions.length)detail.append(node('small',tr('版本库存储不可用'),'help'));
    }
    function draw(keep=''){
      const visible=matches.slice(page*size,(page+1)*size);
      select.size=Math.max(1,Math.min(5,visible.length));
      select.replaceChildren(...visible.map(item=>option(JSON.stringify([item.kind,item.id]),tr(titles[item.kind])+' · '+item.name)));
      if(visible.length){select.selectedIndex=0;if([...select.options].some(opt=>opt.value===keep))select.value=keep;}
      prev.disabled=page===0;next.disabled=(page+1)*size>=matches.length;
      pageRow.hidden=matches.length<=size;pageText.textContent=(visible.length?page*size+1:0)+'–'+(page*size+visible.length)+' / '+matches.length;
      preview();
    }
    function filter(){const last=select.value;matches=core().search(library,search.value,searchText);page=0;draw(last);}
    filter();search.oninput=filter;select.onchange=preview;
    const choice=ui().ask({title:'恢复单件作品',body:'',content:host,actions:[
      {id:'restore-work',label:'恢复单件作品',kind:'btn-primary'},{id:'no',label:'取消'},
    ]});
    const dialog=host.closest('.modal');
    dialog.classList.add('work-restore-dialog');
    submit=dialog.querySelector('[data-act="restore-work"]');submit.disabled=!plan;
    if(await choice!=='restore-work' || !plan || !choices)return;
    if(choices.mode==='replace'){
      const confirm=node('div');confirm.append(authored('strong',plan.current?.name || String(plan.work.id)));
      if(await ui().ask({title:'替换这件作品',body:'替换前会保存当前稿的快照。',content:confirm,actions:[
        {id:'no',label:'取消'},{id:'replace-work',label:'替换这件作品',kind:'btn-danger'},
      ]})!=='replace-work')return;
    }
    const reserved={characters:[],worldBooks:[]};
    if(hasHistory){
      const inventory=await root.TAHistory.overview();
      for(const row of inventory.works)if(Object.hasOwn(reserved,row.kind))reserved[row.kind].push(row.id);
    }
    for(const {plan:draft} of root.TAStudioDrafts.pending()){
      const op=draft.operations[0],kind=op?.path?.[0];
      if(Object.hasOwn(reserved,kind) && op.value?.id!=null)reserved[kind].push(op.value.id);
    }
    const result=core().materialize(ui().state.lib,plan,choices,root.TAStore.uid,{reserved,reply:ui().state.replyReference});
    if(result.previous && result.changed){
      await root.TAHistory.commitWorks(result.candidate,[[plan.kind,result.previous]],{
        reason:'单件作品恢复前',historyRequired:true,importSnapshots:result.importSnapshots,
      });
    }else if(result.changed || result.importSnapshots.length){
      await ui().commitLibrary(result.candidate,[],false,null,{importSnapshots:result.importSnapshots});
    }
    outcome(plan.kind,result.work);
  }
  root.TAWorkRestorePanel={open};
})(globalThis);
