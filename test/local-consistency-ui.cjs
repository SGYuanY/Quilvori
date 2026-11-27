'use strict';
const assert=require('node:assert/strict');
const suite=require('./desktop-fixture.cjs');

suite('local-consistency',async({open,run,wait,click,key,win,download})=>{
  await open('index');
  await run(async()=>{
    TAI18n.save({lang:'zh'});
    const lib=TAStore.emptyLibrary(),base={description:'蓝瞳。',personality:'细心。',scenario:'港口。',tags:['海港']};
    lib.characters=[{...base,id:0,name:'Harbor <A&B> · {book} 夜班记录员',first_mes:'灰瞳的我喝了一杯酒。'},
      {...base,id:'clean',name:'巡岸员',first_mes:'今晚小潮。'}];
    lib.worldBooks=[{id:0,name:'值班世界书 {count} · '+('沿海观测'.repeat(5)),entries:[
      {id:'rule',comment:'码头纪律',content:'不许喝酒。',constant:true,enabled:true},
      {id:'off',comment:'旧规',content:'不许喝酒。',constant:true,enabled:false},
      {id:'conditional',comment:'临时指令',content:'禁止出海。',constant:false,enabled:true},
    ]}];
    lib.settings.aiReviews=[{id:'prior',cardId:0,bookId:0,createdAt:'2026-01-01T00:00:00Z',
      items:Array.from({length:12},(_,i)=>({kind:'logic',severity:'warn',title:'旧报告 '+i,detail:'核实这句。',place:'card.description',evidence:['蓝瞳。']}))}];
    await TAUI.commitLibrary(TAStore.verify(lib),[],true);
    TAUI.state.sel.checkChar=0;TAUI.state.sel.checkBook=0;
    window.calls=0;const engine=TAFormats.checkConsistency;
    TAFormats.checkConsistency=(...args)=>{window.calls++;if(window.failRule)throw Error('Synthetic rule failure');return engine(...args);};
    NIJANModel.runTask=()=>{throw Error('A local check contacted the model');};
    TAUI.go('check');
  });
  const report=()=>run(()=>({count:document.querySelectorAll('#findings article.finding').length,
    status:document.querySelector('#check-local-status')?.textContent,scope:document.querySelector('#check-local-scope')?.textContent,
    card:TAUI.state.lastFindings?.character,book:TAUI.state.lastFindings?.book}));
  const change=(id,v)=>run((id,v)=>{const el=document.getElementById(id);el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));},id,v);
  assert.equal(await run(()=>window.calls),1,'opening computes the local report once');
  assert.equal((await report()).count,2);
  assert.equal(await run(()=>document.querySelector('#model-check').childElementCount),0,'opening local results defers the long saved AI report');
  await click('#check-ai-tab');assert.ok(await run(()=>document.querySelector('#model-check .ai-review')?.getClientRects().length));
  const before=await run(()=>window.calls);
  await click('#run-check');
  await wait(()=>document.activeElement?.id==='check-local-status','the finished local report');
  assert.equal(await run(()=>window.calls),before+1);
  const first=await report();
  assert.equal(first.count,2);assert.match(first.status,/冲突 1/);assert.match(first.status,/存疑 1/);
  assert.ok(first.scope.includes(first.card) && first.scope.includes(first.book));
  assert.match(first.scope,/常驻条目 1 条/);
  assert.ok(await run(()=>{
    const rect=document.querySelector('#check-local-status').getBoundingClientRect();
    return document.querySelector('#check-ai-panel').hidden && rect.top>=0 && rect.bottom<=innerHeight;
  }),'local results appear in the viewport with a long saved AI report');
  const initial=JSON.parse((await download('#export-check')).bytes);
  assert.equal(initial.localFindings.length,2);assert.equal(initial.aiReview.items.length,12);
  await change('check-book','');assert.equal((await report()).count,1);
  await change('check-char','clean');await click('#run-check');
  await wait(()=>document.activeElement?.id==='check-local-status','the zero-result report');
  const clean=await report();assert.equal(clean.count,0);assert.match(clean.status,/未发现/);assert.equal(clean.book,null);assert.equal(clean.card,'巡岸员');
  const empty=JSON.parse((await download('#export-check')).bytes);
  assert.deepEqual(empty.localFindings,[]);assert.equal(empty.aiReview,null);
  await change('check-char','0');await change('check-book','0');
  await run(()=>{window.failRule=true;});await click('#run-check');
  await wait(()=>document.querySelector('#findings [role=alert]')?.textContent.includes('Synthetic rule failure'),'visible rule error');
  assert.ok(await run(()=>!TAUI.state.lastFindings && document.querySelector('#export-check').disabled));
  await run(()=>{window.failRule=false;});await click('#run-check');
  await wait(()=>document.querySelectorAll('#findings .finding').length===2,'retry recovers the current report');
  await run(()=>{TAUI.state.lib.settings.aiReviews[0].items={legacy:true};TAUI.renderStage();});
  assert.equal((await report()).count,2);
  await click('#check-ai-tab');assert.ok(await run(()=>!!document.querySelector('#model-check [role=alert]')));
  const partial=JSON.parse((await download('#export-check')).bytes);
  assert.equal(partial.localFindings.length,2);assert.equal(partial.aiReview,null);

  await run(()=>{
    NIJANModel.configured=()=>true;
    NIJANModel.runTask=()=>new Promise(resolve=>{window.finishReview=resolve;});
  });
  await click('#semantic-check');await click('#check-local-tab');
  const localCalls=await run(()=>window.calls);
  await run(()=>window.finishReview({items:[]}));
  await wait(()=>!TATaskActivity.pending(),'background review is saved');
  assert.ok(await run(()=>document.querySelector('#check-ai-panel').hidden));
  assert.equal(await run(()=>window.calls),localCalls,'a background AI completion leaves the local check alone');
  await click('#check-ai-tab');assert.ok(await run(()=>!!document.querySelector('#model-check .ai-review')));

  for(const [width,lang] of [[1366,'zh'],[1136,'en'],[900,'ja'],[820,'ko'],[430,'th'],[390,'ru']]){
    win.setContentSize(width,780);
    const bounds=await run(async(lang,width)=>{
      TAI18n.save({lang,scale:width>1100?1:1.2});TAUI.renderStage();
      await document.fonts.ready;await new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(ok)));
      const bar=document.querySelector('.consistency-toolbar'),fields=[...bar.querySelectorAll('label')];
      const [card,book]=fields.map(f=>f.querySelector('select').getBoundingClientRect());
      const within=fields.every(f=>f.querySelector('span').getBoundingClientRect().bottom<=f.querySelector('select').getBoundingClientRect().top+1);
      const controlArea=bar.getBoundingClientRect(),buttons=[...bar.querySelectorAll('.consistency-actions button:not([hidden])')].map(b=>b.getBoundingClientRect());
      const actions=buttons.every((btn,index)=>{
        const prev=buttons[index-1];
        const clearOfFields=btn.top>=book.bottom || (btn.left>=book.right && Math.abs(btn.bottom-book.bottom)<=1);
        const clearOfPrevious=!prev || btn.top>=prev.bottom || (btn.left>=prev.right && Math.abs(btn.bottom-prev.bottom)<=1);
        return clearOfFields && clearOfPrevious && btn.left>=controlArea.left && btn.right<=controlArea.right+1;
      });
      return {within,aligned:Math.abs(card.top-book.top)<=1 || (book.top>card.bottom && Math.abs(card.left-book.left)<=1),
        actions,
        overflow:bar.scrollWidth>bar.clientWidth+1 || document.documentElement.scrollWidth>innerWidth+1,
        authored:document.querySelector('#check-char').selectedOptions[0].textContent};
    },lang,width);
    assert.deepEqual(bounds,{within:true,aligned:true,actions:true,overflow:false,authored:first.card},width+'px '+lang);
  }
  await run(()=>document.querySelector('#check-ai-tab').focus());key('Home');
  await wait(()=>document.activeElement?.id==='check-local-tab' && !document.querySelector('#findings').hidden,'keyboard switches to local results');
  await run(async()=>{await TAUI.commitLibrary(TAStore.emptyLibrary(),[],true);TAUI.renderStage();});
  assert.ok(await run(()=>document.querySelector('#run-check').disabled && document.querySelector('#export-check').disabled &&
    !!document.querySelector('[data-check-import]') && !TAUI.state.lastFindings));
  console.log('Local report visibility, current scope, zero findings, error/retry, standalone export, malformed AI archives and six responsive toolbar layouts passed.');
});
