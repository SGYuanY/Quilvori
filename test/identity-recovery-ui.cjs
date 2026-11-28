'use strict';
const assert=require('node:assert/strict');
const {unzipSync}=require('fflate');
const suite=require('./desktop-fixture.cjs');
require('../js/png');

suite('identity-recovery',async({open,run,click,file,wait,download})=>{
  await open('backup');
  const picture=await run(async()=>{
    TAI18n.save({lang:'en'});
    const canvas=document.createElement('canvas');canvas.width=canvas.height=2;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#454265';ctx.fillRect(0,0,2,2);
    const dataUrl=canvas.toDataURL('image/png'),lib=TAStore.emptyLibrary();
    lib.assets=[{id:7,name:'Smile.png',kind:'expression',mime:'image/png',dataUrl}];
    lib.characters=[{id:0,name:'Pilot',description:'Local description',expressionAssetIds:['7']}];
    await TAUI.commitLibrary(TAStore.verify(lib),[],true);
    await TAHistory.save('characters',TAUI.state.lib.characters[0],'Local snapshot');
    await TAUI.commitLibrary(TAUI.state.lib,[],false,null,{scopes:[['meta']],fileBinding:{
      kind:'characters',id:0,expected:null,next:{stamp:'test',mode:'web',name:'Pilot.png',needsVerify:true},
    }});
    TAUI.go('backup');return dataUrl.split(',')[1];
  });
  const snapshot={kind:'characters',id:'0',time:1,reason:'snapshot',label:'Backup snapshot',
    value:{id:'0',name:'Pilot',description:'Earlier backup'}};
  async function merge(description,choice){
    const character={id:'0',name:'Pilot',description,expressionAssetIds:['7']};
    await file({atelier:'tavern-atelier',libraryVersion:1,backupVersion:2,
      library:{characters:[character]},workState:{versions:[snapshot],drafts:[],limits:[],records:[]}});
    await click('#load-backup');await wait(()=>!!document.querySelector('#modal-root [data-act=merge]'),'mixed ID merge preview');
    const options=await run(choice=>{
      const fields=[...document.querySelectorAll('#modal-root [data-merge-choice]')];
      const item=fields.find(el=>JSON.parse(el.dataset.mergeChoice)[1].at(-1)==='description');
      item.value=choice;item.dispatchEvent(new Event('change',{bubbles:true}));
      return fields.map(el=>JSON.parse(el.dataset.mergeChoice)[1].at(-1));
    },choice);
    assert.ok(!options.includes('id'),'an equivalent ID cannot overwrite the stored key');
    await click('#modal-root [data-act=merge]');
    await wait((desc,copy)=>TAUI.state.lib.characters.some(row=>row.description===desc && (copy?row.backupCopyOf===0:row.id===0)),
      'selected conflict committed',description,choice==='copy');
  }
  await merge('Accepted description','backup');await open('backup');
  const ownership=await run(async()=>{
    const rows=await TAHistory.list('characters',0);
    return [TAUI.state.lib.characters.map(row=>row.id),rows.map(row=>[row.id,row.label]),(await TALibraryDB.workBinding('characters',0))?.name];
  });
  assert.deepEqual(ownership,[[0],[[0,'Local snapshot'],[0,'Backup snapshot']],'Pilot.png']);

  await run(()=>TAUI.openAddress(TAWorkPage.href('character',0)));
  assert.equal(await run(()=>document.querySelector('[data-work-expression]').dataset.workExpression),'7');
  await click('[data-work-edit]');await click('#st-bundle summary');
  assert.ok(await run(()=>document.querySelector('#st-bundle [data-expression]').checked));
  const zip=unzipSync((await download('#st-bundle [data-zip]')).bytes);
  assert.deepEqual(Object.keys(zip).sort(),['characters/Pilot.png','characters/Pilot/Smile.png']);
  assert.deepEqual(Buffer.from(zip['characters/Pilot/Smile.png']),Buffer.from(picture,'base64'));
  assert.equal(JSON.parse(TAPng.readChara(zip['characters/Pilot.png'])).data.description,'Accepted description');

  await open('backup');await merge('Independent backup copy','copy');await open('backup');
  const split=await run(async()=>{
    const copy=TAUI.state.lib.characters.find(row=>row.backupCopyOf===0);
    const history=await TAHistory.list('characters',copy.id);
    return [TAUI.state.lib.characters.find(row=>row.id===0).description,copy.description,
      history.length,history[0]?.value.id===copy.id,!!await TALibraryDB.workBinding('characters',copy.id)];
  });
  assert.deepEqual(split,['Accepted description','Independent backup copy',1,true,false]);
  console.log('Mixed IDs merge through the real backup dialog, keep history and file bindings with their owners, and export both the card and the original expression PNG.');
});
