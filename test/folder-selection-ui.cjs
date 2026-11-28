'use strict';
const assert = require('node:assert/strict');
const suite = require('./desktop-fixture.cjs');

suite('folder-selection', async ({ open, run }) => {
  await open('characters');
  const result = await run(async () => {
    const paths = { cards: '/bookshelf/first', worlds: '' }, second = '/bookshelf/second', final = '/bookshelf/final';
    let pick = async () => {}, beforeRead = async () => {}, includeBroken = false;
    const picker = () => document.querySelector('#pick-cards').onclick();
    const data = name => new TextEncoder().encode(JSON.stringify({ name, description: 'Synthetic card' }));
    const library = TAStore.emptyLibrary();
    library.characters.push({ id: 'existing', name: 'Local work', description: 'Before scanning' });
    await TAUI.commitLibrary(TAStore.verify(library), [], true);
    window.nijanDesktop = {
      getPaths: async () => ({ ...paths }),
      pick: async () => { await pick(); return { ...paths }; },
      list: async folder => (includeBroken ? ['1.json', '2.json', 'broken.json'] : ['1.json', '2.json']).map(name => ({ name, full: folder + '/' + name })),
      read: async file => {
        await beforeRead(file);
        if (!file.startsWith(paths.cards + '/')) throw Error('The selected folder changed');
        return file.endsWith('/broken.json') ? new TextEncoder().encode('{') : data(file);
      },
    };
    await picker();
    let firstWasRead = false;
    beforeRead = async file => {
      if (file.endsWith('1.json')) firstWasRead = true;
      if (file.endsWith('2.json')) {
        pick = async () => { paths.cards = second; };
        await picker();
      }
    };
    const abandoned = await TAUI.readFolders();
    const afterSwitch = [firstWasRead, abandoned === null, TAUI.state.lib.characters.map(row => row.name),
      Object.keys(TAUI.state.lib.settings.folderImports || {})];
    // Leave the native choice open until every file in the next scan has finished reading.
    const opened = Promise.withResolvers(), allRead = Promise.withResolvers(), answer = Promise.withResolvers();
    let picking;
    pick = async () => { opened.resolve(); await answer.promise; paths.cards = final; };
    beforeRead = async file => {
      if (file.endsWith('2.json')) { picking = picker(); await opened.promise; }
    };
    const running = TAUI.readFolders(null, { onProgress: report => { if (report.cards === 2) allRead.resolve(); } });
    await allRead.promise;
    await new Promise(resolve => setTimeout(resolve, 0));
    answer.resolve(); await picking;
    const pendingResult = await running;
    const afterDialog = [pendingResult === null, TAUI.state.lib.characters.length];

    beforeRead = async file => { if (file.endsWith('2.json')) paths.cards = '/bookshelf/other'; };
    const changedOnDisk = await TAUI.readFolders();
    const afterExternalChange = [changedOnDisk === null, TAUI.state.lib.characters.length];
    pick = async () => { paths.cards = final; };
    await picker();
    TAUI.openAddress('characters.html?field=description#existing');
    function edit(text) {
      const field = document.querySelector('#char-form [data-field=description]');
      field.value = text;
      field.dispatchEvent(new Event('input', { bubbles: true }));
    }
    beforeRead = async file => { if (file.endsWith('2.json')) edit('Edited while reading'); };
    const whileEditing = await TAUI.readFolders();
    const afterEdit = [whileEditing === null, TAUI.state.lib.characters[0].description, TAUI.state.lib.characters.length];
    await TAUI.flush();

    // A failed save owns a version. An intervening edit must also invalidate its automatic quota retry.
    beforeRead = async () => {};
    const save = TAStore.save;
    let writes = 0;
    TAStore.save = async (...args) => {
      if (++writes > 1) return save(...args);
      await Promise.resolve();
      edit('Edited during failed save');
      throw new DOMException('Fixture quota', 'QuotaExceededError');
    };
    let failed;
    try { failed = await TAUI.readFolders(); } finally { TAStore.save = save; }
    const afterQuotaEdit = [failed === null, writes, TAUI.state.lib.characters[0].description, TAUI.state.lib.characters.length];
    await TAUI.flush();

    let attempts = 0;
    includeBroken = true;
    pick = async () => {};
    beforeRead = async file => { if (file.endsWith('2.json')) await picker(); };
    TAStore.save = async (...args) => {
      if (++attempts === 1) throw new DOMException('Fixture quota', 'QuotaExceededError');
      return save(...args);
    };
    let normal;
    try { normal = await TAUI.readFolders(); } finally { TAStore.save = save; }
    beforeRead = async () => {};
    const again = await TAUI.readFolders();
    return { afterSwitch, afterDialog, afterExternalChange, afterEdit, afterQuotaEdit, attempts, imported: normal?.cards,
      failures: normal?.failed.map(row => row.name), unchanged: again?.unchanged };
  });
  assert.deepEqual(result.afterSwitch, [true, true, ['Local work'], []]);
  assert.deepEqual(result.afterDialog, [true, 1]);
  assert.deepEqual(result.afterExternalChange, [true, 1]);
  assert.deepEqual(result.afterEdit, [true, 'Edited while reading', 1]);
  assert.deepEqual(result.afterQuotaEdit, [true, 1, 'Edited during failed save', 1]);
  assert.deepEqual([result.attempts, result.imported, result.unchanged], [2, 2, 2]);
  assert.deepEqual(result.failures, ['broken.json']);
  await open('characters');
  assert.deepEqual(await run(() => TAUI.state.lib.characters.map(work => work.name)),
    ['Local work', '/bookshelf/final/1.json', '/bookshelf/final/2.json']);
  assert.equal(await run(() => TAUI.state.lib.characters[0].description), 'Edited during failed save');
  console.log('Changing the native folder after the first file leaves the entire old batch out of the saved library.');
});
