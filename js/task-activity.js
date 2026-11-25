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
  async function start(job,operation) {
    if (job.controller || !root.NIJANModel.configured()) {
      if (!job.controller) ui().toast(tr('先在设置里连接模型，并选一个。'));
      return;
    }
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
    const key=()=>{const {card,book}=source();return JSON.stringify(['review',card?.id || '',book?.id || '']);};
    const stop=stopButton(button);
    stop.onclick=()=>cancel(state(key()));
    const paint=job=>{
      const pending=job.phase==='running';stop.hidden=!pending;button.disabled=pending || (!source().card && !source().book);
      progress.textContent=phaseText(job,{running:'正在对照原文检查…',ready:'检查写完了'});
      if (after){after();return;}
      const {card,book}=source();
      const report=(ui().state.lib.settings.aiReviews || []).findLast(row=>(row.cardId || null)===(card?.id || null) && (row.bookId || null)===(book?.id || null));
      if (report)root.NIJANReview.mount(output,report,ui().state.lib);
      else output.replaceChildren();
    };
    watch(host,key,paint);
    button.onclick=()=>{
      const context=structuredClone(source()),job=state(key());
      if (!context.card && !context.book) return;
      return start(job,async signal=>{
        const result=await root.NIJANModel.runTask('review',context,{label:tr('AI 逻辑与人设检查'),signal});
        if (signal.aborted) return;
        const report={id:root.TAStore.uid('review'),cardId:context.card?.id || null,bookId:context.book?.id || null,source:JSON.stringify(context),createdAt:new Date().toISOString(),items:result.items};
        const library=ui().state.lib;
        library.settings.aiReviews=(library.settings.aiReviews || []).concat(report).slice(-10);
        ui().markDirty();
        return report.id;
      });
    };
    return ()=>paint(state(key()));
  }
  function bindAssist(box,kind) {
    const key='create:'+kind, job=state(key), area=box.querySelector('[data-assist]'),button=box.querySelector('[data-assist-go]');
    const progress=box.querySelector('[role=status]'),stop=stopButton(button);
    const preview=document.createElement('section');preview.className='stack';preview.dataset.assistPreview='';box.append(preview);
    const title=document.createElement('h4');title.textContent=tr('生成内容预览');
    const text=document.createElement('pre');text.className='snippet';text.dataset.noTranslate='';
    const source=document.createElement('p');source.className='help';source.dataset.noTranslate='';
    const apply=document.createElement('button');apply.type='button';apply.className='btn btn-primary';apply.dataset.assistApply='';apply.textContent=tr('采用勾选的修改');preview.append(title,source,text,apply);
    root.TACreationAssist?.mount(kind,box);
    area.value=job.prompt;
    area.oninput=()=>{job.prompt=area.value;};
    stop.onclick=()=>cancel(job);
    watch(box,()=>key,session=>{
      const pending=session.phase==='running';
      stop.hidden=!pending;button.disabled=pending || session.applying;
      progress.textContent=phaseText(session,{running:'正在生成…',ready:'内容已校验，等待确认。',saved:'修改已保存'});
      const plan=session.result;preview.hidden=!plan;apply.disabled=pending || !!session.applying;
      const ref=plan?.operations.find(op=>op.value?.workSource)?.value.workSource;
      source.hidden=kind!=='quick' || !plan;
      if(!source.hidden)source.textContent=tr('这组回复参考的作品')+' · '+([ref?.characterName,ref?.bookName].filter(Boolean).join(' / ') || tr('通用回复'));
      if (plan) text.textContent=plan.operations.map(op=>op.label+'\n'+root.NIJANStudio.formatValue(op.kind==='add'?op.value:op.after)).join('\n\n');
    });
    button.onclick=()=>{
      const request=area.value.trim() || root.TACreationAssist?.defaultBrief(kind);job.prompt=area.value;
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
        return plan;
      });
    };
    apply.onclick=async()=>{
      if(job.controller || !job.result || job.applying)return;
      job.applying=true;notify(job);
      try{
        await root.NIJANStudio.applyExternal(job.result);job.result=null;job.phase='saved';job.error='';
        if(box.isConnected)ui().renderStage();
      }catch(error){job.error=error.message;job.phase='error';}
      finally{job.applying=false;notify(job);}
    };
  }
  function clear(){
    for(const job of sessions.values()) if(job.controller){const controller=job.controller;job.controller=null;controller.abort();}
    sessions.clear();observers.clear();
  }
  root.TATaskActivity={bindReview,bindAssist,clear,pending:()=>[...sessions.values()].some(job=>job.controller)};
})(globalThis);
