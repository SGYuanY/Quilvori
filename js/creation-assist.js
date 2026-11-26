/* Explicit works for quick replies and before/after examples for the regex editor. */
(function (root) {
  'use strict';
  const ui=()=>root.TAUI;
  const tr=key=>ui().t(key);
  const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
  const prefs=()=>ui().state.replyReference ||= {characterId:'',bookId:'',scope:'relevant',entryIds:[]};
  const rxInputs=()=>ui().state.regexExamples ||= {original:'',expected:'',unchanged:'',mode:'replace',find:'',replace:''};
  function field(label,control){
    const wrap=node('label'),caption=node('span',tr(label));
    wrap.className='field';caption.className='field-label';wrap.append(caption,control);return wrap;
  }
  function option(label,value,authored=false){
    const el=new Option(label,value);if(authored)el.dataset.noTranslate='';return el;
  }
  function choose(label,items,selected,allLabel,prop) {
    const select=node('select');select.dataset[prop]='';select.setAttribute('aria-label',tr(label));
    select.add(option(tr(allLabel),''));
    for(const item of items)select.add(option(item.name || tr('未命名'),item.id,true));
    select.value=selected;return select;
  }
  function quickContext(lib,setting,brief){
    const card=lib.characters.find(item=>item.id===setting.characterId);
    const book=lib.worldBooks.find(item=>item.id===setting.bookId);
    let referenceBook=null;
    if(book){
      const value=root.NIJANStudio.bookContent(book);
      if(setting.scope==='selected'){
        const ids=new Set(setting.entryIds);
        referenceBook={...value,entries:value.entries.filter(entry=>ids.has(entry.id)),scope:{mode:'selected_entries',totalEntries:book.entries.length}};
      }else{
        const terms=[brief,card?.name,card?.scenario].filter(Boolean).join('\n');
        referenceBook=root.NIJANAI.referenceBook(value,terms,[],80000,{onlyRelevant:true});
      }
    }
    return {brief,reference:{card:card?root.NIJANStudio.cardContent(card):null,book:referenceBook},
      quickSource:{characterId:card?.id||'',characterName:card?.name||'',bookId:book?.id||'',bookName:book?.name||'',scope:setting.scope==='selected'?'selected':'relevant',
        entryIds:(referenceBook?.entries||[]).map(e=>e.id)}};
  }
  function quickFields(box){
    const s=prefs(), lib=ui().state.lib;
    const row=node('div');row.className='reply-reference';const title=node('h4',tr('这组回复参考的作品'));
    const card=choose('参考角色卡',lib.characters,s.characterId,'通用回复','refCard');
    const book=choose('参考世界书',lib.worldBooks,s.bookId,'不选用','refWorld');
    const fields=node('div');fields.className='grid-2';fields.append(field('参考角色卡',card),field('参考世界书',book));
    const extras=node('div');row.append(title,fields,extras);
    box.querySelector('label')?.before(row);
    function paintBook(){
      extras.replaceChildren();
      const chosen=lib.worldBooks.find(item=>item.id===s.bookId);
      if(!chosen)return;
      const scope=node('select');scope.dataset.refScope='';
      scope.add(option(tr('按要求选取相关条目'),'relevant'));scope.add(option(tr('只参考勾选的条目'),'selected'));
      scope.value=s.scope;extras.append(field('条目范围',scope));
      if(s.scope==='selected'){
        const choices=node('fieldset');choices.className='reply-entry-choices';choices.append(node('legend',tr('选择条目')));
        chosen.entries.forEach(entry=>{
          const label=node('label'),check=node('input');label.className='check';check.type='checkbox';check.value=entry.id;check.checked=s.entryIds.includes(entry.id);
          check.onchange=()=>{const ids=new Set(s.entryIds);if(check.checked)ids.add(entry.id);else ids.delete(entry.id);s.entryIds=[...ids];};
          const name=node('span',entry.comment||tr('未命名'));name.dataset.noTranslate='';label.append(check,name);choices.append(label);
        });
        const help=node('small',tr('未勾选条目时，只使用世界书名称和简介。'));help.className='help';choices.append(help);
        extras.append(choices);
      }
      scope.onchange=()=>{s.scope=scope.value;paintBook();};
    }
    card.onchange=()=>{
      s.characterId=card.value;
      if(!s.bookId){
        const current=lib.characters.find(item=>item.id===card.value),id=current?.embeddedBookId??current?.source?.embeddedBookId;
        if(lib.worldBooks.some(item=>item.id===id)){s.bookId=id;book.value=id;paintBook();}
      }
    };
    book.onchange=()=>{s.bookId=book.value;s.entryIds=[];paintBook();};
    paintBook();
  }
  // Literal templates let the user define exactly what can match; the replacement stays literal in ST.
  function templateRegex(mode,find,replacement=''){
    if(!find || !['prefix','replace'].includes(mode))throw new Error('请先填写要匹配的文字。');
    const escaped=String(find).replace(/[.*+?^${}()|[\]\\/]/g,'\\$&').replace(/\r/g,'\\r').replace(/\n/g,'\\n');
    const pattern=(mode==='prefix'?'^':'')+escaped,flags=mode==='prefix'?'gm':'g';
    return {findRegex:'/'+pattern+'/'+flags,replaceString:mode==='prefix'?'':String(replacement).replace(/\$/g,()=> '$$')};
  }
  function buildExamples(box){
    const state=rxInputs(),section=node('details');section.className='regex-examples';section.open=true;
    const summary=node('summary',tr('用例子写正则'));section.append(summary);
    const grid=node('div');grid.className='grid-2';
    const samples=[['original','原文示例'],['expected','希望得到的文字'],['unchanged','应保持原样的例子']];
    for(const [key,label] of samples){
      const area=node('textarea');area.rows=2;area.dataset.regexExample=key;area.dataset.nolen='';area.value=state[key];
      area.oninput=()=>{state[key]=area.value;update();};
      grid.append(field(label,area));
    }
    section.append(grid);
    const mode=node('select');mode.add(option(tr('替换指定文字'),'replace'));mode.add(option(tr('删除每行开头的文字'),'prefix'));mode.value=state.mode;
    const find=node('input'),replace=node('input');find.type=replace.type='text';find.value=state.find;replace.value=state.replace;find.dataset.regexFind='';replace.dataset.regexReplace='';
    const replaceField=field('替换为',replace),tools=node('div');tools.className='regex-template-grid';tools.append(field('离线模板',mode),field('匹配文字',find),replaceField);
    const trial=node('pre');trial.className='snippet';trial.dataset.noTranslate='';trial.dataset.templatePreview='';
    const status=node('p');status.className='help';status.setAttribute('role','status');
    const use=node('button',tr('把规则存为脚本'));use.type='button';use.className='btn btn-small';use.dataset.keepRegex='';
    const example=node('button',tr('填入示例'));example.type='button';example.className='btn btn-small';
    const stop=node('button',tr('停止试跑'));stop.type='button';stop.className='btn btn-small';stop.hidden=true;
    const buttons=node('div');buttons.className='row';buttons.append(example,use,stop);
    section.append(tools,trial,status,buttons);
    box.querySelector('label')?.before(section);
    const runner=root.TARegexRunner.createRunner();
    let generation=0,timer,verifiedPattern;
    function resetTrial(){
      generation++;clearTimeout(timer);runner.cancel();
      verifiedPattern=null;use.disabled=true;stop.hidden=true;
    }
    stop.onclick=()=>{resetTrial();status.textContent=tr('正则试跑已取消。');};
    function update(){
      resetTrial();
      replaceField.hidden=state.mode==='prefix';
      trial.hidden=!state.find || !state.original; status.textContent='';trial.textContent='';
      if(trial.hidden)return;
      const current=generation;
      timer=setTimeout(async()=>{
        if(!section.isConnected)return;
        stop.hidden=false;status.textContent=tr('正在试跑正则…');
        try{
          const pattern=templateRegex(state.mode,state.find,state.replace);
          const samples=state.unchanged?[state.original,state.unchanged]:[state.original];
          const [first,second]=await runner.run(pattern.findRegex,samples,pattern.replaceString);
          if(current!==generation || !section.isConnected)return;
          const ok=first.ok && !first.miss && first.replaced===state.expected && (!second || (second.ok && second.replaced===state.unchanged));
          verifiedPattern=ok?pattern:null;use.disabled=!ok;
          trial.textContent=pattern.findRegex+'\n'+first.replaced;status.textContent=tr(ok?'样例验证通过':'试跑结果与示例不符');
        }catch(error){if(current===generation)status.textContent=tr(error.message);}
        finally{if(current===generation)stop.hidden=true;}
      },140);
    }
    example.onclick=()=>{
      state.mode='prefix';state.find=tr('旁白：');state.replace='';state.original=state.find+tr('灯灭了。');state.expected=tr('灯灭了。');state.unchanged=tr('她说：灯灭了。');
      for(const [key] of samples)grid.querySelector('[data-regex-example="'+key+'"]').value=state[key];
      mode.value=state.mode;find.value=state.find;replace.value='';update();
    };
    mode.onchange=()=>{state.mode=mode.value;update();};
    find.oninput=()=>{state.find=find.value;update();};
    replace.oninput=()=>{state.replace=replace.value;update();};
    use.onclick=async()=>{
      if(!verifiedPattern || use.disabled)return;
      const script=root.TAFormats.regexFromImport([{scriptName:tr(state.mode==='prefix'?'删除每行开头的文字':'替换指定文字')+' · '+state.find,...verifiedPattern,placement:[2]}])[0];
      script.id=root.TAStore.uid('rx');const next=structuredClone(ui().state.lib);next.regexScripts.unshift(script);
      try{await ui().commitLibrary(next);ui().state.sel.regex=script.id;ui().state.lab=state.original;ui().renderStage();ui().toast(tr('修改已保存'),{kind:'success'});}
      catch(error){ui().toast(tr(error.message),{kind:'error'});}
    };
    update();
  }
  function defaultBrief(kind){
    return kind==='regex' && rxInputs().original ? tr('根据示例生成正则') : '';
  }
  function context(kind,box,brief){
    if(kind==='quick')return quickContext(ui().state.lib,prefs(),brief);
    if(kind==='regex'){
      const {original,expected,unchanged}=rxInputs();
      return {brief:brief || tr('根据示例生成正则'),regexExamples:{original,expected,unchanged}};
    }
    if(kind==='timeline')return root.TAJournal?.context?.(box,brief) || null;
    return null;
  }
  function mount(kind,box){
    if(kind==='quick')quickFields(box);
    if(kind==='regex')buildExamples(box);
    if(kind==='timeline')root.TAJournal?.mountAssist?.(box);
  }
  function selectedReply(stage,set){
    const src=set?.workSource;if(!src)return;
    const lib=ui().state.lib,names=[lib.characters.find(c=>c.id===src.characterId)?.name || src.characterName,lib.worldBooks.find(b=>b.id===src.bookId)?.name || src.bookName].filter(Boolean);
    if(!names.length)return;
    const line=node('p');line.className='help';line.textContent=tr('这组回复参考的作品')+' · '+names.join(' / ');line.dataset.noTranslate='';
    stage.querySelector('#qr-body').before(line);
  }
  root.TACreationAssist={mount,context,defaultBrief,quickContext,templateRegex,selectedReply};
})(globalThis);
