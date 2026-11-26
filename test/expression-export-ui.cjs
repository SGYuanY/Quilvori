/* Exercise the character export controls in an isolated Electron renderer. */
const { app, BrowserWindow, session } = require('electron');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');

const profile = process.env.QUILVORI_TEST_PROFILE;
if (!profile || path.dirname(profile) !== os.tmpdir() || !path.basename(profile).startsWith('quilvori-ui-')) {
  throw new Error('Run the UI checks with an isolated test profile.');
}
app.setPath('userData', profile);

async function exercise() {
  const fixture = session.fromPartition('expressions-fixture');
  fixture.webRequest.onBeforeRequest((request, done) => done({cancel:/^https?:/i.test(request.url)}));
  const win = new BrowserWindow({show:false, webPreferences:{session:fixture, contextIsolation:true, nodeIntegration:false}});
  const run = (fn, ...args) => win.webContents.executeJavaScript('(' + fn.toString() + ')(...' + JSON.stringify(args) + ')', true);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function waitFor(check, label) {
    for (let i=0; i<100; i++) {
      if (await check()) return;
      await sleep(25);
    }
    throw new Error('Timed out waiting for ' + label);
  }
  const receipt = () => run(() => document.querySelector('#export-slip .export-slip span')?.textContent || '');
  const waitMessage = phrase => waitFor(async () => (await receipt()).includes(phrase), phrase);
  const downloads = () => run(() => window.fixtureDownloads);
  const click = (mode, selector) => run((mode, selector) => {
    window.fixtureDownloads = [];
    document.getElementById('export-slip').replaceChildren();
    window.nijanDesktop = mode === 'browser' ? null : {
      getPaths: async () => mode === 'missing' ? {} : {cards:'fixture-directory'},
      writeExpressions: async () => {
        if (mode === 'cancel') return {canceled:true};
        if (mode === 'failure') throw new Error('Fixture disk full');
        if (mode === 'recovery') return {ok:false,code:'expression-recovery',recovery:'fixture-recovery-folder'};
        if (mode === 'cleanup') return {directory:'fixture-saved-folder',count:1,cleanup:'fixture-cleanup-folder'};
        return new Promise(resolve => { window.finishFixtureWrite = () => resolve('fixture-directory/Author/expressions'); });
      },
    };
    document.querySelector(selector).click();
  }, mode, selector);

  await win.loadFile(path.join(__dirname, '..', 'characters.html'));
  await waitFor(() => run(() => !!document.querySelector('[data-act="json"]')), 'the character page');
  await run(async () => {
    const library = TAStore.emptyLibrary();
    const card = TAFormats.cardToCharacter({name:'Author', description:'A synthetic fixture.'});
    card.id = TAStore.uid('ch');
    card.stickerPackId = 'pack';
    library.characters = [card];
    library.stickerPacks = [{id:'pack', name:'Expressions', stickers:[{name:'smile.png', dataUrl:'data:image/png;base64,AQID'}]}];
    await TAUI.commitLibrary(library);
    TAI18n.save({lang:'en'});
    TAUI.show('characters');
    window.fixtureRejections = [];
    window.addEventListener('unhandledrejection', event => {
      window.fixtureRejections.push(String(event.reason));
      event.preventDefault();
    });
    document.addEventListener('click', event => {
      const anchor = event.target.closest('a[download]');
      if (anchor) {
        event.preventDefault();
        window.fixtureDownloads.push(anchor.download);
      }
    });
  });

  const json = '[data-act="json"]';
  await click('delayed', json);
  await waitFor(() => run(() => !!window.finishFixtureWrite), 'the desktop writer');
  assert.deepEqual(await downloads(), ['Author.json']);
  assert.match(await receipt(), /JSON download requested/);
  assert.doesNotMatch(await receipt(), /images saved/);
  await run(() => window.finishFixtureWrite());
  await waitMessage('images saved (1)');
  assert.match(await receipt(), /fixture-directory\/Author\/expressions/);

  for (const [mode, message] of [['missing','Select a character folder'], ['cancel','export canceled'], ['failure','Fixture disk full']]) {
    await click(mode, json);
    await waitMessage(message);
    assert.match(await receipt(), /JSON download requested/);
    assert.doesNotMatch(await receipt(), /images saved/);
    assert.deepEqual(await downloads(), ['Author.json']);
  }

  await click('failure', '#pack-export');
  await waitMessage('Fixture disk full');
  assert.doesNotMatch(await receipt(), /Card JSON|images saved/);
  assert.deepEqual(await downloads(), []);
  await click('recovery','#pack-export');
  await waitMessage('fixture-recovery-folder');
  assert.match(await receipt(),/manifest\.json/);
  assert.doesNotMatch(await receipt(),/images saved/);
  await click('cleanup','#pack-export');
  await waitMessage('fixture-cleanup-folder');
  assert.match(await receipt(),/images saved \(1\).*fixture-saved-folder/);

  await click('browser', json);
  await waitMessage('Downloads requested for expression images');
  assert.deepEqual(await downloads(), ['Author.json','smile.png']);
  await click('browser', '#pack-export');
  await waitMessage('Downloads requested for expression images');
  assert.deepEqual(await downloads(), ['smile.png']);

  await click('browser', '[data-act="png"]');
  await waitMessage('PNG download requested');
  assert.deepEqual(await downloads(), ['Author.png']);
  await run(()=>TAUI.state.lib.stickerPacks[0].stickers.push({name:'broken.webp',dataUrl:'invalid'}));
  await click('browser','#pack-export');
  await waitMessage('broken.webp');
  assert.deepEqual(await downloads(),[],'An invalid later image must stop the entire browser batch before the first download');
  await run(() => { TAUI.state.lib.stickerPacks[0].stickers = []; });
  await click('browser', json);
  await waitMessage('no images');
  assert.deepEqual(await downloads(), ['Author.json']);
  assert.deepEqual(await run(() => window.fixtureRejections), []);
  win.destroy();
  console.log('Card, PNG and expression export feedback passed for browser requests, desktop writes, missing folders, cancellation and errors.');
}

app.whenReady().then(exercise).then(() => app.exit(0)).catch(error => { console.error(error); app.exit(1); });
