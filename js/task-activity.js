/* Window-scoped page tasks. Requests outlive the views that started them. */
(function (root) {
  'use strict';
  root.TAI18n?.add({'已有任务正在运行，可先打开其他栏目。':{
    en:'A studio request is running. You can keep working in other pages.',ja:'創作台で処理中です。他のページで作業を続けられます。',
    ru:'В студии выполняется запрос. Можно работать на других страницах.',ko:'창작대에서 처리 중입니다. 다른 페이지에서 계속 작업할 수 있습니다.',th:'สตูดิโอกำลังทำงานอยู่ คุณไปทำงานในหน้าอื่นได้'
  }});
  const ui = () => root.TAUI;
  const sessions = new Map(), observers = new Map();
  const tr = (s) => ui().t(s);
  function state(key) {
    if (!sessions.has(key)) sessions.set(key,{key,prompt:'',phase:'idle',error:'',result:null,controller:null});
    return sessions.get(key);
  }
  function notify(job) {
    for (const [host, observer] of observers) {
      if (!host.isConnected) { observers.delete(host); continue; }
      if (observer.key() === job.key) observer.paint(job);
    }
  }
  function watch(host,key,paint) {
    for (const old of observers.keys()) if (!old.isConnected) observers.delete(old);
    observers.set(host,{key,paint}); paint(state(key()));
  }
  function cancel(job) {
    if (!job.controller) return;
    const controller=job.controller;
    job.controller=null; job.phase='stopped'; job.error=''; controller.abort(); notify(job);
  }
  function modelReady(job,trigger){
    if(job.controller)return false;
    if(root.NIJANModel.configured())return true;
    const route=ui().state.route;
    ui().toast(tr('先在设置里连接模型，并选一个。'),{id:'authoring-connect-model',kind:'info',action:{
      label:tr('打开模型设置'),onClick:()=>{
        if(ui().state.route!==route)ui().go(route);
        const returnFocus=()=>ui().state.route===route ? (trigger.isConnected?trigger:document.getElementById(trigger.id) || document.querySelector('[data-assist-go]')) : null;
        ui().openSettings({returnFocus});
        const endpoint=document.querySelector('#set-base:not(:disabled)') || document.querySelector('#settings-model-tab');
        endpoint?.focus();
      },
    }});
    return false;
  }
  async function start(job,operation) {
    if(job.controller)return;
    const controller=new AbortController();
    job.phase='running'; job.controller=controller; job.error=''; notify(job);
    try {
      const result=await operation(controller.signal);
      if (job.controller !== controller) return;
      job.result=result; job.phase='ready';
    } catch (error) {
      if (job.controller !== controller) return;
      job.error=error.message; job.phase='error';
    } finally {
      if (job.controller===controller) {job.controller=null;notify(job);}
    }
  }
  function stopButton(anchor) {
    const el=document.createElement('button');
    el.type='button';el.className='btn btn-small';el.dataset.cancelTask='';el.textContent=tr('停止');
    anchor.after(el);return el;
  }
  function phaseText(job,labels) {
    if (job.phase==='error')return job.error;
    if (job.phase==='stopped')return tr('已停止请求，原稿保持原样。');
    return tr(labels[job.phase] || '');
  }
  function bindReview(host,{button,progress,output,source,after}) {
    const key=()=>{const {card,book}=source();return JSON.stringify(['review',card?.id ?? '',book?.id ?? '']);};
    const stop=stopButton(button);
    stop.onclick=()=>cancel(state(key()));
    const paint=job=>{
      const pending=job.phase==='running';stop.hidden=!pending;button.disabled=pending || (!source().card && !source().book);
      progress.textContent=phaseText(job,{running:'正在对照原文检查…',ready:'检查写完了'});
      if (after){after();return;}
      const {card,book}=source();
      const report=(ui().state.lib.settings.aiReviews || []).findLast(row=>(row.cardId ?? null)===(card?.id ?? null) && (row.bookId ?? null)===(book?.id ?? null));
      if (report)root.NIJANReview.mount(output,report,ui().state.lib);
      else output.replaceChildren();
    };
    watch(host,key,paint);
    button.onclick=()=>{
      const context=structuredClone(source()),job=state(key());
      if ((!context.card && !context.book) || !modelReady(job,button)) return;
      return start(job,async signal=>{
        const result=await root.NIJANModel.runTask('review',context,{label:tr('AI 逻辑与人设检查'),signal});
        if (signal.aborted) return;
        const report={id:root.TAStore.uid('review'),cardId:context.card?.id ?? null,bookId:context.book?.id ?? null,source:JSON.stringify(context),createdAt:new Date().toISOString(),items:result.items};
        const library=ui().state.lib;
        library.settings.aiReviews=(library.settings.aiReviews || []).concat(report).slice(-10);
        ui().markDirty('settings');
        return report.id;
      });
    };
    return ()=>paint(state(key()));
  }
  function targets(kind,receipt){
    const collections={quick:'quickReplySets',script:'scripts',timeline:'timeline',regex:'regexScripts'};
    return receipt.operations.filter(op=>op.kind==='add' && op.path[0]===collections[kind])
      .map(op=>({id:op.value.id,part:kind==='timeline'?op.path[1]:null}));
  }
  function savedItem(kind,target){
    const lib=ui().state.lib;
    const rows={quick:lib.quickReplySets,script:lib.scripts,regex:lib.regexScripts,timeline:lib.timeline[target.part]}[kind];
    return rows?.find(row=>row.id===target.id);
  }
  function openSaved(kind,target){
    if(!savedItem(kind,target)){ui().toast(tr('搜索目标已不存在'));return;}
    if(kind==='regex')return root.TASearch.open({kind:'regex',id:target.id,field:'findRegex'});
    const state=ui().state,selection={quick:'qr',script:'script',timeline:'tl'}[kind];
    state.sel[selection]=target.id;
    if(kind==='timeline')state.sel.tlKind=target.part==='beats'?'beat':'note';
    ui().go(kind);
    const input=document.querySelector({quick:'#qr-body [data-field=name]',script:'#script-body [data-field=name]',timeline:'#tl-editor [data-field=title]'}[kind]);
    input?.focus();input?.scrollIntoView({block:'nearest'});
  }
  function savedLinks(host,kind,items){
    const active=(items || []).map(target=>({target,row:savedItem(kind,target)})).filter(item=>item.row);
    const signature=JSON.stringify([root.TAI18n?.prefs.lang,active.map(({target,row})=>[target.id,target.part,row.name || row.title || row.scriptName])]);
    if(host.dataset.savedSignature===signature)return;
    host.dataset.savedSignature=signature;host.replaceChildren();
    for(const {target,row} of active){
      const open=document.createElement('button');open.type='button';open.className='btn btn-small';
      open.dataset.assistOpen=String(row.id);open.dataset.noTranslate='';
      const label=kind==='timeline'?tr(target.part==='beats'?'情节':'消息注记'):tr('打开');
      open.textContent=label+' · '+(row.name || row.title || row.scriptName || tr('未命名'));
      open.onclick=()=>openSaved(kind,target);host.append(open);
    }
    host.hidden=!host.childElementCount;
  }
  function bindAssist(box,kind) {
    const key='create:'+kind, job=state(key), area=box.querySelector('[data-assist]'),button=box.querySelector('[data-assist-go]');
    const guide=root.TACreationAssist?.guide(kind);
    const progress=box.querySelector('[role=status]'),stop=stopButton(button);
    const saved=document.createElement('div');saved.className='row assist-saved';saved.dataset.assistSaved='';box.append(saved);
    const preview=document.createElement('section');preview.className='stack';preview.dataset.assistPreview='';box.append(preview);
    const title=document.createElement('h4');title.textContent=tr('生成内容预览');
    const text=document.createElement(guide?'div':'pre');text.className=guide?'authoring-preview':'snippet';text.dataset.noTranslate='';
    const source=document.createElement('p');source.className='help';source.dataset.noTranslate='';
    const apply=document.createElement('button');apply.type='button';apply.className='btn btn-primary';apply.dataset.assistApply='';apply.textContent=tr(guide?.save || (kind==='regex'?'保存这份正则脚本':'采用完整预览'));preview.append(title,source,text,apply);
    area.value=job.prompt;
    root.TACreationAssist?.mount(kind,box);
    area.oninput=()=>{job.prompt=area.value;};
    stop.onclick=()=>cancel(job);
    let shown;
    watch(box,()=>key,session=>{
      const pending=session.phase==='running';
      stop.hidden=!pending;button.disabled=pending || session.applying;
      progress.textContent=phaseText(session,{running:'正在生成…',ready:'内容已校验，等待确认。',saved:guide?'已保存，可打开以下内容。':'修改已保存'});
      const plan=session.result;preview.hidden=!plan;apply.disabled=pending || !!session.applying;
      const ref=plan?.operations.find(op=>op.value?.workSource)?.value.workSource;
      source.hidden=kind!=='quick' || !plan;
      if(!source.hidden)source.textContent=tr('这组回复参考的作品')+' · '+([ref?.characterName,ref?.bookName].filter(Boolean).join(' / ') || tr('通用回复'));
      title.textContent=tr(plan && (pending || session.phase==='error' || session.phase==='stopped')?'上一次生成的预览':'生成内容预览');
      if(plan && shown!==plan){
        if(guide)root.TACreationAssist.preview(text,kind,plan);
        else text.textContent=plan.operations.map(op=>op.label+'\n'+root.NIJANStudio.formatValue(op.kind==='add'?op.value:op.after)).join('\n\n');
      }
      shown=plan;savedLinks(saved,kind,session.saved);
    });
    button.onclick=()=>{
      const request=area.value.trim() || root.TACreationAssist?.defaultBrief(kind);job.prompt=area.value;
      if(!modelReady(job,button))return;
      if (!request){ui().toast(tr('先写下要求。'));return;}
      let context;
      try {
        context=root.TACreationAssist?.context(kind,box,request) || {brief:request,reference:root.NIJANStudio.modelReference(request,[],true),
          availableCharacters:ui().state.lib.characters.map(({id,name})=>({id,name})),library:kind==='backup'?{characters:ui().state.lib.characters.length,books:ui().state.lib.worldBooks.length}:undefined};
        context=structuredClone(context);
      } catch (error){ui().toast(tr(error.message));return;}
      const snapshot=root.NIJANAI.copy(ui().state.lib);
      return start(job,async signal=>{
        const task='create:'+kind, result=await root.NIJANModel.runTask(task,context,{label:ui().t(root.NIJANAI.MODULES[kind]),signal});
        if (signal.aborted) return;
        const plan=root.NIJANAI.proposal(snapshot,task,result,context);
        if (!plan.operations.length)throw new Error(tr('没有有效内容，原稿保持原样。'));
        if(kind==='regex')await root.TACreationAssist.verifyRegexExamples(plan,context,signal);
        return plan;
      });
    };
    apply.onclick=async()=>{
      if(job.controller || !job.result || job.applying)return;
      job.applying=true;notify(job);
      try{
        if(kind==='quick' && !root.TACreationAssist.quickSourcesAvailable(job.result))
          throw new Error(tr('参考作品或条目已移除。请重新选择参考资料，再生成这套回复。'));
        const receipt=await root.NIJANStudio.applyExternal(job.result);
        job.saved=targets(kind,receipt);job.result=null;job.phase='saved';job.error='';
        if(ui().state.route===kind && job.saved.length)openSaved(kind,job.saved[0]);
        else if(box.isConnected)ui().renderStage();
      }catch(error){job.error=tr(error.message);job.phase='error';}
      finally{job.applying=false;notify(job);}
    };
  }
  function clear(){
    for(const job of sessions.values()) if(job.controller){const controller=job.controller;job.controller=null;controller.abort();}
    sessions.clear();observers.clear();if(root.TAUI?.state)delete root.TAUI.state.scriptCastIds;
  }
  root.TATaskActivity={bindReview,bindAssist,clear,pending:()=>[...sessions.values()].some(job=>job.controller)};
})(globalThis);
