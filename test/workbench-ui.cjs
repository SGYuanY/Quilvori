/* Run with npm run test:ui. Every file and provider response belongs to the temporary QA profile. */
const {app,BrowserWindow,session} = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const {once} = require('node:events');
const profile = process.env.QUILVORI_TEST_PROFILE;
if (!profile || path.dirname(profile)!==os.tmpdir() || !path.basename(profile).startsWith('quilvori-ui-')) throw new Error('A dedicated test profile is required');
app.setPath('userData',profile);
const root = path.resolve(__dirname,'..');
const sleep = ms=>new Promise(resolve=>setTimeout(resolve,ms));
let requests=[], reply={}, replyQueue=[], failNext=false, win;
const server = http.createServer(async (req,res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');
  res.setHeader('Access-Control-Allow-Private-Network','true');
  if (req.method==='OPTIONS') { res.writeHead(204);res.end();return; }
  res.setHeader('Content-Type','application/json');
  if (req.url==='/v1/models') {
    res.end(JSON.stringify({data:[{id:'fixture',context_length:32768,supported_reasoning_efforts:['low','medium'],recommended_reasoning_effort:'medium'}]}));
    return;
  }
  if (req.url!=='/v1/chat/completions') { res.writeHead(404);res.end('{}');return; }
  const chunks=[]; for await (const part of req) chunks.push(part);
  const body=JSON.parse(Buffer.concat(chunks).toString());
  requests.push(JSON.parse(body.messages.at(-1).content));
  if (failNext) { failNext=false;res.writeHead(503);res.end('{"error":{"message":"fixture offline"}}');return; }
  const response=replyQueue.length ? replyQueue.shift() : reply;
  res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(response)}}]}));
});
const errors = [];
const run = async (fn,...args)=>{
  const outcome=await win.webContents.executeJavaScript('(async()=>{try{return {value:await ('+fn.toString()+')(...'+JSON.stringify(args)+')}}catch(error){return {issue:error.stack || error.message}}})()',true);
  if(outcome.issue)throw new Error(outcome.issue);
  return outcome.value;
};
const wait = async (fn,label,...args) => {
  for (let n=0;n<130;n++) { if (await run(fn,...args)) return; await sleep(60); }
  const detail = await run(()=>document.querySelector('#ai-status')?.textContent || document.querySelector('#stage .empty')?.textContent || document.body.innerText.slice(-250));
  throw new Error(label+' timed out: '+detail);
};
const click = selector=>run(sel=>{ const el=document.querySelector(sel); if(!el||el.disabled)throw new Error('Button unavailable: '+sel); el.click(); },selector);
const input = (sel,val)=>run((q,v)=>{ const element=document.querySelector(q); element.value=v;element.dispatchEvent(new Event('input',{bubbles:true})); },sel,val);
const change = (sel,val)=>run((q,v)=>{ const element=document.querySelector(q);element.value=v;element.dispatchEvent(new Event('change',{bubbles:true})); },sel,val);
const loaded = ()=>wait(()=>!!document.querySelector('#stage > *'),'initial page');
const load = async (file='index.html')=>{await win.loadFile(path.join(root,file));await loaded();};
const menu = ()=>click('[data-shell=settings]');
const shelfEntries = kind => run(k=>[...document.querySelectorAll('[data-draft-shelf="'+k+'"] .draft-shelf-list strong')].map(x=>x.textContent),kind);
const pairNames = ['Night Courier','Coastal Almanac'];
async function verifyLegacyPreview(){
  await load();
  const ids=await run(()=>{
    const result={character:{name:'Legacy lighthouse keeper',description:'A saved session-only sketch.'}};
    const plan=NIJANAI.proposal(TAUI.state.lib,'create:character',result,{brief:'The keeper'});
    plan.batchId='legacy-fixture-batch';plan.result=result;delete plan.draftRevision;
    const entity=plan.operations.find(row=>row.kind==='add' && row.path[0]==='characters').value.id;
    // This last pagehide handler supplies exactly what the previous version left behind.
    const legacy=JSON.stringify({mode:'create',creationBatchId:plan.batchId,plans:[plan]});
    window.addEventListener('pagehide',()=>sessionStorage.setItem('realmweave-studio.v2',legacy),{once:true});
    return {plan:plan.id,entity};
  });
  await load();
  const row='[data-open-draft="'+ids.plan+'"]', adopt='[data-plan="'+ids.plan+'"] [data-apply]', open='[data-open-delivery="'+ids.plan+'"]';
  assert.ok(await run(sel=>!!document.querySelector(sel),row),'old window preview should migrate directly onto the home shelf');
  await click(row);await click(adopt);
  await wait(()=>TAUI.state.lib.characters.some(c=>c.name==='Legacy lighthouse keeper'),'adopt migrated work');
  assert.equal(await run(()=>TAUI.state.lib.characters.find(c=>c.name==='Legacy lighthouse keeper').id),ids.entity);
  await click('#ai-undo');
  await wait(()=>!TAUI.state.lib.characters.some(c=>c.name==='Legacy lighthouse keeper'),'undo migrated work');
  await click('[data-nav=home]');
  const recovered=await run(()=>TAStudioDrafts.pending().find(r=>r.plan.batchId==='legacy-fixture-batch'));
  assert.equal(recovered.plan.id,ids.plan);assert.equal(recovered.plan.operations[0].value.id,ids.entity);
  await click(row);await click(adopt);await wait(()=>!!document.querySelector('[data-open-delivery]'),'adopt again');
  await click(open);
  assert.equal(await run(()=>TAUI.state.sel.character),ids.entity);
  await click('[data-act=del]');await click('#modal-root [data-act=yes]');
  await wait(()=>!TAUI.state.lib.characters.some(c=>c.name==='Legacy lighthouse keeper'),'remove adopted work');
  await run(()=>TAUI.flush());await load();
  assert.equal(await run(sel=>!!document.querySelector(sel),row),false);
  assert.equal(await run(()=>TAStudioDrafts.pending().some(r=>r.plan.batchId==='legacy-fixture-batch')),false);
  log('a legacy session-only draft migrates on startup, keeps its identities through adoption and undo, and stays removed after deletion');
}
async function generatePairedDrafts(){
  await load('studio.html');await click('[data-mode=create]');await click('#ai-create-new');
  await input('#ai-brief','Create a courier and the almanac that guides her.');
  await run(()=>document.querySelectorAll('[data-module]').forEach(el=>{el.checked=['character','world'].includes(el.dataset.module);el.dispatchEvent(new Event('change',{bubbles:true}));}));
  const start=requests.length;
  // The model receives one module per request; the second request should know about
  // the first module even before the user decides to add the character to the library.
  replyQueue=[{character:{name:pairNames[0],description:'Delivers maps after dusk.'}},{world:{name:pairNames[1],entries:[{comment:'Red buoy',content:'A dim red lantern marks the jetty.',keys:['buoy']}]}}];
  await click('#ai-create');
  await wait(()=>!NIJANStudio.running() && document.querySelectorAll('.draft-delivery').length>=2,'paired draft');
  assert.equal(requests.length,start+2);
  assert.equal(requests[start+1].created.character.name,pairNames[0]);
  await load();assert.deepEqual((await shelfEntries('all')).sort(),[...pairNames].sort());
  await load('characters.html');assert.deepEqual(await shelfEntries('character'),[pairNames[0]]);
  await load('lore.html');assert.deepEqual(await shelfEntries('world'),[pairNames[1]]);
  assert.equal(await run(()=>TAUI.state.lib.characters.length),0);
  assert.equal(await run(()=>TAUI.state.lib.worldBooks.some(b=>b.name==='Coastal Almanac')),false);
  log('one model generation leaves the character and companion world visible on the collection and their own draft shelves');
}
async function adoptRestartedPair(){
  await load();assert.deepEqual((await shelfEntries('all')).sort(),[...pairNames].sort());
  for(const [index,kind] of ['character','world'].entries()){
    const route=kind==='character'?'characters':'lore';
    await load(route+'.html');assert.deepEqual(await shelfEntries(kind),[pairNames[index]]);
    const id=await run(()=>document.querySelector('[data-open-draft]').dataset.openDraft);
    await click('[data-open-draft]');await wait(()=>TAUI.state.route==='studio'&&!!document.querySelector('.draft-delivery'),'resumed preview');
    const selector='[data-plan="'+id+'"] ';
    await click(selector+'[data-apply]');
    const delivery='[data-open-delivery="'+id+'"]';
    for(let i=0;i<100 && !await run(s=>!!document.querySelector(s),delivery);i++)await sleep(35);
    assert.ok(await run(s=>!!document.querySelector(s),delivery),'adopting should expose its own work link');
    assert.ok(await run(s=>document.querySelector(s).disabled,selector+'[data-apply]'),'an adopted plan cannot be applied twice');
    await click(delivery);
    const names=await run((kind,name)=>{
      const list=kind==='character'?TAUI.state.lib.characters:TAUI.state.lib.worldBooks;
      const selected=kind==='character'?TAUI.state.sel.character:TAUI.state.sel.book;
      return {route:TAUI.state.route,opened:list.find(item=>item.id===selected)?.name,count:list.filter(item=>item.name===name).length};
    },kind,pairNames[index]);
    assert.deepEqual(names,{route,opened:pairNames[index],count:1});
    assert.equal(await run(type=>TAStudioDrafts.pending().filter(x=>x.plan.task==='create:'+type).length,kind),0);
  }
  await load();assert.deepEqual(await shelfEntries('all'),[]);
  assert.deepEqual(await run(()=>[TAUI.state.lib.characters.filter(c=>c.name==='Night Courier').length,TAUI.state.lib.worldBooks.filter(b=>b.name==='Coastal Almanac').length]),[1,1]);
  log('a new Electron process opens each persisted draft, adopts once and jumps to its actual work');
}
async function generatedAuthoringHelpers(){
  await load('quick.html');await change('[data-ref-card]','keeper');await change('[data-ref-world]','book');
  await change('[data-ref-scope]','selected');await click('.reply-entry-choices input[value="door"]');
  await input('[data-assist]','Ask this keeper about the locked door.');
  reply={quick:{name:'Door questions',replies:[{label:'Ask',message:'Which door is locked?'}]}};
  await click('[data-assist-go]');
  await wait(()=>document.querySelector('[data-assist-preview]')?.textContent.includes('Door questions'),'grounded quick replies');
  const quick=requests.at(-1);
  assert.equal(quick.reference.card.id,'keeper');assert.equal(quick.reference.book.id,'book');
  assert.deepEqual(quick.reference.book.entries.map(row=>row.id),['door']);
  await load('regex.html');
  await input('[data-regex-example=original]','Notes: the quay');await input('[data-regex-example=expected]','the quay');await input('[data-regex-example=unchanged]','message: greeting');
  assert.equal(await run(()=>document.querySelector('[data-assist]').value),'');
  reply={regex:{scriptName:'Remove notes marker',findRegex:'^Notes: ',replaceString:''}};
  await click('[data-assist-go]');await wait(()=>document.querySelector('[data-assist-preview]')?.textContent.includes('Remove notes marker'),'example-only regex');
  assert.deepEqual(requests.at(-1).regexExamples,{original:'Notes: the quay',expected:'the quay',unchanged:'message: greeting'});
  log('quick replies use the specified card and entries; regex examples alone can generate a preview');
}
const log = msg=>console.log('ok',msg);
async function exercise() {
  server.listen(0,'127.0.0.1'); await once(server,'listening');
  const address='http://127.0.0.1:'+server.address().port+'/v1';
  const qa = session.fromPartition('persist:workshop-fixture');
  let seed = true;
  qa.webRequest.onBeforeRequest((details,done)=>{
    const u=new URL(details.url);
    done({cancel:(seed && /\/js\/views.js$/.test(u.pathname)) || (u.protocol.startsWith('http') && u.hostname!=='127.0.0.1')});
  });
  win=new BrowserWindow({show:false,width:1400,height:970,webPreferences:{session:qa,contextIsolation:true,nodeIntegration:false}});
  win.webContents.on('console-message',(_event,level,message)=>{if(level>=3 && !/ERR_BLOCKED_BY_CLIENT|503|fixture offline|Content Security Policy/.test(message)) errors.push(message);});
  await win.loadFile(path.join(root,'index.html'));
  await run(()=>{
    const lib=TAStore.emptyLibrary();
    lib.characters.push({id:'keeper',name:'Fixture Keeper',tags:[],alternate_greetings:[],description:'Original draft',personality:'',scenario:'',expressionAssetIds:[]});
    lib.worldBooks.push({id:'book',name:'Fixture Archive',entries:[{id:'door',comment:'Door',content:'A brass door.',keys:['door'],secondaryKeys:[],enabled:true,position:'before_char',order:100}]});
    localStorage.setItem(TAStore.KEY,JSON.stringify(lib));
  });
  seed=false;await load();
  assert.equal(await run(()=>TAStore.backend),'indexedDB');
  assert.equal(await run(()=>TAUI.state.lib.characters[0].description),'Original draft');
  assert.equal(await run(async()=>JSON.parse(await TAStore.migrationBackup()).characters[0].description),'Original draft');
  assert.equal(await run(()=>localStorage.getItem(TAStore.KEY)), 'quilvori-library:IndexedDB');
  log('legacy library migrated under its original IDs');
  await click('[data-nav=studio]');await wait(()=>!!document.querySelector('[data-mode=create]'),'studio');
  await click('[data-mode=create]');await input('#ai-brief','A librarian follows a handwritten map.');
  await click('#ai-create');await wait(()=>!!document.querySelector('#model-id'),'model connection');
  await input('#set-base',address);await input('#set-key','fixture-only');
  await change('#set-protocol','chat');await input('#model-id','fixture');
  await click('#set-connect');await wait(()=>document.querySelector('#model-info')?.textContent.includes('32768'),'provider metadata');
  assert.match(await run(()=>document.querySelector('#model-info').textContent),/medium/);
  await click('#set-close');
  assert.equal(await run(()=>document.querySelector('#ai-brief').value),'A librarian follows a handwritten map.');
  await run(()=>document.querySelectorAll('[data-module]').forEach(el=>{el.checked=el.dataset.module==='character';el.dispatchEvent(new Event('change',{bubbles:true}));}));
  reply={character:{name:'Mapkeeper',description:'An archivist.'}};
  await click('#ai-create');await wait(()=>!!document.querySelector('[data-plan]'),'direct writing');
  assert.deepEqual(requests.at(-1).ideas,[]);assert.deepEqual(requests.at(-1).answers,[]);
  assert.equal(await run(()=>TAUI.state.lib.characters.length),1);
  log('a brief opens model setup and produces a draft without optional inputs');
  reply={status:'needs_input',question:'Which shelf?'};
  await click('#ai-questions');await wait(()=>!!document.querySelector('[data-answer]'),'visible question');
  assert.match(await run(()=>document.querySelector('[data-answer]').parentElement.textContent),/Which shelf/);
  await input('[data-answer]','The west shelf.');
  reply={ideas:['A moonlit atlas','UNSELECTED_FIXTURE']};
  await click('#ai-ideas');await wait(()=>document.querySelectorAll('[data-idea]').length===2,'inspiration options');
  await click('[data-idea="0"]');
  reply={character:{name:'Mapkeeper',description:'A moonlit atlas on the west shelf.'}};
  await click('#ai-create');await wait(()=>document.querySelector('.ai-workbench')?.dataset.busy==='false' && document.querySelector('.ai-diff')?.textContent.includes('west shelf'),'selected inputs');
  assert.deepEqual(requests.at(-1).ideas,['A moonlit atlas']); assert.equal(requests.at(-1).answers[0].answer,'The west shelf.');
  assert.ok(!JSON.stringify(requests.at(-1)).includes('UNSELECTED_FIXTURE'));
  failNext=true;await click('#ai-create');await wait(()=>document.querySelector('#creation-feedback')?.textContent.includes('503'),'visible error');
  assert.match(await run(()=>document.querySelector('.ai-diff').textContent),/west shelf/);
  log('optional questions and selected inspirations reach the request, and failures retain the draft');
  await menu();await input('#profile-name','Fast checks');await click('#add-profile');
  assert.equal(await run(()=>document.querySelector('#set-key').value),'');
  await input('#model-id','quick-fixture');await click('#set-close');
  assert.equal(await run(()=>NIJANModel.load().model),'quick-fixture');
  await change('#studio-profile','default');
  assert.equal(await run(()=>NIJANModel.load().model),'fixture');
  assert.ok(!await run(()=>JSON.stringify(TAFormats.backupOf(TAUI.state.lib)).includes('fixture-only')));
  log('named configurations switch from the studio and stay outside library backups');
  await generatedAuthoringHelpers();
  await load('characters.html');
  await click('[data-act=view-edit]');
  await run(()=>document.querySelector('.revision-panel').open=true);
  await wait(()=>!!document.querySelector('[data-snapshot]'),'history panel');
  await input('[data-label]','First version');await click('[data-snapshot]');
  await wait(()=>document.querySelector('[data-versions]')?.options.length===1,'manual snapshot');
  await run(async()=>{
    const c=TAUI.state.lib.characters[0];
    const ctx={instruction:'Revise',targets:[{target:'character',id:c.id,fields:['description'],value:structuredClone(c)}]};
    const plan=NIJANAI.proposal(TAUI.state.lib,'edit',{changes:[{target:'character',id:c.id,fields:{description:'Edited draft'}}]},ctx);
    await NIJANStudio.applyExternal(plan);TAUI.renderStage();
  });
  assert.equal(await run(()=>TAUI.state.lib.characters[0].description),'Edited draft');
  await load('characters.html');await run(()=>document.querySelector('.revision-panel').open=true);
  await wait(()=>document.querySelector('[data-versions]')?.options.length===2,'snapshot persistence');
  assert.match(await run(()=>document.querySelector('[data-diff]').textContent),/Original draft/);
  await click('[data-restore]');await click('#modal-root [data-act=yes]');
  await wait(()=>TAUI.state.lib.characters[0].description==='Original draft','restore');
  assert.equal(await run(()=>TAUI.state.lib.worldBooks[0].entries[0].content),'A brass door.');
  log('manual and automatic snapshots survive navigation and restore one work');
  // The payload exceeds Web Storage quotas and belongs only to this isolated profile.
  await run(async()=>{const next=structuredClone(TAUI.state.lib);next.memoryHtml='x'.repeat(6*1024*1024);await TAUI.commitLibrary(next);});
  await load('lore.html');
  assert.equal(await run(()=>TAUI.state.lib.memoryHtml.length),6291456);
  assert.equal(await run(async()=>JSON.parse(await TAStore.migrationBackup()).memoryHtml?.length || 0),0);
  log('a library over 6 MiB survives reload without rewriting the legacy copy');
  // A second renderer commits a newer version. The stale view must reject replacement.
  const other=new BrowserWindow({show:false,webPreferences:{session:qa}});
  await other.loadFile(path.join(root,'index.html'));
  for(let n=0;n<100;n++){if(await other.webContents.executeJavaScript('!!document.querySelector("#stage > *")'))break;await sleep(50);}
  await other.webContents.executeJavaScript('(()=>{const next=structuredClone(TAUI.state.lib);next.meta.name="Other window";return TAUI.commitLibrary(next);})()');
  assert.equal(await run(async()=>{const prev=TAUI.state.lib;try {await TAUI.commitLibrary({...prev,memoryHtml:'overwritten'});return false;}catch(_){return TAUI.state.lib===prev;}}),true);
  other.destroy();await load();
  assert.equal(await run(()=>TAUI.state.lib.meta.name),'Other window');
  log('a stale window cannot overwrite a newer commit');
  // Simulate an unreadable primary record. The previous IDB version remains available for recovery.
  await run(()=>new Promise((resolve,reject)=>{
    const r=indexedDB.open('quilvori-library');
    r.onsuccess=()=>{const db=r.result,tx=db.transaction('library','readwrite'),table=tx.objectStore('library'),get=table.get('current');
      get.onsuccess=()=>table.put({seq:get.result.seq+1,data:'fixture broken'},'current');
      tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>reject(tx.error);};
  }));
  await win.loadFile(path.join(root,'index.html'));await wait(()=>!!document.querySelector('[data-rescue]'),'recovery');
  assert.equal(await run(()=>!!document.querySelector('#stage')),false);
  await run(()=>{window.confirm=()=>true;document.querySelector('[data-previous]').click();});
  await loaded();
  assert.equal(await run(()=>TAUI.state.lib.characters[0].id),'keeper');
  log('a damaged primary record opens recovery and restores the previous library');
  await load('backup.html');
  await run(()=>{
    const backup=TAStore.emptyLibrary();backup.meta.name='Recovered manuscript';
    TAUI.pickFile=async()=>new File([JSON.stringify(TAFormats.backupOf(backup))],'backup.json',{type:'application/json'});
    window.originalWrite=TAStore.save;TAStore.save=async()=>{throw new Error('fixture storage failure');};
  });
  await click('#load-backup');await wait(()=>!!document.querySelector('[data-act=replace]'),'restore choice');await click('[data-act=replace]');
  await wait(()=>document.querySelector('#toasts')?.textContent.includes('fixture storage failure'),'save error');
  assert.equal(await run(()=>TAUI.state.lib.characters[0].id),'keeper');
  await run(()=>{TAStore.save=window.originalWrite;});
  await click('#load-backup');await wait(()=>!!document.querySelector('[data-act=replace]'),'restore again');await click('[data-act=replace]');
  await wait(()=>TAUI.state.lib.meta.name==='Recovered manuscript','successful restore');await load('backup.html');
  assert.equal(await run(()=>TAUI.state.lib.meta.name),'Recovered manuscript');
  await click('#backup-demo');await click('[data-act=yes]');await wait(()=>TAUI.state.lib.characters.length>0,'load demo');await load('studio.html');
  await click('[data-mode=create]');await input('#ai-brief','Write about the archive.');
  await run(()=>document.querySelectorAll('[data-module]').forEach(el=>{el.checked=el.dataset.module==='character';el.dispatchEvent(new Event('change',{bubbles:true}));}));
  await click('#ai-create-new');
  reply={character:{name:'Demo draft',description:'Born with a map.'}};
  await click('#ai-create');await wait(()=>document.querySelector('.ai-workbench')?.dataset.busy==='false' && document.querySelector('.ai-previews')?.textContent.includes('Born with a map.'),'writing from demo');
  await load('backup.html');await click('#backup-clear');await click('[data-act=yes]');
  await wait(()=>TAUI.state.lib.characters.length===0,'clear');await load();
  assert.equal(await run(()=>TAUI.state.lib.characters.length),0);
  assert.equal(await run(async()=>(await TAHistory.list('characters','keeper')).length),0);
  assert.equal(await run(()=>localStorage.getItem(TAStore.KEY)),null);
  assert.equal(await run(()=>TAStore.hasMigrationBackup),false);
  log('backup replacement failure preserves the old library, and demo and clear persist across reloads');
  await run(async()=>{
    const item={id:'restart-fixture',name:'Saved manuscript',entries:[]};
    const next=structuredClone(TAUI.state.lib);next.worldBooks.push(item);
    await TAUI.commitLibrary(next);await TAHistory.save('worldBooks',item,'After restart');
  });
  await verifyLegacyPreview();
  await generatePairedDrafts();
  assert.deepEqual(errors,[]);
}
async function verifyFileImportCommits() {
  const imports = [
    ['prompts','import-preset','promptPresets','name',{name:'Imported preset',prompts:[{name:'Voice',content:'First person.'}]}],
    ['chat','import-chat','chats','name',{name:'Imported conversation',messages:[{name:'Fixture',mes:'Hello.'}]}],
    ['regex','import-rx','regexScripts','scriptName',[{scriptName:'Imported regex',findRegex:'fixture'}]],
    ['quick','import-qr','quickReplySets','name',{name:'Imported reply set',qrList:[{label:'Hello',message:'Good morning.'}]}],
  ];
  for (const [page,button,bucket,field,payload] of imports) {
    const label = (Array.isArray(payload) ? payload[0] : payload)[field];
    await load(page+'.html');
    const after = await run(async (button,bucket,field,payload,label) => {
      const pick = TAUI.pickFile;
      TAUI.pickFile = async () => {
        const next = structuredClone(TAUI.state.lib);
        next.meta.name = 'While picking '+label;
        await TAUI.commitLibrary(next);
        return new File([JSON.stringify(payload)],'fixture.json',{type:'application/json'});
      };
      try {
        await document.getElementById(button).onclick();
        return [TAUI.state.lib.meta.name,TAUI.state.lib[bucket].filter(item=>item[field]===label).length];
      } finally { TAUI.pickFile = pick; }
    },button,bucket,field,payload,label);
    assert.deepEqual(after,['While picking '+label,1],page+' imports into the current library after selecting a file');
    await load(page+'.html');
    assert.equal(await run((bucket,field,label)=>TAUI.state.lib[bucket].some(item=>item[field]===label),bucket,field,label),true,page+' import survives reload');
  }
  await load('chat.html');
  const failed = await run(async () => {
    const pick = TAUI.pickFile, save = TAStore.save;
    const before = TAUI.state.lib, selected = TAUI.state.sel.chat;
    TAUI.pickFile = async () => new File(['[{"name":"Fixture","mes":"Hello."}]'],'unwritten-chat.json');
    TAStore.save = async () => { throw new Error('fixture import disk failure'); };
    try {
      await document.querySelector('#import-chat').onclick();
      return [TAUI.state.lib===before,TAUI.state.sel.chat===selected,!!document.querySelector('#toasts .toast-success'),document.querySelector('#toasts [role=alert]')?.textContent];
    } finally { TAUI.pickFile=pick;TAStore.save=save; }
  });
  assert.deepEqual(failed.slice(0,3),[true,true,false]);
  assert.match(failed[3],/fixture import disk failure/);
  await load('chat.html');
  assert.equal(await run(()=>TAUI.state.lib.chats.some(item=>item.name==='unwritten-chat')),false);
  log('preset, chat, regex and reply imports survive concurrent saves and reloads, and a rejected write reports failure');
}
async function verifyImageBatches() {
  for (const [page,mode] of [['assets','broken'],['assets','saved'],['characters','broken'],['characters','switched'],['lore','removed']]) {
    await load(page+'.html');
    const result = await run(async (page,mode) => {
      const original = structuredClone(TAUI.state.lib);
      const ownerKey = page==='lore' ? 'worldBooks' : 'characters';
      const names = ['batch-a.png','batch-b.png'];
      original.assets = original.assets.filter(item=>!names.includes(item.name));
      original.stickerPacks = [{id:'pack-first',name:'First pack',stickers:[]},{id:'pack-other',name:'Other pack',stickers:[]}];
      original[ownerKey][0].stickerPackId = 'pack-first';
      await TAUI.commitLibrary(original);
      TAUI.state.sel[page==='lore' ? 'book' : 'character'] = original[ownerKey][0].id;
      TAUI.renderStage();
      const pick = TAUI.pickFile, read = TAUI.readDataUrl;
      TAUI.pickFile = async () => names.map(name=>new File(['fixture'],name,{type:'image/png'}));
      const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jTioAAAAASUVORK5CYII=';
      TAUI.readDataUrl = async file => {
        if (file.name===names[1]) {
          const live = structuredClone(TAUI.state.lib);
          live.meta.name = 'Concurrent '+mode;
          if (mode==='removed') live.stickerPacks = live.stickerPacks.filter(pack=>pack.id!=='pack-first');
          if (mode==='switched') {
            live[ownerKey][0].stickerPackId = 'pack-other';
            live.stickerPacks[0].stickers.push({name:'existing.png',dataUrl:pixel});
          }
          await TAUI.commitLibrary(live);
          if (mode==='broken') throw new Error('fixture read failed');
        }
        return pixel;
      };
      try {
        await document.querySelector(page==='assets' ? '[data-kind=avatar]' : '#pack-add').onclick();
        return {error:document.querySelector('#toasts [role=alert]')?.textContent || '',name:TAUI.state.lib.meta.name};
      } finally { TAUI.pickFile=pick;TAUI.readDataUrl=read; }
    },page,mode);
    assert.equal(result.name,'Concurrent '+mode);
    if (mode==='broken') assert.match(result.error,/batch-b\.png.*fixture read failed/);
    if (mode==='removed') assert.ok(result.error);
    await load(page+'.html');
    const stored = await run(()=>({
      assets:TAUI.state.lib.assets.filter(item=>item.name.startsWith('batch-')).map(item=>item.name),
      packs:TAUI.state.lib.stickerPacks.map(pack=>[pack.id,pack.stickers.map(item=>item.name)]),
    }));
    assert.deepEqual(stored.assets,mode==='saved' ? ['batch-b.png','batch-a.png'] : [],page+' persists one complete batch');
    if (mode==='removed') assert.deepEqual(stored.packs,[['pack-other',[]]]);
    else assert.deepEqual(stored.packs,[['pack-first',mode==='switched'?['existing.png','batch-a.png','batch-b.png']:[]],['pack-other',[]]]);
  }
  log('failed image batches leave no partial assets or stickers, and uploads preserve the chosen pack');
}

