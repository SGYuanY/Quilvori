/* Exercise the relationship graph, world editor and Quick Reply references in an isolated renderer. */
const assert = require('node:assert/strict');
const suite = require('./desktop-fixture.cjs');

suite('graph-sync',async ({run,wait,open,click,input,download})=>{
  await open('graph');
  await run(async()=>{
    const lib=TAStore.emptyLibrary();
    lib.characters=[{id:0,name:'Birch'},{id:'c',name:'River'}];
    lib.graph.nodes=[{id:7,characterId:null,label:'Station',x:100,y:80}];
    lib.worldBooks=[
      {id:'manual',name:'关系图',entries:[{id:'mine',comment:'Own work',content:'Private history'}]},
      {id:'legacy',name:'关系图',description:'由角色关系图导出的世界书条目。',entries:[{id:'old',comment:'Old edge',content:'Historical draft'}]},
    ];
    await TAUI.commitLibrary(TAStore.verify(lib));TAUI.renderStage();
  });
  const select=(selector,value)=>run((q,v)=>{
    const el=document.querySelector(q);el.value=String(v);
    if(el.value!==String(v))throw Error('Missing option: '+v);
    el.dispatchEvent(new Event('change',{bubbles:true}));
  },selector,value);
  await input('#edge-label','Unfinished line');await input('#edge-note','Keep these notes');
  await click('#sync-nodes');await click('#sync-nodes');
  const after=await run(()=>({
    names:[...document.querySelector('#edge-to').options].map(o=>o.text),
    sizes:[TAUI.state.lib.graph.nodes.length,document.querySelector('#edge-from').length],
    fields:['edge-from','edge-to','edge-label','edge-note'].map(id=>document.getElementById(id).value),
    first:TAUI.state.lib.graph.nodes.find(n=>n.characterId===0).id,
    other:TAUI.state.lib.graph.nodes.find(n=>n.characterId==='c').id,
  }));
  assert.deepEqual(after.names,['Station','Birch','River']);assert.deepEqual(after.sizes,[3,3]);
  assert.deepEqual(after.fields,['7','7','Unfinished line','Keep these notes']);
  await select('#edge-from',after.first);await select('#edge-to',after.other);
  const edge=async(label,note)=>{
    await input('#edge-label',label);await input('#edge-note',note);await click('#add-edge');
    return run(()=>TAUI.state.lib.graph.edges.at(-1).id);
  };
  const regen=await edge('Courier route','Unreferenced managed entry');
  const keep=await edge('Ally','Keep in graph'),linked=await edge('Pen pals','Letters'),removed=await edge('Rivals','Removed');
  const first=await download('#export-graph');
  assert.equal(JSON.parse(first.bytes).name,'关系图 (2)');
  const dump=()=>run(()=>{const lib=TAUI.state.lib;return {
    book:lib.worldBooks.find(b=>b.id===lib.graph.exportBookId),
    protected:lib.worldBooks.filter(b=>b.id==='manual'||b.id==='legacy'),
    n:lib.worldBooks.length,graph:lib.graph,
  };});
  const initial=await dump(),b=initial.book;
  assert.equal(initial.n,3);const oldBooks=initial.protected;
  const fromEdge=(book,id)=>book.entries.find(row=>row.graphSource?.edgeId===id);
  const recoverable=fromEdge(b,regen),alive=fromEdge(b,keep),orphan=fromEdge(b,linked),lost=fromEdge(b,removed);
  assert.notEqual(alive.id,orphan.id);assert.notEqual(alive.stUid,orphan.stUid);
  await open('lore');await select('#book-select',b.id);
  await wait(id=>TAUI.state.sel.book===id || document.querySelector('[data-book-field=name]')?.value==='关系图 (2)','select the generated book',b.id);
  await input('[data-book-field=name]','Harbor graph');
  await click('.entry[data-id="'+alive.id+'"]');await input('#lore-editor [data-field=depth]','9');
  await click('#new-entry');await input('#lore-editor [data-field=comment]','An independent page');
  await input('#lore-editor [data-field=content]','This page was written by hand.');
  assert.ok(await run(()=>TAUI.flush()));

  await open('quick');await click('#new-qr');await input('#qr-body [data-field=name]','Correspondence');
  await select('[data-ref-world]',b.id);await select('[data-ref-scope]','selected');
  await click('.reply-entry-choices input[value="'+alive.id+'"]');
  await click('.reply-entry-choices input[value="'+orphan.id+'"]');
  await run(async()=>{
    // Persist the source the actual generation controls selected, without invoking a model.
    const lib=TAUI.state.lib, set=lib.quickReplySets.find(s=>s.id===TAUI.state.sel.qr);
    set.workSource=TACreationAssist.quickContext(lib,TAUI.state.replyReference,'Write a reply').quickSource;
    TAUI.markDirty('quickReplySets',set.id);await TAUI.flush();
  });
  await open('characters');await click('[data-act=view-edit]');
  await run(()=>{TAUI.state.sel.character=0;TAUI.renderStage();});
  await input('[data-field=name]','Meadow');assert.ok(await run(()=>TAUI.flush()));
  await open('graph');await click('#sync-nodes');
  assert.ok(await run(()=>[...document.querySelector('#edge-from').options].some(o=>o.text==='Meadow')));
  const remove=async id=>{
    await run(id=>document.querySelector('[data-edge="'+id+'"]').dispatchEvent(new MouseEvent('click',{bubbles:true})),id);
    await click('#del-edge');
  };
  await remove(linked);await remove(removed);
  await select('#edge-from',after.other);await select('#edge-to',7);const extra=await edge('Courier','New connection');
  const again=await download('#export-graph'),native=JSON.parse(again.bytes);
  assert.equal(again.filename,'Harbor graph.json');assert.equal(native.name,'Harbor graph');
  assert.equal(native.entries[alive.stUid].depth,9);assert.match(native.entries[alive.stUid].comment,/Meadow/);
  assert.equal(native.entries[orphan.stUid].content.includes('Letters'),true);
  assert.ok(Object.values(native.entries).some(e=>e.content==='This page was written by hand.'));
  assert.ok(!Object.values(native.entries).some(e=>e.keysecondary.includes('Rivals')));
  assert.ok(!again.bytes.toString().includes('graphSource'));
  assert.match(await run(()=>document.querySelector('#export-slip').textContent),/ordinary entries|普通条目/);
  await open('graph');const reread=await dump();
  assert.deepEqual(reread.protected,oldBooks);assert.equal(reread.n,3);assert.equal(reread.book.id,b.id);
  assert.equal(fromEdge(reread.book,keep).id,alive.id);assert.equal(fromEdge(reread.book,extra).stUid,native.entries[fromEdge(reread.book,extra).stUid].uid);
  assert.equal(reread.book.entries.find(e=>e.id===orphan.id).graphSource,undefined);
  assert.ok(!reread.book.entries.some(e=>e.id===lost.id));
  const savedHistory=await run(id=>TAHistory.list('worldBooks',id),b.id);
  assert.ok(savedHistory.some(row=>row.reason==='关系图同步前' && row.value.entries.some(e=>e.id===lost.id)));
  await download('#export-graph');assert.deepEqual((await dump()).book,reread.book);
  assert.equal((await run(id=>TAHistory.list('worldBooks',id),b.id)).length,savedHistory.length);
  await open('quick');
  assert.deepEqual(await run(()=>{
    const lib=TAUI.state.lib,set=lib.quickReplySets.find(s=>s.name==='Correspondence');
    return TACreationAssist.quickContext(lib,set.workSource,'Write a reply').reference.book.entries.map(e=>e.id);
  }),[alive.id,orphan.id]);
  const deleteManagedRow=async()=>{
    await open('lore');await select('#book-select',b.id);
    await click('.entry[data-id="'+recoverable.id+'"]');await click('#del-entry');assert.ok(await run(()=>TAUI.flush()));
    return run(id=>{
      const book=TAUI.state.lib.worldBooks.find(b=>b.id===id);
      return Object.values(TAFormats.bookToWorldInfo(book).entries).find(e=>e.comment==='An independent page').uid;
    },b.id);
  };
  const manualUid=await deleteManagedRow();
  assert.equal(manualUid,recoverable.stUid,'The standalone hand-written row now has the deleted row’s implicit native UID');
  await open('graph');await download('#export-graph');await open('graph');
  const rebuilt=fromEdge((await dump()).book,regen);
  assert.equal(rebuilt.id,recoverable.id);assert.notEqual(rebuilt.stUid,manualUid);
  const third=JSON.parse((await download('#export-graph')).bytes);
  assert.equal(third.entries[manualUid].comment,'An independent page');
  assert.equal(await deleteManagedRow(),manualUid);
  await open('graph');await download('#export-graph');await open('graph');
  const reused=fromEdge((await dump()).book,regen);
  assert.deepEqual([reused.id,reused.stUid],[rebuilt.id,rebuilt.stUid],'Unclaimed native and local IDs are reused');
  await open('quick');
  assert.ok(await run(id=>{
    const lib=TAUI.state.lib,set=lib.quickReplySets.find(s=>s.name==='Correspondence');
    return TACreationAssist.quickContext(lib,set.workSource,'Write a reply').reference.book.entries.some(e=>e.id===id);
  },alive.id));
  console.log('Graph synchronization, protected names, native/local entry identity, round-trip edits and Quick Reply references passed.');
});
