/* Compare and restore only the item open in the editor. */
(function (root) {
  'use strict';
  function mount(anchor, kind, item) {
    const ui = root.TAUI, tr = ui.t;
    const host = document.createElement('details');
    host.className = 'ws-assist-details revision-panel';
    host.innerHTML = '<summary>'+ui.esc(tr('版本历史'))+'</summary><div class="paper stack"></div>';
    anchor.insertAdjacentElement('afterend',host);
    const panel = host.lastElementChild;
    const live = () => ui.state.lib[kind].find(row=>row.id===item.id);
    let loaded = false, revision = 0, chosen, compared;
    function status(text) { panel.querySelector('[role=status]').textContent = text; }
    function compare() {
      const target = panel.querySelector('[data-diff]');
      target.replaceChildren();
      if (!chosen || !live()) return;
      compared = structuredClone(live());
      const differences = root.TAHistory.diff(chosen.value,compared);
      panel.querySelector('[data-restore]').disabled = !differences.length;
      if (!differences.length) { target.textContent = tr('与当前稿相同'); return; }
      const format = v => v === undefined ? '—' : typeof v === 'string' ? v : JSON.stringify(v,null,2);
      for (const change of differences) {
        const section = document.createElement('details'), title = document.createElement('summary');
        title.dataset.noTranslate = ''; title.textContent = tr(change.path); section.append(title);
        for (const [label,value] of [['快照内容',change.before],['当前稿',change.after]]) {
          const caption = document.createElement('small'), text = document.createElement('pre');
          caption.textContent = tr(label); text.dataset.noTranslate = ''; text.textContent = format(value);
          section.append(caption,text);
        }
        target.append(section);
      }
    }
    async function refresh() {
      const version = ++revision;
      try {
        const rows = await root.TAHistory.list(kind,item.id);
        if (version !== revision || !host.isConnected) return;
        const selector = panel.querySelector('[data-versions]');
        selector.replaceChildren(...rows.map(row => {
          const date = new Date(row.time).toLocaleString(root.TAI18n.prefs.lang);
          return new Option([date,tr(row.reason),row.label].filter(Boolean).join(' · '),String(row.seq));
        }));
        chosen = rows[0]; selector.disabled = !rows.length;
        panel.querySelector('[data-restore]').disabled = !rows.length;
        selector.onchange = () => { chosen = rows.find(row=>String(row.seq)===selector.value); compare(); };
        status(rows.length ? '' : tr('此作品还没有快照'));
        compare();
      } catch (error) { status(tr(error.message)); }
    }
    host.ontoggle = () => {
      if (!host.open) return;
      if (!loaded) {
        loaded = true;
        panel.innerHTML = '<label class="field"><span>'+ui.esc(tr('快照备注'))+'</span><input data-label maxlength="120"></label><div class="row"><button class="btn" data-snapshot>'+ui.esc(tr('保存快照'))+'</button></div><label class="field"><span>'+ui.esc(tr('选择版本'))+'</span><select data-versions data-no-translate></select></label><div data-diff class="revision-diff"></div><button class="btn" data-restore disabled>'+ui.esc(tr('恢复此版本'))+'</button><p role="status"></p>';
        panel.querySelector('[data-snapshot]').onclick = async event => {
          const button = event.currentTarget; button.disabled = true;
          try {
            const input = panel.querySelector('[data-label]');
            await root.TAHistory.save(kind,live(),input.value.trim());
            input.value=''; await refresh(); status(tr('快照已保存'));
          } catch (error) { status(tr(error.message)); } finally { button.disabled = false; }
        };
        panel.querySelector('[data-restore]').onclick = async () => {
          const row = chosen, expected = compared;
          const yes = await ui.ask({title:tr('恢复此版本'),body:tr('将先保存当前稿，再恢复所选版本。'),actions:[{id:'yes',label:tr('恢复此版本')},{id:'no',label:tr('取消')}]});
          if (yes !== 'yes') return;
          try {
            await root.TAHistory.restore(row,expected);
            ui.renderStage(); ui.toast(tr('已恢复所选版本'),{kind:'success'});
          } catch (error) { status(tr(error.message)); }
        };
      }
      refresh();
    };
    const editor = anchor.closest('#stage');
    editor?.addEventListener('input', () => { if (host.open && chosen) compare(); });
  }
  root.TAHistoryPanel = {mount};
})(globalThis);