async function verifyMemoryAndBackupImports() {
  for (const mode of ['changed','independent','failed']) {
    await load('memory.html');
    const result = await run(async mode => {
      const original = TAUI.state.lib.memoryHtml, save = TAStore.save, pick = TAUI.pickFile;
      const incoming = '<p>Imported panel for '+mode+'</p>';
      const expected = mode==='changed' ? '<p>Newer manuscript</p>' : mode==='failed' ? original : incoming;
      TAUI.pickFile = async () => {
        const next = structuredClone(TAUI.state.lib);
        if (mode==='changed') next.memoryHtml = expected;
        next.meta.name = 'Memory '+mode;
        await TAUI.commitLibrary(next);
        if (mode==='failed') TAStore.save = async () => { throw new Error('fixture disk failure'); };
        return new File([JSON.stringify({html:incoming})],'panel.json');
      };
      try {
        await document.querySelector('#memory-import').onclick();
        return [TAUI.state.lib.memoryHtml,document.querySelector('#memory-html').value,expected,!!document.querySelector('#toasts [role=alert]'),!!document.querySelector('#toasts .toast-success')];
      } finally { TAStore.save=save;TAUI.pickFile=pick; }
    },mode);
    assert.deepEqual(result,[result[2],result[2],result[2],mode!=='independent',mode==='independent']);
    await load('memory.html');
    assert.deepEqual(await run(()=>[TAUI.state.lib.memoryHtml,TAUI.state.lib.meta.name]),[result[2],'Memory '+mode]);
  }
  for (const mode of ['merge','conflict','replace']) {
    await load('backup.html');
    const result = await run(async mode => {
      const pick=TAUI.pickFile, ask=TAUI.ask, id=TAUI.state.lib.characters[0].id;
      const backup={characters:[{id,description:'From '+mode}],worldBooks:[{id:'backup-'+mode,name:'Restored '+mode,entries:[]}]};
      TAUI.pickFile = async () => new File([JSON.stringify(backup)],'fixture-backup.json');
      TAUI.ask = async options => {
        for(const choice of options.content?.querySelectorAll('[data-merge-choice]') || []) {
          choice.value='backup';choice.dispatchEvent(new Event('change',{bubbles:true}));
        }
        const live=structuredClone(TAUI.state.lib);
        live.characters[0].personality='Local '+mode;
        live.worldBooks.push({id:'concurrent-'+mode,name:'Added '+mode,entries:[]});
        if (mode==='conflict') live.characters[0].description='Edited during confirmation';
        await TAUI.commitLibrary(live);
        return mode==='replace' ? 'replace' : 'merge';
      };
      try {
        await document.querySelector('#load-backup').onclick();
        return !!document.querySelector('#toasts [role=alert]');
      } finally { TAUI.pickFile=pick;TAUI.ask=ask; }
    },mode);
    assert.equal(result,mode!=='merge');
    await load('backup.html');
    const stored=await run(mode=>[TAUI.state.lib.characters[0].personality,TAUI.state.lib.characters[0].description,TAUI.state.lib.worldBooks.some(row=>row.id==='concurrent-'+mode),TAUI.state.lib.worldBooks.some(row=>row.id==='backup-'+mode)],mode);
    assert.deepEqual(stored,['Local '+mode,mode==='merge'?'From merge':'Edited during confirmation',true,mode==='merge']);
  }
  log('memory and backup imports preserve independent edits, reject changed targets and report storage errors');
}

