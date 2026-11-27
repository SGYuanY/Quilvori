/* Shell, persistence, and small DOM helpers. Views live in views.js. */
(function (root) {
  const ROUTES = [
    { id: 'home', mark: '01', label: '收藏室', eyebrow: 'HOME', title: '收藏室', search: false, blurb: 'blurb.home' },
    { id: 'resources', mark: '19', label: '资源目录', eyebrow: 'RESOURCES', title: '资源目录', search: false, blurb: '' },
    { id: 'themes', mark: '20', label: '主题工坊', eyebrow: 'THEMES', title: '主题工坊', search: false, blurb: '' },
    { id: 'studio', mark: '02', label: 'AI 创作', eyebrow: 'STUDIO', title: 'AI 创作', search: false, blurb: 'blurb.studio' },
    { id: 'sections', mark: '03', label: '段落预设', eyebrow: 'SECTIONS', title: '段落预设', search: false, blurb: 'blurb.sections' },
    { id: 'characters', mark: '04', label: '角色卡', eyebrow: 'CARD V2', title: '角色卡', search: true, placeholder: '搜角色、标签', blurb: 'blurb.characters' },
    { id: 'lore', mark: '05', label: '世界书', eyebrow: 'LORE', title: '世界书', search: true, placeholder: '搜条目、关键词', blurb: 'blurb.lore' },
    { id: 'prompts', mark: '06', label: '提示词拼装', eyebrow: 'PROMPT', title: '提示词拼装', search: true, placeholder: '搜块名称', blurb: 'blurb.prompts' },
    { id: 'groups', mark: '07', label: '群聊卡司', eyebrow: 'CAST', title: '群聊卡司', search: true, placeholder: '搜群名', blurb: 'blurb.groups' },
    { id: 'chat', mark: '08', label: '聊天阅览', eyebrow: 'READING', title: '聊天阅览', search: true, placeholder: '搜聊天标题', blurb: 'blurb.chat' },
    { id: 'assets', mark: '09', label: '素材库', eyebrow: 'ASSETS', title: '素材库', search: true, placeholder: '搜素材名', blurb: 'blurb.assets' },
    { id: 'regex', mark: '10', label: '正则脚本', eyebrow: 'REGEX', title: '正则脚本', search: true, placeholder: '搜脚本', blurb: 'blurb.regex' },
    { id: 'quick', mark: '11', label: '快捷回复', eyebrow: 'QUICK', title: '快捷回复', search: true, placeholder: '搜回复', blurb: 'blurb.quick' },
    { id: 'timeline', mark: '12', label: '剧情手记', eyebrow: 'JOURNAL', title: '剧情手记', search: true, placeholder: '搜注记、情节', blurb: '在本机规划情节或标记聊天原文。SillyTavern 的作者注另在聊天中配置，用于向模型注入提示。' },
    { id: 'graph', mark: '13', label: '角色关系图', eyebrow: 'GRAPH', title: '角色关系图', search: false, blurb: 'blurb.graph' },
    { id: 'check', mark: '14', label: '人设一致性检查', eyebrow: 'CHECK', title: '人设一致性检查', search: false, blurb: 'blurb.check' },
    { id: 'script', mark: '15', label: '群聊剧本', eyebrow: 'SCRIPT', title: '群聊剧本', search: true, placeholder: '搜剧本、台词', blurb: 'blurb.script' },
    { id: 'backup', mark: '16', label: '整库备份', eyebrow: 'BACKUP', title: '整库备份', search: false, blurb: 'blurb.backup' },
    { id: 'memory', mark: '17', label: 'HTML 记忆', eyebrow: 'MEMORY', title: 'HTML 记忆', search: false, blurb: 'blurb.memory' },
    { id: 'tutorial', mark: '18', label: '使用教学', eyebrow: 'GUIDE', title: '使用教学', search: false, blurb: 'blurb.tutorial' },
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
  let boundWork = null;

  function bindWork(collection, item) {
    boundWork = {collection,item,library:state.lib};
  }
  function guardWorkEvent(event) {
    if (!boundWork || boundWork.library === state.lib) return;
    const {collection,item,library} = boundWork;
    if (library[collection] === state.lib[collection] && (!item || TAStore.byId(state.lib[collection],item.id) === item)) {
      boundWork.library = state.lib;
      return;
    }
    // An async adoption or restore can replace the records still captured by
    // this page's field, chip, gallery or toolbar handlers.
    event.preventDefault();
    event.stopImmediatePropagation();
    renderStage();
    toast(root.TAI18n.t('资料库已变化，请重新打开。'),{kind:'warning'});
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function toast(message, options = {}) {
    const host = document.getElementById('toasts');
    if (!host) return;
    const value = String(message || '');
    if (!value.trim()) return;
    const t = (text) => root.TAI18n ? root.TAI18n.t(text) : text;
    const kind = options.kind || (/失败|错误|未能|不支持|超时/.test(value) ? 'error' : /^已|成功|完成/.test(value) ? 'success' : 'info');
    const title = options.title || t({ success: '好了', error: '出了点问题', warning: '请留意', info: '小提醒' }[kind] || '提示');
    const icon = root.TAWorkspace?.icon(kind === 'success' ? 'checkmark' : kind === 'error' ? 'tutorial' : 'studio') || '';
    const positions = () => new Map([...host.children].map((item) => [item, item.getBoundingClientRect().top]));
    const shift = (before) => before.forEach((top, item) => {
      if (!item.isConnected || item.classList.contains('toast-leaving')) return;
      const distance = top - item.getBoundingClientRect().top;
      if (distance && !matchMedia('(prefers-reduced-motion: reduce)').matches) item.animate([{ transform: `translateY(${distance}px)` }, { transform: 'translateY(0)' }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
    [...host.children].filter((item) => options.id ? item.dataset.toastId === options.id : item.dataset.message === value).forEach((item) => item.dismissToast?.(true));
    const before = positions();
    const node = document.createElement('div');
    node.className = `toast toast-${['success', 'error', 'warning', 'info'].includes(kind) ? kind : 'info'}`;
    node.dataset.message = value;
    if (options.id) node.dataset.toastId = options.id;
    node.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    node.innerHTML = `<span class="toast-symbol" aria-hidden="true">${icon}</span><div class="toast-content"><strong class="toast-title"></strong><p class="toast-message"></p><div class="toast-actions"></div></div><button type="button" class="toast-close" aria-label="${esc(t('关闭提示'))}">${root.TAWorkspace?.icon('close') || '×'}</button><span class="toast-track" aria-hidden="true"><i></i></span>`;
    node.querySelector('.toast-title').textContent = title;
    const body = node.querySelector('.toast-message'); body.textContent = value;
    const actions = node.querySelector('.toast-actions');
    let leaving = false;
    const duration = options.duration || Math.min(15000, Math.max(options.action ? 10000 : 5600, value.length * 65));
    const dismiss = (immediate = false) => {
      if (leaving) return; leaving = true;
      progress.cancel(); node.classList.add('toast-leaving');
      const remove = () => { const prior = positions(); node.remove(); shift(prior); };
      if (immediate || matchMedia('(prefers-reduced-motion: reduce)').matches) remove(); else setTimeout(remove, 200);
    };
    node.dismissToast = dismiss;
    node.querySelector('.toast-close').onclick = () => dismiss();
    if (options.action?.label && typeof options.action.onClick === 'function') {
      const action = document.createElement('button'); action.type = 'button'; action.className = 'toast-action'; action.textContent = options.action.label;
      action.onclick = () => { try { options.action.onClick(); } finally { dismiss(); } }; actions.appendChild(action);
    }
    if (value.length > 96) {
      const expand = document.createElement('button'); expand.type = 'button'; expand.className = 'toast-expand'; expand.textContent = t('展开'); expand.setAttribute('aria-expanded', 'false');
      expand.onclick = () => { const on = body.classList.toggle('expanded'); expand.textContent = t(on ? '收起' : '展开'); expand.setAttribute('aria-expanded', String(on)); if (on) progress.pause(); };
      actions.appendChild(expand);
    }
    if (!actions.childElementCount) actions.remove();
    host.appendChild(node);
    const progress = node.querySelector('.toast-track i').animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration, easing: 'linear', fill: 'forwards' });
    progress.onfinish = () => dismiss();
    node.onpointerenter = () => progress.pause();
    const resume = () => { if (!leaving && !node.matches(':hover') && !node.contains(document.activeElement) && !body.classList.contains('expanded')) progress.play(); };
    node.onpointerleave = resume;
    node.onfocusin = () => progress.pause();
    node.onfocusout = () => requestAnimationFrame(resume);
    shift(before);
    [...host.children].filter((item) => !item.classList.contains('toast-leaving')).slice(0, -3).forEach((item) => item.dismissToast?.());
    return { close: dismiss, element: node };
  }

  function dialogTabStops(modal) {
    const selector = 'button,input,select,textarea,a[href],summary,[tabindex],[contenteditable="true"]';
    return [...modal.querySelectorAll(selector)].filter(node =>
      node.tabIndex >= 0 && !node.matches(':disabled') && !node.closest('[hidden],[inert]') &&
      node.getClientRects().length && getComputedStyle(node).visibility === 'visible'
    ).sort((a, b) => (a.tabIndex || Number.MAX_SAFE_INTEGER) - (b.tabIndex || Number.MAX_SAFE_INTEGER));
  }

  function ask({ title, body, actions, swipe, content }) {
    return new Promise((resolve) => {
      const host = document.getElementById('modal-root');
      const opener = document.activeElement;
      host.classList.add('show');
      host.innerHTML = `<div class="modal paper" role="dialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <h3 id="confirm-dialog-title">${esc(title)}</h3>
        <p>${esc(body)}</p>
        ${swipe ? `<div class="swipe" data-swipe="${esc(swipe)}"><i class="swipe-knob"></i><span>${esc(swipe)}</span></div>` : ''}
        <div class="row">${actions.map((action) => `<button type="button" class="btn ${action.kind || ''}" data-act="${esc(action.id)}">${esc(action.label)}</button>`).join('')}</div>
      </div>`;
      if (content?.childElementCount) {
        host.querySelector('.modal').classList.add('integrity-dialog');
        host.querySelector('.modal > p').after(content);
      }
      const finish = (value) => {
        host.onclick = host.onkeydown = null;
        host.classList.remove('show');
        host.innerHTML = '';
        if (opener?.isConnected) opener.focus({preventScroll:true});
        resolve(value);
      };
      host.onclick = (event) => { if (event.target === host) finish(null); };
      host.onkeydown = (event) => {
        if (event.key === 'Escape' && !event.defaultPrevented && !event.isComposing) {
          event.preventDefault();
          event.stopPropagation();
          finish(null);
        }
      };
      host.querySelectorAll('[data-act]').forEach((button) => {
        button.onclick = () => finish(button.dataset.act);
      });
      const track = host.querySelector('.swipe');
      if (track) {
        const knob = track.querySelector('.swipe-knob');
        let dragging = false;
        let origin = 0;
        const limit = () => Math.max(24, track.clientWidth - knob.offsetWidth - 6);
        knob.onpointerdown = (event) => {
          dragging = true;
          origin = event.clientX - knob.offsetLeft;
          try { knob.setPointerCapture(event.pointerId); } catch (error) { /* synthetic events have no pointer */ }
        };
        knob.onpointermove = (event) => {
          if (!dragging) return;
          const x = Math.max(3, Math.min(limit(), event.clientX - origin));
          knob.style.left = `${x}px`;
          track.classList.toggle('ready', x > limit() * 0.82);
        };
        knob.onpointerup = () => {
          if (!dragging) return;
          dragging = false;
          const x = parseFloat(knob.style.left) || 0;
          if (x > limit() * 0.82) finish('yes');
          else { knob.style.left = '3px'; track.classList.remove('ready'); }
        };
      }
      if (root.TAI18n) root.TAI18n.localize(host);
      dialogTabStops(host)[0]?.focus();
    });
  }

  function flyPlane(from) {
    if (!from) return;
    const plane = document.createElement('span');
    plane.className = 'plane';
    plane.innerHTML = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 17 L29 6 L18 28 L14 18 Z" fill="#7aa2ff"/><path d="M14 18 L29 6 L16 16 Z" fill="#ff4f9a"/></svg>';
    const rect = from.getBoundingClientRect();
    plane.style.left = `${rect.left + rect.width / 2}px`;
    plane.style.top = `${rect.top}px`;
    document.body.appendChild(plane);
    requestAnimationFrame(() => plane.classList.add('gone'));
    setTimeout(() => plane.remove(), 800);
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
    return root.TAContext.estimate(text);
  }

  function mountLengths(rootNode) {
    if (!rootNode) return;
    rootNode.querySelectorAll('textarea, input[type="text"][data-field]').forEach(node => {
      if (node.hasAttribute('data-nolen') || node.nextElementSibling?.classList.contains('len')) return;
      if (!node.closest('#char-form,#lore-editor') && (node.tagName === 'INPUT' || (node.hasAttribute('rows') && node.rows < 3))) return;
      const meter = document.createElement('div');
      meter.className = 'len ctx-length'; meter.dataset.noTranslate = '';
      meter.title = root.TAContextPanel.basis();
      node.insertAdjacentElement('afterend',meter);
      const paint = () => { meter.textContent = root.TAContextPanel.sizeText(estimateLength(node.value)); };
      paint(); node.addEventListener('input',paint);
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
    return TAStore.byId(state.lib.assets,id);
  }

  function charById(id) {
    return TAStore.byId(state.lib.characters,id);
  }

  function selected(list, id) {
    return TAStore.byId(list,id) || list?.[0] || null;
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

  let editVersion = 0, replacing = false, pendingSave = null;
  const dirtyScopes = new Map();
  let dirtyWholeLibrary = false;
  function resetDirty() {
    dirtyScopes.clear();
    dirtyWholeLibrary = false;
  }
  function markDirty(field, id, mode) {
    if (typeof field !== 'string') dirtyWholeLibrary = true;
    else {
      const scope = id === undefined ? [field] : [field,id];
      const key=JSON.stringify(scope), existing=dirtyScopes.get(key);
      if (!existing || existing[2]==='metadata') dirtyScopes.set(key,mode==='metadata' ? [...scope,mode] : scope);
    }
    root.TASearch?.invalidate();
    editVersion++;
    state.save = 'dirty';
    paintSave();
    clearTimeout(state.timer);
    state.timer = setTimeout(flush, 320);
  }

  async function flush() {
    clearTimeout(state.timer);
    if (replacing) return false;
    if (state.save === 'saved') return true;
    if (pendingSave && pendingSave.version === editVersion) return pendingSave.job;
    const version = editVersion;
    state.save = 'saving'; paintSave();
    const job = (async () => {
      try {
        const scopes = dirtyWholeLibrary ? null : [...dirtyScopes.values()];
        await TAStore.save(state.lib,undefined,undefined,undefined,scopes);
        if (version !== editVersion) return false;
        resetDirty();
        state.save = 'saved'; return true;
      } catch (error) {
        if (version === editVersion) { state.save = 'error'; toast(root.TAI18n.t(error.message),{kind:'error'}); }
        return false;
      } finally { paintSave(); }
    })();
    pendingSave = {version,job};
    try { return await job; }
    finally { if (pendingSave?.job === job) pendingSave = null; }
  }

  async function commitLibrary(candidate, snapshots = [], clearVersions = false, draft = null, options = {}) {
    if (replacing) throw new Error('正在保存，请稍后重试。');
    const app = document.getElementById('app'), wasInert = app.inert, prior = state.save;
    const version = ++editVersion;
    replacing = true; app.inert = true; clearTimeout(state.timer);
    state.save = 'saving'; paintSave();
    try {
      const guard = () => version===editVersion;
      const scopes=options.scopes && !dirtyWholeLibrary && (prior==='saved' || dirtyScopes.size) ?
        [...dirtyScopes.values(),...options.scopes] : undefined;
      const transfer=options.transfer;
      if(transfer && !root.TALibraryDB?.database())throw new Error('完整工作状态需要 IndexedDB');
      if(transfer && (root.NIJANStudio?.running() || root.TATaskActivity?.pending() || root.NIJANOrganizePanel?.running())) {
        throw new Error('请先结束正在运行的任务，再恢复工作状态。');
      }
      const warning = clearVersions ? await TAStore.erase(candidate,guard) : await TAStore.save(candidate,guard,snapshots,draft,scopes,options.restore,transfer);
      if (version !== editVersion) throw new Error('资料库已变化，请重新打开。');
      state.lib = candidate; state.save = 'saved';
      resetDirty();
      if(draft)root.TAStudioDrafts.committed(draft);
      if(transfer){
        if(transfer.mode==='replace'){
          root.NIJANStudio?.resetAfterClear?.();
          root.NIJANModel?.clearHistory();
          root.TATaskActivity?.clear();
          root.NIJANOrganizePanel?.clear();
        }
        root.TAStudioDrafts.replace(transfer.data.drafts,transfer.epoch);
        root.TACreationRecords.replace(transfer.data.records,transfer.epoch);
        if(transfer.mode==='merge')root.NIJANStudio?.refreshSavedDrafts();
        root.dispatchEvent(new Event('quilvori-drafts'));
      }
      if(clearVersions){
        state.replyReference=null;state.regexExamples=null;state.journalScope=null;state.journalJump=null;state.lab='';
        root.TAThemeWorkshop?.reset();root.NIJANModel?.clearHistory();root.TATaskActivity?.clear();root.NIJANOrganizePanel?.clear();root.TAStudioDrafts?.reset();root.NIJANStudio?.resetAfterClear?.();
      }
      if (typeof warning === 'string') toast(root.TAI18n.t(warning),{kind:'warning'});
      root.TASearch?.invalidate();
    } catch (error) {
      if (version === editVersion) state.save = prior === 'saved' ? 'saved' : 'dirty';
      if (state.save === 'dirty') state.timer = setTimeout(flush,320);
      throw error;
    } finally { replacing = false; app.inert = wasInert; paintSave(); }
  }

  function ensureTheme(lib=state.lib) {
    if (!lib.themes.length) {
      lib.themes.push({ id: 'theme_live', name: '夜漆', vars: { bg: '#1c1c1c', lacquer: '#141414', paper: '#2e2e2e', ink: '#e8e8e8', accent: '#d0d0d0', fontScale: 1, radius: 10 } });
      if (lib===state.lib) markDirty();
    }
    const theme = lib.themes.find((item) => item.id === lib.activeThemeId) || lib.themes[0];
    if (lib===state.lib && lib.activeThemeId!==theme.id) markDirty('activeThemeId');
    lib.activeThemeId = theme.id;
    if (!theme.vars) theme.vars = {};
    return theme;
  }

  function applyTheme() {
    const theme = (state.lib.themes || []).find(item => item.id === state.lib.activeThemeId);
    const resolved = root.TARoomTheme.resolve(state.route, theme?.vars || {}, theme?.useRoomPalette);
    const style = document.documentElement.style, vars = resolved.colors;
    document.body.classList.add('room-theme');
    document.body.classList.toggle('collection-custom-theme', !resolved.useRooms);
    document.body.dataset.room = resolved.room;
    document.body.dataset.route = state.route;
    for (const [key,value] of Object.entries({
      bg:vars.bg,lacquer:vars.lacquer,paper:vars.paper,'paper-2':resolved.raised,
      foam:vars.ink,ink:vars.ink,brass:vars.accent,'brass-2':vars.accent,
      'on-accent':resolved.onAccent,'surface-ink':resolved.onSurface,
      'font-scale':String(resolved.fontScale),radius:`${resolved.radius}px`,
      'bubble-radius':`${Math.max(8,resolved.radius-2)}px`,
    })) style.setProperty(`--${key}`,value);
    root.TAThemeAppearance?.apply(theme,state.lib,resolved);
  }


  function routeMeta() {
    return ROUTES.find((route) => route.id === state.route) || ROUTES[0];
  }

  function paintRail() {
    const host = document.getElementById('rail-cast');
    if (!host || !state.lib) return;
    const cards = state.lib.characters || [], size = 18;
    const selectedPage = Math.max(0,Math.floor(cards.findIndex(row=>row.id===state.sel.character)/size));
    if (state.railSelected !== state.sel.character) state.railPage = selectedPage;
    state.railSelected = state.sel.character;
    const pages = Math.max(1,Math.ceil(cards.length/size)), page = Math.min(pages-1,state.railPage || 0);
    const visible = cards.slice(page*size,(page+1)*size);
    host.innerHTML = visible.map((character) => {
      const avatar = assetById(character.avatarAssetId);
      const face = avatar ? `<img alt="" loading="lazy" decoding="async" src="${esc(avatar.dataUrl)}">` : `<span>${esc((character.name || '名').slice(0, 1))}</span>`;
      const on = state.sel.character === character.id ? ' on' : '';
      return `<button type="button" class="rail-char${on}" data-char="${esc(character.id)}">${face}<b data-no-translate>${esc(character.name || '未命名')}</b></button>`;
    }).join('') + (pages>1 ? `<div class="row"><button class="btn btn-small" data-prev aria-label="${esc(root.TAI18n.t('上一页'))}" ${page?'':'disabled'}>‹</button><small>${page+1}/${pages}</small><button class="btn btn-small" data-next aria-label="${esc(root.TAI18n.t('下一页'))}" ${page+1<pages?'':'disabled'}>›</button></div>` : '');
    host.querySelector('[data-prev]')?.addEventListener('click',()=>{state.railPage=page-1;paintRail();});
    host.querySelector('[data-next]')?.addEventListener('click',()=>{state.railPage=page+1;paintRail();});
    host.querySelectorAll('[data-char]').forEach((button) => {
      button.onclick = () => root.TASearch.open({kind:'character',id:button.dataset.char,field:'name'});
    });
  }

  function paintChrome() {
    document.body.classList.toggle('collection-page', state.route === 'home');
    applyTheme();
    const meta = routeMeta();
    document.querySelectorAll('[data-nav]').forEach((button) => {
      button.classList.toggle('on', button.dataset.nav === state.route);
    });
    const tr = (text) => (root.TAI18n ? root.TAI18n.t(text) : text);
    document.getElementById('eyebrow').textContent = meta.eyebrow;
    const title = document.getElementById('title');
    const section = root.TACollectionControls?.titleInfo(state.route);
    if (section && state.route !== 'home') {
      title.innerHTML = root.TACollectionControls.titleMarkup(state.route);
      title.classList.add('qc-page-title');
    } else {
      title.textContent = section?.name || tr(meta.title);
      title.classList.remove('qc-page-title');
    }
    const blurb = document.getElementById('blurb');
    if (blurb) blurb.textContent = tr(meta.blurb || '');
    const search = document.getElementById('search');
    search.parentElement.hidden = false;
    search.placeholder = tr('搜索角色卡、世界书、提示词和正则');
    search.ariaLabel = search.placeholder;
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
    const peopleCount = document.querySelector('[data-people-count]');
    if (peopleCount) peopleCount.textContent = state.lib.characters.length;
    const rail = document.getElementById('rail-cast');
    if (rail) rail.hidden = !!state.peopleCollapsed;
    if (!state.peopleCollapsed) paintRail();
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
    paintFolders();
    if (root.TAI18n) root.TAI18n.apply();
  }

  function renderStage() {
    boundWork = null;
    const stage = document.getElementById('stage');
    paintChrome();
    paintSave();
    const view = views[state.route] || views.home;
    stage.innerHTML = '';
    stage.ondragover = null;
    stage.ondrop = null;
    try {
      closeSelect();
      view(stage);
      if (['home','characters','lore'].includes(state.route) && root.TAStudioDrafts) {
        stage.refreshDraftShelf=root.TAStudioDrafts.mount(stage,{characters:'character',lore:'world'}[state.route]);
      } else stage.refreshDraftShelf=null;
      if (root.TAWorkspace) root.TAWorkspace.enhance(stage);
      if (root.TAI18n) {
        root.TAI18n.localize(document.getElementById('app'));
        root.TAI18n.localize(document.getElementById('modal-root'));
      }
      root.TASearch?.focus(stage, state.route);
    } catch (error) {
      console.error(error);
      stage.innerHTML = `<div class="paper empty"><h3>这一页没有画出来</h3><p>${esc(error.message)}</p></div>`;
    }
  }

  function pageHref(id) {
    return id === 'home' ? 'index.html' : `${id}.html`;
  }

  function paintGlobalSearch(query, offset = 0) {
    const host = document.getElementById('search-results');
    if (!host) return;
    host.innerHTML = '';
    if (!String(query || '').trim() || !state.lib) return;
    const search = root.TASearch, size = 12;
    const { items, more } = search.page(search.matches(state.lib, query), offset, size);
    for (const hit of items) {
      const link = document.createElement('a'), name = document.createElement('strong'), detail = document.createElement('small');
      link.href = search.href(hit.target); link.dataset.noTranslate = '';
      name.textContent = hit.title || root.TAUI.t('未命名');
      detail.textContent = search.describe(hit);
      link.append(name, detail);
      link.onclick = event => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); search.open(hit.target);
      };
      host.append(link);
    }
    if (!items.length) {
      const note = document.createElement('span'); note.textContent = root.TAUI.t('没有找到匹配的内容'); host.append(note);
    }
    if (offset || more) {
      const pages = document.createElement('div'); pages.className = 'search-pages';
      for (const [step, label, available] of [[-1, '上一页', offset > 0], [1, '下一页', more]]) {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-small';
        button.textContent = root.TAUI.t(label); button.disabled = !available;
        button.onclick = () => { paintGlobalSearch(query, offset + size * step); host.querySelector('a')?.focus(); };
        pages.append(button);
      }
      host.append(pages);
    }
  }

  let folderPaths = null, folderReadPromise = null, triedAutoRead = false;

  function paintFolders() {
    const host = document.getElementById('folders');
    if (!host) return;
    const tr = (text) => (root.TAI18n ? root.TAI18n.t(text) : text);
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('nijan-folders') || '{}') || {}; } catch (_) {}
    const draw = (paths) => {
      folderPaths = paths || {};
      host.innerHTML = `<span><span data-zh="人物卡文件夹">${tr('人物卡文件夹')}</span>：${esc(paths.cards || tr('尚未设置'))}</span><span><span data-zh="世界书文件夹">${tr('世界书文件夹')}</span>：${esc(paths.worlds || tr('尚未设置'))}</span><button type="button" class="btn btn-small" id="pick-cards">${tr('选人物卡文件夹')}</button><button type="button" class="btn btn-small" id="pick-worlds">${tr('选世界书文件夹')}</button><button type="button" class="btn btn-small" id="read-folders">${tr('读取已有文件')}</button><button type="button" class="btn btn-small" id="scan-profile">${tr('扫描酒馆用户目录')}</button>`;
      host.querySelector('#scan-profile').onclick = () => {
        const picker = document.createElement('input'); picker.type='file'; picker.webkitdirectory=true;
        picker.onchange = async () => {
          const source = root.TAFolderImport.profileFiles(picker.files);
          const count = Object.values(source.buckets).reduce((sum,rows)=>sum+rows.length,0);
          if (!count) { toast(tr('请选择包含 characters、worlds 或 chats 的用户目录')); return; }
          const detail = Object.entries(source.buckets).map(([kind,rows])=>({cards:'characters',worlds:'worlds',chats:'chats'}[kind])+' · '+rows.length).join(' / ');
          const ok = await ask({title:tr('扫描酒馆用户目录'),body:detail,actions:[{id:'yes',label:tr('导入')},{id:'no',label:tr('取消')}]});
          if (ok==='yes') await readFolders(source.paths,{adapter:source});
        };
        picker.click();
      };
      host.querySelector('#pick-cards').onclick = () => pickFolder('cards');
      host.querySelector('#pick-worlds').onclick = () => pickFolder('worlds');
      host.querySelector('#read-folders').onclick = () => readFolders(paths);
      host.querySelector('#read-folders').disabled = !!folderReadPromise;
      if (root.nijanDesktop && paths.cards && !state.lib.characters.length && !triedAutoRead && !folderReadPromise) {
        triedAutoRead = true;
        readFolders(paths, { cardsOnly: true });
      }
    };
    if (folderPaths) { draw(folderPaths); return; }
    if (root.nijanDesktop) root.nijanDesktop.getPaths().then(draw);
    else draw(saved);
  }

  async function pickFolder(kind) {
    if (root.nijanDesktop) {
      const paths = await root.nijanDesktop.pick(kind);
      localStorage.setItem('nijan-folders', JSON.stringify(paths));
      folderPaths = paths;
      paintFolders();
      return;
    }
    toast('文件夹读写在桌面版里。运行 npm start。');
  }

  async function readFolders(paths, options = {}) {
    if (folderReadPromise) return folderReadPromise;
    if (!options.adapter && !root.nijanDesktop) { toast('请用桌面版读取已设置的文件夹，或点击“导入角色卡”选择文件。'); return; }
    const sourcePaths = paths || folderPaths || await root.nijanDesktop.getPaths();
    if (folderReadPromise) return folderReadPromise;
    if (!sourcePaths.cards && !sourcePaths.worlds && !sourcePaths.chats) { toast('先设置角色卡或世界书的文件夹。'); return; }
    const button = document.querySelector('#read-folders');
    if (button) button.disabled = true;
    const task = (async () => {
      toast('正在读取文件夹，读完就会出现在列表里。', { id: 'folder-import', kind: 'info', duration: 15000 });
      const snapshot = (value) => JSON.stringify(Object.assign({}, value, { meta: Object.assign({}, value.meta, { updatedAt: undefined }) }));
      const before = snapshot(state.lib);
      const makeAvatar = async (bytes) => {
        const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
        try {
          const ratio = Math.min(1, 192 / bitmap.width, 256 / bitmap.height);
          const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
          const context = canvas.getContext('2d'); context.fillStyle = '#212420'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', .8);
          return { dataUrl, mime: 'image/jpeg', bytes: Math.ceil(dataUrl.length * .75) };
        } finally { bitmap.close(); }
      };
      const result = await root.TAFolderImport.importAll(state.lib, sourcePaths, options.adapter || root.nijanDesktop, Object.assign({ makeAvatar, avatarBudget:TAStore.backend === 'indexedDB' ? Infinity : 750000 }, options));
      // Wait for importing to finish without replacing edits made in the meantime.
      if (snapshot(state.lib) !== before) throw new Error('读取期间稿子有变化。请再点一次读取，当前改动已保留。');
      const commit = () => commitLibrary(result.library);
      try { await commit(); }
      catch (error) {
        if (error.name !== 'QuotaExceededError' && error.code !== 22 && error.code !== 'quota') throw error;
        const oldAssets = new Set(state.lib.assets.map((item) => item.id));
        const importedAvatars = new Set(result.library.assets.filter((item) => !oldAssets.has(item.id)).map((item) => item.id));
        result.library.assets = result.library.assets.filter((item) => !importedAvatars.has(item.id));
        result.library.characters.forEach((card) => {
          if (importedAvatars.has(card.avatarAssetId)) {
            card.avatarAssetId = null;
            card.folderAvatarPending = true;
            result.report.avatarsOmitted++;
          }
        });
        await commit();
      }
      const report = result.report;
      const tChat = () => root.TAI18n?.t('聊天') || '聊天';
      if (report.firstCardId) { state.sel.character ||= report.firstCardId; state.sel.checkChar ||= report.firstCardId; }
      if (report.firstBookId) state.sel.book ||= report.firstBookId;
      const message = (root.TAI18n ? root.TAI18n.t('folder.readResult', report) : `已导入 ${report.cards} 张角色卡、${report.books} 本世界书；${report.unchanged} 个文件已读过。`);
      toast(message + (sourcePaths.chats ? ' · '+report.chats+' '+tChat() : ''), {
        id:'folder-import', kind:report.failed.length ? 'warning' : 'success', duration:10000,
        action:report.updatedCardId && {label:root.TAUI.t('查看新版角色卡'), onClick:()=>
          root.TASearch.open({kind:'character',id:report.updatedCardId,field:'name',selectOnly:true})},
      });
      renderStage();
      if (report.failed.length || report.avatarsOmitted) {
        const info = document.createElement('details'); info.className = 'paper folder-import-report';
        const summary = document.createElement('summary'); summary.textContent = state.lib.characters.length ? '文件夹读取详情' : '有些文件没能读进来'; info.append(summary);
        if (report.avatarsOmitted) { const note = document.createElement('p'); note.textContent = '为节省空间，较大的头像没有收进来，角色卡文字已保留。'; info.append(note); }
        report.failed.forEach((failure) => { const line = document.createElement('p'); line.dataset.noTranslate = ''; line.textContent = `${failure.name}：${root.TAI18n ? root.TAI18n.t(failure.reason) : failure.reason}`; info.append(line); });
        document.getElementById('stage').prepend(info); root.TAI18n?.localize(info);
      }
      return report;
    })();
    folderReadPromise = task;
    try { return await task; }
    catch (error) { toast(root.TAI18n ? root.TAI18n.t('folder.readFailed', { error: root.TAI18n.t(error.message) }) : `文件夹读取失败：${error.message}`, { id: 'folder-import', kind: 'error', duration: 12000 }); return null; }
    finally { folderReadPromise = null; const current = document.querySelector('#read-folders'); if (current) current.disabled = false; }
  }

  let lastAddress = '';
  function setAddress(value, push = true) {
    const url = new URL(value, location.href);
    const here = new URL(location.href);
    const file = url.pathname.split('/').pop() || 'index.html';
    const route = ROUTES.find(item => pageHref(item.id) === file)?.id;
    if (url.origin !== here.origin || new URL('.',url).href !== new URL('.',here).href || !route) return false;
    const stateParams = new URLSearchParams();
    const id = url.hash.slice(1);
    if (id) stateParams.set('entity', id);
    if (url.search) stateParams.set('fields', url.search.slice(1));
    // A hash works for both a local file and an HTTP-served application. Changing
    // the path of a file: URL with pushState is forbidden in several browsers.
    const fragment = '/' + route + (stateParams.size ? '?' + stateParams : '');
    if (push && here.hash.slice(1) !== fragment) history.pushState(null,'','#' + fragment);
    lastAddress = location.href;
    return {url,route};
  }
  function openAddress(value, push = true) {
    const address=setAddress(value,push);
    if(!address)return false;
    if (address.url.hash) root.TASearch?.restoreAddress(address.route,address.url);
    show(address.route);
    return true;
  }
  function followLocation() {
    if (lastAddress === location.href && lastAddress) return;
    const raw = (location.hash || '').slice(1), modern = raw.startsWith('/');
    const fragment = modern ? raw.slice(1) : raw;
    const separator = fragment.indexOf('?');
    const route = separator < 0 ? fragment : fragment.slice(0,separator);
    const params = separator < 0 ? null : new URLSearchParams(fragment.slice(separator+1));
    const entry = document.body.dataset.page;
    const address = typeof location.href === 'string' ? new URL(location.href) : null;
    const isRoute = ROUTES.some(row => row.id === route);
    // Standalone pages historically put an entity ID in the hash. A leading
    // slash distinguishes navigation fragments from those saved links.
    if (isRoute && (modern || !entry)) {
      if (address && params?.has('entity')) {
        const target = new URL(pageHref(route),address);
        target.search = params.get('fields') || ''; target.hash = params.get('entity');
        root.TASearch?.restoreAddress(route,target);
      }
      lastAddress=location.href || ''; show(route); return;
    }
    lastAddress=location.href || '';
    if (entry && address) root.TASearch?.restoreAddress(entry,address);
    show(entry || (isRoute ? route : 'home'));
  }
  function go(id) {
    const next = ROUTES.some(route=>route.id===id) ? id : 'home';
    return openAddress(pageHref(next));
  }

  function show(id) {
    if (state.route !== id) root.NIJANOrganizePanel?.hideForNavigation();
    state.route = ROUTES.some((route) => route.id === id) ? id : 'home';
    state.query = '';
    const search = document.getElementById('search');
    if (search) search.value = '';
    paintGlobalSearch('');
    const slip = document.getElementById('export-slip');
    if (slip) slip.innerHTML = '';
    const stage = document.getElementById('stage');
    if (stage) stage.scrollTop = 0;
    renderStage();
  }

  function field(label, inner, help) {
    return `<label class="field"><span class="field-label">${label}</span>${inner}${help ? `<span class="help">${help}</span>` : ''}</label>`;
  }

  function fold(id, label, inner, help) {
    return `<div class="fold" data-fold="${esc(id)}"><button type="button" class="fold-name"><span class="field-label">${esc(label)}</span><span class="fold-state">展开</span></button><div class="fold-body" hidden>${inner}${help ? `<span class="help">${esc(help)}</span>` : ''}</div></div>`;
  }

  function mountFolds(rootNode, slot) {
    if (!rootNode) return;
    if (!state.openFold) state.openFold = {};
    rootNode.querySelectorAll('.fold').forEach((item) => { item.dataset.slot = slot; });
    const apply = () => {
      const open = state.openFold[slot] || '';
      document.querySelectorAll(`.fold[data-slot="${slot}"]`).forEach((item) => {
        const on = item.dataset.fold === open;
        const body = item.querySelector(':scope > .fold-body');
        if (body) body.hidden = !on;
        item.classList.toggle('on', on);
        const mark = item.querySelector(':scope > .fold-name .fold-state');
        if (mark) {
          mark.textContent = on ? '收起' : '展开';
          if (root.TAI18n) root.TAI18n.localize(mark);
        }
      });
    };
    apply();
    rootNode.querySelectorAll('.fold-name').forEach((button) => {
      button.onclick = (event) => {
        event.preventDefault();
        const id = button.closest('.fold').dataset.fold;
        state.openFold[slot] = state.openFold[slot] === id ? '' : id;
        apply();
      };
    });
  }

  function area(name, value, rows) {
    return `<textarea data-field="${name}" rows="${rows || 5}">${esc(value || '')}</textarea>`;
  }

  function text(name, value, placeholder) {
    return `<input data-field="${name}" type="text" value="${esc(value || '')}" placeholder="${esc(placeholder || '')}">`;
  }

  function bindFields(rootNode, obj, onChange, scope = []) {
    rootNode.querySelectorAll('[data-field]').forEach((node) => {
      const eventName = node.tagName === 'SELECT' || node.type === 'checkbox' ? 'change' : 'input';
      node.addEventListener(eventName, () => {
        let value = node.value;
        if (node.type === 'checkbox') value = node.checked;
        else if (node.type === 'number' || node.type === 'range') value = node.value === '' ? '' : Number(node.value);
        obj[node.dataset.field] = value;
        if (onChange) onChange(node.dataset.field, value);
        markDirty(...scope);
      });
    });
  }

  function picker(items, currentId, subtitle) {
    if (!items.length) return '';
    return `<div class="picker">${items.map((item) => `<button type="button" class="pick${item.id === currentId ? ' on' : ''}" data-id="${esc(item.id)}"${Number.isSafeInteger(item.id) ? ' data-numeric-id' : ''}><b data-no-translate>${esc(root.TAIntegrityPanel.displayName(item))}</b><small>${esc(subtitle ? subtitle(item) : '')}</small></button>`).join('')}</div>`;
  }

  function bindPicker(rootNode, assign) {
    rootNode.querySelectorAll('.pick').forEach((button) => {
      button.onclick = () => assign(button.hasAttribute('data-numeric-id') ? Number(button.dataset.id) : button.dataset.id);
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
    try { await commitLibrary(TAStore.normalize(TAStore.demoLibrary())); } catch(error) { toast(root.TAI18n.t(error.message),{kind:'error'}); return; }
    root.TAIntegrityPanel?.resetUndo();
    state.loreUndo?.clear();
    toast('已载入听雨楼示例');
    renderStage();
  }

  async function confirmClear() {
    const answer = await ask({
      title: '清空库',
      body: root.TAI18n.t('清空当前资料库、作品快照、AI 草稿、模型返回记录和本机迁移副本？'),
      actions: [
        { id: 'yes', label: '清空', kind: 'btn-danger' },
        { id: 'no', label: '取消' },
      ],
    });
    if (answer !== 'yes') return;
    try { await commitLibrary(TAStore.emptyLibrary(),[],true); } catch(error) { toast(root.TAI18n.t(error.message),{kind:'error'}); return; }
    root.TAIntegrityPanel?.resetUndo();
    state.loreUndo?.clear();
    toast('库已清空');
    renderStage();
  }

  function openSettings() {
    const previousFocus = document.activeElement;
    const prefs = root.TAI18n ? root.TAI18n.prefs : { lang: 'en', teach: true, scale: 1, density: 'comfortable' };
    const tr = (text, vars) => (root.TAI18n ? root.TAI18n.t(text, vars) : text);
    const host = document.getElementById('modal-root');
    host.classList.add('show');
    host.innerHTML = `<div class="modal paper" role="dialog" aria-modal="true">
      <h3>${tr('设置')}</h3>
      <label class="field"><span class="field-label">${tr('界面语言')}</span>
        <select id="set-lang" data-no-translate>${Object.entries(root.TAI18n.languages).map(([code,label])=>`<option value="${code}">${label}</option>`).join('')}</select>
      </label>
      <label class="check"><input id="set-teach" type="checkbox"> ${tr('显示逐步说明和导入解读')}</label>
      <label class="check"><input id="set-json" type="checkbox"> 书写时用 JSON 互转（默认关闭）</label>
      <p class="field-label" data-model-heading>${tr('模型接入')}</p>
      <label class="field"><span class="field-label">模型配置</span><select id="connection-profiles" data-no-translate></select></label>
      <div class="row"><input id="profile-name" placeholder="配置名称"><button class="btn" id="add-profile" type="button">新建配置</button></div>
      <label class="field"><span class="field-label">地址</span><input id="set-base" type="text" placeholder="https://api.openai.com/v1" autocomplete="off"></label>
      <label class="field"><span class="field-label">接口协议</span><select id="set-protocol"><option value="auto">自动（优先 Responses）</option><option value="responses">Responses</option><option value="chat">Chat Completions</option></select></label>
      <label class="field"><span class="field-label">密钥</span><input id="set-key" type="password" autocomplete="off"></label>
      <div class="row"><small class="help" id="model-key-status" role="status" data-no-translate></small><button type="button" class="btn btn-small" id="model-key-retry" hidden>${tr('重试')}</button></div>
      <div class="row"><button type="button" class="btn btn-primary" id="set-connect">连接</button></div>
      <p class="help">点连接后，从接口列出的模型里选一个。不用手填名称。</p>
      <label class="field"><span class="field-label">手动输入模型 ID</span><input id="model-id" autocomplete="off"></label>
      <label class="field"><span class="field-label">上下文窗口（手动，token）</span><input id="model-window" type="number" min="1"></label><p id="model-info" class="help"></p>
      <label class="field"><span class="field-label">空闲等待（分钟）</span><input id="model-idle-minutes" type="number" min="1" max="60" step="1" aria-describedby="model-idle-help"></label>
      <p id="model-idle-help" class="help">默认 5 分钟。每次收到接口数据都会重新计时，长时间静默的模型可延长等待。</p>
      <label class="field"><span class="field-label">选用模型</span><select id="set-model" disabled><option value="">先点连接</option></select></label>
      <label class="field"><span class="field-label">推理强度</span><select id="set-reasoning"><option value="auto">跟随模型（默认）</option><option value="none">关闭推理 · none</option><option value="minimal">极低 · minimal</option><option value="low">低 · low</option><option value="medium">中 · medium</option><option value="high">高 · high</option><option value="xhigh">极高 · xhigh</option><option value="max">最高 · max</option></select></label>
      <p class="help">较高强度通常需要更长时间。可用档位取决于模型和接口，默认不额外发送推理参数。</p>
      <label class="field"><span class="field-label">测试一句</span><input id="set-ping" type="text" value="请只回复：收到"></label>
      <div class="row"><button type="button" class="btn" id="set-test">发送测试</button></div>
      <p id="set-reply" class="help">还没有发送。</p>
      <label class="field"><span class="field-label">模型倾向</span><select id="set-profile"><option value="default">默认中文</option><option value="weak-zh">中文弱，用英文提示</option><option value="weak-en">英文弱，用中文提示</option><option value="strict">审核严，不含 18+</option></select></label>
      <label class="field"><span class="field-label">温度</span><input id="set-temp" type="range" min="0" max="2" step="0.1"></label>
      <label class="field"><span class="field-label">回复篇幅</span><select id="set-length"><option value="short">短，约 200 字</option><option value="medium">中，约 600 字</option><option value="long">长，约 1500 字</option><option value="custom">自定义字数</option></select></label>
      <label class="field"><span class="field-label">自定义字数</span><input id="set-chars" type="number" min="50" max="8000" step="50"></label>
      <p class="help">篇幅与文风用于新建创作。逻辑检查按原文证据输出，不套用创作篇幅。</p>
      <label class="check stretch"><input id="set-adult" type="checkbox"> 允许成人内容。模型倾向为审核严时，打开也不会写进提示。</label>
      <p class="help">AI 建议先预览，点击应用后保存到对应栏位。可以撤销上一次应用。</p>
      <p class="field-label">主题</p>
      <div id="theme-import-panel" class="stack"></div>
      <label class="check"><input id="set-room-palette" type="checkbox"><span>按功能分区配色</span></label><p class="help">各页面使用专属色调；调整下方颜色后使用自定义配色。</p><label class="field"><span class="field-label">背景</span><input id="set-bg" type="color"></label>
      <label class="field"><span class="field-label">纸色</span><input id="set-paper" type="color"></label>
      <label class="field"><span class="field-label">墨色</span><input id="set-ink" type="color"></label>
      <label class="field"><span class="field-label">强调色</span><input id="set-accent" type="color"></label>
      <label class="field"><span class="field-label">圆角</span><input id="set-radius" type="range" min="0" max="28" step="1"></label>
      <label class="field"><span class="field-label">${tr('界面字号')}</span><input id="set-scale" type="range" min="0.9" max="1.2" step="0.05"></label>
      <label class="field"><span class="field-label">${tr('光标大小')} <b id="set-cursor-n"></b></span><input id="set-cursor" type="range" min="16" max="48" step="2"></label>
      <label class="field"><span class="field-label">${tr('间距')}</span>
        <select id="set-density"><option value="comfortable">${tr('舒适')}</option><option value="compact">${tr('紧凑')}</option></select>
      </label>
      <div class="row"><button type="button" class="btn btn-primary" id="set-close">${tr('关闭')}</button></div>
    </div>`;
    host.querySelector('#set-lang').value = prefs.lang || 'en';
    host.querySelector('#set-teach').checked = prefs.teach !== false;
    host.querySelector('#set-json').checked = !!prefs.jsonMode;
    const model = root.NIJANModel ? root.NIJANModel.load() : { baseUrl: '', model: '', key: '', profile: 'default' };
    host.querySelector('#set-base').value = model.baseUrl || '';
    host.querySelector('#set-protocol').value = model.protocol || 'auto';
    host.querySelector('#set-reasoning').value = model.reasoningEffort || 'auto';
    host.querySelector('#set-key').value = model.key || '';
    const api = root.NIJANModel, choices = host.querySelector('#connection-profiles'), modelId = host.querySelector('#model-id');
    const keyInput=host.querySelector('#set-key'), keyNote=host.querySelector('#model-key-status'), keyRetry=host.querySelector('#model-key-retry');
    function paintKeyStatus(){
      const status=api.credentialStatus();
      keyNote.textContent=tr(status.issue || (status.opening?'正在解锁保存的密钥…':status.pending?'正在保护模型密钥…':
        root.nijanDesktop?'模型密钥由操作系统保护。':'模型密钥使用此浏览器的本地加密密钥保护。'));
      keyRetry.hidden=!status.issue;
      const locked=status.opening || status.locked;
      for(const el of host.querySelectorAll('#settings-model-panel input,#settings-model-panel select,#settings-model-panel button')){
        if(el===keyRetry)continue;
        if(locked)el.disabled=true;
      }
    }
    function keyEvent(){
      if(!keyNote.isConnected){root.removeEventListener('quilvori-credential-status',keyEvent);return;}
      paintKeyStatus();
    }
    if(host.keyStatusListener)root.removeEventListener('quilvori-credential-status',host.keyStatusListener);
    host.keyStatusListener=keyEvent;
    root.addEventListener('quilvori-credential-status',keyEvent);
    keyRetry.onclick=async()=>{try{await api.retryCredentials();}catch(_){}if(keyNote.isConnected)openSettings();};
    choices.innerHTML = api.profiles().map(row=>`<option value="${esc(row.id)}" ${row.active?'selected':''}>${esc(row.name)}</option>`).join('');
    const changeProfile = fn => { try { fn(); openSettings(); renderStage(); } catch(error) { toast(tr(error.message)); } };
    choices.onchange = () => changeProfile(()=>api.selectProfile(choices.value));
    host.querySelector('#add-profile').onclick = () => changeProfile(()=>api.newProfile(host.querySelector('#profile-name').value));
    modelId.value = model.model;
    host.querySelector('#model-window').value = model.contextWindow || '';
    const idleInput = host.querySelector('#model-idle-minutes');
    idleInput.value = model.idleMinutes;
    const paintInfo = () => {
      const info = api.capabilities(), unknown = tr('接口未提供');
      host.querySelector('#model-info').textContent = [tr('接口上下文')+' · '+(info.context || unknown),tr('支持的推理强度')+' · '+(info.efforts.join(', ') || unknown),tr('推荐推理强度')+' · '+(info.recommended || unknown)].join('  |  ');
    };
    paintInfo();
    const known = [...new Set([...api.rememberedModels(), model.model].filter(Boolean))];
    const paintModels = (names, selected) => {
      const pick = host.querySelector('#set-model');
      pick.disabled = !names.length;
      pick.innerHTML = `<option value="">${names.length ? '选择模型' : '先点连接'}</option>${names.map((id) => `<option value="${esc(id)}"${id === selected ? ' selected' : ''}>${esc(id)}</option>`).join('')}`;
      if (selected && names.includes(selected)) pick.value = selected;
      if (root.TAI18n) root.TAI18n.localize(pick);
    };
    paintModels(known, model.model || '');
    host.querySelector('#set-profile').value = model.profile || 'default';
    host.querySelector('#set-temp').value = String(model.temperature ?? 0.7);
    host.querySelector('#set-length').value = prefs.replyLength || 'medium';
    host.querySelector('#set-chars').value = String(prefs.replyChars || 600);
    host.querySelector('#set-adult').checked = !!prefs.adult;
    const themeChoice = host.querySelector('#set-room-palette');
    const syncThemeInputs = () => {
      const theme=ensureTheme();
      const active = root.TARoomTheme.resolve(state.route, theme.vars, theme.useRoomPalette);
      themeChoice.checked = active.useRooms;
      for (const key of ['bg','paper','ink','accent']) host.querySelector(`#set-${key}`).value = active.colors[key];
      host.querySelector('#set-radius').value = String(active.radius);
    };
    syncThemeInputs();
    root.TAThemeLibrary.mountSettings(host.querySelector('#theme-import-panel'),syncThemeInputs);
    themeChoice.onchange = () => { const theme=ensureTheme(); theme.useRoomPalette = themeChoice.checked; applyTheme(); syncThemeInputs(); markDirty('themes',theme.id); };
    const paintTheme = (key, value) => {
      const theme=ensureTheme(), vars=theme.vars;
      if (key !== 'radius') {
        // Start custom editing from the colors actually displayed, preserving the other choices.
        const active = root.TARoomTheme.resolve(state.route, vars, theme.useRoomPalette);
        if (active.useRooms) Object.assign(vars, active.colors);
        theme.useRoomPalette = false;
        themeChoice.checked = false;
      }
      vars[key] = key === 'radius' ? Number(value) : value;
      applyTheme();
      markDirty('themes',theme.id);
    };
    host.querySelector('#set-bg').oninput = (event) => paintTheme('bg', event.target.value);
    host.querySelector('#set-paper').oninput = (event) => paintTheme('paper', event.target.value);
    host.querySelector('#set-ink').oninput = (event) => paintTheme('ink', event.target.value);
    host.querySelector('#set-accent').oninput = (event) => paintTheme('accent', event.target.value);
    host.querySelector('#set-radius').oninput = (event) => paintTheme('radius', event.target.value);
    host.querySelector('#set-scale').value = String(prefs.scale || 1);
    host.querySelector('#set-density').value = prefs.density === 'compact' ? 'compact' : 'comfortable';
    host.querySelector('#set-cursor').value = String(prefs.cursorSize || 32);
    host.querySelector('#set-cursor-n').textContent = String(prefs.cursorSize || 32);
    const commit = () => {
      if (!root.TAI18n) return;
      root.TAI18n.save({
        lang: host.querySelector('#set-lang').value,
        teach: host.querySelector('#set-teach').checked,
        scale: Number(host.querySelector('#set-scale').value),
        density: host.querySelector('#set-density').value,
        cursorSize: Number(host.querySelector('#set-cursor').value) || 32,
        jsonMode: host.querySelector('#set-json').checked,
        adult: host.querySelector('#set-adult').checked,
        replyLength: host.querySelector('#set-length').value,
        replyChars: Number(host.querySelector('#set-chars').value) || 600,
      });
      if (root.NIJANModel && !api.credentialStatus().locked && !api.credentialStatus().opening) {
        if(api.profiles().find(row=>row.active)?.id!==choices.value)throw new Error('另一窗口已修改模型配置。请重新打开工作台再编辑。');
        root.NIJANModel.save({
          baseUrl: host.querySelector('#set-base').value.trim(),
          protocol: host.querySelector('#set-protocol').value,
          reasoningEffort: host.querySelector('#set-reasoning').value,
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
    host.querySelector('#set-base').oninput = () => { commit(); paintInfo(); paintModels(api.rememberedModels(),modelId.value); };
    host.querySelector('#set-protocol').onchange = commit;
    host.querySelector('#set-reasoning').onchange = commit;
    keyInput.oninput = () => {
      if(api.profiles().find(row=>row.active)?.id!==choices.value){toast(tr('另一窗口已修改模型配置。请重新打开工作台再编辑。'),{kind:'error'});return;}
      api.save({key:keyInput.value});paintKeyStatus();paintInfo();paintModels(api.rememberedModels(),modelId.value);
    };
    const reply = host.querySelector('#set-reply');
    const say = (text) => { reply.textContent = text; };
    host.querySelector('#set-model').onchange = (event) => {
      if (root.NIJANModel) root.NIJANModel.save({ model: event.target.value, contextWindow:0 });
      modelId.value = event.target.value; host.querySelector('#model-window').value = ''; paintInfo();
    };
    modelId.oninput = () => { api.save({model:modelId.value.trim(), contextWindow:0}); host.querySelector('#model-window').value=''; paintModels(api.rememberedModels(),modelId.value.trim()); paintInfo(); };
    host.querySelector('#model-window').oninput = event => api.save({contextWindow:event.target.value});
    idleInput.onchange = () => {
      if (!idleInput.validity.valid) { idleInput.reportValidity(); return; }
      idleInput.value = api.save({idleMinutes:idleInput.value}).idleMinutes;
    };
    host.querySelector('#set-connect').onclick = async () => {
      if (!root.NIJANModel) return;
      say(tr('正在读取模型列表…'));
      try {
        root.NIJANModel.save({ baseUrl: host.querySelector('#set-base').value.trim(), key: keyInput.value });
        const names = await root.NIJANModel.listModels();
        const current = root.NIJANModel.load().model;
        paintModels(names, names.includes(current) ? current : '');
        paintInfo();
        say(names.length ? tr('已连接，共 {count} 个模型。选一个再用。', { count: names.length }) : tr('连上了，但接口没有返回模型。'));
      } catch (error) {
        say(error.message || tr('连接失败'));
      }
    };
    host.querySelector('#set-test').onclick = async () => {
      flyPlane(host.querySelector('#set-test'));
      if (!root.NIJANModel) return;
      if (!root.NIJANModel.load().model) { say(tr('先选择一个模型。')); return; }
      say(tr('正在发送…'));
      try {
        const text = await root.NIJANModel.testMessage(host.querySelector('#set-ping').value);
        say(text.trim() ? `${tr('收到回复：')}\n${text}` : tr('没有收到回复。'));
      } catch (error) {
        say(error.message || tr('没有收到回复。'));
      }
    };
    host.querySelector('#set-profile').onchange = commit;
    host.querySelector('#set-temp').oninput = commit;
    host.querySelector('#set-length').onchange = commit;
    host.querySelector('#set-chars').oninput = commit;
    host.querySelector('#set-adult').onchange = commit;
    host.querySelector('#set-scale').oninput = commit;
    host.querySelector('#set-density').onchange = commit;
    host.querySelector('#set-cursor').oninput = () => {
      host.querySelector('#set-cursor-n').textContent = host.querySelector('#set-cursor').value;
      commit();
    };
    const close = async () => {
      const status=api.credentialStatus();
      try { commit(); if(!status.locked && !status.opening)await api.flushCredentials(); }
      catch (error) { toast(tr(error.message),{kind:'error'}); }
      if(!keyNote.isConnected)return;
      root.removeEventListener('quilvori-credential-status',keyEvent);
      host.keyStatusListener=null;
      host.classList.remove('show'); host.innerHTML = ''; host.onclick = null; previousFocus?.focus?.();
    };
    host.querySelector('#set-close').onclick = close;
    host.onclick = (event) => { if (event.target === host) close(); };
    if (root.TAWorkspace) root.TAWorkspace.prepareSettings(host);
    if (root.TAI18n) root.TAI18n.localize(host);
    paintKeyStatus();
    if(api.credentialStatus().opening)api.ready.then(()=>{if(keyNote.isConnected)openSettings();});
  }

  function mount(registered, loaded = TAStore.load()) {
    views = registered;
    if (loaded.unavailable) {
      const app = document.getElementById('app');
      app.innerHTML = '<main class="paper recovery"><h1>'+esc(root.TAI18n.t('无法打开本机资料库'))+'</h1><p role="alert"></p><button class="btn">'+esc(root.TAI18n.t('重试'))+'</button></main>';
      app.querySelector('p').textContent=root.TAI18n.t(loaded.message); app.querySelector('button').onclick=()=>location.reload(); return;
    }
    if (loaded.corrupt) {
      const app = document.getElementById('app');
      const t = key => esc(root.TAI18n.t(key));
      app.innerHTML = `<main class="paper recovery"><h1>${t('恢复本机资料库')}</h1><p>${t(loaded.missing ? '未找到已迁移的资料库。请选择备份恢复。' : '存档无法读取。先下载原始数据，再选择可用的备份。')}</p><div class="row">${loaded.missing ? '' : '<button class="btn" data-rescue>'+t('下载原始存档')+'</button>'}<button class="btn" data-file>${t('从备份恢复')}</button>${loaded.previous ? '<button class="btn" data-previous>' + t('恢复上次保存') + '</button>' : ''}</div><p role="status"></p></main>`;
      app.querySelector('[data-rescue]')?.addEventListener('click',()=>downloadText('Quilvori-recovery.json', loaded.raw));
      const restore = async (library,workState=null) => {
        const baseline=workState ? await root.TALibraryDB.replacementGuard() : null;
        if (!window.confirm(root.TAI18n.t('用选中的备份恢复资料库？'))) return;
        const transfer=workState ? root.TAWorkBackup.transfer(baseline,workState,'replace') : null;
        await TAStore.recover(loaded.raw, library,transfer);
        location.reload();
      };
      const run = async action => {
        try { await action(); }
        catch (error) { app.querySelector('[role="status"]').textContent = root.TAI18n.t(error.message); }
      };
      app.querySelector('[data-file]').onclick = () => run(async () => {
        const file = await pickFile('.json,application/json');
        if (file) {
          const data = JSON.parse((await file.text()).replace(/^\uFEFF/,''));
          const backup=root.TAFormats.readBackup(data);
          await restore(TAStore.verify(backup.library),backup.workState);
        }
      });
      app.querySelector('[data-previous]')?.addEventListener('click', () => run(() => restore(loaded.previous)));
      return;
    }
    state.lib = loaded.library;
    state.persistent = loaded.persistent;
    state.fresh = loaded.fresh;
    const app = document.getElementById('app');
    const tr = (key) => root.TAI18n ? root.TAI18n.t(key) : key;
    const icon = (name) => root.TAWorkspace ? root.TAWorkspace.icon(name) : '';
    const commandKey = /Mac|iPhone|iPad/i.test(root.navigator?.platform || '') ? '⌘' : 'Ctrl';
    const navButton = (route) => `<button type="button" class="nav-btn" data-nav="${route.id}" title="${esc(route.label)}" aria-label="${esc(route.label)}">${icon(route.id)}<span data-label>${route.label}</span></button>`;
    const primary = ['home', 'resources', 'studio', 'characters', 'lore','themes'];
    const writing = ['sections', 'prompts', 'graph', 'check'];
    app.innerHTML = `<div class="shell">
      <aside class="nav">
        <div class="brand"><img class="mark" src="img/emblem.svg?v=quilvori-1" alt=""><span class="qc-brand-lockup"><strong data-product data-no-translate>叙翎集</strong><em data-product-secondary data-no-translate>Quilvori</em></span></div>
        <div class="nav-import">
          <button type="button" class="btn" data-shell="import-card">导入角色卡</button>
          <button type="button" class="btn" data-shell="import-book">导入世界书</button>
        </div>
        <nav class="nav-list" aria-label="主要导航"><div class="nav-section-label">写东西</div>${primary.map((id) => navButton(ROUTES.find((route) => route.id === id))).join('')}<div class="nav-section-label">理一理</div>${writing.map((id) => navButton(ROUTES.find((route) => route.id === id))).join('')}<details class="nav-tools"${[...primary, ...writing].includes(document.body.dataset.page || location.hash.slice(1) || 'home') ? '' : ' open'}><summary>${icon('more')}<span>更多工具</span>${icon('chevron')}</summary>${ROUTES.filter((route) => ![...primary, ...writing].includes(route.id)).map(navButton).join('')}</details></nav>
        <button type="button" class="rail-label qc-people-toggle" data-people-toggle aria-controls="rail-cast" aria-expanded="true"><span>${tr('人物')}</span><small data-people-count></small>${icon('chevron')}</button>
        <div id="rail-cast" class="rail-cast"></div>
        <div class="nav-foot">
          <button type="button" class="btn" data-shell="settings">设置</button>
          <details class="nav-library"><summary>库管理</summary><p class="note">示例会替换当前库。清空只删这台浏览器里的稿。</p><button type="button" class="btn" data-shell="demo">载入示例</button><button type="button" class="btn btn-danger" data-shell="clear">清空库</button></details>
          <div class="nav-local"><i></i><span>存放在本机</span></div>
        </div>
      </aside>
      <div class="main">
        <header class="top">
          <div class="top-title"><button type="button" class="ws-icon-button" data-workspace="sidebar" aria-label="展开或收起导航" title="展开或收起导航" aria-expanded="true">${icon('sidebar')}</button><div><p class="eyebrow" id="eyebrow">HOME</p><h1 id="title">总览</h1><p class="note" id="blurb"></p></div></div>
          <div class="top-actions">
            <div class="search"><input id="search" type="search" aria-label="搜索角色卡、世界书、提示词和正则" placeholder="搜索角色卡、世界书、提示词和正则" autocomplete="off"><span class="note" id="search-note">跨页搜索，不改库。</span><div id="search-results"></div></div>
            <button type="button" class="ws-command-trigger" data-workspace="command" aria-keyshortcuts="Control+K Meta+K" aria-label="${esc(tr('搜索或跳转'))}" title="${esc(tr('搜索或跳转'))} · ${commandKey}+K">${icon('search')}<kbd class="ws-key" data-no-translate>${commandKey} K</kbd></button>
            <button type="button" class="ws-icon-button" data-workspace="focus" aria-label="专注模式" title="专注模式" aria-pressed="false">${icon('focus')}</button>
            <button type="button" class="ws-icon-button" data-workspace="settings" aria-label="设置" title="设置">${icon('settings')}</button>
            <span class="save-wrap"><span id="save-pill" class="pill"><i></i>已保存</span><span class="note">改动自动写入这台浏览器。</span></span>
          </div>
        </header>
        <details class="workspace-folders"><summary>${icon('backup')}<span>本地文件夹</span></summary><div id="folders" class="folders"></div></details>
        <div id="storage-banner"></div>
        <div id="export-slip"></div>
        <div class="stage" id="stage"></div>
      </div>
    </div>
    <div id="modal-root" class="modal-root"></div>
    <div id="toasts" class="toasts"></div>`;
    const people = document.querySelector('[data-people-toggle]');
    people.onclick = () => {
      state.peopleCollapsed = !state.peopleCollapsed;
      people.setAttribute('aria-expanded',String(!state.peopleCollapsed));
      document.getElementById('rail-cast').hidden = state.peopleCollapsed;
      if (!state.peopleCollapsed) paintRail();
    };
    document.querySelectorAll('[data-nav]').forEach((button) => {
      button.onclick = () => go(button.dataset.nav);
    });
    document.querySelector('[data-shell="demo"]').onclick = confirmLoadDemo;
    document.querySelector('[data-shell="clear"]').onclick = confirmClear;
    document.querySelector('[data-shell="import-card"]').onclick = () => { go('characters'); setTimeout(() => document.querySelector('[data-act="import"]')?.click(), 0); };
    document.querySelector('[data-shell="import-book"]').onclick = () => { go('lore'); setTimeout(() => document.querySelector('#import-book')?.click(), 0); };
    document.querySelector('[data-shell="settings"]').onclick = openSettings;
    if (root.TAI18n) root.TAI18n.apply();
    const searchBox = document.getElementById('search');
    const editorStage = document.getElementById('stage');
    for (const type of ['click','keydown','input','change','drop']) editorStage.addEventListener(type,guardWorkEvent,true);
    searchBox.addEventListener('pointerdown', () => searchBox.classList.add('held'));
    const releaseSearch = () => {
      if (!searchBox.classList.contains('held')) return;
      searchBox.classList.remove('held');
      searchBox.classList.add('settle');
      setTimeout(() => searchBox.classList.remove('settle'), 320);
    };
    searchBox.addEventListener('pointerup', releaseSearch);
    searchBox.addEventListener('pointercancel', releaseSearch);
    let filterTimer;
    searchBox.addEventListener('input', () => {
      const query = searchBox.value;
      state.query = query;
      paintGlobalSearch(query);
      clearTimeout(filterTimer);
      if (routeMeta().search) filterTimer = setTimeout(() => { if (state.query === query) renderStage(); }, 180);
    });
    searchBox.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') {
        const result = document.querySelector('#search-results a');
        if (result) { event.preventDefault(); result.focus(); }
      }
      if (event.key === 'Escape') paintGlobalSearch('');
    });
    searchBox.addEventListener('focus', () => paintGlobalSearch(searchBox.value));
    window.addEventListener('pointerdown', event => { if (!event.target.closest('.search')) paintGlobalSearch(''); });
    if (!state.persistent) {
      document.getElementById('storage-banner').innerHTML = '<div class="banner">这台浏览器没有把本地存储开放给当前页面。改动只留在这次打开里，离开前请导出整库备份。</div>';
    }
    if(loaded?.draftWarning)toast(root.TAI18n.t('本机草稿暂时无法读取，仍可打开已收录作品。'),{kind:'warning'});
    if(loaded?.archiveWarning)toast(root.TAI18n.t('本机模型返回记录暂时无法读取。'),{kind:'warning'});
    applyTheme();
    if (root.TAWorkspace) root.TAWorkspace.mount();
    window.addEventListener('quilvori-drafts',()=>document.getElementById('stage')?.refreshDraftShelf?.());
    window.addEventListener('hashchange',followLocation);
    window.addEventListener('popstate',followLocation);
    document.addEventListener?.('click',event=>{
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link=event.target.closest?.('a[href]');
      if (!link || link.hasAttribute('download') || link.target && link.target !== '_self') return;
      if (openAddress(link.href)) event.preventDefault();
    });
    window.addEventListener('beforeunload', event => {
      const keys=root.NIJANModel?.credentialStatus();
      if (keys?.pending && !keys.issue) { event.preventDefault(); event.returnValue=''; }
      if (root.TAThemeWorkshop?.unsaved() || root.TATaskActivity?.pending() || root.NIJANStudio?.running() || root.NIJANOrganizePanel?.running()) {
        event.preventDefault(); event.returnValue = '';
      }
      if (state.save === 'saved') return;
      if (TAStore.backend !== 'indexedDB' && !replacing) {
        try { TAStore.save(state.lib); state.save='saved'; return; } catch (_) {}
      }
      if (!replacing) void flush();
      event.preventDefault(); event.returnValue = '';
    });
    document.addEventListener?.('visibilitychange', () => {
      if (document.hidden && state.save === 'dirty') void flush();
    });
    if (state.fresh) {
      state.save='dirty'; void flush();
      toast('已载入听雨楼示例。不需要的话可以清空库。');
    }
    paintFolders();
    followLocation();
  }

  let openSelect = null;
  let selectEventsReady = false;
  function closeSelect() {
    if (!openSelect) return;
    const { menu, button } = openSelect;
    if (menu.hidePopover && menu.matches(':popover-open')) menu.hidePopover();
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    openSelect = null;
  }
  function enhanceSelect(select) {
    if (!select || select.dataset.enhanced) return;
    select.dataset.enhanced = '1';
    const wrap = document.createElement('div');
    wrap.className = 'dark-select';
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dark-select-value';
    button.setAttribute('role', 'combobox');
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    const label = wrap.closest('label')?.querySelector('.field-label');
    if (label) button.setAttribute('aria-label', label.textContent);
    const menu = document.createElement('div');
    menu.className = 'dark-select-menu';
    menu.id = `select-menu-${TAStore.uid()}`;
    menu.setAttribute('role', 'listbox');
    button.setAttribute('aria-controls', menu.id);
    if (menu.showPopover) menu.setAttribute('popover', 'auto');
    menu.hidden = true;
    const paint = () => {
      const current = select.options[select.selectedIndex];
      button.textContent = current ? current.text : '';
      button.disabled = select.disabled;
      menu.replaceChildren(...[...select.options].map((opt, index) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'dark-select-opt';
        if (index === select.selectedIndex) item.classList.add('on');
        item.textContent = opt.text;
        item.disabled = opt.disabled;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(index === select.selectedIndex));
        item.onclick = () => {
          closeSelect();
          select.selectedIndex = index;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          paint();
        };
        return item;
      }));
    };
    paint();
    const open = () => {
      if (select.disabled) return;
      closeSelect();
      paint();
      menu.hidden = false;
      const rect = button.getBoundingClientRect();
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const upward = below < 150 && above > below;
      const height = Math.max(40, Math.min(240, upward ? above : below));
      menu.style.width = `${Math.min(rect.width, window.innerWidth - 16)}px`;
      menu.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8))}px`;
      menu.style.top = upward ? 'auto' : `${rect.bottom + 4}px`;
      menu.style.bottom = upward ? `${window.innerHeight - rect.top + 4}px` : 'auto';
      menu.style.maxHeight = `${height}px`;
      openSelect = { wrap, menu, button };
      button.setAttribute('aria-expanded', 'true');
      if (menu.showPopover) menu.showPopover();
    };
    button.onclick = () => { if (openSelect?.button === button) closeSelect(); else open(); };
    button.onkeydown = (event) => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); open();
        (menu.querySelector('.on:not(:disabled)') || menu.querySelector('button:not(:disabled)'))?.focus();
      }
    };
    menu.onkeydown = (event) => {
      const items = [...menu.querySelectorAll('button:not(:disabled)')];
      const index = items.indexOf(document.activeElement);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }
      if (event.key === 'Escape') { event.preventDefault(); closeSelect(); button.focus(); }
    };
    menu.addEventListener('toggle', () => { if (menu.matches(':popover-open') === false && openSelect?.menu === menu) closeSelect(); });
    if (!selectEventsReady) {
      document.addEventListener('pointerdown', (event) => { if (openSelect && !openSelect.wrap.contains(event.target) && !openSelect.menu.contains(event.target)) closeSelect(); });
      document.addEventListener('scroll', (event) => { if (openSelect && !openSelect.menu.contains(event.target)) closeSelect(); }, true);
      window.addEventListener('resize', closeSelect);
      selectEventsReady = true;
    }
    select.addEventListener('change', paint);
    wrap.append(button, menu);
  }

  function hint(text) {
    return `<p class="note">${esc(text)}</p>`;
  }

  async function readImage(file) {
    try { return await root.TAUI.readDataUrl(file); }
    catch (error) { throw new Error(file.name + ' · ' + root.TAUI.t(error.message)); }
  }

  async function commitCurrentLibrary(update) {
    // File reads and confirmation dialogs may outlive the editor that started the operation.
    const candidate = structuredClone(root.TAUI.state.lib);
    update(candidate);
    await root.TAUI.commitLibrary(candidate);
  }

  root.TAUI = {
    hint, readImage, commitCurrentLibrary, bindWork,
    ROUTES, state, esc, toast, ask, dialogTabStops, downloadBlob, downloadText, downloadJson, pickFile, readText, readDataUrl, copyText,
    safeName, assetById, charById, selected, matchQuery, markDirty, flush, commitLibrary, applyTheme, ensureTheme, go, openAddress, setAddress, renderStage, show, flyPlane,
    openSettings, field, fold, mountFolds, area, text, bindFields, picker, bindPicker, empty, confirmLoadDemo, confirmClear, mount,
    t: (key, vars) => (root.TAI18n ? root.TAI18n.t(key, vars) : key),
    estimateLength, mountLengths, showExport, fillLesson, enhanceSelect, readFolders,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
