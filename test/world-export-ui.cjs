'use strict';
const assert = require('node:assert/strict');
const suite = require('./desktop-fixture.cjs');

suite('world-export', async ({run,open,wait,click,input,file,download}) => {
  await open('lore');
  await run(async () => {
    const lib = TAStore.emptyLibrary();
    lib.characters = [{id:'c',name:'Keeper'}];
    await TAUI.commitLibrary(lib); TAUI.renderStage();
  });
  await file({name:'Ledger',description:'Original introduction',entries:{
    37:{uid:37,comment:'Original',content:'Original entry',key:['clock']},
  }},'Ledger.json');
  await click('#import-book');
  await wait(() => document.querySelector('[data-book-field=name]')?.value==='Ledger','import native world');
  const source = await run(() => TAUI.state.lib.worldBooks[0].entries[0].id);
  await click('#new-entry');
  await input('#lore-editor [data-field=comment]','Implicit');
  for (const title of ['Copy one','Copy two']) {
    await click('.entry[data-id="'+source+'"]'); await click('#dup-entry');
    await input('#lore-editor [data-field=comment]',title);
    await input('#lore-editor [data-field=content]',title+' text');
  }
  await run(()=>TAUI.flush()); await open('lore');
  const world = JSON.parse((await download('#export-book')).bytes);
  const ids = entries => Object.fromEntries(entries.map(row=>[row.comment,row.uid ?? row.id]));
  const expected = ids(Object.values(world.entries));
  assert.equal(expected.Original,37); assert.equal(expected.Implicit,0);
  assert.equal(new Set(Object.values(expected)).size,4);

  await click('.entry[data-id="'+source+'"]');
  const section = '[data-context=edition]';
  await click(section+' summary');
  await wait(()=>!!document.querySelector('[data-context=edition] .row .btn-primary'),'edition controls');
  const preview = section+' .row button:first-child', save = section+' .row .btn-primary';
  for (const [control,value] of [
    ['[data-book-field=name]','Harbor Almanac'],['[data-book-field=description]','Revised introduction'],
    ['#lore-editor [data-field=content]','Revised entry  \n\n\n\nNotes.  '],
  ]) {
    await click(preview);
    const disabled = await run((selector,text) => {
      const field = document.querySelector(selector); field.value = text;
      field.dispatchEvent(new Event('input',{bubbles:true}));
      return document.querySelector('[data-context=edition] .row .btn-primary').disabled;
    },control,value);
    assert.equal(disabled,true,'previous preview invalidated synchronously after '+control);
  }
  await click(preview);
  await click(section+' .check:nth-of-type(2) input');
  assert.ok(await run(q=>document.querySelector(q).disabled,save),'option invalidates preview');
  await click(preview);
  const light = await download(save), data = JSON.parse(light.bytes);
  assert.equal(light.filename,'Harbor Almanac-light.json');
  assert.equal(data.name,'Harbor Almanac'); assert.equal(data.description,'Revised introduction');
  assert.equal(data.entries['37'].content,'Revised entry\n\nNotes.');
  const full = JSON.parse((await download('#export-book')).bytes);
  assert.equal(full.entries['37'].content,'Revised entry  \n\n\n\nNotes.  ');
  await run(()=>TAUI.flush()); await open('characters');
  await run(() => {
    const sel = document.querySelector('#attach-book'); sel.value = TAUI.state.lib.worldBooks[0].id;
    sel.dispatchEvent(new Event('change',{bubbles:true}));
  });
  const png = await download('[data-act=png]');
  const embedded = await run(base64=>JSON.parse(TAPng.readChara(Uint8Array.from(atob(base64),c=>c.charCodeAt(0)))).data.character_book,png.bytes.toString('base64'));
  assert.deepEqual(ids(embedded.entries),expected);
  assert.equal(embedded.description,full.description);
  console.log('World export: native UIDs in JSON and embedded PNG, synchronous light-edition invalidation, optional edits and source preservation passed.');
});