async function verifyIntegrityControls() {
  await load('chat.html');
  const expected = await run(async()=>{
    const chat={id:'standalone',name:'Paper desk',userName:'Reader',characterName:'Archivist',
      stHeader:{user_name:'Reader',character_name:'Archivist',chat_metadata:{edition:'original'}},
      messages:[{name:'Archivist',mes:'Original line',extra:{version:2},swipes:['Original line','Other ending']}],
      bookmarks:[{id:'bookmark',index:0,note:'Pinned',excerpt:'Original line'}]};
    const lib=TAStore.normalize({chats:[chat],characters:[{id:'keeper',name:'Keeper',description:'first\ncurrent paragraph\nlast',personality:'current'}],
      groups:[{id:'cast',name:'Dock cast',members:[{characterId:'keeper'}]}],
      graph:{nodes:[{id:'harbor-node',label:'Watch',characterId:'keeper'}]},
      regexScripts:[{id:'regex-fixture',scriptName:'Dots',findRegex:'a'}],
      quickReplySets:[{id:'replies',name:'Greeting',replies:[{id:'hello',label:'Hello',message:'Good day'}]}],
      worldBooks:[{id:'harbor-book',name:'Harbor',entries:[]}],
      scripts:[{id:'scene',name:'Evening',beats:[{id:'opening',speaker:'keeper',line:'Words'}]}]});
    await TAUI.commitLibrary(lib);TAUI.renderStage();
    let json;
    const original=TAUI.downloadJson;
    TAUI.downloadJson=(_file,data)=>{json=JSON.stringify(data);};
    try { document.querySelector('#export-chat').click(); } finally {TAUI.downloadJson=original;}
    const empty=structuredClone(TAUI.state.lib);empty.chats=[];
    await TAUI.commitLibrary(empty);TAUI.renderStage();
    TAUI.pickFile=async()=>new File([json],'reading.json',{type:'application/json'});
    await document.querySelector('#import-chat').onclick();
    return json;
  });
  assert.deepEqual(await run(()=>JSON.parse(JSON.stringify(TAUI.state.lib.chats[0]))),JSON.parse(expected));
  await load('chat.html');await wait(()=>!!document.querySelector('[data-jump="0"]'),'restored chat bookmark');
  await click('[data-jump="0"]');assert.equal(await run(()=>document.querySelector('#chat-log [data-index="0"] .body').textContent),'Original line');

  await load('characters.html');await click('[data-act=del]');
  await wait(()=>!!document.querySelector('[data-delete-mode]'),'character references');
  assert.ok(await run(()=>['Dock cast','Evening','Watch'].every(name=>document.querySelector('.integrity-references').textContent.includes(name))));
  await change('[data-delete-mode]','keep');await click('#modal-root [data-act=yes]');
  await wait(()=>TAUI.state.lib.characters.length===0,'character deletion');
  assert.equal(await run(()=>TAFormats.scriptToExport(TAUI.state.lib.scripts[0],TAUI.state.lib).beats[0].speaker),'Keeper');
  await click('#toasts .toast-action');await wait(()=>TAUI.state.lib.characters.length===1,'undo from deletion toast');
  assert.deepEqual(await run(()=>[TAUI.state.lib.groups[0].members[0].characterId,TAUI.state.lib.graph.nodes[0].characterId,TAUI.state.lib.scripts[0].beats[0].speaker]),['keeper','keeper','keeper']);

  for(const [page,bucket,button] of [['lore','worldBooks','#del-book'],['chat','chats','#del-chat'],['groups','groups','#del-group'],
      ['regex','regexScripts','#del-rx'],['quick','quickReplySets','#del-qr']]){
    await load(page+'.html');
    const saved=await run(key=>JSON.stringify(TAUI.state.lib[key][0]),bucket);
    await click(button);await click('#modal-root [data-act=no]');
    assert.equal(await run(key=>JSON.stringify(TAUI.state.lib[key][0]),bucket),saved);
    await click(button);await click('#modal-root [data-act=yes]');
    await wait(key=>TAUI.state.lib[key].length===0 && !!document.querySelector('#toasts .toast-action'),'reversible '+page+' deletion',bucket);
    await run(()=>TAUI.go('home'));await click('#toasts .toast-action');
    await wait((key,json)=>JSON.stringify(TAUI.state.lib[key][0])===json,'undo '+page+' from another page',bucket,saved);
  }

  await load('backup.html');
  await run(()=>{
    const backup={characters:[{id:'keeper',name:'Keeper',description:'first\nold paragraph\nlast',personality:'from backup'}]};
    TAUI.pickFile=async()=>new File([JSON.stringify(backup)],'draft-backup.json');
  });
  await click('#load-backup');await wait(()=>document.querySelectorAll('[data-merge-choice]').length===2,'field conflict preview');
  await run(()=>{document.querySelector('.integrity-conflict details').open=true;});
  await wait(()=>!!document.querySelector('.integrity-diff mark'),'paragraph differences');
  assert.equal(await run(()=>document.querySelector('.integrity-diff mark').textContent),'current paragraph');
  await click('#modal-root [data-act=no]');assert.equal(await run(()=>TAUI.state.lib.characters[0].description),'first\ncurrent paragraph\nlast');
  await click('#load-backup');await wait(()=>!!document.querySelector('[data-merge-choice]'),'second merge preview');
  await run(()=>{for(const choice of document.querySelectorAll('[data-merge-choice]')){
    choice.value=choice.dataset.mergeChoice.includes('description')?'copy':'backup';choice.dispatchEvent(new Event('change',{bubbles:true}));
  }});
  await click('#modal-root [data-act=merge]');await wait(()=>TAUI.state.lib.characters.length===2,'independent backup copy');
  await load('characters.html');
  assert.deepEqual(await run(()=>TAUI.state.lib.characters.map(card=>[card.description,card.personality,card.backupCopyOf??''])),
    [['first\ncurrent paragraph\nlast','from backup',''],['first\nold paragraph\nlast','from backup','keeper']]);
  log('standalone chat, reference-aware deletion and undo, and reviewed backup alternatives survive a fresh page');
}

