'use strict';
const assert = require('node:assert/strict');
const suite = require('./desktop-fixture.cjs');

suite('backup-controls', async ({run, wait, open, click, file, key, download, win}) => {
  await open('backup');
  const packet = await run(async () => {
    const lib = TAStore.emptyLibrary();
    lib.characters.push({id:'clock',name:'Harbor clock',description:'Quiet day'});
    await TAUI.commitLibrary(lib, [], true);
    await TAHistory.save('characters', lib.characters[0], 'First');
    await TAHistory.save('characters', lib.characters[0], 'Second');
    await TAHistory.clean(TAHistory.cleanupPlan(await TAHistory.inventory('characters','clock'), 3));
    const snapshot = await TALibraryDB.workingState(true);
    return TAFormats.backupOf(snapshot.library, snapshot.state);
  });
  const empty = structuredClone(packet);
  empty.workState = {versions:[], drafts:[], records:[], limits:[]};
  for (const language of ['en','zh','ja','ru','ko','th']) {
    await run(lang => {TAI18n.save({lang}); TAUI.renderStage();}, language);
    for (const incoming of [empty, packet]) {
      await file(incoming);
      await run(() => document.querySelector('#load-backup').focus());
      await click('#load-backup');
      await wait(() => !!document.querySelector('#modal-root [data-act=merge]'), 'restore comparison');
      const counts = await run(() => [...document.querySelectorAll('#modal-root .integrity-content section.stack > p')].slice(0,2)
        .map(p => (p.textContent.match(/\d+/g) || []).map(Number)));
      assert.deepEqual(counts, [incoming===empty ? [0,0,0,0] : [0,2,1,0], [0,2,1,0]], language+' working-record counts');
      for (const modifiers of [['control'],['meta']]) {
        key('K', modifiers);
        await new Promise(resolve => setTimeout(resolve, 40));
        assert.ok(await run(() => document.querySelector('#workspace-command').hidden && TAUI.state.route==='backup'));
      }
      key('Escape');
      await wait(() => document.activeElement.id==='load-backup','restore button regains focus');
    }
  }
  key('K',['control']);
  await wait(() => document.activeElement.id==='workspace-command-input', 'command shortcut after cancellation');
  key('Escape');
  await wait(() => document.querySelector('#workspace-command').hidden,'command closed');

  win.webContents.debugger.attach('1.3');
  try {
    const labels = {en:'Quilvori-backup',zh:'叙翎集-备份',ja:'Quilvori-バックアップ',ko:'Quilvori-백업',ru:'Quilvori-резервная-копия',th:'Quilvori-สำรองข้อมูล'};
    for (const [zone, instant, day] of [
      ['Asia/Taipei','2026-12-31T17:15:00Z','2027-01-01'],
      ['America/Los_Angeles','2026-03-01T02:00:00Z','2026-02-28'],
    ]) {
      await win.webContents.debugger.sendCommand('Emulation.setTimezoneOverride',{timezoneId:zone});
      await run(iso => {
        const Clock = window.QARealDate ||= Date, ts = Clock.parse(iso);
        window.Date = class extends Clock {
          constructor(...args) {super(...(args.length ? args : [ts]));}
          static now() {return ts;}
        };
      }, instant);
      for (const [lang, label] of Object.entries(labels)) {
        await run(code => {TAI18n.save({lang:code});TAUI.renderStage();}, lang);
        // Chromium rate-limits bursts of automatic downloads from a single tab.
        await new Promise(resolve=>setTimeout(resolve,180));
        const saved = await download('#save-backup');
        assert.equal(saved.filename, label+'-'+day+'.json');
        const bytes = JSON.parse(saved.bytes);
        assert.equal(bytes.workState.versions.length,2);
        if (lang==='en') {
          await file(bytes, saved.filename);await click('#load-backup');
          await wait(() => !!document.querySelector('#modal-root [data-act=merge]'),'open downloaded backup');
          await click('#modal-root [data-act=merge]');
          await wait(() => TAUI.state.save==='saved' && !document.querySelector('#app').inert,'restored backup');
        }
      }
    }
  } finally {
    await run(() => {if(window.QARealDate)window.Date=window.QARealDate;});
    win.webContents.debugger.detach();
  }
  console.log('Backup controls: six languages, distinct local/incoming counts, modal shortcuts, local-date downloads and round trip passed.');
});
