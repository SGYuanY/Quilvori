// Resolve a model response against today's durable draft shelf and library.
// All IDs returned to the UI come from a matching stored entity.
(() => {
  type Kind = 'character' | 'world';
  type Id = number | string;
  type Status = 'draft' | 'adopted' | 'recoverable' | 'attention' | 'working';
  interface ResponseRecord {
    id: string; task: string; status?: string; output?: string; sourceKey?: string;
    workOrigin?: string; workRun?: string; workBatch?: string;
    workKinds?: Kind[]; workSelection?: Kind[]; failedDraftKinds?: Kind[];
    error?: string; errorCode?: string; emptyReason?: string;
  }
  interface Work {
    id: Id; name?: string; creationSource?: string; creationRecordKeys?: unknown; creationPeerKeys?: unknown;
  }
  interface Plan {
    id: string; task: string; batchId?: string; sourceKey?: string; draftSaveError?: string;
    operations?: {kind: string; path: string[]; value?: Work; applied?: boolean}[];
  }
  interface Library {characters: Work[]; worldBooks: Work[];}
  interface Parsed {ready: boolean; name?: string; error?: string;}
  type Parse = (record: ResponseRecord, kind: Kind) => Parsed;
  interface Outcome {
    kind: Kind; status: Status; source: ResponseRecord; name?: string; detail?: string;
    workId?: Id; draftId?: string; literalDetail?: boolean;
  }
  const kinds: Kind[] = ['character','world'];
  const bucket = {character:'characters',world:'worldBooks'} as const;

  function requested(record: ResponseRecord): Kind[] {
    const wanted = kinds.filter(kind => Array.isArray(record.workKinds) && record.workKinds.includes(kind));
    return wanted.length ? wanted : kinds.filter(kind => record.task==='create:'+kind);
  }
  function key(id: string | undefined, hash: string | undefined): string | undefined {
    return id && hash ? JSON.stringify([id,hash]) : undefined;
  }
  function recordKey(record: ResponseRecord): string | undefined {
    return key(record.workOrigin || record.id, record.sourceKey);
  }
  function isRecordKey(value: unknown): value is string {
    if (typeof value!=='string' || value[0]!=='[') return false;
    try {
      const pair: unknown=JSON.parse(value);
      return Array.isArray(pair) && pair.length===2 && pair.every(part=>typeof part==='string' && part.length>0) &&
        JSON.stringify(pair)===value;
    } catch { return false; }
  }
  function keys(work?: Work, field: 'creationRecordKeys'|'creationPeerKeys' = 'creationRecordKeys'): string[] {
    const values=work?.[field];
    return Array.isArray(values) ? values.filter(isRecordKey) : [];
  }
  function stamp(work: Work, previous: Work | undefined, recordId: string | undefined, hash: string, peerKeys: string[] = []): void {
    work.creationSource = hash;
    const unique = key(recordId,hash);
    if (unique) work.creationRecordKeys = [...new Set([...keys(previous),unique])];
    const peers = new Set([...keys(previous,'creationPeerKeys'),...peerKeys.filter(isRecordKey)]);
    peers.delete(unique ?? '');
    if (peers.size) work.creationPeerKeys = [...peers];
  }
  function item(plan: Plan, kind: Kind): Work | undefined {
    if (plan.task !== 'create:'+kind) return;
    return Array.isArray(plan.operations) ? plan.operations.find(op => op?.kind==='add' && op.path?.[0]===bucket[kind])?.value : undefined;
  }
  function groupFor(selected: ResponseRecord, records: ResponseRecord[]): ResponseRecord[] {
    if (!selected.workRun) return [selected];
    const group = records.filter(record => record.workRun===selected.workRun && record.workBatch===selected.workBatch);
    // Offline branches may contain competing editions of the same request.
    // Group only when each primary request occurs once in this generation.
    return group.includes(selected) && new Set(group.map(r => r.task)).size===group.length ? group : [selected];
  }
  // Older works have only their own return receipt. A retained, unambiguous run
  // can still identify its other reply. Persist this exact key in newly recovered drafts.
  function peerRecordKeys(record: ResponseRecord,records: ResponseRecord[]): string[] {
    if (!record.workRun || !record.workBatch) return [];
    const group=groupFor(record,records);
    if (group.length<2) return [];
    const related=new Set(group);
    const receipts=new Set(group.map(recordKey).filter(isRecordKey));
    // A forked backup may alias a return ID into a second batch while retaining
    // its original receipt. That receipt cannot identify a unique generation.
    if (records.some(r=>!related.has(r) && receipts.has(recordKey(r) ?? ''))) return [];
    return group.filter(row=>row!==record).map(recordKey).filter(isRecordKey);
  }
  function companionDrafts(kind: Kind, work: Work, library: Library, plans: Plan[], records: ResponseRecord[]): Set<string> {
    const matches=new Set<string>(), own=keys(work);
    const other=kind==='character'?'world':'character';
    const candidates=plans.flatMap(plan=>{
      const value=item(plan,other);
      return value?[{plan,value}]:[];
    });
    if (!own.length || !candidates.length) return matches;
    // A backup may hold multiple editions of the same receipt. Explicit references
    // are handled by ID in the work page; automatic pairing requires unique owners.
    function ambiguous(side: Kind) {
      const seen=new Set<string>(),duplicates=new Set<string>();
      const drafts=plans.map(p=>item(p,side)).filter((w):w is Work=>w!==undefined);
      for (const w of [...library[bucket[side]],...drafts]) {
        const receipts=keys(w);
        if (!receipts.length) continue;
        for (const claim of new Set([...receipts,...keys(w,'creationPeerKeys')])) {
          if (seen.has(claim)) duplicates.add(claim);
          seen.add(claim);
        }
      }
      return duplicates;
    }
    const ambiguousOwn=ambiguous(kind), ambiguousOther=ambiguous(other);
    const sources=new Set(own.filter(k=>!ambiguousOwn.has(k)));
    if (!sources.size) return matches;
    const possible=new Set([...sources,...keys(work,'creationPeerKeys').filter(k=>!ambiguousOwn.has(k))]);
    for (const record of records) {
      const k=recordKey(record);
      if (k && sources.has(k) && requested(record).includes(kind)) {
        for (const peer of peerRecordKeys(record,records)) possible.add(peer);
      }
    }
    for (const {plan,value} of candidates) {
      const receipts=keys(value).filter(k=>!ambiguousOther.has(k));
      if (receipts.length && (receipts.some(k=>possible.has(k)) ||
          keys(value,'creationPeerKeys').some(k=>!ambiguousOther.has(k) && sources.has(k)))) matches.add(plan.id);
    }
    return matches;
  }
  function legacyPlan(plan: Plan, work: Work, record: ResponseRecord, unambiguous: boolean): boolean {
    return unambiguous && !record.workRun && !keys(work).length && !!record.sourceKey && !!record.workBatch &&
      plan.batchId===record.workBatch && (plan.sourceKey || work.creationSource)===record.sourceKey;
  }
  function stoppedReason(record: ResponseRecord): string {
    if (record.errorCode==='first-byte-timeout') return '等待接口首个数据包超时。可在模型设置延长空闲等待。';
    if (record.errorCode==='idle-timeout') return '等待正文超时，没有可恢复的作品。';
    if (record.status==='cancelled') return '任务已停止，没有可恢复的正文。';
    if (record.emptyReason==='reasoning') return '接口只返回了推理，没有写作正文。';
    return '这次请求没有留下可恢复的正文。';
  }

  function resolve(
    selected: ResponseRecord, records: ResponseRecord[], library: Library,
    drafts: Plan[], session: Plan[], parse: Parse,
  ): Outcome[] {
    const group = groupFor(selected,records);
    const selectedKinds = new Set<Kind>();
    for (const record of group) {
      for (const kind of record.workSelection?.length ? record.workSelection : requested(record)) selectedKinds.add(kind);
    }
    const outcomes: Outcome[] = [];
    for (const kind of kinds) {
      const offered = group.filter(r => requested(r).includes(kind));
      const source = offered.find(r => r.task==='create:'+kind) || offered[0] || selected;
      // An explicitly recovered extra may be present even though the original request omitted it.
      const origins = new Set(group.map(recordKey).filter((v): v is string => v!==undefined));
      const matches = (work: Work) => keys(work).some(origin => origins.has(origin));
      const peers = records.filter(r => !r.workRun && r.workBatch===source.workBatch && r.sourceKey===source.sourceKey && requested(r).includes(kind));
      const legacy = (plan: Plan, work: Work) => legacyPlan(plan,work,source,peers.length===1);
      const pending: {plan: Plan; work: Work}[] = [];
      for (const plan of drafts) {
        const work = item(plan,kind);
        if (work && (matches(work) || legacy(plan,work))) pending.push({plan,work});
      }
      const works = library[bucket[kind]];
      const adopted = works.filter(work => matches(work) || (!!source.sourceKey && work.creationSource===source.sourceKey &&
        session.some(plan => {
          const planned = item(plan,kind);
          return planned?.id===work.id && legacy(plan,planned);
        })));
      if (!selectedKinds.has(kind) && !pending.length && !adopted.length) continue;
      const base = {kind,source};
      if (adopted.length+pending.length>1) {
        outcomes.push({...base,status:'attention',detail:'有多个作品关联这次返回，无法确定唯一去向。'});
      } else if (adopted[0]) {
        outcomes.push({...base,status:'adopted',workId:adopted[0].id,name:adopted[0].name});
      } else if (pending[0]) {
        outcomes.push({...base,status:'draft',draftId:pending[0].plan.id,name:pending[0].work.name});
      } else if (!source.workRun && source.sourceKey && (works.some(w => !keys(w).length && w.creationSource===source.sourceKey) ||
        drafts.some(p => {const w=item(p,kind); return w && !keys(w).length && (p.sourceKey || w.creationSource)===source.sourceKey;}))) {
        outcomes.push({...base,status:'attention',detail:'旧记录中有相同正文，但缺少能确认作品身份的关联。'});
      } else if (source.status==='running' || source.status==='received') {
        outcomes.push({...base,status:'working'});
      } else if (!offered.length || !source.output?.trim()) {
        outcomes.push({...base,status:'attention',detail:!offered.length ? '这一轮尚未收到这件作品的回复。' : stoppedReason(source)});
      } else {
        const parsed = parse(source,kind);
        const unsaved = source.failedDraftKinds?.includes(kind) || session.some(plan => {
          const work = item(plan,kind);
          return plan.draftSaveError && work && (matches(work) || legacy(plan,work));
        });
        outcomes.push(parsed.ready ?
          {...base,status:'recoverable',name:parsed.name,detail:unsaved ? '草稿写入失败，可以从已保存的回复重试。' : undefined} :
          {...base,status:'attention',detail:parsed.error || source.error || '这次请求没有留下可恢复的正文。',literalDetail:!!(parsed.error || source.error)});
      }
    }
    return outcomes;
  }
  Object.assign(globalThis,{TAWorkOutcomes:{requested,recordKey,isRecordKey,stamp,resolve,peerRecordKeys,companionDrafts}});
})();
