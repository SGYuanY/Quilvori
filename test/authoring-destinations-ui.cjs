'use strict';
const assert=require('node:assert/strict');
const suite=require('./desktop-fixture.cjs');

suite('authoring-destinations',async({open,run,click,input,wait,download})=>{
  const go=route=>run(id=>TAUI.go(id),route);
  const change=(selector,value)=>run((s,v)=>{const el=document.querySelector(s);el.value=v;el.dispatchEvent(new Event('change',{bubbles:true}));},selector,String(value));
  const fillExample=async()=>{
    await click('[data-assist-example]');
    assert.ok(await run(()=>document.activeElement.matches('[data-assist]') && document.activeElement.value.trim().length>15));
  };
  async function generate(kind,result,navigate=false){
    await click('[data-assist-go]');
    await wait(kind=>window.pageRequest?.task==='create:'+kind && typeof window.releasePageRequest==='function','waiting for '+kind,kind);
    if(navigate){await go('home');await go(kind);}
    await run(value=>{window.releasePageRequest(value);window.releasePageRequest=null;},result);
    await wait(()=>!TATaskActivity.pending() && !document.querySelector('[data-assist-preview]').hidden,'validated preview');
    return run(()=>window.pageRequest.input);
  }
  async function checkSaved(selector,name){
    await wait((s,n)=>document.activeElement?.matches(s) && document.activeElement.value===n,'focused exact saved item '+name,selector,name);
  }
  const output=async selector=>{
    const {bytes}=await download(selector);
    const receipt=await run(()=>document.querySelector('#export-slip .export-slip span')?.textContent);
    const guide=await run(()=>document.querySelector('[data-export-guide]').textContent);
    assert.equal(receipt,guide);
    return JSON.parse(bytes);
  };
  await open('quick');
  await run(async()=>{
    const lib=TAStore.emptyLibrary();
    lib.characters=[{id:0,name:'设置',description:'Quiet ferrymaster',personality:'Reserved'},
      {id:'second',name:'设置',description:'A different card'},{id:'other',name:'Unused',description:'Unselected background'}];
    lib.worldBooks=[{id:'ports',name:'Fog ports',entries:[{id:0,comment:'Bell',content:'Two quiet chimes',keys:['bell']},
      {id:2,comment:'Back room',content:'Unselected entry',keys:['unused']}]}];
    lib.chats=[{id:0,name:'Dock chat',messages:[{name:'Pilot',mes:'The first bell'},{name:'Clerk',mes:'Second date is Friday'}]}];
    lib.quickReplySets=[{id:'old-set',name:'设置',replies:[]}];
    lib.scripts=[{id:'old-script',name:'Fog',beats:[]}];
    lib.timeline.notes=[{id:'old-note',title:'Ticket',body:'Previous note'}];
    await TAUI.commitLibrary(TAStore.verify(lib));TAUI.renderStage();
    NIJANModel.runTask=(task,input,options)=>new Promise(resolve=>{
      window.pageRequest={task,input,aborted:options.signal.aborted};window.releasePageRequest=resolve;
    });
  });
  for(const [route,manual] of [['quick','#new-qr'],['timeline','#add-note'],['script','#new-script']]){
    await go(route);
    const descriptions=new Set();
    for(const lang of ['en','ja','ru','ko','th','zh','en']){
      const info=await run((lang,manual)=>{
        TAI18n.save({lang});TAUI.renderStage();
        const box=document.querySelector('.ai-assist'),button=document.querySelector(manual);
        return {before:!!(button.compareDocumentPosition(box)&Node.DOCUMENT_POSITION_FOLLOWING),
          heading:box.querySelector('h3').textContent,sample:box.querySelector('.authoring-example p').textContent,
          generate:box.querySelector('[data-assist-go]').textContent,save:box.querySelector('[data-assist-apply]').textContent};
      },lang,manual);
      assert.ok(info.before);assert.ok(info.sample.length>8);assert.notEqual(info.generate,info.save);
      descriptions.add(info.heading+'|'+info.sample);
    }
    assert.equal(descriptions.size,6);
    await click(manual);
    const field={quick:'#qr-body [data-field=name]',timeline:'#tl-editor [data-field=title]',script:'#script-body [data-field=name]'}[route];
    assert.equal(await run(s=>document.activeElement.matches(s),field),true);
  }

  await go('quick');await input('[data-assist]','My original idea');await fillExample();
  assert.equal(await run(()=>document.querySelector('[data-assist]').value.startsWith('My original idea\n\n')),true);
  const originalRequest=await run(()=>document.querySelector('[data-assist]').value);
  assert.equal(await run(()=>NIJANModel.configured()),false);
  await click('[data-assist-go]');
  await click('[data-toast-id=authoring-connect-model] .toast-action');
  await wait(()=>document.querySelector('#settings-model-tab')?.getAttribute('aria-selected')==='true' && document.activeElement.id==='set-base','model settings from the request');
  await input('#set-base','https://authoring-fixture.invalid/v1');await input('#set-key','local-test-value');await input('#model-id','synthetic-author');
  await click('#set-close');
  await wait(()=>!document.querySelector('#modal-root.show') && document.activeElement.matches('[data-assist-go]'),'focus restored after re-rendered settings');
  assert.deepEqual(await run(()=>[TAUI.state.route,document.querySelector('[data-assist]').value,!!window.pageRequest,NIJANModel.configured()]),['quick',originalRequest,false,true]);
  await change('[data-ref-card]',0);await change('[data-ref-world]','ports');await change('[data-ref-scope]','selected');
  await click('.reply-entry-choices input[value="0"]');
  const quick=await generate('quick',{quick:{name:'设置',replies:[{label:'设置',message:'<Knock> & wait.'}]}},true);
  assert.equal(quick.reference.card.id,0);assert.deepEqual(quick.reference.book.entries.map(e=>e.id),[0]);
  assert.equal(await run(()=>document.querySelector('.authoring-preview-lines strong').textContent),'设置');
  assert.equal(await run(()=>document.querySelector('.authoring-preview-lines p').textContent),'<Knock> & wait.');
  await input('#search','filter that matches nothing');
  await click('[data-assist-apply]');await checkSaved('#qr-body [data-field=name]','设置');
  assert.notEqual(await run(()=>TAUI.state.sel.qr),'old-set');assert.equal(await run(()=>TAUI.state.query),'');
  const replyFile=await output('#export-qr');
  assert.equal(replyFile.version,2);assert.equal(replyFile.qrList[0].message,'<Knock> & wait.');
  assert.match(await run(()=>document.querySelector('[data-export-guide]').textContent),/Extensions → Quick Reply.*import/i);

  await go('timeline');await change('[data-journal-source]',0);await input('[data-journal-range=to]','2');await input('[data-journal-range=from]','2');
  const range=await run(()=>document.querySelector('[data-journal-source-preview]').textContent);
  assert.match(range,/#2.*Clerk.*Second date/);assert.doesNotMatch(range,/first bell/);
  await fillExample();
  const journal=await generate('timeline',{timeline:{notes:[{title:'Ticket',body:'Check Friday.',floor:1}],beats:[{title:'Return',summary:'Ask the clerk.',floor:1}]}});
  assert.deepEqual(journal.journalSource.messages.map(m=>m.floor),[1]);assert.equal(await run(()=>document.querySelectorAll('.authoring-preview-lines li').length),2);
  await click('[data-assist-apply]');await checkSaved('#tl-editor [data-field=title]','Ticket');
  assert.notEqual(await run(()=>TAUI.state.sel.tl),'old-note');assert.equal(await run(()=>TAUI.state.sel.tlKind),'note');
  const links=await run(()=>[...document.querySelectorAll('[data-assist-open]')].map(b=>b.dataset.assistOpen));assert.equal(links.length,2);
  await run(id=>document.querySelector('[data-assist-open="'+CSS.escape(id)+'"]').click(),links[1]);
  await checkSaved('#tl-editor [data-field=title]','Return');assert.equal(await run(()=>TAUI.state.sel.tlKind),'beat');
  const journalFile=await output('#export-tl');assert.equal(journalFile.format,'tavern-atelier.timeline.v1');assert.equal(journalFile.beats[0].chatId,0);
  assert.match(await run(()=>document.querySelector('[data-export-guide]').textContent),/no journal JSON importer.*current chat’s Author’s Note.*full library backup/i);

  await go('script');await click('[data-script-speaker="0"]');await fillExample();
  assert.equal(await run(()=>document.querySelector('.authoring-example strong').textContent),'设置');
  const script=await generate('script',{script:{name:'Fog',beats:[{speaker:0,line:'设置',trigger:'<Rain>'},{speaker:'narrator',line:'A light flickers.'}]}});
  assert.deepEqual(script.availableCharacters.map(c=>c.id),[0]);assert.doesNotMatch(JSON.stringify(script),/Unselected|different card|first bell/);
  assert.deepEqual(await run(()=>[...document.querySelectorAll('.authoring-preview-lines strong')].map(e=>e.textContent)),['设置','Narrator']);
  await run(()=>{
    const apply=NIJANStudio.applyExternal;
    NIJANStudio.applyExternal=async plan=>{await new Promise(r=>window.releasePageSave=r);NIJANStudio.applyExternal=apply;return apply(plan);};
  });
  await click('[data-assist-apply]');await wait(()=>typeof window.releasePageSave==='function','deferred save');await go('quick');
  await run(()=>window.releasePageSave());
  try{await wait(()=>TAUI.state.lib.scripts.some(s=>s.id!=='old-script' && s.name==='Fog'),'saved while away');}
  catch(error){
    const detail=await run(()=>{const names=TAUI.state.lib.scripts.map(s=>s.name);TAUI.go('script');
      return {names,status:document.querySelector('.model-progress')?.textContent,preview:document.querySelector('[data-assist-preview]')?.textContent};});
    throw Error(error.message+' '+JSON.stringify(detail));
  }
  assert.equal(await run(()=>TAUI.state.route),'quick');
  await go('script');await click('[data-assist-open]');await checkSaved('#script-body [data-field=name]','Fog');
  assert.notEqual(await run(()=>TAUI.state.sel.script),'old-script');
  assert.equal(await run(()=>document.querySelector('#script-preview .trigger').textContent.includes('<Rain>')),true);
  const file=await output('#export-script');assert.equal(file.format,'tavern-atelier.script.v1');assert.equal(file.beats[0].speaker_id,'0');
  assert.equal(file.beats[0].speaker,'设置');assert.equal(file.beats[0].line,'设置');
  assert.match(await run(()=>document.querySelector('[data-export-guide]').textContent),/no script importer/i);
  console.log('Three manual paths, six locales, sample prompts, scoped AI previews, exact saved links, navigation during work and all export destinations passed.');
});
