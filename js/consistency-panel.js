/* Local consistency findings and saved model reviews for the selected works. */
(function(root){
  'use strict';
  const ui=()=>root.TAUI, t=(key,vars)=>ui().t(key,vars), esc=value=>ui().esc(value);
  function excerpt(text,token){
    return token ? text.split(token).map(esc).join(`<mark>${esc(token)}</mark>`) : esc(text);
  }
  function finding(row){
    const severity={error:'冲突',warn:'存疑',info:'备注'};
    return `<article class="paper finding"><div class="sev ${row.severity}">${esc(t(severity[row.severity]))}</div>
      <h3>${esc(row.title)}</h3><p>${esc(row.detail)}</p>${row.snippet?`<p class="snippet">${excerpt(row.snippet,row.highlight)}</p>`:''}
    </article>`;
  }
  function render(stage){
    const {state}=ui(),{lib,sel}=state;
    const label=key=>esc(t(key));
    stage.innerHTML=`<div class="toolbar consistency-toolbar">
      <div class="consistency-fields">
        <label for="check-char"><span>${label("角色")}</span><select id="check-char" data-no-translate></select></label>
        <label for="check-book"><span>${label("对照世界书")}</span><select id="check-book" data-no-translate></select></label>
      </div>
      <div class="consistency-actions">
        <button type="button" class="btn btn-primary" id="run-check" aria-controls="findings">${label("本地规则检查")}</button>
        <button type="button" class="btn" id="semantic-check" aria-controls="check-ai-panel">${label("AI 逻辑与人设检查")}</button>
        <button type="button" class="btn" id="export-check">${label("导出报告")}</button>
      </div>
    </div>
    <div class="check-tabs" role="tablist" aria-label="${label("人设一致性检查")}">
      <button type="button" role="tab" id="check-local-tab" aria-controls="findings">${label("本地结果")}</button>
      <button type="button" role="tab" id="check-ai-tab" aria-controls="check-ai-panel">${label("AI 检查报告")}</button>
    </div>
    <section id="findings" role="tabpanel" aria-labelledby="check-local-tab" class="check-panel">
      <div class="paper check-summary"><div><p id="check-local-scope" data-no-translate></p><p id="check-local-status" role="status" aria-atomic="true" tabindex="-1" data-no-translate></p></div><time id="check-local-time"></time></div>
      <div id="check-local-items" data-no-translate></div>
      <details id="check-lesson"><summary>${label("检查了哪些内容")}</summary><div></div></details>
    </section>
    <section id="check-ai-panel" role="tabpanel" aria-labelledby="check-ai-tab" class="check-panel" hidden>
      <p class="model-progress" id="check-progress" role="status"></p><div id="model-check"></div>
    </section>`;
    const at=id=>stage.querySelector("#"+id), cards=at("check-char"), books=at("check-book");
    const name=work=>work.name || t('未命名');
    if(!lib.characters.length)cards.add(new Option(t('还没有角色卡'),''));
    for(const card of lib.characters)cards.add(new Option(name(card),card.id));
    books.add(new Option(t('不对照'),''));
    for(const book of lib.worldBooks)books.add(new Option(name(book),book.id));
    const card=ui().selected(lib.characters,sel.checkChar ?? 'ch_draft');
    const book=sel.checkBook===undefined ? lib.worldBooks[0] : root.TAStore.byId(lib.worldBooks,sel.checkBook);
    cards.value=card?.id ?? '';books.value=book?.id ?? '';cards.disabled=!card;
    if(card)sel.checkChar=card.id;
    const local=at("findings"),ai=at("check-ai-panel"),localTab=at("check-local-tab"),aiTab=at("check-ai-tab");
    const status=at("check-local-status"),scope=at("check-local-scope"),time=at("check-local-time"),items=at("check-local-items");
    const run=at("run-check"),exportButton=at("export-check"),aiButton=at("semantic-check"),model=at("model-check");
    const lesson=at("check-lesson");
    ui().fillLesson(lesson.lastElementChild,['check.empty','check.names','check.colors','check.rules'].map(key=>t(key)));
    let localReport=null,aiReport=null,aiError=false,timer;
    function selection(){
      return {card:root.TAStore.byId(state.lib.characters,cards.value),book:root.TAStore.byId(state.lib.worldBooks,books.value)};
    }
    function source(){
      const {card,book}=selection();
      return {card:root.NIJANStudio.cardContent(card),book:root.NIJANStudio.bookContent(book)};
    }
    function showTab(next,focus=false){
      const openingAI=next==='ai' && ai.hidden;
      state.checkTab=next;local.hidden=next!=='local';ai.hidden=!local.hidden;
      for(const [tab,panel] of [[localTab,local],[aiTab,ai]]){
        tab.setAttribute('aria-selected',String(!panel.hidden));tab.tabIndex=panel.hidden?-1:0;
        if(focus && !panel.hidden)tab.focus();
      }
      if(openingAI)paintAI();
    }
    localTab.onclick=()=>showTab('local');aiTab.onclick=()=>showTab('ai');
    localTab.parentElement.onkeydown=event=>{
      if(!['Home','End','ArrowLeft','ArrowRight'].includes(event.key))return;
      event.preventDefault();
      const next=event.key==='Home'?'local':event.key==='End'?'ai':event.target===localTab?'ai':'local';
      showTab(next,true);
    };
    function updateExport(){
      state.lastFindings=localReport ? {...localReport,aiReview:aiReport} : null;
      exportButton.disabled=!localReport;
    }
    function paintLocal(){
      clearTimeout(timer);
      const {card,book}=selection();
      local.removeAttribute('aria-busy');localReport=null;items.replaceChildren();time.textContent='';time.removeAttribute('datetime');
      scope.textContent='';
      run.disabled=!card;lesson.hidden=!card;
      if(!card){
        status.textContent=t('还没有角色卡可检查');
        items.innerHTML=`<div class="row"><button class="btn btn-primary" type="button" data-check-import>${label("导入角色卡")}</button>${root.nijanDesktop?`<button class="btn" type="button" data-check-folder>${label("读取角色卡文件夹")}</button>`:''}</div>`;
        items.querySelector("[data-check-import]").onclick=()=>document.querySelector('[data-shell="import-card"]').click();
        items.querySelector('[data-check-folder]')?.addEventListener('click',()=>ui().readFolders());
      }else{
        try{
          const scopeParts=[t('check.scopeCard',{card:name(card)})];
          if(book){
            const count=(book.entries ?? []).filter(row=>row.constant && row.enabled!==false).length;
            scopeParts.push(t('check.scopeBook',{book:name(book)}),t('check.constantEntries',{count}));
          }else scopeParts.push(t('不对照'));
          scope.textContent=scopeParts.join(' · ');
          const findings=root.TAFormats.checkConsistency({characters:state.lib.characters,worldBooks:book?[book]:[]},card.id,book?.id)
            .map(row=>({...row,title:t(row.title),detail:t(row.detail)}));
          const counts={error:0,warn:0,info:0};
          for(const row of findings)counts[row.severity]++;
          status.textContent=findings.length?t('check.localCounts',counts):t('本地规则未发现问题。');
          const now=new Date();time.dateTime=now.toISOString();time.textContent=t('check.completedAt',{time:now.toLocaleTimeString(document.documentElement.lang)});
          items.innerHTML=findings.map(finding).join('');
          localReport={character:card.name,book:book?.name ?? null,localFindings:findings};
        }catch(error){
          status.textContent=t('本地规则检查未完成，请重试。');
          const note=document.createElement("p");note.setAttribute("role","alert");note.textContent=String(error?.message || error);items.replaceChildren(note);
        }
      }
      updateExport();
    }
    function paintAI(){
      aiReport=null;aiError=false;
      try{
        const {card,book}=selection(),records=state.lib.settings.aiReviews ?? [];
        if(!Array.isArray(records))throw Error('Invalid review archive');
        const report=records.findLast(row=>row && (row.cardId ?? null)===(card?.id ?? null) && (row.bookId ?? null)===(book?.id ?? null));
        if(!report){
          model.innerHTML=`<p class="help">${label("当前选择还没有 AI 检查报告。")}</p>`;
        }else{
          if(!Array.isArray(report.items))throw Error('Invalid review items');
          const ctx=source();
          const stale=report.source!==JSON.stringify({card:ctx.card,book:root.NIJANAI.reviewBook(ctx.book,report.entryIds)});
          const subtitle=[card&&name(card),book&&name(book)].filter(Boolean).join(' · ');
          const date=new Date(report.createdAt);
          model.innerHTML=`<section class="paper ai-review"><h3 data-no-translate>${esc(subtitle)}</h3>
            ${report.entryIds?`<p class="help">${esc(t("check.selectedEntries",{count:report.entryIds.length}))}</p>`:''}
            ${Number.isFinite(date.getTime())?`<p class="help">${esc(date.toLocaleString(document.documentElement.lang))}</p>`:''}
            ${stale?`<p class="banner">${label("报告基于之前的稿件，原文已变化，请重新检查。")}</p>`:''}${root.NIJANReview.html(report,state.lib)}</section>`;
          root.NIJANReview.bind(model,report);
          aiReport={...root.NIJANReview.gradedReport(report,state.lib),stale};
        }
      }catch{
        aiError=true;
        model.innerHTML=`<p class="banner" role="alert">${label("这份 AI 报告无法读取。可在「本地结果」查看规则检查。")}</p>`;
      }
      updateExport();
    }
    aiButton.addEventListener('click',()=>showTab('ai'));
    const syncAI=root.TATaskActivity.bindReview(at("check-progress"),{
      button:aiButton,progress:at("check-progress"),source,selection,after:()=>{if(!ai.hidden)paintAI();},
    });
    showTab(state.checkTab==='ai'?'ai':'local');
    run.onclick=()=>{
      const focused=document.activeElement;
      showTab('local');clearTimeout(timer);
      localReport=null;updateExport();local.setAttribute('aria-busy','true');
      time.textContent='';items.replaceChildren();status.textContent=t('正在运行本地规则检查…');
      timer=setTimeout(()=>{
        if(!local.isConnected)return;
        paintLocal();
        if(!local.hidden && document.activeElement===focused){
          status.focus({preventScroll:true});status.scrollIntoView({block:'nearest'});
        }
      },0);
    };
    cards.onchange=books.onchange=()=>{
      const {card,book}=selection();sel.checkChar=card?.id;sel.checkBook=book?.id ?? '';
      aiReport=null;aiError=false;model.replaceChildren();
      paintLocal();syncAI();
    };
    exportButton.onclick=()=>{
      paintLocal();paintAI();
      if(!state.lastFindings){showTab('local');status.focus();return;}
      const filename=`一致性-${ui().safeName(localReport.character)}.json`;
      ui().downloadJson(filename,state.lastFindings);
      ui().showExport(filename,t(aiError?'已导出本地结果。此前的 AI 报告无法读取。':'已导出当前选择的检查报告。'));
    };
    paintLocal();
  }
  root.TAConsistencyPanel={render};
})(globalThis);
