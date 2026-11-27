'use strict';
const assert = require('node:assert/strict');
const suite = require('./desktop-fixture.cjs');

const damaged = '{"key":"fixture-unfinished-legacy","profiles":[';
const newKey = 'fixture-rebuilt-connection';
const profileName = 'Restored editor';
const modelName = 'fixture-editor';

suite('model-recovery', async ({open, run, click, input, wait, download}) => {
  await open('backup');
  await run(() => NIJANModel.ready);
  const persisted = () => run(() => localStorage.getItem('nijan-model'));
  const checkRestored = async () => {
    const state = await run(async (old, key) => {
      await NIJANModel.flushCredentials();
      const config = NIJANModel.load();
      const values = Object.values(localStorage);
      return {
        active: NIJANModel.profiles().find(row => row.active)?.name,
        endpoint: config.baseUrl, model: config.model,
        hasKey: config.key === key,
        plaintextKey: values.some(value => value.includes(key)),
        originalPreserved: localStorage.getItem('nijan-model') === old,
        originalCopies: values.filter(value => value.includes('fixture-unfinished-legacy')).length,
      };
    }, damaged, newKey);
    assert.deepEqual(state, {
      active:profileName, endpoint:'https://editor.example.invalid/v1', model:modelName,
      hasKey:true, plaintextKey:false, originalPreserved:true, originalCopies:1,
    });
  };

  if (process.env.QUILVORI_TEST_PHASE === 'model-recovery-restart') {
    await checkRestored();
    const saved = await download('#save-backup');
    const text = saved.bytes.toString('utf8');
    const backup = JSON.parse(text);
    assert.equal(backup.library.characters[0].description, 'Keep this manuscript');
    assert.equal(backup.workState.versions.length, 1);
    for (const privateValue of ['fixture-unfinished-legacy', newKey, profileName, 'editor.example.invalid']) {
      assert.ok(!text.includes(privateValue), 'Connection data in the library backup');
    }
    console.log('A fresh process reopens the rebuilt connection, manuscript and snapshot. The exported library omits connection data.');
    return;
  }

  await run(async () => {
    const library = TAStore.emptyLibrary();
    library.characters = [{id:'keeper', name:'Keeper', description:'Keep this manuscript'}];
    await TAUI.commitLibrary(library, [], true);
    await TAHistory.save('characters', TAUI.state.lib.characters[0], 'Saved before recovery');
    NIJANModel.save({key:'fixture-temporarily-locked'});
    await NIJANModel.flushCredentials();
    const originalOpen = TAModelKeyCodec.open;
    TAModelKeyCodec.open = async () => { throw new Error('Fixture key store is locked'); };
    window.unlockFixtureKeyStore = () => { TAModelKeyCodec.open = originalOpen; };
    window.dispatchEvent(new StorageEvent('storage', {key:'nijan-model'}));
  });
  await wait(() => NIJANModel.credentialStatus().locked, 'temporarily locked key store');
  await click('[data-shell=settings]');
  assert.ok(await run(() => document.querySelector('#model-key-retry').getClientRects().length > 0));
  assert.ok(await run(() => !document.querySelector('#model-key-rebuild')?.getClientRects().length));
  await run(() => window.unlockFixtureKeyStore());
  await click('#model-key-retry');
  await wait(() => document.querySelector('#set-key')?.disabled === false && NIJANModel.load().key === 'fixture-temporarily-locked', 'key recovery after retry');
  await click('#set-close');
  await wait(() => !document.querySelector('#modal-root').classList.contains('show'), 'closed settings');
  assert.ok(await run(async () => {
    await NIJANModel.flushCredentials();
    return TAUI.flush();
  }), 'completed writes before the simulated restart');

  await run(raw => localStorage.setItem('nijan-model', raw), damaged);
  await open('backup');
  await run(() => NIJANModel.ready);
  await click('[data-shell=settings]');
  assert.ok(await run(() => document.querySelector('#set-key').disabled && document.querySelector('#add-profile').disabled));
  assert.ok(await run(() => !!document.querySelector('#model-key-rebuild')?.getClientRects().length), 'settings offers to rebuild a damaged connection');
  assert.equal(await run(() => document.querySelector('#model-key-rebuild').textContent.trim()), 'Rebuild model connections');
  await click('#model-key-rebuild');
  await click('#model-key-rebuild-cancel');
  assert.equal(await persisted(), damaged);
  assert.ok(await run(() => NIJANModel.credentialStatus().locked && document.querySelector('#add-profile').disabled));
  await click('#model-key-rebuild');
  await click('#model-key-rebuild-confirm');
  await wait(() => !NIJANModel.credentialStatus().locked && document.querySelector('#add-profile')?.disabled === false, 'editable connections after rebuilding');
  assert.equal(await persisted(), damaged);
  await input('#profile-name', profileName);
  await click('#add-profile');
  await input('#set-base', 'https://editor.example.invalid/v1');
  await input('#model-id', modelName);
  await input('#set-key', newKey);
  await click('#set-close');
  await wait(() => !document.querySelector('#modal-root').classList.contains('show'), 'saved rebuilt connection');
  await checkRestored();
  console.log('A locked key store can retry. Damaged settings can be preserved, canceled, and rebuilt through Settings.');
});
