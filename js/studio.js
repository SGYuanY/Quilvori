/* AI creation. One small column per workshop. Edits import into that page. */
(function (root) {
  function emptyDraft() {
    return {
      brief: '',
      supplement: '',
      progress: '还没开始写。',
      progressRatio: 0,
      writing: false,
      questions: [],
      answers: [],
      ideas: [],
      sections: { style: '', pov: '', bond: '', safe: '', format: '', r18: '', nsfw: '' },
      card: { name: '', description: '', personality: '', scenario: '', first_mes: '', mes_example: '', system_prompt: '' },
      bookName: '',
      bookText: '',
      promptName: '',
      promptText: '',
      groupName: '',
      groupScenario: '',
      chatName: '',
      chatText: '',
      assetName: '',
      assetKind: 'expression',
      assetNote: '',
      regexName: '',
      regexFind: '',
      regexReplace: '',
      quickName: '',
      quickText: '',
      noteText: '',
      beatText: '',
      graphNodes: '',
      graphEdges: '',
      scriptName: '',
      scriptText: '',
      check: '',
      backupNote: '',
      memoryHtml: '',
      classes: null,
      classNote: '',
      entryEdit: '',
      targetCardId: '',
      targetBookId: '',
    };
  }

  let activeJob = 0;
  let activeAbort = null;

  function startJob() {
    if (activeAbort) activeAbort.abort();
    activeJob += 1;
    activeAbort = new AbortController();
    return { id: activeJob, signal: activeAbort.signal };
  }

  function jobGone(job) {
    return !job || job.id !== activeJob;
  }

  function stopped(error, job) {
    return jobGone(job) || (error && error.name === 'AbortError');
  }

  const CARD_PARTS = [
    { id: 'name', label: '名字', field: 'name' },
    { id: 'appearance', label: '外貌', field: 'description' },
    { id: 'personality', label: '性格', field: 'personality' },
    { id: 'scenario', label: '情景', field: 'scenario' },
    { id: 'first_mes', label: '开场白', field: 'first_mes' },
    { id: 'mes_example', label: '示例对话', field: 'mes_example' },
    { id: 'system_prompt', label: '系统提示', field: 'system_prompt' },
    { id: 'creator_notes', label: '作者注', field: 'creator_notes' },
    { id: 'book', label: '角色书' },
  ];

  const DRAFT_KEY = 'nijan-studio-draft';

  function draft() {
    const ui = root.TAUI;
    if (!ui.state.studio) {
      let saved = null;
      try { saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null'); } catch (error) { saved = null; }
      ui.state.studio = Object.assign(emptyDraft(), saved && typeof saved === 'object' ? saved : {});
    }
    return ui.state.studio;
  }

  function persistDraft() {
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft())); } catch (error) { /* 这一次打开里记不下就只留在内存 */ }
  }

  window.addEventListener('pagehide', persistDraft);

  function liveOn() {
    const prefs = root.TAI18n && root.TAI18n.prefs;
    return !prefs || prefs.liveImport !== false;
  }

  function adultAllowed() {
    const prefs = root.TAI18n && root.TAI18n.prefs;
    return !!(prefs && prefs.adult && root.NIJANModel && root.NIJANModel.allowsAdult());
  }

  function setPath(obj, path, value) {
    const parts = path.split('.');
    let cursor = obj;
    for (let i = 0; i < parts.length - 1; i += 1) cursor = cursor[parts[i]];
    cursor[parts[parts.length - 1]] = value;
  }

  function linesOf(text) {
    return String(text || '').split('\n').map((line) => line.trim()).filter(Boolean);
  }

  function splitPair(line) {
    const match = String(line).match(/^([^:：]{1,40})[:：]\s*(.*)$/);
    return match ? [match[1].trim(), match[2].trim()] : ['', String(line).trim()];
  }

  function entryTitle(entry) {
    const named = String((entry && (entry['条目名'] || entry.comment || entry.name || entry.title)) || '').trim();
    if (named && named !== '未命名') return named;
    const body = String((entry && (entry['正文'] || entry.content || entry.body)) || '').trim();
    const line = body.split('\n').map((item) => item.trim()).find(Boolean) || '';
    const cleaned = line.replace(/^(正文|body)[:：]\s*/, '').trim();
    if (!cleaned) return '';
    return cleaned.length > 18 ? `${cleaned.slice(0, 18)}…` : cleaned;
  }

  function parseEntries(text) {
    return String(text || '').split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean).map((block) => {
      const rows = block.split('\n');
      const keysRow = rows.find((row) => /^关键词|^触发/.test(row)) || '';
      const keys = keysRow.replace(/^(关键词|触发关键词)[:：]\s*/, '').split(/[,，]/).map((item) => item.trim()).filter(Boolean);
      const bodyIndex = rows.findIndex((row) => /^正文|^body/.test(row));
      const content = bodyIndex >= 0
        ? rows.slice(bodyIndex).join('\n').replace(/^(正文|body)[:：]\s*/, '').trim()
        : rows.filter((row) => !/^条目名|^关键词|^触发/.test(row)).slice(1).join('\n').trim();
      const comment = entryTitle({
        条目名: (rows.find((row) => /^条目名/.test(row)) || '').replace(/^条目名[:：]\s*/, ''),
        正文: content,
      });
      return { comment, keys, content };
    }).filter((entry) => entry.comment || entry.content);
  }

  function entriesToText(entries) {
    return (entries || []).map((entry) => {
      const keys = entry.keys || entry['触发关键词'] || [];
      const body = entry.content || entry['正文'] || entry.body || '';
      return `条目名：${entryTitle(entry)}\n关键词：${[].concat(keys).join('，')}\n正文：${body}`;
    }).join('\n\n');
  }

  function sampleText() {
    const data = draft();
    return `${data.brief || ''}\n${data.supplement || ''}`;
  }

  function keywordTriggered(entry, sample) {
    if (entry.enabled === false) return false;
    if (entry.constant) return true;
    const text = String(sample || '').toLowerCase();
    return (entry.keys || []).some((key) => {
      const needle = String(key || '').trim().toLowerCase();
      return needle && text.includes(needle);
    });
  }

  function listedEntries() {
    const books = (root.TAUI.state.lib && root.TAUI.state.lib.worldBooks) || [];
    const preferred = draft().targetBookId && books.find((book) => book.id === draft().targetBookId && (book.entries || []).length);
    const working = preferred || books.find((book) => book.id === 'ai_book' && (book.entries || []).length);
    const source = working ? [working] : books;
    const rows = [];
    source.forEach((book) => {
      (book.entries || []).forEach((entry) => rows.push({
        comment: entryTitle(entry),
        keys: entry.keys || [],
        content: entry.content || '',
        constant: !!entry.constant,
        enabled: entry.enabled !== false,
        bookName: book.name || '',
      }));
    });
    return rows;
  }

  function splitEntries() {
    const data = draft();
    const sample = sampleText();
    const triggered = [];
    const idle = [];
    listedEntries().forEach((entry) => {
      const klass = data.classes && data.classes[entry.comment];
      const on = klass ? !!klass.triggered : keywordTriggered(entry, sample);
      const row = Object.assign({}, entry, { reason: klass ? klass.reason : '' });
      (on ? triggered : idle).push(row);
    });
    return { triggered, idle };
  }

  function applyCardParts(source, partIds, options) {
    const fresh = !options || options.fresh !== false;
    const data = fresh ? (root.TAUI.state.studio = emptyDraft()) : draft();
    const ids = !partIds || partIds.indexOf('all') !== -1 ? CARD_PARTS.map((part) => part.id) : partIds;
    ids.forEach((id) => {
      const part = CARD_PARTS.find((item) => item.id === id);
      if (!part || !part.field || !source) return;
      data.card[part.field] = source[part.field] != null ? String(source[part.field]) : '';
    });
    if (options && options.targetId) data.targetCardId = options.targetId;
    if (ids.indexOf('book') !== -1 && source && source.book) {
      let parsed = [];
      try {
        parsed = root.TAFormats.worldInfoToEntries(source.book.entries ? source.book : { entries: source.book });
      } catch (error) { parsed = []; }
      data.bookName = source.book.name || '';
      data.bookText = entriesToText(parsed);
    }
    importLive();
    return data;
  }

  async function classifyEntries(entries) {
    const data = draft();
    const normalized = (entries || []).map((entry) => ({
      comment: entryTitle(entry),
      keys: [...(entry.keys || entry['触发关键词'] || [])],
      content: entry.content || entry['正文'] || entry.body || '',
      constant: !!entry.constant,
      enabled: entry.enabled !== false,
    })).filter((entry) => entry.comment || entry.content);
    if (!(root.NIJANModel && root.NIJANModel.configured())) {
      data.classes = null;
      data.classNote = '还没连接模型。下面先按关键词分成触发和未触发。';
      return data;
    }
    const result = await root.NIJANModel.askJson(
      '把每一条世界书分成触发或未触发。不要改条目名。只回 JSON：{"entries":[{"条目名":"","触发":true,"理由":""}]}。',
      { request: sampleText(), entries: normalized.map((entry) => ({ 条目名: entry.comment, 触发关键词: entry.keys, 正文: entry.content, 恒定: entry.constant })) }
    );
    const classes = {};
    (result.entries || []).forEach((item) => {
      const name = entryTitle(item);
      if (!name) return;
      classes[name] = { triggered: item['触发'] === true || item.triggered === true, reason: String(item['理由'] || item.reason || '') };
    });
    normalized.forEach((entry) => {
      if (!classes[entry.comment]) classes[entry.comment] = { triggered: keywordTriggered(entry, sampleText()), reason: '' };
    });
    data.classes = classes;
    data.classNote = '模型已把条目分成触发的和未触发的。';
    return data;
  }

  async function importWorldEntries(entries, bookName) {
    const data = draft();
    const normalized = (entries || []).map((entry) => ({
      comment: entryTitle(entry),
      keys: [...(entry.keys || entry['触发关键词'] || [])],
      content: entry.content || entry['正文'] || entry.body || '',
      constant: !!entry.constant,
      enabled: entry.enabled !== false,
    })).filter((entry) => entry.comment || entry.content);
    data.bookName = bookName || data.bookName || '导入的世界书';
    data.bookText = entriesToText(normalized);
    importLive();
    await classifyEntries(normalized);
    return data;
  }

  async function rewriteEntries(instruction) {
    const entries = parseEntries(draft().bookText);
    const result = await root.NIJANModel.askJson(
      '按用户的要求修改这些条目。每条都要保留能看见的条目名，触发关键词和正文分开。只回 JSON：{"entries":[{"条目名":"","触发关键词":[],"正文":""}]}。',
      { instruction, entries: entries.map((entry) => ({ 条目名: entry.comment, 触发关键词: entry.keys, 正文: entry.content })) }
    );
    const next = (result.entries || []).map((entry) => ({
      comment: entryTitle(entry),
      keys: [].concat(entry['触发关键词'] || entry.keys || []),
      content: entry['正文'] || entry.content || '',
      constant: false,
      enabled: true,
    })).filter((entry) => entry.comment || entry.content);
    await importWorldEntries(next, draft().bookName);
    return draft();
  }

  function seal(name) {
    const glyph = String(name || '素').slice(0, 1);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#101820"/><text x="128" y="150" text-anchor="middle" font-size="84" fill="#d6ff3f" font-family="serif">${glyph}</text></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function ensure(list, id, make) {
    let item = list.find((entry) => entry.id === id);
    if (!item) {
      item = make();
      item.id = id;
      list.unshift(item);
    }
    return item;
  }

  function importLive() {
    if (!liveOn()) return;
    const ui = root.TAUI;
    const lib = ui.state.lib;
    const data = draft();
    const now = new Date().toISOString();
    if (!lib.settings) lib.settings = {};

    ['style', 'pov', 'bond', 'safe', 'format', 'r18', 'nsfw'].forEach((key) => {
      const section = lib.sections && lib.sections[key];
      const text = String(data.sections[key] || '').trim();
      if (!section || !text) return;
      if ((key === 'r18' || key === 'nsfw') && !adultAllowed()) return;
      section.custom = text;
      section.text = text;
      section.on = true;
    });

    const cardId = data.targetCardId || 'ai_card';
    const bookId = data.targetBookId || 'ai_book';
    const card = ensure(lib.characters, cardId, () => ({
      name: '新角色', description: '', personality: '', scenario: '', first_mes: '', mes_example: '',
      creator_notes: '', system_prompt: '', post_history_instructions: '', alternate_greetings: [], tags: ['AI'],
      creator: '', character_version: '1.0.0', talkativeness: 0.5, avatarAssetId: null, expressionAssetIds: [],
      createdAt: now,
    }));
    Object.assign(card, data.card, { updatedAt: now });
    ui.state.sel.character = card.id;

    const book = ensure(lib.worldBooks, bookId, () => ({ name: 'AI 世界书', description: '', entries: [] }));
    book.name = data.bookName || 'AI 世界书';
    book.entries = parseEntries(data.bookText).map((entry, index) => ({
      id: `ai_lore_${index}`, comment: entryTitle(entry) || '未命名', content: entry.content, keys: entry.keys,
      secondaryKeys: [], constant: false, selective: true, order: 100 - index, position: 'before_char',
      enabled: true, depth: 4, outletName: '',
    }));
    ui.state.sel.book = book.id;

    const preset = ensure(lib.promptPresets, 'ai_prompt', () => ({ name: 'AI 提示词', blocks: [] }));
    preset.name = data.promptName || 'AI 提示词';
    preset.blocks = linesOf(data.promptText).map((line, index) => {
      const [name, content] = splitPair(line);
      return { id: `ai_blk_${index}`, name: name || `块${index + 1}`, kind: 'system', role: 'system', enabled: true, content: content || name };
    });
    ui.state.sel.preset = preset.id;

    const group = ensure(lib.groups, 'ai_group', () => ({ name: 'AI 群', scenario: '', activation: 'natural', members: [] }));
    group.name = data.groupName || 'AI 群';
    group.scenario = data.groupScenario || '';
    group.members = [{ characterId: card.id, talkativeness: 0.5, enabled: true }];
    ui.state.sel.group = group.id;

    const chat = ensure(lib.chats, 'ai_chat', () => ({ name: 'AI 聊天', sourceName: '', userName: '我', characterName: card.name, bookmarks: [], messages: [] }));
    chat.name = data.chatName || 'AI 聊天';
    chat.characterName = card.name || chat.characterName;
    chat.messages = linesOf(data.chatText).map((line) => {
      const [name, mes] = splitPair(line);
      const speaker = name || '旁白';
      const mine = speaker === '我' || speaker === '用户';
      return { name: mine ? '我' : speaker, is_user: mine, is_system: false, mes: mes || name, send_date: now };
    });
    ui.state.sel.chat = chat.id;

    const picture = seal(data.assetName || '素');
    const asset = ensure(lib.assets, 'ai_asset', () => ({ name: 'AI 素材', kind: 'expression', dataUrl: picture, mime: 'image/svg+xml', bytes: picture.length, createdAt: now }));
    asset.name = data.assetName || 'AI 素材';
    asset.kind = data.assetKind || 'expression';
    asset.dataUrl = picture;
    asset.bytes = picture.length;
    ui.state.sel.asset = asset.id;

    const regex = ensure(lib.regexScripts, 'ai_regex', () => ({
      scriptName: 'AI 正则', findRegex: '', replaceString: '', trimStrings: [], placement: [2], disabled: false,
      markdownOnly: false, promptOnly: false, runOnEdit: false, substituteRegex: 0, minDepth: null, maxDepth: null,
    }));
    regex.scriptName = data.regexName || 'AI 正则';
    regex.findRegex = data.regexFind || '';
    regex.replaceString = data.regexReplace || '';
    ui.state.sel.regex = regex.id;

    const quick = ensure(lib.quickReplySets, 'ai_quick', () => ({ name: 'AI 快捷回复', replies: [] }));
    quick.name = data.quickName || 'AI 快捷回复';
    quick.replies = linesOf(data.quickText).map((line, index) => {
      const [label, message] = splitPair(line);
      return { id: `ai_qr_${index}`, label: label || `回复${index + 1}`, message: message || label, color: '#3dffe8', title: '' };
    });
    ui.state.sel.qr = quick.id;

    lib.timeline.notes = lib.timeline.notes.filter((item) => !String(item.id).startsWith('ai_note_'));
    lib.timeline.beats = lib.timeline.beats.filter((item) => !String(item.id).startsWith('ai_beat_'));
    linesOf(data.noteText).forEach((line, index) => {
      const [title, body] = splitPair(line);
      lib.timeline.notes.unshift({ id: `ai_note_${index}`, floor: index, title: title || `注${index + 1}`, body: body || title });
    });
    linesOf(data.beatText).forEach((line, index) => {
      const [title, summary] = splitPair(line);
      lib.timeline.beats.unshift({ id: `ai_beat_${index}`, order: index + 1, title: title || `情节${index + 1}`, summary: summary || title, floor: index });
    });

    lib.graph.nodes = lib.graph.nodes.filter((item) => !String(item.id).startsWith('ai_node_'));
    lib.graph.edges = lib.graph.edges.filter((item) => !String(item.id).startsWith('ai_edge_'));
    const nodeIds = {};
    linesOf(data.graphNodes).forEach((label, index) => {
      const id = `ai_node_${index}`;
      nodeIds[label] = id;
      lib.graph.nodes.push({ id, characterId: label === card.name ? card.id : null, label, x: 160 + (index % 3) * 180, y: 140 + Math.floor(index / 3) * 120 });
    });
    linesOf(data.graphEdges).forEach((line, index) => {
      const match = line.match(/^(.+?)\s*(?:->|→)\s*(.+?)\s*[:：]\s*(.*)$/);
      if (!match) return;
      const from = nodeIds[match[1].trim()];
      const to = nodeIds[match[2].trim()];
      if (!from || !to) return;
      lib.graph.edges.push({ id: `ai_edge_${index}`, from, to, label: match[3].trim() || '关系', note: '' });
    });

    const script = ensure(lib.scripts, 'ai_script', () => ({ name: 'AI 剧本', beats: [] }));
    script.name = data.scriptName || 'AI 剧本';
    script.beats = linesOf(data.scriptText).map((line, index) => {
      const [name, spoken] = splitPair(line);
      const known = lib.characters.find((item) => item.name === name);
      const speaker = name === '旁白' || !name ? 'narrator' : (known ? known.id : 'narrator');
      return { id: `ai_sb_${index}`, speaker, line: spoken || name, trigger: '' };
    });
    ui.state.sel.script = script.id;

    lib.settings.modelCheck = data.check || '';
    if (String(data.memoryHtml || '').trim()) lib.memoryHtml = data.memoryHtml;
    if (String(data.backupNote || '').trim()) lib.settings.backupNote = data.backupNote;
    ui.state.sel.checkChar = card.id;
    ui.state.sel.checkBook = book.id;
    ui.markDirty();
  }

  function contextForModel() {
    const data = draft();
    return {
      brief: data.brief,
      supplement: data.supplement || '',
      answers: data.questions.map((question, index) => ({ question, answer: data.answers[index] || '' })),
      accepted: data.ideas.filter((idea) => idea.status === 'yes').map((idea) => idea.text),
      rejected: data.ideas.filter((idea) => idea.status === 'no').map((idea) => idea.text),
      adult: adultAllowed(),
      style: root.NIJANModel && root.NIJANModel.writingGuide ? root.NIJANModel.writingGuide().style : '',
      replyCharacters: root.NIJANModel && root.NIJANModel.writingGuide ? root.NIJANModel.writingGuide().count : 600,
    };
  }

  function applyModel(payload) {
    const data = draft();
    const sections = payload.sections || {};
    Object.keys(data.sections).forEach((key) => { if (sections[key]) data.sections[key] = String(sections[key]); });
    const card = payload.character || {};
    Object.keys(data.card).forEach((key) => { if (card[key]) data.card[key] = String(card[key]); });
    const world = payload.world || {};
    if (world.name) data.bookName = world.name;
    if (Array.isArray(world.entries)) {
      data.bookText = world.entries.map((entry) => {
        const keys = entry['触发关键词'] || entry.keys || [];
        const body = entry['正文'] || entry.content || entry.body || '';
        return `条目名：${entryTitle(entry)}\n关键词：${[].concat(keys).join('，')}\n正文：${body}`;
      }).join('\n\n');
    }
    const prompt = payload.prompt || {};
    if (prompt.name) data.promptName = prompt.name;
    if (Array.isArray(prompt.blocks)) data.promptText = prompt.blocks.map((block) => `${block.name || '块'}：${block.content || ''}`).join('\n');
    const group = payload.group || {};
    if (group.name) data.groupName = group.name;
    if (group.scenario) data.groupScenario = group.scenario;
    const chat = payload.chat || {};
    if (chat.name) data.chatName = chat.name;
    if (Array.isArray(chat.lines)) data.chatText = chat.lines.join('\n');
    const asset = payload.asset || {};
    if (asset.name) data.assetName = asset.name;
    if (asset.kind) data.assetKind = asset.kind;
    if (asset.note) data.assetNote = asset.note;
    const regex = payload.regex || {};
    if (regex.scriptName) data.regexName = regex.scriptName;
    if (regex.findRegex) data.regexFind = regex.findRegex;
    if (regex.replaceString) data.regexReplace = regex.replaceString;
    const quick = payload.quick || {};
    if (quick.name) data.quickName = quick.name;
    if (Array.isArray(quick.replies)) data.quickText = quick.replies.join('\n');
    const timeline = payload.timeline || {};
    if (Array.isArray(timeline.notes)) data.noteText = timeline.notes.join('\n');
    if (Array.isArray(timeline.beats)) data.beatText = timeline.beats.join('\n');
    const graph = payload.graph || {};
    if (Array.isArray(graph.nodes)) data.graphNodes = graph.nodes.join('\n');
    if (Array.isArray(graph.edges)) data.graphEdges = graph.edges.join('\n');
    const script = payload.script || {};
    if (script.name) data.scriptName = script.name;
    if (Array.isArray(script.lines)) data.scriptText = script.lines.join('\n');
    if (payload.check) data.check = String(payload.check);
    const memory = payload.memory || {};
    if (memory.html) data.memoryHtml = String(memory.html);
    const backup = payload.backup || {};
    if (backup.note) data.backupNote = String(backup.note);
  }

  const WRITE_TASK = '根据用户的要求、回答和已接受的灵感，写出可导入酒馆工坊各栏的 JSON。键为 sections, character, world, prompt, group, chat, asset, regex, quick, timeline, graph, script, check, memory, backup。world.entries 用条目名、触发关键词、正文。memory 用 {"html":"..."}，backup 用 {"note":"..."}。没把握时只回 {"unsure":true,"question":"..."}。不要先写固定问卷。';

  function render(stage) {
    const ui = root.TAUI;
    const data = draft();
    persistDraft();
    const esc = ui.esc;
    const area = (label, path, value, rows) => `<label class="field"><span class="field-label">${esc(label)}</span><textarea data-path="${path}" rows="${rows || 4}">${esc(value || '')}</textarea></label>`;
    const text = (label, path, value) => `<label class="field"><span class="field-label">${esc(label)}</span><input data-path="${path}" type="text" value="${esc(value || '')}"></label>`;
    const ideas = data.ideas.length
      ? data.ideas.map((idea, index) => `<div class="idea check-item${idea.status === 'yes' ? ' checked' : ''}"><span class="tick" aria-hidden="true"></span><p>${esc(idea.text)}</p><div class="row"><button type="button" class="btn btn-small" data-yes="${index}">接受</button><button type="button" class="btn btn-small" data-no="${index}">拒绝</button><span class="muted">${idea.status === 'yes' ? '已接受' : idea.status === 'no' ? '已拒绝' : '未决定'}</span></div></div>`).join('')
      : '<p class="help">还没有灵感。先写下要求，再向模型要。</p>';
    const questions = data.questions.length
      ? data.questions.map((question, index) => `<label class="field"><span class="field-label">${esc(question)}</span><input data-path="answers.${index}" type="text" value="${esc(data.answers[index] || '')}"></label>`).join('')
      : '<p class="help">模型还没提问。点「先问再写」之后，这里只放它这次问出来的问题。</p>';
    stage.innerHTML = `<div class="studio">
      <section class="studio-compose">
        <article class="studio-col paper studio-request"><h3>要写的事</h3>${area('要求', 'brief', data.brief, 8)}<div class="row"><button type="button" class="btn" id="studio-ask">先问再写</button><button type="button" class="btn" id="studio-ideas">给我灵感</button><button type="button" class="btn btn-primary" id="studio-write">开始写</button></div><p class="help">接受或拒绝每一条灵感之后才写。填写栏只在模型写的时候展开。</p></article>
        <article class="studio-col paper"><h3>追问</h3>${questions}</article>
        <article class="studio-col paper"><h3>灵感</h3>${ideas}</article>
      </section>
      <section class="studio-start">
        <article class="paper" id="import-card">
          <h3>新开一稿</h3>
          <p class="help">带入已有角色卡的整张，或只勾选要留下的部分。没勾的留空，外貌只是其中一项。</p>
          <label class="field"><span class="field-label">库里的卡</span><select id="import-card-pick"><option value="">不从库里选</option>${(ui.state.lib.characters || []).map((item) => `<option value="${esc(item.id)}">${esc(item.name || '未命名')}</option>`).join('')}</select></label>
          <div class="row"><button type="button" class="btn" id="import-card-file">选择角色卡文件</button><span id="import-card-file-name" class="muted"></span></div>
          <label class="check"><input id="part-all" type="checkbox">整张卡</label>
          <div class="part-grid">${CARD_PARTS.map((part) => `<label class="check"><input data-part="${part.id}" type="checkbox">${part.label}</label>`).join('')}</div>
          <div class="row"><button type="button" class="btn btn-primary" id="import-card-go">用所选部分新开一稿</button><button type="button" class="btn" id="pass-card-hand">手工改这张卡</button><button type="button" class="btn" id="pass-card-model">让模型改这张卡</button></div>
        </article>
        <article class="paper" id="import-book">
          <h3>导入世界书</h3>
          <p class="help">导入后，模型给每条分类。条目名留在列表里。然后可以让模型改这些条目。</p>
          <label class="field"><span class="field-label">库里的书</span><select id="import-book-pick"><option value="">不从库里选</option>${(ui.state.lib.worldBooks || []).map((item) => `<option value="${esc(item.id)}">${esc(item.name || '未命名')}</option>`).join('')}</select></label>
          <div class="row"><button type="button" class="btn" id="import-book-file">选择世界书文件</button></div>
          <div class="row"><button type="button" class="btn btn-primary" id="import-book-go">导入并让模型分类</button><button type="button" class="btn" id="pass-book-hand">手工改这本书</button><button type="button" class="btn" id="pass-book-model">让模型改这本书</button></div>
          <label class="field"><span class="field-label">让模型改这些条目</span><textarea id="entry-edit" rows="3">${esc(data.entryEdit || '')}</textarea></label>
          <button type="button" class="btn" id="entry-rewrite">按这句话改条目</button>
        </article>
      </section>
      <section class="studio-live paper">
        <label class="field"><span class="field-label">写的时候补充</span><div class="row"><input id="studio-more" data-path="supplement" type="text" value="${esc(data.supplement || '')}" placeholder="任何补充都可以，不限外貌"><button type="button" class="btn" id="studio-send">发送补充</button></div><p class="help">模型正在写时，发送会让它停下并按这条重新想。写完之后仍可以再发，直到你满意。</p></label>
        <div class="studio-status"><span class="tide" id="studio-tide" style="--p:${Number(data.progressRatio) || 0}"></span><p id="studio-progress" class="studio-progress${data.writing ? '' : ' done'}">${esc(data.progress || '还没开始写。')}</p><span class="bell${!data.writing && Number(data.progressRatio) >= 1 ? ' on' : ''}" id="studio-bell" aria-hidden="true"></span></div>
        <p class="help studio-links"><a href="characters.html">角色卡工坊</a> · <a href="lore.html">世界书看板</a> · <a href="regex.html">正则</a> · <a href="quick.html">快捷回复</a> · <a href="timeline.html">作者注与时间线</a> · <a href="graph.html">角色关系图</a> · <a href="script.html">群聊剧本</a> · <a href="backup.html">整库备份</a> · <a href="memory.html">HTML 记忆</a></p>
      </section>
      <div id="studio-scan"></div>
      <section class="studio-results"${data.writing ? '' : ' hidden'}>
      <article class="studio-col paper"><h3>段落预设</h3>${area('文风', 'sections.style', data.sections.style, 3)}${area('人称和视角', 'sections.pov', data.sections.pov, 3)}${area('关系边界', 'sections.bond', data.sections.bond, 3)}${area('安全词', 'sections.safe', data.sections.safe, 2)}${area('输出格式', 'sections.format', data.sections.format, 2)}</article>
      <article class="studio-col paper"><h3>角色卡</h3>${text('名字', 'card.name', data.card.name)}${area('描述', 'card.description', data.card.description, 3)}${area('性格', 'card.personality', data.card.personality, 3)}${area('情景', 'card.scenario', data.card.scenario, 3)}${area('开场', 'card.first_mes', data.card.first_mes, 3)}${area('示例', 'card.mes_example', data.card.mes_example, 3)}${area('系统提示', 'card.system_prompt', data.card.system_prompt, 2)}</article>
      <article class="studio-col paper"><h3>世界书</h3>${text('书名', 'bookName', data.bookName)}${area('条目', 'bookText', data.bookText, 8)}<p class="help">一条一块。条目名、关键词、正文各占一行，条目之间空一行。</p></article>
      <article class="studio-col paper"><h3>提示词拼装</h3>${text('名称', 'promptName', data.promptName)}${area('块', 'promptText', data.promptText, 5)}<p class="help">一行一块：名称：内容</p></article>
      <article class="studio-col paper"><h3>群聊卡司</h3>${text('群名', 'groupName', data.groupName)}${area('情景', 'groupScenario', data.groupScenario, 4)}</article>
      <article class="studio-col paper"><h3>聊天阅览</h3>${text('标题', 'chatName', data.chatName)}${area('对白', 'chatText', data.chatText, 6)}<p class="help">一行一句：名字：话。自己说用「我：」。</p></article>
      <article class="studio-col paper"><h3>素材库</h3>${text('名称', 'assetName', data.assetName)}<label class="field"><span class="field-label">种类</span><select data-path="assetKind"><option value="expression"${data.assetKind === 'expression' ? ' selected' : ''}>表情</option><option value="avatar"${data.assetKind === 'avatar' ? ' selected' : ''}>头像</option><option value="background"${data.assetKind === 'background' ? ' selected' : ''}>背景</option></select></label>${area('说明', 'assetNote', data.assetNote, 3)}</article>
      <details class="studio-fold"><summary>正则</summary><article class="studio-col paper"><h3>正则</h3>${text('名称', 'regexName', data.regexName)}${text('查找', 'regexFind', data.regexFind)}${text('替换', 'regexReplace', data.regexReplace)}</article></details>
      <details class="studio-fold"><summary>快捷回复</summary><article class="studio-col paper"><h3>快捷回复</h3>${text('套名', 'quickName', data.quickName)}${area('回复', 'quickText', data.quickText, 5)}<p class="help">一行一条：标签：内容</p></article></details>
      <details class="studio-fold"><summary>作者注</summary><article class="studio-col paper"><h3>作者注与情景时间线</h3>${area('作者注', 'noteText', data.noteText, 4)}${area('情节', 'beatText', data.beatText, 4)}<p class="help">一行一条：标题：内容</p></article></details>
      <details class="studio-fold"><summary>关系图</summary><article class="studio-col paper"><h3>角色关系图</h3>${area('人物', 'graphNodes', data.graphNodes, 4)}${area('关系', 'graphEdges', data.graphEdges, 4)}<p class="help">人物一行一个。关系写成「甲 -> 乙：关系」。</p></article></details>
      <details class="studio-fold"><summary>剧本</summary><article class="studio-col paper"><h3>群聊剧本</h3>${text('剧本名', 'scriptName', data.scriptName)}${area('句子', 'scriptText', data.scriptText, 6)}<p class="help">一行一句：旁白：句子，或角色名：句子。</p></article></details>
      <details class="studio-fold"><summary>备份</summary><article class="studio-col paper"><h3>整库备份</h3>${area('备份说明', 'backupNote', data.backupNote, 4)}</article></details>
      <details class="studio-fold"><summary>HTML 记忆</summary><article class="studio-col paper"><h3>HTML 记忆</h3>${area('记忆 HTML', 'memoryHtml', data.memoryHtml, 6)}</article></details>
      <article class="studio-col paper"><h3>人设一致性检查</h3>${area('判断', 'check', data.check, 6)}<button type="button" class="btn" id="studio-judge">让模型看逻辑</button><p class="help">空字段和关键词仍在一致性页里查。这里是模型读完全稿后的判断。</p></article>
      </section>
    </div>`;
    const paintScan = () => {
      const host = stage.querySelector('#studio-scan');
      if (!host) return;
      const split = splitEntries();
      const card = (entry, checked) => `<article class="scan-entry check-item${checked ? ' checked' : ''}"><span class="tick" aria-hidden="true"></span><div><strong>${esc(entry.comment || '未命名')}</strong><p class="muted">${esc(entry.bookName || '')}${(entry.keys || []).length ? ` · ${ui.t('关键词')} ${esc(entry.keys.join('、'))}` : ''}</p><p>${esc(String(entry.content || '').replace(/\s+/g, ' ').slice(0, 80))}</p>${entry.reason ? `<p class="help">${esc(entry.reason)}</p>` : ''}</div></article>`;
      const column = (title, rows, checked) => `<article class="paper scan-col"><h3>${title}</h3>${rows.map((entry) => card(entry, checked)).join('') || '<p class="help">这里还没有。</p>'}</article>`;
      host.innerHTML = `${draft().classNote ? `<p class="help">${esc(draft().classNote)}</p>` : ''}<div class="studio-scan">${column('触发的', split.triggered, true)}${column('未触发的', split.idle, false)}</div>`;
    };
    paintScan();
    stage.querySelectorAll('[data-path]').forEach((node) => {
      const eventName = node.tagName === 'SELECT' ? 'change' : 'input';
      node.addEventListener(eventName, () => {
        setPath(draft(), node.dataset.path, node.value);
        persistDraft();
        importLive();
        if (node.dataset.path === 'brief' || node.dataset.path === 'supplement') paintScan();
      });
    });
    stage.querySelectorAll('[data-yes]').forEach((button) => {
      button.onclick = () => { draft().ideas[Number(button.dataset.yes)].status = 'yes'; render(stage); };
    });
    stage.querySelectorAll('[data-no]').forEach((button) => {
      button.onclick = () => { draft().ideas[Number(button.dataset.no)].status = 'no'; render(stage); };
    });
    const needModel = () => {
      if (root.NIJANModel && root.NIJANModel.configured()) return true;
      ui.toast('先在总览连接模型，并选一个。');
      return false;
    };
    stage.querySelector('#studio-ask').onclick = async () => {
      if (!needModel()) return;
      if (!draft().brief.trim()) { ui.toast('先写下要写的事'); return; }
      showProgress('正在追问…', true, 0.15);
      const job = startJob();
      try {
        const result = await root.NIJANModel.askJson('先不要写正文。只提出这次必须问清的问题，只回 JSON：{"questions":["..."]}。没有必要问就回空数组。不要使用套话问卷。', draft().brief, job.signal);
        if (jobGone(job)) return;
        draft().questions = Array.isArray(result.questions) ? result.questions.map(String) : [];
        draft().answers = draft().questions.map((_, index) => draft().answers[index] || '');
        showProgress('问完了', false, 1);
        render(stage);
      } catch (error) {
        if (stopped(error, job)) return;
        showProgress('追问停了', false, 0);
        ui.toast(error.message);
      }
    };
    stage.querySelector('#studio-ideas').onclick = async () => {
      if (!needModel()) return;
      showProgress('正在想灵感…', true, 0.2);
      const job = startJob();
      try {
        const result = await root.NIJANModel.askJson('给三条不同的写法灵感，先不要写完整文档。只回 JSON：{"ideas":["...","...","..."]}。', contextForModel(), job.signal);
        if (jobGone(job)) return;
        draft().ideas = (result.ideas || []).map((text) => ({ text: String(text), status: '' }));
        showProgress('灵感好了', false, 1);
        render(stage);
      } catch (error) {
        if (stopped(error, job)) return;
        showProgress('灵感停了', false, 0);
        ui.toast(error.message);
      }
    };
    const showProgress = (text, writing, ratio) => {
      draft().progress = text;
      draft().writing = writing;
      draft().progressRatio = ratio == null ? (writing ? 0.2 : 0) : ratio;
      persistDraft();
      const node = stage.querySelector('#studio-progress');
      if (node) {
        node.textContent = text;
        node.classList.toggle('done', !writing);
      }
      const tide = stage.querySelector('#studio-tide');
      if (tide) tide.style.setProperty('--p', String(draft().progressRatio));
      const bell = stage.querySelector('#studio-bell');
      if (bell) bell.classList.toggle('on', !writing && ratio >= 1);
      const results = stage.querySelector('.studio-results');
      if (results) results.hidden = !writing;
    };
    const readSupplement = () => {
      const input = stage.querySelector('#studio-more');
      if (input) draft().supplement = input.value;
      return String(draft().supplement || '').trim();
    };
    const reviseFromSupplement = async (job) => {
      const revision = await root.NIJANModel.askJson('用户补充了内容。停下正在做的事，按这条补充重写已有稿子，角色卡、世界书和其余工坊都要跟上。只回需要改的 JSON。', Object.assign(contextForModel(), { supplement: readSupplement() }), job.signal);
      if (jobGone(job)) return false;
      applyModel(revision || {});
      importLive();
      return true;
    };
    stage.querySelector('#studio-write').onclick = async () => {
      if (!needModel()) return;
      const ideas = draft().ideas;
      if (!ideas.length || ideas.some((idea) => !idea.status)) { ui.toast('先要灵感，并接受或拒绝每一条'); return; }
      showProgress('正在准备写入…', true, 0.08);
      if (ui.flyPlane) ui.flyPlane(stage.querySelector('#studio-write'));
      const allowed = await ui.ask({ title: '写入角色卡和世界书', body: '滑到尽头，模型才会写进角色卡和世界书。', actions: [{ id: 'no', label: '先不写' }], swipe: '滑开写入' });
      if (allowed !== 'yes') { showProgress('已停下', false, 0); return; }
      const steps = [
        ['正在写角色卡…', '只写 JSON 的 character 和 sections。把用户的补充写进对应字段。'],
        ['正在写世界书…', '只写 JSON 的 world。entries 里每条都要有条目名、触发关键词和正文，条目名不能空。把用户的补充写进去。'],
        ['正在写其余工坊…', '只写 JSON 的 prompt, group, chat, asset, regex, quick, timeline, graph, script, check, memory, backup。把用户的补充写进去。'],
      ];
      const job = startJob();
      try {
        let sent = '';
        for (let index = 0; index < steps.length; index += 1) {
          if (jobGone(job)) return;
          const [label, task] = steps[index];
          showProgress(label, true, (index + 1) / steps.length);
          const supplement = readSupplement();
          sent = supplement;
          let result = await root.NIJANModel.askJson(`${task} ${WRITE_TASK}`, Object.assign(contextForModel(), { supplement }), job.signal);
          if (jobGone(job)) return;
          if (result && result.unsure) {
            showProgress('模型停下来问了一句', true, draft().progressRatio);
            const answer = await ui.ask({ title: '先停一下', body: result.question || '这里我没把握。', actions: [{ id: 'yes', label: '按这个继续', kind: 'btn-primary' }, { id: 'no', label: '先不写' }] });
            if (jobGone(job)) return;
            if (answer !== 'yes') { showProgress('已停下', false, 0); return; }
            draft().answers.push(result.question || '');
            result = await root.NIJANModel.askJson(`${task} ${WRITE_TASK}`, Object.assign(contextForModel(), { supplement: readSupplement() }), job.signal);
            if (jobGone(job)) return;
          }
          applyModel(result || {});
          importLive();
        }
        const latest = readSupplement();
        if (latest && latest !== sent) {
          showProgress('正在按补充整理…', true, 0.9);
          if (!(await reviseFromSupplement(job))) return;
        }
        if (jobGone(job)) return;
        showProgress('写完了，并送进对应页面', false, 1);
        ui.toast(liveOn() ? '写完了，并送进对应页面' : '写完了。实时导入关着，所以还没送进工坊。');
        render(stage);
      } catch (error) {
        if (stopped(error, job)) return;
        showProgress(`没写完：${error.message || '模型没有返回'}`, false, 0);
        ui.toast(error.message);
      }
    };
    stage.querySelector('#studio-send').onclick = async () => {
      if (!needModel()) return;
      const note = readSupplement();
      if (!note) { ui.toast('先写下补充'); return; }
      showProgress('正在按补充整理…', true, Math.max(0.4, Number(draft().progressRatio) || 0.4));
      const job = startJob();
      try {
        if (!(await reviseFromSupplement(job))) return;
        showProgress('已按补充整理', false, 1);
        ui.toast('已按补充整理，并送进对应页面');
        render(stage);
      } catch (error) {
        if (stopped(error, job)) return;
        showProgress(`没整理完：${error.message || '模型没有返回'}`, false, 0);
        ui.toast(error.message);
      }
    };
    let pendingCard = null;
    let pendingBook = null;
    stage.querySelector('#part-all').onchange = (event) => {
      stage.querySelectorAll('[data-part]').forEach((box) => { box.checked = event.target.checked; });
    };
    ui.enhanceSelect(stage.querySelector('#import-card-pick'));
    ui.enhanceSelect(stage.querySelector('#import-book-pick'));
    stage.querySelector('#import-card-pick').onchange = (event) => {
      pendingCard = (ui.state.lib.characters || []).find((item) => item.id === event.target.value) || null;
    };
    stage.querySelector('#import-card-file').onclick = async () => {
      const file = await ui.pickFile('.json,.png,application/json,image/png');
      if (!file) return;
      try {
        const png = /png$/i.test(file.type) || /\.png$/i.test(file.name);
        if (png) {
          const raw = root.TAPng.readChara(new Uint8Array(await file.arrayBuffer()));
          if (!raw) throw new Error('这张 PNG 里没有角色卡');
          pendingCard = root.TAFormats.cardToCharacter(JSON.parse(raw));
        } else {
          pendingCard = root.TAFormats.cardToCharacter(JSON.parse(await file.text()));
        }
        stage.querySelector('#import-card-file-name').textContent = file.name;
      } catch (error) { ui.toast(error.message || '这张卡读不了'); }
    };
    const takeCard = (fresh) => {
      const picked = [...stage.querySelectorAll('[data-part]:checked')].map((box) => box.dataset.part);
      const parts = picked.length ? picked : ['all'];
      if (!pendingCard) { ui.toast('先选一张已有角色卡'); return false; }
      if (pendingCard.id) draft().targetCardId = pendingCard.id;
      applyCardParts(pendingCard, parts, { fresh, targetId: pendingCard.id || '' });
      return true;
    };
    stage.querySelector('#import-card-go').onclick = async () => {
      const picked = [...stage.querySelectorAll('[data-part]:checked')].map((box) => box.dataset.part);
      if (!pendingCard) { ui.toast('先选一张已有角色卡'); return; }
      if (!picked.length) { ui.toast('勾选整张卡，或勾选要留下的部分'); return; }
      draft().targetCardId = '';
      applyCardParts(pendingCard, picked, { fresh: true });
      if (picked.includes('book') && pendingCard.book) await importWorldEntries(parseEntries(draft().bookText), draft().bookName);
      ui.toast('已按勾选的部分新开一稿');
      render(stage);
    };
    stage.querySelector('#pass-card-hand').onclick = () => {
      showProgress('正在带入角色卡…', true, 0.3);
      if (!takeCard(false)) { showProgress('已停下', false, 0); return; }
      showProgress('已带入角色卡工坊，可以直接改', false, 1);
      ui.toast('已带入角色卡工坊，可以直接改填写栏');
      render(stage);
    };
    stage.querySelector('#pass-card-model').onclick = () => {
      showProgress('正在带入角色卡…', true, 0.3);
      if (!takeCard(false)) { showProgress('已停下', false, 0); return; }
      showProgress('已带入。写下补充或开始写', false, 0.35);
      ui.toast('已带入。写下补充或开始写，模型会改这张卡');
      render(stage);
    };
    stage.querySelector('#import-book-pick').onchange = (event) => {
      pendingBook = (ui.state.lib.worldBooks || []).find((item) => item.id === event.target.value) || null;
    };
    stage.querySelector('#import-book-file').onclick = async () => {
      const file = await ui.pickFile('.json,application/json');
      if (!file) return;
      try {
        pendingBook = { name: file.name.replace(/\.json$/i, ''), entries: root.TAFormats.worldInfoToEntries(JSON.parse(await file.text())) };
        ui.toast(`已读到「${pendingBook.name}」`);
      } catch (error) { ui.toast(error.message || '这本世界书读不了'); }
    };
    const takeBook = async (withModel, linkWorkbench) => {
      if (!pendingBook) { ui.toast('先选一本已有世界书'); return false; }
      showProgress(withModel ? '正在让模型看这本书…' : '正在带入世界书…', true, 0.35);
      draft().targetBookId = linkWorkbench && pendingBook.id ? pendingBook.id : '';
      if (withModel) await importWorldEntries(pendingBook.entries || [], pendingBook.name);
      else {
        draft().bookName = pendingBook.name || draft().bookName;
        draft().bookText = entriesToText((pendingBook.entries || []).map((entry) => ({
          comment: entryTitle(entry),
          keys: entry.keys || [],
          content: entry.content || '',
        })));
        importLive();
      }
      return true;
    };
    stage.querySelector('#import-book-go').onclick = async () => {
      try {
        if (!(await takeBook(true, false))) return;
        showProgress('条目已导入，并按模型分成触发和未触发', false, 1);
        ui.toast('条目已导入，并按模型分成触发和未触发');
        render(stage);
      } catch (error) { showProgress('分类没有完成', false, 0); ui.toast(error.message || '分类没有完成'); }
    };
    stage.querySelector('#pass-book-hand').onclick = async () => {
      try {
        if (!(await takeBook(false, true))) return;
        showProgress('已带入世界书看板，可以直接改', false, 1);
        ui.toast('已带入世界书看板，可以直接改');
        render(stage);
      } catch (error) { ui.toast(error.message); }
    };
    stage.querySelector('#pass-book-model').onclick = async () => {
      try {
        if (!(await takeBook(true, true))) return;
        showProgress('已带入。写下补充或开始写', false, 0.4);
        ui.toast('已带入。写下补充或开始写，模型会改这本书');
        render(stage);
      } catch (error) { showProgress('分类没有完成', false, 0); ui.toast(error.message || '分类没有完成'); }
    };
    stage.querySelector('#entry-edit').oninput = (event) => { draft().entryEdit = event.target.value; persistDraft(); };
    stage.querySelector('#entry-rewrite').onclick = async () => {
      if (!needModel()) return;
      const instruction = stage.querySelector('#entry-edit').value.trim();
      if (!instruction) { ui.toast('先写下要怎么改这些条目'); return; }
      if (!parseEntries(draft().bookText).length) { ui.toast('先导入一本世界书'); return; }
      showProgress('正在改条目…', true, 0.6);
      const job = startJob();
      try {
        const result = await root.NIJANModel.askJson(
          '按用户的要求修改这些条目。每条都要保留能看见的条目名，触发关键词和正文分开。只回 JSON：{"entries":[{"条目名":"","触发关键词":[],"正文":""}]}。',
          { instruction, entries: parseEntries(draft().bookText).map((entry) => ({ 条目名: entry.comment, 触发关键词: entry.keys, 正文: entry.content })) },
          job.signal
        );
        if (jobGone(job)) return;
        const next = (result.entries || []).map((entry) => ({
          comment: entryTitle(entry),
          keys: [].concat(entry['触发关键词'] || entry.keys || []),
          content: entry['正文'] || entry.content || '',
          constant: false,
          enabled: true,
        })).filter((entry) => entry.comment || entry.content);
        await importWorldEntries(next, draft().bookName);
        if (jobGone(job)) return;
        showProgress('条目改完了', false, 1);
        render(stage);
      } catch (error) {
        if (stopped(error, job)) return;
        showProgress(`没改完：${error.message || '模型没有返回'}`, false, 0);
        ui.toast(error.message);
      }
    };
    stage.querySelector('#studio-judge').onclick = async () => {
      if (!needModel()) return;
      showProgress('正在检查逻辑…', true, 0.45);
      const job = startJob();
      try {
        const result = await root.NIJANModel.askJson('对照角色卡和世界书做详细逻辑检查。每一条都要写出条目名和位置。只回 JSON：{"check":"...","items":[{"entry":"","place":"","detail":""}]}。', contextForModel(), job.signal);
        if (jobGone(job)) return;
        const lines = [String(result.check || '')].concat((result.items || []).map((item) => `${item.entry || '未命名'} · ${item.place || '未写位置'}：${item.detail || ''}`));
        draft().check = lines.filter(Boolean).join('\n');
        importLive();
        showProgress('逻辑检查写完了', false, 1);
        render(stage);
      } catch (error) {
        if (stopped(error, job)) return;
        showProgress('检查停了', false, 0);
        ui.toast(error.message);
      }
    };
  }

  root.NIJANStudio = { render, importLive, draft, entryTitle, applyCardParts, importWorldEntries, CARD_PARTS };
})(typeof globalThis !== 'undefined' ? globalThis : window);
