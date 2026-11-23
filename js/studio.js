/* AI creation. One small column per workshop. Edits import into that page. */
(function (root) {
  function emptyDraft() {
    return {
      brief: '',
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
    };
  }

  function draft() {
    const ui = root.TAUI;
    if (!ui.state.studio) ui.state.studio = emptyDraft();
    return ui.state.studio;
  }

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

  function parseEntries(text) {
    return String(text || '').split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean).map((block) => {
      const rows = block.split('\n');
      const comment = (rows.find((row) => /^条目名/.test(row)) || '').replace(/^条目名[:：]\s*/, '') || rows[0].replace(/^条目名[:：]\s*/, '');
      const keysRow = rows.find((row) => /^关键词|^触发/.test(row)) || '';
      const keys = keysRow.replace(/^(关键词|触发关键词)[:：]\s*/, '').split(/[,，]/).map((item) => item.trim()).filter(Boolean);
      const bodyIndex = rows.findIndex((row) => /^正文|^body/.test(row));
      const content = bodyIndex >= 0
        ? rows.slice(bodyIndex).join('\n').replace(/^(正文|body)[:：]\s*/, '').trim()
        : rows.filter((row) => !/^条目名|^关键词|^触发/.test(row)).slice(1).join('\n').trim();
      return { comment: comment.trim(), keys, content };
    }).filter((entry) => entry.comment || entry.content);
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

    const card = ensure(lib.characters, 'ai_card', () => ({
      name: '新角色', description: '', personality: '', scenario: '', first_mes: '', mes_example: '',
      creator_notes: '', system_prompt: '', post_history_instructions: '', alternate_greetings: [], tags: ['AI'],
      creator: '', character_version: '1.0.0', talkativeness: 0.5, avatarAssetId: null, expressionAssetIds: [],
      createdAt: now,
    }));
    Object.assign(card, data.card, { updatedAt: now });
    ui.state.sel.character = card.id;

    const book = ensure(lib.worldBooks, 'ai_book', () => ({ name: 'AI 世界书', description: '', entries: [] }));
    book.name = data.bookName || 'AI 世界书';
    book.entries = parseEntries(data.bookText).map((entry, index) => ({
      id: `ai_lore_${index}`, comment: entry.comment || '未命名', content: entry.content, keys: entry.keys,
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
    group.members = [{ characterId: 'ai_card', talkativeness: 0.5, enabled: true }];
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
      lib.graph.nodes.push({ id, characterId: label === card.name ? 'ai_card' : null, label, x: 160 + (index % 3) * 180, y: 140 + Math.floor(index / 3) * 120 });
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
    ui.state.sel.checkChar = 'ai_card';
    ui.state.sel.checkBook = 'ai_book';
    ui.markDirty();
  }

  function contextForModel() {
    const data = draft();
    return {
      brief: data.brief,
      answers: data.questions.map((question, index) => ({ question, answer: data.answers[index] || '' })),
      accepted: data.ideas.filter((idea) => idea.status === 'yes').map((idea) => idea.text),
      rejected: data.ideas.filter((idea) => idea.status === 'no').map((idea) => idea.text),
      adult: adultAllowed(),
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
        return `条目名：${entry['条目名'] || entry.comment || ''}\n关键词：${[].concat(keys).join('，')}\n正文：${entry['正文'] || entry.content || ''}`;
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
  }

  const WRITE_TASK = '根据用户的要求、回答和已接受的灵感，写出可导入酒馆工坊各栏的 JSON。键为 sections, character, world, prompt, group, chat, asset, regex, quick, timeline, graph, script, check。world.entries 用条目名、触发关键词、正文。没把握时只回 {"unsure":true,"question":"..."}。不要先写固定问卷。';

  function render(stage) {
    const ui = root.TAUI;
    const data = draft();
    const esc = ui.esc;
    const area = (label, path, value, rows) => `<label class="field"><span class="field-label">${esc(label)}</span><textarea data-path="${path}" rows="${rows || 4}">${esc(value || '')}</textarea></label>`;
    const text = (label, path, value) => `<label class="field"><span class="field-label">${esc(label)}</span><input data-path="${path}" type="text" value="${esc(value || '')}"></label>`;
    const ideas = data.ideas.length
      ? data.ideas.map((idea, index) => `<div class="idea"><p>${esc(idea.text)}</p><div class="row"><button type="button" class="btn btn-small" data-yes="${index}">接受</button><button type="button" class="btn btn-small" data-no="${index}">拒绝</button><span class="muted">${idea.status === 'yes' ? '已接受' : idea.status === 'no' ? '已拒绝' : '未决定'}</span></div></div>`).join('')
      : '<p class="help">还没有灵感。先写下要求，再向模型要。</p>';
    const questions = data.questions.length
      ? data.questions.map((question, index) => `<label class="field"><span class="field-label">${esc(question)}</span><input data-path="answers.${index}" type="text" value="${esc(data.answers[index] || '')}"></label>`).join('')
      : '<p class="help">模型还没提问。点「先问再写」之后，这里只放它这次问出来的问题。</p>';
    stage.innerHTML = `<div class="studio-grid">
      <article class="studio-col paper"><h3>要写的事</h3>${area('要求', 'brief', data.brief, 5)}<div class="row"><button type="button" class="btn" id="studio-ask">先问再写</button><button type="button" class="btn" id="studio-ideas">给我灵感</button><button type="button" class="btn btn-primary" id="studio-write">开始写</button></div><p class="help">接受或拒绝每一条灵感之后才写。改下面任一栏，会送进对应的页面。</p></article>
      <article class="studio-col paper"><h3>追问</h3>${questions}</article>
      <article class="studio-col paper"><h3>灵感</h3>${ideas}</article>
      <article class="studio-col paper"><h3>段落预设</h3>${area('文风', 'sections.style', data.sections.style, 3)}${area('人称和视角', 'sections.pov', data.sections.pov, 3)}${area('关系边界', 'sections.bond', data.sections.bond, 3)}${area('安全词', 'sections.safe', data.sections.safe, 2)}${area('输出格式', 'sections.format', data.sections.format, 2)}</article>
      <article class="studio-col paper"><h3>角色卡</h3>${text('名字', 'card.name', data.card.name)}${area('描述', 'card.description', data.card.description, 3)}${area('性格', 'card.personality', data.card.personality, 3)}${area('情景', 'card.scenario', data.card.scenario, 3)}${area('开场', 'card.first_mes', data.card.first_mes, 3)}${area('示例', 'card.mes_example', data.card.mes_example, 3)}${area('系统提示', 'card.system_prompt', data.card.system_prompt, 2)}</article>
      <article class="studio-col paper"><h3>世界书</h3>${text('书名', 'bookName', data.bookName)}${area('条目', 'bookText', data.bookText, 8)}<p class="help">一条一块。条目名、关键词、正文各占一行，条目之间空一行。</p></article>
      <article class="studio-col paper"><h3>提示词拼装</h3>${text('名称', 'promptName', data.promptName)}${area('块', 'promptText', data.promptText, 5)}<p class="help">一行一块：名称：内容</p></article>
      <article class="studio-col paper"><h3>群聊卡司</h3>${text('群名', 'groupName', data.groupName)}${area('情景', 'groupScenario', data.groupScenario, 4)}</article>
      <article class="studio-col paper"><h3>聊天阅览</h3>${text('标题', 'chatName', data.chatName)}${area('对白', 'chatText', data.chatText, 6)}<p class="help">一行一句：名字：话。自己说用「我：」。</p></article>
      <article class="studio-col paper"><h3>素材库</h3>${text('名称', 'assetName', data.assetName)}<label class="field"><span class="field-label">种类</span><select data-path="assetKind"><option value="expression"${data.assetKind === 'expression' ? ' selected' : ''}>表情</option><option value="avatar"${data.assetKind === 'avatar' ? ' selected' : ''}>头像</option><option value="background"${data.assetKind === 'background' ? ' selected' : ''}>背景</option></select></label>${area('说明', 'assetNote', data.assetNote, 3)}</article>
      <article class="studio-col paper"><h3>正则</h3>${text('名称', 'regexName', data.regexName)}${text('查找', 'regexFind', data.regexFind)}${text('替换', 'regexReplace', data.regexReplace)}</article>
      <article class="studio-col paper"><h3>快捷回复</h3>${text('套名', 'quickName', data.quickName)}${area('回复', 'quickText', data.quickText, 5)}<p class="help">一行一条：标签：内容</p></article>
      <article class="studio-col paper"><h3>作者注与情景时间线</h3>${area('作者注', 'noteText', data.noteText, 4)}${area('情节', 'beatText', data.beatText, 4)}<p class="help">一行一条：标题：内容</p></article>
      <article class="studio-col paper"><h3>角色关系图</h3>${area('人物', 'graphNodes', data.graphNodes, 4)}${area('关系', 'graphEdges', data.graphEdges, 4)}<p class="help">人物一行一个。关系写成「甲 -> 乙：关系」。</p></article>
      <article class="studio-col paper"><h3>群聊剧本</h3>${text('剧本名', 'scriptName', data.scriptName)}${area('句子', 'scriptText', data.scriptText, 6)}<p class="help">一行一句：旁白：句子，或角色名：句子。</p></article>
      <article class="studio-col paper"><h3>人设一致性检查</h3>${area('判断', 'check', data.check, 6)}<button type="button" class="btn" id="studio-judge">让模型看逻辑</button><p class="help">空字段和关键词仍在一致性页里查。这里是模型读完全稿后的判断。</p></article>
    </div>`;
    stage.querySelectorAll('[data-path]').forEach((node) => {
      const eventName = node.tagName === 'SELECT' ? 'change' : 'input';
      node.addEventListener(eventName, () => {
        setPath(draft(), node.dataset.path, node.value);
        importLive();
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
      try {
        const result = await root.NIJANModel.askJson('先不要写正文。只提出这次必须问清的问题，只回 JSON：{"questions":["..."]}。没有必要问就回空数组。不要使用套话问卷。', draft().brief);
        draft().questions = Array.isArray(result.questions) ? result.questions.map(String) : [];
        draft().answers = draft().questions.map((_, index) => draft().answers[index] || '');
        render(stage);
      } catch (error) { ui.toast(error.message); }
    };
    stage.querySelector('#studio-ideas').onclick = async () => {
      if (!needModel()) return;
      try {
        const result = await root.NIJANModel.askJson('给三条不同的写法灵感，先不要写完整文档。只回 JSON：{"ideas":["...","...","..."]}。', contextForModel());
        draft().ideas = (result.ideas || []).map((text) => ({ text: String(text), status: '' }));
        render(stage);
      } catch (error) { ui.toast(error.message); }
    };
    stage.querySelector('#studio-write').onclick = async () => {
      if (!needModel()) return;
      const ideas = draft().ideas;
      if (!ideas.length || ideas.some((idea) => !idea.status)) { ui.toast('先要灵感，并接受或拒绝每一条'); return; }
      try {
        let result = await root.NIJANModel.askJson(WRITE_TASK, contextForModel());
        if (result && result.unsure) {
          const answer = await ui.ask({ title: '先停一下', body: result.question || '这里我没把握。', actions: [{ id: 'yes', label: '按这个继续', kind: 'btn-primary' }, { id: 'no', label: '先不写' }] });
          if (answer !== 'yes') return;
          draft().answers.push(result.question || '');
          result = await root.NIJANModel.askJson(WRITE_TASK, contextForModel());
        }
        applyModel(result || {});
        importLive();
        ui.toast(liveOn() ? '已写入各栏，并送进对应页面' : '已写在这一页。实时导入关着，所以还没送进工坊。');
        render(stage);
      } catch (error) { ui.toast(error.message); }
    };
    stage.querySelector('#studio-judge').onclick = async () => {
      if (!needModel()) return;
      try {
        const result = await root.NIJANModel.askJson('读这些稿子，判断逻辑是否前后一致。只回 JSON：{"check":"..."}。空字段和关键词重复不用你报。', contextForModel());
        draft().check = String(result.check || '');
        importLive();
        render(stage);
      } catch (error) { ui.toast(error.message); }
    };
  }

  root.NIJANStudio = { render, importLive, draft };
})(typeof globalThis !== 'undefined' ? globalThis : window);
