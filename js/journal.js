/* Local story notes optionally refer to messages in one imported conversation. */
(function (root) {
  'use strict';
  const ui = () => root.TAUI;
  const tr = (key,vars) => root.TAI18n ? root.TAI18n.t(key,vars) : key;
  const esc = value=>ui().esc(value);
  const collection = kind=>kind==='beat'?'beats':'notes';
  const title = row=>row.title || tr('未命名');
  const chatName = chat=>chat.name || chat.characterName || tr('未命名');
  const labelFor = kind=>tr(kind==='beat'?'情节':'消息注记');
  const pos = value=>Number.isSafeInteger(value) && value>=0;
  function stamp(message) {
    // Fingerprint only message identity, without copying private dialogue into a note.
    const text=JSON.stringify([message.name || '',message.send_date || '',Boolean(message.is_user),Boolean(message.is_system),message.mes || '']);
    let a=2166136261,b=5381;
    for(let n=0;n<text.length;n++){const c=text.charCodeAt(n);a=Math.imul(a^c,16777619);b=Math.imul(b,33)^c;}
    return text.length.toString(36)+'-'+(a>>>0).toString(36)+'-'+(b>>>0).toString(36);
  }
  function attachment(chat,floor) {
    if (!chat?.id || !pos(floor) || !chat.messages?.[floor]) throw new Error(tr('原消息已变动，请重新关联。'));
    return {chatId:chat.id,floor,messageStamp:stamp(chat.messages[floor])};
  }
  function resolve(library,row) {
    if (!row?.chatId) return {state:'unlinked'};
    const chat=library.chats.find(item=>item.id===row.chatId);
    if (!chat) return {state:'missing'};
    if (row.floor===null || row.floor===undefined) return {state:'chat',chat};
    if (!pos(row.floor)) return {state:'changed',chat};
    const data=chat.messages[row.floor];
    if (data && (!row.messageStamp || stamp(data)===row.messageStamp)) return {state:'message',chat,floor:row.floor};
    if (row.messageStamp) {
      const candidate=[];
      for(let i=0;i<chat.messages.length;i++) if (stamp(chat.messages[i])===row.messageStamp) candidate.push(i);
      if (candidate.length===1) return {state:'message',chat,floor:candidate[0]};
    }
    return {state:'changed',chat};
  }
  function allItems(lib) {
    return ['note','beat'].flatMap(kind=>lib.timeline[collection(kind)].map(row=>({kind,row})));
  }
  function sourceText(location,row) {
    if (location.state==='message') return chatName(location.chat)+' · #'+(location.floor+1);
    if (location.state==='chat') return chatName(location.chat);
    if (location.state==='missing') return tr('关联的聊天已移除');
    if (location.state==='changed') return chatName(location.chat)+' · '+tr('原消息已变动，请重新关联。');
    return pos(row.floor) ? tr('独立规划')+' · #'+(row.floor+1) : tr('独立规划');
  }
  function goMessage(location) {
    if (location.state!=='message' && location.state!=='chat') return;
    const st=ui().state;
    st.sel.chat=location.chat.id;
    st.journalJump=location.state==='message'?attachment(location.chat,location.floor):null;
    st.passageQuery='';
    ui().go('chat');
  }
  function goItem(kind,id) {
    const st=ui().state;
    st.sel.tlKind=kind;st.sel.tl=id;
    ui().go('timeline');
  }
  function createItem(kind, link={floor:null}) {
    const lib=ui().state.lib, id=root.TAStore.uid(kind);
    const row=kind==='beat'?{id,title:tr('新情节'),summary:'',order:lib.timeline.beats.length+1,...link}:{id,title:tr('新注记'),body:'',...link};
    lib.timeline[collection(kind)].push(row);
    ui().state.sel.tlKind=kind;ui().state.sel.tl=id;ui().markDirty('timeline');
    return row;
  }
  function assistScope(lib,chatId,from,to) {
    if (!chatId) return null;
    const chat=lib.chats.find(item=>item.id===chatId);
    if (!chat) throw new Error(tr('关联的聊天已移除'));
    const first=Number(from), last=Number(to);
    if (!Number.isSafeInteger(first)||!Number.isSafeInteger(last)||first<1||last<first||last>chat.messages.length) throw new Error(tr('请选择聊天中有效的消息范围。'));
    const messages=chat.messages.slice(first-1,last).map((m,i)=>({floor:first-1+i,speaker:String(m.name||''),text:String(m.mes||''),sourceStamp:stamp(m)}));
    return {chatId:chat.id,name:chatName(chat),messages};
  }
  function lineLabel(message,index) {
    return '#'+(index+1)+' · '+(message.name||'')+' · '+String(message.mes||'').replace(/\s+/g,' ').slice(0,75);
  }
  function mountAssist(box) {
    if (box.querySelector('[data-journal-source]')) return;
    const st=ui().state,lib=st.lib;
    const scope=st.journalScope || (st.journalScope={chatId:'',from:1,to:1});
    const details=document.createElement('section');details.className='stack';
    const opt=document.createElement('label');opt.className='field';
    const cap=document.createElement('span');cap.className='field-label';cap.textContent=tr('AI 参考的聊天');
    const select=document.createElement('select');select.dataset.journalSource='';select.dataset.noTranslate='';
    select.append(new Option(tr('仅使用写下的要求'),''));
    for(const chat of lib.chats) if(chat.messages.length) select.append(new Option(chatName(chat),chat.id));
    select.value=scope.chatId;
    if (!select.value) scope.chatId='';
    opt.append(cap,select);details.append(opt);
    const fields=document.createElement('div');fields.className='row';
    for(const [key,label] of [['from','从第几条'],['to','到第几条']]) {
      const wrap=document.createElement('label');wrap.className='field';wrap.append(tr(label));
      const input=document.createElement('input');input.type='number';input.min='1';input.step='1';input.dataset.journalRange=key;
      input.oninput=()=>{scope[key]=input.value;};wrap.append(input);fields.append(wrap);
    }
    const hint=document.createElement('small');hint.className='help';hint.textContent=tr('生成时只会附上选中范围内的发言人和正文。');fields.append(hint);
    details.append(fields);const field=box.querySelector('[data-assist]')?.closest('label');
    if (field) field.before(details);else box.prepend(details);
    function sync() {
      fields.hidden=!scope.chatId;
      const total=lib.chats.find(c=>c.id===scope.chatId)?.messages?.length || 1;
      for(const n of fields.querySelectorAll('input')) {n.max=String(total);n.value=String(scope[n.dataset.journalRange]);}
    }
    select.onchange=()=>{scope.chatId=select.value;scope.from=1;scope.to=1;sync();};sync();
  }
  function context(box,note) {
    const id=box.querySelector('[data-journal-source]')?.value || '';
    const get = key=>box.querySelector('[data-journal-range="'+key+'"]')?.value;
    const source=assistScope(ui().state.lib,id,get('from'),get('to'));
    return source?{brief:note,journalSource:source}:{brief:note};
  }
  function proposalLink(lib,scope,floor) {
    if (!scope) return {floor:floor??null};
    const chat=lib.chats.find(item=>item.id===scope.chatId);
    if (!chat) throw new Error(tr('关联的聊天已移除'));
    if(floor===undefined) return {chatId:chat.id,floor:null};
    const original=scope.messages.find(m=>m.floor===floor);
    if (!original) throw new Error(tr('模型引用了选段以外的消息。'));
    const target={chatId:chat.id,floor,messageStamp:original.sourceStamp};
    const location=resolve(lib,target);
    if(location.state!=='message')throw new Error(tr('原消息已变动，请重新关联。'));
    return attachment(chat,location.floor);
  }

  function render(stage,mountAssistant) {
    const st=ui().state,lib=st.lib;
    const items=allItems(lib)
      .filter(({row})=>ui().matchQuery([row.title,row.body,row.summary].filter(Boolean).join('\n')))
      .map(item=>({...item,location:resolve(lib,item.row)}))
      .sort((a,b)=>String(a.row.chatId||'').localeCompare(String(b.row.chatId||'')) ||
        (a.location.floor??a.row.floor??Infinity)-(b.location.floor??b.row.floor??Infinity) || (a.row.order??0)-(b.row.order??0));
    stage.innerHTML='<div class="toolbar"><button type="button" class="btn btn-primary" id="add-note"></button><button type="button" class="btn" id="add-beat"></button><button type="button" class="btn" id="export-tl"></button></div><div class="work"><section class="paper stack"><h3></h3><div class="timeline" id="tl"></div></section><div id="tl-editor"></div></div>';
    const text=(sel,s)=>{stage.querySelector(sel).textContent=tr(s);};
    text('#add-note','新建注记');text('#add-beat','添加情节');text('#export-tl','导出剧情手记');text('.work h3','手记目录');
    stage.querySelector('#add-note').onclick=()=>{createItem('note');ui().renderStage();};
    stage.querySelector('#add-beat').onclick=()=>{createItem('beat');ui().renderStage();};
    stage.querySelector('#export-tl').onclick=()=>{const name='timeline.json';ui().downloadJson(name,root.TAFormats.timelineToExport(lib));ui().showExport(name,'剧情手记');};
    const index=stage.querySelector('#tl'),editor=stage.querySelector('#tl-editor');
    function paintList() {
      index.replaceChildren();
      for(const {kind,row,location} of items){
        const button=document.createElement('button');button.type='button';button.className='paper tl-item';
        button.setAttribute('aria-pressed',String(st.sel.tl===row.id && st.sel.tlKind===kind));
        button.dataset.id=row.id;button.dataset.kind=kind;
        const address=document.createElement('small');address.dataset.noTranslate='';address.textContent=labelFor(kind)+' · '+sourceText(location,row);
        const name=document.createElement('strong');name.dataset.noTranslate='';name.textContent=title(row);
        const desc=document.createElement('p');desc.className='muted';desc.dataset.noTranslate='';desc.textContent=(row.body || row.summary || '').slice(0,110);
        button.append(address,name,desc);button.onclick=()=>{st.sel.tlKind=kind;st.sel.tl=row.id;paintList();paintEditor(kind,row);};
        index.append(button);
      }
      if(!items.length){const empty=document.createElement('p');empty.className='help';empty.textContent=tr('写下待发生的情节，或从聊天里的某条消息添加注记。');index.append(empty);}
    }
    function paintEditor(kind,row) {
      if(!row) {editor.replaceChildren();return;}
      const location=resolve(lib,row),hasChat=!!row.chatId,chat=location.chat;
      const options=lib.chats.map(c=>'<option value="'+esc(c.id)+'">'+esc(chatName(c))+'</option>').join('');
      const useFloor=location.state==='message'?location.floor:row.floor;
      editor.innerHTML='<div class="paper stack">'+
        ui().field(tr('标题'),ui().text('title',row.title))+
        (kind==='beat'?ui().field(tr('顺序'),'<input data-field="order" type="number" min="1" value="'+esc(row.order ?? 1)+'">'):'')+
        ui().field(tr(kind==='beat'?'摘要':'正文'),ui().area(kind==='beat'?'summary':'body',row.summary || row.body || '',6))+
        ui().field(tr('关联的聊天'),'<select data-note-chat data-no-translate><option value="">'+esc(tr('独立规划'))+'</option>'+options+
          ((hasChat&&!chat)?'<option value="'+esc(row.chatId)+'">'+esc(tr('关联的聊天已移除'))+'</option>':'')+'</select>')+
        ui().field(tr(hasChat?'关联的消息':'计划消息序号'),'<input type="number" data-note-floor min="1" step="1" '+(chat?'max="'+chat.messages.length+'"':'')+' '+(hasChat&&!chat?'disabled':'')+' value="'+(pos(useFloor)?(useFloor+1):'')+'">',tr(hasChat?'消息从 1 开始；留空关联整场聊天。':'从 1 开始，可留空。'))+
        '<p data-source-excerpt data-no-translate class="help"></p><div class="row"><button type="button" class="btn" data-open-source>'+esc(tr('打开聊天原文'))+'</button><button type="button" class="btn btn-danger" id="del-tl">'+esc(tr('删除'))+'</button></div></div>';
      const pick=editor.querySelector('[data-note-chat]'),floor=editor.querySelector('[data-note-floor]'),open=editor.querySelector('[data-open-source]');
      pick.value=row.chatId || '';open.disabled=!['message','chat'].includes(location.state);
      const excerpt=editor.querySelector('[data-source-excerpt]');
      excerpt.textContent=location.state==='message'?lineLabel(chat.messages[location.floor],location.floor):hasChat?sourceText(location,row):'';
      open.onclick=()=>goMessage(resolve(ui().state.lib,row));
      ui().bindFields(editor,row,()=>paintList(),['timeline']);ui().mountLengths(editor);
      pick.onchange=()=>{if(pick.value)row.chatId=pick.value;else delete row.chatId;delete row.messageStamp;row.floor=null;ui().markDirty('timeline');ui().renderStage();};
      floor.onchange=()=>{
        const n=floor.value===''?null:Number(floor.value)-1;
        if (n!==null && (!pos(n) || (chat && !chat.messages[n]))) {floor.reportValidity();return;}
        if(chat && n!==null)Object.assign(row,attachment(chat,n));else {row.floor=n;delete row.messageStamp;}
        ui().markDirty('timeline');ui().renderStage();
      };
      editor.querySelector('#del-tl').onclick=async()=>{
        const yes=await ui().ask({title:tr('删除手记？'),body:title(row),actions:[{id:'yes',label:tr('删除'),kind:'btn-danger'},{id:'no',label:tr('取消')}]});
        if(yes!=='yes')return;
        const live=ui().state.lib.timeline[collection(kind)];const at=live.findIndex(item=>item.id===row.id);if(at<0)return;
        live.splice(at,1);st.sel.tl=null;ui().markDirty('timeline');ui().renderStage();
      };
    }
    const selected=items.find(it=>it.row.id===st.sel.tl && it.kind===st.sel.tlKind) || items[0];
    if(selected){st.sel.tl=selected.row.id;st.sel.tlKind=selected.kind;}
    paintList();if(selected)paintEditor(selected.kind,selected.row);
    if(mountAssistant)mountAssistant(stage,'timeline');
  }
  function markChat(log,chat) {
    const st=ui().state,refs=new Map();
    for(const item of allItems(st.lib)){
      if(item.row.chatId!==chat.id)continue;
      const link=resolve(st.lib,item.row);
      if(link.state!=='message')continue;
      if(!refs.has(link.floor))refs.set(link.floor,[]);
      refs.get(link.floor).push(item);
    }
    log.querySelectorAll('article[data-index]').forEach(article=>{
      const floor=Number(article.dataset.index),header=article.querySelector('header');
      const actions=document.createElement('span');actions.className='row';
      const add=document.createElement('button');add.type='button';add.className='btn btn-small';add.dataset.messageNote='';
      add.textContent=tr('添加手记');add.setAttribute('aria-label',tr('添加手记')+' · #'+(floor+1));
      add.onclick=()=>{const row=createItem('note',attachment(chat,floor));goItem('note',row.id);};actions.append(add);
      for(const {kind,row} of refs.get(floor)||[]) {
        const view=document.createElement('button');view.type='button';view.className='btn btn-small';view.dataset.noTranslate='';
        view.textContent=labelFor(kind)+' · '+title(row);view.onclick=()=>goItem(kind,row.id);actions.append(view);
      }
      header.append(actions);
    });
    const anchor=st.journalJump;
    if(!anchor || anchor.chatId!==chat.id)return;
    const loc=resolve(st.lib,anchor);delete st.journalJump;
    if(loc.state!=='message'){ui().toast(tr('原消息已变动，请重新关联。'));return;}
    const row=log.querySelector('[data-index="'+loc.floor+'"]');
    if(row){row.tabIndex=-1;row.dataset.journalTarget='';row.focus({preventScroll:true});row.scrollIntoView({block:'center'});}
  }
  root.TAJournal={render,markChat,mountAssist,context,resolve,attachment,assistScope,proposalLink};
})(globalThis);
