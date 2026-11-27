// Open the actual distribution twice against a fresh, private QA profile.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import http from 'node:http';
import { mkdtemp, mkdir, open, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { unzipSync } from 'fflate';

const run = promisify(execFile);
const project = fileURLToPath(new URL('../', import.meta.url));
const metadata = JSON.parse(await readFile(path.join(project, 'package.json'), 'utf8'));
const mac = process.platform === 'darwin';
const web = process.argv.includes('--web');
const name = 'Quilvori-'+metadata.version+'-'+(web ? 'web.zip' : mac ? 'macOS-'+process.arch+'.dmg' : 'Windows-x64.exe');
const artifact = path.join(project, 'dist', name);
const digest = createHash('sha256');
for await (const chunk of createReadStream(artifact)) digest.update(chunk);
assert.equal((await readFile(artifact+'.sha256','utf8')).trim(),digest.digest('hex')+'  '+name);

const scratch = await mkdtemp(path.join(os.tmpdir(), 'quilvori-desktop-test-'));
const profile = path.join(scratch, 'library profile');
const mount = path.join(scratch, 'image');
const application = path.join(scratch, 'Quilvori.app');
const chrome = process.env.CHROME_BIN || (process.platform==='win32'
  ? path.join(process.env.ProgramFiles,'Google','Chrome','Application','chrome.exe')
  : mac ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : 'google-chrome');
const appExe = web ? chrome : mac ? path.join(application,'Contents','MacOS','Quilvori') : artifact;
const nativeMacKeychain = mac && !web && process.env.GITHUB_ACTIONS === 'true' && process.env.QUILVORI_HOSTED_RUNNER === 'github-hosted';
let webServer, webUrl;
const fixtures = {
  card:'Dawn Courier', text:'Takes a ferry to the old beacon at dawn.',
  book:'Glass Harbor', entry:'The shore lights mark the eastern channel.',
  profile:'Desktop package fixture', key:'quilvori-native-keystore-test-value',
};

async function until(check, description, timeout = 30000) {
  const end = Date.now()+timeout;
  do {
    const result = await check();
    if (result) return result;
    await sleep(120);
  } while (Date.now()<end);
  throw new Error('Timed out waiting for '+description);
}

async function debugPort() {
  const server = createServer();
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const port = server.address().port;
  await new Promise(resolve=>server.close(resolve));
  return port;
}

async function client(url) {
  const socket = new WebSocket(url), pending = new Map(), exceptions = [];
  let sequence = 0;
  socket.addEventListener('message', event => {
    const packet = JSON.parse(event.data);
    if (packet.method === 'Runtime.exceptionThrown') {
      exceptions.push(packet.params.exceptionDetails.exception?.description || packet.params.exceptionDetails.text);
    }
    const request = pending.get(packet.id);
    if (!request) return;
    pending.delete(packet.id);
    clearTimeout(request.timer);
    if (packet.error) request.reject(new Error(packet.error.message)); else request.resolve(packet.result);
  });
  socket.addEventListener('close', () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error('The application closed the debug connection'));
    }
    pending.clear();
  });
  await Promise.race([
    new Promise((resolve,reject)=>{
      socket.addEventListener('open',resolve,{once:true});
      socket.addEventListener('error',()=>reject(new Error('Could not connect to the packaged app')),{once:true});
    }),
    sleep(5000,undefined,{ref:false}).then(()=>{throw new Error('Debug connection timed out');}),
  ]);
  function send(method,params={}) {
    return new Promise((resolve,reject) => {
      const id = ++sequence;
      const timer = setTimeout(()=>{pending.delete(id);reject(new Error('No reply to '+method));},10000);
      pending.set(id,{resolve,reject,timer});
      socket.send(JSON.stringify({id,method,params}));
    });
  }
  async function evaluate(fn,...args) {
    const expression='('+fn.toString()+')(...'+JSON.stringify(args)+')';
    const response=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    return response.result?.value;
  }
  await send('Runtime.enable');
  return {socket,send,evaluate,exceptions};
}

