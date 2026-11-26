/* Compare, restore and manage snapshots for one character or world book. */
(function(root){
  'use strict';
  function mount(anchor,kind,item) {
    const ui=root.TAUI, tr=ui.t, history=root.TAHistory;
    const host=document.createElement('details');
    host.className='ws-assist-details revision-panel';
    host.innerHTML='<summary>'+ui.esc(tr('版本历史'))+'</summary><div class="paper stack"></div>';
    anchor.insertAdjacentElement('afterend',host);
    const panel=host.lastElementChild;
    const at=selector=>panel.querySelector(selector);
    const live=()=>ui.state.lib[kind].find(row=>row.id===item.id);
    const txt=key=>ui.esc(tr(key));
    const status=text=>{at('[role=status]').textContent=text;};
    const title=row=>[new Date(row.time).toLocaleString(root.TAI18n.prefs.lang),tr(row.reason),row.label].filter(Boolean).join(' · ');
    const size=bytes=>bytes<1024 ? bytes+' B' : bytes<1048576 ? (bytes/1024).toFixed(1)+' KiB' : (bytes/1048576).toFixed(1)+' MiB';
    let loaded=false, revision=0, selected=0, chosen,compared,inventory,plan;
    function compare() {
      const target=at('[data-diff]'), restore=at('[data-restore]');
      target.replaceChildren();restore.disabled=true;
      if (!chosen || !live()) return;
      compared=structuredClone(live());
      const differences=history.diff(chosen.value,compared);
      restore.disabled=!differences.length;
      if (!differences.length) {target.textContent=tr('与当前稿相同');return;}
      const format=v=>v===undefined ? '—' : typeof v==='string' ? v : JSON.stringify(v,null,2);
      for (const change of differences) {
        const section=document.createElement('details'), name=document.createElement('summary');
        name.dataset.noTranslate='';name.textContent=tr(change.path);section.append(name);
        for (const [label,value] of [['快照内容',change.before],['当前稿',change.after]]) {
          const caption=document.createElement('small'),text=document.createElement('pre');
          caption.textContent=tr(label);text.dataset.noTranslate='';text.textContent=format(value);
          section.append(caption,text);
        }
        target.append(section);
      }
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
    function resetPreview() {
      plan=null;at('[data-clean-preview]').hidden=true;
      at('[data-clean-list]').replaceChildren();
    }
    async function refresh() {
      const generation=++revision;resetPreview();
      try {
        const result=await history.inventory(kind,item.id);
        if (generation!==revision || !host.isConnected) return;
        inventory=result;
        const selector=at('[data-versions]'), rows=result.rows;
        selector.replaceChildren(...rows.map(row=>new Option(title(row),String(row.seq))));
        selector.disabled=!rows.length;
        selector.onchange=()=>select(Number(selector.value));
        at('[data-capacity]').textContent=tr('共 {n} 个快照，内容估算占用 {size}',{n:rows.length,size:size(result.bytes)});
        at('[data-limit]').value=result.limit ?? '';
        at('[data-clear-history]').disabled=!rows.length;
        status(rows.length ? '' : tr('此作品还没有快照'));
        await select(rows[0]?.seq);
      } catch(error) {status(tr(error.message));}
    }
    function preview(clear) {
      if (!inventory) return;
      const input=at('[data-limit]');
      if (!clear && !input.reportValidity()) return;
      resetPreview();
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
    host.ontoggle=()=>{
      if (!host.open) return;
      if (!loaded) {
        loaded=true;
        panel.innerHTML='<label class="field"><span>'+txt('快照备注')+'</span><input data-label maxlength="120"></label>'+
          '<div class="row"><button class="btn" data-snapshot>'+txt('保存快照')+'</button></div>'+
          '<label class="field"><span>'+txt('选择版本')+'</span><select data-versions data-no-translate></select></label>'+
          '<div data-diff class="revision-diff"></div><button class="btn" data-restore disabled>'+txt('恢复此版本')+'</button>'+
          '<details><summary>'+txt('管理此作品的快照')+'</summary><div class="stack">'+
          '<p data-capacity aria-live="polite"></p><label class="field"><span>'+txt('保留最近几份（留空不限）')+'</span>'+
          '<input type="number" min="1" step="1" data-limit></label>'+
          '<div class="row"><button class="btn" data-preview-policy>'+txt('预览保留设置')+'</button>'+
          '<button class="btn" data-clear-history>'+txt('清理此作品的全部快照')+'</button></div>'+
          '<section data-clean-preview hidden><p data-clean-count></p><ul data-clean-list></ul><p data-clean-policy></p>'+
          '<button class="btn" data-confirm-clean>'+txt('确认以上变更')+'</button></section></div></details><p role="status"></p>';
        at('[data-snapshot]').onclick=async event=>{
          const button=event.currentTarget;button.disabled=true;
          try {
            const input=at('[data-label]');
            if (ui.state.save!=='saved' && !await ui.flush()) throw new Error('资料库已变化，请重新打开。');
            await history.save(kind,live(),input.value.trim());input.value='';await refresh();status(tr('快照已保存'));
          } catch(error) {status(tr(error.message));} finally {button.disabled=false;}
        };
        at('[data-restore]').onclick=async()=>{
          const row=chosen,expected=compared;
          if (!row) return;
          const yes=await ui.ask({title:tr('恢复此版本'),body:tr('将先保存当前稿，再恢复所选版本。'),
            actions:[{id:'yes',label:tr('恢复此版本')},{id:'no',label:tr('取消')}]});
          if (yes!=='yes') return;
          try {await history.restore(row,expected);ui.renderStage();ui.toast(tr('已恢复所选版本'),{kind:'success'});}
          catch(error) {status(tr(error.message));}
        };
        at('[data-limit]').oninput=resetPreview;
        at('[data-preview-policy]').onclick=()=>preview(false);
        at('[data-clear-history]').onclick=()=>preview(true);
        at('[data-confirm-clean]').onclick=async event=>{
          if (!plan) return;
          const button=event.currentTarget;button.disabled=true;
          try {await history.clean(plan);await refresh();status(tr('快照设置已保存'));}
          catch(error) {await refresh();status(tr(error.message));} finally {button.disabled=false;}
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
  root.TAHistoryPanel={mount};
})(globalThis);
