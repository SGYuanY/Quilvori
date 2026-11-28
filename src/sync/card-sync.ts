// Compare the authored contents of a character card separately from its file, portrait and ST runtime identity.
(() => {
  type Json = null | boolean | number | string | Json[] | Obj;
  type Obj = { [key: string]: Json };
  type Slot = Json | undefined;
  type Book = Obj & { entries: Obj[] };
  type Side = 'local' | 'disk';
  type Variant = 'chara' | 'ccv3';
  type Variants = Partial<Record<Variant, Obj>>;
  interface CardFile {
    format: 'json' | 'png'; bytes: Uint8Array; document: Obj; variants: Variants;
    needsVariant: boolean; variantFields: string[]; variantRows: Row[];
  }
  interface Row {
    key: string; path: string[]; uid: number | null; field: string; label: string;
    kind: Side | 'conflict'; base: Json; local: Json; disk: Json;
    basePresent: boolean; localPresent: boolean; diskPresent: boolean;
  }
  interface Plan {
    filename: string; library: Obj; book: Book | null; disk: Obj; local: Obj; rows: Row[]; retainedBook?: Obj;
  }
  interface PngApi {
    cardVariants(bytes: Uint8Array): Variants;
    writeCardVariants(bytes: Uint8Array, updates: Variants, replacement: Uint8Array | null): Uint8Array;
    portraitBytes(bytes: Uint8Array): Uint8Array;
    portraitFingerprint(bytes: Uint8Array): Promise<string>;
    readJsonBytes(bytes: Uint8Array): unknown;
    writeJsonBytes(bytes: Uint8Array, document: Obj): Uint8Array;
  }
  const root = globalThis as unknown as {
    TAFormats: {
      cardToCharacter(raw: Obj): Obj;
      bookToCharacterBook(book: Book): Book;
      worldInfoToBook(raw: Obj, fallback: string, fromCharacterBook?: boolean): Book;
    };
    TAWorldSync: { same(a: unknown, b: unknown): boolean };
    TAResourceSource?: {clean(value: unknown): Obj | null};
    TAPng: PngApi;
    structuredClone<T>(value: T): T;
  };
  const messages = {
    'card.format': 'Choose a SillyTavern character card in JSON or PNG format.',
    'card.png': 'The PNG is damaged or its character metadata cannot be read.',
    'card.variant': 'Choose the chara or ccv3 version before writing this card.',
    'card.uid': 'The embedded book has missing, duplicate or inconsistent identifiers.',
    'card.unresolved': 'Choose a version for each conflicting change.',
  };
  function fail(code: keyof typeof messages): never {
    throw Object.assign(new Error(messages[code]), {code});
  }
  function object(value: unknown): value is Obj {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  function obj(value: unknown): Obj { return object(value) ? value : {}; }
  const clone = <T>(value: T): T => root.structuredClone(value);
  const same = (a: unknown, b: unknown): boolean => root.TAWorldSync.same(a,b);
  const fields = ['name','description','personality','scenario','first_mes','mes_example','creator_notes',
    'system_prompt','post_history_instructions','alternate_greetings','tags','creator','character_version'];
  const arrayFields = ['alternate_greetings','tags'];
  // These belong to ST's card slot, to a particular format, or to Quilvori's local records.
  const ownedHeader = ['spec','spec_version','avatar','chat','fav','create_date','date_last_chat','last_chat',
    'avatar_url','filename','file_name','talkativeness','source'];
  const ownedExtensions = ['world','fav','talkativeness','quilvori_source'];
  function without(record: Obj, keys: string[]): Obj {
    return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));
  }
  function keys(...values: (Obj | undefined)[]): string[] {
    return [...new Set(values.flatMap(value => Object.keys(value || {})))].sort();
  }
  function own(record: Obj | undefined,key: string): Slot {
    return record && Object.hasOwn(record,key) ? record[key] : undefined;
  }
  function assign(record: Obj,key: string,value: Slot): void {
    if (value === undefined) delete record[key]; else record[key] = value;
  }
  function safe(value: unknown): void {
    if (value == null || typeof value !== 'object') return;
    for (const [key,child] of Object.entries(value)) {
      if (['__proto__','constructor','prototype'].includes(key)) fail('card.format');
      safe(child);
    }
  }
  // Apply only differences between effective values. A sparse raw card keeps its original
  // value types, missing defaults, alternative spellings and extension fields on a no-op.
  function overlay(raw: Slot,before: Slot,after: Slot): Slot {
    if (same(before,after)) return raw;
    if (object(after) && (object(before) || before === undefined) && (object(raw) || raw === undefined)) {
      const result = {...raw};
      for (const key of keys(before,after)) assign(result,key,overlay(own(raw,key),own(before,key),own(after,key)));
      return result;
    }
    return after;
  }
  function uid(value: unknown): number {
    const number = typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value) ? Number(value) : value;
    if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 0) fail('card.uid');
    return number;
  }
  function entryUid(entry: Obj,index: number): number {
    const value = uid(entry.id ?? entry.uid ?? index);
    if (entry.uid != null && uid(entry.uid) !== value) fail('card.uid');
    return value;
  }
  function readBook(raw: Obj): Book {
    if (!Array.isArray(raw.entries)) fail('card.format');
    const seen = new Set<number>();
    const entries = raw.entries.map((value,index) => {
      if (!object(value)) fail('card.format');
      const id = entryUid(value,index);
      if (seen.has(id)) fail('card.uid');
      seen.add(id);
      return {...value,id,uid:id};
    });
    try {
      // The input is already known to be an embedded book. Vendor fields named
      // data, character_book or originalData must not be reinterpreted as import envelopes.
      const native = {...without(raw,['originalData']),entries};
      const book = root.TAFormats.worldInfoToBook({data:{character_book:native}},'',true);
      if (Object.hasOwn(raw,'originalData')) book.stBookFields = {...obj(book.stBookFields),originalData:raw.originalData!};
      return book;
    }
    catch {return fail('card.format');}
  }
  function nativeData(raw: Obj): Obj {return object(raw.data) ? raw.data : raw;}
  function embedded(raw: Obj): Obj | undefined {
    const book = nativeData(raw).character_book;
    if (book == null) return undefined;
    if (!object(book)) fail('card.format');
    return book;
  }
  function validate(input: unknown): Obj {
    if (!object(input)) return fail('card.format');
    safe(input);
    const data = nativeData(input);
    if (input.spec != null && !['chara_card_v2','chara_card_v3'].includes(String(input.spec))) fail('card.format');
    if (input.data !== undefined && !object(input.data)) fail('card.format');
    if (typeof (data.name ?? input.name) !== 'string' || !input.spec &&
        (!fields.slice(1).some(key => Object.hasOwn(data,key)) || Object.hasOwn(data,'entries'))) fail('card.format');
    if (data.extensions != null && !object(data.extensions)) fail('card.format');
    try {root.TAFormats.cardToCharacter(input);} catch {return fail('card.format');}
    const book = embedded(input);
    if (book) readBook(book);
    return input;
  }
  function preparedBook(input: Book,base: Obj | undefined,disk: Obj | undefined): Book {
    if (!object(input) || !Array.isArray(input.entries)) fail('card.format');
    safe(input);
    const result = clone(input), reserved = new Set<number>(), ids = new Set<string>();
    for (const entry of result.entries) {
      if (!object(entry)) fail('card.format');
      const identity = entry.id;
      if (!(typeof identity === 'number' && Number.isSafeInteger(identity) || typeof identity === 'string' && identity.length) ||
          ids.has(String(identity))) fail('card.uid');
      ids.add(String(identity));
      if (entry.stUid == null) continue;
      const number = uid(entry.stUid);
      if (reserved.has(number)) fail('card.uid');
      reserved.add(number);
      entry.stUid = number;
    }
    const reference = base || disk;
    if (reference && result.entries.some(entry => entry.stUid == null)) {
      const rows = reference.entries as Obj[], imported = readBook(reference).entries;
      const comparable = (entry: Obj,number: number) => root.TAFormats.bookToCharacterBook({entries:[{...entry,stUid:number}]}).entries[0];
      result.entries.forEach((entry,index) => {
        const row = rows[index], prior = imported[index];
        if (entry.stUid != null || !row || !prior) return;
        const number = entryUid(row,index);
        if (reserved.has(number)) return;
        // Imported books can predate UID normalization. An omitted embedded ID means
        // its array index, which need not be the lowest free integer in the book.
        if (!base && row.id == null && row.uid == null || same(comparable(entry,number),comparable(prior,number))) {
          entry.stUid = number; reserved.add(number);
        }
      });
    }
    if (base) for (const raw of [base,disk]) {
      if (raw) (raw.entries as Obj[]).forEach((entry,index) => reserved.add(entryUid(entry,index)));
    }
    let next = 0;
    for (const entry of result.entries) if (entry.stUid == null) {
      while (reserved.has(next)) next++;
      entry.stUid = next; reserved.add(next++);
    }
    return result;
  }
  // The native book is an ordered array, while entry identity is a stable ST identifier.
  // Store order separately so additions, removals and field edits can merge independently.
  function bookView(book: Book, cardName: string, inferred: boolean): Obj {
    const exported = root.TAFormats.bookToCharacterBook(book);
    const meta = without(exported,['entries']);
    if (inferred && [cardName+' · 角色书',cardName+' · 世界书',cardName+' · World book',
      cardName+' · World Book'].includes(String(meta.name))) meta.name = '';
    const entries: Obj = {}, order: number[] = [];
    exported.entries.forEach((row,index) => {
      const number = uid(row.id), entry = without(row,['id','uid']);
      const extension = {...obj(entry.extensions)};
      // The converter writes the array index for this optional display hint.
      // Retain explicit overrides, including a display order different from file order.
      if (Number(extension.display_index) === index) delete extension.display_index;
      entry.extensions = extension;
      entries[number] = entry;
      order.push(number);
    });
    return {fields:meta,entries,order};
  }
  function viewCard(card: Obj): Obj {
    const result: Obj = {};
    for (const key of fields) result[key] = card[key] ?? (arrayFields.includes(key) ? [] : '');
    const talk = Number(card.talkativeness ?? 0.5);
    if (!Number.isFinite(talk)) fail('card.format');
    const info = obj(card.stMetadata);
    const attribution = root.TAResourceSource?.clean(card.source);
    return {...result,talkativeness:talk,header:without(obj(info.header),ownedHeader),
      extra:without(obj(info.extra),ownedHeader.filter(key => key !== 'source')),
      extensions:without(obj(info.extensions),ownedExtensions),...(attribution ? {attribution} : {})};
  }
  function viewRaw(raw: Obj): Obj {
    const result = viewCard(root.TAFormats.cardToCharacter(raw));
    const book = embedded(raw);
    if (book) result.character_book = bookView(readBook(book),String(result.name),false);
    return result;
  }
  function rowLabel(path: string[],...sides: (Obj | undefined)[]): string {
    if (path[0] !== 'character_book' || path[1] !== 'entries' || path.length < 3) return '';
    for (const side of sides) {
      const list = obj(obj(side?.character_book).entries);
      const entry = obj(list[path[2]!]);
      if (typeof entry.comment === 'string' && entry.comment) return entry.comment;
    }
    return '';
  }
  function fieldName(path: string[]): string {
    if (path[0] !== 'character_book') return path.join('.');
    if (path[1] === 'entries' && path.length > 2) return 'character_book.'+(path.slice(3).join('.') || 'entry');
    if (path[1] === 'fields') return 'character_book.'+path.slice(2).join('.');
    return path.join('.');
  }
  function commonOrder(left: Json[],right: Json[]): Json[] {
    const included = new Set(right);
    return left.filter(value => included.has(value));
  }
  function compare(base: Obj | null,local: Obj,disk: Obj): Row[] {
    const rows: Row[] = [];
    function visit(path: string[],before: Slot,ours: Slot,theirs: Slot): void {
      if (same(ours,theirs)) return;
      const entry = path[0] === 'character_book' && path[1] === 'entries' && path.length === 3;
      if (object(ours) && object(theirs) && (before === undefined || object(before)) && !(entry && base && before === undefined)) {
        for (const key of keys(before,ours,theirs)) visit([...path,key],own(before,key),own(ours,key),own(theirs,key));
        return;
      }
      let from = before, a = ours, b = theirs;
      if (path[0] === 'character_book' && path[1] === 'order' && Array.isArray(ours) && Array.isArray(theirs)) {
        const shared = commonOrder(ours,theirs);
        const prior = Array.isArray(before) ? commonOrder(before,shared) : shared;
        a = commonOrder(ours,prior); b = commonOrder(theirs,prior);
        if (same(a,b)) return;
        from = Array.isArray(before) ? prior : undefined;
      }
      const number = path[0] === 'character_book' && path[1] === 'entries' && path.length > 2 ? uid(path[2]) : null;
      rows.push({key:JSON.stringify(path),path,uid:number,field:fieldName(path),label:rowLabel(path,local,disk,base || undefined),
        kind:!base ? 'conflict' : same(from,a) ? 'disk' : same(from,b) ? 'local' : 'conflict',
        base:before ?? null,local:ours ?? null,disk:theirs ?? null,
        basePresent:before !== undefined,localPresent:ours !== undefined,diskPresent:theirs !== undefined});
    }
    visit([],base || undefined,local,disk);
    return rows;
  }
  function review(baseInput: unknown,library: Obj,libraryBook: Book | null,diskInput: unknown,filename = ''): Plan {
    const base = baseInput == null ? null : validate(baseInput), disk = clone(validate(diskInput));
    if (!object(library)) fail('card.format');
    safe(library);
    const book = libraryBook == null ? null : preparedBook(libraryBook,base ? embedded(base) : undefined,embedded(disk));
    const local = viewCard(library);
    if (book) local.character_book = bookView(book,String(local.name),!(base ? embedded(base) : embedded(disk))?.name);
    const prior = base && embedded(base), fileBook = embedded(disk);
    let retainedBook: Obj | undefined;
    if (prior && book) {
      const diskIds = new Set(((fileBook?.entries || []) as Obj[]).map(entryUid));
      if (!fileBook || (prior.entries as Obj[]).some((entry,index) => !diskIds.has(entryUid(entry,index)))) retainedBook = prior;
    }
    return clone({filename,library,book,disk,local,rows:compare(base && viewRaw(base),local,viewRaw(disk)),...(retainedBook ? {retainedBook} : {})});
  }
  function setAt(record: Obj,path: string[],value: Slot): void {
    if (!path.length) fail('card.format');
    let current = record;
    for (const key of path.slice(0,-1)) {
      const child = own(current,key);
      if (!object(child)) fail('card.format');
      current = child;
    }
    assign(current,path[path.length-1]!,clone(value));
  }
  function mergedOrder(first: Json[],second: Json[],entries: Obj): number[] {
    const valid = (value: Json) => Object.hasOwn(entries,String(value));
    const order = first.filter(valid).map(uid), present = new Set(order);
    const following = second.filter(valid).map(uid);
    let pending: number[] = [];
    // Insert runs from the other edition immediately before their next shared anchor.
    for (const number of following) {
      if (!present.has(number)) {pending.push(number); present.add(number); continue;}
      if (pending.length) {order.splice(order.indexOf(number),0,...pending); pending = [];}
    }
    order.push(...pending);
    for (const key of Object.keys(entries)) if (!present.has(uid(key))) order.push(uid(key));
    return order;
  }
  function asNativeBook(view: Obj,raw?: Obj,prior?: Obj,retained?: Obj): Obj {
    const retainedView = retained && bookView(readBook(retained),'',false);
    if (!raw && retained) {raw = retained; prior = retainedView;}
    const current = obj(view.entries), previous = obj(prior?.entries);
    const rawMap = new Map<number,Obj>(((raw?.entries || []) as Obj[]).map((entry,index) => [entryUid(entry,index),entry]));
    const retainedMap = new Map<number,Obj>(((retained?.entries || []) as Obj[]).map((entry,index) => [entryUid(entry,index),entry]));
    const meta = overlay(raw && without(raw,['entries']),prior?.fields,view.fields) as Obj;
    const order = mergedOrder(view.order as Json[],[],current);
    const entries = order.map((number,index) => {
      // When keeping a locally edited entry that disappeared on disk, start from
      // its original native representation, just as for rows still present there.
      const original = rawMap.get(number) || retainedMap.get(number);
      const priorEntry = previous[number] ?? obj(retainedView?.entries)[number];
      const result = {...obj(overlay(original,priorEntry,current[number]))};
      if (!original || result.id == null && result.uid == null && number !== index) result.id = number;
      if (original) {
        const old = obj(priorEntry), next = obj(current[number]);
        for (const [field,aliases] of Object.entries({keys:['key','触发关键词'],secondary_keys:['keysecondary','secondaryKeys'],
          comment:['name','条目名'],content:['body','正文'],insertion_order:['order']})) {
          if (!same(old[field],next[field])) for (const alias of aliases)
            if (Object.hasOwn(original,alias)) assign(result,alias,next[field]);
        }
        if (!same(old.enabled,next.enabled) && Object.hasOwn(original,'disable')) result.disable = !next.enabled;
        for (const [extension,alias] of Object.entries({depth:'depth',selectiveLogic:'selectiveLogic',outlet_name:'outletName',
          case_sensitive:'caseSensitive',match_whole_words:'matchWholeWords',realmweave_category:'category'})) {
          const former = own(obj(old.extensions),extension), wanted = own(obj(next.extensions),extension);
          if (Object.hasOwn(original,alias) && !same(former,wanted)) assign(result,alias,wanted);
        }
      }
      return result;
    });
    return {...meta,entries};
  }
  function patchCard(raw: Obj,before: Obj,after: Obj,retainedBook?: Obj): Obj {
    const result = clone(raw), data = nativeData(result);
    for (const key of fields) if (!same(before[key],after[key])) {
      const value = after[key];
      if (key !== 'creator_notes' || data !== result || Object.hasOwn(data,key) || !Object.hasOwn(result,'creatorcomment')) assign(data,key,value);
      if (data !== result && Object.hasOwn(result,key)) assign(result,key,value);
      if (key === 'creator_notes' && Object.hasOwn(result,'creatorcomment')) assign(result,'creatorcomment',value);
    }
    for (const [target,section] of [[result,'header'],[data,'extra']] as const) {
      for (const key of keys(obj(before[section]),obj(after[section]))) {
        assign(target,key,overlay(own(target,key),own(obj(before[section]),key),own(obj(after[section]),key)));
      }
    }
    assign(data,'extensions',overlay(data.extensions,before.extensions,after.extensions));
    if (!same(before.attribution,after.attribution)) {
      const extensions = {...obj(data.extensions)};
      assign(extensions,'quilvori_source',after.attribution);
      data.extensions = extensions;
    }
    if (!same(before.talkativeness,after.talkativeness)) {
      const talk = Number(after.talkativeness);
      const extensions = obj(data.extensions), top = Object.hasOwn(result,'talkativeness');
      if (top || data === result && !Object.hasOwn(extensions,'talkativeness'))
        result.talkativeness = typeof result.talkativeness === 'string' ? String(talk) : talk;
      if (Object.hasOwn(extensions,'talkativeness') || !top && data !== result) {
        data.extensions = {...extensions,talkativeness:typeof extensions.talkativeness === 'number' ? talk : String(talk)};
      }
    }
    if (!same(before.character_book,after.character_book)) {
      if (object(after.character_book)) data.character_book = asNativeBook(after.character_book,embedded(raw),object(before.character_book) ? before.character_book : undefined,retainedBook);
      else delete data.character_book;
    }
    return result;
  }
  function materializeBook(plan: Plan,merged: Obj,view: Obj): Book | null {
    const raw = embedded(merged);
    if (!raw || !object(view.character_book)) return null;
    if (plan.book && same(plan.local.character_book,view.character_book)) return clone(plan.book);
    const current = readBook(raw);
    const before = object(plan.local.character_book) ? readBook(asNativeBook(plan.local.character_book)) : null;
    const names = new Set(plan.book?.entries.map(entry => String(entry.id)) || []);
    const index = (book: Book | null) => new Map(book?.entries.map(entry => [uid(entry.stUid),entry]));
    const authored = index(plan.book), previous = index(before);
    // Compare two converter-normalized views so a disk edit never fills sparse local
    // records with unrelated defaults, nor removes IDs, provenance or editor metadata.
    const normalized = index(readBook(asNativeBook(view.character_book)));
    const entries = current.entries.map(entry => {
      const number = uid(entry.stUid), old = authored.get(number), from = previous.get(number);
      if (old && from) return {...obj(overlay(old,from,normalized.get(number))),id:old.id!,stUid:number};
      let id = 'lore_sync_'+number, suffix = 0;
      while (names.has(id)) id = 'lore_sync_'+number+'_'+(++suffix);
      names.add(id);
      return {...entry,id,stUid:number};
    });
    const priorMeta = before && without(before,['entries']);
    const nextMeta = without(readBook(asNativeBook(view.character_book)),['entries']);
    const priorBook = plan.book && without(plan.book,['entries']);
    const result = plan.book ? obj(overlay(priorBook || undefined,without(priorMeta || {},['source']),without(nextMeta,['source']))) : without(current,['entries']);
    if (plan.book && !same(priorMeta?.source,nextMeta.source)) updateCredit(result,nextMeta.source);
    if (!plan.book && !result.name) result.name = String(plan.library.name || '')+' · World Book';
    return {...result,id:plan.book?.id ?? 'book_sync_'+String(plan.library.id),entries};
  }
  function updateCredit(work: Obj,attribution: Slot): void {
    const provenance = without(obj(work.source),['author','postUrl','license','catalogId']);
    const source = {...provenance,...obj(attribution)};
    if (Object.keys(source).length) work.source = source; else delete work.source;
  }
  function resolve(plan: Plan,choices: Record<string,Side> = {}): {document: Obj; card: Obj; book: Book | null} {
    const before = viewRaw(plan.disk), after = clone(before);
    for (const row of plan.rows) {
      const side = Object.hasOwn(choices,row.key) ? choices[row.key] : row.kind;
      if (side === 'local') setAt(after,row.path,row.localPresent ? row.local : undefined);
      else if (side !== 'disk') fail('card.unresolved');
    }
    if (object(after.character_book)) {
      const work = after.character_book;
      const diskOrder = (obj(before.character_book).order || []) as Json[];
      const localOrder = (obj(plan.local.character_book).order || []) as Json[];
      work.order = mergedOrder(work.order as Json[],same(work.order,diskOrder) ? localOrder : diskOrder,obj(work.entries));
    }
    const document = patchCard(plan.disk,before,after,plan.retainedBook), card = clone(plan.library);
    for (const key of [...fields,'talkativeness']) if (!same(plan.local[key],after[key])) assign(card,key,after[key]);
    const meta = {...obj(card.stMetadata)};
    for (const key of ['header','extra','extensions']) {
      if (!same(plan.local[key],after[key])) assign(meta,key,overlay(meta[key],plan.local[key],after[key]));
    }
    if (Object.keys(meta).length || Object.hasOwn(card,'stMetadata')) card.stMetadata = meta;
    if (!same(plan.local.attribution,after.attribution)) updateCredit(card,after.attribution);
    const book = materializeBook(plan,document,after);
    if (!plan.book && book) card.embeddedBookId = book.id!;
    else if (plan.book && !book) {
      if (obj(card.source).embeddedBookId != null) card.embeddedBookId = '';
      else delete card.embeddedBookId;
    }
    return {document,card,book};
  }
  // Both conventional PNG readers must see the same authored fields, while each
  // edition retains its own runtime references and any metadata exclusive to it.
  function carryCommon(other: Json,primary: Json): Json {
    if (!object(other) || !object(primary)) return primary;
    const result = {...other};
    for (const key of Object.keys(other)) if (Object.hasOwn(primary,key)) result[key] = carryCommon(other[key]!,primary[key]!);
    return result;
  }
  const versionFields = ['assets','nickname','creator_notes_multilingual','source','group_only_greetings',
    'creation_date','modification_date'];
  function alignEdition(other: Obj,primary: Obj): Obj {
    const aligned = {...other};
    for (const key of [...fields,'talkativeness']) aligned[key] = primary[key]!;
    assign(aligned,'attribution',primary.attribution);
    for (const key of ['header','extra','extensions']) {
      const preferred = obj(primary[key]);
      aligned[key] = carryCommon(obj(other[key]),preferred);
    }
    if (!object(primary.character_book) || !object(other.character_book)) {
      assign(aligned,'character_book',primary.character_book);
    } else {
      const a = other.character_book, b = primary.character_book, rows: Obj = {};
      for (const [key,row] of Object.entries(obj(b.entries))) {
        const existing = own(obj(a.entries),key);
        rows[key] = existing === undefined ? row : carryCommon(existing,row);
      }
      aligned.character_book = {fields:carryCommon(obj(a.fields),obj(b.fields)),entries:rows,order:b.order!};
    }
    return aligned;
  }
  function bytesOf(input: Uint8Array | ArrayBuffer): Uint8Array {
    if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer,input.byteOffset,input.byteLength);
    if (Object.prototype.toString.call(input) !== '[object ArrayBuffer]') fail('card.format');
    return new Uint8Array(input);
  }
  function decode(input: Uint8Array | ArrayBuffer,filename = ''): CardFile {
    const bytes = bytesOf(input);
    const png = filename ? /\.png$/i.test(filename) : bytes[0] === 137;
    if (filename && !png && !/\.json$/i.test(filename)) fail('card.format');
    if (!png) {
      let raw: unknown;
      try {raw = root.TAPng.readJsonBytes(bytes);} catch {return fail('card.format');}
      return {format:'json',bytes,document:validate(raw),variants:{},variantFields:[],variantRows:[],needsVariant:false};
    }
    const variants = root.TAPng.cardVariants(bytes);
    for (const value of Object.values(variants)) validate(value);
    const document = variants.ccv3 || variants.chara;
    if (!document) fail('card.png');
    let variantRows: Row[] = [];
    if (variants.ccv3 && variants.chara) {
      const primary = viewRaw(variants.ccv3), other = viewRaw(variants.chara);
      variantRows = compare(null,alignEdition(other,primary),other);
    }
    const variantFields = [...new Set(variantRows.map(row => row.uid === null ? row.field : row.field+' ['+row.uid+']'))];
    return {format:'png',bytes,document,variants,variantRows,variantFields,needsVariant:variantRows.length > 0};
  }
  function select(file: CardFile,choice?: Variant | null): Obj {
    if (file.format === 'json') return file.document;
    const name = choice ?? (file.variants.ccv3 ? 'ccv3' : 'chara');
    if ((name !== 'chara' && name !== 'ccv3') || !file.variants[name]) fail('card.variant');
    const selected = file.variants[name]!, other = file.variants[name === 'ccv3' ? 'chara' : 'ccv3'];
    // A V2 edition with no credit must not erase the sole known author and post
    // just because its writing was selected over V3's (and vice versa).
    if (other) {
      const theirs = viewRaw(other), ours = viewRaw(selected);
      if (!ours.attribution && theirs.attribution) return patchCard(selected,ours,{...ours,attribution:theirs.attribution});
    }
    return selected;
  }
  function encode(file: CardFile,mergedDocument: Obj,replacementPngBytes: Uint8Array | ArrayBuffer | null = null,
    variantChoice: Variant | null = null): Uint8Array {
    validate(mergedDocument);
    if (file.needsVariant && variantChoice !== 'chara' && variantChoice !== 'ccv3') fail('card.variant');
    const chosen = select(file,variantChoice);
    if (file.format === 'json') {
      if (replacementPngBytes !== null) fail('card.format');
      return same(chosen,mergedDocument) ? file.bytes : root.TAPng.writeJsonBytes(file.bytes,mergedDocument);
    }
    const nameChosen = variantChoice ?? (file.variants.ccv3 ? 'ccv3' : 'chara');
    const before = viewRaw(chosen), after = viewRaw(mergedDocument), updates: Variants = {};
    if (chosen !== file.variants[nameChosen] && !after.attribution && before.attribution) {
      mergedDocument = patchCard(mergedDocument,after,{...after,attribution:before.attribution});
      after.attribution = before.attribution;
    }
    for (const name of ['chara','ccv3'] as const) {
      const edition = file.variants[name];
      if (!edition) continue;
      if (name === nameChosen) {
        if (!same(edition,mergedDocument)) updates[name] = mergedDocument;
      } else {
        const other = viewRaw(edition);
        const aligned = alignEdition(other,before);
        // A V3-only change belongs exclusively to its representation. Conversely,
        // V3 fields already present in a V2 extension can still track a shared edit.
        const applicable = clone(after);
        for (const key of versionFields) if (!Object.hasOwn(obj(other.extra),key)) {
          assign(obj(applicable.extra),key,own(obj(before.extra),key));
        }
        const wanted = overlay(aligned,before,applicable) as Obj;
        if (!same(wanted,other)) updates[name] = patchCard(edition,other,wanted);
      }
    }
    if (!Object.keys(updates).length && !replacementPngBytes) return file.bytes;
    return root.TAPng.writeCardVariants(file.bytes,updates,replacementPngBytes ? bytesOf(replacementPngBytes) : null);
  }
  const portraitBytes = (input: Uint8Array | ArrayBuffer): Uint8Array => root.TAPng.portraitBytes(bytesOf(input));
  const portraitFingerprint = (input: Uint8Array | ArrayBuffer): Promise<string> => root.TAPng.portraitFingerprint(bytesOf(input));
  Object.assign(globalThis,{TACardSync:{review,resolve,decode,encode,select,validate,same,portraitBytes,portraitFingerprint}});
})();
