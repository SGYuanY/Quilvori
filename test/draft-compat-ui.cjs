'use strict';
const assert = require('node:assert/strict');
const suite = require('./desktop-fixture.cjs');

suite('draft-compat', async ({open, run, wait, click, input, download, file, win}) => {
  await open('studio');
  await run(async () => {
    const lib = TAStore.emptyLibrary();
    lib.characters = [{id:0, name:'Reference pilot', description:'Harbor records.', creationRecordKeys:{extension:'unknown'}}];
    lib.worldBooks = [{id:7, name:'Reference book', entries:[{id:0, comment:'Port', content:'Reference tide.'}]}];
    await TAUI.commitLibrary(TAStore.verify(lib), [], true);
    TAI18n.save({lang:'en'});
    await NIJANModel.ready;
    NIJANModel.save({baseUrl:'https://model.example.invalid/v1', key:'offline-fixture', protocol:'chat', model:'synthetic'});
    await NIJANModel.flushCredentials();
    window.queuedReplies = [];
    window.fetch = async () => {
      if (!window.queuedReplies.length) throw Error('Unexpected additional model request');
      const content = JSON.stringify(window.queuedReplies.shift());
      return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content}}]}),
        {headers:{'content-type':'application/json'}});
    };
    TAUI.renderStage();
  });

  async function generate(split, adopt) {
    await run(() => TAUI.go('studio'));
    await click('[data-mode=create]');
    await click('#ai-create-new');
    await input('#ai-brief', 'The same commission at the harbor.');
    const previous = await run(split => {
      for (const box of document.querySelectorAll('[data-module]')) {
        if (box.checked !== ['character','world'].includes(box.dataset.module)) box.click();
      }
      for (const id of ['#ai-card-pick','#ai-book-pick']) {
        const pick = document.querySelector(id);
        pick.value = '';
        pick.dispatchEvent(new Event('change', {bubbles:true}));
      }
      const character = {name:'Same pilot', description:'Marks the tide.'};
      const world = {name:'Same book', entries:[{comment:'Lamp',content:'A quiet port.'}]};
      window.queuedReplies = split ? [{character},{world}] : [{character,world}];
      return TAStudioDrafts.pending().map(r => r.plan.id);
    }, split);
    await click('#ai-create');
    await wait(previous => !NIJANStudio.running() && !window.queuedReplies.length &&
      TAStudioDrafts.pending().filter(r => !previous.includes(r.plan.id)).length === 2, 'both generated drafts', previous);
    const pair = await run((previous, adopt) => {
      const plans = TAStudioDrafts.pending().map(r => r.plan).filter(p => !previous.includes(p.id));
      const chosen = plans.find(p => p.task === 'create:'+adopt), peer = plans.find(p => p !== chosen);
      return {workId:chosen.operations[0].value.id, draftId:chosen.id, peerId:peer.id,
        kind:adopt === 'character' ? 'character' : 'book', batch:chosen.batchId};
    }, previous, adopt);
    await click('[data-plan="'+pair.draftId+'"] [data-apply]');
    await wait(id => !TAStudioDrafts.pending().some(r => r.plan.id === id), 'adopted work', pair.draftId);
    return pair;
  }

  async function onPage(kind, id) {
    await run((kind, id) => {
      TAUI.go('home');
      document.querySelector('[data-collection-type="'+kind+'"][data-collection-open="'+CSS.escape(String(id))+'"]').click();
    }, kind, id);
    return run(() => [...document.querySelectorAll('[data-work-draft]')].map(b => b.dataset.workDraft));
  }
  const first = await generate(true, 'character'), second = await generate(false, 'world');
  for (const pair of [first,second]) assert.deepEqual(await onPage(pair.kind, pair.workId), [pair.peerId]);
  const counts = await run(batches => batches.map(batch => NIJANModel.history().filter(r => r.workBatch === batch).length),
    [first.batch,second.batch]);
  assert.deepEqual(counts, [2,1]);
  await run(async () => {
    // The device rotates older response bodies. Durable work relationships must survive.
    for (let i=0; i<24; i++) {
      await TACreationRecords.save({id:'later-'+i, task:'create:world', status:'validated',
        startedAt:new Date(Date.now()+10000+i).toISOString(), output:'Later sample '+i, epoch:TACreationRecords.epoch()});
    }
  });
  await win.webContents.reload();
  await wait(() => !!TAUI.state.lib && !!document.querySelector('[data-work-page]'), 'reload after response rotation');
  assert.ok(await run(batches => !NIJANModel.history().some(r => batches.includes(r.workBatch)), [first.batch,second.batch]));
  for (const pair of [first,second]) assert.deepEqual(await onPage(pair.kind, pair.workId), [pair.peerId]);

  await run(async () => {
    const defs = [{character:{name:'Legacy companion',description:'A companion.'}},
      {world:{name:'Legacy tide',entries:[{comment:'Tide',content:'At dawn.'}]}}];
    for (const result of defs) {
      const kind = Object.keys(result)[0], plan = NIJANAI.proposal(TAUI.state.lib,'create:'+kind,result,{brief:'A legacy commission.'});
      Object.assign(plan,{id:'old-'+kind,batchId:'old-batch',result,creationInput:{brief:'A legacy commission.',cardId:'0',bookId:'7'}});
      if (kind === 'world') plan.operations[0].value.creationRecordKeys = 'unknown extension value';
      await TAStudioDrafts.keep(plan);
    }
  });
  assert.deepEqual((await onPage('character',0)).sort(), ['old-character','old-world']);
  await click('[data-work-draft="old-world"]');
  await wait(() => !!document.querySelector('[data-plan="old-world"]'), 'legacy draft editor');
  const references = () => run(() => {
    const ref = NIJANStudio.modelReference('tide');
    return [document.querySelector('#ai-card-pick').value, document.querySelector('#ai-book-pick').value,
      ref.card?.id,ref.book?.id,[...document.querySelectorAll('[data-module]:checked')].map(b => b.dataset.module)];
  });
  assert.deepEqual(await references(), ['0','7',0,7,['character','world']]);
  await run(() => TAUI.go('backup'));
  const packet = JSON.parse((await download('#save-backup')).bytes);
  for (const row of packet.workState.drafts.filter(r => r.plan.batchId === 'old-batch')) {
    assert.deepEqual(row.plan.creationInput.modules, ['character','world']);
    delete row.plan.creationInput.modules; // Simulate importing a v2 archive written before this upgrade.
  }
  assert.deepEqual(packet.library.characters.find(w => w.id === 0).creationRecordKeys, {extension:'unknown'});
  assert.equal(packet.workState.drafts.find(r => r.plan.id === 'old-world').plan.operations[0].value.creationRecordKeys,'unknown extension value');
  await file(packet);
  await click('#load-backup');
  await wait(() => !!document.querySelector('#modal-root [data-act=replace]'), 'review archived legacy modules');
  await click('#modal-root [data-act=replace]');
  await wait(() => TAStudioDrafts.findSaved('old-batch','world')?.creationInput.modules?.length === 2, 'restored upgraded legacy drafts');
  await win.webContents.reload();
  await wait(() => !!document.querySelector('#load-backup'), 'reopen restored library');
  assert.deepEqual((await onPage('book',7)).sort(), ['old-character','old-world']);
  await click('[data-work-draft="old-world"]');
  await wait(() => !!document.querySelector('[data-plan="old-world"]'), 'restored draft editor');
  assert.deepEqual(await references(), ['0','7',0,7,['character','world']]);
  for (const pair of [first,second]) assert.deepEqual(await onPage(pair.kind,pair.workId), [pair.peerId]);
  console.log('Split and combined responses, archive rotation, typed legacy references, intact unknown origins and full work-state export/restore passed.');
});
