/* Run the settings import UI against a local test library. All files are created in the renderer. */
const { app, BrowserWindow, session } = require('electron');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');

const profile = process.env.QUILVORI_TEST_PROFILE;
if (!profile || path.dirname(profile) !== os.tmpdir() || !path.basename(profile).startsWith('quilvori-ui-')) {
  throw new Error('Run the themes UI test with an isolated test profile.');
}
app.setPath('userData', profile);

const themeName = 'Lavender Reading Room';
const importedInk = '#f4e7ff';
const fixtureTheme = {
  name: themeName,
  main_text_color: 'rgba(244, 231, 255, 1)',
  italics_text_color: 'rgba(202, 167, 236, 1)',
  quote_text_color: 'rgba(227, 181, 245, 1)',
  blur_tint_color: 'rgba(47, 36, 64, 0.84)',
  chat_tint_color: 'rgba(66, 51, 87, 0.92)',
  user_mes_blur_tint_color: 'rgba(111, 91, 149, 0.87)',
  bot_mes_blur_tint_color: 'rgba(64, 52, 85, 0.9)',
  border_color: 'rgba(152, 121, 170, 0.75)',
  blur_strength: 6,
  font_scale: 1.05,
  custom_css: 'body { --theme-fixture-custom-rule: applied; background-image: url("https://theme-fixture.invalid/wall.png"); }',
};

