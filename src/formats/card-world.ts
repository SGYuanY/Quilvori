// The converter has no storage, file-system or UI dependencies. Unknown native
// metadata travels alongside the fields Quilvori edits.
type Fields = Record<string, unknown>;
type WorkId = string | number;
interface CardText {
  name: string; description: string; personality: string; scenario: string;
  first_mes: string; mes_example: string; creator_notes: string; system_prompt: string;
  post_history_instructions: string; creator: string; character_version: string | number;
  alternate_greetings: string[]; tags: string[];
}
interface LibraryCard extends Partial<CardText> {
  id?: WorkId; createdAt?: string; talkativeness?: number | string; source?: unknown;
  stMetadata?: {header?: Fields; extra?: Fields; extensions?: Fields};
}
interface LibraryEntry {
  id?: WorkId; stUid?: number; comment?: string; content?: string;
  keys?: string[]; secondaryKeys?: string[]; secondary_keys?: string[];
  constant?: boolean; selective?: boolean; enabled?: boolean; order?: number;
  position?: string; depth?: number; outletName?: string; selectiveLogic?: number;
  caseSensitive?: boolean | null; matchWholeWords?: boolean | null; category?: string;
  stSettings?: Fields; stEmbedded?: Fields; stExtensions?: Fields;
}
interface LibraryBook {
  id?: WorkId; name?: string; description?: string; entries?: LibraryEntry[]; source?: unknown;
  stBookFields?: Fields; stBookExtensions?: Fields; stOriginalData?: boolean;
}
interface WorldInfoEntry extends Fields {
  uid: number; key: string[]; keysecondary: string[]; content: string; comment: string;
  disable: boolean; order: number; position: number;
}
interface EmbeddedEntry extends Fields {
  id: number; keys: string[]; secondary_keys: string[]; content: string; comment: string;
  enabled: boolean; insertion_order: number; position: string; extensions: Fields;
}
interface EmbeddedBook extends Fields {
  name: string; description: string; entries: EmbeddedEntry[]; extensions: Fields;
}
interface WorldInfoBook extends Fields {
  entries: Record<string, WorldInfoEntry>; originalData?: EmbeddedBook;
}
interface NativeCard extends Fields {
  data: CardText & {extensions: Fields; character_book?: EmbeddedBook};
}
type ImportedCard = CardText & LibraryCard & {book: unknown};
type ImportedEntry = LibraryEntry & Required<Pick<LibraryEntry,
  'comment' | 'content' | 'keys' | 'secondaryKeys' | 'constant' | 'selective' |
  'enabled' | 'order' | 'position' | 'depth' | 'outletName' | 'selectiveLogic' |
  'caseSensitive' | 'matchWholeWords'>>;
type ImportedBook = LibraryBook & {name: string; description: string; entries: ImportedEntry[]};