async function verifyConfirmedDeletion() {
  for (const [page,bucket,button] of [['characters','characters','[data-act=del]'],['lore','worldBooks','#del-book']]) {
    await load(page+'.html');
    const id = await run((bucket)=>TAUI.state.lib[bucket][0].id,bucket);
    for (const mode of ['changed','failed','confirmed']) {
      const result = await run(async (bucket,button,id,mode) => {
        const ask=TAUI.ask, save=TAStore.save;
        TAUI.state.sel[bucket==='characters'?'character':'book']=id;
        TAUI.renderStage();
        TAUI.ask = async () => {
          const next=structuredClone(TAUI.state.lib);
          next.meta.name='Delete '+mode;
          if (mode==='changed') next[bucket].find(item=>item.id===id).name='Edited while confirming';
          await TAUI.commitLibrary(next);
          if (mode==='failed') TAStore.save=async()=>{throw new Error('fixture deletion failure');};
          return 'yes';
        };
        try {
          await document.querySelector(button).onclick();
          return !!document.querySelector('#toasts [role=alert]');
        } finally {TAUI.ask=ask;TAStore.save=save;}
      },bucket,button,id,mode);
      assert.equal(result,mode!=='confirmed');
      await load(page+'.html');
      assert.deepEqual(await run((bucket,id)=>[TAUI.state.lib.meta.name,TAUI.state.lib[bucket].find(row=>row.id===id)?.name ?? null],bucket,id),['Delete '+mode,mode==='confirmed'?null:'Edited while confirming']);
    }
  }
  log('confirming a deletion protects a changed work and removes only the confirmed, persisted target');
}

