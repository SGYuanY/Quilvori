/* File comparison and sync controls in the world-book editor. */
(function(root) {
  'use strict';
  const ui=()=>root.TAUI, session=()=>root.TAWorldSyncSession;
  const t=(key,vars)=>ui().t(key,vars);
  const fields={name:'书名',description:'简介',comment:'条目名',content:'内容',key:'主关键词',
    keysecondary:'次关键词',order:'顺序',depth:'深度',position:'位置',constant:'恒定注入',
    disable:'sync.disabled',displayIndex:'条目顺序',extensions:'sync.extensions',entry:'sync.wholeEntry'};
  const renderValue=(present,value)=>!present ? t('sync.absent') : typeof value==='string' ? value : JSON.stringify(value,null,2);
  function el(tag,text,style) {
    const node=document.createElement(tag);
    if(text!=null)node.textContent=text;
    if(style)node.className=style;
    return node;
  }
  function authored(tag,value,style) {
    const node=el(tag,value,style);node.dataset.noTranslate='';return node;
  }
  function button(key,attr) {
    const node=el('button',t(key),'btn btn-small');node.type='button';
    if(attr)node.setAttribute(attr,'');
    return node;
  }
  function describeError(error) {
    const wire=String(error?.message || '').match(/world-sync-[a-z-]+/);
    const key=error?.code || wire?.[0] || error?.message;
    const translated=t(key || 'world-sync-io');
    return translated+(error?.detail?' · '+error.detail:'');
  }
  function versions(row) {
    const grid=el('div',null,'world-sync-versions');
    for(const [side,caption] of [['base','sync.base'],['local','sync.local'],['disk','sync.file']]){
      const cell=el('div');cell.append(el('strong',t(caption)),authored('pre',renderValue(row[side+'Present'],row[side])));
      grid.append(cell);
    }
    return grid;
  }
  function differenceTitle(row) {
    const field=fields[row.field]?t(fields[row.field]):row.field;
    if(row.uid==null)return t('世界书')+' · '+field;
    const name=row.label || t('未命名');
    return name+' (#'+row.uid+') · '+field;
  }
  async function compareDialog(view) {
    const {rows}=view.plan, decisions=Object.create(null), conflicts=rows.filter(row=>row.kind==='conflict');
    const host=el('div',null,'work-restore world-sync-review');host.dataset.syncReview='';
    host.append(authored('p',(view.before.name || t('未命名'))+' ↔ '+view.file.name,'world-sync-pair'));
    const instruction=view.record?.base ? 'sync.compareHelp' : 'sync.firstHelp';
    host.append(el('p',t(instruction),'help'));
    if(view.message)host.append(el('p',t(view.message),'banner'));
    const summary=el('p');summary.setAttribute('role','status');host.append(summary);
    const bulk=el('div',null,'row'), list=el('div',null,'world-sync-rows');
    if(conflicts.length){
      for(const [choice,label] of [['local','sync.allLocal'],['disk','sync.allFile']]){
        const btn=button(label);btn.dataset.syncAll=choice;
        btn.onclick=()=>{for(const row of conflicts)decisions[row.key]=choice;draw();};
        bulk.append(btn);
      }
      host.append(bulk);
    }
    const previous=button('上一页'),next=button('下一页'),pageLabel=el('span');
    const navigation=el('div',null,'row');navigation.append(previous,pageLabel,next);
    const pageSize=16;let page=0,submit;
    previous.onclick=()=>{page--;draw();};next.onclick=()=>{page++;draw();};
    navigation.hidden=rows.length<=pageSize;
    host.append(navigation,list,el('p',t(view.file.target?'sync.desktopHelp':'sync.webHelp'),'help'));
    function count() {
      const remaining=conflicts.filter(row=>!decisions[row.key]).length;
      summary.textContent=rows.length?t('sync.counts',{total:rows.length,remaining}):t('sync.noChanges');
      if(submit)submit.disabled=remaining>0;
    }
    function draw() {
      const start=page*pageSize, end=Math.min(start+pageSize,rows.length);
      previous.disabled=!page;next.disabled=end===rows.length;pageLabel.textContent=(start+1)+'–'+end+' / '+rows.length;
      list.replaceChildren();
      for(const row of rows.slice(start,end)){
        const line=el('section',null,'world-sync-row');line.dataset.syncKind=row.kind;
        const info=el('div'),detail=el('details'),heading=authored('summary',differenceTitle(row));
        detail.append(heading);
        detail.ontoggle=()=>{if(detail.open && detail.childElementCount===1)detail.append(versions(row));};
        const badge=el('small',t('sync.from.'+row.kind),'world-sync-kind');
        info.append(badge,detail);
        const choice=el('select');choice.dataset.syncChoice=row.key;
        choice.setAttribute('aria-label',t('sync.choose')+' · '+differenceTitle(row));
        if(row.kind==='conflict')choice.add(new Option(t('sync.choose'),''));
        choice.add(new Option(t('sync.useLocal'),'local'));choice.add(new Option(t('sync.useFile'),'disk'));
        choice.value=decisions[row.key] || (row.kind==='conflict'?'':row.kind);
        choice.onchange=()=>{if(choice.value)decisions[row.key]=choice.value;else delete decisions[row.key];count();};
        line.append(info,choice);list.append(line);
      }
      count();
    }
    draw();
    const action=view.file.target?'sync.applyDesktop':'sync.applyWeb';
    const choice=ui().ask({title:t('sync.compare'),body:'',content:host,actions:[
      {id:'sync-apply',label:t(action),kind:'btn-primary'},{id:'no',label:t('取消')},
    ]});
    const dialog=host.closest('.modal');dialog.classList.add('work-restore-dialog','world-sync-dialog');
    submit=dialog.querySelector('[data-act="sync-apply"]');count();
    return await choice==='sync-apply'?decisions:null;
  }

  function mount(toolbar,book) {
    const host=el('section',null,'world-sync-toolbar');host.dataset.worldSync='';
    const info=el('div'),title=el('strong',t('sync.title'));
    const status=authored('p','');status.setAttribute('role','status');status.dataset.syncStatus='';
    const actions=el('div',null,'row');
    const check=button('sync.compare','data-sync-open'),undo=button('sync.undo','data-sync-undo'),unlink=button('sync.unlink','data-sync-unlink');
    undo.hidden=unlink.hidden=true;actions.append(check,undo,unlink);info.append(title,status);host.append(info,actions);
    toolbar.querySelector('.work-export-guide').before(host);
    let current=null, disk=null, busy=false, generation=0;
    const visible=()=>host.isConnected && ui().state.sel.book===book.id;
    const selected=()=>root.TAStore.byId(ui().state.lib.worldBooks,book.id);
    function controls() {
      check.disabled=busy;undo.disabled=busy;unlink.disabled=busy;
      check.textContent=t(current?.pending?'sync.resume':current?'sync.compare':'sync.chooseFile');
      unlink.hidden=!current;undo.hidden=!session().canRestore(current,disk);
    }
    function report(key,extra='') {
      if(!visible())return;
      status.textContent=[t(key),extra].filter(Boolean).join(' · ');
    }
    async function refresh() {
      const ticket=++generation;
      try{
        const record=await session().binding(book.id);
        if(!visible() || ticket!==generation)return;
        current=record;disk=null;controls();
        if(!record){report('sync.unbound');return;}
        if(record.pending){report('sync.pending',record.name);return;}
        const dirty=()=>record.base && root.TAWorldSync.hasLocalChanges(record.base,selected(),record.name);
        if(record.target && root.nijanDesktop?.worldSyncRead){
          report('sync.checking',record.name);
          const file=await root.nijanDesktop.worldSyncRead(record.target);
          if(!visible() || ticket!==generation)return;
          disk=file;controls();
          const outer=record.base && file.hash!==record.hash, inner=dirty();
          const time=new Date().toLocaleTimeString(document.documentElement.lang,{hour:'2-digit',minute:'2-digit'});
          report(!record.base?'sync.notChecked':outer&&inner?'sync.bothChanged':outer?'sync.diskChanged':inner?'sync.localChanged':'sync.verified',record.name+' · '+t('sync.checkedAt',{time}));
        }else report(record.needsVerify?'sync.exported':dirty()?'sync.localChanged':'sync.lastMatch',record.name);
      }catch(error){if(ticket===generation && visible())status.textContent=describeError(error);}
    }
    async function act(task) {
      if(busy)return;
      busy=true;++generation;controls();
      try{
        const message=await task();
        if(message){
          if(visible())ui().renderStage();
          ui().toast(t(message),{kind:'success'});
        }else if(visible())await refresh();
      }catch(error){
        if(visible()){await refresh();if(visible())status.textContent=describeError(error);}
        ui().toast(describeError(error),{kind:'error'});
      }finally{busy=false;if(visible())controls();}
    }
    check.onclick=()=>act(async()=>{
      report('sync.checking');
      const view=await session().inspect(book.id);
      if(!view || !visible())return;
      if(view.recovered)return view.recovered;
      const choices=await compareDialog(view);
      if(choices && visible())return session().apply(view,choices);
    });
    unlink.onclick=()=>act(async()=>{
      const record=current;
      const answer=await ui().ask({title:t('sync.unlink'),body:t('sync.unlinkHelp')+' '+record.name,
        actions:[{id:'no',label:t('取消')},{id:'unlink',label:t('sync.unlink'),kind:'btn-danger'}]});
      if(answer==='unlink' && visible()){await session().unlink(book.id,record);return 'sync.unlinked';}
    });
    undo.onclick=()=>act(async()=>{
      const record=current, before=structuredClone(selected()), file=disk;
      const answer=await ui().ask({title:t('sync.undo'),body:t('sync.undoHelp')+' '+record.name,
        actions:[{id:'no',label:t('取消')},{id:'undo-file',label:t('sync.undo'),kind:'btn-danger'}]});
      if(answer==='undo-file' && visible())return session().restore(before,record,file);
    });
    host.addEventListener('world-edited',event=>{
      if(event.detail!==book.id || !current || current.pending)return;
      report(disk && disk.hash!==current.hash?'sync.bothChanged':'sync.localChanged',current.name);
    });
    host.addEventListener('world-recheck',()=>{if(!busy && current?.target)refresh();});
    refresh();
  }
  // Only the mounted work receives these events. Folder reads and comparisons run on
  // explicit review or window focus, outside the typing and chip-editing paths.
  root.addEventListener?.('quilvori-world-edited',event=>{
    document.querySelector('[data-world-sync]')?.dispatchEvent(new CustomEvent('world-edited',{detail:event.detail}));
  });
  root.addEventListener?.('focus',()=>{
    document.querySelector('[data-world-sync]')?.dispatchEvent(new Event('world-recheck'));
  });
  root.TAWorldSyncPanel={mount};
})(globalThis);
