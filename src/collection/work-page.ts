// Portable relationships use library IDs. A numeric ID and its HTML string value
// identify the same item within one collection, including ID zero.
(() => {
  type Id = string | number;
  type Kind = 'character' | 'book';
  interface Item { id: Id; name?: string; }
  interface Work extends Item {
    embeddedBookId?: Id | null; source?: {embeddedBookId?: Id | null};
    stickerPackId?: Id | null; expressionAssetIds?: Id[];
  }
  interface Reply extends Item {workSource?: {characterId?: Id; bookId?: Id};}
  interface Draft {plan: {id: string; task: string; creationInput?: {cardId?: Id; bookId?: Id};
    operations?: {kind: string; path: unknown[]; value?: Work}[]};}
  interface Library { characters: Work[]; worldBooks: Work[]; assets: Item[]; stickerPacks: Item[]; quickReplySets: Reply[]; }
  const store=(globalThis as unknown as {TAStore:{byId<T extends Item>(items:T[],id?:Id|null):T|null}}).TAStore;
  const origins=(globalThis as unknown as {TAWorkOutcomes:{
    companionDrafts(kind:'character'|'world',work:Work,lib:Library,plans:Draft['plan'][],records:unknown[]):ReadonlySet<string>;
  }}).TAWorkOutcomes;
  const valid=(id: unknown):id is Id => typeof id==='string' ? id.length>0 : Number.isSafeInteger(id);
  const equal=(a: unknown,b: unknown) => valid(a) && valid(b) && String(a)===String(b);
  const attached=(card: Work) => card.embeddedBookId ?? card.source?.embeddedBookId;
  function duplicateNames(items: Item[]) {
    const seen=new Set<string>(),repeated=new Set<string>();
    for(const item of items){
      const name=(item.name || '').trim();
      if(seen.has(name))repeated.add(name);
      else seen.add(name);
    }
    return repeated;
  }
  function readers(lib: Library,bookId: Id):Work[] {
    return lib.characters.filter(card=>equal(attached(card),bookId));
  }
  function draftsFor(rows: Draft[],kind: Kind,work: Work,lib: Library,records:unknown[] = []) {
    const paired=origins.companionDrafts(kind==='book'?'world':'character',work,lib,rows.map(row=>row.plan),records);
    return rows.flatMap(({plan})=>{
      const bucket=plan.task==='create:character'?'characters':plan.task==='create:world'?'worldBooks':null;
      if(!bucket)return [];
      const value=plan.operations?.find(op=>op?.kind==='add' && op.path?.[0]===bucket)?.value;
      if(!value)return [];
      const reference=kind==='character'?plan.creationInput?.cardId:plan.creationInput?.bookId;
      const embedded=kind==='character'?bucket==='worldBooks' && equal(attached(work),value.id):
        bucket==='characters' && equal(attached(value),work.id);
      return equal(reference,work.id) || paired.has(plan.id) || embedded ? [{id:plan.id,name:value.name,kind:bucket==='characters'?'character':'book'}] : [];
    });
  }
  function related(lib: Library,kind: Kind,id: Id) {
    const work=store.byId(kind==='character'?lib.characters:lib.worldBooks,id);
    if(!work)return null;
    const card=kind==='character', book=card?store.byId(lib.worldBooks,attached(work)):work;
    const ids=new Set((work.expressionAssetIds || []).filter(valid).map(String));
    const assets=new Map(lib.assets.map(asset=>[String(asset.id),asset]));
    const expressions=Array.from(ids).flatMap(key=>assets.has(key)?[assets.get(key)!]:[]);
    const replies=lib.quickReplySets.filter(set=>{
      const ref=set.workSource;
      if(card && valid(ref?.characterId))return equal(ref.characterId,work.id);
      return !!book && equal(ref?.bookId,book.id);
    });
    return {work,book,readers:book?readers(lib,book.id):[],expressions,pack:store.byId(lib.stickerPacks,work.stickerPackId),replies};
  }
  Object.assign(globalThis,{TAWorkRelations:{related,readers,draftsFor,duplicateNames}});
})();
