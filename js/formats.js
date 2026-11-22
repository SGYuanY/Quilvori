/* SillyTavern import/export shapes and the offline consistency check. */
(function (root) {
  const POSITIONS = [
    { id: 'before_char', label: '角色之前', st: 0 },
    { id: 'after_char', label: '角色之后', st: 1 },
    { id: 'before_an', label: '作者注之上', st: 2 },
    { id: 'after_an', label: '作者注之下', st: 3 },
    { id: 'at_depth', label: '指定深度', st: 4 },
    { id: 'before_em', label: '示例之前', st: 5 },
    { id: 'after_em', label: '示例之后', st: 6 },
    { id: 'outlet', label: '出口', st: 7 },
  ];

  const PLACEMENTS = [
    { id: 1, label: '用户输入' },
    { id: 2, label: 'AI 输出' },
    { id: 3, label: '斜杠命令' },
    { id: 5, label: '世界书' },
    { id: 6, label: '推理块' },
  ];

  const ACTIVATION = [
    { id: 'natural', label: '自然轮转', st: 0 },
    { id: 'list', label: '名单顺序', st: 1 },
    { id: 'manual', label: '手动点名', st: 2 },
    { id: 'pooled', label: '池中随机', st: 3 },
  ];

  function positionById(id) {
    return POSITIONS.find((item) => item.id === id) || POSITIONS[0];
  }

  function positionFromSt(value) {
    if (typeof value === 'string' && POSITIONS.some((item) => item.id === value)) return value;
    const found = POSITIONS.find((item) => item.st === Number(value));
    return found ? found.id : 'before_char';
  }

  function asArray(value) {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    if (typeof value === 'string') return value.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
    return [];
  }

  function characterToCard(character, book) {
    const talk = String(character.talkativeness ?? 0.5);
    const data = {
      name: character.name || '',
      description: character.description || '',
      personality: character.personality || '',
      scenario: character.scenario || '',
      first_mes: character.first_mes || '',
      mes_example: character.mes_example || '',
      creator_notes: character.creator_notes || '',
      system_prompt: character.system_prompt || '',
      post_history_instructions: character.post_history_instructions || '',
      alternate_greetings: [...(character.alternate_greetings || [])],
      tags: [...(character.tags || [])],
      creator: character.creator || '',
      character_version: character.character_version || '',
      extensions: {
        talkativeness: talk,
        fav: false,
        world: book ? (book.name || '') : '',
        depth_prompt: { depth: 4, prompt: '', role: 'system' },
      },
    };
    if (book && book.entries && book.entries.length) data.character_book = bookToCharacterBook(book);
    return {
      name: data.name,
      description: data.description,
      personality: data.personality,
      scenario: data.scenario,
      first_mes: data.first_mes,
      mes_example: data.mes_example,
      creatorcomment: data.creator_notes,
      avatar: 'none',
      chat: '',
      talkativeness: talk,
      fav: false,
      tags: data.tags,
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data,
      create_date: character.createdAt || '',
    };
  }

  function cardToCharacter(input) {
    let json = input;
    if (Array.isArray(json)) json = json[0];
    if (json && json.character && json.character.data) json = json.character;
    const data = (json && json.data && typeof json.data === 'object') ? json.data : (json || {});
    const extensions = data.extensions || {};
    return {
      name: data.name ?? json.name ?? '',
      description: data.description ?? json.description ?? '',
      personality: data.personality ?? json.personality ?? '',
      scenario: data.scenario ?? json.scenario ?? '',
      first_mes: data.first_mes ?? json.first_mes ?? '',
      mes_example: data.mes_example ?? json.mes_example ?? '',
      creator_notes: data.creator_notes ?? json.creatorcomment ?? json.creator_notes ?? '',
      system_prompt: data.system_prompt ?? '',
      post_history_instructions: data.post_history_instructions ?? '',
      alternate_greetings: [...(data.alternate_greetings || [])],
      tags: asArray(data.tags || json.tags || []),
      creator: data.creator ?? json.creator ?? '',
      character_version: data.character_version ?? '',
      talkativeness: Number(extensions.talkativeness ?? json.talkativeness ?? 0.5) || 0.5,
      book: data.character_book || null,
    };
  }

  function bookToWorldInfo(book) {
    const entries = {};
    (book.entries || []).forEach((entry, index) => {
      const position = positionById(entry.position);
      entries[String(index)] = {
        uid: index,
        key: [...(entry.keys || [])],
        keysecondary: [...(entry.secondaryKeys || entry.secondary_keys || [])],
        comment: entry.comment || '',
        content: entry.content || '',
        constant: !!entry.constant,
        selective: !!entry.selective,
        order: Number(entry.order ?? 100),
        position: position.st,
        disable: entry.enabled === false,
        displayIndex: index,
        addMemo: true,
        group: '',
        groupOverride: false,
        groupWeight: 100,
        sticky: 0,
        cooldown: 0,
        delay: 0,
        probability: 100,
        useProbability: true,
        depth: Number(entry.depth ?? 4),
        outletName: entry.outletName || '',
        excludeRecursion: false,
        preventRecursion: false,
        delayUntilRecursion: false,
        scanDepth: null,
        caseSensitive: entry.caseSensitive ?? null,
        matchWholeWords: entry.matchWholeWords ?? null,
        useGroupScoring: null,
        automationId: '',
        role: null,
        vectorized: false,
        selectiveLogic: Number(entry.selectiveLogic ?? 0),
        matchPersonaDescription: false,
        matchCharacterDescription: false,
        matchCharacterPersonality: false,
        matchScenario: false,
        matchCreatorNotes: false,
      };
    });
    return { entries };
  }

  function bookToCharacterBook(book) {
    return {
      name: book.name || '',
      description: book.description || '',
      scan_depth: 2,
      token_budget: 512,
      recursive_scanning: false,
      extensions: {},
      entries: (book.entries || []).map((entry, index) => {
        const position = positionById(entry.position);
        return {
          id: index,
          keys: [...(entry.keys || [])],
          secondary_keys: [...(entry.secondaryKeys || [])],
          comment: entry.comment || '',
          content: entry.content || '',
          constant: !!entry.constant,
          selective: !!entry.selective,
          insertion_order: Number(entry.order ?? 100),
          enabled: entry.enabled !== false,
          position: position.st === 0 ? 'before_char' : 'after_char',
          extensions: {
            position: position.st,
            depth: Number(entry.depth ?? 4),
            display_index: index,
            probability: 100,
            useProbability: true,
            selectiveLogic: Number(entry.selectiveLogic ?? 0),
            outlet_name: entry.outletName || '',
            exclude_recursion: false,
            prevent_recursion: false,
            delay_until_recursion: false,
          },
        };
      }),
    };
  }

  function worldInfoToEntries(json) {
    if (!json || typeof json !== 'object') throw new Error('世界书不是 JSON 对象');
    const source = json.entries || (json.data && json.data.entries) || json.character_book?.entries;
    if (!source) throw new Error('找不到 entries');
    const list = Array.isArray(source) ? source : Object.values(source);
    return list.filter(Boolean).map((entry) => ({
      comment: entry.comment || entry.name || '',
      content: entry.content || '',
      keys: asArray(entry.key || entry.keys || []),
      secondaryKeys: asArray(entry.keysecondary || entry.secondary_keys || entry.secondaryKeys || []),
      constant: !!entry.constant,
      selective: !!entry.selective,
      order: Number(entry.order ?? entry.insertion_order ?? 100),
      position: positionFromSt(entry.extensions?.position ?? entry.position),
      enabled: entry.disable !== undefined ? !entry.disable : entry.enabled !== false,
      depth: Number(entry.depth ?? entry.extensions?.depth ?? 4),
      outletName: entry.outletName || entry.extensions?.outlet_name || '',
      selectiveLogic: Number(entry.selectiveLogic ?? entry.extensions?.selectiveLogic ?? 0),
      caseSensitive: entry.caseSensitive ?? null,
      matchWholeWords: entry.matchWholeWords ?? null,
    }));
  }

  function blankRegex(partial) {
    return Object.assign({
      scriptName: '未命名脚本',
      findRegex: '',
      replaceString: '',
      trimStrings: [],
      placement: [2],
      disabled: false,
      markdownOnly: false,
      promptOnly: false,
      runOnEdit: false,
      substituteRegex: 0,
      minDepth: null,
      maxDepth: null,
    }, partial);
  }

  function regexToExport(scripts) {
    return (scripts || []).map((script) => blankRegex({
      id: script.id,
      scriptName: script.scriptName || '',
      findRegex: script.findRegex || '',
      replaceString: script.replaceString || '',
      trimStrings: [...(script.trimStrings || [])],
      placement: (script.placement && script.placement.length) ? script.placement.map(Number) : [2],
      disabled: !!script.disabled,
      markdownOnly: !!script.markdownOnly,
      promptOnly: !!script.promptOnly,
      runOnEdit: !!script.runOnEdit,
      substituteRegex: Number(script.substituteRegex ?? 0),
      minDepth: script.minDepth === '' || script.minDepth === undefined ? null : script.minDepth,
      maxDepth: script.maxDepth === '' || script.maxDepth === undefined ? null : script.maxDepth,
    }));
  }

  function regexFromImport(json) {
    const list = Array.isArray(json) ? json : (json.scripts || json.regex_scripts || json.data || []);
    if (!Array.isArray(list)) throw new Error('正则文件应是数组');
    return list.map((script) => blankRegex({
      scriptName: script.scriptName || script.name || '未命名脚本',
      findRegex: script.findRegex || '',
      replaceString: script.replaceString || '',
      trimStrings: [...(script.trimStrings || [])],
      placement: asNumberList(script.placement),
      disabled: !!script.disabled,
      markdownOnly: !!script.markdownOnly,
      promptOnly: !!script.promptOnly,
      runOnEdit: !!script.runOnEdit,
      substituteRegex: Number(script.substituteRegex ?? 0),
      minDepth: script.minDepth ?? null,
      maxDepth: script.maxDepth ?? null,
    }));
  }

  function asNumberList(value) {
    if (Array.isArray(value)) return value.map(Number).filter((item) => !Number.isNaN(item));
    if (value === undefined || value === null || value === '') return [2];
    return [Number(value)];
  }

  function regexFromString(input) {
    if (typeof input !== 'string' || !input.trim()) return null;
    const trimmed = input.trim();
    try {
      const wrapped = trimmed.match(/^\/([\s\S]+)\/([gimsuy]*)$/);
      if (wrapped) return new RegExp(wrapped[1], wrapped[2]);
      return new RegExp(trimmed, 'g');
    } catch (error) {
      return null;
    }
  }

  function qrToExport(set) {
    const list = set.replies || [];
    return {
      version: 2,
      name: set.name || '快捷回复',
      disableSend: false,
      placeBeforeInput: false,
      injectInput: false,
      color: list[0]?.color || '',
      onlyBorderColor: false,
      qrList: list.map((reply, index) => ({
        id: index + 1,
        showLabel: true,
        label: reply.label || '',
        title: reply.title || '',
        message: reply.message || '',
        contextList: [],
        preventAutoExecute: true,
        isHidden: false,
        executeOnStartup: false,
        executeOnUser: false,
        executeOnAi: false,
        executeOnChatChange: false,
        executeOnGroupMemberDraft: false,
        executeOnNewChat: false,
        executeBeforeGeneration: false,
        automationId: '',
        atelierColor: reply.color || '',
      })),
      idIndex: list.length + 1,
    };
  }

  function qrFromImport(json) {
    const source = json.qrList || json.replies || [];
    if (!Array.isArray(source)) throw new Error('快捷回复里没有 qrList');
    return {
      name: json.name || '导入的快捷回复',
      replies: source.map((reply) => ({
        label: reply.label || reply.title || '未命名',
        message: reply.message || reply.mes || '',
        color: reply.atelierColor || reply.color || '#c6a15a',
        title: reply.title || '',
      })),
    };
  }

  function presetToExport(preset) {
    const prompts = (preset.blocks || []).map((block, index) => ({
      identifier: block.id || `atelier_${index}`,
      name: block.name || '未命名块',
      role: block.role || 'system',
      content: block.content || '',
      system_prompt: (block.role || 'system') === 'system',
      marker: false,
      enabled: block.enabled !== false,
      injection_position: block.kind === 'author_note' ? 1 : 0,
      injection_depth: block.kind === 'author_note' ? 4 : 0,
      forbid_overrides: false,
      atelier_kind: block.kind || 'custom',
    }));
    return {
      format: 'tavern-atelier.prompt.v1',
      name: preset.name || '提示词预设',
      note: '这是可抄进 SillyTavern 预设编辑器的块，不是整份 API 预设。不要用它覆盖温度和模型。',
      prompts,
      prompt_order: [{
        character_id: 100001,
        order: prompts.map((prompt) => ({ identifier: prompt.identifier, enabled: prompt.enabled !== false })),
      }],
    };
  }

  function presetFromImport(json) {
    const prompts = json.prompts || json.blocks || [];
    if (!Array.isArray(prompts)) throw new Error('预设里没有 prompts');
    return {
      name: json.name || '导入的预设',
      blocks: prompts.filter((block) => block && block.marker !== true).map((block) => ({
        name: block.name || '未命名块',
        role: block.role || 'system',
        kind: block.atelier_kind || kindFromName(block.name),
        content: block.content || block.system_prompt || '',
        enabled: block.enabled !== false,
      })),
    };
  }

  function kindFromName(name) {
    const text = String(name || '').toLowerCase();
    if (text.includes('author') || String(name).includes('作者')) return 'author_note';
    if (text.includes('jail')) return 'jailbreak';
    if (text.includes('style') || String(name).includes('文风')) return 'style';
    return 'system';
  }

  function groupToExport(group, library) {
    const byId = new Map((library.characters || []).map((character) => [character.id, character]));
    return {
      format: 'tavern-atelier.group.v1',
      name: group.name || '未命名群聊',
      scenario: group.scenario || '',
      activation_strategy: (ACTIVATION.find((item) => item.id === group.activation) || ACTIVATION[0]).st,
      activation: group.activation || 'natural',
      generation_mode: 0,
      members: (group.members || []).map((member) => {
        const character = byId.get(member.characterId);
        return {
          name: character ? character.name : '缺失的角色',
          character_id: member.characterId,
          talkativeness: Number(member.talkativeness ?? 0.5),
          disabled: member.enabled === false,
        };
      }),
      note: 'SillyTavern 的群成员是头像文件名，没有通用的群 JSON 导入。请先导入角色卡，再按这份名单建群。话多程度对应角色卡 extensions.talkativeness。',
    };
  }

  function normalizeMessage(message) {
    const isUser = !!(message.is_user || message.isUser || message.role === 'user');
    return {
      name: message.name || (isUser ? '你' : '角色'),
      is_user: isUser,
      is_system: !!(message.is_system || message.role === 'system'),
      mes: message.mes ?? message.message ?? message.content ?? '',
      send_date: message.send_date || message.sendDate || '',
    };
  }

  function chatFromText(text, filename) {
    const trimmed = String(text || '').replace(/^\uFEFF/, '').trim();
    if (!trimmed) throw new Error('文件是空的');
    const baseName = String(filename || '导入的聊天').replace(/\.(jsonl|json|txt)$/i, '');
    const lines = trimmed.split(/\r?\n/).filter((line) => line.trim());
    const jsonl = lines.length > 1 && lines.every((line) => line.trim().startsWith('{'));
    let userName = '你';
    let characterName = '';
    let name = baseName;
    let messages = [];
    if (jsonl) {
      const objects = lines.map((line) => JSON.parse(line));
      let start = 0;
      const head = objects[0] || {};
      if (head.mes == null && (head.user_name || head.character_name || head.chat_metadata)) {
        userName = head.user_name || userName;
        characterName = head.character_name || '';
        start = 1;
      }
      messages = objects.slice(start).map(normalizeMessage);
    } else {
      const json = JSON.parse(trimmed);
      if (Array.isArray(json)) messages = json.map(normalizeMessage);
      else if (Array.isArray(json.messages)) {
        messages = json.messages.map(normalizeMessage);
        userName = json.user_name || json.userName || userName;
        characterName = json.character_name || json.characterName || '';
        name = json.name || name;
      } else if (json.mes || json.name) messages = [normalizeMessage(json)];
      else throw new Error('认不出的聊天格式');
    }
    messages = messages.filter((message) => message.mes || message.name);
    if (!characterName) {
      const first = messages.find((message) => !message.is_user && !message.is_system);
      characterName = first ? first.name : '角色';
    }
    return { name, userName, characterName, messages, bookmarks: [] };
  }

  function timelineToExport(library) {
    return {
      format: 'tavern-atelier.timeline.v1',
      notes: library.timeline?.notes || [],
      beats: library.timeline?.beats || [],
    };
  }

  function scriptToExport(script, library) {
    const byId = new Map((library.characters || []).map((character) => [character.id, character]));
    return {
      format: 'tavern-atelier.script.v1',
      name: script.name || '未命名剧本',
      beats: (script.beats || []).map((beat, index) => ({
        order: index + 1,
        speaker: beat.speaker === 'narrator' ? '旁白' : (byId.get(beat.speaker)?.name || '旁白'),
        speaker_id: beat.speaker,
        line: beat.line || '',
        trigger: beat.trigger || '',
      })),
    };
  }

  function graphToBook(graph, library) {
    const nodes = new Map((graph.nodes || []).map((node) => [node.id, node]));
    const byId = new Map((library.characters || []).map((character) => [character.id, character]));
    const labelOf = (id) => {
      const node = nodes.get(id);
      if (!node) return '未知';
      return (node.characterId && byId.get(node.characterId)?.name) || node.label || '未命名';
    };
    return {
      name: '关系图',
      description: '由角色关系图导出的世界书条目。',
      entries: (graph.edges || []).map((edge, index) => {
        const from = labelOf(edge.from);
        const to = labelOf(edge.to);
        return {
          comment: `关系：${from} → ${to}`,
          content: `${from}与${to}的关系是「${edge.label || '未名'}」。${edge.note || ''}`.trim(),
          keys: [...new Set([from, to].filter(Boolean))],
          secondaryKeys: edge.label ? [edge.label] : [],
          constant: false,
          selective: true,
          order: 200 + index,
          position: 'before_char',
          enabled: true,
          depth: 4,
        };
      }),
    };
  }

  function themeToExport(theme) {
    return {
      format: 'tavern-atelier.theme.v1',
      name: theme.name,
      vars: theme.vars,
      css: themeToCss(theme),
    };
  }

  function themeToCss(theme) {
    const vars = theme.vars || {};
    return [
      `/* 酒馆工坊主题「${theme.name || '未命名'}」`,
      '   SillyTavern 的自定义 CSS 选择器不同，把变量抄进你的主题后再改选择器。 */',
      ':root {',
      `  --bg: ${vars.bg || '#140e0a'};`,
      `  --lacquer: ${vars.lacquer || '#24180f'};`,
      `  --paper: ${vars.paper || '#f4e7d1'};`,
      `  --ink: ${vars.ink || '#1a120c'};`,
      `  --accent: ${vars.accent || '#c6a15a'};`,
      `  --font-scale: ${vars.fontScale || 1};`,
      `  --bubble-radius: ${vars.radius || 18}px;`,
      '}',
    ].join('\n');
  }

  function backupOf(library) {
    return {
      atelier: 'tavern-atelier',
      libraryVersion: 1,
      exportedAt: new Date().toISOString(),
      library,
    };
  }

  function backupLibrary(json) {
    if (!json || json.atelier !== 'tavern-atelier' || !json.library) {
      throw new Error('这不是酒馆工坊的整库备份');
    }
    return json.library;
  }

  function isHan(char) {
    return !!char && char >= '\u4e00' && char <= '\u9fff';
  }

  function levenshtein(a, b) {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
      let prev = i - 1;
      row[0] = i;
      for (let j = 1; j <= b.length; j += 1) {
        const temp = row[j];
        row[j] = a[i - 1] === b[j - 1] ? prev : Math.min(prev, row[j], row[j - 1]) + 1;
        prev = temp;
      }
    }
    return row[b.length];
  }

  function snippetAt(text, index, length) {
    const start = Math.max(0, index - 18);
    const end = Math.min(text.length, index + length + 18);
    const slice = text.slice(start, end).replace(/\s+/g, ' ');
    return `${start > 0 ? '…' : ''}${slice}${end < text.length ? '…' : ''}`;
  }

  function findNameTypos(text, name) {
    const hits = [];
    const size = name.length;
    if (size < 2 || size > 4) return hits;
    if (![...name].every(isHan)) return hits;
    for (let i = 0; i <= text.length - size; i += 1) {
      const word = text.slice(i, i + size);
      if (word === name || word[0] !== name[0]) continue;
      if (![...word].every(isHan)) continue;
      if (levenshtein(word, name) !== 1) continue;
      const prev = i === 0 ? '' : text[i - 1];
      const next = text[i + size] || '';
      const prevOk = !isHan(prev) || '对跟和与让把给向问叫是将由从被替'.includes(prev);
      const nextOk = !isHan(next) || '说道问答笑看望给让与和的把在将'.includes(next);
      if (prevOk && nextOk) hits.push({ word, index: i });
    }
    const unique = [];
    hits.forEach((hit) => {
      if (!unique.some((item) => item.word === hit.word)) unique.push(hit);
    });
    return unique;
  }

  function collectAttr(text, regex) {
    const found = [];
    const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
    const re = new RegExp(regex.source, flags);
    let match = re.exec(text);
    while (match) {
      found.push({ value: match[1], index: match.index, raw: match[0] });
      if (!re.global) break;
      match = re.exec(text);
    }
    return found;
  }

  function sentences(text) {
    return String(text || '').split(/(?<=[。！？\n])/).map((part) => part.trim()).filter(Boolean);
  }

  function checkConsistency(library, characterId, bookId) {
    const character = (library.characters || []).find((item) => item.id === characterId);
    if (!character) return [];
    const findings = [];
    const add = (severity, title, detail, snippet, highlight) => {
      findings.push({ severity, title, detail, snippet: snippet || '', highlight: highlight || '' });
    };
    const required = [
      ['name', '名字'],
      ['description', '描述'],
      ['personality', '性格'],
      ['scenario', '情景'],
      ['first_mes', '开场白'],
    ];
    required.forEach(([key, label]) => {
      if (!String(character[key] || '').trim()) {
        add('error', `缺少${label}`, 'SillyTavern 角色卡的基本字段是空的。', '', '');
      }
    });
    if (!(character.tags || []).length) add('info', '没有标签', '标签方便在酒馆里筛选，不写也能导入。', '', '');
    if (String(character.mes_example || '').trim() && !/{{char}}|{{user}}/.test(character.mes_example) && !character.mes_example.includes(character.name)) {
      add('warn', '对话示例没有 {{char}}', '示例里既没有角色名，也没有 {{char}} / {{user}}。', snippetAt(character.mes_example, 0, 24), '');
    }

    const spoken = [character.first_mes, character.scenario, ...(character.alternate_greetings || [])].filter(Boolean).join('\n');
    const canon = [character.description, character.personality].filter(Boolean).join('\n');
    (library.characters || []).map((item) => item.name).filter(Boolean).forEach((name) => {
      findNameTypos(spoken, name).forEach((hit) => {
        add('warn', '可能的名字笔误', `「${hit.word}」和「${name}」只差一个字，姓氏相同。`, snippetAt(spoken, hit.index, hit.word.length), hit.word);
      });
    });

    const hair = /([黑白金银红棕褐青蓝灰墨紫])(?:色)?(?:长|短|及腰|微卷|蓬松)?发/g;
    const eyes = /([黑蓝金灰褐绿赤棕墨紫])(?:色)?(?:的)?(?:眼|瞳|眸)/g;
    const canonHair = new Set(collectAttr(canon, hair).map((item) => item.value));
    const spokenHair = collectAttr(spoken, hair);
    if (canonHair.size && spokenHair.length && spokenHair.every((item) => !canonHair.has(item.value))) {
      add('warn', '发色对不上', `描述里是${[...canonHair].join('、')}发，正文写成了${spokenHair[0].value}发。`, snippetAt(spoken, spokenHair[0].index, spokenHair[0].raw.length), spokenHair[0].raw);
    }
    const canonEyes = new Set(collectAttr(canon, eyes).map((item) => item.value));
    const spokenEyes = collectAttr(spoken, eyes);
    if (canonEyes.size && spokenEyes.length && spokenEyes.every((item) => !canonEyes.has(item.value))) {
      add('warn', '瞳色对不上', `描述里是${[...canonEyes].join('、')}瞳，正文写成了${spokenEyes[0].value}。`, snippetAt(spoken, spokenEyes[0].index, spokenEyes[0].raw.length), spokenEyes[0].raw);
    }

    const books = bookId ? (library.worldBooks || []).filter((book) => book.id === bookId) : (library.worldBooks || []);
    books.forEach((book) => {
      (book.entries || []).filter((entry) => entry.constant && entry.enabled !== false).forEach((entry) => {
        const content = entry.content || '';
        sentences(spoken).forEach((sentence) => {
          if (/烧毁|焚毁|烧成/.test(sentence) && /并未烧毁|不曾烧毁|没有烧毁|并未被烧/.test(content)) {
            add('error', '楼还在，正文却写它毁了', `恒定条目「${entry.comment || '未命名'}」说没有烧毁。`, sentence, '烧毁');
          }
          const drinkBanned = /不许[^。\n]{0,8}酒|不准[^。\n]{0,8}酒|禁止[^。\n]{0,8}酒|不能[^。\n]{0,8}酒|从不[^。\n]{0,8}酒|不饮酒|禁酒/.test(content);
          const drinks = /[饮喝干醉斟倒][^。！？\n]{0,8}酒|桂花酒|烈酒|酒杯|一饮而尽/.test(sentence);
          if (drinkBanned && drinks && !/[不没别禁]/.test(sentence)) {
            add('error', '规矩不许饮酒，正文却在喝酒', `恒定条目「${entry.comment || '未命名'}」禁酒。`, sentence, '酒');
          }
        });
        const negated = content.matchAll(/(?:从不|绝不会|不许|不准|禁止|不能)([^，。；、\n]{2,8})/g);
        for (const match of negated) {
          const phrase = match[1].replace(/(了|着|过|的)$/g, '');
          if (phrase.length < 2) continue;
          const at = spoken.indexOf(phrase);
          if (at < 0) continue;
          const sentence = sentences(spoken).find((item) => item.includes(phrase)) || phrase;
          if (/[不没别禁]/.test(sentence)) continue;
          add('warn', '恒定条目被正文反过来说', `「${entry.comment || '条目'}」写着「${match[0]}」，正文却出现了「${phrase}」。`, sentence, phrase);
        }
      });
    });

    const seen = new Set();
    return findings.filter((item) => {
      const key = `${item.severity}|${item.title}|${item.snippet}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  root.TAFormats = {
    POSITIONS,
    PLACEMENTS,
    ACTIVATION,
    positionById,
    positionFromSt,
    characterToCard,
    cardToCharacter,
    bookToWorldInfo,
    bookToCharacterBook,
    worldInfoToEntries,
    regexToExport,
    regexFromImport,
    regexFromString,
    qrToExport,
    qrFromImport,
    presetToExport,
    presetFromImport,
    groupToExport,
    chatFromText,
    timelineToExport,
    scriptToExport,
    graphToBook,
    themeToExport,
    themeToCss,
    backupOf,
    backupLibrary,
    checkConsistency,
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
