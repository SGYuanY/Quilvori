/* Inspect original model output and open or recover each selected work locally. */
(function(root){
  'use strict';
  const kinds=['character','world'], ui=()=>root.TAUI, t=key=>ui().t(key);
  const parsed=new WeakMap(), hashing=new WeakSet();
  const states={
    draft:'待收录', adopted:'已收入作品库', recoverable:'可从原回复恢复',
    attention:'需要处理', working:'处理中',
  };
  let copiedText='';
  function element(tag,text){
    const node=document.createElement(tag);
    if(text!==undefined)node.textContent=text;
    return node;
  }
  function button(text,action){
    const node=element('button',t(text));node.type='button';node.className='btn btn-small';
    node.onclick=action;return node;
  }
  function reportFor(record,selection){
    const language=root.TAI18n?.prefs.lang, output=record.output;
    let cache=parsed.get(record);
    if(!cache || cache.language!==language || cache.output!==output){
      cache={language,output,reports:new Map()};parsed.set(record,cache);
    }
    const id=selection.join('|');
    if(!cache.reports.has(id))cache.reports.set(id,root.NIJANCreationOutput.collect(output,selection));
    return cache.reports.get(id);
  }
  function inspect(record,kind){
    const requested=root.TAWorkOutcomes.requested(record);
    const report=reportFor(record,requested.includes(kind)?requested:[kind]);
    return {result:report.results[kind],error:report.errors[kind]};
  }
  function recordError(record){
    if(!record.error || !root.TACreationRecords.isWork(record) || !record.output?.trim() ||
      !['partial','error','needs_input'].includes(record.status) ||
      (record.errorCode && !['invalid-output','invalid-work','invalid-result','model-error','needs-input'].includes(record.errorCode)))return record.error;
    const wanted=root.TAWorkOutcomes.requested(record), report=reportFor(record,wanted);
    const primary=record.task.slice(7);
    const errors=wanted.filter(k=>k===primary || report.present.includes(k)).map(k=>report.errors[k]).filter(Boolean);
    return [...new Set(errors)].join(' · ') || record.error;
  }
  function describe(record,records,session){
    return root.TAWorkOutcomes.resolve(record,records,ui().state.lib,
      root.TAStudioDrafts.pending().map(row=>row.plan),session(),(source,kind)=>{
        const {result,error}=inspect(source,kind);
        return {ready:!!result,name:result?.[kind]?.name,error};
      });
  }
  function ensureHash(record){
    if(!record.output?.trim() || record.sourceKey || hashing.has(record) || record.status==='running')return;
    hashing.add(record);
    root.TACreationRecords.sourceKey(record.output).then(key=>{
      record.sourceKey=key;
      root.dispatchEvent(new Event('quilvori-drafts'));
    }).catch(()=>{ /* A recovery action retries hashing and reports an unavailable crypto service. */ });
  }
  function hasPastedWork(kind,sourceKey){
    if(!sourceKey)return false;
    const lib=ui().state.lib;
    return lib[kind==='character'?'characters':'worldBooks'].some(work=>work.creationSource===sourceKey) ||
      root.TAStudioDrafts.pending().some(({plan})=>plan.task==='create:'+kind &&
        (plan.sourceKey===sourceKey || plan.operations.some(op=>op.value?.creationSource===sourceKey)));
  }
  // Extra works in an older or unrequested response stay opt-in. A pasted response has no record ID.
  function picker(host,allowed,record,area,session=()=>[]){
    const options=element('fieldset'),legend=element('legend',t(record?'回复中的其他作品':'恢复为待收录草稿'));
    options.append(legend);
    for(const kind of allowed){
      const label=element('label'),input=element('input');label.className='check';input.type='checkbox';
      input.dataset.recoverKind=kind;input.value=kind;input.checked=!record;
      label.append(input,document.createTextNode(t(root.NIJANAI.MODULES[kind])));options.append(label);
    }
    const feedback=element('p');feedback.setAttribute('role','status');feedback.className='help';feedback.dataset.noTranslate='';
    let busy=false;
    const go=button('恢复为待收录草稿',async()=>{
      const selected=[...options.querySelectorAll('input:checked:not(:disabled)')].map(input=>input.value);
      if(busy || !selected.length)return;
      busy=true;go.disabled=true;options.disabled=true;if(area)area.readOnly=true;
      try{
        const raw=record?.output || area.value;
        const report=root.NIJANCreationOutput.collect(raw,selected);
        const sourceKey=record?.sourceKey || await root.TACreationRecords.sourceKey(raw);
        const notes=[],plans=[];
        for(const kind of selected){
          const existing=record && describe(record,root.NIJANModel.history(),session).find(row=>row.kind===kind);
          if(record ? existing && ['draft','adopted','attention'].includes(existing.status) : hasPastedWork(kind,sourceKey)){
            notes.push(t('已有这份草稿或作品'));continue;
          }
          if(!report.results[kind]){notes.push(t(root.NIJANAI.MODULES[kind])+' · '+report.errors[kind]);continue;}
          const plan=await root.NIJANStudio.recoverWork(kind,report.results[kind],sourceKey,record);
          plans.push(plan);notes.push(t('已生成草稿')+' · '+plan.operations[0].value.name);
        }
        feedback.replaceChildren(document.createTextNode(notes.join('\n')));
        for(const plan of plans){
          const open=button('查看草稿',()=>root.NIJANStudio.openDraft(plan.id));
          open.textContent+=' · '+plan.operations[0].value.name;open.dataset.noTranslate='';
          feedback.append(document.createTextNode(' '),open);
        }
        for(const input of options.querySelectorAll('input')){
          if(hasPastedWork(input.value,sourceKey)){input.disabled=true;input.checked=false;}
        }
        ui().toast(notes.join(' · '),{kind:plans.length?'success':'info'});
      }catch(error){feedback.textContent=t(error.message);ui().toast(feedback.textContent,{kind:'error'});}
      finally{busy=false;options.disabled=false;if(area)area.readOnly=false;available();}
    });
    function available(){go.disabled=busy || !options.querySelector('input:checked:not(:disabled)') || (!record && !area.value.trim());}
    options.onchange=available;
    if(record)go.dataset.recoverRecord=record.id;else go.dataset.recoverPasted='';
    if(area)area.addEventListener('input',()=>{
      copiedText=area.value;
      for(const input of options.querySelectorAll('input:disabled')){input.disabled=false;input.checked=true;}
      feedback.replaceChildren();available();
    });
    host.append(options,go,feedback);available();
  }

  function mountRecord(host,record,records,session){
    if(!root.TACreationRecords.isWork(record)){
      host.replaceChildren();delete host.dataset.recoveryFor;return;
    }
    ensureHash(record);
    const rows=describe(record,records,session);
    const extras=kinds.filter(kind=>!rows.some(row=>row.kind===kind) && (record.workRun || !hasPastedWork(kind,record.sourceKey)) && record.output?.trim() &&
      !['running','received'].includes(record.status) && inspect(record,kind).result);
    const signature=JSON.stringify([record.id,root.TAI18n?.prefs.lang,extras,rows.map(({kind,status,source,name,detail,workId,draftId})=>
      [kind,status,source.id,name,detail,workId,draftId])]);
    if(host.dataset.recoveryFor===signature)return;
    host.dataset.recoveryFor=signature;
    const heading=element('h4',t('作品去向')),list=element('ul');list.className='work-outcomes';
    function latest(kind){
      const all=root.NIJANModel.history(),selected=all.find(r=>r.id===record.id);
      return selected && describe(selected,all,session).find(r=>r.kind===kind);
    }
    for(const row of rows){
      const li=element('li');li.dataset.workOutcome=row.kind;li.dataset.outcomeState=row.status;
      const title=element('strong',t(root.NIJANAI.MODULES[row.kind]));
      if(row.name){
        const name=element('span',' · '+row.name);name.dataset.noTranslate='';title.append(name);
      }
      const status=element('span',t(states[row.status]));status.className='work-outcome-status';
      li.append(title,status);
      if(row.detail){
        const note=element('p',row.literalDetail ? row.detail : t(row.detail));
        note.className='help';note.dataset.noTranslate='';li.append(note);
      }
      if(row.status==='adopted' || row.status==='draft'){
        const open=button(row.status==='draft'?'查看草稿':'打开已收录作品',async()=>{
          try{
            if(root.TALibraryDB.database()){
              await root.TALibraryDB.replacementGuard();
              if(row.status==='draft')await root.TAStudioDrafts.load(root.TALibraryDB.database());
            }
            const current=latest(row.kind);
            if(current?.status==='draft')await root.NIJANStudio.openDraft(current.draftId);
            else if(current?.status==='adopted')await root.TASearch.open({kind:row.kind==='world'?'book':'character',id:current.workId,selectOnly:true,field:'name'});
            else root.dispatchEvent(new Event('quilvori-drafts'));
          }catch(error){ui().toast(t(error.message),{kind:'error'});}
        });
        open.dataset.outcomeOpen=row.kind;li.append(open);
      }else if(row.status==='recoverable'){
        const action=button('从原回复恢复草稿',async()=>{
          if(action.disabled)return;
          action.disabled=true;
          try{
            const current=latest(row.kind);
            if(current?.status!=='recoverable'){root.dispatchEvent(new Event('quilvori-drafts'));return;}
            const source=current.source,hash=source.sourceKey || await root.TACreationRecords.sourceKey(source.output);
            const {result}=inspect(source,row.kind);
            await root.NIJANStudio.recoverWork(row.kind,result,hash,source);
            ui().toast(t('已保存到本机草稿'),{kind:'success'});
            const log=document.querySelector('#ai-task-record');
            if(log?.querySelector('#ai-task-select')?.value===record.id)log.querySelector('[data-outcome-open="'+row.kind+'"]')?.focus();
          }catch(error){ui().toast(t(error.message),{kind:'error'});}
          finally{action.disabled=false;}
        });
        action.dataset.outcomeRecover=row.kind;action.dataset.recoverRecord=row.source.id;li.append(action);
      }
      list.append(li);
    }
    host.replaceChildren(heading,list);
    if(extras.length)picker(host,extras,record,null,session);
  }
  function mountPaste(host){
    const details=element('details');details.dataset.pasteEntry='';details.className='stack';
    details.append(element('summary',t('从旧版原始结果恢复')));
    const label=element('label'),area=element('textarea');label.className='field';area.rows=4;area.dataset.recoverPaste='';
    area.value=copiedText;
    label.append(element('span',t('粘贴完整的原始结果')),area);
    details.append(label);picker(details,kinds,null,area);host.append(details);
  }
  root.TACreativeRecovery={mountRecord,mountPaste,recordError,clear:()=>{copiedText='';}};
})(globalThis);
