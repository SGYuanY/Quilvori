/* Local selection and presentation for the collection, card editor and world-book editor. */
(function (root) {
  'use strict';
  const ui = () => root.TAUI;
  const tr = key => ui().t(key);
  const text = value => ui().esc(value);
  const sectionNames = {home:['收藏室','Collection'],characters:['角色卡','Characters'],lore:['世界书','World Books']};

  function titleInfo(route) {
    const names = sectionNames[route];
    if (!names) return null;
    const lang = root.TAI18n.prefs.lang;
    if (lang === 'zh') return {name:names[0],other:names[1],lang:'zh-CN',second:'en'};
    if (lang === 'en') return {name:names[1],other:names[0],lang:'en',second:'zh-CN'};
    return {name:tr(names[0]),other:'',lang};
  }

  function titleMarkup(route) {
    const info = titleInfo(route);
    return '<span class="qc-title-pair" data-no-translate><span lang="'+info.lang+'">'+text(info.name)+'</span>'
      +(info.other ? '<small lang="'+info.second+'">'+text(info.other)+'</small>' : '')+'</span>';
  }

  // One observer follows the current gallery as its filters, font metrics and available width change.
  let filterObserver, filterHost;
  function mountFilters(host) {
    filterObserver?.disconnect();
    filterHost = host;
    const sync = () => {
      if (!host.isConnected || filterHost !== host) return;
      const current = host.querySelector('[aria-pressed="true"]');
      if (!current) return;
      const area = host.getBoundingClientRect(), box = current.getBoundingClientRect();
      host.style.setProperty('--qc-filter-x', (box.left-area.left)+'px');
      host.style.setProperty('--qc-filter-y', (box.top-area.top)+'px');
      host.style.setProperty('--qc-filter-width', box.width+'px');
      host.style.setProperty('--qc-filter-height', box.height+'px');
      host.dataset.measured = '';
    };
    if (typeof ResizeObserver !== 'undefined') {
      filterObserver = new ResizeObserver(sync);
      filterObserver.observe(host);
      host.querySelectorAll('button').forEach(button=>filterObserver.observe(button));
    }
    sync(); document.fonts?.ready.then(sync);
    return sync;
  }

  function portrait(card, size='') {
    const asset = ui().assetById(card?.avatarAssetId);
    const initial = [...String(card?.name || tr('未命名')).trim()][0] || '·';
    return '<span class="qc-portrait '+size+'" aria-hidden="true">'
      +(asset?.dataUrl ? '<img alt="" src="'+text(ui().imageUrl(asset))+'" decoding="async">' : text(initial))+'</span>';
  }
  function currentCard(button, card) {
    button.innerHTML = portrait(card)+'<span class="qc-person-name"><small>'+text(tr('当前角色'))+'</small><strong data-no-translate>'
      +text(card.name || tr('未命名'))+'</strong></span><span class="qc-switch-hint">'+text(tr('切换角色'))+'</span>'+root.TAWorkspace.icon('chevron');
  }

  function chooseCard(anchor, cards, selected, choose) {
    const dialog = document.createElement('dialog');
    dialog.className = 'qc-card-dialog';
    dialog.setAttribute('aria-labelledby','qc-picker-title');
    dialog.innerHTML = '<header><h2 id="qc-picker-title">'+text(tr('切换角色'))+'</h2><button type="button" class="btn btn-small" data-dismiss>'+text(tr('关闭'))+'</button></header>'
      +'<label class="qc-picker-search">'+root.TAWorkspace.icon('search')+'<input type="search" autocomplete="off" aria-label="'+text(tr('查找角色名或标签'))+'" placeholder="'+text(tr('查找角色名或标签'))+'"></label>'
      +'<div class="qc-picker-results"></div><footer><span aria-live="polite" role="status"></span><button type="button" class="btn btn-small" data-prev>'+text(tr('上一页'))+'</button><button type="button" class="btn btn-small" data-next>'+text(tr('下一页'))+'</button></footer>';
    document.body.append(dialog);
    const search = dialog.querySelector('input'), results = dialog.querySelector('.qc-picker-results');
    const prev = dialog.querySelector('[data-prev]'), next = dialog.querySelector('[data-next]'), limit = 24;
    let matches = cards, page = Math.floor(Math.max(0,cards.findIndex(c=>c.id===selected))/limit);
    function paint() {
      const slice = matches.slice(page*limit,(page+1)*limit);
      results.innerHTML = slice.map(card=>{
        const meta = [card.creator,...(card.tags || []).slice(0,3)].filter(Boolean).join(' · ');
        return '<button type="button" class="qc-picker-item" data-id="'+text(card.id)+'"'+(card.id===selected?' aria-current="true"':'')+'>'
          +portrait(card,'qc-small')+'<span data-no-translate><strong>'+text(root.TAIntegrityPanel.displayName(card))+'</strong>'
          +(meta?'<small>'+text(meta)+'</small>':'')+'</span>'+(card.id===selected?root.TAWorkspace.icon('checkmark'):'')+'</button>';
      }).join('');
      dialog.querySelector('[role=status]').textContent = matches.length ? ((page*limit+1)+'–'+(page*limit+slice.length)+' / '+matches.length) : tr('没有找到匹配的内容');
      prev.disabled=!page; next.disabled=(page+1)*limit>=matches.length;
      prev.hidden=next.hidden=matches.length<=limit;
      results.scrollTop=0;
      return results.querySelector('button');
    }
    function select(id) {
      const card=root.TAStore.byId(matches,id);
      if (!card) return;
      dialog.close('selected');
      choose(card.id);
    }
    function movePage(delta) {page+=delta;const first=paint();first?.focus();}
    prev.onclick = ()=>movePage(-1); next.onclick = ()=>movePage(1);
    results.onclick = event=>select(event.target.closest('button[data-id]')?.dataset.id);
    search.oninput = ()=>{
      const query = search.value.trim().toLocaleLowerCase();
      matches = query ? cards.filter(card=>[card.name,card.creator,...(card.tags || [])].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)) : cards;
      page=0;paint();
    };
    dialog.onkeydown = event=>{
      if (event.isComposing) return;
      const buttons=[...results.querySelectorAll('button')];
      if (event.target===search && event.key==='Enter' && buttons.length) {event.preventDefault();select(buttons[0].dataset.id);return;}
      if (!['ArrowDown','ArrowUp'].includes(event.key) || (!results.contains(event.target) && event.target!==search) || !buttons.length) return;
      event.preventDefault();
      const index=buttons.indexOf(event.target);
      buttons[index<0?(event.key==='ArrowDown'?0:buttons.length-1):(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();
    };
    dialog.onclick=event=>{
      if (event.target!==dialog) return;
      const rect=dialog.getBoundingClientRect();
      if (event.clientX<rect.left || event.clientX>rect.right || event.clientY<rect.top || event.clientY>rect.bottom) dialog.close();
    };
    dialog.querySelector('[data-dismiss]').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>{
      dialog.remove();
      if(anchor.isConnected)anchor.focus({preventScroll:true});
      else document.querySelector('[data-switch-card]')?.focus({preventScroll:true});
    },{once:true});
    paint();dialog.showModal();search.focus();
  }

  function mountMore(container) {
    const trigger=container.querySelector('[data-qc-more]'),panel=container.querySelector('[popover]');
    if(!trigger || !panel) return;
    const expanded = value=>trigger.setAttribute('aria-expanded',String(value));
    const align = ()=>{
      const rect=trigger.getBoundingClientRect();
      const pad=8, width=panel.offsetWidth, height=panel.offsetHeight;
      const left=Math.max(pad,Math.min(innerWidth-width-pad,rect.right-width));
      const below = rect.bottom + 6;
      const top = below + height + pad <= innerHeight ? below : Math.max(pad,rect.top-height-6);
      panel.style.setProperty('--qc-menu-left',left+'px');
      panel.style.setProperty('--qc-menu-top',top+'px');
    };
    let cleanup;
    panel.addEventListener('toggle',event=>{
      const open = event.newState === 'open';
      expanded(open);
      cleanup?.abort();
      if (!open) return;
      align();
      const controller = new AbortController();
      cleanup = controller;
      const opts = {signal:controller.signal,capture:true};
      window.addEventListener('resize',align,opts);
      window.addEventListener('scroll',align,opts);
      const observer = new MutationObserver(() => {
        if (!container.isConnected) controller.abort();
      });
      observer.observe(container.closest('#stage'),{childList:true});
      controller.signal.addEventListener('abort',()=>observer.disconnect(),{once:true});
    });
    // Preserve native light dismissal. A disconnected popover can disappear without a toggle event.
    panel.addEventListener('beforetoggle',event=>{if(event.newState==='closed')cleanup?.abort();});
    panel.addEventListener('click',event=>{
      if(event.target.closest('button') && panel.matches(':popover-open')) panel.hidePopover();
    },true);
    trigger.addEventListener('keydown',event=>{
      if(event.key==='ArrowDown'){event.preventDefault();if(!panel.matches(':popover-open'))panel.showPopover();align();panel.querySelector('button:not(:disabled)')?.focus();}
    });
    panel.addEventListener('keydown',event=>{
      const list=[...panel.querySelectorAll('button:not(:disabled)')], from=list.indexOf(event.target);
      if (event.key==='Escape'){event.preventDefault();event.stopPropagation();panel.hidePopover();trigger.focus();return;}
      if(from<0 || !['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
      event.preventDefault();
      const index=event.key==='Home'?0:event.key==='End'?list.length-1:(from+(event.key==='ArrowDown'?1:-1)+list.length)%list.length;
      list[index].focus();
    });
  }
  // Bound cover images and interactive controls on both gallery pages.
  function mountGalleryPager(host, preferences, draw) {
    const UI = ui();
    const pageSize = 24;
    host.className = 'gallery-pagination row';
    host.setAttribute('aria-label', UI.t('画廊分页'));
    host.innerHTML = `<button class="btn btn-small" type="button" data-prev>${UI.esc(UI.t('上一页'))}</button><span role="status" aria-live="polite" data-page></span><button class="btn btn-small" type="button" data-next>${UI.esc(UI.t('下一页'))}</button>`;
    const prev = host.querySelector('[data-prev]'), next = host.querySelector('[data-next]'), counter = host.querySelector('[data-page]');
    let items = [];
    function paint() {
      const pages = Math.max(1, Math.ceil(items.length/pageSize));
      const page = Math.max(0, Math.min(pages-1, preferences.page || 0));
      preferences.page = page;
      host.hidden = pages <= 1;
      prev.disabled = page === 0;
      next.disabled = page === pages - 1;
      counter.textContent = (page+1)+' / '+pages;
      draw(items.slice(page*pageSize,(page+1)*pageSize));
    }
    function turn(step, button) {
      preferences.page += step; paint();
      if (button.disabled) (step > 0 ? prev : next).focus();
    }
    prev.onclick = () => turn(-1,prev);
    next.onclick = () => turn(1,next);
    return (matches,reset,reveal) => {
      items = matches;
      if (reset) preferences.page = 0;
      if (reveal && matches.includes(reveal)) preferences.page = Math.floor(matches.indexOf(reveal)/pageSize);
      paint();
    };
  }

  root.TACollectionControls={mountGalleryPager,titleInfo,titleMarkup,mountFilters,currentCard,chooseCard,mountMore};
})(globalThis);
