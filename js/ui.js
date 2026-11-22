/* Shell, persistence, and small DOM helpers. Views live in views.js. */
(function (root) {
  const ROUTES = [
    { id: 'home', mark: '〇', label: '总览', eyebrow: 'ATELIER', title: '工坊总览', search: false, blurb: '看这台浏览器里有多少稿。点数字或角色，进入对应模块。' },
    { id: 'characters', mark: '壹', label: '角色卡工坊', eyebrow: 'CARD V2', title: '角色卡工坊', search: true, placeholder: '搜角色、标签', blurb: '写酒馆角色卡 v2。导出 JSON 或 PNG，到角色列表里导入。' },
    { id: 'lore', mark: '贰', label: '世界书看板', eyebrow: 'LORE', title: '世界书看板', search: true, placeholder: '搜条目、关键词', blurb: '按注入位置整理世界书。导出后到酒馆「世界信息」导入。' },
    { id: 'prompts', mark: '叁', label: '提示词拼装', eyebrow: 'PROMPT', title: '提示词拼装', search: true, placeholder: '搜块名称', blurb: '把提示词块排好顺序。导出后对照抄进预设，不要整份覆盖。' },
    { id: 'groups', mark: '肆', label: '群聊卡司', eyebrow: 'CAST', title: '群聊卡司', search: true, placeholder: '搜群名', blurb: '从库里选角色排成群聊。导出的是名单，酒馆不能直接导入群文件。' },
    { id: 'chat', mark: '伍', label: '聊天阅览', eyebrow: 'READING', title: '聊天阅览', search: true, placeholder: '搜聊天标题', blurb: '读酒馆聊天来查阅、搜索、做书签。不会写回酒馆的 chats。' },
    { id: 'assets', mark: '陆', label: '素材库', eyebrow: 'ASSETS', title: '素材库', search: true, placeholder: '搜素材名', blurb: '头像、表情和背景存在这台浏览器里，再指定给角色或聊天。' },
    { id: 'regex', mark: '柒', label: '正则脚本', eyebrow: 'REGEX', title: '正则脚本', search: true, placeholder: '搜脚本', blurb: '写法与酒馆正则扩展一致。导出 JSON 数组后，在扩展里导入。' },
    { id: 'quick', mark: '捌', label: '快捷回复', eyebrow: 'QUICK', title: '快捷回复', search: true, placeholder: '搜回复', blurb: '做一组可复制的短句。导出为 Quick Reply v2。' },
    { id: 'timeline', mark: '玖', label: '作者注与情景时间线', eyebrow: 'TIMELINE', title: '作者注与情景时间线', search: true, placeholder: '搜注记、情节', blurb: '楼层注记和情节节拍画在同一条轴上。导出的是工坊自己的 JSON。' },
    { id: 'graph', mark: '拾', label: '角色关系图', eyebrow: 'GRAPH', title: '角色关系图', search: false, blurb: '拖人物、连关系。导出时每条线变成世界书条目。' },
    { id: 'check', mark: '拾壹', label: '人设一致性检查', eyebrow: 'CHECK', title: '人设一致性检查', search: false, blurb: '本地对照空字段、近名、发色瞳色，以及恒定条目和正文是否打架。不是模型审查。' },
    { id: 'script', mark: '拾贰', label: '群聊剧本', eyebrow: 'SCRIPT', title: '群聊剧本', search: true, placeholder: '搜剧本、台词', blurb: '按顺序写旁白或角色的句子，可加触发词。导出工坊自己的 JSON。' },
    { id: 'theme', mark: '拾叁', label: '主题预设', eyebrow: 'THEME', title: '主题预设', search: false, blurb: '改的是工坊自己的纸色和字号。酒馆要另贴 CSS，选择器不会自动对上。' },
    { id: 'backup', mark: '拾肆', label: '整库备份', eyebrow: 'BACKUP', title: '整库备份', search: false, blurb: '一份 JSON 带走整库。恢复时可替换，或按编号合并。' },
  ];

  const state = {
    lib: null,
    route: 'home',
    query: '',
    persistent: true,
    fresh: false,
    save: 'saved',
    timer: null,
    lab: '“雨还在下。”她把杯子转正。',
    sel: {},
  };

  let views = {};

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function toast(message) {
    const host = document.getElementById('toasts');
    if (!host) return;
    const node = document.createElement('div');
    node.className = 'toast';
    node.textContent = message;
    host.appendChild(node);
    while (host.children.length > 2) host.firstChild.remove();
    setTimeout(() => node.remove(), 3200);
  }

  function ask({ title, body, actions }) {
    return new Promise((resolve) => {
      const host = document.getElementById('modal-root');
      host.classList.add('show');
      host.innerHTML = `<div class="modal paper" role="dialog" aria-modal="true">
        <h3>${esc(title)}</h3>
        <p>${esc(body)}</p>
        <div class="row">${actions.map((action) => `<button type="button" class="btn ${action.kind || ''}" data-act="${esc(action.id)}">${esc(action.label)}</button>`).join('')}</div>
      </div>`;
      const finish = (value) => {
        host.classList.remove('show');
        host.innerHTML = '';
        resolve(value);
      };
      host.onclick = (event) => { if (event.target === host) finish(null); };
      host.querySelectorAll('[data-act]').forEach((button) => {
        button.onclick = () => finish(button.dataset.act);
      });
      host.querySelector('[data-act]')?.focus();
    });
  }

  function downloadBlob(filename, blob) {
    document.dispatchEvent(new CustomEvent('tavern-export', { detail: { filename, blob } }));
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function downloadText(filename, text, mime) {
    downloadBlob(filename, new Blob([text], { type: mime || 'application/json;charset=utf-8' }));
  }

  function downloadJson(filename, data) {
    downloadText(filename, JSON.stringify(data, null, 2));
  }

  function pickFile(accept, multiple) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept || '';
      input.multiple = !!multiple;
      input.onchange = () => resolve(multiple ? [...(input.files || [])] : (input.files && input.files[0]) || null);
      input.click();
    });
  }

  function readText(file) {
    return file.text();
  }

  function readDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('已复制');
    } catch (error) {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      toast('已复制');
    }
  }

  function safeName(name) {
    return String(name || '未命名').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  }

  function assetById(id) {
    return (state.lib.assets || []).find((asset) => asset.id === id) || null;
  }

  function charById(id) {
    return (state.lib.characters || []).find((character) => character.id === id) || null;
  }

  function selected(list, id) {
    return (list || []).find((item) => item.id === id) || (list || [])[0] || null;
  }

  function matchQuery(text) {
    const query = state.query.trim().toLowerCase();
    if (!query) return true;
    return String(text || '').toLowerCase().includes(query);
  }

  function paintSave() {
    const pill = document.getElementById('save-pill');
    if (!pill) return;
    const map = { saved: '已保存', dirty: '待写入', saving: '正在写入…', error: '未能写入' };
    pill.className = `pill${state.save === 'error' ? ' err' : state.save === 'saved' ? '' : ' dirty'}`;
    pill.innerHTML = `<i></i>${map[state.save] || '已保存'}`;
  }

  function markDirty() {
    state.save = 'dirty';
    paintSave();
    clearTimeout(state.timer);
    state.timer = setTimeout(flush, 320);
  }

  function flush() {
    clearTimeout(state.timer);
    state.save = 'saving';
    paintSave();
    try {
      TAStore.save(state.lib);
      state.save = 'saved';
    } catch (error) {
      state.save = 'error';
      toast(error.message);
    }
    paintSave();
  }

  function applyTheme() {
    const theme = (state.lib.themes || []).find((item) => item.id === state.lib.activeThemeId);
    const style = document.documentElement.style;
    if (!theme) return;
    const vars = theme.vars || {};
    style.setProperty('--bg', vars.bg || '#140e0a');
    style.setProperty('--lacquer', vars.lacquer || '#24180f');
    style.setProperty('--paper', vars.paper || '#f4e7d1');
    style.setProperty('--foam', vars.paper || '#f4e7d1');
    style.setProperty('--ink', vars.ink || '#1a120c');
    style.setProperty('--brass', vars.accent || '#c6a15a');
    style.setProperty('--brass-2', vars.accent || '#c6a15a');
    style.setProperty('--font-scale', String(vars.fontScale || 1));
    style.setProperty('--radius', `${vars.radius || 18}px`);
    style.setProperty('--bubble-radius', `${Math.max(8, Number(vars.radius || 18) - 2)}px`);
  }

  function routeMeta() {
    return ROUTES.find((route) => route.id === state.route) || ROUTES[0];
  }

  function paintChrome() {
    const meta = routeMeta();
    document.querySelectorAll('[data-nav]').forEach((button) => {
      button.classList.toggle('on', button.dataset.nav === state.route);
    });
    document.getElementById('eyebrow').textContent = meta.eyebrow;
    document.getElementById('title').textContent = meta.title;
    const blurb = document.getElementById('blurb');
    if (blurb) blurb.textContent = meta.blurb || '';
    const search = document.getElementById('search');
    search.parentElement.hidden = !meta.search;
    search.placeholder = meta.placeholder || '搜索';
    const searchNote = document.getElementById('search-note');
    if (searchNote) searchNote.textContent = meta.search ? '只过滤这一页，不改库。' : '';
  }

  function renderStage() {
    const stage = document.getElementById('stage');
    paintChrome();
    paintSave();
    const view = views[state.route] || views.home;
    stage.innerHTML = '';
    stage.ondragover = null;
    stage.ondrop = null;
    try {
      view(stage);
    } catch (error) {
      console.error(error);
      stage.innerHTML = `<div class="paper empty"><h3>这一页没有画出来</h3><p>${esc(error.message)}</p></div>`;
    }
  }

  function go(id) {
    const next = ROUTES.some((route) => route.id === id) ? id : 'home';
    if (location.hash !== `#${next}`) location.hash = next;
    else show(next);
  }

  function show(id) {
    state.route = ROUTES.some((route) => route.id === id) ? id : 'home';
    state.query = '';
    const search = document.getElementById('search');
    if (search) search.value = '';
    renderStage();
  }

  function field(label, inner, help) {
    return `<label class="field"><span class="field-label">${label}</span>${inner}${help ? `<span class="help">${help}</span>` : ''}</label>`;
  }

  function area(name, value, rows) {
    return `<textarea data-field="${name}" rows="${rows || 5}">${esc(value || '')}</textarea>`;
  }

  function text(name, value, placeholder) {
    return `<input data-field="${name}" type="text" value="${esc(value || '')}" placeholder="${esc(placeholder || '')}">`;
  }

  function bindFields(rootNode, obj, onChange) {
    rootNode.querySelectorAll('[data-field]').forEach((node) => {
      const eventName = node.tagName === 'SELECT' || node.type === 'checkbox' ? 'change' : 'input';
      node.addEventListener(eventName, () => {
        let value = node.value;
        if (node.type === 'checkbox') value = node.checked;
        else if (node.type === 'number' || node.type === 'range') value = node.value === '' ? '' : Number(node.value);
        obj[node.dataset.field] = value;
        if (onChange) onChange(node.dataset.field, value);
        markDirty();
      });
    });
  }

  function picker(items, currentId, subtitle) {
    if (!items.length) return '';
    return `<div class="picker">${items.map((item) => `<button type="button" class="pick${item.id === currentId ? ' on' : ''}" data-id="${esc(item.id)}"><b>${esc(item.name || '未命名')}</b><small>${esc(subtitle ? subtitle(item) : '')}</small></button>`).join('')}</div>`;
  }

  function bindPicker(rootNode, assign) {
    rootNode.querySelectorAll('.pick').forEach((button) => {
      button.onclick = () => assign(button.dataset.id);
    });
  }

  function empty(title, body, actionLabel, action) {
    const wrap = document.createElement('div');
    wrap.className = 'paper empty';
    wrap.innerHTML = `<h3>${esc(title)}</h3><p class="muted">${esc(body)}</p>${actionLabel ? `<button type="button" class="btn btn-primary" data-empty>${esc(actionLabel)}</button>` : ''}`;
    const button = wrap.querySelector('[data-empty]');
    if (button) button.onclick = action;
    return wrap;
  }

  async function confirmLoadDemo() {
    const answer = await ask({
      title: '载入示例',
      body: '听雨楼的示例会替换当前库里的角色、世界书、聊天和主题。若要留下现在的稿子，请先到「整库备份」导出。',
      actions: [
        { id: 'yes', label: '替换为示例', kind: 'btn-primary' },
        { id: 'no', label: '取消' },
      ],
    });
    if (answer !== 'yes') return;
    state.lib = TAStore.demoLibrary();
    flush();
    toast('已载入听雨楼示例');
    renderStage();
  }

  async function confirmClear() {
    const answer = await ask({
      title: '清空库',
      body: '页面里的角色、世界书、素材和备份以外的内容都会从这台浏览器删掉。导出过的文件不会受影响。',
      actions: [
        { id: 'yes', label: '清空', kind: 'btn-danger' },
        { id: 'no', label: '取消' },
      ],
    });
    if (answer !== 'yes') return;
    state.lib = TAStore.emptyLibrary();
    flush();
    toast('库已清空');
    renderStage();
  }

  function mount(registered) {
    views = registered;
    const loaded = TAStore.load();
    state.lib = loaded.library;
    state.persistent = loaded.persistent;
    state.fresh = loaded.fresh;
    const app = document.getElementById('app');
    app.innerHTML = `<div class="shell">
      <aside class="nav">
        <div class="brand"><span class="seal">坊</span><span><strong>酒馆工坊</strong><em>TAVERN ATELIER</em></span></div>
        <nav class="nav-list">${ROUTES.map((route) => `<button type="button" class="nav-btn" data-nav="${route.id}"><span class="mark">${route.mark}</span><span>${route.label}</span></button>`).join('')}</nav>
        <div class="nav-foot">
          <p class="note">示例会替换当前库。清空只删这台浏览器里的稿。</p>
          <button type="button" class="btn" data-shell="demo">载入示例</button>
          <button type="button" class="btn btn-danger" data-shell="clear">清空库</button>
        </div>
      </aside>
      <div class="main">
        <header class="top">
          <div><p class="eyebrow" id="eyebrow">ATELIER</p><h1 id="title">工坊总览</h1><p class="note" id="blurb"></p></div>
          <div class="top-actions">
            <label class="search"><input id="search" type="search" placeholder="搜索" autocomplete="off"><span class="note" id="search-note"></span></label>
            <span class="save-wrap"><span id="save-pill" class="pill"><i></i>已保存</span><span class="note">改动自动写入这台浏览器。</span></span>
          </div>
        </header>
        <div id="storage-banner"></div>
        <div class="stage" id="stage"></div>
      </div>
    </div>
    <div id="modal-root" class="modal-root"></div>
    <div id="toasts" class="toasts"></div>`;
    document.querySelectorAll('[data-nav]').forEach((button) => {
      button.onclick = () => go(button.dataset.nav);
    });
    document.querySelector('[data-shell="demo"]').onclick = confirmLoadDemo;
    document.querySelector('[data-shell="clear"]').onclick = confirmClear;
    document.getElementById('search').addEventListener('input', (event) => {
      state.query = event.target.value;
      renderStage();
    });
    if (!state.persistent) {
      document.getElementById('storage-banner').innerHTML = '<div class="banner">这台浏览器没有把本地存储开放给当前页面。改动只留在这次打开里，离开前请导出整库备份。</div>';
    }
    applyTheme();
    window.addEventListener('hashchange', () => show((location.hash || '#home').slice(1)));
    window.addEventListener('beforeunload', () => {
      if (state.save !== 'saved') {
        clearTimeout(state.timer);
        try { TAStore.save(state.lib); } catch (error) { /* 离开时写不进去就只能靠已经下载的备份 */ }
      }
    });
    if (state.fresh) {
      try { TAStore.save(state.lib); state.save = 'saved'; } catch (error) { state.save = 'error'; }
      toast(loaded.corrupt ? '原来的库读不出来，已改用示例。' : '已载入听雨楼示例。不需要的话可以清空库。');
    }
    const initial = (location.hash || '#home').slice(1);
    if (!location.hash) history.replaceState(null, '', '#home');
    show(initial);
  }

  root.TAUI = {
    ROUTES, state, esc, toast, ask, downloadBlob, downloadText, downloadJson, pickFile, readText, readDataUrl, copyText,
    safeName, assetById, charById, selected, matchQuery, markDirty, flush, applyTheme, go, renderStage, show,
    field, area, text, bindFields, picker, bindPicker, empty, confirmLoadDemo, confirmClear, mount,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
