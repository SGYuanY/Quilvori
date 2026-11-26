/* Exercise the public theme workshop, its downloads and the production preload/IPC in a synthetic profile. */
const electron = require('electron');
const {app,session,BrowserWindow} = electron;
const {createRequire} = require('node:module');
const {compileFunction} = require('node:vm');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const profile = process.env.QUILVORI_TEST_PROFILE;
if (!profile || path.dirname(profile)!==os.tmpdir() || !path.basename(profile).startsWith('quilvori-ui-')) {
  throw Error('Use an isolated test profile to open the workshop.');
}
app.setPath('userData',profile);
const source = {
  name:'Twilight Index',main_text_color:'#fcf1ff',blur_tint_color:'rgba(39, 32, 52, 0.85)',
  blur_strength:7,custom_css:'body { --authored-reading-ink: lavender; }',
  extra_metadata:{revision:'first edition'},
};
const credit='Fixture Atelier', post='https://example.org/theme-post';
const diskJSON = async file => JSON.parse(await fs.readFile(file,'utf8'));

async function exercise() {
  const sandbox=await fs.mkdtemp(path.join(profile,'workshop-fixture-')), users=path.join(sandbox,'data');
  const old={name:'Original ST',main_text_color:'#eeeecc',custom_css:'body { --original-paper: cream; }'};
  const native={name:'Harbor Blue',main_text_color:'#ddeeff',custom_css:'body { --harbor-paper: lightblue; }'};
  for (const user of ['reader','other']) {
    const dir=path.join(users,user),themes=path.join(dir,'themes');
    await fs.mkdir(themes,{recursive:true});
    await fs.writeFile(path.join(dir,'settings.json'),JSON.stringify({workshopFixture:user,power_user:{theme:old.name,keep:true}}));
    for(const [file,theme] of [['one.json',old],['two.json',native]]) await fs.writeFile(path.join(themes,file),JSON.stringify(theme));
  }
  const settings=path.join(users,'reader','settings.json');
  const qa=session.fromPartition('persist:theme-workshop-fixture'), requests=[], downloads=[];
  qa.webRequest.onBeforeRequest((request,done)=>{
    const network=/^https?:/i.test(request.url);
    if(network)requests.push(request.url);
    done({cancel:network});
  });
  qa.on('will-download',(_event,item)=>{
    const file=path.join(sandbox,'download-'+downloads.length+'.json');
    const download={file,status:'pending'};downloads.push(download);
    item.setSavePath(file);
    item.once('done',(_event,status)=>{download.status=status;});
  });

  let win;
  class HiddenWindow extends BrowserWindow {
    constructor(options){
      super({...options,show:false,webPreferences:{...options.webPreferences,session:qa,backgroundThrottling:false}});
      win=this;
    }
  }
  // Run the actual main entry. Only the window's presentation and isolated session differ.
  const main=path.join(__dirname,'..','electron','main.js'), localRequire=createRequire(main);
  const mainEntry=compileFunction(await fs.readFile(main,'utf8'),['require','__dirname','__filename'],{filename:main});
  mainEntry(id=>id==='electron'?{...electron,BrowserWindow:HiddenWindow}:localRequire(id),path.dirname(main),main);
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  async function waitFor(fn,description) {
    for(let i=0;i<160;i++) { if(await fn())return; await sleep(35); }
    const status=win && !win.isDestroyed() ? await run(()=>[...document.querySelectorAll('[role=alert],[data-theme-st=status]')].map(el=>el.textContent).filter(Boolean).join(' | ')) : '';
    throw Error('Timed out waiting for '+description+' '+status);
  }
  const run=(fn,...args)=>win.webContents.executeJavaScript('('+fn.toString()+')(...'+JSON.stringify(args)+')',true);
  const click=sel=>run(sel=>{
    const el=document.querySelector(sel);if(!el||el.disabled)throw Error('Control unavailable: '+sel);
    el.click();
  },sel);
  const fill=(sel,value,event='input')=>run((sel,value,event)=>{
    const el=document.querySelector(sel);if(!el)throw Error('Field unavailable: '+sel);
    el.value=value;el.dispatchEvent(new Event(event,{bubbles:true}));
  },sel,value,event);
  const download=async selector=>{
    const index=downloads.length;
    await click(selector);
    await waitFor(()=>downloads[index] && downloads[index].status!=='pending','exported JSON');
    assert.equal(downloads[index].status,'completed');
    return diskJSON(downloads[index].file);
  };
  const st=name=>'[data-theme-st="'+name+'"]';
  async function stIdle(){
    await waitFor(()=>run(()=>document.querySelector('.theme-st-connection')?.getAttribute('aria-busy')==='false'),'the ST operation');
    const status=await run(()=>({kind:document.querySelector('[data-theme-st=status]').dataset.kind,text:document.querySelector('[data-theme-st=status]').textContent}));
    assert.notEqual(status.kind,'error',status.text);
  }

  await waitFor(()=>win && run(()=>!!window.nijanDesktop?.themeInspect && !!window.TAUI?.state.lib && !!document.querySelector('.collection-home')),'the real desktop bridge and home');
  // Start on a synthetic saved theme so the optional local catalog sources are never opened.
  await run(async()=>{const seed=TAThemeLibrary.fromText('{"name":"Fixture starter","main_text_color":"#eeeeee"}','starter.json');await TAThemeLibrary.save(seed);});
  await click('[data-shell=settings]');await click('[data-settings-tab=appearance]');await click('[data-theme-workshop]');
  await waitFor(()=>run(()=>TAUI.state.route==='themes' && !!document.querySelector('[data-theme-st=path]')),'theme workshop');
  const selectors={file:'input[data-workshop-file]',name:'[data-workshop-name]',author:'[data-workshop-author]',post:'[data-workshop-source]',
    ink:'input[type=color][data-st-color=main_text_color]',save:'[data-workshop-save]',export:'[data-workshop-export]'};
  await run((sel,source)=>{
    const el=document.querySelector(sel),files=new DataTransfer();
    if(!el)throw Error('No workshop file input: '+sel);
    files.items.add(new File([JSON.stringify(source)],'twilight.json',{type:'application/json'}));
    el.files=files.files;el.dispatchEvent(new Event('change',{bubbles:true}));
  },selectors.file,source);
  await waitFor(()=>run(sel=>document.querySelector(sel)?.value==='Twilight Index',selectors.name),'loaded authored theme');
  await fill(selectors.author,credit);
  await fill(selectors.post,post);
  await fill(selectors.ink,'#dcaaff');
  await click(selectors.save);
  await waitFor(()=>run(()=>TAUI.state.lib.themes.some(item=>item.name==='Twilight Index' && item.author==='Fixture Atelier')),'saved authored edits');
  const edited=await download(selectors.export);
  assert.equal(edited.name,source.name);assert.equal(edited.custom_css,source.custom_css);
  assert.deepEqual(edited.extra_metadata,source.extra_metadata);
  assert.equal(edited.quilvori_source.author.name,credit);assert.equal(edited.quilvori_source.postUrl,post);
  assert.match(edited.main_text_color,/220,\s*170,\s*255/);

  await fill(st('path'),sandbox);await click(st('connect'));await stIdle();
  assert.deepEqual(await run(()=>[...document.querySelector('[data-theme-st=user]').options].map(option=>option.value).filter(Boolean).sort()),['other','reader']);
  await fill(st('user'),'reader','change');await stIdle();
  assert.ok(await run(()=>[...document.querySelector('[data-theme-st=theme]').options].some(option=>option.value==='Harbor Blue')));
  await click(st('install'));await stIdle();
  const installed=await diskJSON(settings);
  assert.equal(installed.workshopFixture,'reader');assert.equal(installed.power_user.keep,true);
  assert.equal(installed.power_user.custom_css,'');assert.match(installed.power_user.theme,/Twilight Index/);
  assert.equal(installed.power_user.main_text_color,edited.main_text_color);
  const installedFile=await diskJSON(path.join(users,'reader','themes',installed.power_user.theme+'.json'));
  assert.equal(installedFile.quilvori_source.author.name,credit);assert.equal(installedFile.quilvori_source.postUrl,post);
  await fill(st('theme'),native.name,'change');await click(st('read'));await stIdle();
  assert.equal(await run(sel=>document.querySelector(sel).value,selectors.name),native.name);
  await click(st('existing-css'));await stIdle();await click(st('switch'));await stIdle();
  const switched=await diskJSON(settings);
  assert.equal(switched.power_user.theme,native.name);assert.equal(switched.power_user.custom_css,native.custom_css);
  const savedId=await run(()=>TAUI.state.lib.themes.find(theme=>theme.name==='Twilight Index').id);
  await click('[data-saved-theme="'+savedId+'"]');
  assert.equal(await run(sel=>document.querySelector(sel).value,selectors.name),source.name);
  const returned=await download(selectors.export);
  assert.deepEqual(returned,edited,'Switching back to a collected theme reopens the saved authoring values');
  assert.equal((await diskJSON(path.join(users,'other','settings.json'))).power_user.theme,old.name);
  await run(()=>TAUI.go('backup'));
  const backup=await download('#save-backup');
  const archived=backup.library.themes.find(item=>item.name===source.name);
  assert.equal(archived.raw.custom_css,source.custom_css);assert.equal(archived.author,credit);assert.equal(archived.postUrl,post);
  await run(async data=>{
    await TAUI.commitLibrary(TAStore.emptyLibrary());
    TAUI.renderStage();
    TAUI.pickFile=async()=>new File([JSON.stringify(data)],'workshop-backup.json',{type:'application/json'});
  },backup);
  await click('#load-backup');await waitFor(()=>run(()=>!!document.querySelector('#modal-root [data-act=replace]')),'backup restore confirmation');
  await click('#modal-root [data-act=replace]');
  await waitFor(()=>run(()=>TAUI.state.lib.themes.some(item=>item.name==='Twilight Index')),'restored saved theme');
  await win.loadFile(path.join(__dirname,'..','index.html'));
  await waitFor(()=>run(()=>!!window.TAUI?.state.lib),'restored home');
  assert.equal(await run(()=>TAUI.state.lib.themes.find(item=>item.name==='Twilight Index').raw.custom_css),source.custom_css);
  assert.deepEqual(requests,[]);
  console.log('Theme authoring, native JSON and backup round trips, and the two-profile desktop ST connection passed.');
  app.exit(0);
}
app.whenReady().then(exercise).catch(error=>{console.error(error);app.exit(1);});
