/* Shell, persistence, and small DOM helpers. Views live in views.js. */
(function (root) {
  const ROUTES = [
    { id: 'home', mark: '01', label: '总览', eyebrow: 'NEON', title: '总览', search: false, blurb: 'blurb.home' },
    { id: 'characters', mark: '02', label: '角色卡工坊', eyebrow: 'CARD V2', title: '角色卡工坊', search: true, placeholder: '搜角色、标签', blurb: 'blurb.characters' },
    { id: 'lore', mark: '03', label: '世界书看板', eyebrow: 'LORE', title: '世界书看板', search: true, placeholder: '搜条目、关键词', blurb: 'blurb.lore' },
    { id: 'prompts', mark: '04', label: '提示词拼装', eyebrow: 'PROMPT', title: '提示词拼装', search: true, placeholder: '搜块名称', blurb: 'blurb.prompts' },
    { id: 'groups', mark: '05', label: '群聊卡司', eyebrow: 'CAST', title: '群聊卡司', search: true, placeholder: '搜群名', blurb: 'blurb.groups' },
    { id: 'chat', mark: '06', label: '聊天阅览', eyebrow: 'READING', title: '聊天阅览', search: true, placeholder: '搜聊天标题', blurb: 'blurb.chat' },
    { id: 'assets', mark: '07', label: '素材库', eyebrow: 'ASSETS', title: '素材库', search: true, placeholder: '搜素材名', blurb: 'blurb.assets' },
    { id: 'regex', mark: '08', label: '正则脚本', eyebrow: 'REGEX', title: '正则脚本', search: true, placeholder: '搜脚本', blurb: 'blurb.regex' },
    { id: 'quick', mark: '09', label: '快捷回复', eyebrow: 'QUICK', title: '快捷回复', search: true, placeholder: '搜回复', blurb: 'blurb.quick' },
    { id: 'timeline', mark: '10', label: '作者注与情景时间线', eyebrow: 'TIMELINE', title: '作者注与情景时间线', search: true, placeholder: '搜注记、情节', blurb: 'blurb.timeline' },
    { id: 'graph', mark: '11', label: '角色关系图', eyebrow: 'GRAPH', title: '角色关系图', search: false, blurb: 'blurb.graph' },
    { id: 'check', mark: '12', label: '人设一致性检查', eyebrow: 'CHECK', title: '人设一致性检查', search: false, blurb: 'blurb.check' },
    { id: 'script', mark: '13', label: '群聊剧本', eyebrow: 'SCRIPT', title: '群聊剧本', search: true, placeholder: '搜剧本、台词', blurb: 'blurb.script' },
    { id: 'theme', mark: '14', label: '主题预设', eyebrow: 'THEME', title: '主题预设', search: false, blurb: 'blurb.theme' },
    { id: 'backup', mark: '15', label: '整库备份', eyebrow: 'BACKUP', title: '整库备份', search: false, blurb: 'blurb.backup' },
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

  function estimateLength(text) {
    const raw = String(text || '');
    let tokens = 0;
    for (const ch of raw) {
      if (/\s/u.test(ch)) continue;
      tokens += /[\u3400-\u9fff\uf900-\ufaff]/u.test(ch) ? 1 : 0.25;
    }
    return { chars: Array.from(raw).length, tokens: Math.ceil(tokens) };
  }

  function mountLengths(rootNode) {
    if (!rootNode) return;
    rootNode.querySelectorAll('textarea').forEach((node) => {
      if (node.dataset.nolen != null) return;
      const rows = Number(node.getAttribute('rows') || 0);
      if (rows && rows < 3) return;
      if (node.nextElementSibling && node.nextElementSibling.classList.contains('len')) return;
      const meter = document.createElement('div');
      meter.className = 'len';
      node.insertAdjacentElement('afterend', meter);
      const paint = () => {
        const stat = estimateLength(node.value);
        const pct = Math.min(100, Math.round((stat.chars / 800) * 100));
        meter.innerHTML = `<i><b style="width:${pct}%"></b></i><span>${stat.chars} 字 · 约 ${stat.tokens} token</span>`;
      };
      paint();
      node.addEventListener('input', paint);
    });
  }

  function fillLesson(node, steps) {
    if (!node) return;
    node.replaceChildren();
    if (!steps || !steps.length) return;
    const list = document.createElement('ol');
    list.className = 'lesson';
    steps.forEach((step) => {
      const item = document.createElement('li');
      item.textContent = String(step);
      list.appendChild(item);
    });
    node.appendChild(list);
  }

  function showExport(file, summary) {
    const host = document.getElementById('export-slip');
    if (!host) return;
    host.innerHTML = `<div class="export-slip" role="status"><b>${esc(file)}</b><span>${esc(summary)}</span><button type="button" class="btn btn-small" data-close>知道了</button></div>`;
    host.querySelector('[data-close]').onclick = () => { host.innerHTML = ''; };
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
    const tr = (text) => (root.TAI18n ? root.TAI18n.t(text) : text);
    const map = { saved: tr('已保存'), dirty: tr('待写入'), saving: tr('正在写入…'), error: tr('未能写入') };
    pill.className = `pill${state.save === 'error' ? ' err' : state.save === 'saved' ? '' : ' dirty'}`;
    pill.innerHTML = `<i></i>${map[state.save] || tr('已保存')}`;
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
    style.setProperty('--bg', vars.bg || '#07090d');
    style.setProperty('--lacquer', vars.lacquer || '#0c1118');
    style.setProperty('--paper', vars.paper || '#101820');
    style.setProperty('--foam', '#e7fff6');
    style.setProperty('--ink', vars.ink || '#e9fff8');
    style.setProperty('--brass', vars.accent || '#d6ff3f');
    style.setProperty('--brass-2', '#3dffe8');
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
    const tr = (text) => (root.TAI18n ? root.TAI18n.t(text) : text);
    document.getElementById('eyebrow').textContent = meta.eyebrow;
    document.getElementById('title').textContent = tr(meta.title);
    const blurb = document.getElementById('blurb');
    if (blurb) blurb.textContent = tr(meta.blurb || '');
    const search = document.getElementById('search');
    search.parentElement.hidden = !meta.search;
    search.placeholder = tr(meta.placeholder || '搜索');
    const searchNote = document.getElementById('search-note');
    if (searchNote) searchNote.textContent = meta.search ? tr('只过滤这一页，不改库。') : '';
    document.querySelectorAll('[data-nav]').forEach((button) => {
      const route = ROUTES.find((item) => item.id === button.dataset.nav);
      if (!route) return;
      const mark = button.querySelector('.mark');
      const name = button.querySelector('[data-label]');
      if (mark) mark.textContent = route.mark;
      if (name) name.textContent = tr(route.label);
    });
    const importCard = document.querySelector('[data-shell="import-card"]');
    const importBook = document.querySelector('[data-shell="import-book"]');
    const settingsButton = document.querySelector('[data-shell="settings"]');
    const demoButton = document.querySelector('[data-shell="demo"]');
    const clearButton = document.querySelector('[data-shell="clear"]');
    const footNote = document.querySelector('.nav-foot .note');
    const saveNote = document.querySelector('.save-wrap .note');
    if (importCard) importCard.textContent = tr('导入角色卡');
    if (importBook) importBook.textContent = tr('导入世界书');
    if (settingsButton) settingsButton.textContent = tr('设置');
    if (demoButton) demoButton.textContent = tr('载入示例');
    if (clearButton) clearButton.textContent = tr('清空库');
    if (footNote) footNote.textContent = tr('示例会替换当前库。清空只删这台浏览器里的稿。');
    if (saveNote) saveNote.textContent = tr('改动自动写入这台浏览器。');
    document.title = '霓笺';
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
      if (root.TAI18n) root.TAI18n.localize(stage);
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
    const slip = document.getElementById('export-slip');
    if (slip) slip.innerHTML = '';
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

  function openSettings() {
    const prefs = root.TAI18n ? root.TAI18n.prefs : { lang: 'zh', teach: true, scale: 1, density: 'comfortable' };
    const tr = (text) => (root.TAI18n ? root.TAI18n.t(text) : text);
    const host = document.getElementById('modal-root');
    host.classList.add('show');
    host.innerHTML = `<div class="modal paper" role="dialog" aria-modal="true">
      <h3>${tr('设置')}</h3>
      <label class="field"><span class="field-label">${tr('界面语言')}</span>
        <select id="set-lang"><option value="zh">中文</option><option value="en">English</option><option value="ja">日本語</option></select>
      </label>
      <label class="check"><input id="set-teach" type="checkbox"> ${tr('显示逐步说明和导入解读')}</label>
      <label class="field"><span class="field-label">${tr('界面字号')}</span><input id="set-scale" type="range" min="0.9" max="1.2" step="0.05"></label>
      <label class="field"><span class="field-label">${tr('间距')}</span>
        <select id="set-density"><option value="comfortable">${tr('舒适')}</option><option value="compact">${tr('紧凑')}</option></select>
      </label>
      <div class="row"><button type="button" class="btn btn-primary" id="set-close">${tr('关闭')}</button></div>
    </div>`;
    host.querySelector('#set-lang').value = prefs.lang || 'zh';
    host.querySelector('#set-teach').checked = prefs.teach !== false;
    host.querySelector('#set-scale').value = String(prefs.scale || 1);
    host.querySelector('#set-density').value = prefs.density === 'compact' ? 'compact' : 'comfortable';
    const commit = () => {
      if (!root.TAI18n) return;
      root.TAI18n.save({
        lang: host.querySelector('#set-lang').value,
        teach: host.querySelector('#set-teach').checked,
        scale: Number(host.querySelector('#set-scale').value),
        density: host.querySelector('#set-density').value,
      });
      renderStage();
    };
    host.querySelector('#set-lang').onchange = commit;
    host.querySelector('#set-teach').onchange = commit;
    host.querySelector('#set-scale').oninput = commit;
    host.querySelector('#set-density').onchange = commit;
    const close = () => { host.classList.remove('show'); host.innerHTML = ''; };
    host.querySelector('#set-close').onclick = close;
    host.onclick = (event) => { if (event.target === host) close(); };
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
        <div class="brand"><span class="seal">笺</span><span><strong>霓笺</strong><em>NEON</em></span></div>
        <div class="nav-import">
          <button type="button" class="btn btn-primary" data-shell="import-card">导入角色卡</button>
          <button type="button" class="btn" data-shell="import-book">导入世界书</button>
          <button type="button" class="btn" data-shell="settings">设置</button>
        </div>
        <nav class="nav-list">${ROUTES.map((route) => `<button type="button" class="nav-btn" data-nav="${route.id}"><span class="mark">${route.mark}</span><span data-label>${route.label}</span></button>`).join('')}</nav>
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
        <div id="export-slip"></div>
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
    document.querySelector('[data-shell="import-card"]').onclick = () => { go('characters'); setTimeout(() => document.querySelector('[data-act="import"]')?.click(), 0); };
    document.querySelector('[data-shell="import-book"]').onclick = () => { go('lore'); setTimeout(() => document.querySelector('#import-book')?.click(), 0); };
    document.querySelector('[data-shell="settings"]').onclick = openSettings;
    if (root.TAI18n) root.TAI18n.apply();
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
    t: (key, vars) => (root.TAI18n ? root.TAI18n.t(key, vars) : key),
    estimateLength, mountLengths, showExport, fillLesson,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
