/* Snapshot contents load on selection. Management views only need the indexed summaries. */
(function(root){
  'use strict';
  const ui=()=>root.TAUI, tr=(key,vars)=>ui().t(key,vars), txt=key=>ui().esc(tr(key));
  const title=row=>[new Date(row.time).toLocaleString(root.TAI18n.prefs.lang),tr(row.reason),row.label].filter(Boolean).join(' · ');
  function size(bytes) {
    if (bytes<1024) return bytes+' B';
    return bytes<1048576 ? (bytes/1024).toFixed(1)+' KiB' : (bytes/1048576).toFixed(1)+' MiB';
  }

  async function confirmRestore(row,expected) {
    const {lib,replyReference}=ui().state;
    const {missing,blocked}=root.TAWorkRestore.snapshotReview(lib,row.kind,row.value,expected,replyReference);
    if(blocked)throw new Error(blocked);
    const content=document.createElement('div'),choices=new Map();
    content.className='integrity-content';
    let submit;
    const validate=()=>{if(submit)submit.disabled=choices.size!==missing.length;};
    if(missing.length){
      const note=document.createElement('p');note.textContent=tr('history.missingLinks');content.append(note);
    }
    function itemLabel(item) {
      return (item.name || tr('未命名'))+' · '+tr('workPage.libraryId',{id:item.id});
    }
    for(const link of missing){
      const field=document.createElement('label'),label=document.createElement('span'),select=document.createElement('select');
      field.className='field';label.className='field-label';label.dataset.noTranslate='';
      label.textContent=tr(link.role)+' · '+tr('workPage.libraryId',{id:link.id});
      select.dataset.historyLink=link.key;
      const rows=lib[link.bucket];
      if(link.currentIds.length){
        const kept=link.currentIds.slice(0,3).map(id=>itemLabel(root.TAStore.byId(rows,id)));
        const extra=link.currentIds.length-kept.length;
        const option=new Option(tr('history.keepLink')+' · '+kept.join(', ')+(extra?' (+'+extra+')':''),'keep');
        option.dataset.noTranslate='';
        select.add(option);
      }
      select.add(new Option(tr('history.unlink'),'unlink'));
      if(rows.length)select.add(new Option(tr('history.replaceLink'),'replace'));
      const picker=document.createElement('select');
      picker.setAttribute('aria-label',tr('history.replaceLink')+' · '+label.textContent);
      picker.dataset.historyReplacement=link.key;picker.hidden=true;picker.dataset.noTranslate='';
      field.append(label,select);content.append(field,picker);
      function read(){
        if(select.value==='keep')choices.set(link.key,{mode:'keep',ids:link.currentIds});
        else if(select.value==='unlink')choices.set(link.key,{mode:'unlink'});
        else if(picker.value!=='')choices.set(link.key,{mode:'replace',id:picker.value});
        else choices.delete(link.key);
        validate();
      }
      select.onchange=()=>{
        picker.hidden=select.value!=='replace';
        if(!picker.hidden && !picker.options.length){
          picker.add(new Option(tr('history.chooseLink'),''));
          for(const item of rows)picker.add(new Option(itemLabel(item),String(item.id)));
        }
        read();
      };
      picker.onchange=read;read();
    }
    const answer=ui().ask({title:tr('恢复此版本'),body:tr('将先保存当前稿，再恢复所选版本。'),content,
      actions:[{id:'yes',label:tr('恢复此版本')},{id:'no',label:tr('取消')}]});
    submit=content.closest('.modal')?.querySelector('[data-act=yes]');validate();
    return await answer==='yes'?choices:null;
  }

  function mountRetention(panel,status,refresh) {
    const history=root.TAHistory, at=selector=>panel.querySelector(selector);
    let inventory=null,plan=null;
    panel.innerHTML='<p data-capacity aria-live="polite"></p><label class="field"><span>'+txt('保留最近几份（留空不限）')+'</span>'+
      '<input type="number" min="1" step="1" data-limit></label><div class="row">'+
      '<button type="button" class="btn" data-preview-policy>'+txt('预览保留设置')+'</button>'+
      '<button type="button" class="btn" data-clear-history>'+txt('清理此作品的全部快照')+'</button></div>'+
      '<section data-clean-preview hidden><p data-clean-count></p><ul data-clean-list></ul><p data-clean-policy></p>'+
      '<button type="button" class="btn" data-confirm-clean>'+txt('确认以上变更')+'</button></section>';
    function reset() {
      plan=null;at('[data-clean-preview]').hidden=true;
      at('[data-clean-list]').replaceChildren();
    }
    function preview(clear) {
      if (!inventory) return;
      const input=at('[data-limit]');
      if (!clear && !input.reportValidity()) return;
      reset();
      try {
        plan=history.cleanupPlan(inventory,input.value==='' ? null : Number(input.value),clear);
        const list=at('[data-clean-list]'),expired=new Set(plan.remove);
        for (const row of inventory.rows.filter(row=>expired.has(row.seq))) {
          const li=document.createElement('li');
          li.dataset.noTranslate='';li.textContent=title(row)+' · '+size(row.bytes);list.append(li);
        }
        at('[data-clean-count]').textContent=expired.size ? tr('将删除 {n} 个快照，约 {size}',{n:expired.size,size:size(plan.bytes)})
          : tr('现有快照全部保留');
        at('[data-clean-policy]').textContent=plan.limit===null ? tr('此作品的快照数量不限。')
          : tr('今后为此作品保留最近 {n} 份，超过数量时自动清理最早的快照。',{n:plan.limit});
        at('[data-clean-preview]').hidden=false;
      } catch(error) {status(tr(error.message));}
    }
    at('[data-limit]').oninput=reset;
    at('[data-preview-policy]').onclick=()=>preview(false);
    at('[data-clear-history]').onclick=()=>preview(true);
    at('[data-confirm-clean]').onclick=async event=>{
      if (!plan) return;
      const button=event.currentTarget;button.disabled=true;
      try {await history.clean(plan);await refresh();status(tr('快照设置已保存'));}
      catch(error) {await refresh();status(tr(error.message));} finally {button.disabled=false;}
    };
    return source=>{
      reset();inventory=source;panel.hidden=!source;
      if (!source) return;
      at('[data-capacity]').textContent=tr('共 {n} 个快照，内容估算占用 {size}',{n:source.rows.length,size:size(source.bytes)});
      at('[data-limit]').value=source.limit ?? '';
      at('[data-clear-history]').disabled=!source.rows.length;
    };
  }

  function mountOverview(stage) {
    if (!root.TALibraryDB.database()) return;
    const box=document.createElement('details');box.className='paper revision-storage';
    box.innerHTML='<summary>'+txt('全库快照占用')+'</summary><div class="stack"><p data-total aria-live="polite"></p>'+
      '<label class="field"><span>'+txt('选择作品')+'</span><select data-history-work data-no-translate></select></label>'+
      '<div class="stack" data-manage hidden></div><p role="status"></p></div>';
    stage.append(box);
    const select=box.querySelector('[data-history-work]'),status=text=>{box.querySelector('[role=status]').textContent=text;};
    let generation=0,applyManagement,works=[];
    async function selectWork() {
      const selected=++generation,work=works.find(row=>row.entity===select.value);
      applyManagement(null);
      if (!work) return;
      try {
        const inventory=await root.TAHistory.inventory(work.kind,work.id);
        if(selected===generation && box.isConnected)applyManagement(inventory);
      } catch(error) {if(selected===generation)status(tr(error.message));}
    }
    async function refresh() {
      const current=++generation,prior=select.value;
      try {
        const result=await root.TAHistory.overview();
        if(current!==generation || !box.isConnected)return;
        works=result.works;
        box.querySelector('[data-total]').textContent=tr('共 {n} 个快照，内容估算占用 {size}',{n:result.count,size:size(result.bytes)});
        select.replaceChildren(...works.map(work=>{
          const item=ui().state.lib[work.kind]?.find(row=>row.id===work.id);
          const name=item?.name || work.name || String(work.id);
          const label=[tr(work.kind==='characters'?'角色卡':'世界书'),name,!item?tr('已移除的作品'):'',size(work.bytes)].filter(Boolean).join(' · ');
          return new Option(label,work.entity);
        }));
        select.disabled=!works.length;
        if(works.some(row=>row.entity===prior))select.value=prior;
        await selectWork();
      } catch(error) {if(current===generation)status(tr(error.message));}
    }
    select.onchange=selectWork;
    box.ontoggle=()=>{
      if(!box.open)return;
      applyManagement ||= mountRetention(box.querySelector('[data-manage]'),status,refresh);
      refresh();
    };
  }

  function mount(anchor,kind,item) {
    const history=root.TAHistory, host=document.createElement('details');
    host.className='ws-assist-details revision-panel';
    host.innerHTML='<summary>'+txt('版本历史')+'</summary><div class="paper stack"></div>';
    anchor.insertAdjacentElement('afterend',host);
    const panel=host.lastElementChild, at=selector=>panel.querySelector(selector);
    const live=()=>ui().state.lib[kind].find(row=>row.id===item.id);
    const status=text=>{at('[role=status]').textContent=text;};
    let applyManagement, revision=0, selected=0, chosen,compared,shownOperation;
    function appendDifferences(target,changes,labels) {
      const format=v=>v===undefined ? '—' : typeof v==='string' ? v : JSON.stringify(v,null,2);
      for (const change of changes) {
        const section=document.createElement('details'),name=document.createElement('summary');
        name.dataset.noTranslate='';
        name.textContent=(change.side==='file'?tr('sync.file')+' · ':'')+String(change.path);
        section.append(name);
        for (const [index,value] of [change.before,change.after].entries()) {
          const caption=document.createElement('small'),text=document.createElement('pre');
          caption.textContent=tr(labels[index]);text.dataset.noTranslate='';text.textContent=format(value);
          section.append(caption,text);
        }
        target.append(section);
      }
    }
    function compare() {
      const target=at('[data-diff]'),restore=at('[data-restore]');
      if(shownOperation!==chosen){
        const operation=at('[data-operation]'),details=operation.lastElementChild;
        shownOperation=chosen;operation.open=false;operation.hidden=!chosen?.operationChanges?.length;
        details.replaceChildren();
        operation.ontoggle=()=>{
          if(operation.open && chosen && !details.childElementCount)appendDifferences(details,chosen.operationChanges || [],['修改前','修改后']);
        };
      }
      target.replaceChildren();restore.disabled=true;
      if (!chosen || !live()) return;
      compared=structuredClone(live());
      const differences=history.diff(chosen.value,compared);
      if (!differences.length) {
        const {missing}=root.TAWorkRestore.snapshotReview(ui().state.lib,kind,chosen.value,compared);
        restore.disabled=!missing.length;
        target.textContent=tr(missing.length?'history.missingLinks':'与当前稿相同');
        return;
      }
      restore.disabled=false;
      appendDifferences(target,differences,['快照内容','当前稿']);
    }
    async function select(seq) {
      const which=++selected;
      chosen=null;compare();
      if (!seq) return;
      try {
        const row=await history.get(seq);
        if (which!==selected || !host.isConnected) return;
        if (!row) {await refresh();return;}
        chosen=row;compare();
      } catch(error) {status(tr(error.message));}
    }
    async function refresh() {
      const generation=++revision;
      try {
        const inventory=await history.inventory(kind,item.id),rows=inventory.rows;
        const latest=rows.length ? await history.get(rows[0].seq) : null;
        if (generation!==revision || !host.isConnected) return;
        ++selected;chosen=latest;compare();
        const selector=at('[data-versions]');
        selector.replaceChildren(...rows.map(row=>new Option(title(row),String(row.seq))));
        selector.disabled=!rows.length;selector.onchange=()=>select(Number(selector.value));
        applyManagement(inventory);status(rows.length?'':tr('此作品还没有快照'));
      } catch(error) {status(tr(error.message));}
    }
    host.ontoggle=()=>{
      if (!host.open) return;
      if (!applyManagement) {
        panel.innerHTML='<label class="field"><span>'+txt('快照备注')+'</span><input data-label maxlength="120"></label>'+
          '<div class="row"><button type="button" class="btn" data-snapshot>'+txt('保存快照')+'</button></div>'+
          '<label class="field"><span>'+txt('选择版本')+'</span><select data-versions data-no-translate></select></label>'+
          '<details data-operation hidden><summary>'+txt('这次操作的改动')+'</summary><div class="revision-diff"></div></details>'+
          '<div data-diff class="revision-diff"></div><button type="button" class="btn" data-restore disabled>'+txt('恢复此版本')+'</button>'+
          '<details><summary>'+txt('管理此作品的快照')+'</summary><div class="stack" data-manage></div></details><p role="status"></p>';
        applyManagement=mountRetention(at('[data-manage]'),status,refresh);
        at('[data-snapshot]').onclick=async event=>{
          const button=event.currentTarget;button.disabled=true;
          try {
            const input=at('[data-label]');
            if (ui().state.save!=='saved' && !await ui().flush()) throw new Error('资料库已变化，请重新打开。');
            await history.save(kind,live(),input.value.trim());input.value='';await refresh();status(tr('快照已保存'));
          } catch(error) {status(tr(error.message));} finally {button.disabled=false;}
        };
        at('[data-restore]').onclick=async()=>{
          const row=chosen,expected=compared;
          if (!row) return;
          try {
            const choices=await confirmRestore(row,expected);
            if(!choices)return;
            if(!host.isConnected || chosen!==row)throw new Error('资料库已变化，请重新打开。');
            await history.restore(row,expected,choices);
            ui().renderStage();ui().toast(tr('已恢复所选版本'),{kind:'success'});
          }
          catch(error) {
            if(host.isConnected)status(tr(error.message));
            else ui().toast(tr(error.message),{kind:'warning'});
          }
        };
        const editor=host.closest('#stage');
        const edited=event=>{
          if (!host.isConnected) {editor.removeEventListener('input',edited);return;}
          if (host.open && chosen && !host.contains(event.target)) compare();
        };
        editor?.addEventListener('input',edited);
      }
      refresh();
    };
  }
  root.TAHistoryPanel={mount,mountOverview};
})(globalThis);
