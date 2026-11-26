/* Review a finished provider response locally, including one copied from an older window. */
(function(root){
  'use strict';
  let copiedText='';
  const kinds=['character','world'], ui=()=>root.TAUI, t=key=>ui().t(key);
  const element=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  function recovered(kind,sourceKey){
    if(!sourceKey)return false;
    const lib=ui().state.lib, matches=item=>item.creationSource===sourceKey;
    if(lib[kind==='character'?'characters':'worldBooks'].some(matches))return true;
    return root.TAStudioDrafts.pending().some(({plan})=>plan.task==='create:'+kind &&
      (plan.sourceKey===sourceKey || plan.operations.some(op=>op.value?.creationSource===sourceKey)));
  }
  function choices(host,record){
    const options=element('fieldset'),legend=element('legend',t('恢复为待收录草稿'));
    options.append(legend);
    for(const kind of kinds){
      const label=element('label'),input=element('input');label.className='check';input.type='checkbox';
      input.dataset.recoverKind=kind;input.value=kind;
      input.checked=!record || (record.workKinds || [record.task.slice(7)]).includes(kind);
      if(record && recovered(kind,record.sourceKey)){input.disabled=true;input.checked=false;}
      label.append(input,document.createTextNode(t(root.NIJANAI.MODULES[kind])));options.append(label);
    }
    host.append(options);
    return options;
  }
  function button(host,options,record,area){
    const go=element('button',t('恢复为待收录草稿'));
    go.type='button';go.className='btn btn-small btn-primary';
    if(record)go.dataset.recoverRecord=record.id;else go.dataset.recoverPasted='';
    const feedback=element('p');feedback.setAttribute('role','status');feedback.className='help';
    let busy=false;
    function available(){go.disabled=busy || !options.querySelector('input:checked:not(:disabled)') || (!record && !area.value.trim());}
    options.onchange=available;
    if(area)area.addEventListener('input',()=>{
      for(const input of options.querySelectorAll('input:disabled')){input.disabled=false;input.checked=true;}
      feedback.replaceChildren();available();
    });
    go.onclick=async()=>{
      const selected=[...options.querySelectorAll('input:checked:not(:disabled)')].map(input=>input.value);
      if(!selected.length)return;
      busy=true;go.disabled=true;options.disabled=true;if(area)area.readOnly=true;
      try{
        const raw=record?.output || area.value;
        const report=root.NIJANCreationOutput.collect(raw,selected);
        const key=record?.sourceKey || await root.TACreationRecords.sourceKey(raw);
        const notes=[],previews=[];
        for(const kind of selected){
          if(recovered(kind,key)){notes.push(t('已有这份草稿或作品'));continue;}
          if(!report.results[kind]){notes.push(t(root.NIJANAI.MODULES[kind])+' · '+t(report.errors[kind]));continue;}
          const plan=await root.NIJANStudio.recoverWork(kind,report.results[kind],key,record);
          previews.push(plan);notes.push(t('已生成草稿')+' · '+plan.operations[0].value.name);
        }
        feedback.replaceChildren(document.createTextNode(notes.join('\n')));
        for(const plan of previews){
          const view=element('button',t('查看草稿')+' · '+plan.operations[0].value.name);
          view.type='button';view.className='btn btn-small';view.dataset.noTranslate='';view.onclick=()=>root.NIJANStudio.openDraft(plan.id);
          feedback.append(document.createTextNode(' '),view);
        }
        for(const input of options.querySelectorAll('input'))if(recovered(input.value,key)){input.disabled=true;input.checked=false;}
        ui().toast(notes.join(' · '),{kind:previews.length?'success':'info'});
      }catch(error){feedback.textContent=t(error.message);ui().toast(feedback.textContent,{kind:'error'});}
      finally{busy=false;options.disabled=false;if(area)area.readOnly=false;available();}
    };
    host.append(go,feedback);available();
  }
  function mountRecord(host,record){
    const show=root.TACreationRecords.isWork(record) && !!record.output && !['running','received'].includes(record.status);
    const stamp=show?record.id:'';
    if(host.dataset.recoveryFor===stamp)return;
    host.dataset.recoveryFor=stamp;host.replaceChildren();
    if(!show)return;
    const options=choices(host,record);
    if(!options.querySelector('input:not(:disabled)')){
      host.replaceChildren(element('p',t('已有这份草稿或作品')));return;
    }
    button(host,options,record,null);
  }
  function mountPaste(host){
    const details=element('details');details.dataset.pasteEntry='';details.className='stack';
    details.append(element('summary',t('从旧版原始结果恢复')));
    const label=element('label'),area=element('textarea');label.className='field';area.rows=4;area.dataset.recoverPaste='';
    area.value=copiedText;
    area.addEventListener('input',()=>{copiedText=area.value;});
    label.append(element('span',t('粘贴完整的原始结果')),area);
    details.append(label);const options=choices(details,null);button(details,options,null,area);host.append(details);
  }
  root.TACreativeRecovery={mountRecord,mountPaste,clear:()=>{copiedText='';}};
})(globalThis);
