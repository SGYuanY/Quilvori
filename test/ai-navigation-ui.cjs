/* A real desktop window against a delayed loopback provider. Run via npm run test:ui. */
const {app,BrowserWindow,session}=require('electron');
const assert=require('node:assert/strict');
const path=require('node:path'),os=require('node:os'),http=require('node:http');
const {once}=require('node:events');
const root=path.join(__dirname,'..'),profile=process.env.QUILVORI_TEST_PROFILE;
if (!profile || path.dirname(profile)!==os.tmpdir() || !path.basename(profile).startsWith('quilvori-ui-'))throw Error('An isolated UI test profile is required.');
app.setPath('userData',profile);
let win,controller;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const server=http.createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');
  res.setHeader('Access-Control-Allow-Private-Network','true');
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  if(req.url!=='/v1/chat/completions'){res.writeHead(404);return res.end();}
  const chunks=[];for await(const part of req)chunks.push(part);
  const envelope=JSON.parse(Buffer.concat(chunks));
  controller={context:JSON.parse(envelope.messages.at(-1).content),res};
});
const evaluate=(fn,...args)=>win.webContents.executeJavaScript('('+fn.toString()+')(...'+JSON.stringify(args)+')',true);
async function waitFor(predicate,description){
  for(let i=0;i<120;i++){if(await predicate())return;await delay(35);}
  const status=await evaluate(()=>document.querySelector('#ai-status,.organize-status,[data-assist-go] ~ [role=status],#check-progress')?.textContent);
  throw Error(description+' timed out. '+status);
}
const check=(fn,label)=>waitFor(()=>evaluate(fn),label);
const click=selector=>evaluate(q=>{const element=document.querySelector(q);if(!element||element.disabled)throw Error('Disabled or missing '+q);element.click();},selector);
const fill=(selector,value)=>evaluate((q,v)=>{const input=document.querySelector(q);input.value=v;input.dispatchEvent(new Event('input',{bubbles:true}));},selector,value);
const change=(selector,value)=>evaluate((q,v)=>{const input=document.querySelector(q);input.value=v;input.dispatchEvent(new Event('change',{bubbles:true}));},selector,value);
async function navigate(route){await click('[data-nav="'+route+'"]');await waitFor(()=>evaluate(expected=>TAUI.state.route===expected && !!document.querySelector('#stage > *'),route),route);}
async function received(){await waitFor(()=>!!controller,'provider request');const req=controller;controller=null;return req;}
function reply(req,payload,code=200){
  req.res.writeHead(code,{'Content-Type':'application/json'});
  req.res.end(JSON.stringify(code===200?{choices:[{finish_reason:'stop',message:{content:JSON.stringify(payload)}}]}:{error:{message:'fixture failure'}}));
}
async function test(){
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const sandbox=session.fromPartition('persist:navigation-fixture');
  sandbox.webRequest.onBeforeRequest((d,cb)=>cb({cancel:/^https?:/.test(d.url) && new URL(d.url).hostname!=='127.0.0.1'}));
  win=new BrowserWindow({show:false,webPreferences:{session:sandbox,nodeIntegration:false,contextIsolation:true}});
  await win.loadFile(path.join(root,'characters.html'));await check(()=>!!document.querySelector('#stage > *'),'standalone start');
  await evaluate(async port=>{
    NIJANModel.save({key:'fixture',baseUrl:'http://127.0.0.1:'+port+'/v1',protocol:'chat',model:'fixture'});
    const lib=TAStore.emptyLibrary();
    const base={tags:[],alternate_greetings:[],expressionAssetIds:[],first_mes:'',mes_example:'',personality:'',scenario:''};
    lib.characters.push({...base,id:'alpha',name:'Alpha',description:'Quiet beyond the ridge.'},{...base,id:'bravo',name:'Bravo',description:'Walks past the market.'});
    lib.worldBooks.push({id:'one',name:'Fixture',entries:[{id:'ridge',comment:'The ridge',content:'Northern slope.',keys:['slope'],secondaryKeys:[],enabled:true,position:'before_char',order:100}]});
    await TAUI.commitLibrary(lib);TAUI.state.cardView='edit';TAUI.state.sel.character='alpha';TAUI.renderStage();
    window.navigationProbe=crypto.randomUUID();
  },server.address().port);
  const documentId=await evaluate(()=>window.navigationProbe);
  await navigate('studio');await click('[data-mode=create]');await fill('#ai-brief','Write the missing archivist.');
  await evaluate(()=>document.querySelectorAll('[data-module]').forEach(el=>{el.checked=el.dataset.module==='character';el.dispatchEvent(new Event('change',{bubbles:true}));}));
  await click('#ai-create');const create=await received();await navigate('home');await navigate('studio');
  assert.ok(await evaluate(()=>document.querySelector('.ai-workbench').dataset.busy==='true'));
  await navigate('lore');reply(create,{character:{name:'Archive Clerk',description:'Collects maps.'}});
  await check(()=>!NIJANStudio.running(),'off-page completion');await navigate('studio');
  assert.match(await evaluate(()=>document.querySelector('.ai-previews').textContent),/Archive Clerk/);
  await fill('#ai-creation-message','Does the atlas work?');await click('#ai-discuss');const discussion=await received();
  await navigate('quick');reply(discussion,{reply:'Keep the atlas scene.'});
  await check(()=>!NIJANStudio.running(),'discussion');await navigate('studio');
  assert.match(await evaluate(()=>document.querySelector('.ai-creation-conversation').textContent),/Keep the atlas scene/);
  await evaluate(()=>NIJANStudio.openFor({kind:'character',cardId:'alpha',fields:['description']}));
  await fill('#ai-instruction','Mention an atlas.');await click('#ai-revise');const revision=await received();
  await navigate('characters');await evaluate(()=>NIJANStudio.openFor({kind:'character',cardId:'bravo',fields:['description']}));
  reply(revision,{changes:[{target:'character',id:'alpha',fields:{description:'Quiet with an atlas.'}}]});
  await check(()=>!NIJANStudio.running(),'targeted proposal');await navigate('studio');
  await evaluate(()=>{const op=[...document.querySelectorAll('[data-plan]')].find(n=>n.textContent.includes('Quiet with an atlas.'));if(!op)throw Error('Expected original target');op.querySelector('[data-apply-one]').click();});
  await check(()=>TAUI.state.lib.characters.find(c=>c.id==='alpha').description==='Quiet with an atlas.','apply original target');
  assert.equal(await evaluate(()=>TAUI.state.lib.characters.find(c=>c.id==='bravo').description),'Walks past the market.');
  await navigate('characters');await evaluate(()=>{TAUI.state.sel.character='alpha';TAUI.renderStage();});
  await click('[data-ai=logic]');const toolbarReview=await received();await navigate('home');reply(toolbarReview,{items:[]});
  await check(()=>!TATaskActivity.pending(),'editor review completion');await navigate('characters');
  assert.ok(await evaluate(()=>document.querySelector('[data-ai-out]').textContent.trim().length>0));
  await click('[data-card-organize]');
  await click('[data-organize-generate]');const org=await received();await click('[data-organize-close]');await navigate('lore');
  reply(org,{moves:[{from:'description',to:'personality',quote:'Quiet with an atlas.',reason:'Describes a habit.'}]});
  await check(()=>!NIJANOrganizePanel.running(),'organize in background');await navigate('characters');await click('[data-card-organize]');
  assert.match(await evaluate(()=>document.querySelector('.organize-preview').textContent),/Quiet with an atlas/);await click('[data-organize-close]');
  await navigate('check');await change('#check-char','alpha');await click('#semantic-check');const review=await received();await change('#check-char','bravo');await navigate('home');
  reply(review,{items:[{severity:'error',kind:'logic',title:'Atlas claim',detail:'Only one statement was supplied.',entry:'Alpha',place:'card.description',evidence:['Quiet with an atlas.']}]});
  await check(()=>!TATaskActivity.pending() && TAUI.state.lib.settings.aiReviews?.at(-1)?.items[0]?.severity==='warn','single-passage report saved as needing confirmation');
  await navigate('check');assert.equal(await evaluate(()=>document.querySelector('#model-check .ai-review')!==null),false);
  await change('#check-char','alpha');assert.ok(await evaluate(()=>!!document.querySelector('#model-check .ai-review')));
  const grades=await evaluate(()=>{
    const report=TAUI.state.lib.settings.aiReviews.at(-1), original=TAUI.downloadJson;
    report.items[0].severity='error'; // A report saved by v0.2.0, with the same single quotation.
    let exported;
    TAUI.downloadJson=(_name,data)=>{exported=data.aiReview.items[0].severity;};
    try { document.querySelector('#export-check').click(); } finally { TAUI.downloadJson=original; }
    return [exported,document.querySelector('#model-check .review-heading .tag').textContent,TAUI.t('需要确认')];
  });
  assert.equal(grades[0],'warn');assert.equal(grades[1],grades[2]);
  await navigate('regex');await fill('[data-assist]','Use abc as a sample.');await click('[data-assist-go]');const rx=await received();
  await navigate('home');reply(rx,{regex:{scriptName:'Paused regex',findRegex:'abc',replaceString:'red'}});
  await check(()=>!TATaskActivity.pending(),'auxiliary draft');await navigate('regex');
  assert.match(await evaluate(()=>document.querySelector('[data-assist-preview]').textContent),/Paused regex/);
  assert.equal(await evaluate(()=>TAUI.state.lib.regexScripts.length),0);
  await click('[data-assist-go]');const canceled=await received();await navigate('home');await navigate('regex');await click('[data-cancel-task]');
  reply(canceled,{regex:{scriptName:'Discarded',findRegex:'.',replaceString:'bad'}});await delay(120);
  assert.ok(!await evaluate(()=>document.querySelector('[data-assist-preview]').textContent.includes('Discarded')));
  await click('[data-assist-go]');const error=await received();await navigate('home');reply(error,{},503);
  await check(()=>!TATaskActivity.pending(),'error return');await navigate('regex');assert.match(await evaluate(()=>document.querySelector('.ai-assist .model-progress').textContent),/503/);
  const routeBefore=await evaluate(()=>location.href);
  await evaluate(()=>TASearch.open({kind:'entry',parentId:'one',id:'ridge',field:'content'}));await check(()=>document.activeElement.dataset.field==='content','field jump');
  const link=await evaluate(()=>location.href);await evaluate(()=>history.back());await check(()=>TAUI.state.route==='regex','history back');
  assert.equal(await evaluate(()=>location.href),routeBefore);await evaluate(()=>history.forward());await check(()=>TAUI.state.route==='lore' && TAUI.state.sel.entry==='ridge','history forward');
  assert.equal(await evaluate(()=>window.navigationProbe),documentId);
  await win.loadURL(link);await check(()=>document.activeElement.dataset.field==='content'&&TAUI.state.sel.entry==='ridge','reopened shareable field address');
  console.log('AI creation, discussion, edits, organizing, reviews and page requests survive navigation; cancellation, errors, field links and browser history verified.');
}
app.whenReady().then(test).then(()=>finish(0),e=>{console.error(e);finish(1);});
function finish(code){if(win&&!win.isDestroyed())win.destroy();server.closeAllConnections?.();server.close();app.exit(code);}
