/* Shell, persistence, and small DOM helpers. Views live in views.js. */
(function (root) {
  const ROUTES = [
    { id: 'home', mark: '01', label: '总览', eyebrow: 'HOME', title: '总览', search: false, blurb: 'blurb.home' },
    { id: 'studio', mark: '02', label: 'AI 创作', eyebrow: 'STUDIO', title: 'AI 创作', search: false, blurb: 'blurb.studio' },
    { id: 'sections', mark: '03', label: '段落预设', eyebrow: 'SECTIONS', title: '段落预设', search: false, blurb: 'blurb.sections' },
    { id: 'characters', mark: '04', label: '角色卡工坊', eyebrow: 'CARD V2', title: '角色卡工坊', search: true, placeholder: '搜角色、标签', blurb: 'blurb.characters' },
    { id: 'lore', mark: '05', label: '世界书看板', eyebrow: 'LORE', title: '世界书看板', search: true, placeholder: '搜条目、关键词', blurb: 'blurb.lore' },
    { id: 'prompts', mark: '06', label: '提示词拼装', eyebrow: 'PROMPT', title: '提示词拼装', search: true, placeholder: '搜块名称', blurb: 'blurb.prompts' },
    { id: 'groups', mark: '07', label: '群聊卡司', eyebrow: 'CAST', title: '群聊卡司', search: true, placeholder: '搜群名', blurb: 'blurb.groups' },
    { id: 'chat', mark: '08', label: '聊天阅览', eyebrow: 'READING', title: '聊天阅览', search: true, placeholder: '搜聊天标题', blurb: 'blurb.chat' },
    { id: 'assets', mark: '09', label: '素材库', eyebrow: 'ASSETS', title: '素材库', search: true, placeholder: '搜素材名', blurb: 'blurb.assets' },
    { id: 'regex', mark: '10', label: '正则脚本', eyebrow: 'REGEX', title: '正则脚本', search: true, placeholder: '搜脚本', blurb: 'blurb.regex' },
    { id: 'quick', mark: '11', label: '快捷回复', eyebrow: 'QUICK', title: '快捷回复', search: true, placeholder: '搜回复', blurb: 'blurb.quick' },
    { id: 'timeline', mark: '12', label: '作者注与情景时间线', eyebrow: 'TIMELINE', title: '作者注与情景时间线', search: true, placeholder: '搜注记、情节', blurb: 'blurb.timeline' },
    { id: 'graph', mark: '13', label: '角色关系图', eyebrow: 'GRAPH', title: '角色关系图', search: false, blurb: 'blurb.graph' },
    { id: 'check', mark: '14', label: '人设一致性检查', eyebrow: 'CHECK', title: '人设一致性检查', search: false, blurb: 'blurb.check' },
    { id: 'script', mark: '15', label: '群聊剧本', eyebrow: 'SCRIPT', title: '群聊剧本', search: true, placeholder: '搜剧本、台词', blurb: 'blurb.script' },
    { id: 'backup', mark: '16', label: '整库备份', eyebrow: 'BACKUP', title: '整库备份', search: false, blurb: 'blurb.backup' },
    { id: 'tutorial', mark: '17', label: '使用教学', eyebrow: 'GUIDE', title: '使用教学', search: false, blurb: 'blurb.tutorial' },
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
        const lang = root.TAI18n && root.TAI18n.prefs.lang;
        const unit = lang === 'en' ? 'characters' : lang === 'ja' ? '字' : '字';
        const about = lang === 'en' ? 'about' : lang === 'ja' ? '約' : '约';
        meter.innerHTML = `<i><b style="width:${pct}%"></b></i><span>${stat.chars} ${unit} · ${about} ${stat.tokens} token</span>`;
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

  function ensureTheme() {
    const lib = state.lib;
    if (!lib.themes.length) {
      lib.themes.push({ id: 'theme_live', name: '夜漆', vars: { bg: '#1c1c1c', lacquer: '#141414', paper: '#2e2e2e', ink: '#e8e8e8', accent: '#d0d0d0', fontScale: 1, radius: 10 } });
    }
    const theme = lib.themes.find((item) => item.id === lib.activeThemeId) || lib.themes[0];
    lib.activeThemeId = theme.id;
    if (!theme.vars) theme.vars = {};
    return theme;
  }

  function applyTheme() {
    const theme = (state.lib.themes || []).find((item) => item.id === state.lib.activeThemeId);
    const style = document.documentElement.style;
    if (!theme) return;
    const vars = theme.vars || {};
    style.setProperty('--bg', vars.bg || '#1c1c1c');
    style.setProperty('--lacquer', vars.lacquer || '#141414');
    style.setProperty('--paper', vars.paper || '#2e2e2e');
    style.setProperty('--foam', vars.ink || '#e8e8e8');
    style.setProperty('--ink', vars.ink || '#e8e8e8');
    style.setProperty('--brass', vars.accent || '#d0d0d0');
    style.setProperty('--brass-2', vars.accent || '#f2f2f2');
    style.setProperty('--font-scale', String(vars.fontScale || 1));
    style.setProperty('--radius', `${vars.radius || 18}px`);
    style.setProperty('--bubble-radius', `${Math.max(8, Number(vars.radius || 18) - 2)}px`);
  }

  function routeMeta() {
    return ROUTES.find((route) => route.id === state.route) || ROUTES[0];
  }

  function paintRail() {
    const host = document.getElementById('rail-cast');
    if (!host || !state.lib) return;
    host.innerHTML = (state.lib.characters || []).map((character) => {
      const avatar = assetById(character.avatarAssetId);
      const face = avatar ? `<img alt="" src="${esc(avatar.dataUrl)}">` : `<span>${esc((character.name || '名').slice(0, 1))}</span>`;
      const on = state.sel.character === character.id ? ' on' : '';
      return `<button type="button" class="rail-char${on}" data-char="${esc(character.id)}">${face}<b>${esc(character.name || '未命名')}</b></button>`;
    }).join('');
    host.querySelectorAll('[data-char]').forEach((button) => {
      button.onclick = () => { state.sel.character = button.dataset.char; go('characters'); };
    });
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
    search.parentElement.hidden = false;
    search.placeholder = tr('搜索角色、世界书、正则');
    const searchNote = document.getElementById('search-note');
    if (searchNote) searchNote.textContent = tr('跨页搜索，不改库。');
    document.querySelectorAll('[data-nav]').forEach((button) => {
      const route = ROUTES.find((item) => item.id === button.dataset.nav);
      if (!route) return;
      const mark = button.querySelector('.mark');
      const name = button.querySelector('[data-label]');
      if (mark) mark.textContent = route.mark;
      if (name) name.textContent = tr(route.label);
    });
    paintRail();
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
    if (root.TAI18n) root.TAI18n.apply();
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
      if (root.TAI18n) {
        root.TAI18n.localize(document.getElementById('app'));
        root.TAI18n.localize(document.getElementById('modal-root'));
      }
    } catch (error) {
      console.error(error);
      stage.innerHTML = `<div class="paper empty"><h3>这一页没有画出来</h3><p>${esc(error.message)}</p></div>`;
    }
  }

  function pageHref(id) {
    return id === 'home' ? 'index.html' : `${id}.html`;
  }

  function paintGlobalSearch(query) {
    const host = document.getElementById('search-results');
    if (!host) return;
    const text = String(query || '').trim().toLowerCase();
    if (!text || !state.lib) { host.innerHTML = ''; return; }
    const hits = [];
    (state.lib.characters || []).forEach((item) => {
      const blob = [item.name, item.tags && item.tags.join(' '), item.description].join('\n').toLowerCase();
      if (blob.includes(text)) hits.push({ href: `characters.html#${item.id}`, label: `角色卡 ${item.name || '未命名'}` });
    });
    (state.lib.worldBooks || []).forEach((book) => {
      const blob = [book.name, ...(book.entries || []).map((entry) => [entry.comment, (entry.keys || []).join(' '), entry.content].join('\n'))].join('\n').toLowerCase();
      if (blob.includes(text)) hits.push({ href: `lore.html#${book.id}`, label: `世界书 ${book.name || '未命名'}` });
    });
    (state.lib.regexScripts || []).forEach((script) => {
      const blob = [script.scriptName, script.findRegex].join('\n').toLowerCase();
      if (blob.includes(text)) hits.push({ href: `regex.html#${script.id}`, label: `正则 ${script.scriptName || '未命名'}` });
    });
    host.innerHTML = hits.slice(0, 12).map((hit) => `<a href="${esc(hit.href)}">${esc(hit.label)}</a>`).join('') || '<span>没有同时命中角色卡、世界书或正则。</span>';
  }

  function paintFolders() {
    const host = document.getElementById('folders');
    if (!host) return;
    const saved = JSON.parse(localStorage.getItem('nijan-folders') || '{}');
    const draw = (paths) => {
      host.innerHTML = `<span><span>人物卡文件夹</span>：${esc(paths.cards || '尚未设置')}</span><span><span>世界书文件夹</span>：${esc(paths.worlds || '尚未设置')}</span><button type="button" class="btn btn-small" id="pick-cards">选人物卡文件夹</button><button type="button" class="btn btn-small" id="pick-worlds">选世界书文件夹</button><button type="button" class="btn btn-small" id="read-folders">读取已有文件</button>`;
      host.querySelector('#pick-cards').onclick = () => pickFolder('cards');
      host.querySelector('#pick-worlds').onclick = () => pickFolder('worlds');
      host.querySelector('#read-folders').onclick = () => readFolders(paths);
    };
    if (root.nijanDesktop) root.nijanDesktop.getPaths().then(draw);
    else draw(saved);
  }

  async function pickFolder(kind) {
    if (root.nijanDesktop) {
      const paths = await root.nijanDesktop.pick(kind);
      localStorage.setItem('nijan-folders', JSON.stringify(paths));
      paintFolders();
      return;
    }
    toast('文件夹读写在桌面版里。运行 npm start。');
  }

  async function readFolders(paths) {
    if (!root.nijanDesktop) { toast('请用 npm start 打开桌面版，才能读取这两个文件夹。'); return; }
    const cards = await root.nijanDesktop.list(paths.cards);
    const worlds = await root.nijanDesktop.list(paths.worlds);
    for (const file of worlds) {
      if (!/\.json$/i.test(file.name)) continue;
      const bytes = await root.nijanDesktop.read(file.full);
      const text = new TextDecoder().decode(bytes);
      try {
        const entries = root.TAFormats.worldInfoToEntries(JSON.parse(text));
        state.lib.worldBooks.unshift({ id: `book_${file.name}`, name: file.name.replace(/\.json$/i, ''), description: '', entries: entries.map((entry) => Object.assign({ id: `lore_${Math.random().toString(16).slice(2)}`, secondaryKeys: [], constant: false, selective: true, order: 100, position: 'before_char', enabled: true, depth: 4, outletName: '' }, entry)) });
      } catch (error) { /* 跳过不是世界书的文件 */ }
    }
    markDirty();
    toast(`读到人物卡文件 ${cards.length} 个，世界书 ${worlds.length} 个。`);
    renderStage();
  }

  function go(id) {
    const next = ROUTES.some((route) => route.id === id) ? id : 'home';
    const here = document.body.dataset.page;
    if (here) {
      if (here !== next) location.href = pageHref(next);
      else show(next);
      return;
    }
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
      <label class="check"><input id="set-json" type="checkbox"> 书写时用 JSON 互转（默认关闭）</label>
      <p class="field-label">模型接口（密钥只留在这台浏览器）</p>
      <label class="field"><span class="field-label">地址</span><input id="set-base" type="text" placeholder="https://api.openai.com/v1"></label>
      <label class="field"><span class="field-label">密钥</span><input id="set-key" type="password" autocomplete="off"></label>
      <p class="help">模型在总览里连接后选择，不用手填名称。</p>
      <label class="field"><span class="field-label">模型倾向</span><select id="set-profile"><option value="default">默认中文</option><option value="weak-zh">中文弱，用英文提示</option><option value="weak-en">英文弱，用中文提示</option><option value="strict">审核严，不含 18+</option></select></label>
      <label class="field"><span class="field-label">温度</span><input id="set-temp" type="range" min="0" max="2" step="0.1"></label>
      <label class="check"><input id="set-adult" type="checkbox"> 允许成人内容。模型倾向为审核严时，打开也不会写进提示。</label>
      <label class="check"><input id="set-live" type="checkbox"> 创作页的修改实时送进角色卡、世界书和其余工坊</label>
      <p class="field-label">主题</p>
      <label class="field"><span class="field-label">背景</span><input id="set-bg" type="color"></label>
      <label class="field"><span class="field-label">纸色</span><input id="set-paper" type="color"></label>
      <label class="field"><span class="field-label">墨色</span><input id="set-ink" type="color"></label>
      <label class="field"><span class="field-label">强调色</span><input id="set-accent" type="color"></label>
      <label class="field"><span class="field-label">圆角</span><input id="set-radius" type="range" min="0" max="28" step="1"></label>
      <label class="field"><span class="field-label">${tr('界面字号')}</span><input id="set-scale" type="range" min="0.9" max="1.2" step="0.05"></label>
      <label class="field"><span class="field-label">${tr('间距')}</span>
        <select id="set-density"><option value="comfortable">${tr('舒适')}</option><option value="compact">${tr('紧凑')}</option></select>
      </label>
      <div class="row"><button type="button" class="btn btn-primary" id="set-close">${tr('关闭')}</button></div>
    </div>`;
    host.querySelector('#set-lang').value = prefs.lang || 'zh';
    host.querySelector('#set-teach').checked = prefs.teach !== false;
    host.querySelector('#set-json').checked = !!prefs.jsonMode;
    const model = root.NIJANModel ? root.NIJANModel.load() : { baseUrl: '', model: '', key: '', profile: 'default' };
    host.querySelector('#set-base').value = model.baseUrl || '';
    host.querySelector('#set-key').value = model.key || '';
    host.querySelector('#set-profile').value = model.profile || 'default';
    host.querySelector('#set-temp').value = String(model.temperature ?? 0.7);
    host.querySelector('#set-adult').checked = !!prefs.adult;
    host.querySelector('#set-live').checked = prefs.liveImport !== false;
    const theme = ensureTheme();
    const vars = theme.vars;
    host.querySelector('#set-bg').value = vars.bg || '#07090d';
    host.querySelector('#set-paper').value = vars.paper || '#101820';
    host.querySelector('#set-ink').value = vars.ink || '#e9fff8';
    host.querySelector('#set-accent').value = vars.accent || '#d6ff3f';
    host.querySelector('#set-radius').value = String(Number(vars.radius ?? 18));
    const paintTheme = (key, value) => {
      vars[key] = key === 'radius' ? Number(value) : value;
      applyTheme();
      markDirty();
    };
    host.querySelector('#set-bg').oninput = (event) => paintTheme('bg', event.target.value);
    host.querySelector('#set-paper').oninput = (event) => paintTheme('paper', event.target.value);
    host.querySelector('#set-ink').oninput = (event) => paintTheme('ink', event.target.value);
    host.querySelector('#set-accent').oninput = (event) => paintTheme('accent', event.target.value);
    host.querySelector('#set-radius').oninput = (event) => paintTheme('radius', event.target.value);
    host.querySelector('#set-scale').value = String(prefs.scale || 1);
    host.querySelector('#set-density').value = prefs.density === 'compact' ? 'compact' : 'comfortable';
    const commit = () => {
      if (!root.TAI18n) return;
      root.TAI18n.save({
        lang: host.querySelector('#set-lang').value,
        teach: host.querySelector('#set-teach').checked,
        scale: Number(host.querySelector('#set-scale').value),
        density: host.querySelector('#set-density').value,
        jsonMode: host.querySelector('#set-json').checked,
        adult: host.querySelector('#set-adult').checked,
        liveImport: host.querySelector('#set-live').checked,
      });
      if (root.NIJANModel) {
        root.NIJANModel.save({
          baseUrl: host.querySelector('#set-base').value.trim(),
          key: host.querySelector('#set-key').value,
          profile: host.querySelector('#set-profile').value,
          temperature: Number(host.querySelector('#set-temp').value),
        });
      }
      renderStage();
    };
    host.querySelector('#set-lang').onchange = commit;
    host.querySelector('#set-teach').onchange = commit;
    host.querySelector('#set-json').onchange = commit;
    host.querySelector('#set-base').oninput = commit;
    host.querySelector('#set-key').oninput = commit;
    host.querySelector('#set-profile').onchange = commit;
    host.querySelector('#set-temp').oninput = commit;
    host.querySelector('#set-adult').onchange = commit;
    host.querySelector('#set-live').onchange = commit;
    host.querySelector('#set-scale').oninput = commit;
    host.querySelector('#set-density').onchange = commit;
    const close = () => {
      commit();
      host.classList.remove('show');
      host.innerHTML = '';
    };
    host.querySelector('#set-close').onclick = close;
    host.onclick = (event) => { if (event.target === host) close(); };
    if (root.TAI18n) root.TAI18n.localize(host);
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
        <div class="brand"><img class="mark" src="img/mark.svg" alt=""><span><strong data-product>织境</strong><em data-tagline>从一个念头，写出人物与世界。</em></span></div>
        <div class="nav-import">
          <button type="button" class="btn btn-primary" data-shell="import-card">导入角色卡</button>
          <button type="button" class="btn" data-shell="import-book">导入世界书</button>
          <button type="button" class="btn" data-shell="settings">设置</button>
        </div>
        <nav class="nav-list">${ROUTES.map((route) => `<button type="button" class="nav-btn" data-nav="${route.id}"><span data-label>${route.label}</span></button>`).join('')}</nav>
        <div class="rail-label">人物</div>
        <div id="rail-cast" class="rail-cast"></div>
        <div class="nav-foot">
          <p class="note">示例会替换当前库。清空只删这台浏览器里的稿。</p>
          <button type="button" class="btn" data-shell="demo">载入示例</button>
          <button type="button" class="btn btn-danger" data-shell="clear">清空库</button>
        </div>
      </aside>
      <div class="main">
        <header class="top">
          <div class="top-title"><img class="mark" src="img/mark.svg" alt=""><div><p class="eyebrow" id="eyebrow">HOME</p><h1 id="title">总览</h1><p class="note" id="blurb"></p></div></div>
          <div class="top-actions">
            <label class="search"><input id="search" type="search" placeholder="搜索角色、世界书、正则" autocomplete="off"><span class="note" id="search-note">跨页搜索，不改库。</span><div id="search-results"></div></label>
            <span class="save-wrap"><span id="save-pill" class="pill"><i></i>已保存</span><span class="note">改动自动写入这台浏览器。</span></span>
          </div>
        </header>
        <div id="folders" class="folders"></div>
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
      paintGlobalSearch(event.target.value);
      renderStage();
      const box = document.getElementById('search');
      if (box) box.value = state.query;
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
    paintFolders();
    const forced = document.body.dataset.page;
    if (forced) {
      const hashId = (location.hash || '').slice(1);
      if (forced === 'characters' && hashId) state.sel.character = hashId;
      if (forced === 'lore' && hashId) state.sel.book = hashId;
      if (forced === 'regex' && hashId) state.sel.regex = hashId;
      show(forced);
      return;
    }
    const initial = (location.hash || '#home').slice(1);
    if (!location.hash) history.replaceState(null, '', '#home');
    show(initial);
  }

  root.TAUI = {
    ROUTES, state, esc, toast, ask, downloadBlob, downloadText, downloadJson, pickFile, readText, readDataUrl, copyText,
    safeName, assetById, charById, selected, matchQuery, markDirty, flush, applyTheme, ensureTheme, go, renderStage, show,
    field, area, text, bindFields, picker, bindPicker, empty, confirmLoadDemo, confirmClear, mount,
    t: (key, vars) => (root.TAI18n ? root.TAI18n.t(key, vars) : key),
    estimateLength, mountLengths, showExport, fillLesson,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
