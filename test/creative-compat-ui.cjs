/* Open the real workbench with a synthetic library and a local, counted provider. */
const {app,BrowserWindow,session}=require('electron');
const assert=require('node:assert/strict');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const {once}=require('node:events');

const profile=process.env.QUILVORI_TEST_PROFILE;
if(!profile || path.dirname(profile)!==os.tmpdir() || !path.basename(profile).startsWith('quilvori-ui-'))throw Error('Start this check through npm run test:ui to use an isolated profile.');
app.setPath('userData',profile);
const requestInputs=[];
let queued=[],win;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const server=http.createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Private-Network','true');
  if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
  if(req.url!=='/v1/chat/completions'){res.writeHead(404);return res.end();}
  const chunks=[];for await(const part of req)chunks.push(part);
  const payload=JSON.parse(Buffer.concat(chunks).toString());
  requestInputs.push(JSON.parse(payload.messages.at(-1).content));
  const fixture=queued.shift();
  if(fixture===undefined){res.writeHead(400);return res.end(JSON.stringify({error:{message:'Unexpected extra fixture request'}}));}
  const answer=await fixture;
  res.setHeader('Content-Type','application/json');
  res.end(JSON.stringify({choices:[{finish_reason:'stop',message:{content:typeof answer==='string'?answer:JSON.stringify(answer)}}]}));
});
async function run(fn,...args){
  const result=await win.webContents.executeJavaScript('(async()=>{try{return {value:await ('+fn.toString()+')(...'+JSON.stringify(args)+')}}catch(e){return {issue:e.stack || e.message}}})()',true);
  if(result.issue)throw Error(result.issue);
  return result.value;
}
async function wait(predicate,label){
  for(let n=0;n<120;n++){if(await predicate())return;await sleep(45);}
  const status=await run(()=>document.querySelector('#creation-feedback')?.textContent||document.querySelector('#ai-status')?.textContent);
  throw Error(label+' timed out: '+status);
}
async function click(selector){
  await run(sel=>{const button=document.querySelector(sel);if(!button||button.disabled)throw Error('Unavailable control '+sel);button.click();},selector);
}
async function type(selector,value){
  await run((sel,text)=>{const input=document.querySelector(sel);if(!input)throw Error('Missing '+sel);input.value=text;input.dispatchEvent(new Event('input',{bubbles:true}));},selector,value);
}
async function modules(kinds){
  await run(values=>{
    const nodes=document.querySelectorAll('[data-module]');
    for(const input of nodes)if(input.checked!==values.includes(input.dataset.module))input.click();
  },kinds);
}
async function fresh(brief,kinds){
  await click('[data-mode=create]');await click('#ai-create-new');await type('#ai-brief',brief);await modules(kinds);
}
async function send(selector,responses){
  const before=requestInputs.length;
  queued=responses.slice();await click(selector);
  await wait(()=>requestInputs.length>before,'fixture request via '+selector);
  await wait(()=>run(()=>!NIJANStudio.running()),'finished '+selector);
  return requestInputs.slice(before);
}
const drafts=()=>run(()=>TAStudioDrafts.pending().map(r=>{
  const op=r.plan.operations.find(o=>o.kind==='add');
  return {id:op.value.id,plan:r.plan.id,name:op.value.name,kind:r.plan.task,body:op.value.description};
}));
const card=(name,description='Operates the signal lantern.')=>({character:{name,description}});
const world=(name)=>({world:{name,entries:[{comment:'Signal wick',content:'Two long flashes call the ferry.',keys:['wick']}] }});
const listPair=(a,b)=>[card(a),world(b)];
async function openWindow(){
  const qa=session.fromPartition('persist:creative-compat');
  qa.webRequest.onBeforeRequest((details,done)=>{
    const network=/^https?:/i.test(details.url);
    if(network && process.env.QUILVORI_TEST_PHASE==='compatibility-restart'){
      requestInputs.push({unexpectedNetwork:true});done({cancel:true});return;
    }
    done({cancel:network && new URL(details.url).hostname!=='127.0.0.1'});
  });
  win=new BrowserWindow({show:false,width:1360,height:940,webPreferences:{session:qa,nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
  await win.loadFile(path.join(__dirname,'..','studio.html'));await wait(()=>run(()=>!!document.querySelector('[data-mode=create]')),'initial studio');
}
async function generationCases(){
  await fresh('Write the operator and her book.',['character','world']);
  assert.equal((await send('#ai-create',[listPair('Signal Operator','Signal Manual')])).length,1);
  const joint=await drafts(),initial=joint.find(d=>d.name==='Signal Operator');
  assert.ok(initial);assert.ok(joint.some(d=>d.name==='Signal Manual'));
  const instruction='Give the signal operator a brass key.';
  const plain='The brass key can be a keepsake from the original crossing.';
  await type('#ai-creation-message',instruction);
  assert.equal((await send('#ai-discuss',[plain])).length,1);
  assert.ok(await run(reply=>document.querySelector('.ai-creation-conversation').textContent.includes(reply),plain));
  assert.equal(await run(()=>document.querySelector('#ai-creation-message').value),'');
  await modules(['character']);
  const revised=await send('#ai-create-adjust',[card('Signal Operator','Keeps a brass key in her pocket.')]);
  assert.equal(revised.length,1);
  assert.ok(JSON.stringify(revised[0]).includes(instruction));
  const updated=(await drafts()).filter(d=>d.name==='Signal Operator');assert.equal(updated.length,1);assert.equal(updated[0].id,initial.id);
  assert.match(updated[0].body,/brass key/);
  console.log('ok one combined response produces two drafts and conversational revision reuses the original identity');

  await fresh('Just the card.',['character']);
  const unselectedResponse=listPair('Attached Keeper','Unrequested ledger');
  assert.equal((await send('#ai-create',[unselectedResponse])).length,1);
  const limited=await drafts();
  assert.ok(limited.some(d=>d.name==='Attached Keeper'));assert.ok(!limited.some(d=>d.name==='Unrequested ledger'));

  await fresh('A card and reference book with one malformed output.',['character','world']);
  const partial=await send('#ai-create',[[card('Surviving Keeper'),{world:{name:'Broken ledger',entries:[{comment:'An entry without content'}]}}]]);
  assert.equal(partial.length,1);
  assert.ok((await drafts()).some(d=>d.name==='Surviving Keeper'));assert.ok(!(await drafts()).some(d=>d.name==='Broken ledger'));
  const status=await run(()=>document.querySelector('#creation-feedback').textContent);
  assert.match(status,/world|book|世界书|条目|entry|entries/i);
  await run(()=>{const plan=[...document.querySelectorAll('[data-plan]')].find(p=>p.textContent.includes('Surviving Keeper'));
    if(!plan)throw Error('missing valid partial draft');plan.querySelector('[data-apply]').click();});
  await wait(()=>run(()=>TAUI.state.lib.characters.some(c=>c.name==='Surviving Keeper')),'adoption despite sibling error');
  await fresh('A two-part request with a malformed first result.',['character','world']);
  const next=await send('#ai-create',['The response is unfinished.',{world:{name:'Surviving Atlas',entries:[{comment:'Beacon',content:'A red beacon.'}]}}]);
  assert.equal(next.length,2,'a malformed card cannot skip a separately requested book');
  assert.ok((await drafts()).some(d=>d.name==='Surviving Atlas'));
  console.log('ok unselected works stay out of drafts and a malformed response cannot block a separately requested valid work or cause a paid retry');
}
async function questionCase(){
  await fresh('A lampmaker and a missing signal.',['character']);
  let release;const delayed=new Promise(resolve=>{release=resolve;});
  const before=requestInputs.length;
  queued=[delayed];await click('#ai-questions');await wait(()=>requestInputs.length>before,'question request');
  await click('[data-nav=home]');release(card('Wrongly returned lampmaker'));
  await wait(()=>run(()=>!NIJANStudio.running()),'question completion outside the studio');await click('[data-nav=studio]');
  await wait(()=>run(()=>!!document.querySelector('[data-answer]')),'local questions');
  const source=await run(()=>[...document.querySelectorAll('label.field')].find(e=>e.querySelector('[data-answer]'))?.parentElement.textContent || document.querySelector('#creation-feedback').textContent);
  assert.match(source,/local|本机|本地|离线/i);
  assert.ok(!(await drafts()).some(d=>d.name==='Wrongly returned lampmaker'));
  await type('[data-answer]','The keeper fears tall staircases.');
  const generated=await send('#ai-create',[card('Answered keeper')]);
  assert.equal(generated.length,1);assert.ok(generated[0].answers.some(a=>a.answer==='The keeper fears tall staircases.'));
  console.log('ok a wrong-shaped question response leaves labelled local questions answerable across page changes');
}
async function chooseRecovery(panel,kind){
  return run((scope,key)=>{
    const button=scope==='record'?document.querySelector('[data-recover-record]'):document.querySelector('[data-recover-pasted]');
    if(!button)return false;
    // Task output and pasted input may both have a module selector. Keep the action bound to its own source.
    const boxes=[...document.querySelectorAll('[data-recover-kind]')].filter(el=>scope==='record'?!el.closest('[data-paste-entry]'):!!el.closest('[data-paste-entry]'));
    const box=boxes.find(el=>el.dataset.recoverKind===key);
    if(!box||box.disabled)return false;
    if(!box.checked)box.click();
    return !button.disabled;
  },panel,kind);
}
async function recoveryCases(){
  const count=requestInputs.length;
  if(!win)await openWindow();await click('[data-mode=create]');
  await run(()=>{document.querySelector('.ai-task-log').open=true;});
  const chosen=await run(async()=>{
    const select=document.querySelector('#ai-task-select');
    if(!select)return false;
    for(const option of select.options){
      select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));
      if(document.querySelector('[data-task-output]')?.textContent.includes('Unrequested ledger'))return true;
    }
    return false;
  });
  assert.ok(chosen,'restored history must contain the original combined response');
  assert.ok(await chooseRecovery('record','world'));
  await click('[data-recover-record]');
  await wait(async()=> (await drafts()).some(d=>d.name==='Unrequested ledger'),'recover only the missing module');
  assert.equal((await drafts()).filter(d=>d.name==='Attached Keeper').length,1);
  assert.equal(requestInputs.length,count);
  await run(()=>{const el=document.querySelector('[data-paste-entry]');if(!el)throw Error('Missing paste control');el.open=true;});
  await type('[data-recover-paste]',JSON.stringify(listPair('Pasted Courier','Pasted Tide Table')));
  assert.ok(await chooseRecovery('paste','character'));assert.ok(await chooseRecovery('paste','world'));
  await click('[data-recover-pasted]');await wait(async()=>{
    const saved=await drafts();return ['Pasted Courier','Pasted Tide Table'].every(n=>saved.some(d=>d.name===n));
  },'recover pasted output');
  await type('[data-recover-paste]',JSON.stringify(card('Second pasted draft')));
  assert.ok(await chooseRecovery('paste','character'));
  await click('[data-recover-pasted]');
  await wait(async()=> (await drafts()).some(d=>d.name==='Second pasted draft'),'reuse paste control for a different original');
  assert.equal(requestInputs.length,count);
  console.log('ok record and repeated pasted outputs can be recovered as selected local drafts without a provider request');
  await run(async()=>{
    const stale={id:'old-window',task:'create:character',output:'old window text',startedAt:new Date().toISOString(),epoch:TACreationRecords.epoch()};
    await TAUI.commitLibrary(TAStore.emptyLibrary(),[],true);
    await TACreationRecords.save(stale);
    const db=TALibraryDB.database(),tx=db.transaction(['creationRecords','drafts']);
    const count=store=>new Promise((resolve,reject)=>{const req=tx.objectStore(store).count();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
    const sizes=await Promise.all([count('creationRecords'),count('drafts')]);
    if(sizes.some(size=>size!==0))throw Error('Clear or stale writer repopulated private works');
  });
  console.log('ok clearing the library removes archived work and pending drafts');
}
async function main(){
  if(process.env.QUILVORI_TEST_PHASE==='compatibility-restart'){await recoveryCases();return;}
  server.listen(0,'127.0.0.1');await once(server,'listening');await openWindow();
  await run(async port=>{await TAUI.commitLibrary(TAStore.emptyLibrary());
    NIJANModel.save({baseUrl:'http://127.0.0.1:'+port+'/v1',model:'loopback-only',key:'dummy',protocol:'chat'});},server.address().port);
  await generationCases();await questionCase();
}
app.whenReady().then(main).then(()=>finish(0),e=>{console.error(e);finish(1);});
function finish(status){if(win&&!win.isDestroyed())win.destroy();server.closeAllConnections?.();if(server.listening)server.close();app.exit(status);}
