// Plan a single-work restore from a library already validated by TAStore and TAWorkBackup.
// File access, dialogs, and the final atomic write belong to the backup page.
(() => {
  type Id = string | number;
  type Kind = 'characters' | 'worldBooks';
  type Bucket = Kind | 'assets' | 'stickerPacks';
  type Fields = Record<string, unknown>;
  interface Row extends Fields {
    id: Id;
    name?: string;
    entries?: Entry[];
    expressionAssetIds?: Id[];
    source?: Fields | null;
  }
  interface Entry extends Fields {
    id: Id;
    comment?: string;
    content?: string;
    keys?: string[];
    secondaryKeys?: string[];
  }
  interface ReplySource {bookId?: Id; entryIds?: Id[]}
  interface Library extends Fields {
    characters: Row[];
    worldBooks: Row[];
    assets: Row[];
    stickerPacks: Row[];
    quickReplySets?: {workSource?: ReplySource}[];
    graph?: {exportBookId?: Id};
  }
  interface Version {
    kind: Kind; id: Id; value: Row; time: number; reason: string; label: string;
  }
  interface Review {
    kind: Kind;
    file: Library;
    work: Row;
    current: Row | null;
    blocked: string;
    versions: Version[];
  }
  interface Dependency {
    key: string;
    bucket: Exclude<Bucket, 'characters'>;
    id: Id;
    row: Row | null;
    role: string;
  }
  interface Choices {
    mode: 'copy' | 'replace';
    dependencies: ReadonlySet<string>;
    snapshots: ReadonlySet<number>;
  }
  interface Context {
    reply?: ReplySource;
    reserved?: Partial<Record<Kind, Id[]>>;
  }
  const kinds: Kind[] = ['characters','worldBooks'];
  const copy = (globalThis as unknown as {structuredClone<T>(value: T): T}).structuredClone;
  const isId = (value: unknown): value is Id => typeof value === 'string' ? !!value.trim() : Number.isSafeInteger(value);
  const find = (rows: Row[], id: unknown) => isId(id) ? rows.find(row => String(row.id) === String(id)) : undefined;
  const keyFor = (bucket: Bucket, id: Id) => JSON.stringify([bucket,String(id)]);
  function equal(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const left = a as Fields, right = b as Fields, keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right,key) && equal(left[key],right[key]));
  }
  function search(library: Library, query = '', cachedText?: WeakMap<Row,string>) {
    const terms = query.trim().toLowerCase().split(/\s+/u).filter(Boolean);
    const matches: {kind: Kind; id: Id; name: string}[] = [];
    for (const kind of kinds) for (const row of library[kind]) {
      if (terms.length) {
        let text = cachedText?.get(row);
        if (text === undefined) {
          const fields: unknown[] = [row.name,row.id,row.description,row.personality,row.scenario,row.creator,row.first_mes,
            row.mes_example,row.creator_notes,row.system_prompt,row.post_history_instructions,row.tags,row.alternate_greetings];
          for (const entry of row.entries || []) fields.push(entry.comment,entry.content,entry.keys,entry.secondaryKeys);
          text = fields.flat().filter(v => typeof v === 'string' || typeof v === 'number').join('\n').toLowerCase();
          cachedText?.set(row,text);
        }
        if (!terms.every(term => text.includes(term))) continue;
      }
      matches.push({kind,id:row.id,name:row.name || String(row.id)});
    }
    return matches;
  }
  function replacementIssue(live: Library, kind: Kind, work: Row, current: Row | null, reply?: ReplySource) {
    if (!current) return 'restore.noLocal';
    if (work.id !== current.id) return 'restore.differentIds';
    if (kind !== 'worldBooks') return '';
    if (current.graphSource || current.id === 'book_sections' || live.graph?.exportBookId === current.id) return 'restore.managedBook';
    const references = [...(live.quickReplySets || []).map(set => set.workSource),reply];
    for (const ref of references) {
      if (!ref || !isId(ref.bookId) || String(ref.bookId) !== String(current.id)) continue;
      for (const id of ref.entryIds || []) {
        const local = find(current.entries || [],id), imported = find(work.entries || [],id);
        if (!local || !imported || imported.id !== local.id || imported.stUid !== local.stUid) return 'restore.linkedEntries';
      }
    }
    return '';
  }
  function review(live: Library, file: Library, state: {versions: Version[]} | null,
                  kind: Kind, id: Id, context: Context = {}): Review {
    if (!kinds.includes(kind)) throw new Error('资料库已变化，请重新打开。');
    const work = find(file[kind],id);
    if (!work) throw new Error('资料库已变化，请重新打开。');
    const current = find(live[kind],work.id) || null;
    return {kind,file,work,current:copy(current),blocked:replacementIssue(live,kind,work,current,context.reply),
      versions:(state?.versions || []).filter(v => v.kind === kind && v.id === work.id)
        .sort((a,b) => a.time-b.time)};
  }
  function dependencies(plan: Review, selectedVersions: ReadonlySet<number>, selected?: ReadonlySet<string>): Dependency[] {
    const found = new Map<string, Dependency>();
    function add(bucket: Dependency['bucket'], value: unknown, role: string) {
      if (!isId(value)) return;
      const key = keyFor(bucket,value);
      if (found.has(key)) return;
      const row = find(plan.file[bucket],value) || null;
      found.set(key,{key,bucket,id:row?.id ?? value,row,role});
      if (row && bucket === 'worldBooks' && (!selected || selected.has(key))) inspect(row,'worldBooks');
    }
    function inspect(work: Row, kind: Kind) {
      if (kind === 'characters') {
        add('assets',work.avatarAssetId,'头像');
        for (const id of work.expressionAssetIds || []) add('assets',id,'表情');
        add('worldBooks',work.embeddedBookId ?? work.source?.embeddedBookId,'关联世界书');
      } else {
        add('assets',work.coverAssetId,'世界书封面');
      }
      add('stickerPacks',work.stickerPackId,'表情包');
    }
    inspect(plan.work,plan.kind);
    plan.versions.forEach((v,i) => {if (selectedVersions.has(i)) inspect(v.value,plan.kind);});
    return [...found.values()];
  }
  function materialize(live: Library, plan: Review, choices: Choices, uid: (prefix: string) => Id, context: Context = {}) {
    if (choices.mode !== 'replace' && choices.mode !== 'copy') throw new Error('存档结构无效');
    const replacing = choices.mode === 'replace';
    const current = find(live[plan.kind],plan.work.id) || null;
    if (replacing && (!equal(current,plan.current) || replacementIssue(live,plan.kind,plan.work,current,context.reply))) {
      throw new Error('资料库已变化，请重新打开。');
    }
    const candidate: Library = {...live,characters:[...live.characters],worldBooks:[...live.worldBooks],
      assets:[...live.assets],stickerPacks:[...live.stickerPacks]};
    const used = new Map<Bucket,Set<string>>();
    function fresh(bucket: Bucket): Id {
      let keys = used.get(bucket);
      if (!keys) {
        keys = new Set([...live[bucket],...plan.file[bucket]].map(row => String(row.id)));
        if (bucket === 'characters' || bucket === 'worldBooks') {
          for (const id of context.reserved?.[bucket] || []) keys.add(String(id));
        }
        used.set(bucket,keys);
      }
      let id: Id;
      do {id = uid(bucket);} while (keys.has(String(id)));
      keys.add(String(id));
      return id;
    }
    const refs = new Map<string,Id>();
    const remapped = (bucket: Bucket, id: unknown) => isId(id) ? refs.get(keyFor(bucket,id)) : undefined;
    function copyIndex(bucket: Kind, id: Id) {
      return candidate[bucket].reduce((highest,row) => isId(row.backupCopyOf) && String(row.backupCopyOf) === String(id)
        ? Math.max(highest,Number.isSafeInteger(row.backupCopyIndex) ? Number(row.backupCopyIndex) : 1) : highest,0)+1;
    }
    function workRow(original: Row, kind: Kind, id: Id, identity: Fields, existing?: Row | null): Row {
      const work = copy(original);
      work.id = id;
      for (const field of ['creationSource','creationRecordKeys','backupCopyOf','backupCopyIndex','restoredForCharacterId',
        'folderTextHash','folderPortraitHash','folderAvatarPending']) delete work[field];
      Object.assign(work,identity);
      // On an in-place restore, declining a file attachment keeps the actual local link.
      // New copies and imported snapshots have no local attachments to inherit.
      function link(field: string, bucket: Bucket) {
        const mapped = remapped(bucket,original[field]);
        if (mapped !== undefined || !existing) work[field] = mapped ?? null;
        else if (Object.hasOwn(existing,field)) work[field] = copy(existing[field]);
        else delete work[field];
      }
      if (kind === 'characters') {
        link('avatarAssetId','assets');
        const added = (original.expressionAssetIds || []).flatMap(value => {
          const mapped = remapped('assets',value);
          return mapped === undefined ? [] : [mapped];
        });
        const originalExpressions = existing?.expressionAssetIds || [];
        const usedExpressions = new Set(originalExpressions.map(String));
        work.expressionAssetIds = [...originalExpressions,...added.filter(value => {
          if (usedExpressions.has(String(value))) return false;
          usedExpressions.add(String(value)); return true;
        })];
        const attached = work.embeddedBookId ?? work.source?.embeddedBookId;
        const mappedBook = remapped('worldBooks',attached);
        work.embeddedBookId = mappedBook ?? null;
        if (work.source && Object.hasOwn(work.source,'embeddedBookId')) {
          const mapped = isId(attached) && String(attached) === String(work.source.embeddedBookId)
            ? remapped('worldBooks',attached) : undefined;
          if (mapped === undefined) delete work.source.embeddedBookId;
          else work.source.embeddedBookId = mapped;
        }
        if (existing && mappedBook === undefined) {
          if (Object.hasOwn(existing,'embeddedBookId')) work.embeddedBookId = existing.embeddedBookId;
          else delete work.embeddedBookId;
          if (existing.source && Object.hasOwn(existing.source,'embeddedBookId')) {
            if (work.source == null) work.source = {};
            if (typeof work.source === 'object') work.source.embeddedBookId = existing.source.embeddedBookId;
            else work.embeddedBookId ??= existing.source.embeddedBookId;
          }
        }
      } else {
        link('coverAssetId','assets');
        // A book imported without its graph must not take ownership of this device's graph.
        delete work.graphSource;
        for (const entry of work.entries || []) delete entry.graphSource;
      }
      link('stickerPackId','stickerPacks');
      return work;
    }
    const selected = dependencies(plan,choices.snapshots,choices.dependencies)
      .filter((dep): dep is Dependency & {row: Row} => !!dep.row && choices.dependencies.has(dep.key));
    const id = replacing ? plan.work.id : fresh(plan.kind);
    for (const {key,bucket,row} of selected) {
      if (bucket === 'worldBooks') continue;
      // A repeat restore may already have a matching asset under a new ID because the original collided.
      const sameResource = (other: Row) => other.name === row.name && equal(other,{...row,id:other.id});
      const originalSlot = find(candidate[bucket],row.id);
      const existing = originalSlot && sameResource(originalSlot) ? originalSlot : candidate[bucket].find(sameResource);
      if (existing) {refs.set(key,existing.id); continue;}
      const id = fresh(bucket);
      refs.set(key,id);
      candidate[bucket].push({...copy(row),id});
    }
    for (const {key,bucket,row} of selected) {
      if (bucket !== 'worldBooks') continue;
      const identity = {backupCopyOf:row.id,restoredForCharacterId:id};
      // Another restored card owns its own companion. Reusing only an unchanged copy
      // made for this destination also keeps its imported historical links repeatable.
      const previous = replacing && live.worldBooks.find(book => book.restoredForCharacterId === id && book.backupCopyOf === row.id &&
        equal(book,workRow(row,bucket,book.id,{...identity,backupCopyIndex:book.backupCopyIndex})));
      if (previous) {refs.set(key,previous.id); continue;}
      const bookId = fresh(bucket);
      refs.set(key,bookId);
      candidate.worldBooks.push(workRow(row,bucket,bookId,{...identity,backupCopyIndex:copyIndex(bucket,row.id)}));
    }
    const identity: Fields = {backupCopyOf:plan.work.id,backupCopyIndex:copyIndex(plan.kind,plan.work.id)};
    if (replacing && current) {
      delete identity.backupCopyOf;
      delete identity.backupCopyIndex;
      for (const key of ['creationSource','creationRecordKeys','backupCopyOf','backupCopyIndex','restoredForCharacterId',
        'folderTextHash','folderPortraitHash','folderAvatarPending']) {
        if (Object.hasOwn(current,key)) identity[key] = copy(current[key]);
      }
    }
    const work = workRow(plan.work,plan.kind,id,identity,replacing ? current : null);
    if (replacing) candidate[plan.kind][candidate[plan.kind].findIndex(row => row.id === id)] = work;
    else candidate[plan.kind].push(work);
    const importSnapshots = plan.versions.flatMap((v,i) => choices.snapshots.has(i) ? [{
      entity:JSON.stringify([plan.kind,id]),kind:plan.kind,id,time:v.time,reason:v.reason,label:v.label,
      value:workRow(v.value,plan.kind,id,identity),
    }] : []);
    return {candidate,work,importSnapshots,previous:replacing ? current : null,changed:!replacing || !equal(current,work)};
  }
  Object.assign(globalThis,{TAWorkRestore:{search,review,dependencies,materialize}});
})();
