/* Persist accepted model output while the author decides whether to add it to the library. */
(function (root) {
  'use strict';
  const rows=new Map();
  const kinds={'create:character':'characters','create:world':'worldBooks'};
  const keyFor=plan=>plan.batchId+'|'+plan.task;
  const isWork=plan=>!!(plan && Object.hasOwn(kinds,plan.task) && plan.batchId);
  let ready=false, generation=0;
  function itemOperation(plan){
    return Array.isArray(plan.operations) && plan.operations.find(op=>op?.kind==='add' && op.path?.[0]===kinds[plan.task] &&
      (typeof op.value?.id==='string' && op.value.id.trim() || Number.isSafeInteger(op.value?.id)));
  }
  function pending(){
    const lib=root.TAUI.state.lib;
    return [...rows.values()].filter(({plan})=>{
      const op=itemOperation(plan);
      return op && !lib[kinds[plan.task]].some(item=>item.id===op.value.id);
    }).sort((a,b)=>b.time-a.time);
  }
  function changed(){
    root.dispatchEvent(new Event('quilvori-drafts'));
  }
  function replace(list,epoch){
    generation=epoch??0;
    rows.clear();
    let invalid=false;
    for(const row of list){
      if(!isWork(row?.plan) || !itemOperation(row.plan) || row.id!==keyFor(row.plan)){invalid=true;continue;}
      row.plan.draftRevision=row.revision;
      rows.set(row.id,row);
    }
    ready=true;
    if(invalid)throw new Error('本机草稿暂时无法读取，仍可打开已收录作品。');
  }
  async function load(db){
    if(!db){ready=true;return;}
    const tx=db.transaction(['drafts','library']);
    const read=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
    const [list,epoch]=await Promise.all([read(tx.objectStore('drafts').getAll()),read(tx.objectStore('library').get('creationEpoch'))]);
    replace(list,epoch);
  }
  const revisionOf = row => row?.revision ?? null;
  function updateFor(plan,remove=false){
    const id=keyFor(plan), expected=plan.draftRevision ?? null;
    if(remove)return {id,expected,row:null};
    const revision=root.TAStore.uid('draftrev'),copy=structuredClone(plan);
    copy.draftRevision=revision;
    delete copy.draftSaveError;
    return {id,expected,row:{id,revision,time:Date.now(),plan:copy}};
  }
  // Also used inside the transaction that moves a generated work into or out of the library.
  function writeTo(store,change,abort){
    const get=store.get(change.id);
    get.onsuccess=()=>{
      if(revisionOf(get.result)!==change.expected){
        abort(new Error('草稿已在另一窗口更新，请重新打开。'));
      }else if(change.row)store.put(change.row);
      else store.delete(change.id);
    };
  }
  function committed(change){
    if(!change)return;
    if(change.row)rows.set(change.id,change.row);
    else rows.delete(change.id);
    changed();
  }
  async function write(change,guardLibrary=false){
    const db=root.TALibraryDB.database();
    if(!db)throw new Error('草稿存储不可用');
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(['drafts','library'],'readwrite'),expected=generation;
      let failure;
      const control=tx.objectStore('library');
      const head=guardLibrary?control.get('current'):null,expectedHead=guardLibrary?root.TALibraryDB.revision():null;
      const epoch=control.get('creationEpoch');
      epoch.onsuccess=()=>{
        if((epoch.result??0)!==expected || (head && (head.result?.seq??0)!==expectedHead)){
          failure=new Error('草稿已在另一窗口更新，请重新打开。');tx.abort();return;
        }
        root.TALibraryDB.touchWork(tx);
        writeTo(tx.objectStore('drafts'),change,error=>{failure=error;tx.abort();});
      };
      tx.oncomplete=resolve;
      tx.onabort=()=>reject(failure || tx.error || new Error('草稿存储不可用'));
    });
    committed(change);
  }
  async function keep(plan,guardLibrary=false){
    if(!isWork(plan) || !itemOperation(plan) || itemOperation(plan).applied)return;
    const change=updateFor(plan);
    await write(change,guardLibrary);
    plan.draftRevision=change.row.revision;
    delete plan.draftSaveError;
  }
  async function importSession(plans,library){
    let migrated=false;
    for(const plan of plans){
      if(!isWork(plan) || Object.hasOwn(plan,'draftRevision') || plan.draftSaveError)continue;
      const op=itemOperation(plan);
      if(!op || op.applied || library[kinds[plan.task]].some(item=>item.id===op.value.id))continue;
      const known=rows.get(keyFor(plan));
      if(known){
        plan.draftRevision=known.revision;
      }else{
        try{await keep(plan);}catch(error){plan.draftSaveError=error.message;}
      }
      migrated=true;
    }
    return migrated;
  }
  function onAdopt(plan,receipt){
    if(!isWork(plan) || !root.TALibraryDB.database() || !receipt.operations.some(op=>op.key===itemOperation(plan)?.key))return null;
    return updateFor(plan,true);
  }
  function onUndo(plan){
    if(!isWork(plan) || !root.TALibraryDB.database())return null;
    return updateFor({...plan,draftRevision:null});
  }
  async function discard(plan){
    if(!isWork(plan) || !root.TALibraryDB.database() || itemOperation(plan)?.applied)return;
    await write(updateFor(plan,true));
  }
  function rehydrate(plans){
    const saved=[...rows.values()].sort((a,b)=>a.time-b.time);
    const keys=new Set(saved.map(row=>row.id));
    const merged=plans.filter(plan=>!isWork(plan) || (!keys.has(keyFor(plan)) && (
      !plan.draftRevision || plan.draftSaveError || itemOperation(plan)?.applied || libraryItem(plan)
    )));
    for(const row of saved){
      const plan=structuredClone(row.plan),op=itemOperation(plan);
      if(op && libraryItem(plan))op.applied=true;
      merged.push(plan);
    }
    return merged;
  }
  function findSaved(batchId,kind){
    return rows.get(batchId+'|create:'+kind)?.plan;
  }
  function reset(){rows.clear();generation=root.TALibraryDB?.clearEpoch()??0;changed();}
  function libraryItem(plan){
    if(!isWork(plan))return null;
    const op=itemOperation(plan);
    return op && root.TAUI.state.lib[kinds[plan.task]].find(row=>row.id===op.value.id);
  }
  function openWork(plan){
    const item=libraryItem(plan);
    if(!item)return;
    root.TASearch.open({kind:plan.task==='create:character'?'character':'book',id:item.id,selectOnly:true,field:'name'});
  }
  function delivery(plan){
    if(!isWork(plan))return '';
    const ui=root.TAUI,esc=ui.esc;
    const item=libraryItem(plan);
    if(!item && itemOperation(plan)?.applied)return '';
    const saved=rows.get(keyFor(plan));
    let text='待收录';
    if(item)text='已收入作品库';
    else if(plan.draftSaveError)text=plan.draftSaveError==='草稿已在另一窗口更新，请重新打开。'?plan.draftSaveError:'本机草稿未能保存，本次生成内容仍可在预览中收录。';
    else if(saved?.plan.id===plan.id)text='已保存到本机草稿';
    const name=item?.name || itemOperation(plan)?.value?.name || '';
    return '<div class="draft-delivery"><strong>'+esc(ui.t(text))+'</strong><span data-no-translate>'+esc(name)+'</span>'+
      (item?'<button type="button" class="btn btn-small" data-open-delivery="'+esc(plan.id)+'">'+esc(ui.t('打开已收录作品'))+'</button>':'')+'</div>';
  }
  function mount(stage,kind){
    const ui=root.TAUI, projectPlans=()=>pending().map(row=>row.plan).filter(plan=>!kind||plan.task==='create:'+kind);
    const box=document.createElement('details');box.className='paper studio-draft-shelf';box.dataset.draftShelf=kind||'all';
    let visible=3;
    const draw=()=>{
      const drafts=projectPlans();
      box.hidden=!drafts.length;
      const summary=document.createElement('summary');summary.textContent=ui.t('AI 待收录草稿')+' · '+drafts.length;
      const list=document.createElement('div');list.className='draft-shelf-list';
      drafts.slice(0,visible).forEach(plan=>{
        const row=document.createElement('div');row.className='row';
        const name=document.createElement('strong');name.dataset.noTranslate='';name.textContent=itemOperation(plan)?.value.name || ui.t('未命名');
        const btn=document.createElement('button');btn.type='button';btn.className='btn btn-small';btn.textContent=ui.t('查看草稿');btn.dataset.openDraft=plan.id;
        btn.onclick=()=>root.NIJANStudio.openDraft(plan.id);
        row.append(name,btn);list.append(row);
      });
      if(drafts.length>visible){
        const more=document.createElement('button');more.type='button';more.className='btn btn-small';more.textContent=ui.t('显示更多');
        more.onclick=()=>{const firstNew=visible;visible+=8;draw();box.querySelectorAll('[data-open-draft]')[firstNew]?.focus();};
        list.append(more);
      }
      box.replaceChildren(summary,list);
      if(drafts.length && !box.dataset.seen){box.open=true;box.dataset.seen='1';}
    };
    const anchor=stage.querySelector('.collection-heading,.toolbar,.dropwell');
    if(anchor)anchor.after(box);else stage.prepend(box);
    draw();
    return draw;
  }
  root.TAStudioDrafts={load,replace,keep,importSession,discard,findSaved,rehydrate,pending,onAdopt,onUndo,writeTo,committed,ready:()=>ready,isWork,libraryItem,openWork,reset,mount,delivery};
})(globalThis);
