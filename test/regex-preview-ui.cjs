/* Test the production file-page Worker and encrypted browser registry with an isolated Electron profile. */
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const profile=process.env.QUILVORI_TEST_PROFILE;
if(!profile || path.dirname(profile)!==os.tmpdir() || !path.basename(profile).startsWith('quilvori-ui-'))throw Error('Isolated UI profile required');
app.setPath('userData',profile);
const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
async function exercise(){
  const w=new BrowserWindow({show:false,webPreferences:{partition:'persist:regex-v020',backgroundThrottling:false}});
  const file=path.join(__dirname,'..','regex.html');
  const run=(fn,...args)=>w.webContents.executeJavaScript('('+fn.toString()+')(...'+JSON.stringify(args)+')',true);
  async function wait(fn,label){
    for(let i=0;i<120;i++){if(await run(fn))return;await sleep(40);}
    throw Error('Timed out waiting for '+label);
  }
  await w.loadFile(file);await wait(()=>!!document.querySelector('#run-rx'),'regex page');
  await run(()=>{localStorage.setItem('nijan-model',JSON.stringify({key:'fixture-legacy-regex-ui',model:'Local test'}));});
  await w.loadFile(file);await wait(()=>!!document.querySelector('#run-rx'),'reopened page');
  const registry=await run(async()=>{
    await NIJANModel.ready;await NIJANModel.flushCredentials();
    return [NIJANModel.load().key,localStorage.getItem('nijan-model')];
  });
  assert.equal(registry[0],'fixture-legacy-regex-ui');
  assert.ok(!registry[1].includes('fixture-legacy-regex-ui'));assert.match(registry[1],/web1\./);
  const fill=(sel,val)=>run((selector,value)=>{
    const el=document.querySelector(selector);el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));
  },sel,val);
  const click=sel=>run(selector=>document.querySelector(selector).click(),sel);
  await wait(()=>!document.querySelector('[data-keep-regex]')?.disabled,'offline example verification');
  assert.deepEqual(await run(()=>[document.querySelector('[data-regex-example=original]').value,
    document.querySelector('[data-template-preview]').textContent,document.querySelector('[data-regex-ai-examples]').checked,
    document.querySelector('.regex-guide').nextElementSibling.classList.contains('ai-assist')]),
    ['Narrator: The lights went out.','The lights went out.',false,true]);
  const count=await run(()=>TAUI.state.lib.regexScripts.length);
  w.setContentSize(390,640);
  assert.ok(await run(()=>{
    const el=document.querySelector('.regex-guide'),rect=el.getBoundingClientRect();
    return rect.left>=0 && rect.right<=innerWidth+1 && el.scrollWidth<=el.clientWidth+1;
  }),'narrow regex guide fits its viewport');
  w.setContentSize(1280,900);
  await fill('[data-regex-example=expected]','Wrong expectation');
  await wait(()=>document.querySelector('#rx-template-status').textContent.includes('differs'),'mismatched expected result');
  assert.ok(await run(()=>document.querySelector('[data-keep-regex]').disabled));
  await click('[data-regex-reset]');await fill('[data-regex-example=unchanged]','Narrator: Keep this one.');
  await wait(()=>document.querySelector('#rx-template-status').textContent.includes('should stay unchanged'),'counterexample changed');
  await fill('[data-regex-find]','never appears');
  await wait(()=>document.querySelector('#rx-template-status').textContent.includes('No match'),'literal failed to match');
  await fill('[data-regex-find]','');
  assert.match(await run(()=>document.querySelector('#rx-template-status').textContent),/text to match/i);
  await click('[data-regex-reset]');
  await wait(()=>!document.querySelector('[data-keep-regex]').disabled,'verified reset example');
  assert.equal(await run(()=>TAUI.state.lib.regexScripts.length),count,'examples and failed trials never save a script');
  await run(()=>{TAUI.state.query='hidden-by-filter';});
  await click('[data-keep-regex]');
  await wait(()=>document.activeElement?.dataset.field==='findRegex','exact saved script');
  const saved=await run(()=>({id:TAUI.state.sel.regex,name:document.querySelector('[data-field=scriptName]').value,count:TAUI.state.lib.regexScripts.length}));
  assert.equal(saved.count,count+1);assert.match(saved.name,/Narrator:/);
  const dest=path.join(profile,'verified-regex.json');
  const downloaded=new Promise((resolve,reject)=>w.webContents.session.once('will-download',(_,item)=>{
    item.setSavePath(dest);item.once('done',(_e,status)=>status==='completed'?resolve():reject(Error(status)));
  }));
  await click('#export-current-rx');await downloaded;
  const exported=JSON.parse(await fs.readFile(dest,'utf8'));
  assert.deepEqual([Array.isArray(exported),exported.scriptName,exported.id,exported.placement],[false,saved.name,saved.id,[2]]);
  await run(source=>{
    TAUI.pickFile=async()=>new File([source],'imported.json',{type:'application/json'});
  },JSON.stringify({...exported,scriptName:'Imported single script'}));
  await click('#import-rx');
  await wait(()=>document.querySelector('[data-field=scriptName]')?.value==='Imported single script','native single-object import');
  assert.notEqual(await run(()=>TAUI.state.sel.regex),saved.id);
  await run(()=>{
    NIJANModel.configured=()=>true;
    NIJANModel.runTask=async(_task,context)=>{
      window.regexRequest=context;
      return {regex:{scriptName:'Example-driven AI rule',findRegex:window.regexPattern || '/absent/g',replaceString:''}};
    };
  });
  await click('[data-assist-go]');
  await wait(()=>document.querySelector('.ai-assist .model-progress')?.textContent.includes('No match'),'AI sample mismatch rejected');
  assert.ok(await run(()=>document.querySelector('[data-assist-preview]').hidden));
  await run(()=>{window.regexPattern='^Narrator: ';});
  await click('[data-assist-go]');
  await wait(()=>!document.querySelector('[data-assist-preview]').hidden,'AI matches the supplied examples');
  assert.equal(await run(()=>window.regexRequest.regexExamples.expected),'The lights went out.');
  await click('[data-assist-apply]');
  await wait(()=>document.querySelector('[data-field=scriptName]')?.value==='Example-driven AI rule','exact AI result after acceptance');
  assert.equal(await run(()=>document.activeElement?.dataset.field),'findRegex');
  await click('[data-regex-ai-examples]');
  await fill('[data-regex-example=original]','Personal sample');
  await fill('[data-assist]','An independent writing rule');await click('[data-assist-go]');
  await wait(()=>window.regexRequest?.brief==='An independent writing rule','AI request without samples');
  assert.ok(await run(()=>!Object.hasOwn(window.regexRequest,'regexExamples')),'explicitly unchecked examples stay local after editing');
  for(const [expression,original,replacement,expected] of [
    ['^Notes: ','Notes: the quay','','the quay'],[' ','a b c','·','a·b c'],
    ['bell','bell bell','ring','ring bell'],['/bell/g','bell bell','ring','ring ring'],
  ]){
    await fill('[data-field=findRegex]',expression);await fill('[data-field=replaceString]',replacement);await fill('#lab',original);await click('#run-rx');
    await wait(()=>document.querySelector('#stop-rx').hidden,'bare and wrapped Worker trials');
    const report=await run(()=>document.querySelector('#lab-out').textContent);
    assert.ok(report.endsWith('\n'+expected),'Worker output for '+JSON.stringify(expression)+': '+report);
  }
  await fill('[data-field=findRegex]','/paper/g');await fill('[data-field=replaceString]','leaf');await fill('#lab','paper paper');
  await click('#run-rx');
  await wait(()=>document.querySelector('#lab-out')?.textContent.includes('leaf leaf'),'real file-page Worker output');
  await run(()=>{
    const Native=window.Worker, idle=URL.createObjectURL(new Blob(['self.onmessage = () => {};'],{type:'text/javascript'}));
    window.Worker=class extends Native{constructor(){super(idle);}terminate(){window.stoppedWorkers++;super.terminate();}};
    window.stoppedWorkers=0;window.restoreWorker=()=>{window.Worker=Native;URL.revokeObjectURL(idle);};
  });
  await click('#run-rx');
  assert.equal(await run(()=>!document.querySelector('#stop-rx').hidden),true);
  await click('#stop-rx');await wait(()=>document.querySelector('#lab-out').textContent.includes('canceled'),'cancel');
  await click('#run-rx');await wait(()=>document.querySelector('#lab-out').textContent.includes('timed out'),'deadline');
  assert.deepEqual(await run(()=>[window.stoppedWorkers,document.querySelector('#lab').value]),[2,'paper paper']);
  await run(()=>window.restoreWorker());await click('#run-rx');
  await wait(()=>document.querySelector('#lab-out').textContent.includes('leaf leaf'),'fresh Worker after timeout');
  await w.loadFile(file);await wait(()=>!!document.querySelector('#run-rx'),'reload');
  assert.equal(await run(async()=>{await NIJANModel.ready;return NIJANModel.load().key;}),'fixture-legacy-regex-ui');
  console.log('Offline before/after examples, explained save states, native single-script export/import, AI sample checks and exact destinations passed. Worker cancel, timeout, rerun and encrypted key migration/reload passed.');
  w.destroy();
}
app.whenReady().then(exercise).then(()=>app.exit(0),error=>{console.error(error);app.exit(1);});