async function exercise(mode) {
  const port=await debugPort();
  const env = {...process.env};
  delete env.ELECTRON_RUN_AS_NODE;
  const flags=['--user-data-dir='+profile,'--remote-debugging-address=127.0.0.1','--remote-debugging-port='+port,'--disable-gpu'];
  // A local Mac test must never alter the developer's keychain.
  if(web)flags.push('--headless=new','--no-first-run','--no-default-browser-check','--disable-background-networking',webUrl);
  else if(mac && !nativeMacKeychain) flags.push('--use-mock-keychain');
  const log=await open(path.join(scratch,mode+'.log'),'w');
  const child=spawn(appExe,flags,{cwd:scratch,env,stdio:['ignore',log.fd,log.fd],windowsHide:true});
  await log.close();
  let launchError;
  const ended = new Promise(resolve=>{
    child.once('exit',resolve);
    child.once('error',error=>{launchError=error;resolve(1);});
  });
  let page;
  try {
    const target=await until(async()=>{
      if(launchError)throw launchError;
      if(child.exitCode!==null)throw new Error('Packaged application exited before startup: '+child.exitCode);
      let items;
      try {items=await (await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(1500)})).json();}
      catch{return false;}
      return items.find(item=>item.type==='page' && (web ? item.url===webUrl : /^file:/.test(item.url) && /[/\\]app\.asar[/\\]index\.html$/.test(decodeURI(item.url))));
    },'the shipped main entry point',75000);
    page=await client(target.webSocketDebuggerUrl);
    const read=page.evaluate;
    await until(()=>read(()=>!!window.TAUI?.state.lib && !!document.querySelector('.collection-home')),'the collection');
    assert.equal(await read(()=>TAStore.backend),'indexedDB');
    if(web)assert.equal(await read(()=>typeof window.nijanDesktop),'undefined');
    else assert.deepEqual(await read(()=>window.nijanDesktop.getPaths()),{cards:'',worlds:''});
    const credentials=await read(async(mode,fixture,prefix)=>{
      await NIJANModel.ready;
      if(mode==='edit'){
        NIJANModel.newProfile(fixture.profile);
        NIJANModel.save({model:'package-test-model',key:fixture.key});
      }
      await NIJANModel.flushCredentials();
      const raw=JSON.parse(localStorage.getItem('nijan-model'));
      const active=raw.profiles.find(item=>item.id===raw.active);
      return {
        name:active?.name,
        sealed:active?.sealedKey?.startsWith(prefix) && !Object.hasOwn(active.config,'key'),
        plain:Object.values(localStorage).some(value=>String(value).includes(fixture.key)),
        restored:NIJANModel.load().key===fixture.key && NIJANModel.load().model==='package-test-model',
      };
    },mode,fixtures,web?'web1.':'os1.');
    assert.deepEqual(credentials,{name:fixtures.profile,sealed:true,plain:false,restored:true});
    const click=(selector)=>read(s=>{const el=document.querySelector(s);if(!el||el.disabled)throw new Error('Unavailable: '+s);el.click();},selector);
    const edit=(selector,value)=>read((s,v)=>{const el=document.querySelector(s);if(!el)throw new Error('Missing editor: '+s);el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},selector,value);
    const waitFor=(selector)=>until(()=>read(s=>!!document.querySelector(s),selector),selector);

    if(mode==='edit') {
      await click('[data-nav="characters"]');await waitFor('[data-act="new"]');
      await click('[data-act="view-edit"]');await click('[data-act="new"]');
      await edit('[data-field="name"]',fixtures.card);await edit('[data-field="description"]',fixtures.text);
      assert.equal(await read(()=>TAUI.flush()),true);
      await click('[data-nav="lore"]');await waitFor('#new-book');
      await click('#new-book');await edit('[data-book-field="name"]',fixtures.book);
      await click('#new-entry');await edit('#lore-editor [data-field="content"]',fixtures.entry);
      assert.equal(await read(()=>TAUI.flush()),true);
      await click('[data-nav="home"]');await waitFor('[data-collection-pin]');
      await read(name=>{
        const title=[...document.querySelectorAll('.collection-caption h3')].find(el=>el.textContent===name);
        title.closest('article').querySelector('[data-collection-pin]').click();
      },fixtures.book);
      assert.equal(await read(()=>TAUI.flush()),true);
    } else {
      const restored=await read(({card,book})=>({
        description:TAUI.state.lib.characters.find(item=>item.name===card)?.description,
        contents:TAUI.state.lib.worldBooks.find(item=>item.name===book)?.entries.map(item=>item.content),
      }),fixtures);
      assert.deepEqual(restored,{description:fixtures.text,contents:[fixtures.entry]});
      assert.deepEqual(await read(()=>{
        const first=document.querySelector('.collection-item');
        return [first.querySelector('h3').textContent,first.querySelector('[data-collection-pin]').getAttribute('aria-pressed')];
      }),[fixtures.book,'true']);
      const damaged='{"profiles":';
      await read(async raw=>{
        localStorage.setItem('nijan-model',raw);
        window.dispatchEvent(new StorageEvent('storage',{key:'nijan-model'}));
        await NIJANModel.ready;
      },damaged);
      await click('[data-shell="settings"]');
      await click('#model-key-rebuild');
      await click('#model-key-rebuild-confirm');
      await until(()=>read(()=>document.querySelector('#set-key')?.disabled===false && !NIJANModel.credentialStatus().locked),'the rebuilt connection');
      const replacementKey=fixtures.key+'-recovered';
      await edit('#model-id','recovered-package-model');
      await edit('#set-key',replacementKey);
      await click('#set-close');
      await until(()=>read(()=>!document.querySelector('#modal-root').classList.contains('show')),'saved connection settings');
      const rebuilt=await read(async(raw,key,prefix)=>{
        await NIJANModel.flushCredentials();
        const settings=NIJANModel.load();
        const stored=await TAModelKeyCodec.registryState(()=>({index:0,raw:localStorage.getItem('nijan-model')}));
        const registry=JSON.parse(stored.raw),active=registry.profiles.find(row=>row.id===registry.active);
        return stored.index>0 && active?.sealedKey?.startsWith(prefix) && !stored.raw.includes(key)
          && localStorage.getItem('nijan-model')===raw && settings.key===key && settings.model==='recovered-package-model'
          && !Object.values(localStorage).some(value=>value.includes(key));
      },damaged,replacementKey,web?'web1.':'os1.');
      assert.ok(rebuilt,'rebuilding preserves the damaged source and saves a usable protected connection');
    }
    assert.deepEqual(page.exceptions,[]);
    await page.send('Browser.close').catch(()=>{});
    const code=await Promise.race([ended,sleep(18000,undefined,{ref:false}).then(()=>{throw new Error('Packaged app did not exit');})]);
    assert.equal(code,0,'Desktop exit code');
  } catch(error) {
    const diagnostics=await readFile(path.join(scratch,mode+'.log'),'utf8').catch(()=> '');
    if(diagnostics)console.error(diagnostics.slice(-3000));
    throw error;
  } finally {
    if(page)page.socket.close();
    if(child.pid && child.exitCode===null && child.signalCode===null) {
      if(process.platform==='win32')await run('taskkill',['/PID',String(child.pid),'/T','/F']).catch(()=>{});
      else child.kill('SIGKILL');
      await Promise.race([ended.catch(()=>{}),sleep(3000)]);
    }
  }
}