async function exercise() {
  const fixture = session.fromPartition('persist:theme-import-fixture');
  const outside = [];
  fixture.webRequest.onBeforeRequest((request, done) => {
    const remote = /^https?:/i.test(request.url);
    if (remote) outside.push(request.url);
    done({cancel:remote});
  });
  const win = new BrowserWindow({show:false,width:1240,height:900,webPreferences:{
    session:fixture,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false,
  }});
  const entry = path.join(__dirname,'..','index.html');
  const run = (fn,...args) => win.webContents.executeJavaScript('('+fn.toString()+')(...'+JSON.stringify(args)+')',true);
  const sleep = ms => new Promise(resolve=>setTimeout(resolve,ms));
  async function waitFor(check, label) {
    for (let attempt=0; attempt<120; attempt++) {
      if (await check()) return;
      await sleep(35);
    }
    throw Error('Timed out waiting for '+label);
  }
  const click = selector => run(selector => {
    const button = document.querySelector(selector);
    if (!button || button.disabled) throw Error('Control unavailable: '+selector);
    button.click();
  },selector);
  const choose = (selector,value) => run((selector,value) => {
    const select = document.querySelector(selector);
    select.value = value;
    if (select.value !== value) throw Error('Option unavailable: '+value);
    select.dispatchEvent(new Event('change',{bubbles:true}));
  },selector,value);
  async function load() {
    await win.loadFile(entry);
    await waitFor(()=>run(()=>!!window.TAUI?.state.lib && !!document.querySelector('.collection-home')),'home');
  }
  async function appearance() {
    if (!await run(()=>!!document.querySelector('#modal-root.show #settings-appearance-tab'))) await click('[data-shell=settings]');
    await click('[data-settings-tab=appearance]');
    assert.ok(await run(()=>!!document.querySelector('#settings-appearance-panel:not([hidden]) input[type=file][data-theme-file]')),
      'The import file input belongs to the selected Appearance & language panel');
  }
  async function inputFile(selector, name, text) {
    await run((selector,name,text) => {
      const input = document.querySelector(selector), files = new DataTransfer();
      if (!input || input.type !== 'file') throw Error('File input unavailable: '+selector);
      if (text !== null) files.items.add(new File([text],name,{type:'application/json'}));
      else {
        const canvas=document.createElement('canvas');canvas.width=20;canvas.height=12;
        const context=canvas.getContext('2d');context.fillStyle='#947db7';context.fillRect(0,0,20,12);
        const bytes=Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]),ch=>ch.charCodeAt(0));
        files.items.add(new File([bytes],name,{type:'image/png'}));
      }
      input.files=files.files;
      input.dispatchEvent(new Event('change',{bubbles:true}));
    },selector,name,text);
  }
  const visiblePreview = () => run(()=>!!document.querySelector('[data-theme-preview]')?.getClientRects().length);
  async function readTheme(data=fixtureTheme) {
    await inputFile('input[type=file][data-theme-file]','lavender.json',JSON.stringify(data));
    await waitFor(visiblePreview,'a local theme preview');
    await waitFor(()=>run(()=>!!document.querySelector('[data-theme-confirm]:enabled')),'the preview confirmation');
  }
  const palette = () => run(()=>{
    const style=getComputedStyle(document.body);
    return ['--bg','--paper','--ink','--brass'].map(key=>style.getPropertyValue(key).trim().toLowerCase());
  });
  const snapshot = () => run(()=>{
    const lib=TAUI.state.lib;
    return {
      active:lib.activeThemeId,
      themes:lib.themes,
      assets:lib.assets.map(({id,name})=>({id,name})),
      work:lib.worldBooks[0].name,
      applied:document.body.hasAttribute('data-imported-theme'),
      wallpaper:document.body.style.getPropertyValue('--st-wallpaper'),
      renderedWallpaper:/data:image\/(?:png|jpeg|webp);base64,/i.test(getComputedStyle(document.body).backgroundImage),
      custom:getComputedStyle(document.body).getPropertyValue('--theme-fixture-custom-rule').trim(),
    };
  });
  await load();
  await run(async()=>{
    const lib=TAStore.emptyLibrary();
    lib.themes.push({id:'author-theme',name:'Original desk',useRoomPalette:false,
      vars:{bg:'#272327',lacquer:'#201c20',paper:'#342e34',ink:'#eadde3',accent:'#ccbb99',fontScale:1,radius:12}});
    lib.activeThemeId='author-theme';
    lib.worldBooks.push({id:'author-work',name:'Original manuscript',entries:[]});
    const tile=document.createElement('canvas');tile.width=16;tile.height=16;
    const context=tile.getContext('2d');context.fillStyle='#626684';context.fillRect(0,0,16,16);
    const dataUrl=tile.toDataURL('image/png');
    lib.assets.push({id:'old-wallpaper',name:'Existing shelf.png',kind:'background',dataUrl,mime:'image/png',bytes:dataUrl.length});
    TAI18n.save({lang:'ja'});
    await TAUI.commitLibrary(lib);
    TAUI.renderStage();
  });
  const original=await snapshot(), originalPalette=await palette();
  await appearance();
  assert.equal(await run(()=>document.querySelector('#settings-appearance-tab').textContent.trim()),'外観と言語');
  assert.equal(await run(()=>document.querySelector('select[data-theme-choice]').value),original.active);
  await readTheme();
  assert.deepEqual(await snapshot(),original,'Preview leaves the active theme and stored library untouched');
  assert.deepEqual(await palette(),originalPalette,'Preview colors stay inside the settings dialog');
  await choose('select[data-theme-background]','old-wallpaper');
  assert.ok(await run(()=>/data:image\/png;base64,/.test(getComputedStyle(document.querySelector('[data-theme-preview] .theme-sample')).backgroundImage)),
    'Choosing an existing library image changes the preview wallpaper');
  await click('[data-theme-cancel]');
  await waitFor(async()=>!await visiblePreview(),'dismissing the theme preview');
  assert.deepEqual(await snapshot(),original,'Canceling the preview leaves the original library intact');
  await load();
  assert.deepEqual(await snapshot(),original,'Canceling also leaves the persisted theme intact');

  await appearance();
  await readTheme();
  await inputFile('input[type=file][data-theme-wallpaper]','Local lavender shelf.png',null);
  await waitFor(()=>run(()=>{
    const panel=document.getElementById('settings-appearance-panel');
    return panel.textContent.includes('Local lavender shelf.png') && !!panel.querySelector('[data-theme-confirm]:enabled');
  }),'local image in the preview');
  assert.deepEqual(await snapshot(),original,'The new image is staged together with its theme');
  await run(async()=>{
    const next=structuredClone(TAUI.state.lib);
    next.worldBooks[0].name='Updated while the preview was open';
    await TAUI.commitLibrary(next);
  });
  await click('[data-theme-confirm]');
  await waitFor(()=>run(()=>document.body.hasAttribute('data-imported-theme') && TAUI.state.save==='saved'),'saving and applying the imported theme');
  const installed=await snapshot(), installedPalette=await palette();
  const selected=installed.themes.find(theme=>theme.id===installed.active);
  assert.ok(selected && selected.name===themeName);
  assert.deepEqual(installed.themes.find(theme=>theme.id===original.active),original.themes[0]);
  assert.equal(installed.work,'Updated while the preview was open');
  assert.ok(installedPalette.includes(importedInk),'The application displays the imported text color');
  assert.match(installed.wallpaper,/data:image\/(?:png|jpeg|webp);base64,/);
  assert.equal(installed.renderedWallpaper,true,'The uploaded wallpaper is painted on the workbench');
  const local=installed.assets.find(asset=>asset.id===selected.backgroundAssetId);
  assert.ok(local && local.id!=='old-wallpaper');
  assert.equal(installed.custom,'','The custom CSS from the source was never applied');
  await click('#set-close');
  await run(()=>TAUI.go('lore'));
  await waitFor(()=>run(()=>TAUI.state.route==='lore'),'opening the world book editor');
  assert.deepEqual(await palette(),installedPalette,'The imported palette remains active on another route');
  assert.deepEqual(await snapshot(),installed,'The background persists after navigation');
  await load();
  assert.deepEqual(await snapshot(),installed,'Reload restores the committed theme, image, and manuscript');
  await appearance();
  assert.equal(await run(()=>document.querySelector('[data-theme-choice]').value),selected.id);
  await choose('select[data-theme-choice]',original.active);
  await waitFor(()=>run(()=>TAUI.state.lib.activeThemeId==='author-theme' && TAUI.state.save==='saved' && !document.body.hasAttribute('data-imported-theme')),'restoring the original theme');
  assert.deepEqual(await palette(),originalPalette);
  assert.equal((await snapshot()).wallpaper,'');
  assert.equal((await snapshot()).renderedWallpaper,false,'Selecting the original theme removes the imported image');
  await load();
  assert.equal((await snapshot()).active,original.active,'Theme selection persists after reload');
  await appearance();

  const changed={...fixtureTheme,main_text_color:'rgba(238, 248, 255, 1)'};
  await readTheme(changed);
  await click('[data-theme-confirm]');
  await waitFor(async()=>!await visiblePreview(),'finishing a second import with the same name');
  const revised=await snapshot();
  assert.deepEqual(revised.themes.find(theme=>theme.id===selected.id),selected,'Reimporting the same name keeps the first theme');
  assert.equal(revised.themes.length,installed.themes.length+1);
  assert.equal(revised.themes.find(theme=>theme.id===revised.active).name,themeName+' (2)');
  assert.equal(revised.work,installed.work);
  await inputFile('input[type=file][data-theme-file]','broken.json','{"name":');
  await waitFor(()=>run(()=>{
    const panel=document.getElementById('settings-appearance-panel');
    return !!document.querySelector('#toasts [role=alert]') || !!panel.querySelector('[role=alert]')?.textContent.trim();
  }),'a visible file error');
  assert.deepEqual(await snapshot(),revised,'Malformed JSON leaves the current theme and saved themes intact');
  assert.deepEqual(outside,[],'Theme preview, navigation and application must make no remote requests');
  win.destroy();
  console.log('Theme preview, local wallpapers, persistence, reimport, invalid files and Japanese settings passed.');
}

app.whenReady().then(exercise).then(()=>app.exit(0)).catch(error=>{console.error(error);app.exit(1);});
