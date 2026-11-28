/* Exercise the actual editor, route selection and downloaded ST files in an isolated Electron profile. */
const {app,BrowserWindow,session}=require('electron');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');

const profile=process.env.QUILVORI_TEST_PROFILE;
if(!profile || path.dirname(profile)!==os.tmpdir() || !path.basename(profile).startsWith('quilvori-ui-'))throw Error('An isolated test profile is required');
app.setPath('userData',profile);
app.on('window-all-closed',()=>{});
const repo=path.resolve(__dirname,'..');
const delay=ms=>new Promise(done=>setTimeout(done,ms));
const card=(id,name,body)=>({id,name,description:body,tags:[],alternate_greetings:[],expressionAssetIds:[]});
const entry=(id,comment,content,stUid)=>({id,comment,content,stUid,keys:['beacon'],secondaryKeys:[],enabled:true,position:'before_char'});
const book=(id,name,entries)=>({id,name,description:'Notes for '+name,entries});
function library(){
  return {characters:[card(101,'Alpha','First manuscript'),card(202,'Beta','Second manuscript'),card(0,'Zero','Zero manuscript'),card('0202','Leading zero','String manuscript')],
    worldBooks:[book(101,'Map One',[entry(0,'Dock','Mooring manuscript',37)]),
      book(202,'Map Two',[entry(101,'Harbour','Harbour manuscript',12),entry(0,'Beacon','Silent watch',37),entry('00202','Islet','String entry',51)]),
      book(0,'Map Zero',[entry(202,'Cove','Zero book manuscript',17)])],
    quickReplySets:[{id:'q',name:'Bound replies',workSource:{characterId:202,bookId:0,entryIds:[202]},replies:[{id:'r',label:'Route',message:'Bring the map.'}]}]};
}
async function browser(partition){
  const storage=session.fromPartition('persist:editor-selection-'+partition);
  storage.webRequest.onBeforeRequest((request,done)=>done({cancel:/^https?:/.test(request.url)}));
  const win=new BrowserWindow({show:false,webPreferences:{session:storage,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});
  const run=(fn,...args)=>win.webContents.executeJavaScript('('+fn.toString()+')(...'+JSON.stringify(args)+')',true);
  async function wait(fn,label){
    for(let i=0;i<130;i++){if(await run(fn))return;await delay(30);}
    throw Error(label+' timed out');
  }
  async function control(query,value,event){
    await run((q,v,action)=>{
      const node=document.querySelector(q);
      if(!node || node.disabled)throw Error('Unavailable control '+q);
      for(let p=node.parentElement;p;p=p.parentElement){
        if(p.tagName==='DETAILS' && !(node.tagName==='SUMMARY' && p===node.parentElement))p.open=true;
        if(p.hasAttribute('popover') && !p.matches(':popover-open'))p.showPopover();
      }
      if(action==='click')node.click();
      else{node.focus();node.value=v;node.dispatchEvent(new Event(action,{bubbles:true}));}
    },query,value,event);
  }
  const click=q=>control(q,null,'click'),input=(q,v)=>control(q,v,'input'),select=(q,v)=>control(q,String(v),'change');
  const go=route=>click('[data-nav="'+route+'"]');
  let downloadIndex=0;
  async function download(q){
    const result=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{storage.off('will-download',started);reject(Error('Download timed out for '+q));},6000);
      function started(_event,item){
        const name=item.getFilename(),file=path.join(profile,'selection-'+partition+'-'+(++downloadIndex)+path.extname(name));
        item.setSavePath(file);
        item.once('done',async(_e,status)=>{
          clearTimeout(timer);
          try{
            assert.equal(status,'completed');
            const bytes=await fs.readFile(file);
            const json=name.endsWith('.png')?await run(array=>JSON.parse(TAPng.readChara(Uint8Array.from(array))),Array.from(bytes)):JSON.parse(bytes.toString('utf8'));
            resolve({name,json});
          }catch(e){reject(e);}
        });
      }
      storage.once('will-download',started);
    });
    await click(q);return result;
  }
  async function reopen(){
    await wait(()=>TAUI.state.save==='saved','automatic save');
    const loaded=new Promise(done=>win.webContents.once('did-finish-load',done));
    win.webContents.reload();await loaded;
    await wait(()=>!!globalThis.TAUI?.state?.lib && !!document.querySelector('#stage > *'),'restart');
  }
  await win.loadFile(path.join(repo,'backup.html'));
  await wait(()=>!!globalThis.TAUI?.state.lib && !!document.querySelector('#load-backup'),'startup');
  await run(data=>{TAUI.pickFile=async()=>new File([JSON.stringify(data)],'integer-id-library.json',{type:'application/json'});},library());
  await click('#load-backup');await wait(()=>!!document.querySelector('#modal-root [data-act=replace]'),'backup confirmation');await click('#modal-root [data-act=replace]');
  await wait(()=>TAUI.state.lib.characters[0]?.name==='Alpha' && !document.querySelector('#app').inert,'restored synthetic library');
  return {win,run,wait,click,input,select,go,download,reopen};
}