async function verifyRestart() {
  const qa=session.fromPartition('persist:workshop-fixture');
  qa.webRequest.onBeforeRequest((details,done)=>done({cancel:/^https?:/i.test(details.url)}));
  win=new BrowserWindow({show:false,webPreferences:{session:qa}});
  win.webContents.on('console-message',(_event,level,message)=>{if(level>=3 && !/ERR_BLOCKED_BY_CLIENT|Content Security Policy/.test(message)) errors.push(message);});
  await load('lore.html');
  assert.equal(await run(()=>TAUI.state.lib.worldBooks[0]?.id),'restart-fixture');
  assert.equal(await run(async()=>(await TAHistory.list('worldBooks','restart-fixture'))[0].label),'After restart');
  log('a fresh Electron process reopens the same saved library and version history');
  await run(()=>{
    const original=HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click=function() {
      if (!this.webkitdirectory) return original.call(this);
      HTMLInputElement.prototype.click=original;
      const files=new DataTransfer();
      for (const [path,payload] of [
        ['profile/characters/card.json','{"name":"Bulk fixture","description":"A new card"}'],
        ['profile/worlds/index.json','{"name":"Bulk book","entries":{}}'],
        ['profile/chats/Bulk/session.jsonl','{"user_name":"Test","character_name":"Bulk"}\n{"name":"Bulk","mes":"A note"}'],
        ['profile/chats/Bulk/bad.jsonl','invalid']]) {
        const file=new File([payload],path.split('/').at(-1));
        Object.defineProperty(file,'webkitRelativePath',{value:path});files.items.add(file);
      }
      this.files=files.files;this.dispatchEvent(new Event('change'));
    };
    document.querySelector('#scan-profile').click();
  });
  await wait(()=>!!document.querySelector('#modal-root [data-act=yes]'),'directory preview');await click('#modal-root [data-act=yes]');
  await wait(()=>TAUI.state.lib.chats.length===1 && !!document.querySelector('.folder-import-report'),'bulk import');
  assert.match(await run(()=>document.querySelector('.folder-import-report').textContent),/bad\.jsonl/);
  assert.equal(await run(()=>TAUI.state.lib.characters[0].name),'Bulk fixture');
  log('the directory picker previews counts and imports valid siblings of a broken chat');
  await adoptRestartedPair();
  await run(async()=>{await TAUI.commitLibrary(TAStore.normalize(TAStore.demoLibrary()));});
  const pages=require('node:fs').readdirSync(root).filter(name=>name.endsWith('.html'));
  for(const page of pages) {
    await load(page);
    assert.equal(await run(()=>['这一页没有画出来',TAUI.t('这一页没有画出来')].includes(document.querySelector('#stage > .paper.empty > h3')?.textContent)),false,page);
  }
  assert.deepEqual(errors,[]);
  log('all '+pages.length+' application pages render the demo in a fresh desktop process');
  await verifyFileImportCommits();
  await verifyImageBatches();
  await verifyMemoryAndBackupImports();
  await verifyConfirmedDeletion();
  await verifyIntegrityControls();
  assert.deepEqual(errors,[]);
}
app.whenReady().then(process.env.QUILVORI_TEST_PHASE==='restart' ? verifyRestart : exercise).then(()=>finish(0),error=>{console.error(error);finish(1);});
function finish(status) { for (const win of BrowserWindow.getAllWindows()) win.destroy(); server.close(); app.exit(status); }
