import assert from 'node:assert/strict';
import test from 'node:test';
import '../js/store.js';
import '../js/work-outcomes.js';
import '../js/work-page.js';

const {related,readers,draftsFor}=globalThis.TAWorkRelations;
const lib=TAStore.verify({
  characters:[{id:0,name:'Pilot',source:{embeddedBookId:'0'},expressionAssetIds:['0',0,2],stickerPackId:0},
    {id:'twin',name:'Pilot',embeddedBookId:0},{id:'detached',embeddedBookId:'',source:{embeddedBookId:0}}],
  worldBooks:[{id:0,name:'Port',entries:[]},{id:'twin',name:'Port',entries:[]}],
  assets:[{id:0,name:'Wave'}],stickerPacks:[{id:0,name:'Signals',stickers:[]}],
  quickReplySets:[{id:0,workSource:{characterId:'0'}},{id:1,workSource:{bookId:0}},
    {id:2,workSource:{characterId:'twin',bookId:'0'}},{id:3,name:'Pilot'}],
});
test('linked works resolve zero and legacy IDs, explicit detachments, same-name records and shared books',()=>{
  const page=related(lib,'character','0');assert.equal(page.work.id,0);assert.equal(page.book.id,0);assert.equal(page.pack.id,0);
  assert.deepEqual(page.expressions.map(a=>a.id),[0]);assert.deepEqual(page.replies.map(set=>set.id),[0,1]);
  assert.deepEqual(readers(lib,'0').map(c=>c.id),[0,'twin']);
  assert.deepEqual(related(lib,'book',0).replies.map(x=>x.id),[1,2]);
  assert.equal(related(lib,'character','detached').book,null);assert.equal(related(lib,'book','missing'),null);
});
test('drafts follow explicit source work, embedded links or generation records; names cannot link siblings',()=>{
  const make=(id,task,value,creationInput)=>({plan:{id,task:'create:'+task,creationInput,
    operations:[{kind:'add',path:[task==='world'?'worldBooks':'characters'],value}]}});
  const origin=JSON.stringify(['response','digest']);
  const rows=[make('direct','world',{id:'b1',name:'Named'},{cardId:0}),make('peer','world',{id:'b2',creationRecordKeys:[origin]}),
    make('embedded','world',{id:0}),make('other','character',{id:'sibling',name:'Pilot'},{cardId:'twin'}),
    make('refers-to-book','character',{id:5,embeddedBookId:'0'})];
  const work={...lib.characters[0],creationRecordKeys:[origin]},library={...lib,characters:[work,...lib.characters.slice(1)]};
  assert.deepEqual(draftsFor(rows,'character',work,library).map(r=>r.id),['direct','peer','embedded']);
  assert.deepEqual(draftsFor(rows,'book',lib.worldBooks[0],library).map(r=>r.id),['refers-to-book']);
});

test('a separate reply in the same generation identifies its companion with or without the archive',()=>{
  const out=TAWorkOutcomes, card={id:0,name:'Shared title'},book={id:'b',name:'Shared title'};
  const source={id:'a',task:'create:character',sourceKey:'a-hash',workBatch:'batch',workRun:'run',workKinds:['character','world']};
  const later={...source,id:'b',task:'create:world',sourceKey:'b-hash',workKinds:['world']};
  out.stamp(card,undefined,source.id,source.sourceKey);
  out.stamp(book,undefined,later.id,later.sourceKey);
  const draft=(value,kind)=>({plan:{id:'draft-'+value.id,task:'create:'+kind,operations:[{kind:'add',path:[kind==='world'?'worldBooks':'characters'],value}]}});
  const shelf=[draft(book,'world')], library={...lib,characters:[card],worldBooks:[]};
  const ids=(records,l=library,rows=shelf)=>draftsFor(rows,'character',card,l,records).map(x=>x.id);
  assert.deepEqual(ids([]),[]);
  assert.deepEqual(ids([source,later]),['draft-b']);
  assert.deepEqual(ids([source,{...later,workRun:'another-run'}]),[]);
  assert.deepEqual(ids([source,{...later,workBatch:'another-batch'}]),[]);
  assert.deepEqual(ids([source,later,{...later,id:'competing-return',sourceKey:'different'}]),[]);
  assert.deepEqual(ids([source,later,{...source,id:'aliased',workOrigin:source.id,workBatch:'fork'}]),[]);
  out.stamp(book,book,later.id,later.sourceKey,[out.recordKey(source)]);
  assert.deepEqual(ids([]),['draft-b']);
  assert.deepEqual(draftsFor([draft(card,'character')],'book',book,{...lib,characters:[],worldBooks:[book]},[]).map(row=>row.id),['draft-0']);
  assert.deepEqual(ids([],{...library,characters:[card,{...card,id:'fork'}]}),[]);
  assert.deepEqual(ids([],library,[...shelf,draft({...book,id:'fork'},'world')]),[]);
  const imported={...book,creationRecordKeys:'legacy text',creationPeerKeys:{corrupt:true}};
  const noOrigin={...card,creationRecordKeys:{unexpected:true}};
  assert.deepEqual(draftsFor([draft(imported,'world')],'character',noOrigin,library,[]),[]);
  assert.equal(imported.creationRecordKeys,'legacy text');
});
