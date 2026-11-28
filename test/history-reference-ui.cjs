'use strict';
const assert=require('node:assert/strict');
const suite=require('./desktop-fixture.cjs');

suite('history-references',async({open,run,wait,click,input,download,win})=>{
  await open('index');
  await run(async()=>{
    TAI18n.save({lang:'en'});
    const lib=TAStore.emptyLibrary();
    lib.characters=[{id:0,name:'Lantern pilot',description:'Original text'}];
    await TAUI.commitLibrary(TAStore.verify(lib),[],true);
    const result={world:{name:'Generated register',entries:[{comment:'Port',content:'Lantern at the quay.'}]}};
    const plan=NIJANAI.proposal(TAUI.state.lib,'create:world',result,{brief:'A harbor'});
    Object.assign(plan,{id:'paired-book',batchId:'commission',result,creationInput:{modules:['world']}});
    await TAStudioDrafts.keep(plan);await NIJANStudio.openDraft(plan.id);
  });
  const editor=()=>run(()=>TAUI.openAddress('characters.html#0'));
  const change=(selector,value)=>run((s,v)=>{
    const field=document.querySelector(s);field.value=String(v);
    if(field.value!==String(v))throw Error('Missing selection '+s);
    field.dispatchEvent(new Event('change',{bubbles:true}));
  },selector,value);
  async function exportBook(){
    const {bytes}=await download('[data-act=json]');
    return JSON.parse(bytes.toString('utf8')).data.character_book;
  }
  await click('[data-plan=paired-book] [data-apply]');
  await wait(()=>TAUI.state.lib.worldBooks.length===1,'generated book in library');
  const id=await run(()=>TAUI.state.lib.worldBooks[0].id);
  await editor();await change('#attach-book',id);assert.ok(await run(()=>TAUI.flush()));
  await run(()=>TAUI.go('studio'));await click('#ai-undo');
  await wait(()=>[...document.querySelectorAll('.toast-message')].some(el=>el.textContent.includes('Unlink')&&el.textContent.includes('Lantern pilot')),'named surviving reference');
  assert.ok(!await run(()=>TAStudioDrafts.pending().some(r=>r.plan.id==='paired-book')));
  await editor();assert.equal((await exportBook()).name,'Generated register');
  await change('#attach-book','');assert.ok(await run(()=>TAUI.flush()));
  await run(()=>TAUI.go('studio'));await click('#ai-undo');
  await wait(()=>!TAUI.state.lib.worldBooks.length&&TAStudioDrafts.pending().some(r=>r.plan.id==='paired-book'),'unreferenced adoption undone');

  for(const mode of ['keep','unlink','replace','stale']){
    await run(async()=>{
      const lib=TAStore.emptyLibrary();
      lib.characters=[{id:0,name:'Pilot',description:'Snapshot text',source:{embeddedBookId:'old',author:'Initial credit'}}];
      lib.worldBooks=['old','current',0].map(id=>({id,name:'Register '+id,entries:[{id:0,comment:'Port',content:'Harbor.'}]}));
      await TAUI.commitLibrary(TAStore.verify(lib),[],true);
    });
    await editor();await click('.revision-panel summary');
    await input('.revision-panel [data-label]','Original edition');await click('.revision-panel [data-snapshot]');
    await wait(()=>document.querySelector('[data-versions]')?.options.length===1,'snapshot with a source-book link');
    await run(()=>TAUI.openAddress('lore.html#old'));await click('#del-book');await click('#modal-root [data-act=yes]');
    await wait(()=>!TAStore.byId(TAUI.state.lib.worldBooks,'old'),'original book deleted');
    await editor();await change('#attach-book','current');await input('#char-form [data-field=description]','Current text');
    assert.ok(await run(()=>TAUI.flush()));await click('.revision-panel summary');
    await wait(()=>!!document.querySelector('[data-restore]:not(:disabled)'),'rollback enabled');
    await click('[data-restore]');
    assert.equal(await run(()=>document.querySelector('[data-history-link]').value),'keep');
    assert.ok(await run(()=>document.querySelector('#modal-root .integrity-content').textContent.includes('Library ID old')));
    await click('#modal-root [data-act=no]');
    assert.deepEqual(await run(()=>[TAUI.state.lib.characters[0].description,TAUI.state.lib.characters[0].embeddedBookId]),['Current text','current']);
    await click('[data-restore]');await change('[data-history-link]',mode==='stale'?'replace':mode);
    if(mode==='replace'||mode==='stale'){
      assert.ok(await run(()=>document.querySelector('#modal-root [data-act=yes]').disabled));
      await change('[data-history-replacement]','0');
    }
    if(mode==='stale'){
      // The choice was made while this book existed. Simulate a completed local
      // mutation before the confirmation callback reads the live library again.
      await run(async()=>{
        const lib=TAUI.state.lib;await TAUI.commitLibrary({...lib,worldBooks:lib.worldBooks.filter(row=>row.id!==0)});
      });
    }
    await click('#modal-root [data-act=yes]');
    if(mode==='stale'){
      await wait(()=>[...document.querySelectorAll('.revision-panel [role=status], .toast-message')]
        .some(el=>[TAUI.t('history.reviewLinks'),TAUI.t('资料库已变化，请重新打开。')].includes(el.textContent)),
        'stale replacement rejected');
      await win.webContents.reload();await wait(()=>!!document.querySelector('#attach-book'),'current character after rejected rollback');
      assert.deepEqual(await run(async()=>{
        const card=TAUI.state.lib.characters[0],versions=await TAHistory.list('characters',card.id);
        return [card.description,card.embeddedBookId,versions.some(row=>row.reason==='回滚前')];
      }),['Current text','current',false]);
      continue;
    }
    await wait(()=>TAUI.state.lib.characters[0].description==='Snapshot text','rollback persisted');
    await win.webContents.reload();await wait(()=>!!document.querySelector('#attach-book'),'restored character after restart');
    const attached=mode==='keep'?'current':mode==='replace'?0:'';
    assert.deepEqual(await run(()=>{const c=TAUI.state.lib.characters[0];return [c.embeddedBookId,c.description,c.source.author,c.source.embeddedBookId??null];}),
      [attached,'Snapshot text','Initial credit',null]);
    const exported=await exportBook();
    assert.equal(exported?.name,attached===''?undefined:'Register '+attached);
    const versions=await run(async()=>(await TAHistory.list('characters',0)).map(v=>[v.reason,v.value.description,v.label]));
    assert.ok(versions.some(([reason,body])=>reason==='回滚前'&&body==='Current text'));
    assert.ok(versions.some(([,body,label])=>body==='Snapshot text'&&label==='Original edition'));
  }
  await run(async()=>{
    const lib=TAStore.emptyLibrary();
    lib.worldBooks=[{id:0,name:'Port rules',entries:[{id:0,comment:'Signal',content:'Blue'},{id:1,comment:'Harbor',content:'East'}]}];
    lib.quickReplySets=[{id:0,name:'Dock replies',replies:[{id:0,label:'Ready',message:'Ready to sail'}],
      workSource:{bookId:'0',entryIds:['0',1],scope:'selected'}}];
    await TAUI.commitLibrary(TAStore.verify(lib),[],true);TAUI.state.loreUndo?.clear();
    TAUI.openAddress('lore.html#0');
  });
  await click('.entry[data-id="0"]');await click('#del-entry');
  assert.deepEqual(await run(()=>TAUI.state.lib.worldBooks[0].entries.map(row=>row.id)),[0,1],'the editor keeps the entry used by a saved Quick Reply');
  assert.equal(await run(()=>TAUI.state.loreUndo.get(0).length),0,'blocked deletion does not add an undo step');
  await wait(()=>[...document.querySelectorAll('.toast-message')].some(el=>el.textContent.includes('Dock replies')),'owner of the protected entry');
  await click('[data-toast-id=entry-references]:not(.toast-leaving) .toast-action');
  await wait(()=>TAUI.state.route==='quick' && !!document.querySelector('[data-unlink-reply-entry]'),'open the referencing set');
  await click('[data-unlink-reply-entry]');
  assert.deepEqual(await run(()=>[TAUI.state.lib.quickReplySets[0].workSource.entryIds,TAUI.state.lib.quickReplySets[0].replies[0].message]),[[1],'Ready to sail']);
  await run(()=>TAUI.openAddress('lore.html#0'));await click('.entry[data-id="0"]');await click('#del-entry');
  assert.deepEqual(await run(()=>TAUI.state.lib.worldBooks[0].entries.map(row=>row.id)),[1]);
  await click('#lore-undo');assert.deepEqual(await run(()=>TAUI.state.lib.worldBooks[0].entries.map(row=>row.id)),[0,1]);
  await click('#new-entry');
  const fresh=await run(()=>TAUI.state.sel.entry);
  await run(()=>TAUI.go('quick'));await change('[data-ref-world]','0');await change('[data-ref-scope]','selected');
  await click('.reply-entry-choices input[value="'+fresh+'"]');await run(()=>TAUI.openAddress('lore.html#0'));
  const steps=await run(()=>TAUI.state.loreUndo.get(0).length);
  await click('#lore-undo');
  assert.ok(await run(id=>!!TAStore.byId(TAUI.state.lib.worldBooks[0].entries,id),fresh));
  assert.equal(await run(()=>TAUI.state.loreUndo.get(0).length),steps,'blocked undo keeps the prior version available');
  await click('[data-toast-id=entry-references]:not(.toast-leaving) .toast-action');
  await wait(()=>TAUI.state.route==='quick' && document.activeElement?.value===TAUI.state.replyReference.entryIds[0],'focus the current source selection');
  await click('.reply-entry-choices input[value="'+fresh+'"]');await run(()=>TAUI.openAddress('lore.html#0'));await click('#lore-undo');
  assert.ok(await run(()=>TAUI.flush()));await open('lore');
  assert.deepEqual(await run(()=>[TAUI.state.lib.worldBooks[0].entries.map(e=>e.id),TAUI.state.lib.quickReplySets[0].workSource.entryIds]),[[0,1],[1]]);
  console.log('AI undo, snapshot rollback and world entry deletion/undo preserve active Quick Reply references through restart.');
});
