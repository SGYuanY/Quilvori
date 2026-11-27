/* World book selection, entry editing and export. */
(function (root) {
  const UI = root.TAUI;
  const F = root.TAFormats;
  const Store = root.TAStore;
  const {hint}=UI;
  const worldImportTip='在酒馆「世界书」中导入导出的 JSON。要更新已有世界书，请使用原文件名并确认替换。';
  const embeddedBookTip='要更新卡内嵌的世界书，请在角色卡页选中这本书并重新导出角色卡。';
  const {showReading,mountChips,mountSticker,mountJson,mountAiBar}=root.TAWorkEditorTools;

  function blankEntry() {
    return {
      id: Store.uid('lore'), comment: '新条目', content: '', keys: [], secondaryKeys: [],
      constant: false, selective: true, order: 100, position: 'before_char', enabled: true, depth: 4, outletName: '',
    };
  }

  function lore(stage) {
    const lib = UI.state.lib;
    const book = UI.selected(lib.worldBooks, UI.state.sel.book);
    UI.bindWork('worldBooks',book);
    stage.ondragover = (event) => { event.preventDefault(); stage.querySelector('.dropwell')?.classList.add('hot'); };
    stage.ondragleave = (event) => { if (!stage.contains(event.relatedTarget)) stage.querySelector('.dropwell')?.classList.remove('hot'); };
    stage.ondrop = (event) => {
      event.preventDefault();
      stage.querySelector('.dropwell')?.classList.remove('hot');
      const file = event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) importBook(file);
    };
    const mountLinkImport = () => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn'; button.dataset.linkImport = ''; button.textContent = UI.t('链接导入');
      button.onclick = () => root.TALinkImportPanel.open(); stage.querySelector('#import-book').insertAdjacentElement('afterend', button);
    };
    if (!lib.worldBooks.length) {
      stage.innerHTML = `<div class="dropwell"><div><strong>把世界书拖到这里</strong><span>酒馆世界信息的 JSON。</span></div><button type="button" class="btn btn-primary" id="book-drop-btn">选择文件</button></div><div id="sticker-host"></div><div id="json-host"></div><div class="toolbar"><button type="button" class="btn btn-primary" id="new-book">新建世界书</button><button type="button" class="btn" id="import-book">导入 JSON</button>${hint('新建一本，或导入酒馆导出的世界信息 JSON。')}</div>`;
      stage.appendChild(UI.empty('还没有世界书', '新建一本，或导入酒馆导出的世界信息 JSON。', '', null));
      stage.querySelector('#new-book').onclick = () => addBook();
      stage.querySelector('#import-book').onclick = () => importBook();
      stage.querySelector('#book-drop-btn').onclick = () => importBook();
      mountLinkImport();
      return;
    }
    UI.state.sel.book = book.id;
    const entries = UI.state.query ? book.entries.filter(entry=>root.TAContext.matchesEntry(entry,UI.state.query)) : book.entries;
    const entry = entries.find(item=>item.id===UI.state.sel.entry) || entries[0];
    if (entry) UI.state.sel.entry = entry.id;
    UI.state.openFold ||= {};
    if (!UI.state.openFold.lore) UI.state.openFold.lore = 'content';
    UI.state.loreUndo ||= new Map();
    const loreUndo = UI.state.loreUndo.get(book.id) || [];
    UI.state.loreUndo.set(book.id,loreUndo);
    const snapLore = () => {
      if (!book) return;
      const before = JSON.stringify(book.entries);
      if (loreUndo.at(-1) !== before) loreUndo.push(before);
      if (loreUndo.length > 40) loreUndo.shift();
    };
    stage.innerHTML = `<div class="dropwell"><div><strong>把世界书拖到这里</strong><span>酒馆世界信息的 JSON。</span></div><button type="button" class="btn btn-primary" id="book-drop-btn">选择文件</button></div><div id="sticker-host"></div><div id="json-host"></div><div class="toolbar">
      <div class="qc-book-selectors">
        <label><span>当前世界书</span><select id="book-select" data-no-translate>${lib.worldBooks.map((item) => `<option value="${UI.esc(item.id)}"${item.id === book.id ? ' selected' : ''}>${UI.esc(root.TAIntegrityPanel.displayName(item))}</option>`).join('')}</select></label>
        <label><span>目录分组</span><select id="lore-group-by"><option value="position"${UI.state.loreGroupBy !== 'category' ? ' selected' : ''}>按注入位置</option><option value="category"${UI.state.loreGroupBy === 'category' ? ' selected' : ''}>按内容分类</option></select></label>
      </div>
      <div class="qc-book-actions">
        <button type="button" class="btn btn-primary" id="new-entry">${root.TAWorkspace.icon('plus')}新建条目</button>
        <button type="button" class="btn" id="organize-book" data-qc-for="organize-world">${root.TAWorkspace.icon('sections')}AI 整理条目</button>
        <button type="button" class="btn" id="export-book">导出世界书</button>
        <button type="button" class="btn qc-more-trigger" data-qc-more popovertarget="qc-book-more" aria-expanded="false" aria-controls="qc-book-more" aria-label="${UI.esc(UI.t('更多世界书操作'))}" title="${UI.esc(UI.t('更多世界书操作'))}">${root.TAWorkspace.icon('more')}</button>
      </div>
      <div class="qc-more-panel" id="qc-book-more" popover aria-label="${UI.esc(UI.t('更多世界书操作'))}">
        <button type="button" class="btn" id="new-book">新建世界书</button>
        <button type="button" class="btn" id="import-book">导入 JSON</button>
        <button type="button" class="btn" data-qc-compact="organize-world">${root.TAWorkspace.icon('sections')}AI 整理条目</button>
        <button type="button" class="btn" id="lore-undo">撤销</button>
        <button type="button" class="btn btn-danger" id="del-book">删除此书</button>
      </div>
      <p class="note work-export-guide">${UI.esc(UI.t(worldImportTip))} ${UI.esc(UI.t(embeddedBookTip))}</p>
    </div>
    <details class="ws-assist-details"><summary id="rename-book">书名与简介</summary><div class="paper stack">
      ${UI.field('书名', `<input type="text" data-book-field="name" value="${UI.esc(book.name)}">`)}
      ${UI.field('简介', `<textarea rows="3" data-book-field="description">${UI.esc(book.description || '')}</textarea>`)}
    </div></details>
    <section id="context-world"></section>
    <details class="ws-assist-details"><summary>${root.TAWorkspace.icon('check')}逻辑检查与栏位整理</summary><div class="paper lore-try">
      <div id="book-import"></div>
      <div id="lore-ai"></div>
    </div></details>
    <div class="board-layout">
      <div class="board"><div class="ws-list-header"><span>条目目录</span><small></small></div>
        <label class="ws-directory-search">${root.TAWorkspace.icon('search')}<input type="search" id="lore-filter" placeholder="查找条目或正文…" value="${UI.esc(UI.state.loreFilter || '')}" aria-label="查找条目或正文…"></label>
        <nav class="ctx-directory-pager" hidden aria-label="${UI.esc(UI.t('条目目录'))}"><button type="button" class="btn btn-small" data-prev>${UI.t('上一页')}</button><output></output><button type="button" class="btn btn-small" data-next>${UI.t('下一页')}</button></nav>
        <div class="ctx-directory-rows"></div><div class="ws-filter-empty" hidden>没有找到匹配的内容</div>
      </div>
      <div id="lore-editor"></div>
    </div>`;
    root.TAHistoryPanel.mount(stage.querySelector('.toolbar'), 'worldBooks', book);
    const editor = stage.querySelector('#lore-editor');
    const toolbar = stage.querySelector('.toolbar');
    toolbar.classList.add('qc-book-toolbar'); root.TACollectionControls.mountMore(toolbar);
    stage.querySelector('#lore-group-by').onchange = (event) => { UI.state.loreGroupBy = event.target.value; UI.renderStage(); };
    stage.querySelector('#book-select').onchange = (event) => root.TASearch.open({kind:'book',id:event.target.value,field:'name',selectOnly:true});
    stage.querySelector('#new-book').onclick = () => addBook();
    stage.querySelector('#new-entry').onclick = () => {
      const created = blankEntry();
      book.entries.unshift(created);
      UI.markDirty('worldBooks',book.id);
      root.TASearch.open({kind:'entry',id:created.id,parentId:book.id,field:'content'});
    };
    const bookName = stage.querySelector('[data-book-field="name"]'), bookSelect = stage.querySelector('#book-select');
    bookName.oninput = () => {
      if (!bookName.value.trim()) return;
      book.name = bookName.value;
      bookSelect.selectedOptions[0].textContent = root.TAIntegrityPanel.displayName(book);
      const display = bookSelect.closest('.dark-select')?.querySelector('.dark-select-value');
      if (display) display.textContent = book.name;
      const address = editor.querySelector('.ws-address');
      if (address) address.textContent = book.name;
      UI.markDirty('worldBooks',book.id);
    };
    bookName.onblur = () => { if (!bookName.value.trim()) bookName.value = book.name; };
    stage.querySelector('[data-book-field="description"]').oninput = event => { book.description = event.target.value; UI.markDirty('worldBooks',book.id); };
    stage.querySelector('#export-book').onclick = () => {
      const filename = `${UI.safeName(book.name)}.json`;
      const data = F.bookToWorldInfo(book);
      const pack = (lib.stickerPacks || []).find((item) => item.id === book.stickerPackId);
      if (pack) data.stickerPack = pack.name;
      UI.downloadJson(filename, data);
      UI.toast(UI.t('已请求下载世界书 JSON。'));
      const expressions=pack ? ' '+UI.t('另行导出表情图片。世界书中记录的表情包')+' · '+pack.name : '';
      UI.showExport(filename, UI.t(worldImportTip)+expressions);
    };
    stage.querySelector('#import-book').onclick = () => importBook();
    mountLinkImport();
    const organizeBook = () => root.NIJANOrganizePanel.open({kind:'world',bookId:book.id});
    stage.querySelector('#organize-book').onclick = organizeBook;
    stage.querySelector('[data-qc-compact="organize-world"]').onclick = organizeBook;
    stage.querySelector('#del-book').onclick = () => root.TAIntegrityPanel.remove('worldBooks',book,'书里的条目会一起删除。');
    const directory = root.TAContextPanel.mountDirectory(stage,book,id=>{
      UI.state.sel.entry = id; UI.state.openFold.lore = 'content';
      UI.setAddress(root.TASearch.href({kind:'entry',id,parentId:book.id,field:'content'}));
      paintEditor();
    },id=>{
      const item = book.entries.find(entry=>entry.id===id);
      if (!item) return;
      snapLore(); item.enabled = item.enabled === false;
      UI.markDirty('worldBooks',book.id); directory.edit(item);
      if (id===UI.state.sel.entry) paintEditor();
      refreshContext();
    });
    function paintEditor() {
      const current = book.entries.find((item) => item.id === UI.state.sel.entry);
      if (!current) {
        editor.innerHTML = '<div class="paper empty"><h3>选一条</h3><p class="muted">左边是按注入位置分的看板。点开一条来改。</p></div>';
        return;
      }
      editor.innerHTML = `<div class="paper stack folds"><header class="ws-editor-heading"><div><p class="ws-address" data-no-translate>${UI.esc(book.name)}</p><h3 data-no-translate>${UI.esc(current.comment || '未命名')}</h3></div><div class="row"><button type="button" class="btn btn-small" id="lore-ai-organize">${root.TAWorkspace.icon('sections')}整理这条</button><button type="button" class="btn btn-small" id="lore-ai-edit">${root.TAWorkspace.icon('studio')}让 AI 帮忙改</button></div></header>
        ${UI.fold('category', '分类', `<select data-field="category"><option value="">未分类</option>${Object.entries(root.NIJANOrganize.CATEGORIES).map(([value, label]) => `<option value="${value}"${current.category === value ? ' selected' : ''}>${UI.t(label)}</option>`).join('')}</select>`)}
        ${UI.fold('comment', '条目名', UI.text('comment', current.comment))}
        ${UI.fold('content', '内容', UI.area('content', current.content, 8))}
        ${UI.fold('keys', '主关键词', '<div id="keys" class="chips"></div>')}
        ${UI.fold('keys2', '次关键词', '<div id="keys2" class="chips"></div>', '选择性开启时，通常还要命中一个次关键词')}
        ${UI.fold('order', '顺序', `<input data-field="order" type="number" value="${Number(current.order) || 0}">`, '原样写入酒馆的顺序。')}
        ${UI.fold('depth', '深度', `<input data-field="depth" type="number" value="${Number(current.depth ?? 4)}">`, '指定深度时使用')}
        ${UI.fold('position', '位置', `<select data-field="position">${F.POSITIONS.map((position) => `<option value="${position.id}"${position.id === current.position ? ' selected' : ''}>${position.label}</option>`).join('')}</select>`)}
        ${UI.fold('outletName', '出口名', UI.text('outletName', current.outletName), '位置为出口时填写')}
        ${UI.fold('flags', '开关', `<label class="check"><input data-field="constant" type="checkbox" ${current.constant ? 'checked' : ''}>恒定注入</label><label class="check"><input data-field="selective" type="checkbox" ${current.selective ? 'checked' : ''}>选择性</label><label class="check"><input data-field="enabled" type="checkbox" ${current.enabled ? 'checked' : ''}>启用</label><p class="help">恒定注入不看关键词。选择性勾上后，通常还要命中一个次关键词。</p>`)}
        <div class="row"><button type="button" class="btn" id="dup-entry">复制条目</button><button type="button" class="btn btn-danger" id="del-entry">删除条目</button></div>
      </div>`;
      editor.querySelector('#lore-ai-edit').onclick = () => root.NIJANStudio.openFor({ kind: 'world', bookId: book.id, entryId: current.id });
      editor.querySelector('#lore-ai-organize').onclick = () => root.NIJANOrganizePanel.open({ kind: 'world', bookId: book.id, entryId: current.id });
      UI.mountFolds(editor, 'lore');
      UI.bindFields(editor, current, (key) => {
        if (key === 'comment') {
          const title = stage.querySelector(`.entry[data-id="${CSS.escape(current.id)}"] b`);
          if (title) title.textContent = current.comment || '未命名';
        }
        if (key === 'position' || key === 'enabled' || key === 'constant' || key === 'category') UI.renderStage();
      },['worldBooks',book.id]);
      mountChips(editor.querySelector('#keys'), current.keys, '主关键词', refreshContext,['worldBooks',book.id]);
      mountChips(editor.querySelector('#keys2'), current.secondaryKeys, '次关键词', refreshContext,['worldBooks',book.id]);
      UI.mountLengths(editor);
      if (root.TAI18n) root.TAI18n.localize(editor);
      editor.querySelector('#dup-entry').onclick = () => {
        const copy = structuredClone(current);
        copy.id = Store.uid('lore');
        copy.stUid = F.nextEntryUid(book.entries);
        delete copy.graphSource;
        copy.comment = `${current.comment || '条目'} 的副本`;
        book.entries.unshift(copy);
        UI.state.sel.entry = copy.id;
        UI.markDirty('worldBooks',book.id);
        root.TASearch.open({kind:'entry',id:copy.id,parentId:book.id,field:'content'});
      };
      editor.querySelector('#del-entry').onclick = () => {
        book.entries = book.entries.filter((item) => item.id !== current.id);
        UI.state.sel.entry = null;
        UI.markDirty('worldBooks',book.id);
        UI.renderStage();
      };
    }
    const openEntryField = (id,field) => {
      UI.state.sel.entry = id; UI.state.openFold.lore = field;
      const target = book.entries.find(row=>row.id===id);
      if (!target) return;
      const addressField=Object.hasOwn(root.TASearch.types.entry.fields,field)?field:'content';
      UI.setAddress(root.TASearch.href({kind:'entry',id,parentId:book.id,field:addressField}));
      if (!root.TAContext.matchesEntry(target,UI.state.query)) {
        UI.state.loreFilter = ''; UI.show('lore');
        root.TAContextPanel.focusField(stage.querySelector('#lore-editor'),field);
        return;
      }
      directory.reveal(id); paintEditor();
      root.TAContextPanel.focusField(editor,field);
    };
    const applyKeywordSuggestion = async (id,keys) => {
      const lib = UI.state.lib, edited = structuredClone(book);
      const entry = edited.entries.find(row=>row.id===id);
      if (!entry?.constant || !keys.length) return;
      entry.keys = keys; entry.constant = false;
      const next = {...lib,worldBooks:lib.worldBooks.map(row=>row.id===book.id ? edited : row)};
      await root.TAHistory.commitWorks(next,[['worldBooks',book]],{reason:'关键词调整前',scopes:[['worldBooks',book.id]]});
      snapLore(); UI.renderStage();
    };
    const refreshContext = root.TAContextPanel.mountWorld(stage,book,openEntryField,applyKeywordSuggestion,directory);
    stage.querySelectorAll('[data-book-field]').forEach(field => field.addEventListener('input',refreshContext));
    editor.addEventListener('input',refreshContext);
    editor.addEventListener('change',refreshContext);
    showReading(stage.querySelector('#book-import'), UI.t('import.bookTitle'), UI.state.bookImportId === book.id ? F.explainBook(book) : null);
    stage.querySelector('#book-drop-btn').onclick = () => importBook();
    mountAiBar(stage.querySelector('#lore-ai') || stage, 'book');
    stage.querySelector('#lore-undo').onclick = () => {
      const prev = loreUndo.pop();
      if (!prev) { UI.toast('没有可撤销的世界书修改'); return; }
      book.entries = JSON.parse(prev);
      UI.markDirty('worldBooks',book.id);
      UI.renderStage();
    };
    mountSticker(stage, book);
    mountJson(stage, 'book', book);
    editor.addEventListener('focusin', event => { if (event.target.matches('textarea,input,select')) snapLore(); });
    editor.addEventListener('click', event => { if (event.target.closest('#del-entry,#dup-entry,.chips button')) snapLore(); }, true);
    stage.querySelector('#new-entry').addEventListener('click', snapLore, true);
    paintEditor();
    function addBook() {
      const created = { id: Store.uid('book'), name: '新世界书', description: '', entries: [] };
      lib.worldBooks.unshift(created);
      UI.markDirty();
      root.TASearch.open({kind:'book',id:created.id,field:'name'});
    }
    async function importBook(given) {
      const file = given || await UI.pickFile('.json,application/json');
      if (!file) return;
      try {
        const {book:created} = await root.TAFolderImport.importDocument('world',file);
        UI.state.sel.book = UI.state.bookImportId = created.id;
        UI.toast(UI.t('世界书')+' · '+created.entries.length+' '+UI.t('条'),{kind:'success'});
        UI.renderStage();
      } catch (error) {
        UI.toast(error.message);
      }
    }
  }

  root.TAWorldEditor = {render:lore};
})(globalThis);
