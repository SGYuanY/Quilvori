// Run a real SillyTavern checkout on loopback with disposable code, settings and data.
import assert from 'node:assert/strict';
import {execFile,spawn} from 'node:child_process';
import {cp,mkdir,open,readFile,realpath,writeFile} from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {promisify} from 'node:util';
const run=promisify(execFile);

export async function startTestTavern(checkout,scratch) {
  const source=await realpath(checkout),server=path.join(scratch,'test-tavern'),data=path.join(scratch,'tavern-users');
  const archive=path.join(scratch,'server-source.tar');
  await mkdir(server);await mkdir(data);
  // Export only the installed revision's shipped server and default client, never its
  // working copy, user profiles, config, credentials, plugins or third-party extensions.
  const includes=['server.js','package.json','src','public','default','webpack.config.js','plugins.js',
    ':(exclude)public/scripts/extensions/third-party/**'];
  await run('git',['-C',source,'archive','--format=tar','-o',archive,'HEAD','--',...includes],{windowsHide:true});
  await run('tar',['-xf',archive,'-C',server],{windowsHide:true});
  await cp(path.join(source,'node_modules'),path.join(server,'node_modules'),{
    recursive:true,dereference:true,filter:entry=>path.basename(entry)!=='.cache',
  });
  const probe=net.createServer();
  await new Promise((ok,no)=>{probe.once('error',no);probe.listen(0,'127.0.0.1',ok);});
  const port=probe.address().port;
  await new Promise(ok=>probe.close(ok));
  const origin='http://127.0.0.1:'+port;
  const log=await open(path.join(scratch,'test-tavern.log'),'w');
  const child=spawn(process.execPath,[path.join(server,'server.js'),'--configPath',path.join(scratch,'tavern.yaml'),
    '--dataRoot',data,'--port',String(port),'--listen=false','--browserLaunchEnabled=false'],{
    cwd:server,stdio:['ignore',log.fd,log.fd],windowsHide:true,
  });
  await log.close();
  const exit=new Promise((ok,no)=>{child.once('error',no);child.once('exit',ok);});
  const close=async()=>{
    if(child.exitCode==null && child.signalCode==null)child.kill();
    await Promise.race([exit,delay(5000,undefined,{ref:false})]);
    if(child.exitCode==null && child.signalCode==null)child.kill('SIGKILL');
  };
  try{
    let token,cookie;
    for(let tries=0;tries<200 && !token;tries++){
      if(child.exitCode!=null)throw Error('Isolated SillyTavern exited during startup ('+child.exitCode+')');
      const response=await fetch(origin+'/csrf-token',{signal:AbortSignal.timeout(1500)}).catch(()=>null);
      if(response?.ok){
        token=(await response.json()).token;
        cookie=response.headers.getSetCookie().map(value=>value.split(';',1)[0]).join('; ');
      }else await delay(250);
    }
    assert.ok(token,'isolated SillyTavern CSRF session');
    const post=async(route,body)=>{
      const response=await fetch(origin+'/api/'+route,{method:'POST',
        headers:{'Content-Type':'application/json','X-CSRF-Token':token,Cookie:cookie},
        body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
      assert.equal(response.status,200,'isolated SillyTavern '+route);
      return response.json();
    };
    const user=path.join(data,'default-user');
    return {close,origin,worlds:path.join(user,'worlds'),cards:path.join(user,'characters'),chats:path.join(user,'chats'),
      write:(name,document)=>post('worldinfo/edit',{name,data:document}),read:name=>post('worldinfo/get',{name}),
      readCard:avatar=>post('characters/get',{avatar_url:avatar}),
      listChats:avatar=>post('characters/chats',{avatar_url:avatar,simple:true}),
      writeChat:(avatar,name,chat)=>post('chats/save',{avatar_url:avatar,file_name:name,chat}),
      readChat:(avatar,name)=>post('chats/get',{avatar_url:avatar,file_name:name})};
  }catch(error){await close();throw error;}
}

// Opening a fresh browser matters: the live World Info editor caches loaded books.
export async function verifyTavernEditor(server,document,{chrome,scratch,debugPort,client,until},card) {
  const settings=path.join(path.dirname(server.worlds),'settings.json');
  const prefs=JSON.parse(await readFile(settings,'utf8'));
  prefs.firstRun=false;await writeFile(settings,JSON.stringify(prefs));
  const port=await debugPort(),log=await open(path.join(scratch,'st-editor.log'),'w');
  const browser=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking',
    '--user-data-dir='+path.join(scratch,'st-editor-profile'),'--remote-debugging-port='+port,server.origin+'/'],{
    cwd:scratch,stdio:['ignore',log.fd,log.fd],windowsHide:true,
  });
  await log.close();
  let launchError,tab;
  const ended=new Promise(ok=>{browser.once('exit',ok);browser.once('error',error=>{launchError=error;ok();});});
  try {
    const target=await until(async()=>{
      if(launchError)throw launchError;
      const response=await fetch('http://127.0.0.1:'+port+'/json/list',{signal:AbortSignal.timeout(1500)}).catch(()=>null);
      return response?.ok && (await response.json()).find(item=>item.type==='page' && new URL(item.url).origin===server.origin);
    },'the isolated SillyTavern editor');
    tab=await client(target.webSocketDebuggerUrl);
    await until(()=>tab.evaluate(name=>{
      const select=window.document.querySelector('#world_editor_select');
      return !!select && !!window.jQuery?._data(select,'events')?.change?.length && [...select.options].some(o=>o.text===name);
    },document.name),'the initialized World Info selector',55000);
    await tab.evaluate(name=>{
      window.document.querySelector('#WIDrawerIcon').click();
      const sel=window.document.querySelector('#world_editor_select');
      sel.value=[...sel.options].find(o=>o.text===name).value;sel.dispatchEvent(new Event('change',{bubbles:true}));
    },document.name);
    const entry=document.entries[0],selector='#world_popup_entries_list .world_entry[uid="0"]';
    await until(()=>tab.evaluate(s=>!!window.document.querySelector(s+' textarea[name="comment"]'),selector),'the open World Info row');
    await tab.evaluate(s=>window.document.querySelector(s+' .inline-drawer-icon').click(),selector);
    const result=await until(()=>tab.evaluate(s=>{
      const row=window.document.querySelector(s),body=row?.querySelector('textarea[name="content"]');
      if(!body)return null;
      const keys=row.querySelector('textarea[name="key"]')?.value || [...(row.querySelector('select[name="key"]')?.selectedOptions || [])].map(o=>o.textContent).join(', ');
      return {comment:row.querySelector('textarea[name="comment"]').value,content:body.value,keys};
    },selector),'the text and keywords in the World Info editor');
    assert.deepEqual(result,{comment:entry.comment,content:entry.content,keys:entry.key.join(', ')});
    console.log('Reopened the expected text and keywords in the real SillyTavern World Info editor.');
    if(card){
      const index=await until(()=>tab.evaluate(filename=>{
        const ctx=window.SillyTavern?.getContext?.();
        const index=ctx?.characters?.findIndex(ch=>ch?.avatar===filename);
        return typeof ctx?.selectCharacterById==='function' && index>=0 ? {index} : null;
      },card.filename),'the original character slot in the SillyTavern character manager',55000);
      await tab.evaluate(id=>window.SillyTavern.getContext().selectCharacterById(id.index),index);
      const visible=await until(()=>tab.evaluate(filename=>{
        const ctx=window.SillyTavern.getContext(),active=ctx.characters[ctx.characterId];
        const description=window.document.querySelector('#description_textarea')?.value;
        if(active?.avatar!==filename || !description || !ctx.chat?.length)return null;
        return {name:window.document.querySelector('#character_name_pole').value,description,
          scenario:window.document.querySelector('#scenario_pole').value,chat:ctx.chat.map(message=>message.mes)};
      },card.filename),'selected character fields and the existing conversation');
      assert.deepEqual(visible,{name:card.name,description:card.description,scenario:card.scenario,chat:card.messages});
      if(card.append){
        // The standard /send command stores a user message without requesting a model response.
        await tab.evaluate(async message=>{
          const ctx=window.SillyTavern.getContext();
          const result=await ctx.executeSlashCommandsWithOptions('/send '+message);
          if(result?.isError)throw Error('The test conversation could not be continued.');
          await ctx.reloadCurrentChat();
        },card.append);
        const expected=[...card.messages,card.append];
        const shown=await until(()=>tab.evaluate(length=>{
          const ctx=window.SillyTavern.getContext();
          return ctx.chat.length===length && ctx.chat.map(row=>row.mes);
        },expected.length),'continued conversation after reopening it in the SillyTavern editor');
        assert.deepEqual(shown,expected);
        assert.deepEqual((await server.readChat(card.filename,card.chat)).slice(1).map(row=>row.mes),expected);
        console.log('Continued the existing SillyTavern conversation and reopened the saved user message.');
      }
      console.log('Opened the original character slot, expected fields and existing conversation in the real SillyTavern editor.');
    }
  }finally{
    if(tab){await tab.send('Browser.close').catch(()=>{});tab.socket.close();}
    else if(browser.exitCode==null)browser.kill();
    await Promise.race([ended,delay(5000,undefined,{ref:false})]);
    if(browser.exitCode==null && browser.signalCode==null)browser.kill('SIGKILL');
  }
}
