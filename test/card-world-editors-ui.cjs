'use strict';
const assert = require('node:assert/strict');
const suite = require('./desktop-fixture.cjs');
// This synthetic complete backup was serialized by the released v0.3.0 converter.
const backup = require('./fixtures/v0.3.0-card-world.json');

suite('card-world-editors',async ({open,run,wait,input,file,click,download})=>{
  await open('backup');
  await file(backup); await click('#load-backup');
  await wait(()=>!!document.querySelector('#modal-root [data-act=replace]'),'old backup preview');
  await click('#modal-root [data-act=replace]');
  await wait(()=>TAUI.state.lib.worldBooks[0]?.id==='harbor' && !document.querySelector('#app').inert,'old backup restored');
  await run(()=>TAI18n.save({jsonMode:true}));
  const history=()=>run(()=>TAHistory.list('worldBooks','harbor'));

  await open('lore'); await click('.entry[data-id="0"]');
  const native=JSON.parse((await download('#export-book')).bytes);
  assert.equal(native.entries[37].content,'Low tide.');
  assert.equal(native.entries[37].depth,0);
  assert.deepEqual(native.extensions.publisher,{edition:'blue'});
  await input('#lore-editor [data-field=content]','An independent hand edit.');
  const edited=structuredClone(native); edited.entries[37].content='Corrected via JSON.';
  await input('#json-box',JSON.stringify(edited)); await click('#json-back');
  assert.equal(await run(()=>TAUI.state.lib.worldBooks[0].entries.find(e=>e.id===0).content),'An independent hand edit.');
  assert.equal((await history()).length,0);
  assert.ok(await run(()=>TAUI.flush()));
  await open('lore'); await input('#json-box',JSON.stringify(edited));
  await run(()=>{
    const save=TAStore.save;
    TAStore.save=async()=>{TAStore.save=save;throw Error('Synthetic save failure');};
  });
  await click('#json-back');
  await wait(()=>[...document.querySelectorAll('.toast-message')].some(e=>e.textContent.includes('Synthetic save failure')),'failed write');
  assert.equal((await history()).length,0);
  assert.equal(await run(()=>TAUI.state.lib.worldBooks[0].entries.find(e=>e.id===0).content),'An independent hand edit.');
  await click('#json-back');
  await wait(()=>TAUI.state.lib.worldBooks[0].entries.find(e=>e.id===0)?.content==='Corrected via JSON.','world conversion committed');
  const rows=await history();
  assert.equal(rows.length,1);
  assert.equal(rows[0].value.entries.find(e=>e.id===0).content,'An independent hand edit.');
  assert.deepEqual(await run(()=>TAUI.state.lib.quickReplySets[0].workSource.entryIds),[0]);

  await open('characters'); await click('[data-act=view-edit]');
  const card=JSON.parse((await download('[data-act=json]')).bytes);
  assert.equal(card.spec,'chara_card_v3');
  assert.equal(card.data.extensions.talkativeness,0);
  assert.deepEqual(card.data.extensions.archive,{author:'Fixture Guild',edition:3});
  assert.equal(card.data.character_book.entries.find(e=>e.id===37).content,'Corrected via JSON.');
  const png=await download('[data-act=png]');
  const inside=await run(value=>JSON.parse(TAPng.readChara(Uint8Array.from(atob(value),ch=>ch.charCodeAt(0)))),png.bytes.toString('base64'));
  assert.deepEqual(inside,card);
  const localCard=await run(()=>JSON.parse(document.querySelector('#json-box').value));
  localCard.data.description='Revised by the keeper.';
  await input('#json-box',JSON.stringify(localCard)); await click('#json-back');
  await wait(()=>TAUI.state.lib.characters[0].description==='Revised by the keeper.','card conversion committed');
  assert.equal(await run(async()=>(await TAHistory.list('characters',0))[0].value.description),'Watches the harbor.');
  await open('lore');
  await run(()=>{document.querySelector('.revision-panel').open=true;});
  await wait(()=>!!document.querySelector('[data-restore]:not(:disabled)'),'recorded revision');
  await click('[data-restore]'); await click('#modal-root [data-act=yes]');
  await wait(()=>TAUI.state.lib.worldBooks[0].entries.find(e=>e.id===0)?.content==='An independent hand edit.','rollback');
  await open('characters');
  assert.equal(await run(()=>TAUI.state.lib.characters[0].description),'Revised by the keeper.');
  assert.deepEqual(await run(()=>TAUI.state.lib.quickReplySets[0].workSource.entryIds),[0]);
  await click('[data-act=view-edit]');
  const field='#char-form [data-field=description]';
  await run(async()=>{
    const lib=TAUI.state.lib;
    await TAUI.commitLibrary({...lib,settings:{...lib.settings} },[],false,null,{scopes:[['settings']]});
  });
  await input(field,'Editing the same card after an unrelated save.');
  assert.ok(await run(()=>TAUI.flush()));
  await run(async()=>{
    const lib=TAUI.state.lib;
    const updated={...lib.characters[0],description:'Replacement from another action.'};
    await TAUI.commitLibrary({...lib,characters:[updated]},[],false,null,{scopes:[['characters',0]]});
  });
  await input(field,'Attempted write from a stale editor.');
  assert.equal(await run(()=>TAUI.state.lib.characters[0].description),'Replacement from another action.');
  assert.equal(await run(s=>document.querySelector(s).value,field),'Replacement from another action.');
  console.log('v0.3.0 restore, stale and failed writes, zero IDs, JSON/PNG parity, atomic snapshots, rollback and editor focus after a library change passed.');
});
