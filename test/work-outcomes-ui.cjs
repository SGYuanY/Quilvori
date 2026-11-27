'use strict';
const assert=require('node:assert/strict');
const suite=require('./desktop-fixture.cjs');

suite('work-outcomes',async({open,run,wait,click:fixtureClick,input:fixtureInput,download})=>{
  async function click(selector){
    try{await fixtureClick(selector);}catch(error){throw Error('Click '+selector,{cause:error});}
  }
  async function input(selector,value){
    try{await fixtureInput(selector,value);}catch(error){throw Error('Input '+selector,{cause:error});}
  }
  const row=kind=>'[data-work-outcome="'+kind+'"]';
  async function expect(kind,state){
    try{
      await wait((kind,state)=>document.querySelector('[data-work-outcome="'+kind+'"]')?.dataset.outcomeState===state,
        kind+' is '+state,kind,state);
    }catch(error){
      const detail=await run(()=>({route:TAUI.state.route,log:document.querySelector('.ai-task-log')?.open,
        panel:document.querySelector('[data-task-recovery]')?.innerText,drafts:TAStudioDrafts.pending().length,
        cards:TAUI.state.lib.characters.length,toast:document.querySelector('#toasts')?.innerText}));
      throw Error(error.message+' '+JSON.stringify(detail));
    }
  }
  async function log(){
    await run(()=>{document.querySelector('.ai-task-log').open=true;});
    await wait(()=>!!document.querySelector('#ai-task-select'),'saved requests');
  }
  async function select(id){
    await run(id=>{const el=document.querySelector('#ai-task-select');el.value=id;el.dispatchEvent(new Event('change'));},id);
  }
  await open('studio');
  if(process.env.QUILVORI_TEST_PHASE==='work-outcomes-restart'){
    await run(()=>{window.fixtureFetches=0;window.fetch=async()=>{window.fixtureFetches++;throw Error('Recovery contacted a provider');};});
    const records=await run(()=>NIJANModel.history().map(r=>({id:r.id,brief:r.workBrief,empty:r.emptyReason})));
    const kept=records.find(r=>r.brief==='Keep both works'), malformed=records.find(r=>r.brief==='Mixed response'),
      noText=records.find(r=>r.empty==='reasoning');
    assert.ok(kept && malformed && noText);
    await log();await select(kept.id);
    await expect('character','adopted');await expect('world','recoverable');
    assert.match(await run(()=>document.querySelector('[data-work-outcome=character]').textContent),/Renamed harbor keeper/);
    assert.match(await run(()=>document.querySelector('[data-work-outcome=world]').textContent),/could not be saved/i);
    await click(row('world')+' [data-outcome-recover]');await expect('world','draft');
    await click(row('world')+' [data-outcome-open]');
    const worldPlan=await run(()=>TAStudioDrafts.pending().find(p=>p.plan.task==='create:world').plan.id);
    await wait(id=>document.activeElement.closest('[data-plan]')?.dataset.plan===id,'focused draft',worldPlan);
    await click('[data-plan="'+worldPlan+'"] [data-apply]');
    await wait(()=>TAUI.state.lib.worldBooks.some(b=>b.name==='Channel lights'),'adopt recovered world');
    await log();await select(kept.id);await expect('world','adopted');
    await click(row('world')+' [data-outcome-open]');
    await wait(()=>TAUI.state.route==='lore' && TAUI.state.lib.worldBooks.find(b=>b.id===TAUI.state.sel.book)?.name==='Channel lights','open recovered world');
    await click('[data-nav=studio]');await log();await select(kept.id);await expect('character','adopted');
    await click(row('character')+' [data-outcome-open]');
    await wait(()=>TAUI.state.route==='characters' && TAUI.state.lib.characters.find(c=>c.id===TAUI.state.sel.character)?.name==='Renamed harbor keeper','open renamed card');
    await click('[data-nav=studio]');await log();await select(malformed.id);
    await expect('character','draft');await expect('world','attention');
    assert.ok(!await run(()=>document.querySelector('[data-work-outcome=world] [data-outcome-recover]')));
    await select(noText.id);await expect('character','attention');
    assert.match(await run(()=>document.querySelector('[data-work-outcome=character]').textContent),/reasoning/i);
    assert.equal(await run(()=>window.fixtureFetches),0);
    await click('[data-nav=backup]');
    const {bytes}=await download('#save-backup'), raw=bytes.toString('utf8');
    for(const privateText of ['fixture-outcome-secret','fixture-hidden-reasoning','fixture-hidden-no-output-brief']){
      assert.ok(!raw.includes(privateText),'Private connection or empty-response input in backup');
    }
    const decoded=await run(str=>TAFormats.readBackup(JSON.parse(str)).workState.records.map(r=>[r.id,r.emptyReason]),raw);
    assert.ok(decoded.some(([id,reason])=>id===noText.id && reason==='reasoning'));
    await click('[data-nav=studio]');await log();
    await run(()=>{
      const old={id:'old-without-label',task:'create:world',startedAt:'2025-03-02T10:00:00Z',status:'partial',
        output:JSON.stringify({world:{name:'Broken',entries:[{comment:'Missing text'}]}}),error:'世界书条目缺少条目名或正文。'};
      const authored={...old,id:'custom-label',label:'设置',scope:'设置',status:'error',output:JSON.stringify({error:'设置'}),error:'设置'};
      TACreationRecords.replace([...NIJANModel.history(),old,authored],TACreationRecords.epoch());
      window.dispatchEvent(new Event('nijan-task'));
    });
    await select('old-without-label');
    for(const lang of ['en','ja','ru','ko','th','zh','en']){
      const visible=await run(lang=>{
        TAI18n.save({lang});window.dispatchEvent(new Event('nijan-task'));
        const host=document.querySelector('#ai-task-record');
        TAI18n.localize(host);
        return {label:host.querySelector('.field-label').textContent,options:host.querySelector('option:checked').textContent,
          details:[...host.querySelectorAll(':scope > details > summary')].map(s=>s.textContent),status:host.querySelector('[data-task-status]').textContent,
          note:host.querySelector('[data-work-outcome=world] .help').textContent,kind:TAI18n.t('世界书'),error:TAI18n.t('世界书条目缺少条目名或正文。')};
      },lang);
      assert.ok(visible.options.startsWith(visible.kind+' · '));
      assert.ok(!visible.status.includes('undefined') && visible.status.includes(visible.error));
      assert.equal(visible.note,visible.error);
      if(lang==='en'){
        assert.equal(visible.label,'Choose a task');
        assert.deepEqual(visible.details,['Input scope','Model reasoning','Raw result (diagnostics)']);
        assert.equal(visible.error,'A world book entry is missing its title or text.');
      }
      if(lang!=='zh')assert.notEqual(visible.error,'世界书条目缺少条目名或正文。');
    }
    await select('custom-label');
    const authored=await run(()=>{
      const host=document.querySelector('#ai-task-record');TAI18n.localize(host);
      return [host.querySelector('option:checked').textContent,host.querySelector('[data-task-scope]').textContent,
        host.querySelector('[data-work-outcome=world] .help').textContent,host.querySelector('[data-task-status]').textContent];
    });
    assert.ok(authored[0].startsWith('设置 · '));assert.deepEqual(authored.slice(1),['设置','设置','Incomplete · 设置']);
    console.log('Persisted destinations open the renamed card, locally recover its companion, and explain malformed or empty responses after restart.');
    return;
  }

  await run(async()=>{
    await TAUI.commitLibrary(TAStore.emptyLibrary(),[],true);
    await NIJANModel.ready;
    NIJANModel.save({baseUrl:'https://model.example.invalid/v1',key:'fixture-outcome-secret',protocol:'chat',model:'outcome-fixture'});
    await NIJANModel.flushCredentials();
    window.fixtureFetches=0;
    window.fetch=async()=>{
      window.fixtureFetches++;
      if(!window.fixtureReply)throw Error('Unexpected extra request');
      const message=window.fixtureReply;window.fixtureReply=null;
      return new Response(JSON.stringify({choices:[{finish_reason:'stop',message}]}),{headers:{'content-type':'application/json'}});
    };
    TAUI.renderStage();
  });
  async function generate(brief,kinds,reply,failWorld=false){
    await click('[data-mode=create]');
    await click('#ai-create-new');await input('#ai-brief',brief);
    const before=await run((wanted,message,fail)=>{
      for(const input of document.querySelectorAll('[data-module]'))if(input.checked!==wanted.includes(input.dataset.module))input.click();
      window.fixtureReply=message;
      if(fail){
        const keep=TAStudioDrafts.keep;
        TAStudioDrafts.keep=async function(plan,...args){
          if(plan.task!=='create:world')return keep(plan,...args);
          TAStudioDrafts.keep=keep;throw new Error('Fixture draft write failed');
        };
      }
      return window.fixtureFetches;
    },kinds,reply,failWorld);
    await click('#ai-create');
    await wait(n=>window.fixtureFetches>n && !NIJANStudio.running(),'generation finishes',before);
    assert.equal(await run(()=>window.fixtureFetches),before+1,'one response per request');
    await log();
    const id=await run(()=>NIJANModel.history().at(-1).id);
    await select(id);
    return id;
  }
  const card={name:'Harbor keeper',description:'Times the ferry by the channel lights.'};
  const world={name:'Channel lights',entries:[{comment:'Beacon',content:'Two flashes signal a crossing.',keys:['beacon']}]};
  const kept=await generate('Keep both works',['character','world'],{content:JSON.stringify({character:card,world})},true);
  await expect('character','draft');await expect('world','recoverable');
  const scope=await run(()=>document.querySelector('[data-task-scope]').textContent);
  assert.match(scope,/Reference character · None selected/);assert.match(scope,/World book · None selected/);
  await click(row('character')+' [data-outcome-open]');
  const plan=await run(()=>TAStudioDrafts.pending()[0].plan.id);
  await click('[data-plan="'+plan+'"] [data-apply]');
  await wait(()=>TAUI.state.lib.characters.some(c=>c.name==='Harbor keeper'),'adopt keeper');
  await log();await select(kept);await expect('character','adopted');
  await click(row('character')+' [data-outcome-open]');
  await wait(()=>TAUI.state.route==='characters','character editor');
  await click('[data-act="view-edit"]');await input('[data-field="name"]','Renamed harbor keeper');
  assert.equal(await run(()=>TAUI.flush()),true);
  await click('[data-act=dup]');
  assert.equal(await run(()=>{const copy=TAUI.state.lib.characters.find(c=>c.id===TAUI.state.sel.character);
    return !!copy && !Object.hasOwn(copy,'creationRecordKeys') && !Object.hasOwn(copy,'creationSource');}),true);
  assert.equal(await run(()=>TAUI.flush()),true);
  await click('[data-nav=studio]');await log();await select(kept);
  await expect('character','adopted');
  await generate('Mixed response',['character','world'],{content:JSON.stringify({character:card,world:{name:'Broken book',entries:[{comment:'Missing text'}]}})});
  await expect('character','draft');await expect('world','attention');
  await generate('fixture-hidden-no-output-brief',['character'],{content:'',reasoning_content:'fixture-hidden-reasoning'});
  await expect('character','attention');
  assert.equal(await run(()=>window.fixtureFetches),3);
  console.log('Real creation, draft write failure, adoption, renaming, malformed companion and reasoning-only request passed.');
});