let attached=false;
let oldKeychains, oldDefault, keychainCreated=false;
const qaKeychain=path.join(scratch,'package-test.keychain-db');
async function security(...args) {
  try {return await run('/usr/bin/security',args,{timeout:15000});}
  catch {throw new Error('The temporary test Keychain operation failed: '+args[0]);}
}
function keychainPaths(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line.trim()));
}
try {
  if(web) {
    // Serve only the exact files from the finished ZIP, so missing dependencies fail this test.
    const contents=unzipSync(new Uint8Array(await readFile(artifact)));
    const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
    const prefix=name.slice(0,-4)+'/';
    webServer=http.createServer((req,res)=>{
      const pathname=new URL(req.url,'http://127.0.0.1').pathname.slice(1) || 'index.html';
      const bytes=contents[prefix+pathname];
      if(!bytes){res.writeHead(404).end();return;}
      res.writeHead(200,{'Content-Type':types[path.extname(pathname)] || 'application/octet-stream'}).end(bytes);
    });
    await new Promise((resolve,reject)=>{webServer.once('error',reject);webServer.listen(0,'127.0.0.1',resolve);});
    webUrl='http://127.0.0.1:'+webServer.address().port+'/';
  } else if(mac) {
    await mkdir(mount);
    await run('hdiutil',['attach','-readonly','-nobrowse','-mountpoint',mount,artifact]);
    attached=true;
    await run('ditto',[path.join(mount,'Quilvori.app'),application]);
    await run('codesign',['--verify','--deep','--strict',application]);
    await run('hdiutil',['detach',mount]);
    attached=false;
  }
  if(nativeMacKeychain) {
    oldDefault=keychainPaths((await security('default-keychain','-d','user')).stdout)[0];
    oldKeychains=keychainPaths((await security('list-keychains','-d','user')).stdout);
    const password=randomBytes(32).toString('hex');
    await security('create-keychain','-p',password,qaKeychain);
    keychainCreated=true;
    await security('set-keychain-settings','-lut','900',qaKeychain);
    await security('unlock-keychain','-p',password,qaKeychain);
    await security('list-keychains','-d','user','-s',qaKeychain);
    await security('default-keychain','-d','user','-s',qaKeychain);
  }
  await exercise('edit');
  await exercise('reopen');
  console.log('Passed '+(web?'web ZIP':'desktop package')+' startup, character and world editing, encrypted model credentials, clean quit, persisted restart and connection recovery on '+process.platform+'/'+process.arch+'.');
  if(nativeMacKeychain)console.log('Used a dedicated, unlocked system Keychain on the hosted macOS runner.');
} finally {
  if(webServer?.listening){webServer.closeAllConnections();await new Promise(resolve=>webServer.close(resolve));}
  if(oldKeychains){
    try {
      if(keychainCreated)await security('delete-keychain',qaKeychain);
    } finally {
      await security('list-keychains','-d','user','-s',...oldKeychains);
      await security('default-keychain','-d','user','-s',oldDefault);
    }
  }
  if(attached)await run('hdiutil',['detach',mount]);
  if(path.dirname(scratch)!==os.tmpdir() || !path.basename(scratch).startsWith('quilvori-desktop-test-'))throw new Error('Unexpected smoke test directory');
  await rm(scratch,{recursive:true,force:true,maxRetries:8,retryDelay:250});
}
