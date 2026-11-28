'use strict';
const assert=require('node:assert/strict');
const suite=require('./desktop-fixture.cjs');
suite('work-page',async({open,run,click,input,wait,win})=>{
  await open('index');
  await run(async()=>{
    TAI18n.save({lang:'en'});
    const lib=TAStore.emptyLibrary(),book={id:0,name:'Harbor register',entries:[{id:0,comment:'The quay',content:'A quiet station.'}]};
    lib.worldBooks=[book,{id:'alternate',name:book.name,entries:[]}];
    const art=TAStore.demoLibrary().assets.find(row=>row.kind==='avatar');
    lib.assets=[{...art,id:0,name:'Signal',kind:'expression'}];
    lib.characters=[{id:0,name:'Harbor pilot',description:'Keeps a lantern at the old station.',creator:'Workshop fixture',
      avatarAssetId:'0',embeddedBookId:'0',expressionAssetIds:['0'],stickerPackId:'0'},
      {id:'twin#%',name:'Harbor pilot',source:{embeddedBookId:0}},
      ...Array.from({length:30},(_,i)=>({id:'pilot-'+i,name:'Harbor companion '+i}))];
    const pixel=document.createElement('canvas').toDataURL('image/png');
    lib.stickerPacks=[{id:0,name:'Beacon signals',stickers:Array.from({length:25},(_,i)=>({name:'Signal '+(i+1)+'.png',dataUrl:pixel}))}];
    lib.quickReplySets=[{id:0,name:'Greet the pilot',workSource:{characterId:'0'},replies:[]},
      {id:'other',name:'Other pilot reply',workSource:{characterId:'twin#%',bookId:0},replies:[]}];
    await TAUI.commitLibrary(TAStore.verify(lib),[],true);TAUI.go('home');
    const proposal={world:{name:'Tide tables',entries:[{comment:'Tides',content:'The lamp marks low tide.'}]}};
    const plan=NIJANAI.proposal(TAUI.state.lib,'create:world',proposal,{brief:'The tide tables.'});
    Object.assign(plan,{id:'draft-0',batchId:'synthetic-batch',result:proposal,creationInput:{cardId:0}});
    await TAStudioDrafts.keep(plan);
  });
  const work=()=>wait(()=>document.querySelector('[data-work-page]')?.dataset.workId==='0','correct work page');
  const back=async()=>{await run(()=>history.back());await work();};
  const first='[data-collection-type=character][data-collection-open="0"]';
  await click('[data-collection-kind=character]');await input('[data-collection-search]','Harbor');
  const position=await run(()=>{const el=document.querySelector('#stage');el.scrollTop=225;return el.scrollTop;});
  assert.ok(position>0);
  assert.equal(await run(s=>document.querySelector(s).getAttribute('aria-label').endsWith('Library ID 0'),first),true);
  await click(first);await work();
  assert.equal(await run(()=>document.querySelector('[data-work-page] h2').textContent),'Harbor pilot');
  assert.equal(await run(()=>document.querySelector('.work-page-byline').textContent),'Library ID 0');
  assert.match(await run(()=>document.querySelector('[data-work-book]').textContent),/Library ID 0$/);
  assert.deepEqual(await run(()=>['workExpression','workPack','workReply','workBook'].map(k=>[...document.querySelectorAll('[data-work-page] a')].filter(a=>a.dataset[k]!=null).map(a=>a.dataset[k]))),[['0'],['0'],['0'],['0']]);
  assert.deepEqual(await run(()=>[...document.querySelectorAll('[data-work-draft]')].map(b=>b.dataset.workDraft)),['draft-0']);
  await wait(()=>document.querySelector('[data-work-file]')?.textContent.includes('No linked file'),'file status');
  assert.ok(!await run(()=>!!document.querySelector('.studio-draft-shelf')),'work page only shows its related drafts');
  await click('[data-work-draft="draft-0"]');await wait(()=>TAUI.state.route==='studio' && !!document.querySelector('[data-plan="draft-0"]'),'specific saved draft');
  await click('a[href="sections.html?part=style"]');
  assert.ok(await run(()=>document.activeElement.matches('[data-sec=style]')));
  await run(()=>history.back());await wait(()=>TAUI.state.route==='studio' && !!document.querySelector('[data-plan="draft-0"]'),'back to the same draft');
  await back();

  await click('[data-work-expression="0"]');
  assert.equal(await run(()=>TAUI.state.sel.asset),0);assert.equal(await run(()=>document.querySelector('#asset-side [data-field=name]').value),'Signal');await back();
  await click('[data-work-reply="0"]');assert.equal(await run(()=>TAUI.state.sel.qr),0);await back();
  assert.equal(await run(()=>document.querySelector('.work-pack-preview ul')),null);
  await click('.work-pack-preview summary');await wait(()=>document.querySelectorAll('.work-pack-preview li').length===24,'first page of pack images');
  await click('.work-pack-preview [data-next]');
  assert.deepEqual(await run(()=>[...document.querySelectorAll('.work-pack-preview li')].map(el=>el.textContent)),['Signal 25.png']);
  assert.ok(await run(()=>document.querySelector('.work-pack-preview img').hasAttribute('src')));
  await click('[data-work-pack]');assert.equal(await run(()=>TAUI.state.sel.character),0);
  assert.ok(await run(()=>document.querySelector('#pack-select').closest('details').open));
  assert.equal(await run(()=>document.querySelector('#pack-select').value),'0');
  assert.deepEqual(await run(()=>['pack','expression','qr'].map(key=>[...document.querySelectorAll('#st-bundle [data-'+key+']:checked')].map(el=>el.value))),[['0'],['0'],['0']]);
  await back();
  await click('[data-work-book="0"]');assert.equal(await run(()=>document.querySelector('[data-work-page]').dataset.workPage),'book');
  assert.deepEqual(await run(()=>[...document.querySelectorAll('[data-work-reader]')].map(el=>el.dataset.workReader)),['0','twin#%']);
  assert.deepEqual(await run(()=>[...document.querySelectorAll('[data-work-reader]')].map(el=>el.textContent)),['Harbor pilot · Library ID 0','Harbor pilot · Library ID twin#%']);
  await click('[data-work-edit]');assert.equal(await run(()=>TAUI.state.sel.book),0);
  assert.deepEqual(await run(()=>[...document.querySelectorAll('.work-editor-links [data-work-reader]')].map(el=>el.dataset.workReader)),['0','twin#%']);
  await click('[data-work-reader="twin#%"]');await wait(()=>document.querySelector('[data-work-page]')?.dataset.workId==='twin#%','same-name character');
  await win.webContents.reload();await wait(()=>document.querySelector('[data-work-page]')?.dataset.workId==='twin#%','reloaded work address');
  assert.deepEqual(await run(()=>[...document.querySelectorAll('[data-work-reply]')].map(el=>el.dataset.workReply)),['other']);
  await run(()=>TAUI.openAddress(TAWorkPage.href('character',0)));await work();
  await click('[data-work-attach]');assert.equal(await run(()=>document.querySelector('#attach-book').value),'0');
  assert.deepEqual(await run(()=>[...document.querySelector('#attach-book').options].slice(1).map(el=>el.text)),['Harbor register · Library ID 0','Harbor register · Library ID alternate']);
  await run(()=>{const select=document.querySelector('#attach-book');select.value='alternate';select.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.ok(await run(()=>document.querySelector('.work-editor-links a:last-child').href.endsWith('#alternate')));
  await back();assert.equal(await run(()=>document.querySelector('[data-work-book]').dataset.workBook),'alternate');
  await run(async()=>{
    await TAUI.commitLibrary(TAUI.state.lib,[],false,null,{scopes:[['meta']],fileBinding:{kind:'characters',id:0,expected:null,
      next:{stamp:'qa-link',name:'Reviewed pilot.png',mode:'web',needsVerify:true,checkedAt:Date.now()}}});
    TAUI.renderStage();
  });
  await wait(()=>document.querySelector('[data-work-file]')?.textContent.includes('Reviewed pilot.png'),'actual saved file status');
  assert.match(await run(()=>document.querySelector('[data-work-file]').textContent),/download/i);
  await click('[data-work-compare]');assert.ok(await run(()=>document.activeElement.matches('[data-sync-open]')));await back();
  await click('.revision-panel summary');await input('.revision-panel [data-label]','Work page checkpoint');
  await click('.revision-panel [data-snapshot]');await wait(()=>document.querySelector('.revision-panel [data-versions]')?.options.length===1,'snapshot recorded on work page');
  assert.equal(await run(async()=>(await TAHistory.list('characters',0))[0].label),'Work page checkpoint');
  await run(()=>TAUI.openAddress('index.html'));await click('[data-collection-kind=character]');await input('[data-collection-search]','Harbor');
  await click('[data-shelf-pages] [data-next]');
  const shelf=await run(()=>{const stage=document.querySelector('#stage');stage.scrollTop=180;
    return {id:stage.querySelector('[data-collection-open]').dataset.collectionOpen,scroll:stage.scrollTop};});
  await click('[data-collection-open="'+shelf.id+'"]');
  await win.webContents.reload();await wait(()=>!!document.querySelector('[data-work-back]'),'reloaded work with shelf context');
  await click('[data-work-back]');
  assert.deepEqual(await run(()=>[TAUI.state.collectionView.page,document.querySelector('[data-collection-search]').value,
    document.querySelector('#stage').scrollTop,document.activeElement.dataset.collectionOpen]),[1,'Harbor',shelf.scroll,shelf.id]);
  await run(()=>TAUI.openAddress(TAWorkPage.href('character',0)));await work();
  for(const lang of ['en','zh','ja','ru','ko','th']){
    win.setContentSize(420,800);
    const fits=await run(code=>{TAI18n.save({lang:code});TAUI.renderStage();const e=document.querySelector('[data-work-page]');
      return e.scrollWidth<=e.clientWidth+2 && e.querySelector('h2').textContent==='Harbor pilot' && !e.textContent.includes('workPage.');},lang);
    assert.ok(fits,'narrow work page in '+lang);
  }
  await run(()=>{TAI18n.save({lang:'en'});TAUI.openAddress(TAWorkPage.href('character','removed'));});
  assert.ok(await run(()=>document.querySelector('[data-work-page]').textContent.includes('no longer') && !document.querySelector('[data-work-edit]')));
  await run(()=>TAUI.openAddress('quick.html#removed'));
  await win.webContents.reload();await wait(()=>document.querySelector('#stage .empty h3')?.textContent.includes('no longer'),'missing linked reply set after reload');
  await click('#stage [data-empty]');assert.ok(await run(()=>TAUI.state.route==='quick' && !TAUI.state.missingAttachment));
  const preview=await run(async()=>{
    const canvas=document.createElement('canvas');canvas.width=canvas.height=160;
    const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(160,160);
    let seed=42;
    for(let i=0;i<pixels.data.length;i+=4){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      pixels.data.set([seed>>>24,seed>>>16&255,seed>>>8&255,255],i);
    }
    ctx.putImageData(pixels,0,0);
    const asset=TAStore.byId(TAUI.state.lib.assets,0);
    asset.dataUrl=canvas.toDataURL('image/png');asset.mime='image/png';
    TAUI.openAddress('characters.html#0');
    const portrait=document.querySelector('[data-preview-face] img');await portrait.decode();
    const field=document.querySelector('#char-form [data-field=description]');
    field.focus();field.value+=' Night shift.';field.dispatchEvent(new Event('input',{bubbles:true}));
    return [portrait.naturalWidth,portrait.src.startsWith('blob:'),document.querySelector('[data-preview-face] img')===portrait,
      document.activeElement===field,asset.dataUrl.startsWith('data:image/png;base64,')];
  });
  assert.deepEqual(preview,[160,true,true,true,true],'large previews decode once, retain the image and input focus, and keep their original bytes available');
  console.log('Collection work pages, same-name and numeric IDs, shared-book impact, exact related destinations, drafts, snapshots, deep links, shelf restoration and six narrow layouts passed.');
});
