/* The actual panel with a synthetic desktop bridge. Its paths never reach the OS. */
const {app,BrowserWindow,session}=require('electron');
const assert=require('node:assert/strict');
const path=require('node:path');
const os=require('node:os');
const fs=require('node:fs');

const profile=process.env.QUILVORI_TEST_PROFILE;
if (!profile || path.dirname(profile)!==os.tmpdir() || !path.basename(profile).startsWith('quilvori-ui-')) throw Error('Use an isolated UI test profile.');
app.setPath('userData',profile);
const project=path.join(__dirname,'..');
async function exercise() {
  const partition=session.fromPartition('theme-st-panel-fixture');
  partition.webRequest.onBeforeRequest((request,respond)=>respond({cancel:/^https?:/.test(request.url)}));
  const win=new BrowserWindow({show:false,webPreferences:{session:partition,contextIsolation:true,nodeIntegration:false}});
  const run=(fn,...args)=>win.webContents.executeJavaScript('('+fn.toString()+')(...'+JSON.stringify(args)+')',true);
  await win.loadFile(path.join(project,'index.html'));
  for (const file of ['theme-st-phrases','theme-st-panel']) {
    await win.webContents.executeJavaScript(fs.readFileSync(path.join(project,'js',file+'.js'),'utf8'));
  }
  const readStatus=()=>run(()=>fixtureHost.querySelector('[data-theme-st=status]').textContent);
  const waitStatus=async text=>{
    for (let i=0;i<80;i++) { if ((await readStatus()).includes(text)) return; await new Promise(resolve=>setTimeout(resolve,25)); }
    throw Error('Expected '+text+' in '+await readStatus());
  };
  const click=key=>run(key=>fixtureHost.querySelector('[data-theme-st="'+key+'"]').click(),key);
  const set=(key,value,event)=>run((key,value,event)=>{
    const el=fixtureHost.querySelector('[data-theme-st="'+key+'"]');
    el.value=value; el.dispatchEvent(new Event(event,{bubbles:true}));
  },key,value,event);

  await run(()=>{
    TAI18n.save({lang:'en'});
    const fixtureHost=document.body.appendChild(document.createElement('div'));
    window.fixtureHost=fixtureHost;
    TAThemeSTPanel.draftChanged();
    TAThemeSTPanel.mount(fixtureHost);
  });
  assert.match(await run(()=>fixtureHost.textContent),/User Settings → UI Theme → Import/);
  assert.ok(!(await run(()=>!!fixtureHost.querySelector('input'))));

  await run(()=>{
    window.log={inspect:[],read:[],activate:[],install:[],pick:0,opened:[]};
    window.control={stamp:'first',theme:'Initially Active',nextWrite:'',picked:'',draft:{name:'New Draft',font_scale:1,custom_css:'.message { color: teal; }'}};
    const sheet={name:'Blue',font_scale:1,custom_css:'.message { color: blue; }'};
    const user='reader',catalog=['Initially Active','Blue'];
    const change=(list,theme)=>{
      if (control.nextWrite) { const code=control.nextWrite; control.nextWrite=''; return {ok:false,code}; }
      control.theme=theme; control.stamp+='x'; if(!list.includes(theme))list.push(theme);
      return {ok:true,user,themeName:theme,previousTheme:'Earlier',backup:'appearance-only.json',revision:control.stamp};
    };
    window.nijanDesktop={
      themePick:async()=>{log.pick++;return control.picked;},
      themeInspect:async target=>{
        log.inspect.push(target);
        if (target.path==='unreadable') return {ok:false,code:'read-failed'};
        if (!target.user) return {ok:false,code:'choose-user',users:['reader','writer']};
        return {ok:true,user:target.user,users:['reader','writer'],currentTheme:control.theme,themes:catalog,revision:control.stamp};
      },
      themeRead:async(target,name)=>{
        log.read.push({target,name});
        return {ok:true,user,theme:name==='Blue' ? sheet : {name,font_scale:1},themeRevision:'sheet-1'};
      },
      themeActivate:async(target,name,opts)=>{
        log.activate.push({target,name,opts});
        if(control.delayed) await new Promise(resolve=>{control.finish=resolve;});
        return change(catalog,name);
      },
      themeInstall:async(target,opts)=>{log.install.push({target,opts});return change(catalog,opts.theme.name+' (Quilvori)');},
    };
    window.renderFixture=()=>TAThemeSTPanel.mount(fixtureHost,{getTheme:()=>control.draft,openTheme:raw=>{
      if(control.keepDraft)return false;
      log.opened.push(raw);
    }});
    renderFixture();
  });
  assert.deepEqual(await run(()=>log.inspect),[]);
  await click('connect'); await waitStatus('Enter or choose');
  await click('pick'); await waitStatus('canceled');
  await set('path','fixture-root','input');
  await click('connect'); await waitStatus('multiple profiles');
  assert.equal(await run(()=>localStorage.getItem('quilvori.st-theme-profile.v1')),null);
  await set('user','reader','change'); await waitStatus('Connected to profile reader.');
  assert.deepEqual(await run(()=>JSON.parse(localStorage.getItem('quilvori.st-theme-profile.v1'))),{path:'fixture-root',user:'reader'});
  await set('theme','Blue','change');
  await run(()=>{control.keepDraft=true;}); await click('read'); await waitStatus('Kept the current workshop draft');
  assert.equal(await run(()=>log.opened.length),0);
  await run(()=>{control.keepDraft=false;});
  await click('read'); await waitStatus('Opened a working copy');
  assert.equal(await run(()=>log.opened[0].name),'Blue');

  await click('existing-css'); await waitStatus('CSS just read');
  await run(()=>{control.nextWrite='profile-changed';control.delayed=true;});
  await click('switch'); await click('switch');
  assert.equal(await run(()=>log.activate.length),1);
  assert.deepEqual(await run(()=>log.activate[0]),{target:{path:'fixture-root',user:'reader',revision:'first'},name:'Blue',opts:{allowCss:true,themeRevision:'sheet-1'}});
  await run(()=>{control.delayed=false;control.finish();}); await waitStatus('profile or theme changed');
  assert.equal(await run(()=>fixtureHost.querySelector('.theme-st-options').hidden),true);
  await click('connect'); await waitStatus('Connected to profile');
  await set('theme','Blue','change'); await click('switch'); await waitStatus('Refresh any open SillyTavern tab');
  assert.equal(await run(()=>log.activate.at(-1).opts.allowCss),false);

  await click('draft-css');
  await run(()=>{control.draft={...control.draft,custom_css:'body { color: purple; }'};TAThemeSTPanel.draftChanged();});
  assert.equal(await run(()=>fixtureHost.querySelector('[data-theme-st="draft-css"]').checked),false);
  await click('draft-css'); await click('install'); await waitStatus('New Draft (Quilvori)');
  assert.equal(await run(()=>log.install[0].opts.allowCss),true);
  assert.equal(await run(()=>log.install[0].opts.theme.name),'New Draft');
  assert.equal(await run(()=>fixtureHost.querySelector('[data-theme-st="draft-css"]').checked),false);
  await run(()=>{control.nextWrite='write-failed';});
  await click('install'); await waitStatus('write permissions');
  assert.equal(await run(()=>log.install.at(-1).opts.allowCss),false);
  await run(()=>{control.draft=null;TAThemeSTPanel.draftChanged();});
  assert.equal(await run(()=>fixtureHost.querySelector('[data-theme-st=install]').disabled),true);

  await set('path','unreadable','input'); await click('connect'); await waitStatus('read permissions');
  assert.equal(await run(()=>fixtureHost.querySelector('.theme-st-options').hidden),true);
  await run(()=>{control.picked='another-fixture';}); await click('pick'); await waitStatus('multiple profiles');
  await run(()=>{Storage.prototype.setItem=function(){throw Error('fixture quota');};});
  await set('user','reader','change');await waitStatus('Connected to profile');
  assert.match(await run(()=>[...fixtureHost.querySelectorAll('p.help:not([hidden])')].map(p=>p.textContent).join('\n')),/could not be remembered/);
  win.destroy();
  console.log('Local theme panel passed browser fallback, profile selection, one-use CSS consent, import, install, switch, busy, stale and storage errors.');
}
app.whenReady().then(exercise).then(()=>app.exit(0)).catch(error=>{console.error(error);app.exit(1);});
