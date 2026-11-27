'use strict';
const assert = require('node:assert/strict');
const suite = require('./desktop-fixture.cjs');

suite('studio-model-ready', async ({open, run, wait, click, input, win}) => {
  const seedProfiles = () => run(async () => {
    await NIJANModel.ready;
    NIJANModel.save({model:'alpha-writer', baseUrl:'https://alpha.example.invalid/v1', key:'fixture-alpha'});
    NIJANModel.newProfile('Beta');
    NIJANModel.save({model:'beta-writer', baseUrl:'https://beta.example.invalid/v1', key:'fixture-beta', protocol:'chat', contextWindow:64000});
    await NIJANModel.flushCredentials();
  });
  const betaVisible = () => wait(() =>
    document.querySelector('#ai-connection')?.textContent === 'beta-writer' &&
    document.querySelector('#studio-profile')?.selectedOptions[0]?.text === 'Beta' &&
    document.querySelector('#ai-model-details')?.textContent.includes('64000'), 'active Beta connection');

  if (process.env.QUILVORI_TEST_PHASE === 'studio-model-prepare') {
    await open('backup');
    await seedProfiles();
    await open('studio');
    await betaVisible();
    await run(() => localStorage.setItem('nijan-model', '{"broken":'));
    await open('backup');
    await run(async () => {
      await NIJANModel.ready;
      await NIJANModel.rebuildCredentials(NIJANModel.credentialStatus().recoveryToken);
    });
    await seedProfiles();
    console.log('An intact connection is visible on reopening the studio. Two rebuilt profiles are saved for the restart.');
    return;
  }

  // Hold key decryption while the editor opens, then release it after text has been entered.
  function holdDecryption() {
    const original = SubtleCrypto.prototype.decrypt;
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    SubtleCrypto.prototype.decrypt = async function (...args) { await gate; return original.apply(this, args); };
    window.releaseFixtureKeys = () => { SubtleCrypto.prototype.decrypt = original; release(); };
  }
  await win.loadURL('about:blank');
  win.webContents.debugger.attach('1.3');
  try {
    await win.webContents.debugger.sendCommand('Page.enable');
    await win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument', {source:'(' + holdDecryption + ')()'});
    await open('studio');
    assert.ok(await run(() => NIJANModel.credentialStatus().opening && document.querySelector('#studio-profile').disabled));
    await input('#ai-instruction', 'Keep this edit');
    await run(() => {
      window.fixtureEditor = document.activeElement;
      fixtureEditor.setSelectionRange(2, 7);
      window.releaseFixtureKeys();
    });
    await betaVisible();
    assert.ok(await run(() => document.activeElement === window.fixtureEditor && fixtureEditor.value === 'Keep this edit' &&
      fixtureEditor.selectionStart === 2 && fixtureEditor.selectionEnd === 7 && !document.querySelector('#studio-profile').disabled));
  } finally {
    win.webContents.debugger.detach();
  }

  await click('[data-mode=create]');
  await input('#ai-brief', 'Write a harbor scene.');
  await input('#ai-creation-message', 'Discuss the lighthouse.');
  await run(() => {
    window.fetch = async (url, init) => {
      if (url !== 'https://beta.example.invalid/v1/chat/completions' || init.headers.Authorization !== 'Bearer fixture-beta' ||
          JSON.parse(init.body).model !== 'beta-writer') throw Error('Unexpected connection');
      return new Promise(resolve => {
        window.finishFixtureReply = () => resolve(new Response(JSON.stringify({choices:[{message:{
          content:JSON.stringify({reply:'The light stays on.'}),
        }}]}), {headers:{'Content-Type':'application/json'}}));
      });
    };
  });
  await click('#ai-discuss');
  await wait(() => NIJANStudio.running() && !!window.finishFixtureReply, 'pending Beta request');
  await input('#ai-creation-message', 'Next paragraph');
  await run(() => {
    window.fixtureEditor = document.activeElement;
    const original = TAModelKeyCodec.open;
    TAModelKeyCodec.open = async () => { throw Error('Temporarily locked fixture'); };
    window.unlockFixture = () => { TAModelKeyCodec.open = original; };
    window.dispatchEvent(new StorageEvent('storage', {key:'nijan-model'}));
  });
  await wait(() => NIJANModel.credentialStatus().locked && !document.querySelector('#studio-profile').options.length &&
    !!document.querySelector('#ai-model-details').textContent, 'locked connection shown in the studio');
  await run(async () => { window.unlockFixture(); await NIJANModel.retryCredentials(); });
  await betaVisible();
  assert.ok(await run(() => NIJANStudio.running() && document.querySelector('#studio-profile').disabled &&
    document.activeElement === window.fixtureEditor && fixtureEditor.value === 'Next paragraph'));
  await run(() => window.finishFixtureReply());
  await wait(() => !NIJANStudio.running() && document.querySelector('.ai-creation-conversation').textContent.includes('The light stays on.'), 'completed discussion');
  assert.ok(await run(() => !document.querySelector('#studio-profile').disabled && document.querySelector('#ai-creation-message').value === 'Next paragraph'));
  console.log('Cold start and credential retry refresh the active connection, preserve the focused editor and finish the original request.');
});
