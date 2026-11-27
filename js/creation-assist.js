/* Explicit works for quick replies and before/after examples for the regex editor. */
(function (root) {
  'use strict';
  const ui=()=>root.TAUI;
  const tr=key=>ui().t(key);
  const node=(tag,text)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;return el;};
  const guides={
    quick:{title:'用 AI 起草快捷回复',generate:'生成回复集预览',save:'保存整套回复',example:'写两个雨夜借宿的快捷回复按钮：一个礼貌敲门，一个询问是否还有空房。每个按钮配一句可直接发送的话。',
      label:'礼貌敲门',body:'请问有人在吗？我想借宿一晚。',
      destination:'导出 Quick Reply v2 JSON。在 SillyTavern 打开扩展 → Quick Reply，导入该文件，再为全局或当前聊天启用这套回复。'},
    timeline:{title:'用 AI 起草剧情手记',generate:'生成手记预览',save:'保存全部手记',example:'把船票背面的第二个日期记成一条线索注记，再写一个回到码头核对日期的后续情节。',
      label:'船票上的第二个日期',body:'背面另写着周五，下一幕回码头找售票员核对。',
      destination:'导出整本手记为 Quilvori JSON。SillyTavern 没有手记 JSON 导入口；可将选段复制到当前聊天的作者注，供模型参考。换机编辑请用整库备份。'},
    script:{title:'用 AI 起草群聊剧本',generate:'生成剧本预览',save:'保存整份剧本',example:'写三拍雾港场景：先响起钟声，接着传来问话，最后留下悬念。使用所选人物；只有旁白时，写成独白。',
      label:'旁白',body:'雾里响起第一声钟。第二声迟迟没有来。',
      destination:'导出 Quilvori 剧本 JSON，供排练或查阅。SillyTavern 没有剧本导入口；要在另一台设备上继续编辑，请使用整库备份。'},
  };
  function authored(tag,text){const item=node(tag,text);item.dataset.noTranslate='';return item;}
  function guide(kind){return Object.hasOwn(guides,kind) ? guides[kind] : null;}
  function selectedCast(){
    const ids=ui().state.scriptCastIds || [];
    return ui().state.lib.characters.filter(card=>ids.includes(card.id));
  }
  function startExample(kind,box){
    const config=guide(kind), area=box.querySelector('[data-assist]'),section=node('div');section.className='authoring-example';
    const title=node('span',tr('示例')),line=authored('p',''),label=node('strong'),body=node('span',tr(config.body));
    title.className='field-label';line.append(label,document.createTextNode(' · '),body);
    const use=node('button');use.type='button';use.className='btn btn-small';use.dataset.assistExample='';
    function refresh(){
      label.textContent=(kind==='script' && selectedCast()[0]?.name) || tr(config.label);
      use.textContent=tr(area.value.trim()?'附加示例要求':'填入示例要求');
    }
    use.onclick=()=>{
      const example=tr(config.example);
      if(!area.value.includes(example))area.value+=(area.value.trim()?'\n\n':'')+example;
      area.dispatchEvent(new Event('input',{bubbles:true}));area.focus();area.setSelectionRange(area.value.length,area.value.length);
    };
    area.addEventListener('input',refresh);box.addEventListener('change',refresh);
    refresh();section.append(title,line,use);area.closest('label').before(section);
  }
  function scriptFields(box){
    const fieldset=node('fieldset'),legend=node('legend',tr('剧本发言人'));fieldset.className='authoring-cast';
    fieldset.append(legend);const cards=ui().state.lib.characters, choices=node('div');choices.className='authoring-cast-list';
    const selected=new Set(selectedCast().map(card=>card.id));
    const names=new Map();for(const card of cards)names.set(card.name,(names.get(card.name) || 0)+1);
    for(const card of cards){
      const label=node('label'),input=node('input');input.type='checkbox';input.checked=selected.has(card.id);input.dataset.scriptSpeaker=String(card.id);
      input.onchange=()=>{if(input.checked)selected.add(card.id);else selected.delete(card.id);ui().state.scriptCastIds=[...selected];};
      const caption=(card.name || tr('未命名'))+(names.get(card.name)>1?' · #'+card.id:'');
      label.className='check';label.append(input,authored('span',caption));choices.append(label);
    }
    const help=node('p',tr(cards.length?'勾选人物后，会发送其名字、描述和性格。留空时只使用旁白。':'暂无角色卡，可以先用旁白写剧本。'));help.className='help';
    fieldset.append(choices,help);box.querySelector('[data-assist]').closest('label').before(fieldset);
  }
  function preview(host,kind,plan){
    host.replaceChildren();
    const lib=ui().state.lib;
    const journal=kind==='timeline'?node('ol'):null;
    if(journal){journal.className='authoring-preview-lines';host.append(journal);}
    function line(container,heading,body,aside){
      const row=node('li');row.append(authored('strong',heading),authored('p',body));
      if(aside)row.append(authored('small',aside));container.append(row);
    }
    for(const op of plan.operations){
      if(op.kind!=='add')continue;
      const value=op.value;
      if(journal){
        const beat=op.path[1]==='beats', journalSource=root.TAJournal.sourceText(root.TAJournal.resolve(lib,value),value);
        line(journal,value.title,beat?value.summary:value.body,tr(beat?'情节':'消息注记')+' · '+journalSource);
        continue;
      }
      const list=node('ol');list.className='authoring-preview-lines';
      host.append(authored('h5',value.name),list);
      if(kind==='quick')for(const reply of value.replies)line(list,reply.label,reply.message);
      if(kind==='script')for(const beat of value.beats){
        const name=beat.speaker==='narrator'?tr('旁白'):root.TAFormats.scriptSpeaker(beat,lib);
        line(list,name,beat.line,beat.trigger?ui().t('script.trigger',{word:beat.trigger}):'');
      }
    }
  }
  const prefs=()=>ui().state.replyReference ||= {characterId:'',bookId:'',scope:'relevant',entryIds:[]};
  const rxInputs=()=>ui().state.regexExamples ||= {...exampleValues(),includeInAI:false};
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
    const card=root.TAStore.byId(lib.characters,setting.characterId);
    const book=root.TAStore.byId(lib.worldBooks,setting.bookId);
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
      quickSource:{characterId:card?.id??'',characterName:card?.name||'',bookId:book?.id??'',bookName:book?.name||'',scope:setting.scope==='selected'?'selected':'relevant',
        entryIds:(referenceBook?.entries||[]).map(e=>e.id)}};
  }
  function quickSourcesAvailable(plan){
    const ref=plan.operations.find(op=>op.path[0]==='quickReplySets')?.value.workSource;
    if(!ref)return true;
    const lib=ui().state.lib,chosen=id=>id!=null && id!=='';
    if(chosen(ref.characterId) && !root.TAStore.byId(lib.characters,ref.characterId))return false;
    if(!chosen(ref.bookId))return true;
    const book=root.TAStore.byId(lib.worldBooks,ref.bookId);
    return !!book && (ref.entryIds || []).every(id=>root.TAStore.byId(book.entries,id));
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
      const current=root.TAStore.byId(lib.characters,card.value);
      s.characterId=current?.id ?? '';
      if(s.bookId==null || s.bookId===''){
        const attached=root.TAStore.byId(lib.worldBooks,current?.embeddedBookId ?? current?.source?.embeddedBookId);
        if(attached){s.bookId=attached.id;book.value=attached.id;paintBook();}
      }
    };
    book.onchange=()=>{s.bookId=root.TAStore.byId(lib.worldBooks,book.value)?.id ?? '';s.entryIds=[];paintBook();};
    paintBook();
  }
  // Literal templates let the user define exactly what can match; the replacement stays literal in ST.
  function templateRegex(mode,find,replacement=''){
    if(!find || !['prefix','replace'].includes(mode))throw new Error('请先填写要匹配的文字。');
    const escaped=String(find).replace(/[.*+?^${}()|[\]\\/]/g,'\\$&').replace(/\r/g,'\\r').replace(/\n/g,'\\n');
    const pattern=(mode==='prefix'?'^':'')+escaped,flags=mode==='prefix'?'gm':'g';
    return {findRegex:'/'+pattern+'/'+flags,replaceString:mode==='prefix'?'':String(replacement).replace(/\$/g,()=> '$$')};
  }
  function exampleValues(){
    const find=tr('旁白：'),expected=tr('灯灭了。');
    return {mode:'prefix',find,replace:'',original:find+expected,expected,unchanged:tr('她说：灯灭了。')};
  }
  function ruleIssue(first,second,sample){
    if(!first.ok)return first.error;
    if(first.miss)return '原文里找不到匹配文字，暂不能保存。';
    if(first.replaced!==sample.expected)return '实际输出与期望结果不同。调整模板或期望结果后才能保存。';
    if(second && (!second.ok || second.replaced!==sample.unchanged))return '规则也改动了应保持原样的例子。请缩小匹配范围再保存。';
    return '';
  }
  async function verifyRegexExamples(plan,context,signal){
    const example=context.regexExamples;
    if(!example?.original || signal?.aborted)return;
    const script=plan.operations.find(op=>op.path[0]==='regexScripts')?.value;
    if(!script)return;
    const runner=root.TARegexRunner.createRunner();
    signal?.addEventListener('abort',runner.cancel,{once:true});
    try{
      const samples=example.unchanged?[example.original,example.unchanged]:[example.original];
      const [first,second]=await runner.run(script.findRegex,samples,script.replaceString);
      const issue=ruleIssue(first,second,example);
      if(issue)throw Error(tr(issue)+(first.ok && !first.miss?'\n'+tr('实际输出')+' · '+(first.replaced || tr('空文本')):''));
    }finally{signal?.removeEventListener('abort',runner.cancel);}
  }
  function buildExamples(box){
    const state=rxInputs(),section=node('details');
    section.className='paper regex-examples regex-guide';section.open=true;
    section.append(node('summary',tr('离线试写正则')));
    const intro=node('p',tr('示例会删去每行开头的旁白标签。修改原文和模板即可试跑。'));intro.className='help';
    const grid=node('div');grid.className='regex-samples';
    const samples=[['original','原文示例'],['expected','希望得到的文字'],['unchanged','应保持原样的例子']];
    const status=node('p');status.className='help';status.id='rx-template-status';status.setAttribute('role','status');
    const include=node('input');include.type='checkbox';include.dataset.regexAiExamples='';include.checked=!!state.includeInAI;
    include.onchange=()=>{state.includeInAI=include.checked;state.aiChoiceExplicit=true;};
    const includeLabel=node('label');includeLabel.className='check';includeLabel.append(include,node('span',tr('将上面的原文、期望结果和反例一并发给模型')));
    const aiArea=box.querySelector('[data-assist]'),aiTitle=box.querySelector('h3');
    aiTitle.textContent=tr('用 AI 生成正则');
    const aiHelp=node('p',tr('需要更复杂的规则时，描述你想改动的文字。确认生成结果后可保存到本机。'));aiHelp.className='help';
    aiArea.closest('label').before(aiHelp,includeLabel);
    for(const [key,label] of samples){
      const area=node('textarea');area.rows=2;area.dataset.regexExample=key;area.dataset.nolen='';area.value=state[key];
      area.oninput=()=>{state[key]=area.value;if(!state.aiChoiceExplicit)state.includeInAI=include.checked=true;update();};
      grid.append(field(label,area));
    }
    const mode=node('select');mode.dataset.regexTemplate='';
    mode.add(option(tr('替换指定文字'),'replace'));mode.add(option(tr('删除每行开头的文字'),'prefix'));mode.value=state.mode;
    const find=node('input'),replace=node('input');find.type=replace.type='text';find.value=state.find;replace.value=state.replace;
    find.dataset.regexFind='';replace.dataset.regexReplace='';
    const replaceField=field('替换为',replace),tools=node('div');tools.className='regex-template-grid';tools.append(field('离线模板',mode),field('匹配文字',find),replaceField);
    const outcome=node('div');outcome.className='regex-template-result';
    const trial=node('pre');trial.className='snippet';trial.dataset.noTranslate='';trial.dataset.templatePreview='';
    const patternText=node('code');patternText.dataset.noTranslate='';patternText.dataset.templatePattern='';
    outcome.append(node('span',tr('实际输出')),trial,patternText);
    const use=node('button',tr('把规则存为脚本'));use.type='button';use.className='btn btn-primary';use.dataset.keepRegex='';use.setAttribute('aria-describedby',status.id);
    const example=node('button',tr('还原示例'));example.type='button';example.className='btn btn-small';example.dataset.regexReset='';
    const stop=node('button',tr('停止试跑'));stop.type='button';stop.className='btn btn-small';stop.hidden=true;
    const buttons=node('div');buttons.className='row';buttons.append(use,stop,example);
    const beforeAfter=node('div');beforeAfter.className='regex-samples regex-before-after';
    beforeAfter.append(grid.firstElementChild,outcome);
    section.append(intro,beforeAfter,tools,grid,status,buttons);
    box.before(section);
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
      outcome.hidden=!state.find || !state.original;
      trial.textContent='';patternText.textContent='';
      if(outcome.hidden){status.textContent=tr(state.original?'请先填写要匹配的文字。':'填入原文，再试跑这条规则。');return;}
      status.textContent=tr('正在试跑正则…');
      const current=generation;
      timer=setTimeout(async()=>{
        if(!section.isConnected)return;
        stop.hidden=false;
        try{
          const pattern=templateRegex(state.mode,state.find,state.replace);
          const texts=state.unchanged?[state.original,state.unchanged]:[state.original];
          const [first,second]=await runner.run(pattern.findRegex,texts,pattern.replaceString);
          if(current!==generation || !section.isConnected)return;
          const issue=ruleIssue(first,second,state);
          verifiedPattern=issue?null:pattern;use.disabled=!!issue;
          patternText.textContent=pattern.findRegex;trial.textContent=first.replaced || tr('空文本');
          status.textContent=tr(issue || '样例验证通过');
        }catch(error){if(current===generation)status.textContent=tr(error.message);}
        finally{if(current===generation)stop.hidden=true;}
      },140);
    }
    example.onclick=()=>{
      Object.assign(state,exampleValues());if(!state.aiChoiceExplicit)state.includeInAI=include.checked=true;
      for(const [key] of samples)section.querySelector('[data-regex-example="'+key+'"]').value=state[key];
      mode.value=state.mode;find.value=state.find;replace.value=state.replace;update();
    };
    mode.onchange=()=>{state.mode=mode.value;update();};
    find.oninput=()=>{state.find=find.value;update();};
    replace.oninput=()=>{state.replace=replace.value;update();};
    use.onclick=async()=>{
      if(!verifiedPattern || use.disabled)return;
      const script=root.TAFormats.regexFromImport({scriptName:tr(state.mode==='prefix'?'删除每行开头的文字':'替换指定文字')+' · '+state.find,...verifiedPattern,placement:[2]})[0];
      script.id=root.TAStore.uid('rx');
      const live=ui().state.lib,next={...live,regexScripts:[script,...live.regexScripts]};
      use.disabled=true;
      try{
        await ui().commitLibrary(next);
        ui().state.lab=state.original;
        await root.TASearch.open({kind:'regex',id:script.id,field:'findRegex'});
        ui().toast(tr('修改已保存'),{kind:'success'});
      }catch(error){use.disabled=!verifiedPattern;ui().toast(tr(error.message),{kind:'error'});}
    };
    update();
  }
  function defaultBrief(kind){
    if(kind!=='regex')return '';
    const input=rxInputs();
    return input.includeInAI!==false && input.original ? tr('根据示例生成正则') : '';
  }
  function context(kind,box,brief){
    if(kind==='quick')return quickContext(ui().state.lib,prefs(),brief);
    if(kind==='script')return {brief,selectedCast:true,availableCharacters:selectedCast().map(({id,name,description,personality})=>({id,name,description,personality}))};
    if(kind==='regex'){
      const {original,expected,unchanged,includeInAI}=rxInputs();
      return includeInAI!==false && original ? {brief:brief || tr('根据示例生成正则'),regexExamples:{original,expected,unchanged}} : {brief};
    }
    if(kind==='timeline')return root.TAJournal?.context?.(box,brief) || null;
    return null;
  }
  function mount(kind,box){
    if(kind==='quick')quickFields(box);
    if(kind==='script')scriptFields(box);
    if(kind==='regex')buildExamples(box);
    if(kind==='timeline')root.TAJournal?.mountAssist?.(box);
    if(guide(kind))startExample(kind,box);
  }
  function selectedReply(stage,set){
    const src=set?.workSource;if(!src)return;
    const lib=ui().state.lib,names=[root.TAStore.byId(lib.characters,src.characterId)?.name || src.characterName,root.TAStore.byId(lib.worldBooks,src.bookId)?.name || src.bookName].filter(Boolean);
    if(!names.length)return;
    const line=node('p');line.className='help';line.textContent=tr('这组回复参考的作品')+' · '+names.join(' / ');line.dataset.noTranslate='';
    stage.querySelector('#qr-body').before(line);
  }
  root.TACreationAssist={mount,context,guide,preview,defaultBrief,quickContext,quickSourcesAvailable,templateRegex,verifyRegexExamples,selectedReply};
})(globalThis);
