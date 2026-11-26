'use strict';
const assert = require('node:assert/strict');
const suite = require('./desktop-fixture.cjs');

suite('prompt-order', async ({run,open,wait,click,input,file,download}) => {
  await open('prompts');
  await run(async()=>{await TAUI.commitLibrary(TAStore.emptyLibrary());TAUI.renderStage();});
  const exported = async()=>JSON.parse((await download('#export-preset')).bytes);
  async function importFile(payload, choose) {
    const count=await run(()=>TAUI.state.lib.promptPresets.length);
    await file(payload); await click('#import-preset');
    if (choose!==undefined) {
      await wait(()=>!!document.querySelector('#modal-root select'),'prompt order selector');
      await run(i=>{document.querySelector('#modal-root select').selectedIndex=i;},choose);
      await click('#modal-root [data-act=import]');
    }
    await wait(n=>TAUI.state.lib.promptPresets.length===n+1,'imported preset',count);
  }
  await click('#new-preset'); const empty = await exported();
  await importFile(empty);
  assert.deepEqual((await exported()).prompts,empty.prompts,'empty system text safely round-trips');
  const definitions = [
    {identifier:'a',name:'North',role:'user',content:''},
    {identifier:'b',name:'Silver compass',role:'system',system_prompt:'Legacy text'},
    {identifier:'unused',name:'Unused',enabled:true,content:'Keep this definition'},
    {identifier:'history',marker:true},
  ];
  const order = [{identifier:'b',enabled:true},{identifier:'a',enabled:false}];
  const preset = {name:'Navigator',prompts:definitions,prompt_order:[
    {character_id:100001,order:[{identifier:'a',enabled:true}]},
    {character_id:0,order},
  ]};
  await importFile(preset,1);
  assert.ok(await run(()=>document.querySelector('#stage .help[data-no-translate]').textContent.includes('character_id: 0')));
  const checkOrder = (doc,body) => {
    assert.deepEqual(doc.prompt_order,[{character_id:0,order}]);
    assert.deepEqual(doc.prompts.map(p=>[p.identifier,p.content,p.enabled]),[
      ['b',body,true],['a','',false],['unused','Keep this definition',false],
    ]);
  };
  checkOrder(await exported(),'Legacy text');
  await input('#blocks textarea','Edited body');
  const edited = await exported(); checkOrder(edited,'Edited body');
  await importFile(edited); checkOrder(await exported(),'Edited body');
  for (const query of ['Navigator','Silver compass','unmatched QX']) {
    await input('#search',query);
    await new Promise(resolve=>setTimeout(resolve,230));
    const disabled=await run(()=>document.querySelector('#export-preset').disabled);
    assert.equal(disabled,query==='unmatched QX');
    if (!disabled) checkOrder(await exported(),'Edited body');
  }
  await input('#search',''); await new Promise(resolve=>setTimeout(resolve,230));
  await importFile({name:'Definitions only',prompts:definitions});
  const legacy=await exported();
  assert.deepEqual(legacy.prompt_order[0].order.map(p=>p.identifier),['a','b','unused']);
  assert.ok(legacy.prompts.every(p=>p.enabled));
  const before=await run(()=>TAUI.state.lib.promptPresets);
  for (const [row,field] of [[{content:{text:'Save this'}},'content'],[{enabled:'false'},'enabled']]) {
    await file({prompts:[{content:'First valid row'},row]}); await click('#import-preset');
    await wait(path=>[...document.querySelectorAll('.toast-message')].some(el=>el.textContent.includes(path)),
      'validation feedback for '+field,'prompts[1].'+field);
    assert.deepEqual(await run(()=>TAUI.state.lib.promptPresets),before,'failed import preserves the entire library list');
  }
  await open('prompts');
  assert.deepEqual(await run(()=>TAUI.state.lib.promptPresets),before,'presets after reopening');
  console.log('Prompt editor: native and legacy round trips, scopes, filters and rejected imports without partial saves passed.');
});
