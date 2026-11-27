import assert from 'node:assert/strict';

const workName='Harbor cartographer';
const freshText='Draws quiet harbors at high tide.';
const archivedText='An earlier map of the western pier.';

async function showOutcomes({read,click,waitFor}) {
  await click('[data-nav="studio"]');
  await waitFor('.ai-task-log');
  await read(()=>{document.querySelector('.ai-task-log').open=true;});
  await waitFor('[data-work-outcome="character"]');
}

export async function generateAndRestore({read,click,edit,waitFor,until}) {
  await click('[data-nav="studio"]');
  await waitFor('[data-mode="create"]');
  await click('[data-mode="create"]');
  await click('#ai-create-new');
  await edit('#ai-brief','Write a cartographer and a tide table.');
  await read(async(name,description)=>{
    for(const input of document.querySelectorAll('[data-module]')){
      if(input.checked!==['character','world'].includes(input.dataset.module))input.click();
    }
    NIJANModel.save({baseUrl:'https://package-fixture.invalid/v1',protocol:'chat'});
    await NIJANModel.flushCredentials();
    const fetchOriginal=window.fetch;
    window.restorePackageFetch=()=>{window.fetch=fetchOriginal;};
    window.packageModelRequests=0;
    window.fetch=async url=>{
      if(url!=='https://package-fixture.invalid/v1/chat/completions' || ++window.packageModelRequests!==1)throw Error('Unexpected fixture request');
      const content=JSON.stringify([{character:{name,description}},{world:{name:'Tide table',entries:[{comment:'Missing content'}]}}]);
      return Response.json({choices:[{message:{content}}]});
    };
  },workName,freshText);
  try {
    await click('#ai-create');
    await until(()=>read(name=>!NIJANStudio.running() && TAStudioDrafts.pending().some(row=>row.plan.operations[0].value.name===name),workName),'saved partial generation');
    await read(()=>{document.querySelector('.ai-task-log').open=true;});
    await waitFor('[data-outcome-open="character"]');
    assert.deepEqual(await read(()=>[...document.querySelectorAll('[data-work-outcome]')].map(el=>[el.dataset.workOutcome,el.dataset.outcomeState])),
      [['character','draft'],['world','attention']]);
    await click('[data-outcome-open="character"]');
    await read(name=>{
      const plan=[...document.querySelectorAll('[data-plan]')].find(el=>el.textContent.includes(name));
      if(!plan?.querySelector('[data-apply]'))throw Error('The tracked draft could not be opened');
      plan.querySelector('[data-apply]').click();
    },workName);
    await until(()=>read(name=>TAUI.state.lib.characters.some(card=>card.name===name),workName),'adopted tracked work');
    assert.equal(await read(()=>window.packageModelRequests),1);
  } finally {await read(()=>window.restorePackageFetch());}

  await click('[data-nav="backup"]');
  await waitFor('#restore-work');
  await read((name,description)=>{
    const card=TAUI.state.lib.characters.find(item=>item.name===name);
    const source=TAStore.emptyLibrary();
    source.characters=[{...structuredClone(card),description}];
    const backup=TAFormats.backupOf(source);
    const nativePicker=TAUI.pickFile;
    TAUI.pickFile=async()=>{
      TAUI.pickFile=nativePicker;
      return new File([JSON.stringify(backup)],'sample-archive.json',{type:'application/json'});
    };
  },workName,archivedText);
  await click('#restore-work');
  await waitFor('[data-restore-mode]');
  assert.equal(await read(()=>document.querySelector('[data-restore-mode]').value),'copy');
  await click('#modal-root [data-act="restore-work"]');
  await waitFor('[data-open-restored-work]');
  await click('[data-open-restored-work]');
  await until(()=>read(text=>TAUI.state.lib.characters.find(card=>card.id===TAUI.state.sel.character)?.description===text,archivedText),'opened archived copy');
  assert.equal(await read(()=>TAUI.flush()),true);
  await click('[data-nav="home"]');
}

export async function verifyWorkDestinations({read,click,waitFor,until}) {
  await showOutcomes({read,click,waitFor});
  assert.deepEqual(await read(()=>[...document.querySelectorAll('[data-work-outcome]')].map(el=>[el.dataset.workOutcome,el.dataset.outcomeState])),
    [['character','adopted'],['world','attention']]);
  await click('[data-outcome-open="character"]');
  await until(()=>read(()=>TAUI.state.route==='characters'),'reopened the adopted character');
  const result=await read(name=>{
    const cards=TAUI.state.lib.characters.filter(card=>card.name===name);
    return {count:cards.length,opened:cards.find(card=>card.id===TAUI.state.sel.character)?.description,
      matchingCopy:cards.some(card=>card.backupCopyOf===TAUI.state.sel.character)};
  },workName);
  assert.deepEqual(result,{count:2,opened:freshText,matchingCopy:true});
}
