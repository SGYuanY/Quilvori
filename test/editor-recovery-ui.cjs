'use strict';
const assert=require('node:assert/strict');
const suite=require('./desktop-fixture.cjs');

suite('editor-recovery',async({open,run,input,click,wait,win})=>{
  await open('index');
  await run(async()=>{
    TAI18n.save({lang:'en'});
    const lib=TAStore.emptyLibrary();
    lib.characters=[{id:0,name:'Amber pilot',description:'Original'},{id:'twin',name:'Amber pilot',description:'Untouched'}];
    lib.worldBooks=[{id:7,name:'Blue ledger',entries:[{id:1,comment:'Quay',content:'First'}]},
      {id:'other',name:'Other ledger',entries:[{id:2,comment:'Harbor',content:'Second'}]}];
    lib.quickReplySets=[{id:'reply',name:'Replies',replies:[{id:'q',label:'Salute',message:'Old reply'}]}];
    lib.regexScripts=[{id:'rx',scriptName:'Replace',findRegex:'lantern',replaceString:'Old replacement',placement:[2]}];
    lib.themes=[{id:'a',name:'Base',vars:{}},{id:'b',name:'Alternate',vars:{}}];lib.activeThemeId='a';
    await TAUI.commitLibrary(TAStore.verify(lib),[],true);TAUI.go('home');
  });
  const page=(kind,id)=>wait((k,i)=>{const work=document.querySelector('[data-work-page]');return work?.dataset.workPage===k&&work.dataset.workId===String(i);},'work '+id,kind,id);
  const shelf=()=>wait(()=>!!document.querySelector('[data-collection-search]'),'shelf');
  // A dismissing Undo stays in the DOM during its animation. It must be a one-shot action.
  assert.deepEqual(await run(()=>{
    let calls=0;
    const notice=TAUI.toast('Undo test',{action:{label:'Undo',onClick:()=>{calls++;}}});
    const control=notice.element.querySelector('.toast-action');
    control.focus();control.click();control.click();
    document.querySelector('[data-collection-search]').focus();control.focus();
    return [calls,notice.element.inert,document.activeElement===control];
  }),[1,true,false]);
  await click('[data-collection-kind=character]');await input('[data-collection-search]','Amber');
  await click('[data-collection-type=character][data-collection-open="0"]');await page('character',0);
  await click('[data-work-back]');await shelf();await click('[data-collection-kind=book]');
  await input('[data-collection-search]','Blue');await click('[data-collection-type=book][data-collection-open="7"]');await page('book',7);
  await run(()=>history.back());await shelf();await run(()=>history.back());await page('character',0);
  await click('[data-work-back]');await shelf();
  const shelfInfo=()=>run(()=>[TAUI.state.collectionView.kind,document.querySelector('[data-collection-search]').value,document.activeElement.dataset.collectionOpen]);
  assert.deepEqual(await shelfInfo(),['character','Amber','0']);
  await win.webContents.reload();await shelf();assert.deepEqual(await shelfInfo(),['character','Amber','0']);

  for(const [route,selector] of [['quick','#qr-list [data-k=message]'],['regex','#rx-body [data-field=replaceString]']]){
    await run(()=>NIJANStudio.openFor({kind:'character',cardId:0,fields:['description']}));
    await input('#ai-original','New source for '+route);await click('#ai-save-manual');
    await wait(v=>TAUI.state.lib.characters[0].description===v&&!!document.querySelector('[data-toast-id=ai-apply] .toast-actions button'),'committed edit','New source for '+route);
    await click('[data-nav='+route+']');await click('[data-toast-id=ai-apply] .toast-actions button');
    await wait(()=>TAUI.state.lib.characters[0].description==='Original'&&TAUI.state.save==='saved','undone from another module');
    const text='Edited after undo '+route;
    await input(selector,text);await wait(()=>TAUI.state.save==='saved','automatic save');
    assert.equal(await run(r=>r==='quick'?TAUI.state.lib.quickReplySets[0].replies[0].message:TAUI.state.lib.regexScripts[0].replaceString,route),text);
    await win.webContents.reload();await wait(s=>!!document.querySelector(s),'editor reopened',selector);
    assert.equal(await run(s=>document.querySelector(s).value,selector),text);
  }

  for(const [kind,id,remove,field] of [['character',0,'[data-act=del]','#char-form'],['book',7,'#del-book','#lore-editor']]){
    await run((kind,id)=>TAUI.openAddress(TAWorkPage.href(kind,id)),kind,id);await click('[data-work-edit]');
    await click(remove);await click('#modal-root [data-act=yes]');
    const missing=()=>wait(()=>!!document.querySelector('#stage .empty [data-empty]')&&TAUI.state.missingAttachment,'removed work');
    await missing();assert.equal(await run(f=>!!document.querySelector(f),field),false);
    await win.webContents.reload();await missing();
    assert.equal(await run(f=>!!document.querySelector(f),field),false);
    await click('#stage [data-empty]');
    assert.ok(await run(f=>!!document.querySelector(f),field));
  }
  assert.deepEqual(await run(()=>[TAUI.state.lib.characters[0].description,TAUI.state.lib.worldBooks[0].entries[0].content]),['Untouched','Second']);
  await run(()=>TAUI.openAddress('lore.html?entry=removed&field=content#other'));
  await wait(()=>!!document.querySelector('#stage [data-empty]')&&TAUI.state.missingAttachment,'removed child entry');

  await run(()=>{window.writtenRecords=[];const put=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(...args){if(this.name==='libraryRecords')writtenRecords.push(args[0].key);return put.apply(this,args);};
  });
  await click('[data-shell=settings]');await click('[data-settings-tab=appearance]');
  await run(()=>{const pick=document.querySelector('[data-theme-choice]');pick.value='b';pick.dispatchEvent(new Event('change',{bubbles:true}));});
  await wait(()=>TAUI.state.lib.activeThemeId==='b'&&!document.querySelector('[data-theme-choice]').disabled,'scoped theme selection');
  assert.deepEqual(await run(()=>writtenRecords.slice().sort()),['["activeThemeId"]','["meta"]']);
  console.log('Confirmed historical shelf state, missing editor targets, cross-page undo durability and a scoped theme switch.');
});
