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

  function parseMaybeJson(value) {
    if (value && typeof value === 'object') return value;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
    try { return JSON.parse(trimmed); } catch (error) { return null; }
  }

  function looksLikeEntry(obj) {
    return !!(obj && typeof obj === 'object' && !Array.isArray(obj) && (
      obj['条目名'] || obj['触发关键词'] || obj['正文'] || obj.body || obj.comment || obj.content || obj.key || obj.keys
    ));
  }

  function unwrapEntry(entry) {
    const blob = parseMaybeJson(entry.content ?? entry.body ?? entry['正文']);
    if (!blob || typeof blob !== 'object' || Array.isArray(blob) || !looksLikeEntry(blob)) return entry;
    const keys = entry['触发关键词'] || entry.key || entry.keys;
    const hasKeys = Array.isArray(keys) ? keys.length : !!keys;
    return Object.assign({}, entry, {
      comment: entry.comment || entry['条目名'] || blob['条目名'] || blob.comment || blob.name || '',
      content: blob['正文'] ?? blob.body ?? blob.content ?? '',
      key: hasKeys ? keys : (blob['触发关键词'] || blob.key || blob.keys || []),
      keys: hasKeys ? keys : (blob['触发关键词'] || blob.keys || blob.key || []),
    });
  }

  function worldInfoToEntries(json) {
    if (!json || typeof json !== 'object') throw new Error('世界书不是 JSON 对象');
    let source = null;
    if (Array.isArray(json)) source = json;
    else if (json['条目名'] || json['触发关键词'] || ((json['正文'] || json.body) && !json.entries)) source = [json];
    else source = json.entries || (json.data && json.data.entries) || json.character_book?.entries;
    if (!source) {
      const values = Object.values(json).filter(looksLikeEntry);
      if (values.length) source = values;
    }
    if (!source) throw new Error('找不到 entries');
    const list = Array.isArray(source) ? source : Object.values(source);
    return list.filter(Boolean).map((raw) => {
      const entry = unwrapEntry(raw);
      const content = entry['正文'] ?? entry.body ?? entry.content ?? '';
      return {
        comment: entry['条目名'] || entry.comment || entry.name || '',
        content: typeof content === 'string' ? content : (content == null ? '' : JSON.stringify(content)),
        keys: asArray(entry['触发关键词'] || entry.key || entry.keys || []),
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
      };
    });
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
      `/* 霓笺主题「${theme.name || '未命名'}」`,
      '   SillyTavern 的自定义 CSS 选择器不同，把变量抄进你的主题后再改选择器。 */',
      ':root {',
      `  --bg: ${vars.bg || '#07090d'};`,
      `  --lacquer: ${vars.lacquer || '#0c1118'};`,
      `  --paper: ${vars.paper || '#101820'};`,
      `  --ink: ${vars.ink || '#e9fff8'};`,
      `  --accent: ${vars.accent || '#d6ff3f'};`,
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
      throw new Error('这不是霓笺的整库备份');
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

  const FLAG_TEXT = {
    g: '全局',
    i: '忽略大小写',
    m: '按行匹配',
    s: '点号含换行',
    u: 'Unicode',
    y: '从上次位置接着找',
  };

  const FLAG_DETAIL = {
    g: '全局。试一句时每一处都找，替换也逐处换。没有它就只动第一处。',
    i: '忽略大小写。大写和小写算同一个字。',
    m: '多行。^ 和 $ 按每一行的头尾算，不只是整段文字的头尾。',
    s: '点号含换行。没有它时，通配 . 碰不到换行。',
    u: '按 Unicode 处理。生僻字也算一个字符。',
    y: '粘连。从上次停下的位置接着找，中间不能跳过。',
  };

  function splitRegexInput(input) {
    const trimmed = String(input || '').trim();
    if (!trimmed) return { empty: true };
    if (trimmed.startsWith('/')) {
      let index = 1;
      let escaped = false;
      for (; index < trimmed.length; index += 1) {
        const ch = trimmed[index];
        if (escaped) { escaped = false; continue; }
        if (ch === '\\') { escaped = true; continue; }
        if (ch === '/') break;
      }
      if (index >= trimmed.length) return { error: '开头写了斜杠，却没有用来结束的斜杠。' };
      const source = trimmed.slice(1, index);
      const flags = trimmed.slice(index + 1);
      if (!source) return { error: '两条斜杠中间是空的，没有要查找的内容。' };
      if (!/^[gimsuy]*$/.test(flags)) return { error: '斜杠后面的标志只能是 g、i、m、s、u、y。' };
      const seen = new Set();
      for (const flag of flags) {
        if (seen.has(flag)) return { error: `标志「${flag}」写了两次。` };
        seen.add(flag);
      }
      return { source, flags, wrapped: true };
    }
    return { source: trimmed, flags: 'g', wrapped: false };
  }

  function explainRegExpError(message) {
    const text = String(message || '');
    if (/Nothing to repeat/i.test(text)) return '量词前面没有可重复的内容。';
    if (/Unterminated group/i.test(text)) return '有分组没有用右括号关上。';
    if (/Unmatched/i.test(text)) return '多了一个右括号。';
    if (/Unterminated character class/i.test(text)) return '字符类没有用 ] 关上。';
    if (/Range out of order/i.test(text)) return '字符类里的范围写反了，起点比终点大。';
    if (/Invalid escape/i.test(text)) return '有一处转义写得不完整。';
    if (/Invalid group/i.test(text)) return '分组的写法不认识。';
    if (/Invalid regular expression flags/i.test(text)) return '标志不合法。';
    if (/Incomplete quantifier/i.test(text)) return '花括号里的次数没有写完。';
    return '这则表达式编译不过。检查括号、方括号和量词是否成对。';
  }

  function walkRegex(source) {
    const groups = [];
    const steps = [];
    let index = 0;
    let capturing = 0;
    const fail = (message) => {
      const at = Math.min(index, source.length);
      const ch = source[at] || '结尾';
      const around = `${source.slice(Math.max(0, at - 8), at)}【${ch}】${source.slice(at + (source[at] ? 1 : 0), at + 9)}`;
      return { error: `第 ${at + 1} 个字符「${ch}」这里断了：${message} 上下文 ${around}`, groups, steps, reading: '' };
    };
    function push(text) { if (text) steps.push(text); }
    function readQuantifier() {
      const ch = source[index];
      if (ch !== '*' && ch !== '+' && ch !== '?' && ch !== '{') return { text: '' };
      if (ch === '{') {
        const matched = source.slice(index).match(/^\{(\d+)(,(\d+)?)?\}/);
        if (!matched) return { text: '' };
        index += matched[0].length;
        let text = !matched[2] ? `量词 {${matched[1]}}：紧挨着的上一项恰好重复 ${matched[1]} 次。` : matched[3] === undefined ? `量词 {${matched[1]},}：上一项至少 ${matched[1]} 次，默认尽量多。` : `量词 {${matched[1]},${matched[3]}}：上一项重复 ${matched[1]} 到 ${matched[3]} 次。`;
        if (source[index] === '?') { text += '后面的问号表示尽量少。'; index += 1; }
        return { text };
      }
      index += 1;
      const base = ch === '*' ? '量词 *：上一项可以零次或多次，默认尽量多。' : ch === '+' ? '量词 +：上一项至少一次，默认尽量多。' : '量词 ?：上一项可有可无，出现零次或一次。';
      let text = base;
      if (source[index] === '?') { text += '后面的问号表示尽量少，而不是尽量多。'; index += 1; }
      return { text };
    }
    function readEscape() {
      const startAt = index;
      index += 1;
      const name = source[index];
      if (!name) return fail('末尾有一个单独的反斜杠，它不知道要转义谁。');
      index += 1;
      const named = {
        d: '转义 \\d：一个数字。反斜杠让 d 不再是字面字母。',
        D: '转义 \\D：一个非数字。',
        w: '转义 \\w：一个单词字符（字母、数字或下划线）。',
        W: '转义 \\W：一个非单词字符。',
        s: '转义 \\s：一段空白，空格、换行、制表符都算。',
        S: '转义 \\S：一个非空白字符。',
        n: '转义 \\n：一个换行，不是字母 n。',
        t: '转义 \\t：一个制表符。',
        r: '转义 \\r：一个回车。',
        b: '转义 \\b：单词边界。它不吃字符，只卡在词和词的交界。',
        B: '转义 \\B：非单词边界。',
        f: '转义 \\f：换页符。',
      };
      if (named[name]) return { text: named[name] };
      if (/[1-9]/.test(name)) return { text: `转义 \\${name}：引用前面第 ${name} 个捕获组已经抓住的文字。` };
      if (name === 'k' && source[index] === '<') {
        const from = index + 1;
        const close = source.indexOf('>', from);
        if (close < 0) return fail('命名引用 \\k<名字> 没有写完。');
        const groupName = source.slice(from, close);
        index = close + 1;
        return { text: `转义 \\k<${groupName}>：引用名字叫「${groupName}」的捕获组。` };
      }
      return { text: `转义 \\${name}：这里只按字面匹配「${name}」。反斜杠取消了它本来的特殊含义。` };
    }
    function readClass() {
      index += 1;
      const negated = source[index] === '^';
      if (negated) index += 1;
      let body = '';
      while (index < source.length && source[index] !== ']') {
        if (source[index] === '\\') {
          const name = source[index + 1] || '';
          const named = { n: '换行', t: '制表符', r: '回车', d: '数字', D: '非数字', w: '单词', W: '非单词', s: '空白', S: '非空白' };
          body += named[name] || name || '反斜杠';
          index += name ? 2 : 1;
          continue;
        }
        body += source[index];
        index += 1;
      }
      if (source[index] !== ']') return fail('字符类开了方括号，却没有用 ] 关上。');
      index += 1;
      const shown = body || '空';
      return { text: negated
        ? `反义字符类 [^${shown}]：匹配一个不在这些字里的字符。方括号开头的 ^ 只表示“除外”，不是行首。`
        : `字符类 [${shown}]：匹配一个落在这些字里的字符。中间的连字符表示从起点到终点。` };
    }
    function readGroup() {
      index += 1;
      let kind = 'capture';
      let name = '';
      if (source[index] === '?') {
        index += 1;
        const mark = source[index];
        if (mark === ':') { kind = 'noncap'; index += 1; }
        else if (mark === '=') { kind = 'ahead'; index += 1; }
        else if (mark === '!') { kind = 'negAhead'; index += 1; }
        else if (mark === '<') {
          index += 1;
          if (source[index] === '=') { kind = 'behind'; index += 1; }
          else if (source[index] === '!') { kind = 'negBehind'; index += 1; }
          else {
            const from = index;
            while (index < source.length && source[index] !== '>') index += 1;
            if (source[index] !== '>') return fail('命名分组 (?<名字> 没有写完名字。');
            name = source.slice(from, index);
            if (!name) return fail('命名分组的名字是空的。');
            index += 1;
            kind = 'named';
          }
        } else return fail('问号开头的分组写不认识。');
      }
      let header = '不捕获分组 (?: )：只把里面几项绑在一起，不单独记成一组。';
      let groupNo = 0;
      if (kind === 'capture' || kind === 'named') {
        capturing += 1;
        groupNo = capturing;
        groups.push({ index: capturing, name });
        header = name
          ? `捕获组第 ${capturing} 组，名字「${name}」：括号里匹配到的文字会记下来。替换时可写 $${capturing}，也能用这个名字。`
          : `捕获组第 ${capturing} 组：括号里匹配到的文字会记下来。替换时写成 $${capturing}。`;
      } else if (kind === 'ahead') header = '正向先行 (?= )：要求后面接着括号里的内容，但这一段本身不占匹配结果。';
      else if (kind === 'negAhead') header = '负向先行 (?! )：要求后面不能接着括号里的内容，它自己不吃字符。';
      else if (kind === 'behind') header = '正向后行 (?<= )：要求前面已经是括号里的内容。';
      else if (kind === 'negBehind') header = '负向后行 (?<! )：要求前面不能是括号里的内容。';
      push(header);
      const inner = readSeq(')');
      if (inner.error) return inner;
      if (source[index] !== ')') return fail('有分组没有用右括号关上。');
      index += 1;
      push(groupNo ? `第 ${groupNo} 组到这里结束。` : '这个分组到这里结束。');
      return { text: '组', silent: true };
    }
    function readAtom() {
      const ch = source[index];
      if (ch === '\\') return readEscape();
      if (ch === '.') { index += 1; return { text: '通配 .：任意一个字符。没有 s 标志时，它碰不到换行。' }; }
      if (ch === '^') { index += 1; return { text: '锚点 ^：必须从一行开头匹配。它不吃掉字符。' }; }
      if (ch === '$') { index += 1; return { text: '锚点 $：必须碰到一行结尾。它不吃掉字符。' }; }
      if (ch === '[') return readClass();
      if (ch === '(') return readGroup();
      if (ch === '{') { index += 1; return { text: '字面「{」：这里的花括号不是次数，按左花括号原样匹配。' }; }
      let literal = '';
      while (index < source.length && !'\\.^$|[]()*+?{}'.includes(source[index])) {
        literal += source[index];
        index += 1;
      }
      if (!literal) return fail('这里有一个写不下去的符号。');
      return { text: `字面「${literal}」：按这些字原样匹配。点号、星号这类符号如果没被转义，才有特殊含义；这里没有。` };
    }
    function readSeq(stop) {
      let pieces = 0;
      let lastWasAlt = false;
      while (index < source.length && source[index] !== stop) {
        if (source[index] === '|') {
          if (!pieces || lastWasAlt) return fail('竖线 | 旁边少了要匹配的内容。');
          index += 1;
          push('或者 |：左边和右边只要有一边对上就算匹配。竖线自己不吃字符。');
          lastWasAlt = true;
          continue;
        }
        if ('*+?'.includes(source[index]) || (source[index] === '{' && /^\{\d/.test(source.slice(index)))) {
          return fail('量词前面没有可重复的内容。');
        }
        const atom = readAtom();
        if (atom.error) return atom;
        if (!atom.silent) push(atom.text);
        if (atom.text) { pieces += 1; lastWasAlt = false; }
        const quantifier = readQuantifier();
        if (quantifier.error) return quantifier;
        if (quantifier.text) push(quantifier.text);
      }
      if (lastWasAlt) return fail('竖线右边没有内容。');
      return { ok: true };
    }
    const seq = readSeq('');
    if (seq.error) return seq;
    if (index < source.length) return fail(source[index] === ')' ? '多了一个右括号，找不到配对的左括号。' : '表达式没有读完。');
    return { groups, steps, reading: steps.join(' '), error: '' };
  }

  function describeRegex(input) {
    const split = splitRegexInput(input);
    if (split.empty) return { ok: false, empty: true, error: '还没写查找表达式。', flags: '', flagText: '', groups: [], steps: [], reading: '', pattern: null };
    if (split.error) return { ok: false, empty: false, error: split.error, flags: '', flagText: '', groups: [], steps: [], reading: '', pattern: null };
    const walked = walkRegex(split.source);
    let pattern = null;
    let compileError = '';
    try {
      pattern = new RegExp(split.source, split.flags);
    } catch (error) {
      compileError = explainRegExpError(error.message);
    }
    const flagSteps = [];
    if (split.wrapped) {
      if (!split.flags) flagSteps.push('标志：结束斜杠后面是空的。只找第一处，并且区分大小写。');
      else [...split.flags].forEach((flag) => flagSteps.push(`标志 ${flag}：${FLAG_DETAIL[flag] || flag}`));
    } else flagSteps.push('写法：没有用斜杠包起来，所以按全局 g 查找，并且区分大小写。');
    const flagText = split.flags
      ? [...split.flags].map((flag) => FLAG_TEXT[flag] || flag).join('、') + (split.wrapped ? '' : '（没写斜杠，默认全局）')
      : '只找第一处';
    const steps = [...(walked.steps || []), ...flagSteps];
    if (walked.error || compileError) {
      return { ok: false, empty: false, error: walked.error || compileError, flags: split.flags, flagText, groups: walked.groups || [], steps, reading: steps.join(' '), pattern: null };
    }
    return { ok: true, empty: false, error: '', flags: split.flags, flagText, groups: walked.groups, reading: steps.join(' '), steps, pattern };
  }

  function regexTrial(input, sample, replacement) {
    const described = describeRegex(input);
    const text = String(sample ?? '');
    if (!described.ok) return Object.assign({ matches: [], replaced: '', unmatched: [], miss: false }, described);
    if (!text) return Object.assign({ matches: [], replaced: '', unmatched: [], miss: false }, described);
    const matches = [];
    try {
      const flags = described.pattern.flags.includes('g') ? described.pattern.flags : `${described.pattern.flags}g`;
      const globalPattern = new RegExp(described.pattern.source, flags);
      for (const match of text.matchAll(globalPattern)) {
        matches.push({
          text: match[0],
          index: match.index,
          groups: match.slice(1).map((item, groupIndex) => ({
            index: groupIndex + 1,
            name: described.groups[groupIndex]?.name || '',
            value: item === undefined ? '' : item,
          })),
        });
        if (matches.length >= 8) break;
      }
    } catch (error) {
      return Object.assign({ matches: [], replaced: '', unmatched: [], miss: false, error: explainRegExpError(error.message), ok: false }, described);
    }
    let replaced = '';
    try {
      replaced = text.replace(described.pattern, replacement || '');
    } catch (error) {
      return Object.assign({ matches, replaced: '', unmatched: [], miss: false, error: '替换式写不通。$ 后面要接组号，例如 $1。', ok: false }, described);
    }
    const unmatched = [];
    let cursor = 0;
    matches.forEach((match) => {
      const start = match.index;
      const end = start + match.text.length;
      if (start > cursor) unmatched.push(text.slice(cursor, start));
      cursor = Math.max(cursor, end || start);
      if (!match.text.length) cursor += 1;
    });
    if (cursor < text.length) unmatched.push(text.slice(cursor));
    return Object.assign({ matches, replaced, unmatched: unmatched.filter((part) => part.length), miss: matches.length === 0 }, described);
  }

  function t(key, vars) {
    return root.TAI18n ? root.TAI18n.t(key, vars) : key;
  }

  function clipWords(value, limit) {
    const clean = String(value || '').replace(/\s+/g, ' ').trim();
    if (!clean) return '';
    return clean.length > limit ? `${clean.slice(0, limit)}…` : clean;
  }

  function sameText(value) {
    return String(value || '').replace(/\s+/g, '').trim();
  }

  function pairConflict(left, right) {
    const notes = [];
    const burned = /烧毁|焚毁|烧成/;
    const safe = /并未烧毁|不曾烧毁|没有烧毁|并未被烧/;
    if ((burned.test(left) && safe.test(right)) || (burned.test(right) && safe.test(left))) notes.push('一边说烧毁，一边说没有烧毁');
    const ban = /不许[^。\n]{0,8}酒|不准[^。\n]{0,8}酒|禁止[^。\n]{0,8}酒|不能[^。\n]{0,8}酒|从不[^。\n]{0,8}酒|不饮酒|禁酒/;
    const drinks = /[饮喝干醉斟倒][^。！？\n]{0,8}酒|桂花酒|烈酒|酒杯|一饮而尽/;
    if (ban.test(left) && drinks.test(right) && !/[不没别禁]/.test(right)) notes.push('一边禁酒，一边在喝酒');
    if (ban.test(right) && drinks.test(left) && !/[不没别禁]/.test(left)) notes.push('一边禁酒，一边在喝酒');
    const negated = String(left || '').matchAll(/(?:从不|绝不会|不许|不准|禁止|不能)([^，。；、\n]{2,8})/g);
    for (const match of negated) {
      const phrase = match[1].replace(/(了|着|过|的)$/g, '');
      if (phrase.length < 2) continue;
      if (right.includes(phrase) && !/[不没别禁]/.test(right)) notes.push(`一边写「${match[0]}」，另一边却出现「${phrase}」`);
    }
    return [...new Set(notes)];
  }

  function explainCard(character) {
    const steps = [];
    const issues = [];
    const name = String(character.name || '').trim();
    const personality = String(character.personality || '').trim();
    const scenario = String(character.scenario || '').trim();
    const first = String(character.first_mes || '').trim();
    const example = String(character.mes_example || '').trim();
    const system = String(character.system_prompt || '').trim();
    const greetings = [...(character.alternate_greetings || [])].map((line) => String(line || '').trim()).filter(Boolean);
    steps.push(name ? t('card.name', { name }) : t('card.nameEmpty'));
    steps.push(personality ? t('card.personality', { text: clipWords(personality, 80) }) : t('card.personalityEmpty'));
    steps.push(scenario ? t('card.scenario', { text: clipWords(scenario, 80) }) : t('card.scenarioEmpty'));
    steps.push(first ? t('card.first', { text: clipWords(first, 80) }) : t('card.firstEmpty'));
    steps.push(greetings.length ? t('card.greetings', { count: greetings.length, text: clipWords(greetings[0], 60) }) : t('card.greetingsEmpty'));
    steps.push(example ? t('card.example', { text: clipWords(example, 80) }) : t('card.exampleEmpty'));
    steps.push(system ? t('card.system', { text: clipWords(system, 80) }) : t('card.systemEmpty'));
    const required = [['name', '名字', name], ['description', '描述', character.description], ['personality', '性格', personality], ['scenario', '情景', scenario], ['first_mes', '开场白', first]];
    required.forEach(([, label, value]) => {
      if (!String(value || '').trim()) issues.push({ where: label, text: t('card.issueEmpty', { where: label }).replace(`${label}：`, '') });
    });
    const seen = new Map();
    [[first, '开场白'], ...greetings.map((line, index) => [line, `备用开场第 ${index + 1} 条`])].forEach(([line, where]) => {
      const key = sameText(line);
      if (!key) return;
      if (seen.has(key)) issues.push({ where, text: t('card.issueRepeat', { where, other: seen.get(key) }).replace(`${where}：`, '') });
      else seen.set(key, where);
    });
    const canon = [personality, scenario].filter(Boolean).join('\n');
    const spokenParts = [[first, '开场白'], ...greetings.map((line, index) => [line, `备用开场第 ${index + 1} 条`])];
    const hair = /([黑白金银红棕褐青蓝灰墨紫])(?:色)?(?:长|短|及腰|微卷|蓬松)?发/g;
    const eyes = /([黑蓝金灰褐绿赤棕墨紫])(?:色)?(?:眼|瞳|眸)/g;
    if (canon) {
      const canonHair = new Set(collectAttr(canon, hair).map((item) => item.value));
      const canonEyes = new Set(collectAttr(canon, eyes).map((item) => item.value));
      spokenParts.forEach(([line, where]) => {
        if (!line) return;
        pairConflict(canon, line).forEach((note) => issues.push({ where, text: t('card.issueConflict', { where, note }).replace(`${where}：`, '') }));
        const spokenHair = collectAttr(line, hair);
        if (canonHair.size && spokenHair.length && spokenHair.every((item) => !canonHair.has(item.value))) {
          issues.push({ where, text: t('card.issueHair', { where, canon: [...canonHair].join('、'), spoken: spokenHair[0].value }).replace(`${where}：`, '') });
        }
        const spokenEyes = collectAttr(line, eyes);
        if (canonEyes.size && spokenEyes.length && spokenEyes.every((item) => !canonEyes.has(item.value))) {
          issues.push({ where, text: t('card.issueEyes', { where, canon: [...canonEyes].join('、'), spoken: spokenEyes[0].value }).replace(`${where}：`, '') });
        }
      });
    }
    return { steps, issues };
  }

  function explainBook(book) {
    const steps = [];
    const issues = [];
    const entries = book.entries || [];
    const placeOf = (entry) => (POSITIONS.find((item) => item.id === entry.position) || POSITIONS[0]).label;
    steps.push(t('book.lead', { name: book.name || '未命名', count: entries.length }));
    entries.forEach((entry, index) => {
      const name = entry.comment || `第 ${index + 1} 条`;
      const keys = (entry.keys || []).map((key) => String(key).trim()).filter(Boolean);
      const secondary = (entry.secondaryKeys || []).map((key) => String(key).trim()).filter(Boolean);
      const place = placeOf(entry);
      const order = Number(entry.order ?? 100);
      const meaning = clipWords(entry.content, 72);
      const meaningText = meaning ? t('book.means', { text: meaning }) : t('book.meansEmpty');
      const keysText = keys.length ? `「${keys.join('、')}」` : '（没写）';
      const secondaryText = secondary.length ? `「${secondary.join('、')}」` : '（没写）';
      if (entry.enabled === false) steps.push(t('book.off', { name, meaning: meaningText }));
      else if (entry.constant) steps.push(t('book.constant', { name, order, place, meaning: meaningText }));
      else if (entry.selective) steps.push(t('book.selective', { name, keys: keysText, secondary: secondaryText, order, place, meaning: meaningText }));
      else steps.push(t('book.keyed', { name, keys: keysText, order, place, meaning: meaningText }));
    });
    const contentSeen = new Map();
    entries.forEach((entry, index) => {
      const name = entry.comment || `第 ${index + 1} 条`;
      const keys = (entry.keys || []).map((key) => String(key).trim()).filter(Boolean);
      if (!entry.constant && !keys.length) issues.push({ where: `条目「${name}」`, text: t('book.issueEmptyKeys', { name }) });
      const content = sameText(entry.content);
      if (content) {
        if (contentSeen.has(content)) issues.push({ where: `条目「${name}」`, text: t('book.issueSame', { name, other: contentSeen.get(content) }) });
        else contentSeen.set(content, name);
      }
    });
    entries.forEach((entry, index) => {
      const name = entry.comment || `第 ${index + 1} 条`;
      const keys = (entry.keys || []).map((key) => String(key).trim()).filter(Boolean);
      entries.slice(index + 1).forEach((other, offset) => {
        const otherName = other.comment || `第 ${index + offset + 2} 条`;
        const otherKeys = (other.keys || []).map((key) => String(key).trim()).filter(Boolean);
        keys.forEach((key) => {
          otherKeys.forEach((otherKey) => {
            if (key === otherKey) issues.push({ where: `条目「${name}」`, text: t('book.issueDupKey', { name, other: otherName, key }) });
            else if (key !== otherKey && (key.includes(otherKey) || otherKey.includes(key))) {
              issues.push({ where: `条目「${name}」`, text: t('book.issueOverlap', { name, other: otherName, key, otherKey }) });
            }
          });
        });
      });
    });
    const orderSeen = new Map();
    entries.forEach((entry, index) => {
      if (entry.enabled === false) return;
      const name = entry.comment || `第 ${index + 1} 条`;
      const bucket = `${entry.position}|${Number(entry.order ?? 100)}`;
      if (orderSeen.has(bucket)) {
        issues.push({ where: `条目「${name}」`, text: t('book.issueOrder', { name, other: orderSeen.get(bucket), place: placeOf(entry), order: Number(entry.order ?? 100) }) });
      } else orderSeen.set(bucket, name);
    });
    const constants = entries.filter((entry) => entry.constant && entry.enabled !== false && String(entry.content || '').trim());
    constants.forEach((entry, index) => {
      const name = entry.comment || '恒定条目';
      constants.slice(index + 1).forEach((other) => {
        const otherName = other.comment || '另一条恒定条目';
        pairConflict(entry.content, other.content).forEach((note) => {
          issues.push({ where: `条目「${name}」`, text: t('book.issueContra', { name, other: otherName, note }) });
        });
      });
    });
    return { steps, issues };
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
    describeRegex,
    regexTrial,
    explainCard,
    explainBook,
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
