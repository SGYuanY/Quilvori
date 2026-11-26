/* Local workspace navigation and interaction. No model calls or library writes. */
(function (root) {
  'use strict';
  const KEY = 'realmweave.workspace.v1';
  const UI = () => root.TAUI;
  const tr = (s) => UI().t(s);
  const esc = (s) => UI().esc(s);
  const paths = {
    home: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    studio: '<path d="M21 11a8 8 0 0 1-8 8H6l-4 3V10a8 8 0 0 1 13-6"/><path d="m17 3 4 4m-9 5 7-9 3 3-8 8-3 1Z"/>',
    characters: '<rect x="4" y="3" width="16" height="18" rx="3"/><circle cx="12" cy="9" r="3"/><path d="M7 18c0-5 10-5 10 0"/>',
    lore: '<path d="M12 6c-3-3-7-3-10-2v15c4-1 7-1 10 2 3-3 6-3 10-2V4c-3-1-7-1-10 2Zm0 0v15"/>',
    sections: '<path d="M5 4h14M5 10h14M5 16h8M5 22h8"/>',
    prompts: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5m-3-13-2 20"/>',
    groups: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2m2-15a3 3 0 0 1 0 6m3 9v-2a6 6 0 0 0-3-5"/>',
    chat: '<path d="M21 11a8 8 0 0 1-8 8H6l-4 3V11a9 9 0 0 1 19 0Z"/><path d="M7 10h10m-10 4h6"/>',
    themes: '<path d="M13 3a9 9 0 1 0 0 18c2 0 2-2 1-3s-1-3 1-3h2c5 0 6-9-4-12Z"/><circle cx="8" cy="11" r="1"/><circle cx="11" cy="7" r="1"/><circle cx="16" cy="8" r="1"/>',
    assets: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
    regex: '<path d="m5 4-2 8 2 8m14-16 2 8-2 8M12 6v12m-5-9 10 6m-10 0 10-6"/>',
    quick: '<path d="m13 2-9 12h7l-1 8 10-12h-7Z"/>',
    timeline: '<path d="M6 3v18m4-15h11M10 12h7m-7 6h11"/><circle cx="6" cy="6" r="2"/><circle cx="6" cy="12" r="2"/><circle cx="6" cy="18" r="2"/>',
    graph: '<circle cx="5" cy="12" r="3"/><circle cx="18" cy="5" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8 11 7-5m-7 7 7 5"/>',
    check: '<path d="m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6Z"/><path d="m8 12 3 3 5-6"/>',
    script: '<path d="M6 3h12v18H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm0 0v18m4-12h5m-5 4h5"/>',
    backup: '<path d="M3 8h18v13H3Zm-1-5h20v5H2Zm7 9h6"/>',
    memory: '<path d="M9 3a4 4 0 0 0-5 5 5 5 0 0 0 0 8 4 4 0 0 0 5 5m6-18a4 4 0 0 1 5 5 5 5 0 0 1 0 8 4 4 0 0 1-5 5M9 3v18m6-18v18M5 8h4m6 8h4"/>',
    tutorial: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-1 .5-1 1-1 2.7m0 3h.01"/>',
    search: '<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
    sidebar: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16m-3-11v6"/>',
    focus: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    plus: '<path d="M12 4v16M4 12h16"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    checkmark: '<path d="m5 12 4 4L19 6"/>',
    more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  };
  paths.resources = paths.assets;
  function icon(name) {
    return `<svg class="ws-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.sections}</svg>`;
  }
  function readPrefs() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { return {}; }
  }
  const prefs = readPrefs();
  function savePrefs() { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (_) {} }
  let mounted = false, focusMode = false, returnFocus = null, commandItems = [], commandIndex = 0, peekTimer = null;
  let commandOffset = 0, commandHasMore = false;
  const commandPageSize = 24;
  function openEntity(ref) {
    closeCommand(); closePeek();
    return root.TASearch.open({ kind: ref.kind, id: ref.id, parentId: ref.bookId, field: ref.kind === 'entry' ? 'content' : 'name', selectOnly: ref.kind !== 'entry' });
  }
  function editWithAI(ref) {
    closeCommand(); closePeek();
    if (ref.kind === 'character') root.NIJANStudio.openFor({ kind: 'character', cardId: ref.id });
    else root.NIJANStudio.openFor({ kind: 'world', bookId: ref.bookId || ref.id, entryId: ref.kind === 'entry' ? ref.id : '' });
  }
  function lookup(ref) {
    const library = UI().state.lib;
    if (ref.kind === 'character') {
      const card = library.characters.find((item) => item.id === ref.id);
      return card && { name: card.name, address: tr('角色卡'), text: card.description || card.personality || '', meta: (card.tags || []).join(' · ') };
    }
    const book = library.worldBooks.find((item) => item.id === (ref.bookId || ref.id));
    if (!book) return null;
    if (ref.kind === 'entry') {
      const entry = book.entries.find((item) => item.id === ref.id);
      return entry && { name: entry.comment || tr('未命名'), address: book.name, text: entry.content || '', meta: (entry.keys || []).join(' · ') };
    }
    return { name: book.name, address: tr('世界书'), text: book.description || book.entries.slice(0, 8).map((item) => item.comment).join('\n'), meta: `${book.entries.length} ${tr('条')}` };
  }
  function showPeek(ref, anchor, sheet = false) {
    const value = lookup(ref);
    if (!value) return;
    closePeek();
    const host = document.getElementById('workspace-peek');
    host.className = sheet ? 'workspace-sheet-backdrop' : 'workspace-peek-host';
    host.hidden = false;
    host.innerHTML = `<section class="workspace-peek ${sheet ? 'workspace-sheet' : ''}" role="dialog" ${sheet ? 'aria-modal="true"' : ''} aria-label="${esc(tr('原文预览'))}"><header><span class="ws-kicker">${tr('原文预览')}</span><button class="ws-icon-button" type="button" data-peek-close aria-label="${esc(tr('关闭'))}">${icon('close')}</button></header><p class="ws-address" data-no-translate>${esc(value.address)}</p><h3 data-no-translate>${esc(value.name)}</h3>${value.meta ? `<p class="ws-peek-meta" data-no-translate>${esc(value.meta)}</p>` : ''}<div class="ws-peek-content" data-no-translate>${esc(sheet ? value.text : value.text.slice(0, 420)) || esc(tr('内容尚未填写'))}${!sheet && value.text.length > 420 ? '…' : ''}</div><footer><button class="btn btn-small" type="button" data-peek-open>${tr('打开原文')}${icon('arrow')}</button><button class="btn btn-small btn-primary" type="button" data-peek-ai>${icon('studio')}${tr('交给 AI 修改')}</button></footer></section>`;
    const panel = host.firstElementChild;
    if (!sheet) {
      const box = anchor.getBoundingClientRect();
      panel.style.left = `${Math.max(12, Math.min(innerWidth - 380, box.right + 12))}px`;
      panel.style.top = `${Math.max(12, Math.min(innerHeight - Math.min(460, panel.scrollHeight) - 12, box.top))}px`;
    } else { returnFocus = document.activeElement; panel.querySelector('[data-peek-close]').focus(); }
    host.querySelector('[data-peek-close]').onclick = closePeek;
    host.querySelector('[data-peek-open]').onclick = () => openEntity(ref);
    host.querySelector('[data-peek-ai]').onclick = () => editWithAI(ref);
    host.onclick = (event) => { if (event.target === host) closePeek(); };
  }
  function closePeek() {
    clearTimeout(peekTimer);
    const host = document.getElementById('workspace-peek');
    if (host) { const modal = host.classList.contains('workspace-sheet-backdrop'); host.hidden = true; host.replaceChildren(); if (modal) returnFocus?.focus?.(); }
    const menu = document.getElementById('workspace-context');
    if (menu) { menu.hidden = true; menu.replaceChildren(); }
  }
  function rowRef(node) {
    if (node.dataset.peekCard) return { kind: 'character', id: node.dataset.peekCard };
    if (node.dataset.peekEntry) return { kind: 'entry', id: node.dataset.peekEntry, bookId: node.dataset.book || UI().state.sel.book };
    if (node.matches('.entry[data-id]')) return { kind: 'entry', id: node.dataset.id, bookId: UI().state.sel.book };
    if (node.matches('.pick[data-id]') && UI().state.route === 'characters') return { kind: 'character', id: node.dataset.id };
    return null;
  }
  function setFocus(on) {
    focusMode = on;
    document.querySelector('.shell')?.classList.toggle('is-focused', on);
    const button = document.querySelector('[data-workspace="focus"]');
    if (button) { button.setAttribute('aria-pressed', String(on)); button.title = tr(on ? '退出专注模式' : '专注模式'); }
    if (on) UI().toast(tr('已进入专注模式，按 Esc 返回'), { id: 'focus', kind: 'info', title: tr('专注模式'), action: { label: tr('退出专注模式'), onClick: () => setFocus(false) } });
  }
  function performTargetAction(kind, id, action) {
    const lib = UI().state.lib, card = kind === 'character';
    const target = (card ? lib.characters : lib.worldBooks).find(row => row.id === id);
    if (!target) { UI().toast(tr('搜索目标已不存在')); return; }
    if (action === 'organize') {
      root.NIJANOrganizePanel.open(card ? { kind: 'character', cardId: id } : { kind: 'world', bookId: id });
      return;
    }
    const bookId = target.embeddedBookId ?? target.source?.embeddedBookId;
    const payload = card ? root.TAFormats.characterToCard(target, lib.worldBooks.find(row => row.id === bookId)) : root.TAFormats.bookToWorldInfo(target);
    UI().downloadJson(UI().safeName(target.name) + '.json', payload);
  }
  function *commandActions(query) {
    const { state, ROUTES } = UI(), search = root.TASearch;
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const includes = text => terms.every(term => text.toLowerCase().includes(term));
    const actionKinds = [
      ['character', 'organize', '整理角色卡'], ['book', 'organize', '整理世界书'],
      ['character', 'export', '导出角色卡 JSON'], ['book', 'export', '导出世界书 JSON'],
    ];
    for (const [kind, action, phrase] of actionKinds) {
      const type = search.types[kind], prefix = tr(phrase);
      const commandText = [prefix, phrase, action].join(' ').toLowerCase();
      if (terms.length && !terms.some(term => commandText.includes(term) || term.includes(action === 'export' ? '导出' : '整理'))) continue;
      for (const item of state.lib[type.collection]) {
        if (!terms.length && state.sel[type.selection] !== item.id) continue;
        const title = item.name || tr('未命名');
        if (includes(commandText + ' ' + title)) yield { label: prefix + ' · ' + title, detail: tr(type.label), icon: type.route, raw: true, run: () => performTargetAction(kind, item.id, action) };
      }
    }
    for (const route of ROUTES) {
      const label = tr(route.label), detail = tr('跳转页面');
      if (includes([label, detail, route.id, route.label].join(' '))) yield { label, detail, icon: route.id, run: () => UI().go(route.id) };
    }
    if (terms.length) {
      for (const hit of search.matches(state.lib, query)) yield { label: hit.title || tr('未命名'), detail: search.describe(hit), icon: search.types[hit.target.kind].route, raw: true, run: () => search.open(hit.target) };
    } else {
      for (const [kind, type] of Object.entries(search.types)) {
        if (type.parent) continue;
        for (const item of state.lib[type.collection]) yield { label: item[type.title] || tr('未命名'), detail: tr(type.label), icon: type.route, raw: true, run: () => search.open({kind, id:item.id, field:type.title}) };
      }
    }
  }
  function paintCommand(query, offset = 0) {
    const page = root.TASearch.page(commandActions(query), offset, commandPageSize);
    commandItems = page.items; commandOffset = offset; commandHasMore = page.more; commandIndex = 0;
    const list = document.getElementById('workspace-command-results');
    list.innerHTML = commandItems.map((item, index) => `<button type="button" class="ws-command-result${index === 0 ? ' active' : ''}" role="option" aria-selected="${index === 0}" id="ws-result-${index}" data-command-index="${index}">${icon(item.icon)}<span><b ${item.raw ? 'data-no-translate' : ''}>${esc(item.label)}</b><small data-no-translate>${esc(item.detail)}</small></span>${icon('arrow')}</button>`).join('') || `<p class="ws-command-empty">${tr('没有找到匹配的内容')}</p>`;
    list.querySelectorAll('[data-command-index]').forEach((button) => { button.onclick = () => runCommand(Number(button.dataset.commandIndex)); });
    const footer = document.querySelector('#workspace-command footer');
    let pages = footer.querySelector('.search-pages');
    if (!pages) { pages = document.createElement('div'); pages.className = 'search-pages'; footer.prepend(pages); }
    pages.replaceChildren();
    if (offset || page.more) {
      for (const [step, label, available] of [[-1,'上一页',offset > 0],[1,'下一页',page.more]]) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-small';
        button.disabled = !available; button.textContent = tr(label);
        button.onclick = () => { paintCommand(query, offset + step * commandPageSize); document.getElementById('workspace-command-input').focus(); };
        pages.append(button);
      }
    }
    syncCommandIndex();
  }
  function syncCommandIndex() {
    document.querySelectorAll('[data-command-index]').forEach((button, index) => { button.classList.toggle('active', index === commandIndex); button.setAttribute('aria-selected', String(index === commandIndex)); if (index === commandIndex) button.scrollIntoView({ block: 'nearest' }); });
    const input = document.getElementById('workspace-command-input');
    if (commandItems.length) input.setAttribute('aria-activedescendant', `ws-result-${commandIndex}`); else input.removeAttribute('aria-activedescendant');
  }
  function runCommand(index) { const action = commandItems[index]; if (!action) return; closeCommand(); action.run(); }
  function openCommand() {
    closePeek();
    const host = document.getElementById('workspace-command');
    returnFocus = document.activeElement; host.hidden = false;
    const input = host.querySelector('input'); input.value = ''; paintCommand(''); input.focus();
  }
  function closeCommand() {
    const host = document.getElementById('workspace-command');
    if (host && !host.hidden) { host.hidden = true; returnFocus?.focus?.(); }
  }
  function resizeHandle(grid, panel, name, label, direction = 1) {
    if (!panel || grid.querySelector(`[data-resize="${name}"]`)) return;
    const variable = `--${name}-width`, defaultWidth = name === 'directory' ? 290 : name === 'target' ? 220 : 310;
    if (Number.isFinite(prefs[name])) grid.style.setProperty(variable, `${prefs[name]}px`);
    const handle = document.createElement('button');
    handle.type = 'button'; handle.className = `ws-resize ws-resize-${direction < 0 ? 'left' : 'right'}`; handle.dataset.resize = name;
    handle.setAttribute('role', 'separator'); handle.setAttribute('aria-orientation', 'vertical'); handle.setAttribute('aria-label', tr(label));
    const set = (width, persist = false) => {
      const minimum = name === 'chat' ? 260 : name === 'directory' ? 230 : 185;
      const max = Math.max(minimum, Math.min(name === 'chat' ? 460 : 380, grid.clientWidth * .42));
      const next = Math.round(Math.max(minimum, Math.min(max, width)));
      grid.style.setProperty(variable, `${next}px`); handle.setAttribute('aria-valuemin', String(minimum)); handle.setAttribute('aria-valuemax', String(Math.round(max))); handle.setAttribute('aria-valuenow', String(next));
      if (persist) { prefs[name] = next; savePrefs(); }
    };
    set(prefs[name] || defaultWidth);
    handle.onpointerdown = (event) => {
      if (event.button !== 0) return;
      event.preventDefault(); const startX = event.clientX, startWidth = panel.getBoundingClientRect().width;
      handle.setPointerCapture(event.pointerId); document.body.classList.add('ws-resizing');
      handle.onpointermove = (next) => set(startWidth + (next.clientX - startX) * direction);
      const finish = () => { handle.onpointermove = null; document.body.classList.remove('ws-resizing'); set(parseFloat(grid.style.getPropertyValue(variable)) || startWidth, true); };
      handle.onpointerup = finish; handle.onpointercancel = finish; handle.onlostpointercapture = finish;
    };
    handle.onkeydown = (event) => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); set(panel.getBoundingClientRect().width + (event.key === 'ArrowRight' ? 16 : -16) * direction, true); }
      if (event.key === 'Home') { event.preventDefault(); set(defaultWidth, true); }
    };
    handle.ondblclick = () => set(defaultWidth, true);
    if (name === 'directory') {
      grid.style.position = 'relative';
      handle.classList.add('ws-resize-directory');
      grid.appendChild(handle);
    } else panel.appendChild(handle);
  }
  let attributionObserver = null;
  function sourceDetails(source, ownerId) {
    const value = root.TAResourceSource?.clean(source);
    if (!value) return null;
    const details = document.createElement('details');
    details.className = 'ws-resource-source'; details.dataset.sourceOwner = String(ownerId);
    const licenseLabel = { unknown:'请查看原帖说明', personal:'仅限个人使用', redistributable:'允许转载' }[value.license.status] || '请查看原帖说明';
    details.innerHTML = `<summary>${icon('lore')}<span>${tr('作者')}</span><strong data-no-translate>${esc(value.author.name)}</strong>${icon('chevron')}</summary><div class="ws-resource-source-body"><div class="ws-resource-source-links">${value.author.profileUrl ? `<a href="${esc(value.author.profileUrl)}" target="_blank" rel="noopener noreferrer">${tr('作者主页')}${icon('arrow')}</a>` : ''}<a href="${esc(value.postUrl)}" target="_blank" rel="noopener noreferrer">${tr('打开原帖')}${icon('arrow')}</a></div><p class="ws-resource-license">${tr(licenseLabel)}</p>${value.license.note ? `<p data-no-translate>${esc(value.license.note)}</p>` : ''}<p class="ws-resource-support">${tr('请尽量支持原作者。喜欢这份作品的话，请到原帖评论区，毫不吝啬地留下您的赞赏。您的赞赏，才是他们最大的动力。')}</p></div>`;
    return details;
  }
  function enhanceAttribution(stage) {
    attributionObserver?.disconnect(); attributionObserver = null;
    const lib = UI().state.lib, route = UI().state.route;
    if (route === 'characters') {
      const form = stage.querySelector('#char-form'), card = lib.characters.find(item => item.id === UI().state.sel.character);
      const details = form && card && sourceDetails(card.source, card.id);
      if (details && !form.querySelector('.ws-resource-source')) {
        const heading = form.querySelector('.ws-form-heading');
        if (heading) heading.insertAdjacentElement('afterend', details); else form.prepend(details);
      }
    } else if (route === 'lore') {
      const board = stage.querySelector('.board-layout'), book = lib.worldBooks.find(item => item.id === UI().state.sel.book);
      const details = board && book && sourceDetails(book.source, book.id);
      if (details && !stage.querySelector('.ws-resource-source')) board.before(details);
    } else if (route === 'assets') {
      const side = stage.querySelector('#asset-side'); if (!side) return;
      const paintSource = () => {
        const asset = lib.assets.find(item => item.id === UI().state.sel.asset), panel = side.querySelector('.paper');
        if (!panel) return;
        const old = panel.querySelector('.ws-resource-source');
        if (old?.dataset.sourceOwner === asset?.id) return;
        old?.remove();
        const details = asset && sourceDetails(asset.source, asset.id);
        if (details) panel.prepend(details);
      };
      paintSource();
      // The asset editor replaces this direct child when another thumbnail is chosen.
      attributionObserver = new MutationObserver(paintSource);
      attributionObserver.observe(side, { childList: true });
    }
  }
  function enhance(stage) {
    stage.dataset.route = UI().state.route;
    const resources = stage.querySelector('#sticker-host');
    if (resources?.childElementCount && !resources.closest('.ws-resource-details')) {
      const details = document.createElement('details'); details.className = 'ws-assist-details ws-resource-details';
      details.innerHTML = `<summary>${icon('assets')}${tr('表情包与文件工具')}</summary>`;
      stage.appendChild(details); details.appendChild(resources);
      const json = stage.querySelector('#json-host'); if (json) details.appendChild(json);
    }
    const ai = stage.querySelector('.ai-editor-grid');
    if (ai) {
      resizeHandle(ai, ai.querySelector('.ai-target-panel'), 'target', '调整目录宽度');
      resizeHandle(ai, ai.querySelector('.ai-chat-panel'), 'chat', '调整 AI 面板宽度', -1);
      const source = ai.querySelector('.ai-source-panel');
      if (source && !source.querySelector('[data-source-focus]')) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'ws-icon-button'; button.dataset.sourceFocus = ''; button.title = tr('专注编辑'); button.setAttribute('aria-label', tr('专注编辑')); button.setAttribute('aria-pressed', 'false'); button.innerHTML = icon('focus');
        source.querySelector('.ai-panel-heading')?.appendChild(button);
        button.onclick = () => { const on = ai.classList.toggle('source-focused'); button.setAttribute('aria-pressed', String(on)); };
      }
      const targets = ai.querySelectorAll('.ai-target-row');
      targets.forEach((row) => { row.classList.toggle('is-selected', !!row.querySelector('input:checked')); });
    }
    const directory = stage.querySelector('.board-layout');
    if (directory) resizeHandle(directory, directory.querySelector('.board'), 'directory', '调整目录宽度');
    const form = stage.querySelector('#char-form');
    if (form && !form.querySelector('.ws-form-heading')) {
      const heading = document.createElement('header'); heading.className = 'ws-form-heading'; heading.innerHTML = `<div><span class="ws-kicker">${tr('角色卡')}</span><h3>${tr('人物设定')}</h3></div><div class="row"><button type="button" class="btn btn-small" data-card-organize>${icon('sections')}${tr('整理分栏')}</button><button type="button" class="btn btn-small" data-card-collaborate>${icon('studio')}${tr('让 AI 帮忙改')}</button></div>`;
      heading.querySelector('[data-card-collaborate]').onclick = () => editWithAI({ kind: 'character', id: UI().state.sel.character });
      heading.querySelector('[data-card-organize]').onclick = () => root.NIJANOrganizePanel.open({ kind: 'character', cardId: UI().state.sel.character }); form.prepend(heading);
    }
    stage.querySelectorAll('[data-quick-instruction]').forEach((button) => {
      button.onclick = () => { const area = stage.querySelector('#ai-instruction'); if (!area) return; area.value = area.value.trim() ? `${area.value.trim()}\n${button.dataset.quickInstruction}` : button.dataset.quickInstruction; area.dispatchEvent(new Event('input', { bubbles: true })); area.focus(); };
    });
    stage.querySelectorAll('[data-context-remove]').forEach((button) => {
      button.onclick = () => { const target = [...stage.querySelectorAll('[data-target]')].find((input) => input.dataset.target === button.dataset.contextRemove); if (target) { target.checked = false; target.dispatchEvent(new Event('change', { bubbles: true })); } };
    });
    enhanceAttribution(stage);
  }
  function mount() {
    if (mounted) return; mounted = true;
    document.querySelector('.shell')?.classList.toggle('nav-collapsed', !!prefs.collapsed);
    document.querySelector('[data-workspace="sidebar"]')?.setAttribute('aria-expanded', String(!prefs.collapsed));
    if (prefs.collapsed) document.querySelector('.nav-tools')?.setAttribute('open', '');
    const entry = new URLSearchParams(location.search).get('entry'); if (entry) UI().state.sel.entry = entry;
    document.body.insertAdjacentHTML('beforeend', `<div id="workspace-command" class="workspace-overlay" hidden><section class="ws-command" role="dialog" aria-modal="true" aria-label="${esc(tr('搜索或跳转'))}"><header>${icon('search')}<input id="workspace-command-input" type="search" placeholder="${esc(tr('搜索页面、角色、条目或正文…'))}" role="combobox" aria-expanded="true" aria-controls="workspace-command-results" autocomplete="off"><button type="button" class="ws-key" data-workspace="close-command">Esc</button></header><div class="ws-command-label">${tr('页面与资料')}</div><div id="workspace-command-results" role="listbox"></div><footer><span>↑ ↓ ${tr('选择')}</span><span>↵ ${tr('打开')}</span><span>Esc ${tr('关闭')}</span></footer></section></div><div id="workspace-peek" hidden></div><div id="workspace-context" class="workspace-context" role="menu" hidden></div>`);
    document.getElementById('workspace-command-input').oninput = (event) => paintCommand(event.target.value);
    document.getElementById('workspace-command').onclick = (event) => { if (event.target.id === 'workspace-command') closeCommand(); };
    document.addEventListener('click', (event) => {
      const action = event.target.closest('[data-workspace]');
      if (action) {
        const name = action.dataset.workspace;
        if (name === 'command') openCommand();
        if (name === 'settings') document.querySelector('[data-shell="settings"]')?.click();
        if (name === 'close-command') closeCommand();
        if (name === 'sidebar') { prefs.collapsed = !prefs.collapsed; savePrefs(); document.querySelector('.shell').classList.toggle('nav-collapsed', prefs.collapsed); action.setAttribute('aria-expanded', String(!prefs.collapsed)); const tools = document.querySelector('.nav-tools'); if (tools && prefs.collapsed) tools.open = true; }
        if (name === 'focus') setFocus(!focusMode);
      }
      const peek = event.target.closest('[data-peek-entry],[data-peek-card]');
      if (peek) { event.stopPropagation(); showPeek(rowRef(peek), peek, true); }
      if (!event.target.closest('#workspace-context')) { const menu = document.getElementById('workspace-context'); if (menu) menu.hidden = true; }
    }, true);
    document.addEventListener('pointerover', (event) => {
      const target = event.target.closest('[data-peek-entry],[data-peek-card]');
      if (!target || target.contains(event.relatedTarget)) return;
      clearTimeout(peekTimer); peekTimer = setTimeout(() => { if (document.getElementById('workspace-peek').hidden) showPeek(rowRef(target), target); }, 500);
    });
    document.addEventListener('pointerout', (event) => { const target = event.target.closest('[data-peek-entry],[data-peek-card]'); if (target && !target.contains(event.relatedTarget)) clearTimeout(peekTimer); });
    document.addEventListener('contextmenu', (event) => {
      const row = event.target.closest('.entry[data-id],.pick[data-id]'); const ref = row && rowRef(row); if (!ref) return;
      event.preventDefault(); closePeek();
      const menu = document.getElementById('workspace-context'); menu.hidden = false;
      menu.innerHTML = `<button type="button" role="menuitem" data-menu="preview">${icon('eye')}${tr('原文预览')}</button><button type="button" role="menuitem" data-menu="ai">${icon('studio')}${tr('交给 AI 修改')}</button><button type="button" role="menuitem" data-menu="copy">${icon('sections')}${tr('复制名称')}</button>`;
      menu.style.left = `${Math.max(8, Math.min(event.clientX || row.getBoundingClientRect().left, innerWidth - 220))}px`;
      menu.style.top = `${Math.max(8, Math.min(event.clientY || row.getBoundingClientRect().top, innerHeight - 160))}px`;
      menu.querySelector('[data-menu="preview"]').onclick = () => showPeek(ref, row, true);
      menu.querySelector('[data-menu="ai"]').onclick = () => editWithAI(ref);
      menu.querySelector('[data-menu="copy"]').onclick = () => { UI().copyText(lookup(ref)?.name || ''); menu.hidden = true; };
      menu.querySelector('button').focus();
    });
    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); openCommand(); return; }
      const command = document.getElementById('workspace-command');
      if (!command.hidden) {
        if (event.key === 'PageUp' || event.key === 'PageDown') {
          event.preventDefault();
          const next = event.key === 'PageDown';
          if (next ? commandHasMore : commandOffset > 0) paintCommand(document.getElementById('workspace-command-input').value, commandOffset + (next ? 1 : -1) * commandPageSize);
        }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); commandIndex = commandItems.length ? (commandIndex + (event.key === 'ArrowDown' ? 1 : -1) + commandItems.length) % commandItems.length : 0; syncCommandIndex(); }
        if (event.key === 'Enter' && !event.isComposing && document.activeElement.id === 'workspace-command-input') { event.preventDefault(); runCommand(commandIndex); }
      }
      if (event.key === 'Escape') {
        if (!command.hidden) { event.preventDefault(); closeCommand(); return; }
        const peek = document.getElementById('workspace-peek'), menu = document.getElementById('workspace-context');
        if (!peek.hidden || !menu.hidden) { event.preventDefault(); closePeek(); return; }
        const settingsClose = document.querySelector('#modal-root.show #set-close');
        if (settingsClose) { event.preventDefault(); settingsClose.click(); return; }
        const focused = document.querySelector('.source-focused'); if (focused) { focused.classList.remove('source-focused'); focused.querySelector('[data-source-focus]')?.setAttribute('aria-pressed', 'false'); return; }
        if (focusMode) setFocus(false);
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.isComposing) {
        const id = document.activeElement.id;
        const button = { 'ai-instruction': 'ai-revise', 'ai-creation-message': 'ai-discuss' }[id];
        if (button) { event.preventDefault(); document.getElementById(button)?.click(); }
      }
      const context = document.getElementById('workspace-context');
      if (!context.hidden && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) { event.preventDefault(); const items = [...context.querySelectorAll('button')], index = items.indexOf(document.activeElement); items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus(); }
      const modal = !command.hidden ? command.querySelector('[role="dialog"]') : document.querySelector('.workspace-sheet') || document.querySelector('#modal-root.show [role="dialog"]');
      if (modal && event.key === 'Tab') {
        const items = UI().dialogTabStops(modal);
        const first = items[0], last = items[items.length - 1];
        const active = document.activeElement;
        if (!modal.contains(active) || (event.shiftKey ? active === first : active === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
      }
    });
    addEventListener('resize', closePeek);
  }
  function prepareSettings(host) {
    const modal = host.querySelector('.modal'); if (!modal) return;
    const children = [...modal.children], heading = modal.querySelector('h3'), footer = modal.querySelector('#set-close').parentElement;
    const head = document.createElement('header'); head.className = 'ws-settings-head';
    const topClose = document.createElement('button'); topClose.type = 'button'; topClose.className = 'ws-icon-button'; topClose.setAttribute('aria-label', tr('关闭')); topClose.innerHTML = icon('close'); topClose.onclick = () => host.querySelector('#set-close')?.click();
    head.append(heading, topClose);
    const tabs = document.createElement('nav'); tabs.className = 'ws-settings-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', tr('设置分类'));
    const content = document.createElement('div'); content.className = 'ws-settings-content';
    const panels = {};
    [['model', '模型接入'], ['writing', '创作偏好'], ['appearance', '外观与语言']].forEach(([id, label]) => {
      const button = document.createElement('button'); button.type = 'button'; button.id = `settings-${id}-tab`; button.dataset.settingsTab = id; button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', `settings-${id}-panel`); button.textContent = tr(label); tabs.append(button);
      const panel = document.createElement('section'); panel.id = `settings-${id}-panel`; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', button.id); panel.tabIndex = 0; panels[id] = panel; content.append(panel);
    });
    let group = 'appearance';
    children.forEach((child) => {
      if (child === heading || child === footer) return;
      if (child.querySelector('#set-json')) group = 'writing';
      if (child.hasAttribute('data-model-heading')) group = 'model';
      if (child.querySelector('#set-profile')) group = 'writing';
      if (child.matches('p.field-label') && child.textContent.trim() === '主题') group = 'appearance';
      panels[group].append(child);
    });
    footer.className = 'ws-settings-footer';
    const note = document.createElement('small'); note.textContent = tr('设置自动保存在本机'); footer.prepend(note);
    modal.replaceChildren(head, tabs, content, footer); modal.classList.add('ws-settings');
    const activate = (id, focus = false) => {
      tabs.querySelectorAll('button').forEach((button) => { const on = button.dataset.settingsTab === id; button.setAttribute('aria-selected', String(on)); button.tabIndex = on ? 0 : -1; if (on && focus) button.focus(); });
      Object.entries(panels).forEach(([key, panel]) => { panel.hidden = key !== id; }); content.scrollTop = 0;
    };
    tabs.querySelectorAll('button').forEach((button, index) => {
      button.onclick = () => activate(button.dataset.settingsTab);
      button.onkeydown = (event) => { const buttons = [...tabs.querySelectorAll('button')]; if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { event.preventDefault(); activate(buttons[(index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length].dataset.settingsTab, true); } };
    });
    activate('model'); topClose.focus();
  }
  root.TAWorkspace = { icon, mount, enhance, openEntity, editWithAI, showPeek, prepareSettings };
})(globalThis);