async function newCharacter(c){
  await c.go('characters');await c.click('[data-act=view-edit]');
  await c.run(()=>{window.previousEditor=document.querySelector('#char-form');});await c.input('#search','Alpha');
  await c.wait(()=>!window.previousEditor.isConnected,'filtered character editor');await c.click('[data-act=new]');
  const name='#char-form [data-field=name]',text='#char-form [data-field=description]';
  const id=await c.run(()=>TAUI.state.lib.characters[0].id);
  assert.equal(await c.run(()=>TAUI.state.sel.character),id,'new character is selected despite a global filter');
  await c.input(name,'New mariner');await c.input(text,'船上手记 only for the new card');
  assert.equal((await c.download('[data-act=json]')).json.data.description,'船上手记 only for the new card');
  await c.reopen();
  assert.deepEqual(await c.run(id=>[TAUI.state.lib.characters.find(v=>v.id===id).description,TAUI.state.lib.characters.find(v=>v.id===101).description],id),
    ['船上手记 only for the new card','First manuscript']);
}
async function newEntry(c){
  await c.go('lore');await c.input('#lore-filter','Mooring');
  await c.run(()=>{window.previousEditor=document.querySelector('#lore-editor');});await c.input('#search','Mooring');
  await c.wait(()=>!window.previousEditor.isConnected,'filtered world editor');await c.click('#new-entry');
  const id=await c.run(()=>TAUI.state.lib.worldBooks[0].entries[0].id);
  assert.equal(await c.run(()=>TAUI.state.sel.entry),id,'new entry is selected despite both filters');
  assert.ok(await c.run(id=>[...document.querySelectorAll('.entry')].some(row=>row.dataset.id===id),id));
  await c.input('#lore-editor [data-field=content]','正文 only for a new entry');
  const out=Object.values((await c.download('#export-book')).json.entries);
  assert.equal(out.find(row=>row.uid===37).content,'Mooring manuscript');assert.ok(out.some(row=>row.content==='正文 only for a new entry'));
  await c.reopen();assert.equal(await c.run(id=>TAUI.state.lib.worldBooks[0].entries.find(e=>e.id===id).content,id),'正文 only for a new entry');
}
async function gallery(c){
  await c.go('characters');await c.click('[data-act=view-gallery]');await c.input('[data-gallery-search]','Beta');
  assert.deepEqual(await c.run(()=>[...document.querySelectorAll('.gallery [data-open-card]')].map(el=>el.dataset.openCard)),['202']);
  const actions=['json','png','dup','del'];
  assert.deepEqual(await c.run(actions=>actions.map(act=>document.querySelector('[data-act="'+act+'"]').disabled),actions),actions.map(()=>true),'a hidden card cannot be exported, copied or deleted');
  await c.input('[data-gallery-search]','Nobody');assert.ok(await c.run(()=>document.querySelector('[data-act=json]').disabled));
  await c.input('[data-gallery-search]','Beta');await c.click('[data-open-card="202"]');await c.click('[data-act=view-gallery]');
  assert.equal(await c.run(()=>document.querySelector('.gallery-card.on [data-open-card]')?.dataset.openCard),'202');
  for(const action of ['json','png']){
    const out=await c.download('[data-act='+action+']');assert.equal(out.json.data.name,'Beta');assert.equal(out.name,'Beta.'+action);
  }
  await c.click('[data-act=del]');assert.match(await c.run(()=>document.querySelector('#modal-root h3,#modal-root h2').textContent),/Beta/);
  await c.click('#modal-root [data-act=no]');await c.click('[data-act=dup]');
  assert.equal(await c.run(()=>TAUI.state.lib.characters[0].description),'Second manuscript');
  assert.equal(await c.run(()=>TAUI.state.lib.characters.find(v=>v.id===101).description),'First manuscript');
}
async function integerWorks(c){
  await c.go('home');await c.click('[data-collection-peek="202"][data-collection-type=character]');
  assert.equal(await c.run(()=>document.querySelector('#workspace-peek h3')?.textContent),'Beta');
  await c.click('[data-peek-open]');assert.equal(await c.run(()=>TAUI.state.sel.character),202);
  await c.click('[data-switch-card]');await c.input('.qc-picker-search input','Zero');await c.click('.qc-picker-results [data-id="0"]');
  await c.reopen();
  assert.equal(await c.run(()=>TAUI.state.sel.character),0);
  await c.input('#char-form [data-field=description]','Zero revised manuscript');
  await c.select('#attach-book',202);
  let out=await c.download('[data-act=json]');assert.equal(out.json.data.name,'Zero');assert.equal(out.json.data.character_book.name,'Map Two');
  assert.equal(await c.run(()=>TAUI.state.lib.characters.find(v=>v.id===0).embeddedBookId),202);
  await c.select('#attach-book',0);out=await c.download('[data-act=png]');assert.equal(out.json.data.character_book.name,'Map Zero');
  await c.go('home');await c.click('[data-collection-open="202"][data-collection-type=book]');
  await c.click('[data-work-edit]');
  assert.equal(await c.run(()=>TAUI.state.sel.book),202);
  await c.click('.entry[data-id="0"]');await c.reopen();assert.equal(await c.run(()=>TAUI.state.sel.entry),0);
  await c.input('#lore-editor [data-field=content]','Night sail under a new moon');await c.select('#book-select',0);
  out=await c.download('#export-book');assert.equal(out.json.name,'Map Zero');
  await c.input('#search','Night sail under');await c.click('#search-results a');
  assert.deepEqual(await c.run(()=>[TAUI.state.sel.book,TAUI.state.sel.entry,document.activeElement.dataset.field]),[202,0,'content']);
  await c.reopen();assert.deepEqual(await c.run(()=>[TAUI.state.sel.book,TAUI.state.sel.entry,document.querySelector('#lore-editor [data-field=content]')?.value]),[202,0,'Night sail under a new moon']);
  out=await c.download('#export-book');assert.equal(out.json.entries[37].content,'Night sail under a new moon');
  await c.input('#search','Zero revised manuscript');await c.click('#search-results a');
  assert.equal(await c.run(()=>TAUI.state.sel.character),0);
  await c.click('[data-switch-card]');await c.input('.qc-picker-search input','Leading zero');await c.click('.qc-picker-results [data-id="0202"]');
  assert.equal(await c.run(()=>TAUI.state.sel.character),'0202');
  assert.deepEqual(await c.run(()=>[TAUI.state.lib.characters.find(v=>v.id===0).embeddedBookId,TAUI.state.lib.quickReplySets[0].workSource]),
    [0,{characterId:202,bookId:0,entryIds:[202]}]);
}
async function references(c){
  await c.run(()=>{
    NIJANModel.configured=()=>true;
    NIJANModel.runTask=async(task,context)=>{
      if(task==='create:quick'){
        window.testQuickScope=[context.reference.card.id,context.reference.book.id,context.reference.book.entries.map(e=>e.id)];
        return {quick:{name:'New bound replies',replies:[{label:'Map',message:'Which cove?'}]}};
      }
      if(task==='edit'){
        const target=context.targets[0];
        return {changes:[{target:target.target,id:target.id,fields:{[target.fields[0]]:'Reviewed content for zero'}}]};
      }
      if(task==='organize:world'){
        return {entries:context.book.entries.map(e=>({id:e.id,category:'location',activation:'keep',reason:'A named place',evidence:e.content}))};
      }
      throw Error('Unexpected simulated request '+task);
    };
  });
  await c.go('quick');await c.select('[data-ref-card]',0);await c.select('[data-ref-world]',0);
  await c.select('[data-ref-scope]','selected');await c.click('.reply-entry-choices input[value="202"]');
  await c.input('[data-assist]','Draft a reply.');await c.click('[data-assist-go]');
  await c.wait(()=>!document.querySelector('[data-assist-preview]').hidden,'quick reply preview');
  assert.deepEqual(await c.run(()=>window.testQuickScope),[0,0,[202]]);
  await c.click('[data-assist-apply]');await c.wait(()=>TAUI.state.lib.quickReplySets.some(s=>s.name==='New bound replies'),'applied grounded reply');
  const source=await c.run(()=>TAUI.state.lib.quickReplySets.find(s=>s.name==='New bound replies').workSource);
  assert.deepEqual([source.characterId,source.bookId,source.entryIds],[0,0,[202]]);
  await c.go('lore');await c.select('#book-select',202);await c.click('.entry[data-id="0"]');await c.click('#lore-ai-edit');
  assert.deepEqual(await c.run(()=>NIJANStudio.editContext('check').targets.map(t=>t.id)),[0]);
  await c.input('#ai-instruction','Revise only the selected entry.');await c.click('#ai-revise');
  await c.wait(()=>!!document.querySelector('[data-plan] [data-apply]:not(:disabled)'),'integer entry edit preview');
  await c.click('[data-plan] [data-apply]:not(:disabled)');
  await c.wait(()=>TAUI.state.lib.worldBooks.find(b=>b.id===202).entries.find(e=>e.id===0).content==='Reviewed content for zero','applied entry zero edit');
  await c.go('lore');await c.select('#book-select',0);await c.click('.entry[data-id="202"]');await c.click('#lore-ai-organize');
  await c.click('[data-organize-generate]');await c.wait(()=>!!document.querySelector('[data-organize-apply]:not(:disabled)'),'organize integer book zero');
  await c.click('[data-organize-choice="202"]');assert.ok(await c.run(()=>document.querySelector('[data-organize-apply]').disabled));
  await c.click('[data-organize-choice="202"]');await c.click('[data-organize-apply]');
  await c.wait(()=>TAUI.state.lib.worldBooks.find(b=>b.id===0).entries[0].category==='location','confirmed selected integer entry');
  await c.click('[data-organize-close]');
  const out=(await c.download('#export-book')).json.entries[17];
  assert.equal(out.content,'Zero book manuscript');assert.equal(out.extensions.realmweave_category,'location');
}
async function sharedPickers(c){
  await c.run(async()=>{
    const lib=structuredClone(TAUI.state.lib);
    lib.quickReplySets.push({id:0,name:'Cardinal replies',replies:[{id:0,label:'North',message:'Original reply'}]});
    lib.assets.push({id:0,name:'Northern sky',kind:'background',dataUrl:''});
    await TAUI.commitLibrary(TAStore.verify(lib));
  });
  await c.go('quick');await c.click('.pick[data-id="0"]');
  await c.input('#qr-list [data-id="0"] [data-k=message]','Revised reply');
  assert.deepEqual(await c.run(()=>[TAUI.state.sel.qr,TAUI.state.lib.quickReplySets[0].replies[0].message]),[0,'Bring the map.']);
  const exported=await c.download('#export-qr');
  assert.equal(exported.json.qrList[0].message,'Revised reply');
  await c.go('assets');await c.click('.asset-card[data-id="0"]');
  assert.deepEqual(await c.run(()=>[TAUI.state.sel.asset,document.querySelector('#asset-side [data-field=name]').value]),[0,'Northern sky']);
}
async function main(){
 const failures=[];
 for(const [label,check] of Object.entries({newCharacter,newEntry,gallery,integerWorks,references,sharedPickers})){
   const c=await browser(label);
   try{await check(c);console.log('ok editor selection '+label);}
   catch(error){failures.push(label);console.error('FAILED '+label,error.stack);}
   finally{c.win.destroy();}
 }
 if(failures.length)throw Error('Editor selection failures: '+failures.join(', '));
}
app.whenReady().then(main).then(()=>app.exit(0),error=>{console.error(error);app.exit(1);});
