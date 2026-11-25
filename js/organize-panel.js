/* Dedicated organize controls share the configured model and atomic AI proposals. */
(function (root) {
  'use strict';
  const UI = () => root.TAUI, AI = () => root.NIJANAI, O = () => root.NIJANOrganize;
  const tr = (key, vars) => UI().t(key, vars), esc = (value) => UI().esc(value);
  const sessions = new Map();
  let active = null, previousFocus = null;
  const host = () => document.getElementById('modal-root');
  const category = (value) => tr(O().CATEGORIES[value] || '未分类');
  const fieldName = (value) => tr(AI().CARD_FIELDS[value] || { category: '分类', comment: '条目名', keys: '主关键词', constant: '常驻方式' }[value] || value);
  const display = (value, field) => field === 'constant' ? tr(value ? '常驻' : '关键词触发') : field === 'category' ? category(value) : Array.isArray(value) ? value.join('、') || tr('留白') : value || tr('留白');
  function close() {
    // Closing the sheet detaches its controls. The selected work owns its request.
    active = null; host().classList.remove('show'); host().innerHTML = ''; host().onclick = null;
    document.removeEventListener('keydown', keyboard, true);
    if (previousFocus?.isConnected) previousFocus.focus();
  }
  function keyboard(event) {
    if (!active) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key !== 'Tab') return;
    const elements = [...host().querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary')].filter((item) => item.getClientRects().length);
    const first = elements[0], last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
  function worldEntries(session) {
    const book = UI().state.lib.worldBooks.find((item) => item.id === session.bookId);
    if (!book) throw new Error(tr('世界书已不存在，请重新选择。'));
    const entries = book.entries.filter((entry) => session.scope === 'current' ? entry.id === session.entryId : session.scope === 'attention' ? O().unnamed(entry.comment) || (!entry.constant && !(entry.keys || []).length) : true);
    if (!entries.length) throw new Error(tr('这个范围内没有需要整理的条目。'));
    return { id: book.id, name: book.name, entries: entries.map(O().entryInput), scope: { mode: 'selected_entries', totalEntries: book.entries.length, entryIds: entries.map((entry) => entry.id) } };
  }
  function makeContext(session) {
    if (session.kind === 'character') {
      const card = UI().state.lib.characters.find((item) => item.id === session.cardId);
      if (!card) throw new Error(tr('先有一张角色卡'));
      return { card: O().cardInput(card), fields: O().FIELDS.slice(), instruction: session.instruction.trim() };
    }
    return { book: worldEntries(session), options: { renameAll: session.renameAll, keywords: session.keywords, changeActivation: session.changeActivation }, instruction: session.instruction.trim() };
  }
  function selectedPlan(session) {
    if (!session.result || session.applied) return null;
    const result = session.kind === 'character' ? { moves: session.result.moves.filter((_, index) => session.selected.has(String(index))) } : { entries: session.result.entries.filter((entry) => session.selected.has(entry.id)) };
    return AI().proposal(UI().state.lib, session.task, result, session.context);
  }
  async function generate(session) {
    if (session.busy) return;
    if (!root.NIJANModel.configured()) { session.status = tr('先在设置里连接模型，并选一个。'); render(); return; }
    try { session.context = makeContext(session); }
    catch (error) { session.status = error.message; render(); return; }
    session.busy = true; session.error = false; session.result = null; session.plan = null; session.applied = false;
    session.status = tr('正在整理，原稿还没有改动。'); const controller = new AbortController(); session.controller = controller; render();
    try {
      const result = await root.NIJANModel.runTask(session.task, session.context, { label: session.kind === 'character' ? tr('角色卡整理分栏') : tr('世界书条目整理'), signal: controller.signal });
      if (controller.signal.aborted || session.controller !== controller) return;
      session.result = result;
      session.selected = new Set(session.kind === 'character' ? result.moves.map((_, index) => String(index)) : result.entries.map((entry) => entry.id));
      session.plan = selectedPlan(session);
      session.status = tr(session.plan.operations.length ? '建议已备好。先核对预览，再决定应用哪些。' : '没有需要调整的内容，原稿保持原样。');
    } catch (error) {
      if (controller.signal.aborted || session.controller !== controller) return;
      session.result = null; session.plan = null; session.error = true; session.status = tr(error.message);
    } finally { if (session.controller === controller) { session.busy = false; if (active === session) render(); } }
  }
  async function apply(session) {
    try {
      const plan = selectedPlan(session);
      if (!plan?.operations.length) return;
      const receipt = await root.TAHistory.apply(plan);
      session.receipt = receipt; session.receiptPlan = plan; session.applied = true; session.plan = plan;
      session.error = false; session.status = tr('整理已应用，可以撤销。'); UI().renderStage(); render();
      const savedReceipt = receipt;
      UI().toast(tr('整理已应用，可以撤销。'), { kind: 'success', action: { label: tr('撤销'), onClick: () => undo(session, savedReceipt) } });
    } catch (error) { session.error = true; session.status = tr(error.message); render(); }
  }
  async function undo(session, receipt = session.receipt) {
    try {
      if (!receipt || receipt !== session.receipt) throw new Error(tr('请使用当前预览中的撤销按钮。'));
      const next = AI().copy(UI().state.lib); AI().undo(next, receipt);
      await UI().commitLibrary(next);
      session.receipt = null; session.applied = false; session.plan = null; session.result = null;
      session.error = false; session.status = tr('已撤销整理，原稿已恢复。'); UI().renderStage(); if (active === session) render();
      UI().toast(tr('已撤销整理，原稿已恢复。'), { kind: 'success' });
    } catch (error) { session.error = true; session.status = tr(error.message); if (active === session) render(); else UI().toast(tr(error.message)); }
  }
  function cardPreview(session) {
    const result = session.result;
    if (!result) return '';
    let plan;
    try { plan = selectedPlan(session) || session.plan; }
    catch (error) { return `<p class="organize-error">${esc(tr(error.message))}</p>`; }
    const moves = result.moves.map((move, index) => `<details class="organize-move"><summary><label class="check"><input type="checkbox" data-organize-choice="${index}" ${session.selected.has(String(index)) ? 'checked' : ''} ${session.applied ? 'disabled' : ''}><span>${esc(fieldName(move.from))} → ${esc(fieldName(move.to))}</span></label><span data-no-translate>${esc(move.reason)}</span></summary><pre data-no-translate>${esc(move.quote)}</pre></details>`).join('');
    return `<section class="organize-preview"><h4>${esc(tr('原文搬移清单'))}</h4><p class="help">${esc(tr('每项搬移会同时处理原栏和目标栏。未勾选的片段留在原处。'))}</p>${moves || `<p>${esc(tr('没有需要调整的内容，原稿保持原样。'))}</p>`}<h4>${esc(tr('分栏前后对照'))}</h4>${(plan?.operations || []).map((op) => `<details class="organize-field" open><summary>${esc(fieldName(op.field))}</summary><div class="organize-diff"><div><small>${esc(tr('整理前'))}</small><pre data-no-translate>${esc(display(op.before, op.field))}</pre></div><div><small>${esc(tr('整理后'))}</small><pre data-no-translate>${esc(display(op.after, op.field))}</pre></div></div></details>`).join('')}</section>`;
  }
  function worldPreview(session) {
    if (!session.result) return '';
    return `<section class="organize-preview"><h4>${esc(tr('条目整理建议'))}</h4>${session.result.entries.map((row) => {
      const entry = session.context.book.entries.find((item) => item.id === row.id);
      const ops = session.plan.operations.filter((op) => op.entryId === row.id);
      return `<article class="organize-entry"><header><label class="check"><input type="checkbox" data-organize-choice="${esc(row.id)}" ${session.selected.has(row.id) ? 'checked' : ''} ${session.applied || !ops.length ? 'disabled' : ''}><strong data-no-translate>${esc(row.comment || entry.comment || tr('未命名'))}</strong></label><span class="organize-category">${esc(category(row.category))}</span></header><p data-no-translate>${esc(row.reason)}</p><dl>${ops.map((op) => `<div><dt>${esc(fieldName(op.field))}</dt><dd><span class="organize-before" ${op.field === 'category' || op.field === 'constant' ? '' : 'data-no-translate'}>${esc(display(op.before, op.field))}</span><span aria-hidden="true">→</span><span ${op.field === 'category' || op.field === 'constant' ? '' : 'data-no-translate'}>${esc(display(op.after, op.field))}</span></dd></div>`).join('') || `<div><dt>${esc(tr('保持原样'))}</dt></div>`}</dl><details><summary>${esc(tr('原文依据'))}</summary><blockquote data-no-translate>${esc(row.evidence)}</blockquote></details></article>`;
    }).join('') || `<p>${esc(tr('没有需要调整的内容，原稿保持原样。'))}</p>`}</section>`;
  }
  function render() {
    const session = active; if (!session) return;
    const card = session.kind === 'character', title = card ? '整理分栏' : 'AI 整理条目';
    const pending = !session.applied && session.result && (card ? session.result.moves.some((_, index) => session.selected.has(String(index))) : session.plan.operations.some((op) => session.selected.has(op.entryId)));
    const name = card ? UI().state.lib.characters.find((item) => item.id === session.cardId)?.name : UI().state.lib.worldBooks.find((item) => item.id === session.bookId)?.name;
    host().innerHTML = `<section class="modal paper organize-modal" role="dialog" aria-modal="true" aria-labelledby="organize-title"><header class="organize-heading"><div><p class="ws-address" data-no-translate>${esc(name || '')}</p><h3 id="organize-title">${esc(tr(title))}</h3></div><button class="ws-icon-button" type="button" data-organize-close aria-label="${esc(tr('关闭'))}">${root.TAWorkspace.icon('close')}</button></header><p class="organize-intro">${esc(tr(card ? '把混在一起的设定放回合适的栏位。只搬原文，未归类的内容留在原栏，可选栏位可以留白。' : '给未命名条目起名，按内容分类，并补充准确的触发词。正文不参与修改，常驻条目可以没有关键词。'))}</p><details class="organize-settings" ${session.result ? '' : 'open'}><summary>${esc(tr('整理设置'))}</summary><div class="organize-controls">${card ? '' : `<label class="field"><span class="field-label">${esc(tr('整理范围'))}</span><select data-organize-scope ${session.busy ? 'disabled' : ''}>${[['current', '当前条目'], ['attention', '未命名或缺少触发词的条目'], ['all', '当前世界书全部条目']].filter(([value]) => value !== 'current' || session.entryId).map(([value, label]) => `<option value="${value}" ${session.scope === value ? 'selected' : ''}>${esc(tr(label))}</option>`).join('')}</select></label><fieldset ${session.busy ? 'disabled' : ''}><legend>${esc(tr('这次允许整理'))}</legend><label class="check"><input type="checkbox" data-organize-option="keywords" ${session.keywords ? 'checked' : ''}>${esc(tr('补充主关键词'))}</label><label class="check"><input type="checkbox" data-organize-option="renameAll" ${session.renameAll ? 'checked' : ''}>${esc(tr('也可调整已有条目名'))}</label><label class="check"><input type="checkbox" data-organize-option="changeActivation" ${session.changeActivation ? 'checked' : ''}>${esc(tr('允许建议调整常驻方式'))}</label></fieldset>`}<label class="field"><span class="field-label">${esc(tr('整理偏好（可选）'))}</span><textarea rows="2" data-organize-instruction ${session.busy ? 'disabled' : ''} placeholder="${esc(tr(card ? '例如：能力和身世留在描述，行为习惯放进性格。' : '例如：优先用人物全名和别名触发，基础规则保持常驻。'))}">${esc(session.instruction)}</textarea></label><div class="row"><button class="btn btn-primary" type="button" data-organize-generate ${session.busy ? 'disabled' : ''}>${esc(tr(session.busy ? '正在整理…' : '让 AI 整理并预览'))}</button>${!root.NIJANModel.configured() ? `<button class="btn" type="button" data-organize-connect>${esc(tr('连接模型'))}</button>` : ''}<span class="help">${esc(tr('使用设置中选定的模型与推理强度'))}</span></div></div></details><p class="organize-status${session.error ? ' organize-error' : ''}" role="status">${esc(session.status || tr('建议会先展示在这里，确认后才写入。'))}</p>${card ? cardPreview(session) : worldPreview(session)}<footer class="organize-footer"><span class="help">${esc(tr(card ? '原文逐字保留，搬移成对应用。' : '仅应用勾选条目；正文和其他注入设置保留。'))}</span><div class="row"><button class="btn" type="button" data-organize-undo ${!session.receipt || session.busy ? 'disabled' : ''}>${esc(tr('撤销整理'))}</button><button class="btn btn-primary" type="button" data-organize-apply ${!pending || session.busy ? 'disabled' : ''}>${esc(tr('应用勾选的整理'))}</button></div></footer></section>`;
    host().querySelector('[data-organize-close]').onclick = close;
    host().querySelector('[data-organize-generate]').onclick = () => generate(session);
    if(session.busy){
      const stop=document.createElement('button');stop.type='button';stop.className='btn btn-small';stop.dataset.organizeStop='';stop.textContent=tr('停止');
      stop.onclick=()=>{const run=session.controller;if(!run)return;session.controller=null;session.busy=false;session.status=tr('已停止请求，原稿保持原样。');run.abort();render();};
      host().querySelector('[data-organize-generate]').after(stop);
    }
    host().querySelector('[data-organize-apply]').onclick = () => apply(session);
    host().querySelector('[data-organize-undo]').onclick = () => undo(session);
    host().querySelector('[data-organize-connect]')?.addEventListener('click', () => { close(); document.querySelector('[data-shell="settings"]')?.click(); });
    host().querySelector('[data-organize-instruction]').oninput = (event) => { session.instruction = event.target.value; };
    const reset = () => { session.result = null; session.plan = null; session.applied = false; session.status = ''; session.error = false; render(); };
    host().querySelector('[data-organize-scope]')?.addEventListener('change', (event) => { session.scope = event.target.value; reset(); });
    host().querySelectorAll('[data-organize-option]').forEach((input) => { input.onchange = () => { session[input.dataset.organizeOption] = input.checked; reset(); }; });
    host().querySelectorAll('[data-organize-choice]').forEach((input) => {
      input.onchange = () => { const scroll = host().querySelector('.organize-modal').scrollTop; input.checked ? session.selected.add(input.dataset.organizeChoice) : session.selected.delete(input.dataset.organizeChoice); render(); host().querySelector('.organize-modal').scrollTop = scroll; host().querySelector(`[data-organize-choice="${CSS.escape(input.dataset.organizeChoice)}"]`)?.focus(); };
      input.onclick = (event) => event.stopPropagation();
    });
    root.TAI18n?.localize(host());
  }
  function open(options) {
    if (active) close();
    const kind = options.kind === 'character' ? 'character' : 'world', key = `${kind}/${options.cardId || options.bookId}/${options.entryId || ''}`;
    let session = sessions.get(key);
    if (!session) { session = Object.assign({ kind, task: `organize:${kind}`, instruction: '', scope: options.entryId ? 'current' : 'attention', keywords: true, renameAll: false, changeActivation: false, selected: new Set(), busy: false }, options); sessions.set(key, session); }
    previousFocus = document.activeElement; active = session;
    host().classList.add('show'); host().onclick = (event) => { if (event.target === host()) close(); };
    document.addEventListener('keydown', keyboard, true); render(); host().querySelector('[data-organize-close]').focus();
  }
  function clear() {
    for (const session of sessions.values()) { const controller=session.controller;session.controller=null;controller?.abort(); }
    sessions.clear();if(active)close();
  }
  root.NIJANOrganizePanel = { open, close, clear, hideForNavigation:()=>{if(active)close();}, running:()=>[...sessions.values()].some(session=>session.busy) };
})(globalThis);
