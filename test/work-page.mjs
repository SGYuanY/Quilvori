import assert from 'node:assert/strict';
import test from 'node:test';
import '../js/store.js';
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
  const rows=[make('direct','world',{id:'b1',name:'Named'},{cardId:0}),make('peer','world',{id:'b2',creationRecordKeys:['batch+record']}),
    make('embedded','world',{id:0}),make('other','character',{id:'sibling',name:'Pilot'},{cardId:'twin'}),
    make('refers-to-book','character',{id:5,embeddedBookId:'0'})];
  const work={...lib.characters[0],creationRecordKeys:['batch+record']};
  assert.deepEqual(draftsFor(rows,'character',work).map(r=>r.id),['direct','peer','embedded']);
  assert.deepEqual(draftsFor(rows,'book',lib.worldBooks[0]).map(r=>r.id),['refers-to-book']);
});
