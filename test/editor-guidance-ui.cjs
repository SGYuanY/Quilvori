'use strict';
const assert = require('node:assert/strict');
const suite = require('./desktop-fixture.cjs');

suite('editor-guidance', async ({open,run,click,wait,input,win,download}) => {
  await open('index');
  await run(async () => {
    const library=TAStore.emptyLibrary();
    library.characters=[{id:0,name:'Harbor keeper',description:'Old manuscript',embeddedBookId:'chart'}];
    library.worldBooks=[{id:'chart',name:'Harbor chart',entries:Array.from({length:32},(_,i)=>({
      id:'entry-'+i,comment:i===4?'目标':'Harbor '+i+' · '+('沿海测绘观测与交接记录'.repeat(3)),content:'Sounding '+i,
    }))}];
    await TAUI.commitLibrary(TAStore.verify(library));
    TAUI.state.sel.book='chart';TAUI.state.sel.character=0;TAUI.go('studio');
    const select=document.querySelector('#ai-book-pick');
    select.value='chart';select.dispatchEvent(new Event('change',{bubbles:true}));
  });
  const samples=[[1366,900,'zh',1],[900,660,'en',1.2],[390,844,'ru',1.2]];
  for(const [width,height,lang,scale] of samples){
    win.setContentSize(width,height);
    await run(async(lang,scale)=>{
      TAI18n.save({lang,scale});TAI18n.apply();TAUI.renderStage();
      await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    },lang,scale);
    const bounds=await run(()=>{
      const list=document.querySelector('.ai-target-list'),rows=[...list.querySelectorAll('.ai-target-row')];
      let wrapped=false;
      const clipped=rows.filter(row=>{
        const title=row.querySelector('label span'),text=title.getBoundingClientRect(),box=row.getBoundingClientRect();
        const inspect=row.querySelector('.ai-inspect').getBoundingClientRect();
        wrapped ||= text.height>1.5*parseFloat(getComputedStyle(title).lineHeight);
        return text.bottom>box.bottom+1 || text.right>inspect.left+1 || inspect.right>box.right+1 || inspect.bottom>box.bottom+1;
      }).length;
      return {wrapped,clipped,count:rows.length,scrollable:list.scrollHeight>list.clientHeight,sideways:list.scrollWidth>list.clientWidth+1};
    });
    assert.deepEqual(bounds,{wrapped:true,clipped:0,count:32,scrollable:true,sideways:false},'target list at '+width+'px: '+JSON.stringify(bounds));
  }
  const focus=await run(()=>{
    const button=document.querySelector('[data-focus="entry-23"]'),list=button.closest('.ai-target-list');
    button.scrollIntoView({block:'center'});button.focus({preventScroll:true});
    const top=list.scrollTop;button.click();
    return {top,after:document.querySelector('.ai-target-list').scrollTop,id:document.activeElement.dataset.focus};
  });
  assert.ok(focus.top>0 && Math.abs(focus.after-focus.top)<=1,'inspecting a scrolled row preserves the list position');
  assert.equal(focus.id,'entry-23');
  await input('#ai-target-search','Sounding 23');
  assert.equal(await run(()=>document.querySelectorAll('.ai-target-row:not([hidden])').length),1);
  await click('[data-focus="entry-23"]');
  assert.equal(await run(()=>document.querySelector('#ai-original').value),'Sounding 23');

  win.setContentSize(1280,900);
  await run(()=>{TAI18n.save({lang:'en',scale:1});TAI18n.apply();TAUI.go('characters');});
  await click('[data-act="view-edit"]');
  await input('[data-field="description"]','Edited in the local workshop.');
  await wait(()=>TAUI.state.save==='saved','local autosave');
  assert.match(await run(()=>document.querySelector('#save-pill').textContent),/saved locally/i);
  const cardGuide=await run(()=>document.querySelector('.toolbar .work-export-guide').textContent);
  assert.match(cardGuide,/Replace \/ Update.+Replace with File/i);
  assert.match(cardGuide,/Character Management/i);
  const saveFailure=await run(async()=>{
    const save=TAStore.save;
    TAStore.save=async()=>{throw Error('Synthetic save failure');};
    try{
      TAUI.markDirty('characters',0);
      const saved=await TAUI.flush();
      return {saved,error:document.querySelector('#save-pill').classList.contains('err')};
    }finally{TAStore.save=save;await TAUI.flush();}
  });
  assert.deepEqual(saveFailure,{saved:false,error:true});
  const card=JSON.parse((await download('[data-act="json"]')).bytes);
  assert.equal(card.data.description,'Edited in the local workshop.');
  assert.equal(card.data.character_book.name,'Harbor chart');
  assert.match(await run(()=>document.querySelector('#export-slip').textContent),/Character Management/i);
  await run(()=>TAUI.go('lore'));
  assert.match(await run(()=>document.querySelector('.work-export-guide').textContent),/World Info/i);
  const book=JSON.parse((await download('#export-book')).bytes);
  assert.equal(book.name,'Harbor chart');
  assert.match(await run(()=>document.querySelector('#export-slip').textContent),/World Info/i);
  await open('characters');
  assert.equal(await run(()=>TAUI.state.lib.characters.find(card=>card.id===0).description),'Edited in the local workshop.');
  const volatile=await run(()=>{
    TAUI.state.persistent=false;TAUI.renderStage();
    const pill=document.querySelector('#save-pill');return [pill.textContent,pill.classList.contains('dirty')];
  });
  assert.deepEqual(volatile,['In this window only',true]);
  console.log('Long targets fit each scrollable row; local edits reopen and exported cards and books identify their SillyTavern destination.');
});
