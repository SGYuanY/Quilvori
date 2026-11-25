/* Editor-side context tools. All analysis uses the current local draft. */
(function (root) {
  'use strict';
  const C = root.TAContext;
  const ui = () => root.TAUI;
  const tr = (key, vars) => ui().t(key,vars);
  const title = entry => entry.comment || tr('未命名');
  const sizeText = size => tr('context.size',{chars:size.chars,tokens:size.tokens});
  const basis = () => tr('按文字和语言估算，实际用量取决于模型的分词器。');
  const memory = new WeakMap();
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  function button(text, click) {
    const element = node('button',text,'btn btn-small');
    element.type = 'button'; element.onclick = click;
    return element;
  }
  function message(host,text) { host.append(node('p',text,'help')); }
  function check(text, checked = false) {
    const label = node('label',undefined,'check'), input = document.createElement('input');
    input.type = 'checkbox'; input.checked = checked;
    label.append(input,document.createTextNode(' '+text));
    return {label,input};
  }
  function countPair(host, label, value) {
    const field = node('div'); field.append(node('span',tr(label)),node('b',value)); host.append(field);
  }
  function paged(host, rows, render, empty) {
    if (!rows.length) { if (empty) message(host,tr(empty)); return; }
    let offset = 0;
    const more = button(tr('显示更多'),append);
    function append() {
      more.remove();
      for (const row of rows.slice(offset,offset+25)) host.append(render(row));
      offset += 25;
      if (offset < rows.length) host.append(more);
    }
    append();
  }
  function focusField(host, field, excerpt) {
    const fold = [...host.querySelectorAll('.fold')].find(item=>item.dataset.fold===field);
    if (fold && !fold.classList.contains('on')) fold.querySelector('.fold-name')?.click();
    const input = fold?.querySelector('[data-field],.chip-input') || host.querySelector('[data-field="'+CSS.escape(field)+'"]');
    if (!input) return;
    input.scrollIntoView({block:'center'}); input.focus({preventScroll:true});
    if (excerpt && typeof input.setSelectionRange === 'function') {
      const offset = input.value.indexOf(excerpt);
      if (offset >= 0) input.setSelectionRange(offset,offset+excerpt.length);
    }
  }
  function mountCharacter(host, card) {
    const details = node('details',undefined,'ws-assist-details ctx-panel');
    details.dataset.noTranslate = '';
    const summary = node('summary',tr('角色卡栏位精简检查')), result = node('div',undefined,'ctx-body');
    details.append(summary,result); host.prepend(details);
    const fields = {description:'描述',personality:'性格',scenario:'情景'};
    function paint() {
      if (!details.open) return;
      result.replaceChildren();
      const stats = node('div',undefined,'ctx-metrics');
      for (const [key,label] of Object.entries(fields)) countPair(stats,label,sizeText(C.estimate(card[key])));
      result.append(stats); message(result,basis());
      paged(result,C.characterChecks(card),row=>{
        const item = node('article',undefined,'ctx-result');
        const line = node('div',undefined,'row');
        line.append(node('strong',tr(row.reason)),button(tr(fields[row.field]),()=>focusField(host,row.field,row.excerpt)));
        if (row.other) line.append(button(tr(fields[row.other]),()=>focusField(host,row.other)));
        item.append(line,node('blockquote',row.excerpt)); return item;
      },'未发现过长栏位或跨栏重复句。');
    }
    details.addEventListener('toggle',paint);
    host.addEventListener('input',event=>{ if (Object.hasOwn(fields,event.target.dataset.field || '')) paint(); });
  }
  function mountDirectory(stage,book,select,toggle) {
    const esc = ui().esc, icon = root.TAWorkspace.icon;
    const board = stage.querySelector('.board'), search=board.querySelector('#lore-filter');
    const rows=board.querySelector('.ctx-directory-rows'), pager=board.querySelector('.ctx-directory-pager');
    const previous=pager.querySelector('[data-prev]'), next=pager.querySelector('[data-next]');
    const counts=board.querySelector('.ws-list-header small'), empty=board.querySelector('.ws-filter-empty');
    const byCategory = ui().state.loreGroupBy === 'category';
    const definitions = byCategory ? [...Object.entries(root.NIJANOrganize.CATEGORIES).map(([id,label])=>({id,label})), {id:'',label:'未分类'}] : root.TAFormats.POSITIONS;
    let page=0, active=new Set();
    function row(item) {
      const chosen=item.id===ui().state.sel.entry, enabled=item.enabled!==false;
      const label=esc(title(item));
      return `<article class="entry${chosen?' on':''}${enabled?'':' off'}${active.has(item.id)?' hit':''}" data-id="${esc(item.id)}" data-no-translate tabindex="0" aria-label="${label}">
        <b>${label}</b><button type="button" class="btn btn-small" data-toggle="${esc(item.id)}">${esc(tr(enabled?'启用':'停用'))}</button>
        <span class="ws-entry-snippet">${esc(String(item.content || '').replace(/\s+/g,' ').slice(0,90))}</span>
        <small class="ctx-entry-size" data-entry-size="${esc(item.id)}">${esc(sizeText(C.entrySize(item)))}</small>
        <button type="button" class="ws-entry-peek" data-peek-entry="${esc(item.id)}" data-book="${esc(book.id)}" aria-label="${esc(tr('原文预览'))}">${icon('eye')}</button></article>`;
    }
    function draw(index,reveal) {
      const result=C.directoryPage(book.entries,definitions,{byCategory,query:search.value,outer:ui().state.query,page:index,reveal});
      page=result.page;
      counts.textContent=(result.count===book.entries.length ? result.count : result.count+' / '+book.entries.length)+' '+tr('条');
      rows.innerHTML=result.groups.map(group=>`<section class="column"><h3><span>${esc(tr(group.label))}</span><small>${group.count}</small></h3>${group.entries.map(row).join('')}</section>`).join('');
      empty.hidden=!!result.count; pager.hidden=result.pages<=1;
      previous.disabled=!page; next.disabled=page+1>=result.pages;
      pager.querySelector('output').textContent=(result.count ? result.start+1 : 0)+'–'+result.end+' / '+result.count;
      if (reveal) requestAnimationFrame(()=>{
        const selected=rows.querySelector('.entry.on');
        if (!selected || !board.isConnected) return;
        const box=board.getBoundingClientRect(), item=selected.getBoundingClientRect();
        const top=box.top+search.offsetHeight+(pager.hidden?0:pager.offsetHeight);
        if (item.top<top) board.scrollTop+=item.top-top-6;
        else if(item.bottom>box.bottom) board.scrollTop+=item.bottom-box.bottom+6;
      });
    }
    function reveal(id) {
      const item=book.entries.find(e=>e.id===id);
      if (item && !C.matchesEntry(item,search.value)) {search.value=''; ui().state.loreFilter='';}
      draw(page,id);
    }
    function edit(item) {
      if (!item) return;
      if (search.value.trim() || ui().state.query.trim()) { draw(page); return; }
      const article=rows.querySelector('[data-id="'+CSS.escape(item.id)+'"]');
      if (!article) return;
      article.querySelector('b').textContent=title(item); article.setAttribute('aria-label',title(item));
      article.classList.toggle('off',item.enabled===false);
      article.querySelector('[data-toggle]').textContent=tr(item.enabled===false?'停用':'启用');
      article.querySelector('.ws-entry-snippet').textContent=String(item.content || '').replace(/\s+/g,' ').slice(0,90);
      article.querySelector('[data-entry-size]').textContent=sizeText(C.entrySize(item));
    }
    rows.onclick=event=>{
      const target=event.target.closest('.entry');
      if (!target || event.target.closest('[data-peek-entry]')) return;
      if (event.target.closest('[data-toggle]')) {toggle(target.dataset.id); return;}
      select(target.dataset.id);
      rows.querySelectorAll('.entry').forEach(item=>item.classList.toggle('on',item===target));
    };
    rows.onkeydown=event=>{
      if (event.target.matches('.entry') && ['Enter',' '].includes(event.key)) {event.preventDefault();event.target.click();}
    };
    previous.onclick=()=>{draw(page-1);board.scrollTop=0;};
    next.onclick=()=>{draw(page+1);board.scrollTop=0;};
    search.oninput=()=>{ui().state.loreFilter=search.value; draw(0); board.scrollTop=0;};
    draw(0,ui().state.sel.entry);
    return {reveal,edit,setHits(ids) {
      active=ids;
      rows.querySelectorAll('.entry').forEach(item=>item.classList.toggle('hit',active.has(item.dataset.id)));
    }};
  }
  function mountWorld(stage,book,openEntry,applyKeys,directory) {
    const host = stage.querySelector('#context-world');
    host.dataset.noTranslate = '';
    const settings = memory.get(book) || {open:{}, sample:'', budget:book.stBookFields?.token_budget ?? 2048,
      depth:book.stBookFields?.scan_depth ?? 2, recursion:!!book.stBookFields?.recursive_scanning};
    memory.set(book,settings);
    const sections = [['trigger','对话触发与注入预览'],['health','世界书健康检查'],['links','条目依赖关系'],['edition','精简导出']];
    const sectionNodes = {};
    host.replaceChildren();
    const stats = node('div',undefined,'ctx-metrics');
    stats.title = basis(); host.append(stats);
    for (const [key,label] of sections) {
      const details = node('details',undefined,'ws-assist-details ctx-panel'), body = node('div',undefined,'ctx-body');
      details.dataset.context = key; details.open = !!settings.open[key];
      details.append(node('summary',tr(label)),body); host.append(details);
      sectionNodes[key]={details,body};
    }
    const entryButton = (entry,field='content') => button(title(entry),()=>openEntry(entry.id,field));
    const paint = {};
    paint.trigger = mountTrigger(book,sectionNodes.trigger.body,settings,entryButton,directory.setHits);
    paint.health = () => {
      const body = sectionNodes.health.body; body.replaceChildren();
      const {stats,findings} = C.analyze(book);
      if (stats.constants && stats.constants * 2 >= stats.enabled) message(body,tr('至少一半的启用条目为常驻，可检查哪些只在特定场景需要。'));
      paged(body,findings,row=>{
        const item = node('article',undefined,'ctx-result');
        const head = node('div',undefined,'row'); head.append(entryButton(row.entry,row.field),node('strong',tr(row.reason))); item.append(head);
        if (row.detail) item.append(node('span',row.detail,'ctx-key'));
        if (row.reason === '考虑改为关键词触发') {
          const choices = node('div',undefined,'row'), inputs = [];
          for (const key of C.suggestions(row.entry)) {
            const {label,input} = check(key,true); inputs.push([key,input]); choices.append(label);
          }
          const apply = button(tr('采用所选主关键词'),async()=>{
            const keys = inputs.filter(([,box])=>box.checked).map(([key])=>key);
            if (!keys.length) return;
            apply.disabled = true;
            try { await applyKeys(row.entry.id,keys); }
            catch(error) { ui().toast(tr(error.message),{kind:'error'}); apply.disabled = false; }
          });
          choices.addEventListener('change',()=>{apply.disabled = !inputs.some(([,box])=>box.checked);});
          item.append(choices,apply);
        }
        return item;
      },'当前检查范围内没有发现问题。');
    };
    const linkBody = sectionNodes.links.body;
    paint.links = () => {
      linkBody.replaceChildren();
      const sources = book.entries.filter(entry=>entry.enabled !== false);
      if (!sources.length) { message(linkBody,tr('没有启用的条目')); return; }
      const label = node('label',undefined,'field'), pick = document.createElement('select');
      label.append(node('span',tr('从条目查看引用'),'field-label'),pick); linkBody.append(label);
      const list = node('div',undefined,'ctx-edges'); linkBody.append(list);
      for (const entry of sources) pick.add(new Option(title(entry),entry.id));
      const previous = settings.source || ui().state.sel.entry;
      if (sources.some(entry=>entry.id===previous)) pick.value = previous;
      const graph = () => {
        settings.source = pick.value; list.replaceChildren();
        const source = sources.find(entry=>entry.id===pick.value);
        paged(list,C.relations(book,source),edge=>{
          const line = node('div',undefined,'ctx-edge');
          line.append(entryButton(edge.from),node('span','→','ctx-edge-arrow'),node('small',tr(edge.explicit?'显式出口引用':'可能的关键词触发')+' · '+edge.key),node('span','→','ctx-edge-arrow'),entryButton(edge.to));
          return line;
        },'这条正文没有引用同书的出口或触发词。');
      };
      pick.onchange = graph; graph();
    };
    const edition = mountEdition(sectionNodes.edition.body,book);
    paint.edition = edition.open;
    function metrics() {
      const value = C.totals(book), percent = value.enabled ? Math.round(100*value.constants/value.enabled) : 0;
      stats.replaceChildren();
      countPair(stats,'全书正文',sizeText(value));
      countPair(stats,'已启用的常驻正文',sizeText({tokens:value.constantTokens,chars:value.constantChars}));
      const part = node('div'); part.append(node('span',tr('常驻 / 启用')),node('b',value.constants+' / '+value.enabled+' · '+percent+'%'));
      const bar = document.createElement('meter'); bar.min=0; bar.max=100; bar.value=percent; bar.setAttribute('aria-label',tr('常驻 / 启用')); part.append(bar); stats.append(part);
    }
    let frame = 0;
    function refresh() {
      if (frame) return;
      frame = requestAnimationFrame(()=>{
        frame = 0;
        if (!host.isConnected) return;
        metrics();
        const entry = book.entries.find(row=>row.id===ui().state.sel.entry);
        directory.edit(entry);
        edition.invalidate();
        for (const key of ['health','links','trigger']) if (sectionNodes[key].details.open) paint[key]();
      });
    }
    for (const [key,{details}] of Object.entries(sectionNodes)) {
      details.addEventListener('toggle',()=>{
        settings.open[key] = details.open;
        if (details.open) paint[key]();
        else if (key==='trigger') directory.setHits(new Set());
      });
      if (details.open) paint[key]();
    }
    metrics();
    return refresh;
  }
  function mountTrigger(book,body,state,entryButton,setHits) {
    const label = node('label',undefined,'field'), input = document.createElement('textarea');
    input.id='lore-sample'; input.rows=3; input.dataset.nolen=''; input.value=state.sample;
    label.append(node('span',tr('对话（每行一条，最近的写在末行）'),'field-label'),input); body.append(label);
    const row = node('div',undefined,'ctx-controls');
    function number(label,value,min,max) {
      const wrap = node('label',undefined,'field'), el=document.createElement('input');
      el.type='number'; el.min=min; if (max) el.max=max; el.value=value;
      wrap.append(node('span',tr(label),'field-label'),el); row.append(wrap); return el;
    }
    const budget = number('世界书预算（token）',state.budget,0), depth = number('扫描最近消息数',state.depth,0,1000);
    const recursive = check(tr('递归扫描'),state.recursion); row.append(recursive.label);
    const run = button(tr('预览注入'),paint); run.id='lore-try'; row.append(run); body.append(row);
    message(body,basis());
    message(body,tr('按当前书的字面关键词和注入槽模拟。概率大于零视为通过；分组抽选、计时效果、宏展开、正则和其他提示词由酒馆运行时决定。'));
    const results=node('div'); results.id='lore-hits'; body.append(results);
    let timer;
    function paint() {
      clearTimeout(timer); results.replaceChildren();
      state.sample=input.value; state.recursion=recursive.input.checked; state.depth=Number(depth.value); state.budget=Number(budget.value);
      const data = C.simulate(book,input.value,{budget:state.budget,scanDepth:state.depth,recursion:state.recursion});
      const active = new Set(data.selected.map(row=>row.entry.id));
      setHits(active);
      const metrics = node('div',undefined,'ctx-metrics');
      countPair(metrics,'注入正文',sizeText({chars:data.chars,tokens:data.spent}));
      countPair(metrics,'出口待引用','≈ '+data.outletTokens+' token');
      countPair(metrics,'预算占用',data.budgetUsed+' / '+data.limit+' token'); results.append(metrics);
      if (!data.groups.size) message(results,tr('没有条目会被这句话触发。'));
      for (const rows of data.groups.values()) {
        const entry=rows[0].entry, slot=root.TAFormats.positionById(entry.position);
        const suffix = entry.position==='at_depth' ? ' · '+tr('深度')+' '+(entry.depth??4)+' · '+(['system','user','assistant'][entry.stSettings?.role ?? 0] || entry.stSettings.role) :
          entry.position==='outlet' ? ' · '+entry.outletName : '';
        const group=node('section',undefined,'ctx-slot'); group.append(node('h4',tr(slot.label)+suffix));
        for (const hit of rows) {
          const detail = [entryButton(hit.entry),node('small','≈ '+hit.cost+' token · '+tr('顺序')+' '+(hit.entry.order ?? 100))];
          if (hit.entry.constant) detail.push(node('small',tr('恒定')));
          if (hit.hits.length) detail.push(node('small',tr('主关键词')+' · '+hit.hits.join(', ')));
          if (hit.secondary.length) detail.push(node('small',tr('次关键词')+' · '+hit.secondary.join(', ')));
          if (hit.lines.length) detail.push(node('small',tr('对话行')+' '+hit.lines.join(', ')));
          if (hit.parents.length) detail.push(node('small',tr('递归来源')+' · '+hit.parents.map(id=>title(book.entries.find(e=>e.id===id))).join(', ')));
          const line=node('div',undefined,'ctx-hit'); line.append(...detail); group.append(line);
        }
        const text = node('pre',rows.map(r=>r.entry.content).join('\n'),'ctx-prose'); text.dataset.injection=slot.id; group.append(text);
        results.append(group);
      }
      if (data.skipped.length) {
        const skipped=node('details',undefined,'ctx-skipped'), list=node('div');
        skipped.append(node('summary',tr('未注入')+' · '+data.skipped.length),list); results.append(skipped);
        skipped.ontoggle=()=>{ if (!skipped.open || list.childElementCount) return;
          paged(list,data.skipped,hit=>{
            const line=node('div',undefined,'ctx-hit'); line.append(entryButton(hit.entry),node('small',tr(hit.reason)+' · ≈ '+hit.cost+' token'));
            if (hit.hits?.length) line.append(node('small',hit.hits.join(', ')));
            return line;
          });
        };
      }
    }
    input.oninput = () => { state.sample=input.value; clearTimeout(timer); timer=setTimeout(()=>{ if (body.isConnected && body.parentElement.open) paint(); },150); };
    budget.oninput=depth.oninput=recursive.input.onchange=paint;
    return paint;
  }
  function mountEdition(host,book) {
    let view, preview, selectedCore, metrics, download;
    const chosen = new Set(book.entries.filter(e=>e.enabled!==false && e.constant).map(e=>e.id));
    const flags = {};
    function invalidate() {
      preview = null;
      if (download) { download.disabled=true; metrics.replaceChildren(); }
    }
    function options() {
      return {...Object.fromEntries(Object.entries(flags).map(([key,input])=>[key,input.checked])),core:flags.core.checked ? [...chosen] : null};
    }
    function open() {
      if (view) return;
      view = node('div'); host.append(view); message(view,tr('以下选项用于本次导出的副本。'));
      for (const [key,text] of [['skipDisabled','去掉停用条目'],['compact','收紧空行与行尾空格'],['dedup','删除条目内的重复段落'],['split','拆分超过约 300 token 的条目'],['core','仅保留所选核心条目']]) {
        const choice=check(tr(text)); flags[key]=choice.input; view.append(choice.label);
      }
      message(view,tr('拆分后，酒馆会分别计算每段的触发、排序与预算。'));
      message(view,tr('宏和代码块保持完整，带成对标记的条目保留整段。'));
      selectedCore=node('div',undefined,'ctx-core'); selectedCore.hidden=true; view.append(selectedCore);
      function paintCore() {
        selectedCore.hidden=!flags.core.checked;
        if (!flags.core.checked || selectedCore.childElementCount) return;
        paged(selectedCore,book.entries,entry=>{
          const choice=check(title(entry),chosen.has(entry.id));
          choice.input.onchange=()=>{ if(choice.input.checked) chosen.add(entry.id); else chosen.delete(entry.id); };
          return choice.label;
        },'没有条目');
      }
      view.addEventListener('change',()=>{invalidate(); paintCore();});
      const actions=node('div',undefined,'row');
      metrics=node('div');
      const compare=button(tr('预览导出差异'),()=>{
        const value=C.buildEdition(book,options()); preview=value.book;
        const before=C.totals(book), after=C.totals(preview);
        metrics.replaceChildren();
        message(metrics,tr('条目')+' '+book.entries.length+' → '+preview.entries.length+' · '+sizeText(before)+' → '+sizeText(after));
        if (!preview.entries.length) message(metrics,tr('没有选中可导出的条目'));
        const changed=node('div'); metrics.append(changed);
        paged(changed,value.changes,change=>{
          const detail=node('details',undefined,'ctx-change'); detail.append(node('summary',title(change.before)+' · '+(change.after.length ? change.after.length===1 ? tr('已精简') : tr('已拆分')+' × '+change.after.length : tr('已移除'))));
          detail.ontoggle=()=>{
            if (!detail.open || detail.children.length>1) return;
            const columns=node('div',undefined,'ctx-diff');
            const left=node('div'),right=node('div');
            left.append(node('b',tr('原文')),node('pre',change.before.content,'ctx-prose'));
            right.append(node('b',tr('导出副本')));
            for(const part of change.after) right.append(node('pre',part.content,'ctx-prose'));
            columns.append(left,right); detail.append(columns);
          }; return detail;
        },'正文与条目均无改动。');
        download.disabled=!preview.entries.length;
      });
      download=button(tr('下载导出副本'),()=>{
        if (!preview?.entries.length) return;
        const filename=ui().safeName(preview.name)+'-light.json';
        ui().downloadJson(filename,root.TAFormats.bookToWorldInfo(preview));
        ui().showExport(filename,tr('导出副本'));
      });
      download.classList.add('btn-primary'); download.disabled=true;
      actions.append(compare,download); view.append(actions,metrics);
    }
    return {open,invalidate};
  }
  root.TAContextPanel = {sizeText,basis,focusField,mountDirectory,mountWorld,mountCharacter};
})(globalThis);
