'use strict';
const assert = require('node:assert/strict');
const suite = require('./desktop-fixture.cjs');

suite('journal-links', async ({open,run,click,input,wait}) => {
  async function change(selector,value) {
    await run((query,value)=>{
      const control=document.querySelector(query);
      control.value=String(value);
      control.dispatchEvent(new Event('change',{bubbles:true}));
    },selector,value);
  }
  async function follow(title,id,index,text) {
    await run(title=>{
      const button=[...document.querySelectorAll('#tl .tl-item')].find(row=>row.querySelector('strong').textContent===title);
      if (!button) throw Error('Missing journal entry '+title);
      button.click();
    },title);
    await click('[data-open-source]');
    await wait(()=>!!document.querySelector('article[data-journal-target]'),'linked chat message');
    assert.deepEqual(await run(()=>{
      const row=document.querySelector('article[data-journal-target]');
      return [TAUI.state.sel.chat,Number(row.dataset.index),row.querySelector('.body').textContent];
    }),[id,index,text]);
    await run(title=>{
      const button=[...document.querySelectorAll('[data-journal-target] header button')].find(b=>b.textContent.endsWith(' · '+title));
      if (!button) throw Error('Missing journal backlink '+title);
      button.click();
    },title);
    assert.equal(await run(()=>document.querySelector('#tl-editor [data-field=title]').value),title);
  }

  if (process.env.QUILVORI_TEST_PHASE==='journal-links-restart') {
    await open('timeline');
    const links=await run(()=>{
      const {notes,beats}=TAUI.state.lib.timeline;
      return Object.fromEntries([...notes,...beats].map(row=>[row.title,row.chatId]));
    });
    assert.deepEqual(links,{'Dock note':0,'Old note':'7','Second route':7,'AI note':0});
    await follow('Dock note',0,1,'Zero second line');
    await follow('Old note',7,0,'Seven first line');
    await follow('Second route',7,1,'Seven second line');
    console.log('Journal links and backlinks reopen with their original chat and message in a new process.');
    return;
  }

  await open('chat');
  await run(async ()=>{
    const lib=TAStore.emptyLibrary();
    lib.chats=[['007','String seven'],[7,'Seven'],[0,'Zero']].map(([id,name])=>({
      id,name,bookmarks:[],messages:['first','second'].map(position=>({name:'Reader',mes:name+' '+position+' line'}))
    }));
    lib.timeline.notes=[{id:'old',title:'Old note',body:'Legacy selection',chatId:'7',floor:0}];
    await TAUI.commitLibrary(TAStore.verify(lib));
    TAUI.renderStage();
  });
  await click('.pick[data-id="0"]');
  await click('article[data-index="1"] [data-message-note]');
  await input('#tl-editor [data-field=title]','Dock note');
  assert.equal(await run(()=>document.querySelector('[data-note-chat]').value),'0');
  await follow('Dock note',0,1,'Zero second line');
  await click('#add-beat');
  await input('#tl-editor [data-field=title]','Second route');
  await change('[data-note-chat]','007');
  assert.equal(await run(()=>TAUI.state.lib.timeline.beats[0].chatId),'007');
  await change('[data-note-chat]','7');
  await change('[data-note-floor]',2);
  assert.equal(await run(()=>TAUI.state.lib.timeline.beats[0].chatId),7);
  await follow('Second route',7,1,'Seven second line');

  await change('[data-journal-source]','0');
  await input('[data-journal-range=to]','2');
  await input('[data-journal-range=from]','2');
  assert.ok(await run(()=>!document.querySelector('[data-journal-range=from]').closest('.row').hidden));
  await run(()=>{
    NIJANModel.configured=()=>true;
    NIJANModel.runTask=async(task,context)=>{
      if(task!=='create:timeline') throw Error('Unexpected task '+task);
      const {chatId,messages}=context.journalSource;
      window.journalTestRequest=[chatId,messages.map(message=>message.text)];
      return {timeline:{notes:[{title:'AI note',body:'Route confirmed',floor:1}]}};
    };
  });
  await input('[data-assist]','Summarize the selected line.');
  await click('[data-assist-go]');
  await wait(()=>!document.querySelector('[data-assist-preview]').hidden,'cited journal preview');
  assert.deepEqual(await run(()=>window.journalTestRequest),[0,['Zero second line']]);
  await click('[data-assist-apply]');
  await wait(()=>TAUI.state.lib.timeline.notes.some(n=>n.title==='AI note'),'saved AI note');
  await run(()=>TAUI.flush());
  console.log('Integer and string chat selections, message backlinks and scoped AI journal additions passed.');
});
