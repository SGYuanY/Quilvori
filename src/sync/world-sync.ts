// A sync plan compares native World Info fields. File access and persistence belong to its caller.
(() => {
  type Json = null | boolean | number | string | Json[] | Obj;
  type Obj = { [key: string]: Json };
  type Slot = Json | undefined;
  type Book = Obj & { entries: Obj[] };
  type World = Obj & { entries: Record<string, Obj> };
  type Side = 'local' | 'disk';
  type Path = string[];
  interface Row {
    key: string; path: Path; uid: number | null; field: string; label: string;
    kind: Side | 'conflict'; base: Json; local: Json; disk: Json;
    basePresent: boolean; localPresent: boolean; diskPresent: boolean;
  }
  interface Plan {
    filename: string; library: Book; local: World; disk: World; rows: Row[];
  }
  interface Formats {
    worldInfoToBook(document: Obj, fallback: string, fromCharacterBook?: boolean): Book;
    bookToWorldInfo(book: Book): World;
    bookToCharacterBook(book: Book): Book;
  }
  const formats = () => (globalThis as unknown as {TAFormats: Formats}).TAFormats;
  const clone = (globalThis as unknown as {structuredClone<T>(value: T): T}).structuredClone;
  const messages = {
    'sync.format': 'Choose a standalone SillyTavern world-book JSON with an entries dictionary.',
    'sync.uid': 'The entry identifiers are missing, duplicated, or inconsistent.',
    'sync.unsafe': 'The document contains a reserved object key and cannot be merged safely.',
    'sync.unresolved': 'Choose a version for each conflicting change.',
  };
  function fail(code: keyof typeof messages): never {
    throw Object.assign(new Error(messages[code]), {code});
  }
  function object(value: unknown): value is Obj {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }
  function same(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((v,i) => same(v,b[i]));
    if (!object(a) || !object(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b,k) && same(a[k],b[k]));
  }
  function safeKeys(value: unknown): void {
    if (value === null || typeof value !== 'object') return;
    for (const [key,child] of Object.entries(value)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') fail('sync.unsafe');
      safeKeys(child);
    }
  }
  function nativeId(value: unknown): number {
    const id = typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value) ? Number(value) : value;
    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 0) fail('sync.uid');
    return id;
  }
  function title(filename: string): string {
    return filename.split(/[\\/]/).pop()?.replace(/\.json$/i,'') || '';
  }
  // The existing converter understands omitted UIDs. Normalize numeric strings only on its
  // private input so an untouched file keeps its original representation.
  function read(raw: World, filename: string): Book {
    const entries = Object.fromEntries(Object.entries(raw.entries).map(([key,row]) =>
      [key,{...row,uid:Number(key)}]));
    // Generic imports detect card and data envelopes. Here the top-level entries
    // have already identified this document; identically named vendor fields are metadata.
    const envelopeKeys = ['data','character','character_book'];
    const opaque = Object.fromEntries(envelopeKeys.filter(key => Object.hasOwn(raw,key)).map(key => [key,raw[key]!]));
    try {
      const book = formats().worldInfoToBook({...without(raw,envelopeKeys),entries},title(filename));
      if (Object.keys(opaque).length) book.stBookFields = {...(object(book.stBookFields) ? book.stBookFields : {}),...opaque};
      return book;
    }
    catch { return fail('sync.format'); }
  }
  function validate(input: unknown): World {
    if (!object(input) || !object(input.entries)) return fail('sync.format');
    safeKeys(input);
    for (const [key,row] of Object.entries(input.entries)) {
      const uid = nativeId(key);
      if (!object(row)) return fail('sync.format');
      if (row.uid != null && nativeId(row.uid) !== uid) return fail('sync.uid');
    }
    const world = input as World;
    if (object(world.originalData) && Array.isArray(world.originalData.entries)) mirrorMap(world.originalData.entries);
    read(world,'');
    return world;
  }
  function keyUnion(...records: (Obj | undefined)[]): string[] {
    return [...new Set(records.flatMap(record => Object.keys(record || {})))].sort();
  }
  function own(record: Obj | undefined, key: string): Slot {
    return record && Object.hasOwn(record,key) ? record[key] : undefined;
  }
  function assign(record: Obj, key: string, value: Slot): void {
    if (value === undefined) delete record[key];
    else record[key] = value;
  }
  // Apply a change between two *normalized* values to the original representation.
  // Import/export defaults, differently spelled booleans and untouched vendor metadata
  // therefore never become authored changes just because a file passed through an editor.
  function overlay(raw: Slot, before: Slot, after: Slot): Slot {
    if (same(before,after)) return raw;
    if (object(after) && (object(before) || before === undefined) && (object(raw) || raw === undefined)) {
      const record = {...raw};
      for (const key of keyUnion(before,after)) assign(record,key,overlay(own(raw,key),own(before,key),own(after,key)));
      return record;
    }
    return after;
  }
  function without(record: Obj, omit: string[]): Obj {
    return Object.fromEntries(Object.entries(record).filter(([key]) => !omit.includes(key)));
  }
  function libraryWithUids(input: Book, base: World | null, disk: World): Book {
    if (!object(input) || !Array.isArray(input.entries) || !input.entries.every(object)) fail('sync.format');
    safeKeys(input);
    const book = clone(input), reserved = new Set<number>(), ids = new Set<string>();
    for (const entry of book.entries) {
      const id = entry.id;
      if (!(typeof id === 'string' && id.trim() || typeof id === 'number' && Number.isSafeInteger(id)) || ids.has(String(id))) fail('sync.uid');
      ids.add(String(id));
      if (entry.stUid == null) continue;
      const uid = nativeId(entry.stUid);
      if (reserved.has(uid)) fail('sync.uid');
      entry.stUid = uid; reserved.add(uid);
    }
    // On first binding, use the same numbering as a regular Quilvori export. Once
    // bound, an unnumbered new local entry must not claim an independent disk addition.
    if (base) for (const key of [...Object.keys(base.entries),...Object.keys(disk.entries)]) reserved.add(Number(key));
    let next = 0;
    for (const entry of book.entries) if (entry.stUid == null) {
      while (reserved.has(next)) next++;
      entry.stUid = next; reserved.add(next++);
    }
    return book;
  }
  function inDisplayOrder(raw: World): number[] {
    const ids = Object.keys(raw.entries).map(Number);
    const index = new Map(ids.map((id,i) => [id,i]));
    const rank = (id: number): number => {
      const position = raw.entries[id]?.displayIndex;
      if ((typeof position === 'number' || typeof position === 'string' && position.trim()) && Number.isFinite(Number(position))) return Number(position);
      return index.get(id)!;
    };
    return ids.sort((a,b) => rank(a)-rank(b) || a-b);
  }
  // Native World Info sometimes keeps a second spelling of a field in its extensions.
  // Keep an existing mirror in step when its corresponding editable field changes.
  function alignAliases(row: Obj, before: Obj, after: Obj): void {
    const aliases: Record<string,string[]> = {
      content:['body','正文'],comment:['name','条目名'],key:['keys','触发关键词'],
      keysecondary:['secondary_keys','secondaryKeys'],order:['insertion_order'],
    };
    for (const [field,variants] of Object.entries(aliases)) if (!same(before[field],after[field])) {
      for (const alias of variants) if (Object.hasOwn(row,alias)) assign(row,alias,after[field]);
    }
    if (!same(before.disable,after.disable) && Object.hasOwn(row,'enabled')) row.enabled = !after.disable;
    if (object(row.extensions)) {
      const extensions = {...row.extensions};
      for (const [field,alias] of Object.entries({
        position:'position',depth:'depth',outletName:'outlet_name',selectiveLogic:'selectiveLogic',
        caseSensitive:'case_sensitive',matchWholeWords:'match_whole_words',
      })) {
        if (Object.hasOwn(extensions,alias) && !same(before[field],after[field])) assign(extensions,alias,after[field]);
      }
      row.extensions = extensions;
    }
    const oldCategory = object(before.extensions) ? before.extensions.realmweave_category : undefined;
    const category = object(after.extensions) ? after.extensions.realmweave_category : undefined;
    if (Object.hasOwn(row,'category') && !same(oldCategory,category)) assign(row,'category',category);
  }

  // originalData is the embedded-book copy retained by some standalone ST files.
  // Adjust only changed fields of matched entries, preserving its raw shape and extras.
  function mirrorUid(entry: Obj, index: number): number {
    const uid = nativeId(entry.uid ?? entry.id ?? index);
    if (entry.uid != null && entry.id != null && nativeId(entry.id) !== uid) fail('sync.uid');
    return uid;
  }
  function mirrorMap(entries: Json[]): Record<string,Obj> {
    const map: Record<string,Obj> = {};
    entries.forEach((entry,index) => {
      if (!object(entry)) fail('sync.format');
      const uid = mirrorUid(entry,index);
      if (Object.hasOwn(map,String(uid))) fail('sync.uid');
      map[uid] = entry;
    });
    return map;
  }
  function mirrorRows(doc: World): Json[] {
    return object(doc.originalData) && Array.isArray(doc.originalData.entries) ? doc.originalData.entries : [];
  }
  function embeddedDelta(raw: Obj, before: Book, after: Book): Obj {
    if (!Array.isArray(raw.entries)) return raw;
    const old = new Map(before.entries.map(e => [nativeId(e.id),e]));
    const current = new Map(after.entries.map(e => [nativeId(e.id),e]));
    const seen = new Set<number>(), merged: Obj[] = [];
    for (const [index,value] of raw.entries.entries()) {
      if (!object(value)) fail('sync.format');
      const uid = mirrorUid(value,index);
      if (seen.has(uid)) fail('sync.uid');
      seen.add(uid);
      const from = old.get(uid), to = current.get(uid);
      if (from && !to) continue;
      let normalized = from;
      if (!from && to) {
        const retained = formats().worldInfoToBook({entries:[{...value,id:uid,uid}]},'',true);
        normalized = formats().bookToCharacterBook(retained).entries[0];
      }
      const row = (to && normalized ? overlay(value,normalized,to) : value) as Obj;
      merged.push(row.id == null && row.uid == null && uid !== merged.length ? {...row,id:uid} : row);
    }
    for (const [uid,row] of current) if (!old.has(uid) && !seen.has(uid)) merged.push(row);
    return {...overlay(without(raw,['entries']),without(before,['entries']),without(after,['entries'])) as Obj,entries:merged};
  }
  function project(raw: World, local: Book, filename: string, first: boolean): World {
    const imported = read(raw,filename), previous = formats().bookToWorldInfo(imported);
    const wanted = formats().bookToWorldInfo(local);
    const result = overlay(without(raw,['entries','originalData']),without(previous,['entries','originalData']),
      without(wanted,['entries','originalData'])) as Obj;
    const entries: Record<string,Obj> = {};
    const localOrder = local.entries.map(row => Number(row.stUid));
    const localIds = new Set(localOrder);
    const diskOrder = inDisplayOrder(raw).filter(uid => localIds.has(uid));
    const common = localOrder.filter(uid => Object.hasOwn(raw.entries,String(uid)));
    const importedOrder = imported.entries.map(row => Number(row.stUid)).filter(uid => localIds.has(uid));
    // Older imports kept numeric key order even when the disk had a custom display order.
    const reordered = !same(common,diskOrder) && !(first && same(common,importedOrder));
    for (const [index,uid] of localOrder.entries()) {
      const native = raw.entries[uid], from = previous.entries[uid], to = wanted.entries[uid]!;
      if (!native || !from) { entries[uid] = to; continue; }
      if (reordered) to.displayIndex = index;
      else if (!object(local.entries[index]?.stSettings) || !Object.hasOwn(local.entries[index]!.stSettings as Obj,'displayIndex')) {
        to.displayIndex = from.displayIndex!;
      }
      const row = overlay(native,from,to) as Obj;
      entries[uid] = {...row};
      alignAliases(entries[uid]!,from,to);
    }
    const document: World = {...result,entries};
    const added = localOrder.some(uid => !Object.hasOwn(raw.entries,String(uid)));
    if ((reordered || added) && !same(localOrder,inDisplayOrder(document))) {
      localOrder.forEach((uid,index) => { entries[uid]!.displayIndex = index; });
    }
    if (object(raw.originalData) && Array.isArray(raw.originalData.entries)) {
      document.originalData = raw.originalData;
      // Compare after applying the local primary fields: only independent embedded
      // metadata is included here. Mirrored authored fields are updated after resolution.
      if (local.stOriginalData) {
        const reference = formats().bookToCharacterBook(read(document,filename));
        document.originalData = embeddedDelta(raw.originalData,reference,formats().bookToCharacterBook(local));
      }
    } else if (Object.hasOwn(raw,'originalData')) document.originalData = raw.originalData!;
    else if (local.stOriginalData && wanted.originalData) document.originalData = wanted.originalData;
    return document;
  }
  // ST can write explicit defaults while saving an unrelated field. Use the converter's
  // effective values to classify edits; the values shown and written stay in their native form.
  function comparable(raw: World, filename: string): World {
    const empty = formats().bookToWorldInfo({entries:[{stUid:0}]}).entries[0]!;
    const fields = Object.keys(empty).filter(key => key !== 'displayIndex');
    const native = formats().bookToWorldInfo(read(raw,filename)), entries: Record<string,Obj> = {};
    for (const [key,entry] of Object.entries(raw.entries)) {
      const row = {...entry}, values = native.entries[key]!;
      for (const field of fields) {
        // Authored text is literal, including text which happens to contain embedded JSON.
        if ((field === 'content' || field === 'comment') && typeof entry[field] === 'string') continue;
        // A future ST position unknown to this converter still has its own native meaning.
        if (field === 'position' && entry.position != null && Number(entry.position) > 7) continue;
        assign(row,field,values[field]);
      }
      entries[key] = row;
    }
    return {...raw,entries};
  }
  function compare(base: World | null, local: World, disk: World, filename: string): Row[] {
    const rows: Row[] = [];
    function visit(path: Path, original: Slot, our: Slot, their: Slot, sharedValue: Slot, localValue: Slot, diskValue: Slot): void {
      if (same(our,their) || same(localValue,diskValue)) return;
      const mirror = path[0] === 'originalData' && path[1] === 'entries';
      if (mirror && path.length === 2 && Array.isArray(our) && Array.isArray(their) &&
          (original === undefined || Array.isArray(original))) {
        const b = original && mirrorMap(original), l = mirrorMap(our), d = mirrorMap(their);
        visit(path,b,l,d,b,l,d);
        return;
      }
      const wholeEntry = (path.length === 2 && path[0] === 'entries') || (mirror && path.length === 3);
      // Independently created entries with the same UID require a decision about identity.
      if (object(our) && object(their) && (original === undefined || object(original)) &&
          !(wholeEntry && base && original === undefined)) {
        const keys = keyUnion(original,our,their);
        if (path[0] === 'entries' && path.length === 1 || mirror && path.length === 2) keys.sort((a,b)=>Number(a)-Number(b));
        for (const k of keys) {
          visit([...path,k],own(original,k),own(our,k),own(their,k),
            own(object(sharedValue) ? sharedValue : undefined,k),own(object(localValue) ? localValue : undefined,k),
            own(object(diskValue) ? diskValue : undefined,k));
        }
        return;
      }
      const uid = mirror && path.length > 2 ? Number(path[2]) : path[0] === 'entries' && path.length > 1 ? Number(path[1]) : null;
      const field = uid === null ? path.join('.') : mirror ? 'originalData.'+(path.slice(3).join('.') || 'entry') : path.slice(2).join('.') || 'entry';
      const label = uid === null ? '' : String(local.entries[uid]?.comment || disk.entries[uid]?.comment || base?.entries[uid]?.comment || '');
      const kind = !base ? 'conflict' : same(sharedValue,localValue) ? 'disk' : same(sharedValue,diskValue) ? 'local' : 'conflict';
      if (mirror && base && wholeEntry && uid !== null && (!our || !their) &&
          !!base.entries[uid] === !!original && !!local.entries[uid] === !!our && !!disk.entries[uid] === !!their) return;
      // ST updates these two representations together. The native field already
      // has its own decision; resolve() carries that decision into the mirror.
      if (mirror && base && kind === 'disk' && uid !== null && path.length === 4) {
        const nativeField = ({keys:'key',secondary_keys:'keysecondary',content:'content',comment:'comment',
          constant:'constant',selective:'selective',insertion_order:'order'} as Record<string,string>)[path[3]!];
        if (typeof nativeField === 'string' && same(original,own(base.entries[uid],nativeField)) &&
            same(their,own(disk.entries[uid],nativeField))) return;
      }
      rows.push({
        key:JSON.stringify(path),path,uid,field,label,kind,
        base:original ?? null,local:our ?? null,disk:their ?? null,
        basePresent:original !== undefined,localPresent:our !== undefined,diskPresent:their !== undefined,
      });
    }
    if (!same(local,disk)) {
      visit([],base ?? undefined,local,disk,base ? comparable(base,filename) : undefined,
        comparable(local,filename),comparable(disk,filename));
    }
    return rows;
  }
  function review(baseInput: unknown, library: Book, diskInput: unknown, filename = ''): Plan {
    const base = baseInput == null ? null : clone(validate(baseInput));
    const disk = clone(validate(diskInput));
    const book = libraryWithUids(library,base,disk);
    const local = project(base || disk,book,filename,!base);
    return {filename,library:book,local,disk,rows:compare(base,local,disk,filename)};
  }
  function hasLocalChanges(baseInput: unknown, library: Book, filename = ''): boolean {
    const base = validate(baseInput);
    return !same(base,project(base,libraryWithUids(library,base,base),filename,false));
  }
  function setAt(document: World, path: Path, value: Slot): void {
    if (!path.length) fail('sync.format');
    let row: Obj = document;
    for (const [index,part] of path.entries()) {
      if (part === '__proto__' || part === 'constructor' || part === 'prototype') fail('sync.unsafe');
      if (index === path.length-1) { assign(row,part,clone(value)); return; }
      const child = own(row,part);
      if (!object(child)) fail('sync.format');
      row = child;
    }
  }
  function byUid(book: Book): Map<number,Obj> {
    return new Map(book.entries.map(row => [nativeId(row.stUid),row]));
  }
  function materialize(plan: Plan, document: World): Book {
    const before = read(plan.local,plan.filename), after = read(document,plan.filename);
    const previous = byUid(before), current = byUid(after), authored = byUid(plan.library);
    const ids = new Set(plan.library.entries.map(entry => String(entry.id)));
    const book = overlay(without(plan.library,['entries']),without(before,['entries']),without(after,['entries'])) as Obj;
    const entries = inDisplayOrder(document).map(uid => {
      const work = authored.get(uid), from = previous.get(uid), to = current.get(uid)!;
      if (work && from) {
        const entry = {...overlay(work,from,to) as Obj,id:work.id!,stUid:uid} as Obj;
        if (object(entry.stSettings) && Object.hasOwn(entry.stSettings,'displayIndex')) {
          entry.stSettings = {...entry.stSettings};
          assign(entry.stSettings,'displayIndex',document.entries[uid]!.displayIndex);
        }
        return entry;
      }
      const prefix = 'lore_sync_' + uid;
      let id = prefix, suffix = 0;
      while (ids.has(id)) id = prefix + '_' + (++suffix);
      ids.add(id);
      return {...to,id,stUid:uid};
    });
    return {...book,entries};
  }
  function resolve(plan: Plan, choices: Record<string,Side> = {}): {document: World; book: Book} {
    const document = clone(plan.disk);
    const mirror = plan.rows.some(row => row.path.length >= 3 && row.path[0] === 'originalData' && row.path[1] === 'entries') &&
      object(document.originalData) && Array.isArray(document.originalData.entries) ? document.originalData : null;
    if (mirror) mirror.entries = mirrorMap(mirror.entries as Json[]);
    for (const row of plan.rows) {
      const choice = Object.hasOwn(choices,row.key) ? choices[row.key] : row.kind;
      if (choice === 'local') setAt(document,row.path,row.localPresent ? row.local : undefined);
      else if (choice !== 'disk') fail('sync.unresolved');
    }
    if (mirror) {
      const map = mirror.entries as Record<string,Obj>;
      const order = new Set(mirrorRows(plan.disk).map((row,i)=>mirrorUid(row as Obj,i)));
      mirrorRows(plan.local).forEach((row,i)=>order.add(mirrorUid(row as Obj,i)));
      mirror.entries = [...order].filter(uid => Object.hasOwn(map,String(uid))).map((uid,index) => {
        const row = map[uid]!;
        return row.id == null && row.uid == null && uid !== index ? {...row,id:uid} : row;
      });
    }
    // The standalone fields are authoritative. Reconcile only their chosen changes
    // with the embedded copy, so a conflict has one user choice and vendor data survives.
    if (object(document.originalData) && Array.isArray(document.originalData.entries)) {
      const shadow = document.originalData;
      const shadowRows = shadow.entries as Json[];
      const retained = mirrorMap(mirrorRows(plan.local)), existing = mirrorMap(shadowRows);
      for (const uid of Object.keys(document.entries)) {
        const row = retained[uid];
        if (!plan.disk.entries[uid] && !existing[uid] && row) {
          shadowRows.push(row.id == null && row.uid == null && Number(uid) !== shadowRows.length ? {...row,id:Number(uid)} : clone(row));
        }
      }
      const prior = formats().bookToCharacterBook(read({...plan.disk,originalData:shadow},plan.filename));
      const wanted = formats().bookToCharacterBook(read(document,plan.filename));
      document.originalData = embeddedDelta(shadow,prior,wanted);
    }
    return {document,book:clone(materialize(plan,document))};
  }
  Object.assign(globalThis,{TAWorldSync:{review,resolve,validate,hasLocalChanges,same}});
})();