function createCardWorldFormats(resourceSource: (value: unknown) => Fields | null) {
  function isRecord(value: unknown): value is Fields {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  function fields(value: unknown): Fields {
    return isRecord(value) ? value : {};
  }
  const POSITIONS = [
    { id: 'before_char', label: '角色之前', st: 0 },
    { id: 'after_char', label: '角色之后', st: 1 },
    { id: 'before_an', label: '作者注之上', st: 2 },
    { id: 'after_an', label: '作者注之下', st: 3 },
    { id: 'at_depth', label: '指定深度', st: 4 },
    { id: 'before_em', label: '示例之前', st: 5 },
    { id: 'after_em', label: '示例之后', st: 6 },
    { id: 'outlet', label: '出口', st: 7 },
  ] as const;

  function positionById(id: unknown) {
    return POSITIONS.find((item) => item.id === id) || POSITIONS[0];
  }

  function positionFromSt(value: unknown) {
    const found = POSITIONS.find(item => item.id === value || item.st === Number(value));
    return found?.id ?? 'before_char';
  }

  function asArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    if (typeof value === 'string') return value.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
    return [];
  }

  function otherFields(value: unknown, excluded: readonly string[]): Fields {
    const pairs = Object.entries(fields(value)).filter(([key]) =>
      !excluded.includes(key) && !['__proto__', 'constructor', 'prototype'].includes(key));
    // Clone JSON-compatible extension values across realms without sharing nested metadata.
    const copy: unknown = JSON.parse(JSON.stringify(Object.fromEntries(pairs)));
    return fields(copy);
  }
  const cardFields = ['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example',
    'creator_notes', 'system_prompt', 'post_history_instructions', 'alternate_greetings', 'tags', 'creator', 'character_version'];

  function signatureMetadata(card: LibraryCard) {
    const info = card.stMetadata || {};
    const header = { ...info.header };
    for (const key of ['spec', 'spec_version', 'create_date', 'talkativeness']) delete header[key];
    const extensions = { ...info.extensions };
    delete extensions.talkativeness;
    return Object.keys(header).length || Object.keys(info.extra || {}).length || Object.keys(extensions).length
      ? { stMetadata: { header, extra: info.extra || {}, extensions } } : {};
  }

  function characterToCard(character: LibraryCard, book?: LibraryBook | null): NativeCard {
    const talk = String(character.talkativeness ?? 0.5);
    const source = resourceSource(character.source);
    const original = character.stMetadata || {};
    const extensions = otherFields(original.extensions, ['quilvori_source']);
    const originalTalk = extensions.talkativeness ?? original.header?.talkativeness;
    const talkValue = originalTalk !== undefined && Number(originalTalk) === Number(talk) ? originalTalk : talk;
    const data: NativeCard['data'] = {
      ...original.extra,
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
      character_version: character.character_version ?? '',
      extensions: {
        fav: false,
        depth_prompt: { depth: 4, prompt: '', role: 'system' },
        ...extensions,
        talkativeness: talkValue,
        world: book ? (book.name || '') : (extensions.world ?? ''),
        ...(source ? { quilvori_source: source } : {}),
      },
    };
    if (Array.isArray(book?.entries)) data.character_book = bookToCharacterBook(book);
    return {
      ...original.header,
      name: data.name,
      description: data.description,
      personality: data.personality,
      scenario: data.scenario,
      first_mes: data.first_mes,
      mes_example: data.mes_example,
      creatorcomment: data.creator_notes,
      avatar: original.header?.avatar ?? 'none',
      chat: original.header?.chat ?? '',
      talkativeness: original.header?.talkativeness !== undefined && Number(original.header.talkativeness) === Number(talk) ? original.header.talkativeness : talkValue,
      fav: original.header?.fav ?? extensions.fav ?? false,
      tags: data.tags,
      spec: original.header?.spec || 'chara_card_v2',
      spec_version: original.header?.spec_version || '2.0',
      data,
      create_date: original.header?.create_date ?? character.createdAt ?? '',
    };
  }

  function singleCard(input: unknown): unknown {
    if (!Array.isArray(input)) return input;
    if (input.length > 1) throw Object.assign(new Error('这个文件包含多张角色卡。请把每张卡分别导入。'), {code:'multiple-cards'});
    if (!input.length) throw new Error('这个文件不是角色卡。');
    return input[0];
  }
  function cardToCharacter(input: unknown): ImportedCard {
    const single = singleCard(input);
    if (!isRecord(single)) throw new Error('这个文件不是角色卡。');
    const wrapper = fields(single.character);
    const json = wrapper.data ? wrapper : single;
    const data = isRecord(json.data) ? json.data : json;
    const extensions = fields(data.extensions);
    const header = otherFields(json, [...cardFields, 'data', 'character_book', 'creatorcomment', 'extensions', 'source']);
    const extra = data === json ? {} : otherFields(data, [...cardFields, 'extensions', 'character_book']);
    const talk = Number(extensions.talkativeness ?? json.talkativeness ?? 0.5);
    const source = resourceSource(extensions.quilvori_source);
    function text(value: unknown): string {
      if (value == null) return '';
      if (typeof value !== 'string') throw new Error('这个文件不是角色卡。');
      return value;
    }
    const greetings: unknown = data.alternate_greetings ?? [];
    if (!Array.isArray(greetings) || !greetings.every((item: unknown) => typeof item === 'string')) {
      throw new Error('这个文件不是角色卡。');
    }
    return {
      name: text(data.name ?? json.name),
      description: text(data.description ?? json.description),
      personality: text(data.personality ?? json.personality),
      scenario: text(data.scenario ?? json.scenario),
      first_mes: text(data.first_mes ?? json.first_mes),
      mes_example: text(data.mes_example ?? json.mes_example),
      creator_notes: text(data.creator_notes ?? json.creatorcomment ?? json.creator_notes),
      system_prompt: text(data.system_prompt),
      post_history_instructions: text(data.post_history_instructions),
      alternate_greetings: [...greetings],
      tags: asArray(data.tags || json.tags || []),
      creator: text(data.creator ?? json.creator),
      character_version: typeof data.character_version === 'number' && Number.isFinite(data.character_version)
        ? data.character_version : text(data.character_version),
      talkativeness: Number.isFinite(talk) ? talk : 0.5,
      stMetadata: { header, extra, extensions: otherFields(extensions, ['quilvori_source']) },
      book: data.character_book || null,
      ...(source ? { source } : {}),
    };
  }

  const stExtensionNames: Readonly<Record<string, string>> = {
    scanDepth: 'scan_depth', caseSensitive: 'case_sensitive', matchWholeWords: 'match_whole_words',
    excludeRecursion: 'exclude_recursion', preventRecursion: 'prevent_recursion',
    delayUntilRecursion: 'delay_until_recursion', ignoreBudget: 'ignore_budget',
    displayIndex: 'display_index', outletName: 'outlet_name', role: 'role',
    probability: 'probability', useProbability: 'useProbability', group: 'group',
    groupWeight: 'group_weight', groupOverride: 'group_override', sticky: 'sticky',
    cooldown: 'cooldown', delay: 'delay', automationId: 'automation_id', vectorized: 'vectorized',
    triggers:'triggers',useGroupScoring:'use_group_scoring',matchPersonaDescription:'match_persona_description',
    matchCharacterDescription:'match_character_description',matchCharacterPersonality:'match_character_personality',
    matchCharacterDepthPrompt:'match_character_depth_prompt',matchScenario:'match_scenario',matchCreatorNotes:'match_creator_notes',
  };
  function entryNumbers(entries: readonly Pick<LibraryEntry, 'stUid'>[]): number[] {
    const reserved = new Set(entries.map(entry => entry.stUid).filter(Number.isSafeInteger));
    const used = new Set<number>();
    let next = 0;
    return entries.map(entry => {
      if (entry.stUid != null && Number.isSafeInteger(entry.stUid) && entry.stUid >= 0 && !used.has(entry.stUid)) {
        used.add(entry.stUid);
        return entry.stUid;
      }
      while (reserved.has(next) || used.has(next)) next++;
      used.add(next);
      return next++;
    });
  }
  function bookToWorldInfo(book: LibraryBook): WorldInfoBook {
    const entries: Record<string, WorldInfoEntry> = {};
    const ids = entryNumbers(book.entries || []);
    (book.entries || []).forEach((entry, index) => {
      const position = positionById(entry.position);
      entries[String(ids[index])] = {
        uid: ids[index]!,
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
        ...entry.stSettings,
        ...((entry.stExtensions || entry.category) ? { extensions: { ...entry.stExtensions, ...(entry.category ? { realmweave_category: entry.category } : {}) } } : {}),
      };
    });
    const source = resourceSource(book.source);
    return { ...book.stBookFields, ...(book.name ? {name:book.name} : {}), ...(book.description ? {description:book.description} : {}), entries, ...(book.stOriginalData ? {originalData:bookToCharacterBook(book)} : {}), ...((book.stBookExtensions || source) ? { extensions: { ...book.stBookExtensions, ...(source ? { quilvori_source: source } : {}) } } : {}) };
  }

  function nextEntryUid(entries: readonly LibraryEntry[]): number {
    return entryNumbers([...entries, {}])[entries.length]!;
  }

  function bookToCharacterBook(book: LibraryBook): EmbeddedBook {
    const ids = entryNumbers(book.entries || []);
    const source = resourceSource(book.source);
    return {
      name: book.name || '',
      description: book.description || '',
      scan_depth: 2,
      token_budget: 512,
      recursive_scanning: false,
      ...book.stBookFields,
      extensions: { ...book.stBookExtensions, ...(source ? { quilvori_source: source } : {}) },
      entries: (book.entries || []).map((entry, index) => {
        const position = positionById(entry.position);
        return {
          id: ids[index]!,
          keys: [...(entry.keys || [])],
          secondary_keys: [...(entry.secondaryKeys || [])],
          comment: entry.comment || '',
          content: entry.content || '',
          constant: !!entry.constant,
          selective: !!entry.selective,
          insertion_order: Number(entry.order ?? 100),
          enabled: entry.enabled !== false,
          position: position.st === 0 ? 'before_char' : 'after_char',
          ...(entry.stEmbedded || {}),
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
            ...entry.stExtensions,
            ...Object.fromEntries(Object.entries(entry.stSettings || {}).flatMap(([key,val]) => {
              const alias = stExtensionNames[key];
              return alias ? [[alias, val]] : [];
            })),
            ...(entry.caseSensitive != null ? { case_sensitive: entry.caseSensitive } : {}),
            ...(entry.matchWholeWords != null ? { match_whole_words: entry.matchWholeWords } : {}),
            ...(entry.category ? { realmweave_category: entry.category } : {}),
          },
        };
      }),
    };
  }

  function parseMaybeJson(value: unknown): unknown {
    if (value && typeof value === 'object') return value;
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
    try { return JSON.parse(trimmed); } catch (error) { return null; }
  }

  function looksLikeEntry(obj: unknown): obj is Fields {
    return isRecord(obj) && ['条目名','触发关键词','正文','body','comment','content','key','keys'].some(key=>Object.hasOwn(obj,key));
  }

  function unwrapEntry(entry: Fields): Fields {
    const blob = parseMaybeJson(entry.content ?? entry.body ?? entry['正文']);
    if (!looksLikeEntry(blob)) return entry;
    const keys = entry['触发关键词'] || entry.key || entry.keys;
    const hasKeys = Array.isArray(keys) ? keys.length : !!keys;
    return Object.assign({}, entry, {
      comment: entry.comment || entry['条目名'] || blob['条目名'] || blob.comment || blob.name || '',
      content: blob['正文'] ?? blob.body ?? blob.content ?? '',
      key: hasKeys ? keys : (blob['触发关键词'] || blob.key || blob.keys || []),
      keys: hasKeys ? keys : (blob['触发关键词'] || blob.keys || blob.key || []),
    });
  }

  function invalidEntries(): Error {
    return Object.assign(new Error('世界书的条目列表包含无效数据。请检查原始文件。'), {code:'invalid-entries'});
  }
  function entryText(value: unknown): string {
    if (value == null) return '';
    if (typeof value !== 'string') throw invalidEntries();
    return value;
  }
  function optionalSwitch(value: unknown): boolean | null {
    if (value == null) return null;
    if (typeof value === 'boolean') return value;
    if (value === 0 || value === 'false' || value === '0') return false;
    if (value === 1 || value === 'true' || value === '1') return true;
    throw invalidEntries();
  }
  function entryNumber(value: unknown, fallback: number): number {
    if (value == null) return fallback;
    if (typeof value !== 'number' && typeof value !== 'string') throw invalidEntries();
    const number = Number(value);
    if (!Number.isFinite(number)) throw invalidEntries();
    return number;
  }
  function worldInfoToEntries(json: unknown, fromCharacterBook = false): ImportedEntry[] {
    if (!isRecord(json) && !Array.isArray(json)) throw new Error('世界书不是 JSON 对象');
    let source: unknown;
    if (Array.isArray(json)) source = json;
    else if (Object.hasOwn(json,'entries')) source = json.entries;
    else if (isRecord(json.data) && Object.hasOwn(json.data,'entries')) source = json.data.entries;
    else if (isRecord(json.character_book) && Object.hasOwn(json.character_book,'entries')) source = json.character_book.entries;
    else if (looksLikeEntry(json)) source = [json];
    else {
      // Older exports sometimes consist of an entry map with metadata alongside it.
      const rows = Object.entries(json).filter(([key,row])=>/^(0|[1-9]\d*)$/.test(key) || looksLikeEntry(row));
      if (rows.length) source = Object.fromEntries(rows);
    }
    if (source === undefined) throw new Error('找不到 entries');
    if (!isRecord(source) && !Array.isArray(source)) throw invalidEntries();
    const rows: [string, unknown][] = Object.entries(source);
    const standalone = isRecord(source) && rows.every(([key]) => /^(0|[1-9]\d*)$/.test(key));
    return rows.map(([key, raw]) => {
      if (!looksLikeEntry(raw)) throw invalidEntries();
      const embedded = !standalone && (fromCharacterBook || Object.hasOwn(raw,'insertion_order') || Object.hasOwn(raw,'secondary_keys'));
      // World Info and character-book content is authored text, even when it is valid JSON.
      // Only loose, generic imports use the legacy stringified-entry convention.
      const entry = standalone || embedded ? raw : unwrapEntry(raw);
      const nativeExtensions = fields(entry.extensions);
      const content = ((standalone || embedded) ? entry.content : undefined) ?? entry['正文'] ?? entry.body ?? entry.content ?? '';
      const extras = otherFields(entry, ['uid','id','comment','name','content','body','key','keys','keysecondary','secondary_keys','secondaryKeys','constant','selective','order','insertion_order','position','enabled','disable','depth','outletName','selectiveLogic','caseSensitive','matchWholeWords','category','extensions','条目名','触发关键词','正文']);
      const extensions = otherFields(nativeExtensions, ['position','depth','outlet_name','selectiveLogic','realmweave_category','case_sensitive','match_whole_words']);
      const settings = embedded ? {} : extras;
      for (const [key, alias] of Object.entries(stExtensionNames)) {
        if (!['caseSensitive', 'matchWholeWords', 'outletName'].includes(key) && nativeExtensions[alias] !== undefined && settings[key] === undefined) settings[key] = nativeExtensions[alias];
      }
      const sourceUid = entry.uid ?? (standalone ? key : entry.id);
      const uid = typeof sourceUid === 'string' && /^(0|[1-9]\d*)$/.test(sourceUid) ? Number(sourceUid) : sourceUid;
      return {
        ...(typeof uid === 'number' && Number.isSafeInteger(uid) ? { stUid: uid } : {}),
        ...(Object.keys(settings).length ? { stSettings: settings } : {}),
        ...(embedded && Object.keys(extras).length ? { stEmbedded: extras } : {}),
        ...(Object.keys(extensions).length ? { stExtensions: extensions } : {}),
        comment: entryText(((standalone || embedded) ? entry.comment : undefined) ?? (entry['条目名'] || entry.comment || entry.name)),
        content: typeof content === 'string' ? content : (content == null ? '' : JSON.stringify(content)),
        keys: asArray((standalone ? entry.key : embedded ? entry.keys : undefined) ?? (entry['触发关键词'] || entry.key || entry.keys || [])),
        secondaryKeys: asArray(entry.keysecondary || entry.secondary_keys || entry.secondaryKeys || []),
        constant: optionalSwitch(entry.constant) ?? false,
        selective: optionalSwitch(entry.selective) ?? false,
        order: entryNumber(entry.order ?? entry.insertion_order, 100),
        position: positionFromSt(standalone ? (entry.position ?? nativeExtensions.position) : (nativeExtensions.position ?? entry.position)),
        enabled: entry.disable !== undefined ? !optionalSwitch(entry.disable) : optionalSwitch(entry.enabled) ?? true,
        depth: entryNumber(entry.depth ?? nativeExtensions.depth, 4),
        outletName: entryText(entry.outletName ?? nativeExtensions.outlet_name),
        selectiveLogic: entryNumber(entry.selectiveLogic ?? nativeExtensions.selectiveLogic, 0),
        caseSensitive: optionalSwitch(entry.caseSensitive ?? nativeExtensions.case_sensitive),
        matchWholeWords: optionalSwitch(entry.matchWholeWords ?? nativeExtensions.match_whole_words),
        ...((entry.category || nativeExtensions.realmweave_category) ? { category: entryText(entry.category || nativeExtensions.realmweave_category) } : {}),
      };
    });
  }

  function worldInfoToBook(json: unknown, fallbackName = '', fromCharacterBook = false): ImportedBook {
    const first = Array.isArray(json) && json.length === 1 ? fields(json[0]) : {};
    const input = fields(first.data).character_book || fields(first.character).data ? first : json;
    const character = fields(fields(input).character);
    const wrappedInput = character.data ? character : input;
    const wrapped = fields(wrappedInput);
    const data = fields(wrapped.data);
    const embedded = data.character_book || wrapped.character_book;
    const file = embedded || (data.entries ? data : wrappedInput);
    const spec = fields(file);
    // A world-book envelope can keep metadata beside data.entries. Card metadata
    // must never be mistaken for the attribution of its embedded companion book.
    const source = resourceSource(fields(spec.extensions).quilvori_source)
      || (!embedded ? resourceSource(fields(wrapped.extensions).quilvori_source) : null);
    const candidate = fields(spec.originalData);
    const original = Array.isArray(candidate.entries) ? candidate : null;
    const entries = worldInfoToEntries(file,Boolean(embedded) || fromCharacterBook);
    if (original) {
      const companions = new Map(worldInfoToEntries(original,true).map((entry,index)=>[entry.stUid ?? index,entry]));
      for (const entry of entries) {
        const companion = entry.stUid === undefined ? undefined : companions.get(entry.stUid);
        if (!companion) continue;
        if (companion.stEmbedded) entry.stEmbedded = companion.stEmbedded;
        if (companion.stExtensions) entry.stExtensions = {...companion.stExtensions,...entry.stExtensions};
      }
    }
    return {
      name: typeof spec?.name === 'string' && spec.name.trim() ? spec.name : String(fallbackName || original?.name || ''),
      description: typeof spec?.description === 'string' ? spec.description : String(original?.description || ''),
      entries,
      ...(original ? {stOriginalData:true} : {}),
      ...(spec && !Array.isArray(spec) && spec.entries ? {
        stBookFields: {...otherFields(original, ['name','description','entries','extensions']), ...otherFields(spec, ['name','description','entries','extensions','originalData'])},
        stBookExtensions: otherFields({...fields(original?.extensions),...fields(spec.extensions)}, ['quilvori_source']),
      } : {}),
      ...(source ? { source } : {}),
    };
  }

  return {POSITIONS, positionById, positionFromSt, singleCard, signatureMetadata, characterToCard, cardToCharacter,
    bookToWorldInfo, bookToCharacterBook, worldInfoToBook, worldInfoToEntries, nextEntryUid, entryNumbers, otherFields};
}
