'use strict';
const assert=require('node:assert/strict');
const suite=require('./desktop-fixture.cjs');

suite('work-restore',async({open,run,wait,click,input,file,key,win})=>{
  await open('backup');
  const type=(kind,id)=>JSON.stringify([kind,id]);
  const choose=(selector,value)=>run((selector,value)=>{
    const element=document.querySelector(selector);
    element.value=value;element.dispatchEvent(new Event('change',{bubbles:true}));
  },selector,value);
  const checkCopy=async()=>{
    const result=await run(async()=>{
      const lib=TAUI.state.lib, original=lib.characters.find(c=>c.id===0),restored=lib.characters.find(c=>c.backupCopyOf===0);
      const history=await TAHistory.list('characters',restored.id),first=history[0]?.value;
      const picture=id=>lib.assets.find(a=>a.id===id)?.dataUrl;
      return {
        originals:[original.description,picture(original.avatarAssetId),lib.chats[0].messages[0].mes,lib.settings.backupNote],
        copy:[restored.name,restored.description,picture(restored.avatarAssetId),lib.worldBooks.find(b=>b.id===restored.embeddedBookId)?.name],
        version:[history.length,history[0]?.label,first?.description,first?.id===restored.id,picture(first?.avatarAssetId)],
        sourceRemoved:!Object.hasOwn(restored,'creationRecordKeys')&&!Object.hasOwn(restored,'creationSource'),
        unrelated:lib.assets.some(a=>a.name==='Unselected asset')||lib.characters.some(c=>c.id==='unselected'),
      };
    });
    assert.deepEqual(result,{
      originals:['Writing this week','current data','Local dialogue','Local settings'],
      copy:['Lighthouse keeper','Backup passage','old data','Historic harbor'],
      version:[1,'First draft','Earlier passage',true,'past data'],sourceRemoved:true,unrelated:false,
    });
  };
  if(process.env.QUILVORI_TEST_PHASE==='work-restore-restart'){
    await checkCopy();
    assert.deepEqual(await run(async()=>{
      const book=TAUI.state.lib.worldBooks.find(b=>b.id===7),versions=await TAHistory.list('worldBooks',7);
      return [book.entries[0].content,versions.map(v=>v.value.entries[0].content)];
    }),['Earlier tide table',['Changed while comparing']]);
    console.log('Restored works, selected historical media and the pre-replacement snapshot reopened in a fresh process.');
    return;
  }

  const packet=await run(async()=>{
    const asset=(id,name,dataUrl)=>({id,name,dataUrl,kind:'avatar'});
    const world=(id,name,body)=>({id,name,entries:[{id:0,stUid:9,comment:'Quay',content:body}]});
    const live=TAStore.verify({characters:[{id:0,name:'Lighthouse keeper',description:'Writing this week',avatarAssetId:0}],
      worldBooks:[world(7,'Tides','Current tide table')],assets:[asset(0,'Local portrait','current data')],
      chats:[{id:0,name:'Local chat',messages:[{name:'Reader',mes:'Local dialogue'}]}],settings:{backupNote:'Local settings'}});
    await TAUI.commitLibrary(live,[],true);TAUI.renderStage();
    const archive=TAStore.verify({characters:[
      {id:0,name:'Lighthouse keeper',description:'Backup passage',creator_notes:'Notes on the keeper and the light. '.repeat(360),avatarAssetId:0,embeddedBookId:0,creationSource:'fixture-return',creationRecordKeys:['fixture']},
      {id:'unselected',name:'Another writer'}],
      assets:[asset(0,'Backup portrait','old data'),asset('past','Earlier portrait','past data'),asset('unused','Unselected asset','other')],
      worldBooks:[world(0,'Historic harbor','Old harbor'),world(7,'Tides','Earlier tide table')],chats:[]});
    const snapshots=[
      {id:0,kind:'characters',time:100,label:'First draft',reason:'手动快照',value:{...archive.characters[0],description:'Earlier passage',avatarAssetId:'past'}},
      {id:0,kind:'characters',time:200,label:'Second draft',reason:'手动快照',value:{...archive.characters[0],description:'Skip this version'}},
    ];
    return TAFormats.backupOf(archive,{versions:snapshots,drafts:[],records:[],limits:[]});
  });
  assert.equal(await run(()=>document.querySelector('#restore-work').textContent.trim()),'Restore one work');
  async function start(data=packet,throughMerge=false){
    await file(data,'fixture-backup.json');
    await click(throughMerge?'#load-backup':'#restore-work');
    if(throughMerge){
      await wait(()=>!!document.querySelector('[data-act="one-work"]'),'single-work choice in whole-backup review');
      await click('[data-act="one-work"]');
    }
    await wait(()=>!!document.querySelector('[data-restore-work-list]'),'one-work review');
  }
  await start();
  await input('[data-restore-work-search]','Quay');
  assert.equal(await run(()=>document.querySelector('[data-restore-work-list]').size),2);
  await input('[data-restore-work-search]','');
  assert.equal(await run(()=>document.querySelector('[data-restore-work-list]').size),4);
  await choose('[data-restore-work-list]',type('characters',0));
  await run(()=>document.querySelectorAll('.work-restore-pair details').forEach(el=>{el.open=true;}));
  await wait(()=>document.querySelectorAll('.work-restore-pair details > pre').length===2,'expanded manuscripts');
  for(const [width,height] of [[1366,900],[390,580]]){
    win.setContentSize(width,height);
    const layout=await run(async()=>{
      const frame=()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
      await frame();
      const box=document.querySelector('.work-restore-dialog'),area=box.querySelector('.work-restore');
      const selectors=['h3','[data-act="restore-work"]','[data-act="no"]'];
      function positions(){
        return selectors.map(s=>{
          const rect=box.querySelector(s).getBoundingClientRect();
          return [rect.top,rect.bottom,rect.left,rect.right];
        });
      }
      area.scrollTop=0;await frame();
      const initial=positions();
      area.scrollTop=area.scrollHeight;await frame();
      const bounds=box.getBoundingClientRect();
      return {initial,after:positions(),height:innerHeight,width:innerWidth,scrolled:area.scrollTop,
        fits:bounds.left>=0 && bounds.right<=innerWidth+1 && box.scrollWidth<=box.clientWidth+1 && area.scrollWidth<=area.clientWidth+1};
    });
    assert.ok(layout.fits,'review fits horizontally at '+width+'×'+height);
    assert.ok(layout.scrolled>0,'long manuscripts scroll within the review at '+width+'×'+height);
    assert.deepEqual(layout.after,layout.initial,'title and actions stay still while scrolling');
    assert.ok(layout.after.every(([top,bottom,left,right])=>top>=0 && bottom>top && bottom<=layout.height+1 && left>=0 && right<=layout.width+1),'title and both actions stay on screen');
  }
  await run(()=>document.querySelector('[data-act="no"]').focus());key('Tab');
  await wait(()=>document.activeElement===document.querySelector('[data-restore-work-search]'),'keyboard wraps to search');
  await run(()=>document.querySelectorAll('.work-restore-pair details').forEach(el=>{el.open=false;}));
  await input('[data-restore-work-search]','nothing to restore');
  assert.ok(await run(()=>document.querySelector('[data-act="restore-work"]').disabled));
  await input('[data-restore-work-search]','Backup passage');
  assert.equal(await run(()=>document.querySelector('[data-restore-work-list]').value),type('characters',0));
  assert.deepEqual(await run(()=>[document.querySelector('[data-restore-mode]').value,
    ...[...document.querySelectorAll('.work-restore-pair > section > pre')].map(el=>el.textContent)]),['copy','Writing this week','Backup passage']);
  await run(()=>{const summary=document.querySelector('.work-restore > section > details > summary');summary.click();});
  await wait(()=>!!document.querySelector('[data-restore-snapshot]'),'snapshot checkboxes');
  await click('[data-restore-snapshot][value="0"]');
  assert.ok(await run(()=>[...document.querySelectorAll('[data-restore-dep]')].some(x=>x.checked&&x.value.includes('"past"'))));
  await click('[data-act="restore-work"]');
  await wait(()=>!!document.querySelector('[data-open-restored-work]'),'saved copy');
  await checkCopy();await click('[data-open-restored-work]');
  await wait(()=>TAUI.state.route==='characters' && document.querySelector('#char-form [data-field="description"]')?.value==='Backup passage','open restored character');

  await click('[data-nav=backup]');
  const older={atelier:'tavern-atelier',libraryVersion:1,library:packet.library};
  await start(older,true);
  await choose('[data-restore-work-list]',type('worldBooks',7));
  await choose('[data-restore-mode]','replace');await click('[data-act="restore-work"]');
  await wait(()=>!!document.querySelector('[data-act="replace-work"]'),'explicit replacement confirmation');
  await click('#modal-root [data-act=no]');
  assert.equal(await run(()=>TAUI.state.lib.worldBooks.find(b=>b.id===7).entries[0].content),'Current tide table');
  await start(older);await choose('[data-restore-work-list]',type('worldBooks',7));
  await choose('[data-restore-mode]','replace');
  await run(async()=>{
    const next=structuredClone(TAUI.state.lib);
    next.worldBooks.find(b=>b.id===7).entries[0].content='Changed while comparing';
    await TAUI.commitLibrary(next);
  });
  await click('[data-act="restore-work"]');await click('[data-act="replace-work"]');
  await wait(()=>!!document.querySelector('.toast-error'),'stale preview rejected');
  assert.equal(await run(()=>TAUI.state.lib.worldBooks.find(b=>b.id===7).entries[0].content),'Changed while comparing');
  await start(older);await choose('[data-restore-work-list]',type('worldBooks',7));
  await choose('[data-restore-mode]','replace');await click('[data-act="restore-work"]');await click('[data-act="replace-work"]');
  await wait(()=>TAUI.state.lib.worldBooks.find(b=>b.id===7).entries[0].content==='Earlier tide table','confirmed replacement');
  await checkCopy();assert.ok(await run(()=>TAUI.flush()));
  console.log('Single-work restore through both backup entries, default independent copy, selected history, legacy backup, cancellation and stale replacement passed.');
});
