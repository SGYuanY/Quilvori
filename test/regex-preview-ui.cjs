/* Test the production file-page Worker and encrypted browser registry with an isolated Electron profile. */
const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
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
  console.log('File-page regex Worker output, cancel, timeout, rerun and encrypted web-key migration/reload passed.');
  w.destroy();
}
app.whenReady().then(exercise).then(()=>app.exit(0),error=>{console.error(error);app.exit(1);});
