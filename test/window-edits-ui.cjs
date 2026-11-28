'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {BrowserWindow}=require('electron');
const suite=require('./desktop-fixture.cjs');

suite('window-edits',async({win,run,open,wait})=>{
  await open('index');
  await run(async()=>{
    TAI18n.save({lang:'en'});const lib=TAStore.emptyLibrary();
    lib.themes=[{id:'base',name:'Base',vars:{}}];lib.activeThemeId='base';
    lib.characters=[{id:'a',name:'First',description:'A old'},{id:0,name:'Second',description:'B old'}];
    await TAUI.commitLibrary(TAStore.verify(lib),[],true);
  });
  const other=new BrowserWindow({show:false,webPreferences:{session:win.webContents.session,backgroundThrottling:false,contextIsolation:true,nodeIntegration:false}});
  const b=(fn,...args)=>other.webContents.executeJavaScript('('+fn.toString()+')(...'+JSON.stringify(args)+')',true);
  async function ready(){
    for(let i=0;i<150;i++){if(await b(()=>!!window.TAUI?.state.lib&&!!document.querySelector('#stage > *')))return;await new Promise(ok=>setTimeout(ok,35));}
    throw Error('Second editor did not open');
  }
  const navigate=id=>TAUI.openAddress('characters.html#'+id);
  const type=async value=>{
    const el=document.querySelector('#char-form [data-field=description]');el.focus();el.value=value;
    el.setSelectionRange(2,4);
    el.dispatchEvent(new Event('input',{bubbles:true}));return await TAUI.flush();
  };
  const summaries=()=>TAUI.state.lib.characters.map(c=>c.description);
  const reloadA=async()=>{await win.webContents.reload();await wait(()=>!!window.TAUI?.state.lib && !!document.querySelector('#stage > *'),'reload first tab');};
  const reloadB=async()=>{await other.webContents.reload();await ready();};
  async function review(keepLocal){
    await b(()=>document.querySelector('#review-window-edits').click());
    for(let i=0;i<130;i++){
      if(await b(()=>!!document.querySelector('#modal-root [data-window-field=description]')))break;
      await new Promise(ok=>setTimeout(ok,35));
    }
    const compared=await b(keep=>{
      const opt=document.querySelector('#modal-root [data-window-field=description]');
      if(!opt)throw Error('Missing field comparison');
      opt.closest('details').open=true;if(keep)opt.click();
      return [opt.checked,!!document.querySelector('#modal-root [data-act=apply]')];
    },keepLocal);
    assert.deepEqual(compared,[keepLocal,true]);
    await b(()=>document.querySelector('#modal-root [data-act=apply]').click());
    for(let i=0;i<130;i++){if(await b(()=>TAUI.state.save==='saved'))return;await new Promise(ok=>setTimeout(ok,35));}
    throw Error('Review did not commit');
  }
  try{
    await other.loadFile(path.join(__dirname,'..','index.html'));await ready();
    await run(navigate,'a');await b(navigate,0);
    assert.equal(await run(type,'First tab on A'),true);
    assert.equal(await b(type,'Second tab on B'),true);
    assert.deepEqual(await b(summaries),['First tab on A','Second tab on B']);
    assert.deepEqual(await b(()=>[document.activeElement.dataset.field,document.activeElement.selectionStart,document.activeElement.selectionEnd]),['description',2,4]);
    await reloadA();assert.deepEqual(await run(summaries),['First tab on A','Second tab on B']);
    await run(navigate,0);await b(navigate,0);
    assert.equal(await run(type,'A changed B'),true);
    assert.equal(await b(type,'B retained draft'),false);
    assert.equal(await b(()=>document.querySelector('#char-form [data-field=description]').value),'B retained draft');
    await b(()=>document.querySelector('#review-window-edits').click());
    for(let i=0;i<130;i++){if(await b(()=>!!document.querySelector('#modal-root [data-act=cancel]')))break;await new Promise(ok=>setTimeout(ok,35));}
    await b(()=>document.querySelector('#modal-root [data-act=cancel]').click());
    assert.equal(await b(()=>TAUI.state.save),'error');
    await b(()=>document.querySelector('#review-window-edits').click());
    for(let i=0;i<130;i++){if(await b(()=>!!document.querySelector('[data-window-field=description]')))break;await new Promise(ok=>setTimeout(ok,35));}
    assert.equal(await run(type,'Saved while the comparison was open'),true);
    await b(()=>{
      const check=document.querySelector('[data-window-field=description]');check.closest('details').open=true;check.click();
      document.querySelector('#modal-root [data-act=apply]').click();
    });
    for(let i=0;i<130;i++){if(await b(()=>!document.getElementById('app').inert && !document.querySelector('#modal-root.show')))break;await new Promise(ok=>setTimeout(ok,35));}
    assert.equal(await b(()=>TAUI.state.save),'error');
    await reloadA();assert.equal((await run(summaries))[1],'Saved while the comparison was open');
    await review(true);assert.equal((await b(summaries))[1],'B retained draft');
    await reloadA();assert.equal((await run(summaries))[1],'B retained draft');
    await run(navigate,0);await b(navigate,0);
    assert.equal(await run(type,'Latest saved B'),true);
    assert.equal(await b(type,'Unchosen local B'),false);
    await review(false);assert.equal((await b(summaries))[1],'Latest saved B');
    await reloadB();assert.equal((await b(summaries))[1],'Latest saved B');
    // A reference added by the other tab can make an otherwise independent
    // local entry deletion unsafe. Review must keep that referenced entry.
    await reloadA();
    await run(async()=>{
      const lib=structuredClone(TAUI.state.lib);
      lib.worldBooks=[{id:'quay',name:'Quay',entries:[{id:0,comment:'Pier',content:'Keep this entry',stUid:0}]}];
      lib.quickReplySets=[{id:'replies',name:'Harbor greetings',replies:[]}];await TAUI.commitLibrary(TAStore.verify(lib));
    });
    await reloadB();
    await b(()=>TAUI.openAddress('lore.html?entry=0&field=content#quay'));
    await run(async()=>{
      TAUI.state.lib.quickReplySets[0].workSource={bookId:'quay',entryIds:['0']};
      TAUI.markDirty('quickReplySets','replies');if(!await TAUI.flush())throw Error('Reply source did not save');
    });
    await b(()=>document.querySelector('#del-entry').click());
    assert.equal(await b(()=>TAUI.flush()),false);
    await b(()=>document.querySelector('#review-window-edits').click());
    for(let i=0;i<130;i++){if(await b(()=>!!document.querySelector('[data-window-field=entries]')))break;await new Promise(ok=>setTimeout(ok,35));}
    assert.ok(await b(()=>document.querySelector('[data-window-field=entries]').disabled));
    await b(()=>document.querySelector('#modal-root [data-act=apply]').click());
    for(let i=0;i<130;i++){if(await b(()=>TAUI.state.save==='saved'))break;await new Promise(ok=>setTimeout(ok,35));}
    assert.deepEqual(await b(()=>[TAUI.state.lib.worldBooks[0].entries[0].id,TAUI.state.lib.quickReplySets[0].workSource.entryIds]),[0,['0']]);
    await reloadA();
    // Replacing a library that happens to reuse an ID must invalidate the entire baseline.
    await run(async()=>{const lib=structuredClone(TAUI.state.lib);lib.characters[1].name='Different edition';
      await TAUI.commitLibrary(lib,[],true);});
    await b(navigate,0);assert.equal(await b(type,'Keep this window for rescue'),false);
    await b(()=>document.querySelector('#review-window-edits').click());
    for(let i=0;i<130;i++){if(await b(()=>TAUI.state.route==='backup'))break;await new Promise(ok=>setTimeout(ok,35));}
    assert.equal(await b(()=>TAUI.state.route),'backup');
    await reloadA();assert.equal((await run(summaries))[1],'Latest saved B');
    console.log('Two tabs retain independent edits, review overlapping fields, cancel or choose either version, and protect structural replacements.');
  }finally{other.destroy();}
});
