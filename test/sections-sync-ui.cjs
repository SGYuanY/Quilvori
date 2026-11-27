/* Uses the real sections, prompt, lore, regex and reply editors in an isolated desktop profile. */
const {app,BrowserWindow,session}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const profile=process.env.QUILVORI_TEST_PROFILE;
if(!profile || path.dirname(profile)!==os.tmpdir() || !path.basename(profile).startsWith('quilvori-ui-'))throw Error('An isolated test profile is required');
app.setPath('userData',profile);
const root=path.resolve(__dirname,'..'),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let win,qa;
const run=(fn,...args)=>win.webContents.executeJavaScript('('+fn.toString()+')(...'+JSON.stringify(args)+')',true);
async function wait(fn,label) {
  for(let i=0;i<140;i++){if(await run(fn))return;await sleep(40);}
  throw new Error(label+' timed out');
}
async function open(page) {await win.loadFile(path.join(root,page+'.html'));await wait(()=>!!window.TAUI?.state.lib&&!!document.querySelector('#stage > *'),'load '+page);}
const click=q=>run(q=>{const el=document.querySelector(q);if(!el||el.disabled||!el.getClientRects().length)throw Error('Unavailable '+q);el.click();},q);
const edit=(q,value)=>run((q,v)=>{
  const el=document.querySelector(q);
  if(el.closest('.fold-body')?.hidden)el.closest('.fold').querySelector('.fold-name').click();
  el.focus();el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));
},q,value);
const saved=()=>wait(()=>TAUI.state.save==='saved','autosave');
async function seed(legacy=false) {
  await open('prompts');
  await run(async legacy=>{
    const lib=TAStore.emptyLibrary();lib.themes.push({id:'fixture',name:'Fixture',vars:{}});lib.activeThemeId='fixture';
    if(legacy){
      Object.assign(lib.sections.style,{on:true,custom:'Original workshop style'});
      lib.promptPresets=[{id:'preset_sections',name:'Legacy preset',blocks:[{id:'sec_style',name:'Editor title',kind:'style',role:'assistant',enabled:true,content:'Original authored style'}]}];
    }
    await TAUI.commitLibrary(lib);TAUI.renderStage();
  },legacy);
}
async function download(control,name) {
  const target=path.join(profile,name);
  const done=new Promise((resolve,reject)=>qa.once('will-download',(_,item)=>{
    item.setSavePath(target);item.once('done',(_event,state)=>state==='completed'?resolve():reject(new Error(state)));
  }));
  await click(control);await done;return JSON.parse(await fs.readFile(target,'utf8'));
}
const dump=()=>run(()=>{const l=TAUI.state.lib;return {sections:l.sections,prompts:l.promptPresets,worlds:l.worldBooks,regex:l.regexScripts,quick:l.quickReplySets};});
async function discoverableDestinations() {
  await seed();const before=await dump();await open('sections');
  const returns=()=>click('[data-nav=sections]');
  const localWorks={zh:'本机作品',en:'In your library',ja:'ライブラリ内の作品',ru:'В вашей библиотеке',ko:'내 라이브러리',th:'ผลงานในคลัง'};
  const previews={pov:new Set(),bond:new Set(),safe:new Set(),format:new Set()};
  for(const [lang,caption] of Object.entries(localWorks)){
    assert.deepEqual(await run(lang=>{
      TAI18n.save({lang});TAUI.renderStage();
      return [document.querySelector('[data-sec]').dataset.sec,document.querySelector('.section-outputs strong').textContent];
    },lang),['style',caption]);
    const rows=await run(()=>Object.fromEntries([...document.querySelectorAll('[data-live]')].map(el=>[el.dataset.live,el.value])));
    for(const key of Object.keys(previews))previews[key].add(rows[key]);
  }
  assert.ok(Object.values(previews).every(variants=>variants.size===6),'new manuscripts preview each supported language');
  await run(()=>{TAI18n.save({lang:'en'});TAUI.renderStage();});
  assert.deepEqual(await dump(),before,'Reading guidance in every language leaves the library untouched');
  assert.equal(await run(()=>document.querySelectorAll('[data-section-group=r18] [data-pick],[data-section-group=nsfw] [data-pick]').length),0);
  assert.ok(await run(()=>document.querySelector('.section-transfer').textContent.includes('World Info')));
  win.setContentSize(390,660);
  assert.ok(await run(()=>[...document.querySelectorAll('.section-group')].every(el=>el.scrollWidth<=el.clientWidth+1)),'narrow section groups fit');
  win.setContentSize(1280,980);
  await click('[data-sec=style]');await click('[data-section-group=style] [data-pick=talk]');
  await click('[data-open-section-output=sec_style]');
  assert.deepEqual(await run(()=>[TAUI.state.route,TAUI.state.sel.preset,document.activeElement.dataset.block,document.activeElement.value]),['prompts','preset_sections','sec_style','Move the scene forward through dialogue. Use narration for gestures and pauses.']);
  await returns();await click('[data-sec=nsfw]');
  assert.equal(await run(()=>document.querySelector('[data-sec=r18]').checked),false);
  assert.equal(await run(()=>document.querySelectorAll('[data-section-outputs=nsfw] button').length),2);
  await click('[data-open-section-output=sec_nsfw_lore]');
  assert.deepEqual(await run(()=>[TAUI.state.route,TAUI.state.sel.book,TAUI.state.sel.entry,document.activeElement.dataset.field]),['lore','book_sections','sec_nsfw_lore','content']);
  const savedWorks=await dump();
  await returns();await run(()=>{TAI18n.save({lang:'zh'});TAUI.renderStage();});
  assert.deepEqual(await dump(),savedWorks,'changing interface language does not translate a saved work or alter its section');
  assert.ok(await run(()=>document.querySelector('[data-live=style]').value.startsWith('Move the scene')));
  assert.deepEqual(savedWorks.worlds[0].entries[0].keys,['closer','breath','distance']);
  await run(()=>{TAI18n.save({lang:'en'});TAUI.renderStage();});
  await returns();await click('[data-sec=format]');await saved();
  await run(async()=>{
    const lib=structuredClone(TAUI.state.lib),set=lib.quickReplySets.find(s=>s.id==='sec_format_qr');
    set.replies.unshift({id:'similar',label:'Output format',message:'Other reply'});
    lib.quickReplySets.unshift({id:'decoy',name:set.name,replies:[]});
    lib.regexScripts.unshift({...lib.regexScripts[0],id:'decoy',findRegex:'distinct'});
    await TAUI.commitLibrary(lib);TAUI.renderStage();
  });
  await click('[data-open-section-output=sec_format_rx]');
  assert.deepEqual(await run(()=>[TAUI.state.route,TAUI.state.sel.regex,document.activeElement.dataset.field]),['regex','sec_format_rx','findRegex']);
  await returns();await click('[data-open-section-output=sec_format_reply]');
  assert.deepEqual(await run(()=>[TAUI.state.route,TAUI.state.sel.qr,document.activeElement.closest('[data-id]')?.dataset.id,document.activeElement.dataset.k]),['quick','sec_format_qr','sec_format_reply','message']);
}
async function legacyReadOnly() {
  await seed(true);const original=await dump();await open('sections');
  assert.deepEqual(await dump(),original,'Opening sections must not generate or rewrite a legacy library');
  await edit('[data-custom=style]','New workshop suggestion');await saved();await open('prompts');
  assert.equal(await run(()=>document.querySelector('[data-block=sec_style][data-key=content]').value),'Original authored style');
  await open('sections');await click('[data-review-section=style]');
  const rows=await run(()=>[...document.querySelectorAll('[data-section-choice]')].map(el=>el.closest('article').innerText));
  assert.ok(rows.some(line=>line.includes('Original authored style')&&line.includes('New workshop suggestion')));
  await click('#modal-root [data-act=apply]');await saved();await open('prompts');
  assert.equal(await run(()=>document.querySelector('[data-block=sec_style][data-key=content]').value),'Original authored style');
  await open('sections');await click('[data-review-section=style]');
  await run(()=>{const el=document.querySelector('[data-section-choice="content"]');el.value='section';el.dispatchEvent(new Event('change',{bubbles:true}));});
  await click('#modal-root [data-act=apply]');await saved();await open('prompts');
  const block=(await dump()).prompts[0].blocks[0];assert.equal(block.content,'New workshop suggestion');assert.equal(block.name,'Editor title');assert.equal(block.role,'assistant');
}
async function independentEdits() {
  await seed();await open('sections');
  for(const [key,value] of [['style','Style base'],['bond','Bond base'],['format','Format base']]) {
    await click('[data-sec='+key+']');await edit('[data-custom='+key+']',value);
  }
  await saved();await open('prompts');await edit('[data-block=sec_style][data-key=content]','Independent prompt');
  await saved();await open('lore');await click('.entry[data-id=sec_bond]');await edit('[data-field=content]','Independent lore');await edit('[data-field=depth]','9');
  await saved();await open('regex');await edit('[data-field=findRegex]','/harbor/g');
  await saved();await open('quick');await click('#add-qr');await edit('#qr-list .paper:last-child [data-k=message]','Independent reply');
  await edit('#qr-list .paper:first-child [data-k=message]','Authored format');await saved();
  const before=await dump();await open('sections');assert.deepEqual(await dump(),before);
  await click('[data-sec=pov]');await saved();await open('sections');
  const after=await dump();
  assert.equal(after.prompts[0].blocks.find(b=>b.id==='sec_style').content,'Independent prompt');
  assert.equal(after.worlds[0].entries.find(e=>e.id==='sec_bond').content,'Independent lore');
  assert.equal(after.worlds[0].entries.find(e=>e.id==='sec_bond').depth,9);assert.equal(after.regex[0].findRegex,'/harbor/g');
  assert.deepEqual(after.quick[0].replies.map(r=>r.message),['Authored format','Independent reply']);
  await click('[data-sec=format]');await saved();assert.deepEqual((await dump()).quick[0].replies.map(r=>r.message),['Authored format','Independent reply']);
  await click('[data-review-section=format]');
  await run(()=>{const choice=document.querySelector('[data-section-choice="$row"]');if(!choice)throw Error('Expected deletion preview');choice.value='section';});
  await click('#modal-root [data-act=apply]');await saved();await open('quick');
  assert.deepEqual((await dump()).quick[0].replies.map(r=>r.message),['Independent reply']);
  await open('prompts');await click('#blocks [data-del=sec_style]');await saved();
  await open('sections');await edit('[data-custom=style]','Style after deletion');await saved();
  assert.equal((await dump()).prompts[0].blocks.some(b=>b.id==='sec_style'),false);
  await click('[data-review-section=style]');
  await run(()=>{document.querySelector('[data-section-choice="$row"]').value='section';});
  await click('#modal-root [data-act=apply]');await saved();await open('prompts');
  assert.equal((await dump()).prompts[0].blocks.find(b=>b.id==='sec_style').content,'Style after deletion');
}
async function staleReviewAndRestore() {
  await seed();await open('sections');await click('[data-sec=style]');await edit('[data-custom=style]','Section baseline');await saved();
  await open('prompts');await edit('[data-block=sec_style][data-key=content]','Independent draft');await saved();
  await open('sections');await edit('[data-custom=style]','Section revision');await saved();await click('[data-review-section=style]');
  await run(()=>{document.querySelector('[data-section-choice=content]').value='section';});
  const original=win;
  try {
    win=new BrowserWindow({show:false,webPreferences:{session:qa,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
    await open('prompts');await edit('[data-block=sec_style][data-key=content]','Later work in another window');await saved();
  } finally {if(win!==original)win.destroy();win=original;}
  await click('#modal-root [data-act=apply]');await wait(()=>!!document.querySelector('#toasts [role=alert]'),'concurrent edit rejection');
  await open('prompts');assert.equal((await dump()).prompts[0].blocks[0].content,'Later work in another window');
  await open('sections');await click('[data-review-section=style]');
  await run(async()=>{
    const next=structuredClone(TAUI.state.lib);next.promptPresets[0].blocks[0].content='Updated during preview';
    await TAUI.commitLibrary(next);document.querySelector('[data-section-choice=content]').value='section';
  });
  await click('#modal-root [data-act=apply]');await wait(()=>!!document.querySelector('#toasts [role=alert]'),'stale preview rejection');
  assert.equal((await dump()).prompts[0].blocks[0].content,'Updated during preview');
  await open('backup');const backup=await download('#save-backup','sections-restore.json');
  await seed();await open('backup');
  await run(text=>{TAUI.pickFile=async()=>new File([text],'sections-restore.json',{type:'application/json'});},JSON.stringify(backup));
  await click('#load-backup');await wait(()=>!!document.querySelector('#modal-root [data-act=replace]'),'backup review');
  await click('#modal-root [data-act=replace]');
  await wait(()=>!document.querySelector('#app').inert && TAUI.state.lib.promptPresets[0]?.blocks[0]?.content==='Updated during preview','restored authored target');
  await open('sections');await edit('[data-custom=style]','After backup restore');await saved();
  await open('prompts');assert.equal((await dump()).prompts[0].blocks[0].content,'Updated during preview');
  await open('sections');await click('[data-review-section=style]');
  await run(()=>{document.querySelector('[data-section-choice=content]').value='section';});
  await click('#modal-root [data-act=apply]');await saved();await open('sections');
  await edit('[data-custom=style]','Following an explicitly accepted value');await saved();await open('prompts');
  assert.equal((await dump()).prompts[0].blocks[0].content,'Following an explicitly accepted value');
}
async function safetyWord() {
  await seed();await open('sections');await click('[data-sec=safe]');
  await run(()=>{const el=document.querySelector('[data-word]');el.focus();el.select();});
  for(const c of ['P','A','S','E'])await win.webContents.insertText(c);
  assert.equal(await run(()=>document.activeElement===document.querySelector('[data-word]')),true);
  await run(()=>document.querySelector('[data-word]').setSelectionRange(2,2));await win.webContents.insertText('U');
  assert.deepEqual(await run(()=>{const el=document.querySelector('[data-word]');return [el.value,el.selectionStart,el.selectionEnd];}),['PAUSE',3,3]);
  await run(()=>document.querySelector('[data-word]').select());
  const debuggerApi=win.webContents.debugger;
  debuggerApi.attach('1.3');
  try {
    await debuggerApi.sendCommand('Input.imeSetComposition',{text:'ting',selectionStart:4,selectionEnd:4});
    assert.equal(await run(()=>TAUI.state.lib.sections.safe.word),'PAUSE','The phonetic composition is still provisional');
    await debuggerApi.sendCommand('Input.insertText',{text:'暂停'});
  } finally {debuggerApi.detach();}
  await wait(()=>TAUI.state.lib.sections.safe.word==='暂停','IME commit');
  assert.deepEqual(await run(()=>{const el=document.querySelector('[data-word]');return [el.value,el===document.activeElement];}),['暂停',true]);
  await saved();await open('sections');
  assert.equal(await run(()=>document.querySelector('[data-word]').value),'暂停');
  await open('lore');const data=await download('#export-book','sections-world.json');const entries=Object.values(data.entries);
  assert.ok(entries.some(e=>e.key.includes('暂停')&&e.content.includes('暂停')&&e.constant));
  await open('backup');const backup=await download('#save-backup','sections-backup.json');
  assert.ok(JSON.stringify(backup).includes('暂停'));
}
(async()=>{
  await app.whenReady();qa=session.fromPartition('persist:sections-regression');
  qa.webRequest.onBeforeRequest((request,done)=>done({cancel:/^https?:/.test(request.url)}));
  win=new BrowserWindow({show:false,width:1280,height:980,webPreferences:{session:qa,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
  for(const check of [discoverableDestinations,legacyReadOnly,independentEdits,safetyWord,staleReviewAndRestore]){
    try{await check();console.log('ok',check.name);}
    catch(err){process.exitCode=1;console.error(check.name,err.stack||err);}
  }
})().catch(err=>{console.error(err);process.exitCode=1;}).finally(()=>app.exit(process.exitCode||0));
