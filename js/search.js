/* Field-level search and navigation shared by the header and command palette. */
(function (root) {
  'use strict';

  const types = {
    character: { collection: 'characters', route: 'characters', selection: 'character', label: '角色卡', title: 'name',
      fields: { name: '名字', description: '描述', personality: '性格', scenario: '情景', first_mes: '开场白', mes_example: '对话示例',
        alternate_greetings: '备用开场', system_prompt: '系统提示', post_history_instructions: '历史后指令', creator_notes: '创作者备注',
        creator: '创作者', tags: '标签', character_version: '版本' } },
    book: { collection: 'worldBooks', route: 'lore', selection: 'book', label: '世界书', title: 'name',
      fields: { name: '书名', description: '描述' } },
    entry: { parent: 'book', collection: 'entries', route: 'lore', label: '世界书条目', title: 'comment',
      fields: { comment: '条目名', keys: '主关键词', secondaryKeys: '次关键词', content: '内容', outletName: '出口名', category: '分类' } },
    preset: { collection: 'promptPresets', route: 'prompts', selection: 'preset', label: '提示词预设', title: 'name',
      fields: { name: '预设名' } },
    block: { parent: 'preset', collection: 'blocks', route: 'prompts', label: '提示词块', title: 'name',
      fields: { name: '块名称', content: '内容', role: '角色', kind: '类型' } },
    regex: { collection: 'regexScripts', route: 'regex', selection: 'regex', label: '正则脚本', title: 'scriptName',
      fields: { scriptName: '名称', findRegex: '查找', replaceString: '替换', trimStrings: '裁剪字符串' } },
  };
  const childType = { book: 'entry', preset: 'block' };
  const routes = { characters: 'character', lore: 'book', prompts: 'preset', regex: 'regex' };
  const subtypeParam = { entry: 'entry', block: 'block' };
  let cachedLibrary, searchIndex, pending;

  function invalidate() {
    cachedLibrary = undefined;
    searchIndex = undefined;
  }
  function buildIndex(library) {
    const names = [], fields = [];
    function indexItem(kind, item, parent) {
      if (item?.id==null) return;
      const type = types[kind];
      for (const [field, label] of Object.entries(type.fields)) {
        const value = item[field], values = Array.isArray(value) ? value : [value];
        values.forEach((text, index) => {
          if (typeof text !== 'string' || !text.trim()) return;
          const target = { kind, id: item.id, field };
          if (parent) target.parentId = parent.id;
          if (Array.isArray(value)) target.index = index;
          (field === type.title ? names : fields).push({
            target, title: item[type.title] || '', parentTitle: parent?.name || '', label, text,
          });
        });
      }
      const child = childType[kind];
      if (child) for (const row of item[types[child].collection] || []) indexItem(child, row, item);
    }
    for (const [kind, type] of Object.entries(types)) {
      if (!type.parent) for (const item of library[type.collection] || []) indexItem(kind, item);
    }
    return names.concat(fields);
  }
  function *matches(library, query) {
    const needle = String(query || '').trim();
    if (!needle || !library) return;
    if (library !== cachedLibrary || !searchIndex) {
      searchIndex = buildIndex(library);
      cachedLibrary = library;
    }
    // An escaped literal preserves original UTF-16 selection offsets even when Unicode case folding changes length.
    const pattern = new RegExp(needle.replace(/[.*+?^\x24{}()|[\]\\]/g, '\\$&'), 'iu');
    for (const row of searchIndex) {
      const found = pattern.exec(row.text);
      if (!found) continue;
      const from = found.index, to = from + found[0].length;
      const left = Math.max(0, from - 30), right = Math.min(row.text.length, to + 50);
      const snippet = (left ? '…' : '') + row.text.slice(left, right).replace(/\s+/g, ' ') + (right < row.text.length ? '…' : '');
      yield { target: { ...row.target, from, to }, title: row.title, parentTitle: row.parentTitle, label: row.label, snippet };
    }
  }
  function page(rows, offset, size) {
    const items = [];
    let skipped = 0;
    for (const row of rows) {
      if (skipped++ < offset) continue;
      if (items.length === size) return { items, more: true };
      items.push(row);
    }
    return { items, more: false };
  }
  function describe(hit) {
    const tr = root.TAUI.t;
    const field = tr(hit.label) + (hit.target.index == null ? '' : ' ' + (hit.target.index + 1));
    return [tr(types[hit.target.kind].label), hit.parentTitle, field, hit.snippet].filter(Boolean).join(' · ');
  }

  function resolve(library, target) {
    const type = types[target?.kind];
    if (!type || !Object.hasOwn(types, target.kind) || !Object.hasOwn(type.fields, target.field)) return null;
    let owner = library;
    if (type.parent) owner = root.TAStore.byId(library[types[type.parent].collection],target.parentId);
    const item=root.TAStore.byId(owner?.[type.collection],target.id);
    return item ? {...target,id:item.id,...(type.parent?{parentId:owner.id}:{})} : null;
  }
  function href(target) {
    const type = types[target.kind], params = new URLSearchParams();
    if (!target.selectOnly) params.set('field', target.field);
    if (type.parent) params.set(subtypeParam[target.kind], target.id);
    for (const key of ['index', 'from', 'to']) if (Number.isSafeInteger(target[key]) && target[key] >= 0) params.set(key, String(target[key]));
    const query = params.toString();
    return type.route + '.html' + (query ? '?' + query : '') + '#' + encodeURIComponent(type.parent ? target.parentId : target.id);
  }
  function address(route, url) {
    const parent = routes[route];
    if (!parent || !url.hash || !Object.hasOwn(routes, route)) return null;
    let id;
    try { id = decodeURIComponent(url.hash.slice(1)); } catch (_) { return null; }
    const params = url.searchParams, child = childType[parent], subId = child && params.get(subtypeParam[child]);
    const kind = subId ? child : parent;
    const target = { kind, id: subId || id, field: params.get('field') || (kind === 'entry' ? 'content' : types[kind].title) };
    if (!Object.hasOwn(types[kind].fields, target.field)) return null;
    if (!params.has('field') && !subId) target.selectOnly = true;
    if (subId) target.parentId = id;
    for (const key of ['index', 'from', 'to']) {
      const value = params.get(key);
      if (value != null && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))) target[key] = Number(value);
    }
    return target;
  }
  function choose(target) {
    const state = root.TAUI.state;
    target=resolve(state.lib,target);
    if (!target) return false;
    const type = types[target.kind], owner = type.parent ? types[type.parent] : type;
    state.sel[owner.selection] = type.parent ? target.parentId : target.id;
    state.openFold ||= {};
    if (target.kind === 'character') {
      state.cardView = 'edit';
      if (!target.selectOnly) state.openFold.char = target.field === 'alternate_greetings' ? 'greetings' : target.field;
    } else if (type.route === 'lore') {
      state.loreFilter = '';
      state.sel.entry = target.kind === 'entry' ? target.id : null;
      if (target.kind === 'entry') state.openFold.lore = target.field === 'secondaryKeys' ? 'keys2' : target.field;
    }
    pending = target.selectOnly ? undefined : target;
    return true;
  }
  function restoreAddress(route, url = new URL(root.location.href)) {
    const target = address(route, url);
    pending = undefined;
    if (target) return choose(target);
    return !url?.hash || !Object.hasOwn(routes,route);
  }
  function hasAddress(route,url) {
    return !url?.hash || !Object.hasOwn(routes,route) || !!resolve(root.TAUI.state.lib,address(route,url));
  }
  async function open(target) {
    const ui = root.TAUI;
    if (!resolve(ui.state.lib, target)) { ui.toast(ui.t('搜索目标已不存在')); return; }
    return ui.openAddress(href(target));
  }
  function focus(stage, route) {
    if (!pending || types[pending.kind].route !== route) return;
    const target = pending;
    pending = undefined;
    const { kind, field, index } = target;
    const escape = CSS.escape;
    let selector;
    if (kind === 'book') selector = '[data-book-field="' + field + '"]';
    else if (kind === 'block') selector = '[data-block="' + escape(target.id) + '"][data-key="' + field + '"]';
    else if (field === 'alternate_greetings') selector = '[data-greet="' + (index ?? 0) + '"]';
    else if (field === 'trimStrings') selector = '[data-trim-index="' + (index ?? 0) + '"]';
    else if (['tags', 'keys', 'secondaryKeys'].includes(field)) {
      const group = { tags: '#char-tags', keys: '#keys', secondaryKeys: '#keys2' }[field];
      selector = group + (index == null ? ' .chip-input' : ' .chip[data-i="' + index + '"]');
    } else {
      const scope = { character: '#char-form ', entry: '#lore-editor ', regex: '#rx-body ', preset: '' }[kind];
      selector = scope + '[data-field="' + field + '"]';
    }
    const fieldNode = stage.querySelector(selector);
    if (!fieldNode) return;
    for (let details = fieldNode.closest('details'); details; details = details.parentElement?.closest('details')) details.open = true;
    const node = fieldNode.matches('select') ? (fieldNode.closest('.dark-select')?.querySelector('.dark-select-value') || fieldNode) : fieldNode;
    node.focus({ preventScroll: true });
    if (typeof target.from === 'number' && typeof target.to === 'number' && (node.matches('textarea,input[type="text"],input:not([type])'))) {
      node.setSelectionRange(target.from, target.to);
    }
    node.scrollIntoView({ block: 'center', inline: 'nearest' });
  }

  root.TASearch = { matches, page, describe, types, invalidate, href, address, open, restoreAddress, hasAddress, focus };
})(globalThis);
