/* The fourteen workshop modules, plus the desk overview. */
(function (root) {
  const UI = root.TAUI;
  const F = root.TAFormats;
  const Store = root.TAStore;

  function stamp() { return new Date().toISOString(); }

  function hint(text) {
    return `<p class="note">${UI.esc(text)}</p>`;
  }

  function showReading(host, title, reading) {
    if (!host) return;
    host.replaceChildren();
    if (!reading) return;
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = title;
    host.appendChild(eyebrow);
    const lesson = document.createElement('div');
    host.appendChild(lesson);
    UI.fillLesson(lesson, reading.steps || []);
    const flags = document.createElement('div');
    host.appendChild(flags);
    if (!reading.issues || !reading.issues.length) {
      const ok = document.createElement('p');
      ok.className = 'rx-ok';
      ok.textContent = UI.t('import.clean');
      flags.appendChild(ok);
      return;
    }
    reading.issues.forEach((issue) => {
      const line = document.createElement('p');
      line.className = 'rx-bad';
      line.textContent = String(issue.text || '').includes(issue.where) ? issue.text : `${issue.where}：${issue.text}`;
      flags.appendChild(line);
    });
  }

  function blankCharacter() {
    return {
      id: Store.uid('ch'), name: '新角色', description: '', personality: '', scenario: '',
      first_mes: '', mes_example: '', creator_notes: '', system_prompt: '', post_history_instructions: '',
      alternate_greetings: [], tags: [], creator: '', character_version: '1.0.0', talkativeness: 0.5,
      avatarAssetId: null, expressionAssetIds: [], createdAt: stamp(), updatedAt: stamp(),
    };
  }

  function blankEntry() {
    return {
      id: Store.uid('lore'), comment: '新条目', content: '', keys: [], secondaryKeys: [],
      constant: false, selective: true, order: 100, position: 'before_char', enabled: true, depth: 4, outletName: '',
    };
  }

  async function parseJsonFile(file) {
    const text = await UI.readText(file);
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error('这份 JSON 读不通');
    }
  }

  async function commitCurrentLibrary(update) {
    // File reads and confirmation dialogs may outlive the editor that started the operation.
    const candidate = structuredClone(UI.state.lib);
    update(candidate);
    await UI.commitLibrary(candidate);
  }

  const deleteWork = (collection,item,body) => root.TAIntegrityPanel.remove(collection,item,body);

  async function importCharacterFile(file) {
    if (!file) return;
    try {
      const {card,book,avatarOmitted} = await root.TAFolderImport.importDocument('character',file);
      UI.state.cardImportId = UI.state.sel.character = card.id;
      if (book) UI.state.bookImportId = book.id;
      UI.renderStage();
      UI.toast(avatarOmitted ? UI.t('PNG 太大，没有收进素材库，卡面文字已经导入') : UI.t('角色卡已导入'),{kind:avatarOmitted?'warning':'success'});
    } catch (error) { UI.toast(UI.t(error.message),{kind:'error'}); }
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('头像画不出来'));
      image.src = src;
    });
  }

  function drawSeal(ctx, name) {
    ctx.fillStyle = '#1a120c';
    ctx.fillRect(0, 0, 512, 512);
    ctx.strokeStyle = '#c6a15a';
    ctx.lineWidth = 6;
    ctx.strokeRect(28, 28, 456, 456);
    ctx.strokeRect(40, 40, 432, 432);
    ctx.fillStyle = '#f4e7d1';
    ctx.font = '150px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(name || '名').slice(0, 1), 256, 236);
    ctx.font = '28px serif';
    ctx.fillStyle = '#c6a15a';
    ctx.fillText(String(name || '未命名').slice(0, 8), 256, 400);
  }

  async function makeCardPng(character, book) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    drawSeal(ctx, character.name);
    const avatar = UI.assetById(character.avatarAssetId);
    if (avatar?.dataUrl?.startsWith('data:image/png;base64,')) {
      const bytes = Uint8Array.from(atob(avatar.dataUrl.slice(22)),ch=>ch.charCodeAt(0));
      return root.TAPng.embedChara(bytes,JSON.stringify(F.characterToCard(character,book)));
    }
    if (avatar) {
      try {
        const image = await loadImage(avatar.dataUrl);
        const scale = Math.min(1, 2048 / Math.max(image.width,image.height));
        canvas.width = Math.max(1,Math.round(image.width*scale)); canvas.height = Math.max(1,Math.round(image.height*scale));
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      } catch (error) { /* 印章已经画好 */ }
    }
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('浏览器没有给出 PNG');
    const png = root.TAPng.embedChara(new Uint8Array(await blob.arrayBuffer()), JSON.stringify(F.characterToCard(character, book)));
    return png;
  }
  async function exportCharacterPng(character, book) {
    UI.downloadBlob(`${UI.safeName(character.name)}.png`, new Blob([await makeCardPng(character,book)], { type: 'image/png' }));
  }

  function mountChips(host, list, placeholder, onChange, scope) {
    const paint = (focus) => {
      host.innerHTML = `${list.map((item, index) => `<button type="button" class="chip" data-no-translate data-i="${index}">${UI.esc(item)} ×</button>`).join('')}<input class="chip-input" placeholder="${UI.esc(placeholder)}"><small class="ctx-chip-size" data-no-translate>${UI.esc(root.TAContextPanel.sizeText(root.TAContext.estimate(list.join(', '))))}</small>`;
      host.querySelectorAll('.chip').forEach((button) => {
        button.onclick = () => {
          list.splice(Number(button.dataset.i), 1);
          paint(false);
          onChange();
          UI.markDirty(...scope);
        };
      });
      const input = host.querySelector('.chip-input');
      input.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const value = input.value.trim();
        if (value && !list.includes(value)) list.push(value);
        paint(true);
        onChange();
        UI.markDirty(...scope);
      });
      if (focus) input.focus();
    };
    paint(false);
  }

  // Keep cover images and their interactive controls bounded for both shelf views.
  function mountGalleryPager(host, preferences, draw) {
    const pageSize = 24;
    host.className = 'gallery-pagination row';
    host.setAttribute('aria-label', UI.t('画廊分页'));
    host.innerHTML = `<button class="btn btn-small" type="button" data-prev>${UI.esc(UI.t('上一页'))}</button><span role="status" aria-live="polite" data-page></span><button class="btn btn-small" type="button" data-next>${UI.esc(UI.t('下一页'))}</button>`;
    const prev = host.querySelector('[data-prev]'), next = host.querySelector('[data-next]'), counter = host.querySelector('[data-page]');
    let items = [];
    function paint() {
      const pages = Math.max(1, Math.ceil(items.length/pageSize));
      const page = Math.max(0, Math.min(pages-1, preferences.page || 0));
      preferences.page = page;
      host.hidden = pages <= 1;
      prev.disabled = page === 0;
      next.disabled = page === pages - 1;
      counter.textContent = (page+1)+' / '+pages;
      draw(items.slice(page*pageSize,(page+1)*pageSize));
    }
    function turn(step, button) {
      preferences.page += step; paint();
      if (button.disabled) (step > 0 ? prev : next).focus();
    }
    prev.onclick = () => turn(-1,prev);
    next.onclick = () => turn(1,next);
    return (matches,reset,reveal) => {
      items = matches;
      if (reset) preferences.page = 0;
      if (reveal && matches.includes(reveal)) preferences.page = Math.floor(matches.indexOf(reveal)/pageSize);
      paint();
    };
  }

  function home(stage) {
    const lib = UI.state.lib, icon = root.TAWorkspace.icon, esc = UI.esc, tr = UI.t;
    const prefs = UI.state.collectionView ||= { kind: 'all', query: '' };
    const cards = [...lib.characters].sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
    const books = lib.worldBooks;
    const assetsById = new Map((lib.assets || []).map(asset=>[asset.id,asset]));
    // Interleave the two collections without changing their stored order.
    const collection = [];
    for (let i = 0; i < Math.max(cards.length, books.length); i++) {
      if (cards[i]) collection.push({ kind: 'character', item: cards[i] });
      if (books[i]) collection.push({ kind: 'book', item: books[i] });
    }
    const latest = cards.find(card => card.updatedAt);
    const tint = id => [...String(id || '')].reduce((sum, char) => sum + char.codePointAt(0), 0) % 4;
    stage.innerHTML = `<section class="collection-home" aria-labelledby="collection-heading">
      <header class="collection-heading">
        <div class="collection-heading-copy"><span class="collection-imprint" aria-hidden="true"><img src="img/emblem.svg" alt=""><span>QUILVORI<span class="collection-imprint-rule"></span></span></span><div class="collection-title-row"><span class="collection-title-vine" aria-hidden="true"></span><h2 id="collection-heading">${root.TACollectionControls.titleMarkup('home')}</h2><span class="collection-title-vine" aria-hidden="true"></span></div><p>${tr('把喜欢的人物与世界，安放在这里。')}</p></div>
        <div class="collection-create"><button type="button" class="btn" data-collection-create="character">${icon('plus')}<span>${tr('写角色卡')}</span></button><button type="button" class="btn" data-collection-create="book">${icon('plus')}<span>${tr('写世界书')}</span></button><span class="collection-project"><a class="collection-repository" href="https://github.com/ShangguanQian/Quilvori" target="_blank" rel="noopener noreferrer" aria-label="Quilvori · GitHub" data-no-translate>GitHub ${icon('arrow')}</a></span></div>
      </header>
      <div class="collection-toolbar"><div class="collection-filters" role="group" aria-label="${esc(tr('收藏目录'))}">${[['all','全部藏品',collection.length],['character','角色卡',cards.length],['book','世界书',books.length]].map(([kind,label,count]) => `<button type="button" data-collection-kind="${kind}" aria-pressed="${prefs.kind === kind}"><span>${tr(label)}</span><small>${count}</small></button>`).join('')}</div><label class="collection-search">${icon('search')}<input type="search" data-collection-search aria-label="${esc(tr('搜索藏品、作者、标签'))}" placeholder="${esc(tr('搜索藏品、作者、标签'))}" value="${esc(prefs.query)}" autocomplete="off"></label></div>
      <div class="collection-divider" aria-hidden="true"><span class="collection-divider-wing"></span><span class="collection-divider-jewel"></span><span class="collection-divider-wing is-right"></span></div>
      <nav data-shelf-pages hidden></nav><div class="collection-gallery" data-collection-gallery></div>
      <div class="collection-colophon" aria-hidden="true"><span class="collection-divider-wing"></span><span class="collection-colophon-seal"><span class="collection-seal"></span><small>EX LIBRIS · QUILVORI</small></span><span class="collection-divider-wing is-right"></span></div>
      <footer class="collection-foot"><span data-collection-count role="status" aria-live="polite"></span><span class="collection-foot-mark" aria-hidden="true">QUILVORI <i>✦</i> EX LIBRIS</span></footer>
    </section>`;
    const host = stage.querySelector('.collection-home'), grid = host.querySelector('[data-collection-gallery]');
    const moveFilter = root.TACollectionControls.mountFilters(host.querySelector('.collection-filters'));
    const showPage = mountGalleryPager(host.querySelector('[data-shelf-pages]'),prefs,items => {
      grid.innerHTML = items.map(({kind,item}) => {
        const character = kind === 'character', name = root.TAIntegrityPanel.displayName(item), avatar = character && assetsById.get(item.avatarAssetId);
        const recent = character && latest?.id === item.id;
        const author = typeof item.creator === 'string' && item.creator.trim() ? item.creator : '';
        const title = esc(name), id = esc(item.id);
        const pinned = item.shelfPinned === true, pinAction = esc(tr(pinned ? '取消书架置顶' : '在书架置顶'));
        return `<article class="collection-item collection-${kind} collection-tone-${tint(item.id)}">
          <div class="collection-display"><button type="button" class="collection-open" data-collection-open="${id}" data-collection-type="${kind}" aria-label="${esc(tr('打开编辑'))} · ${title}">
            <span class="collection-cover ${avatar ? 'collection-has-portrait' : ''}">
              ${avatar ? `<img class="collection-portrait" src="${esc(avatar.dataUrl)}" alt="" loading="lazy" decoding="async"><span class="collection-portrait-shade"></span><span class="collection-portrait-caption" data-no-translate>${title}</span>` : `<span class="collection-book-frame" aria-hidden="true"></span><span class="collection-cover-top">${tr(character ? '角色卡' : '世界书')}</span><span class="collection-cover-emblem" aria-hidden="true"><img src="img/emblem.svg" alt=""></span><span class="collection-cover-title" data-no-translate>${title}</span><span class="collection-cover-flourish" aria-hidden="true">✦</span><span class="collection-cover-bottom" aria-hidden="true">QUILVORI</span>`}
              <span class="collection-spine" aria-hidden="true"></span><span class="collection-cover-ornament" aria-hidden="true"></span>
              ${recent ? `<span class="collection-bookmark" aria-label="${esc(tr('最近编辑'))}">${icon('clock')}</span>` : ''}
            </span><span class="collection-open-hint">${tr('打开编辑')}${icon('arrow')}</span>
          </button><button type="button" class="collection-peek" data-collection-peek="${id}" data-collection-type="${kind}" aria-label="${esc(tr('原文预览'))} · ${title}">${icon('eye')}</button></div>
          <div class="collection-caption"><button type="button" class="collection-pin" data-collection-pin="${id}" data-collection-type="${kind}" aria-pressed="${pinned}" aria-label="${pinAction} · ${title}" title="${pinAction}">${icon('pin')}</button><span class="collection-category">${tr(character ? '角色卡' : '世界书')}${recent ? `<span class="collection-recent">${tr('最近编辑')}</span>` : ''}</span><h3 data-no-translate>${title}</h3><p>${author ? `<span data-no-translate>${esc(author)}</span>` : character ? tr('未署名') : `${(item.entries || []).length} ${tr('条设定')}`}</p>${character && item.tags?.length ? `<div class="collection-tags" data-no-translate>${item.tags.slice(0,2).map(tag => `<span>${esc(tag)}</span>`).join('')}</div>` : ''}</div>
        </article>`;
      }).join('') || `<div class="collection-empty"><img src="img/emblem.svg" alt=""><h3>${tr(collection.length ? '没有找到这件藏品' : '收藏从这里开始')}</h3><p>${tr(collection.length ? '换个关键词，或看看其他分类。' : '导入角色卡或世界书，也可以写下你的第一份作品。')}</p><div class="row">${collection.length ? `<button type="button" class="btn" data-collection-reset>${tr('清除筛选')}</button>` : `<button type="button" class="btn" data-collection-import="card">${tr('导入角色卡')}</button><button type="button" class="btn" data-collection-import="book">${tr('导入世界书')}</button>`}</div></div>`;
    });
    const paint = (reset = false,reveal) => {
      const term = prefs.query.trim().toLocaleLowerCase();
      const matches = collection.filter(row => {
        if (prefs.kind !== 'all' && prefs.kind !== row.kind) return false;
        if (!term) return true;
        const item = row.item;
        row.search ??= [item.name,item.creator,item.description,...(item.tags || [])].filter(Boolean).join(' ').toLocaleLowerCase();
        return row.search.includes(term);
      });
      host.querySelectorAll('[data-collection-kind]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.collectionKind === prefs.kind)));
      moveFilter();
      host.querySelector('[data-collection-count]').textContent = `${matches.length} ${tr('件藏品')}`;
      // A stable partition leaves the ordinary shelf order intact when a pin is removed.
      showPage([...matches.filter(row=>row.item.shelfPinned===true), ...matches.filter(row=>row.item.shelfPinned!==true)],reset,reveal);
    };
    host.querySelector('[data-collection-search]').oninput = event => { prefs.query = event.target.value; paint(true); };
    host.onclick = event => {
      const button = event.target.closest('button'); if (!button || !host.contains(button)) return;
      if (button.hasAttribute('data-collection-pin')) {
        const kind = button.dataset.collectionType;
        const group = kind === 'character' ? 'characters' : 'worldBooks';
        const item = Store.byId(lib[group],button.dataset.collectionPin);
        if (!item) return;
        if (item.shelfPinned === true) delete item.shelfPinned;
        else item.shelfPinned = true;
        UI.markDirty(group,item.id);
        paint(false,collection.find(row=>row.item===item));
        grid.querySelector(`[data-collection-pin="${CSS.escape(String(item.id))}"][data-collection-type="${kind}"]`)?.focus();
        return;
      }
      if (button.hasAttribute('data-collection-kind')) { prefs.kind = button.dataset.collectionKind; paint(true); }
      if (button.hasAttribute('data-collection-reset')) { prefs.kind = 'all'; prefs.query = ''; host.querySelector('[data-collection-search]').value = ''; paint(true); }
      if (button.hasAttribute('data-collection-open')) root.TAWorkspace.openEntity({ kind: button.dataset.collectionType, id: button.dataset.collectionOpen });
      if (button.hasAttribute('data-collection-peek')) root.TAWorkspace.showPeek({ kind: button.dataset.collectionType, id: button.dataset.collectionPeek }, button, true);
      if (button.hasAttribute('data-collection-import')) document.querySelector(`[data-shell="import-${button.dataset.collectionImport}"]`)?.click();
      if (button.hasAttribute('data-collection-create')) {
        const character = button.dataset.collectionCreate === 'character';
        const item = character ? blankCharacter() : { id: Store.uid('book'), name: tr('新世界书'), description: '', entries: [] };
        (character ? lib.characters : lib.worldBooks).unshift(item); UI.markDirty();
        root.TAWorkspace.openEntity({ kind: character ? 'character' : 'book', id: item.id });
      }
    };
    paint();
  }


  function characters(stage) {
    const lib = UI.state.lib;
    const list = UI.state.query.trim() ? lib.characters.filter(character => UI.matchQuery([
      character.name, (character.tags || []).join(' '), character.description, character.personality,
    ].join('\n'))) : lib.characters;
    const character = UI.selected(list,UI.state.sel.character);
    if (character) UI.state.sel.character = character.id;
    const books = lib.worldBooks;
    const galleryOn = UI.state.cardView === 'gallery';
    stage.innerHTML = `<div class="dropwell"><div><strong>把角色卡拖到这里</strong><span>JSON，或带 chara 数据的 PNG。</span></div><button type="button" class="btn btn-primary" id="card-drop-btn">选择文件</button></div><div id="sticker-host"></div><div id="json-host"></div><div class="toolbar">
      <button type="button" class="btn${galleryOn ? ' btn-primary' : ''}" data-act="view-gallery">画廊</button>
      <button type="button" class="btn${galleryOn ? '' : ' btn-primary'}" data-act="view-edit">编辑</button>
      <button type="button" class="btn btn-primary" data-act="new">新建角色</button>
      <button type="button" class="btn" data-act="import">导入 JSON / PNG</button>
      <button type="button" class="btn" data-act="dup" ${character ? '' : 'disabled'}>复制</button>
      <button type="button" class="btn btn-danger" data-act="del" ${character ? '' : 'disabled'}>删除</button>
      <span class="spacer"></span>
      <label class="dark-muted">导出时附带<select id="attach-book"><option value="">不附带世界书</option>${books.map((book) => `<option value="${UI.esc(book.id)}">${UI.esc(book.name)}</option>`).join('')}</select></label>
      <button type="button" class="btn btn-primary" data-act="json" ${character ? '' : 'disabled'}>导出 JSON</button>
      <button type="button" class="btn btn-primary" data-act="png" ${character ? '' : 'disabled'}>导出 PNG</button>
      ${hint(galleryOn ? '点卡片就能编辑。复制会另存一份。' : '选一张卡继续写。导出时，可以顺手带上一本世界书。')}
    </div>
    ${!galleryOn && character ? '<button type="button" class="qc-current-card" aria-haspopup="dialog" data-switch-card></button>' : ''}
    <div id="card-ai"></div>
    <div id="char-body"></div>`;
    const cardLinkButton = document.createElement('button'); cardLinkButton.type = 'button'; cardLinkButton.className = 'btn'; cardLinkButton.dataset.cardLinkImport = ''; cardLinkButton.textContent = UI.t('链接导入');
    cardLinkButton.onclick = () => root.TALinkImportPanel.open({ kind: 'character' }); stage.querySelector('[data-act="import"]').insertAdjacentElement('afterend', cardLinkButton);
    mountAiBar(stage.querySelector('#card-ai') || stage, 'card');
    const checks = stage.querySelector('#card-ai');
    if (checks) {
      const details = document.createElement('details'); details.className = 'ws-assist-details';
      details.innerHTML = `<summary>${root.TAWorkspace.icon('check')}逻辑检查与栏位整理</summary>`;
      checks.parentNode.insertBefore(details, checks); details.appendChild(checks);
    }
    const body = stage.querySelector('#char-body');
    const switcher = stage.querySelector('[data-switch-card]');
    if (switcher) {
      stage.querySelector('.toolbar').before(switcher);
      root.TACollectionControls.currentCard(switcher,character);
      switcher.onclick = () => root.TACollectionControls.chooseCard(switcher,list,character.id,id=>
        root.TASearch.open({kind:'character',id,field:'name',selectOnly:true}));
    }
    stage.querySelector('[data-act="view-gallery"]').onclick = () => { UI.state.cardView = 'gallery'; UI.renderStage(); };
    stage.querySelector('[data-act="view-edit"]').onclick = () => { UI.state.cardView = 'edit'; UI.renderStage(); };
    const duplicateCharacter = (source) => {
      const copy = structuredClone(source);
      delete copy.shelfPinned;
      copy.id = Store.uid('ch');
      copy.name = `${source.name} 的副本`;
      copy.createdAt = stamp();
      copy.updatedAt = stamp();
      lib.characters.unshift(copy);
      if (galleryOn) UI.state.characterGallery.page = 0;
      UI.state.sel.character = copy.id;
      UI.setAddress(root.TASearch.href({kind:'character',id:copy.id,field:'name',selectOnly:true}));
      UI.markDirty();
      UI.renderStage();
    };
    stage.querySelector('[data-act="new"]').onclick = () => {
      const created = blankCharacter();
      lib.characters.unshift(created);
      UI.markDirty();
      root.TASearch.open({kind:'character',id:created.id,field:'name'});
    };
    mountSticker(stage, character);
    mountJson(stage, 'card', character);
    const importCard = async (file) => importCharacterFile(file || await UI.pickFile('.json,.png,application/json,image/png'));
    stage.querySelector('[data-act="import"]').onclick = () => importCard();
    stage.querySelector('#card-drop-btn').onclick = () => importCard();
    stage.ondragover = (event) => { event.preventDefault(); stage.querySelector('.dropwell')?.classList.add('hot'); };
    stage.ondragleave = (event) => { if (!stage.contains(event.relatedTarget)) stage.querySelector('.dropwell')?.classList.remove('hot'); };
    stage.ondrop = (event) => { event.preventDefault(); stage.querySelector('.dropwell')?.classList.remove('hot'); importCharacterFile(event.dataTransfer.files && event.dataTransfer.files[0]); };
    if (!character) {
      body.appendChild(UI.empty(lib.characters.length ? '没有符合的角色' : '还没有角色', '新建一张，或把酒馆导出的 JSON、PNG 拖到这页。', '', null));
      return;
    }
    stage.querySelector('[data-act="dup"]').onclick = () => duplicateCharacter(character);
    stage.querySelector('[data-act="del"]').onclick = () => deleteWork('characters',character,'这张卡会从本机库里拿走。已经导出的文件还在。');
    root.TAHistoryPanel.mount(stage.querySelector('.toolbar'), 'characters', character);
    const bookOf = () => Store.byId(lib.worldBooks,stage.querySelector('#attach-book').value);
    root.TAStBundle.mount(stage, character, bookOf, makeCardPng);
    const attached = character.embeddedBookId ?? character.source?.embeddedBookId;
    if (books.some(book=>book.id === attached)) stage.querySelector('#attach-book').value = attached;
    stage.querySelector('#attach-book').addEventListener('change', () => { character.embeddedBookId = bookOf()?.id ?? ''; UI.markDirty('characters',character.id); });
    stage.querySelector('[data-act="json"]').onclick = async () => {
      const filename = `${UI.safeName(character.name)}.json`;
      const pack = (lib.stickerPacks || []).find((item) => item.id === character.stickerPackId);
      try {
        const card = F.characterToCard(character, bookOf());
        if (pack?.stickers?.length) card.data.extensions.expression_folder = `${character.name}/expressions`;
        UI.downloadJson(filename, card);
      } catch (error) {
        UI.toast(UI.t('export.cardFailed', {reason: UI.t(error.message)}), {kind:'error'});
        return;
      }
      const message = UI.t('export.cardRequested', {format:'JSON'});
      UI.toast(message, {kind:'info'});
      UI.showExport(filename, message);
      if (pack) await exportStickerFiles(pack, character.name, {filename, message});
    };
    stage.querySelector('[data-act="png"]').onclick = () => exportCharacterPng(character, bookOf()).then(() => {
      const message = UI.t('export.cardRequested', {format:'PNG'});
      UI.toast(message, {kind:'info'});
      UI.showExport(`${UI.safeName(character.name)}.png`, message);
    }).catch(error => UI.toast(UI.t('export.cardFailed', {reason:UI.t(error.message)}), {kind:'error'}));
    if (galleryOn) {
      const prefs = UI.state.characterGallery ||= {query:'',page:0};
      const assetsById = new Map((lib.assets || []).map(asset=>[asset.id,asset]));
      const labels = new Map();
      body.innerHTML = `<div class="row"><label class="field"><span class="field-label">${UI.t('搜索藏品、作者、标签')}</span><input type="search" data-gallery-search value="${UI.esc(prefs.query)}" autocomplete="off"></label><nav data-card-pages hidden></nav></div><div class="gallery"></div>`;
      const grid = body.querySelector('.gallery'), search = body.querySelector('[data-gallery-search]');
      const currentLabel=document.createElement('span');currentLabel.className='help';currentLabel.id='gallery-current-character';currentLabel.setAttribute('role','status');
      currentLabel.dataset.noTranslate='';search.closest('label').after(currentLabel);
      const targetControls=stage.querySelectorAll('[data-act="view-edit"],[data-act="json"],[data-act="png"],[data-act="dup"],[data-act="del"],#attach-book');
      for(const control of targetControls)control.setAttribute('aria-describedby',currentLabel.id);
      const targetPanels=stage.querySelectorAll('#st-bundle,.revision-panel,#sticker-host,#json-host');
      const showPage = mountGalleryPager(body.querySelector('[data-card-pages]'),prefs,items => {
        const visible=items.some(item=>item.id===character.id);
        for(const control of targetControls)control.disabled=!visible;
        for(const panel of targetPanels)panel.hidden=!visible;
        currentLabel.textContent=visible ? UI.t('当前角色')+' · '+root.TAIntegrityPanel.displayName(character) : UI.t('请在画廊中选择角色卡。');
        grid.innerHTML = items.map(item => {
          const avatar = assetsById.get(item.avatarAssetId), name = UI.esc(root.TAIntegrityPanel.displayName(item));
          const face = avatar ? `<img alt="" src="${UI.esc(avatar.dataUrl)}" loading="lazy" decoding="async">` : `<div class="seal-fallback" data-no-translate>${UI.esc((item.name || '名').slice(0,1))}</div>`;
          return `<article class="paper gallery-card${item.id === character.id ? ' on' : ''}">
            <button type="button" class="gallery-open" data-open-card="${UI.esc(item.id)}"${item.id===character.id?' aria-current="true"':''} aria-label="${UI.esc(UI.t('打开编辑'))} · ${name}">${face}</button>
            <div class="gallery-meta"><strong data-no-translate>${name}</strong><div class="row"><button type="button" class="btn btn-small" data-dup-card="${UI.esc(item.id)}" aria-label="${UI.esc(UI.t('复制'))} · ${name}">${UI.t('复制')}</button></div></div>
          </article>`;
        }).join('') || `<p class="help" role="status">${UI.t('没有找到这件藏品')}</p>`;
      });
      const filter = reset => {
        const term = prefs.query.trim().toLocaleLowerCase();
        const matches = !term ? list : list.filter(item => {
          if (!labels.has(item.id)) labels.set(item.id,[item.name,item.creator,item.description,item.personality,item.scenario,...(item.tags || [])].join(' ').toLocaleLowerCase());
          return labels.get(item.id).includes(term);
        });
        showPage(matches,reset);
      };
      search.oninput = () => { prefs.query = search.value; filter(true); };
      grid.onclick = event => {
        const open = event.target.closest('[data-open-card]'), duplicate = event.target.closest('[data-dup-card]');
        if (open) { root.TASearch.open({kind:'character',id:open.dataset.openCard,field:'name',selectOnly:true}); }
        else if (duplicate) {
          const source = Store.byId(lib.characters,duplicate.dataset.dupCard);
          if (source) duplicateCharacter(source);
        }
      };
      filter(false);
      return;
    }
    const avatars = lib.assets.filter((asset) => asset.kind === 'avatar' || asset.kind === 'expression');
    body.innerHTML = `<div class="work">
      <div class="paper stack folds" id="char-form">
        ${UI.fold('name', '名字', UI.text('name', character.name))}
        ${UI.fold('creator', '创作者', UI.text('creator', character.creator))}
        ${UI.fold('character_version', '版本', UI.text('character_version', character.character_version))}
        ${UI.fold('tags', '标签', '<div id="char-tags" class="chips"></div>', '回车添加')}
        ${UI.fold('avatarAssetId', '头像', `<select data-field="avatarAssetId"><option value="">无</option>${avatars.map((asset) => `<option value="${UI.esc(asset.id)}"${asset.id === character.avatarAssetId ? ' selected' : ''}>${UI.esc(asset.name)}</option>`).join('')}</select>`, '图片在素材库上传')}
        ${UI.fold('talkativeness', '话多程度', `<input data-field="talkativeness" type="range" min="0" max="1" step="0.05" value="${Number(character.talkativeness) || 0}">`, '0 很少开口，1 很爱说话。群聊导出时带上这个数。')}
        ${UI.fold('description', '描述', UI.area('description', character.description, 6))}
        ${UI.fold('personality', '性格', UI.area('personality', character.personality, 4))}
        ${UI.fold('scenario', '情景', UI.area('scenario', character.scenario, 4))}
        ${UI.fold('first_mes', '开场白', UI.area('first_mes', character.first_mes, 6))}
        ${UI.fold('greetings', '备用开场', '<div id="greetings"></div>', '点「添加」再写。导出为备用开场白。')}
        ${UI.fold('mes_example', '对话示例', UI.area('mes_example', character.mes_example, 5), '可用 {{char}} 与 {{user}}')}
        ${UI.fold('creator_notes', '创作者备注', UI.area('creator_notes', character.creator_notes, 3))}
        ${UI.fold('system_prompt', '系统提示', UI.area('system_prompt', character.system_prompt, 3), '写入角色卡的系统提示。')}
        ${UI.fold('post_history_instructions', '历史后指令', UI.area('post_history_instructions', character.post_history_instructions, 3), '放在对话历史之后，给模型的补充指令。')}
      </div>
      <aside class="paper card-preview" id="char-preview"></aside>
    </div>`;
    const paintPreview = () => {
      const avatar = UI.assetById(character.avatarAssetId);
      const preview = body.querySelector('#char-preview');
      preview.innerHTML = `${avatar ? `<img class="avatar" alt="" src="${UI.esc(avatar.dataUrl)}">` : `<div class="avatar seal-fallback">${UI.esc((character.name || '名').slice(0, 1))}</div>`}
        <p class="eyebrow">CHARACTER · V2</p>
        <h2 id="prev-name"></h2>
        <div class="tags" id="prev-tags"></div>
        <p class="clamp" id="prev-desc"></p>
        <div class="bubble" id="prev-mes"></div>
        <p class="muted" id="prev-meta"></p>
        <div id="card-lesson"></div>
        <div id="card-import"></div>`;
      preview.querySelector('#prev-name').textContent = character.name || '未命名';
      preview.querySelector('#prev-tags').innerHTML = (character.tags || []).map((tag) => `<span class="tag">${UI.esc(tag)}</span>`).join('');
      preview.querySelector('#prev-desc').textContent = character.description || '描述还空着。';
      preview.querySelector('#prev-mes').textContent = character.first_mes || '还没有开场白。';
      preview.querySelector('#prev-meta').textContent = `${character.creator || '未署名'} · ${character.character_version || '无版本'} · 话多 ${Number(character.talkativeness || 0).toFixed(2)}`;
      stage.querySelector('#attach-book').onchange = paintPreview;
      const card = F.characterToCard(character, bookOf());
      const data = card.data;
      const clip = (value) => {
        const text = String(value || '').replace(/\s+/g, ' ').trim();
        return text ? (text.length > 42 ? `${text.slice(0, 42)}…` : text) : '空';
      };
      UI.fillLesson(preview.querySelector('#card-lesson'), [
        data.name ? UI.t('card.name', { name: data.name }) : UI.t('card.nameEmpty'),
        clip(data.personality) !== '空' ? UI.t('card.personality', { text: clip(data.personality) }) : UI.t('card.personalityEmpty'),
        clip(data.scenario) !== '空' ? UI.t('card.scenario', { text: clip(data.scenario) }) : UI.t('card.scenarioEmpty'),
        clip(data.first_mes) !== '空' ? UI.t('card.first', { text: clip(data.first_mes) }) : UI.t('card.firstEmpty'),
        data.alternate_greetings.length ? UI.t('card.greetings', { count: data.alternate_greetings.length, text: clip(data.alternate_greetings[0]) }) : UI.t('card.greetingsEmpty'),
        clip(data.mes_example) !== '空' ? UI.t('card.example', { text: clip(data.mes_example) }) : UI.t('card.exampleEmpty'),
        clip(data.system_prompt) !== '空' ? UI.t('card.system', { text: clip(data.system_prompt) }) : UI.t('card.systemEmpty'),
        UI.t('card.post', { text: clip(data.post_history_instructions) }),
        UI.t('card.notes', { text: clip(data.creator_notes), tags: data.tags.length ? data.tags.join('、') : UI.t('没有') }),
        UI.t('card.talk', { n: data.extensions.talkativeness }),
        data.character_book ? UI.t('card.book', { name: data.character_book.name || UI.t('未命名'), count: data.character_book.entries.length }) : UI.t('card.bookNone'),
        UI.t('card.spec'),
      ]);
      const importedCard = UI.state.cardImportId === character.id ? F.explainCard(character) : null;
      showReading(preview.querySelector('#card-import'), UI.t('import.cardTitle'), importedCard);
    };
    paintPreview();
    UI.state.openFold ||= {};
    if (!UI.state.openFold.char) UI.state.openFold.char = 'description';
    UI.mountFolds(body.querySelector('#char-form'), 'char');
    UI.bindFields(body, character, (key) => {
      if (key === 'avatarAssetId') character.avatarAssetId = UI.assetById(character.avatarAssetId)?.id ?? null;
      character.updatedAt = stamp();
      paintPreview();
      if (switcher && (key==='name' || key==='avatarAssetId')) root.TACollectionControls.currentCard(switcher,character);
    },['characters',character.id]);
    mountChips(body.querySelector('#char-tags'), character.tags, '添加标签', paintPreview,['characters',character.id]);
    const greetHost = body.querySelector('#greetings');
    const paintGreetings = () => {
      greetHost.innerHTML = `${character.alternate_greetings.map((line, index) => `<div class="row"><textarea data-greet="${index}" rows="3">${UI.esc(line)}</textarea><button type="button" class="btn btn-small btn-danger" data-drop-greet="${index}">删除</button></div>`).join('')}<button type="button" class="btn btn-small" id="add-greet">添加备用开场</button>`;
      greetHost.querySelectorAll('textarea').forEach((area) => {
        area.addEventListener('input', () => {
          character.alternate_greetings[Number(area.dataset.greet)] = area.value;
          character.updatedAt = stamp();
          UI.markDirty('characters',character.id);
        });
      });
      greetHost.querySelectorAll('[data-drop-greet]').forEach((button) => {
        button.onclick = () => {
          character.alternate_greetings.splice(Number(button.dataset.dropGreet), 1);
          UI.markDirty('characters',character.id);
          paintGreetings();
        };
      });
      greetHost.querySelector('#add-greet').onclick = () => {
        character.alternate_greetings.push('');
        UI.markDirty('characters',character.id);
        paintGreetings();
      };
      UI.mountLengths(greetHost);
    };
    paintGreetings();
    UI.mountLengths(body);
    root.TAContextPanel.mountCharacter(body,character);
  }

  function lore(stage) {
    const lib = UI.state.lib;
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
    const book = UI.selected(lib.worldBooks, UI.state.sel.book);
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
      UI.toast(pack ? '已导出世界书，并记下表情包名称' : '已导出酒馆世界书 JSON');
      UI.showExport(filename, pack ? `世界书 JSON，只记录表情包「${pack.name}」，不含图片。放到酒馆 worlds 目录后从世界信息导入。` : '世界书 JSON。放到酒馆 worlds 目录，或在世界信息里导入。');
    };
    stage.querySelector('#import-book').onclick = () => importBook();
    mountLinkImport();
    const organizeBook = () => root.NIJANOrganizePanel.open({kind:'world',bookId:book.id});
    stage.querySelector('#organize-book').onclick = organizeBook;
    stage.querySelector('[data-qc-compact="organize-world"]').onclick = organizeBook;
    stage.querySelector('#del-book').onclick = () => deleteWork('worldBooks',book,'书里的条目会一起删除。');
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
      const next = structuredClone(UI.state.lib);
      const entry = next.worldBooks.find(row=>row.id===book.id)?.entries.find(row=>row.id===id);
      if (!entry?.constant || !keys.length) return;
      entry.keys = keys; entry.constant = false;
      await UI.commitLibrary(next);
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

  function prompts(stage) {
    const lib = UI.state.lib;
    const presets = lib.promptPresets.filter(item => UI.matchQuery([item.name,...item.blocks.map(block=>block.name)].join(' ')));
    const current = UI.selected(presets, UI.state.sel.preset);
    if (current) UI.state.sel.preset = current.id;
    stage.innerHTML = `<div class="toolbar">
      <button type="button" class="btn btn-primary" id="new-preset">新建预设</button>
      <button type="button" class="btn" id="import-preset">导入 JSON</button>
      <button type="button" class="btn btn-primary" id="export-preset" ${current ? '' : 'disabled'}>导出预设</button>
      ${hint('添加一块后，拖左侧「序」排列。关掉的块仍会导出，只是未启用。')}
    </div>`;
    stage.insertAdjacentHTML('beforeend', UI.picker(presets, current && current.id, (item) => `${item.blocks.length} 块`));
    UI.bindPicker(stage, (id) => { UI.state.sel.preset = id; UI.renderStage(); });
    stage.querySelector('#new-preset').onclick = () => {
      const created = { id: Store.uid('preset'), name: '新预设', blocks: [{ id: Store.uid('blk'), name: '系统', kind: 'system', role: 'system', enabled: true, content: '' }] };
      lib.promptPresets.unshift(created);
      UI.state.sel.preset = created.id;
      UI.markDirty();
      if (UI.matchQuery(created.name+' '+created.blocks[0].name)) UI.renderStage();
      else UI.show('prompts');
    };
    const importPreset = stage.querySelector('#import-preset');
    importPreset.onclick = async () => {
      try {
        const file = await UI.pickFile('.json,application/json');
        if (!file) return;
        const json = await parseJsonFile(file);
        const scopes = F.presetOrderScopes(json);
        let scopeIndex;
        if (scopes.length > 1) {
          const content = document.createElement('div'), label = document.createElement('label'), select = document.createElement('select');
          label.className = 'field';
          label.append(UI.t('提示块执行范围'),select);
          scopes.forEach((scope,index) => {
            const option = new Option('character_id: '+String(scope.character_id ?? '—')+' · '+UI.t('prompt.scopeCount',{count:scope.order.length}),String(index));
            select.add(option);
          });
          select.selectedIndex = Math.max(0,scopes.findIndex(scope=>String(scope.character_id)==='100001'));
          content.append(label);
          const decision = await UI.ask({title:'提示块执行范围',body:'选择要编辑和导出的执行顺序。',content,
            actions:[{id:'cancel',label:'取消'},{id:'import',label:'导入',kind:'btn-primary'}]});
          if (decision !== 'import') return;
          scopeIndex = select.selectedIndex;
        }
        const imported = F.presetFromImport(json, scopeIndex);
        imported.id = Store.uid('preset');
        imported.blocks.forEach((block) => { block.id = Store.uid('blk'); });
        await commitCurrentLibrary(candidate => candidate.promptPresets.unshift(imported));
        if (importPreset.isConnected) {
          UI.state.sel.preset = imported.id;
          if (!UI.matchQuery([imported.name,...imported.blocks.map(block=>block.name)].join(' '))) {
            UI.show('prompts');
            return;
          }
        }
        UI.renderStage();
      } catch (error) {
        const field = error.presetField ? ' · ' + error.presetField : '';
        UI.toast(UI.t(error.message) + field,{kind:'error'});
      }
    };
    if (!current) {
      stage.appendChild(UI.empty('还没有预设', '加一组有顺序的提示词块。', '', null));
      return;
    }
    stage.querySelector('#export-preset').onclick = () => {
      const filename = `${UI.safeName(current.name)}.json`;
      UI.downloadJson(filename, F.presetToExport(current));
      UI.toast('已导出。请把块抄进酒馆预设，不要整份覆盖。');
      UI.showExport(filename, '提示词块。对照抄进酒馆预设，不要整份覆盖模型参数。');
    };
    const host = document.createElement('div');
    host.className = 'work';
    stage.appendChild(host);
    const paint = () => {
      host.innerHTML = `<div><div class="paper stack" style="margin-bottom:12px">${UI.field('预设名', UI.text('name', current.name))}${current.stOrderCharacterId != null ? `<p class="help" data-no-translate>${UI.esc(UI.t('提示块执行范围'))} · character_id: ${UI.esc(current.stOrderCharacterId)}</p>` : ''}</div>
        <div id="blocks">${current.blocks.map((block) => `<article class="paper block${block.enabled ? '' : ' off'}" data-id="${UI.esc(block.id)}">
          <div class="handle" draggable="true" data-drag="${UI.esc(block.id)}" title="拖动排序">序</div>
          <div class="stack">
            <div class="grid-2">
              <input data-block="${UI.esc(block.id)}" data-key="name" value="${UI.esc(block.name)}">
              <select data-block="${UI.esc(block.id)}" data-key="kind">${[['system', '系统'], ['author_note', '作者注'], ['style', '文风'], ['jailbreak', '文风锁'], ['custom', '自定义']].map(([value, label]) => `<option value="${value}"${block.kind === value ? ' selected' : ''}>${label}</option>`).join('')}</select>
            </div>
            <div class="row">
              <select data-block="${UI.esc(block.id)}" data-key="role">${['system', 'user', 'assistant'].map((role) => `<option ${block.role === role ? 'selected' : ''}>${role}</option>`).join('')}</select>
              <label class="check"><input type="checkbox" data-block="${UI.esc(block.id)}" data-key="enabled" ${block.enabled ? 'checked' : ''}>启用</label>
              <button type="button" class="btn btn-small btn-danger" data-del="${UI.esc(block.id)}">删除</button>
            </div>
            <textarea data-block="${UI.esc(block.id)}" data-key="content" rows="4">${UI.esc(block.content)}</textarea>
          </div>
        </article>`).join('')}</div>
        <button type="button" class="btn" id="add-block">添加一块</button></div>
        <aside class="paper"><p class="eyebrow">顺序</p><ol id="order-preview"></ol><p class="help">拖左侧的「序」重新排列。导出的 JSON 带 prompts 和 prompt_order，方便对照酒馆预设，它不是完整的模型参数包。</p><div id="prompt-lesson"></div></aside>`;
      UI.bindFields(host.querySelector('.paper'), current, () => paintOrder(),['promptPresets',current.id]);
      const paintOrder = () => {
        host.querySelector('#order-preview').innerHTML = current.blocks.map((block) => `<li>${block.enabled ? '' : `${UI.t('（关）')}`}${UI.esc(block.name)} · ${UI.esc(block.kind)}</li>`).join('');
        const exported = F.presetToExport(current);
        const kindLabel = { system: '系统', author_note: '作者注', style: '文风', jailbreak: '文风锁', custom: '自定义' };
        UI.fillLesson(host.querySelector('#prompt-lesson'), [
          UI.t('prompt.lead', { name: exported.name, count: exported.prompts.length }),
          ...exported.prompts.map((prompt, index) => {
            const where = UI.t(prompt.injection_position === 1 ? '作者注位置，深度 4' : '普通插入位置');
            const bodyText = String(prompt.content || '').replace(/\s+/g, ' ').trim();
            return UI.t('prompt.block', {
              n: index + 1,
              name: prompt.name,
              role: prompt.role,
              kind: UI.t(kindLabel[prompt.atelier_kind] || prompt.atelier_kind),
              where,
              state: prompt.enabled ? UI.t('prompt.on') : UI.t('prompt.off'),
              text: bodyText ? bodyText.slice(0, 36) : UI.t('空'),
            });
          }),
        ]);
      };
      paintOrder();
      host.querySelectorAll('[data-block]').forEach((node) => {
        const eventName = node.tagName === 'SELECT' || node.type === 'checkbox' ? 'change' : 'input';
        node.addEventListener(eventName, () => {
          const block = Store.byId(current.blocks,node.dataset.block);
          block[node.dataset.key] = node.type === 'checkbox' ? node.checked : node.value;
          if (node.dataset.key === 'enabled') {
            delete block.stOrderOmitted;
            node.closest('.block').classList.toggle('off', !block.enabled);
          }
          paintOrder();
          UI.markDirty('promptPresets',current.id);
        });
      });
      host.querySelectorAll('[data-del]').forEach((button) => {
        button.onclick = () => {
          const removed = Store.byId(current.blocks,button.dataset.del);
          current.blocks = current.blocks.filter(block=>block!==removed);
          UI.markDirty('promptPresets',current.id);
          paint();
        };
      });
      host.querySelector('#add-block').onclick = () => {
        current.blocks.push({ id: Store.uid('blk'), name: '新块', kind: 'custom', role: 'system', enabled: true, content: '' });
        UI.markDirty('promptPresets',current.id);
        paint();
      };
      let fromId = null;
      host.querySelectorAll('[data-drag]').forEach((handle) => {
        handle.addEventListener('dragstart', (event) => {
          fromId = handle.dataset.drag;
          event.dataTransfer.effectAllowed = 'move';
        });
      });
      host.querySelectorAll('.block').forEach((blockEl) => {
        blockEl.addEventListener('dragover', (event) => event.preventDefault());
        blockEl.addEventListener('drop', (event) => {
          event.preventDefault();
          const toId = blockEl.dataset.id;
          if (!fromId || fromId === toId) return;
          const from = current.blocks.indexOf(Store.byId(current.blocks,fromId));
          const to = current.blocks.indexOf(Store.byId(current.blocks,toId));
          if (from < 0 || to < 0) return;
          const [moved] = current.blocks.splice(from, 1);
          current.blocks.splice(to, 0, moved);
          UI.markDirty('promptPresets',current.id);
          paint();
        });
      });
      UI.mountLengths(host);
    };
    paint();
  }

  function groups(stage) {
    const lib = UI.state.lib;
    const groups = lib.groups.filter((group) => UI.matchQuery(group.name + group.scenario));
    const group = groups.find((item) => item.id === UI.state.sel.group) || groups[0] || null;
    if (group) UI.state.sel.group = group.id;
    stage.innerHTML = `<div class="toolbar">
      <button type="button" class="btn btn-primary" id="new-group">新建群</button>
      <button type="button" class="btn btn-primary" id="export-group" ${group ? '' : 'disabled'}>导出群 JSON</button>
      <button type="button" class="btn btn-danger" id="del-group" ${group ? '' : 'disabled'}>删除</button>
      ${hint('从下面选角色加入。取消「上场」则先不让这个角色开口。导出只是名单，回酒馆后按名单建群。')}
    </div>${UI.picker(groups, group && group.id, (item) => `${item.members.length} 人`)}<div id="group-body"></div>`;
    UI.bindPicker(stage, (id) => { UI.state.sel.group = id; UI.renderStage(); });
    stage.querySelector('#new-group').onclick = () => {
      const created = { id: Store.uid('grp'), name: '新群聊', scenario: '', activation: 'natural', members: [] };
      lib.groups.unshift(created);
      UI.state.sel.group = created.id;
      UI.markDirty();
      UI.renderStage();
    };
    if (!group) { stage.querySelector('#group-body').appendChild(UI.empty('还没有群', '把库里的角色排成一场夜话。', '', null)); return; }
    stage.querySelector('#export-group').onclick = () => {
      const filename = `${UI.safeName(group.name)}.json`;
      UI.downloadJson(filename, F.groupToExport(group, lib));
      UI.toast('已导出群名单。酒馆需先有角色卡，再按名单建群。');
      UI.showExport(filename, '群名单。先导入角色卡，再按这份名单在酒馆里建群。');
    };
    stage.querySelector('#del-group').onclick = () => deleteWork('groups',group);
    const body = stage.querySelector('#group-body');
    const missing = lib.characters.filter((character) => !group.members.some((member) => member.characterId === character.id));
    body.innerHTML = `<div class="work"><div class="paper stack">
      ${UI.field('群名', UI.text('name', group.name))}
      ${UI.field('情景', UI.area('scenario', group.scenario, 4))}
      ${UI.field('激活', `<select data-field="activation">${F.ACTIVATION.map((item) => `<option value="${item.id}"${group.activation === item.id ? ' selected' : ''}>${item.label}</option>`).join('')}</select>`, '自然轮转、名单顺序、手动点名或池中随机。')}
      <div id="members">${group.members.map((member, index) => {
        const character = UI.charById(member.characterId);
        return `<div class="paper" data-member="${index}" style="padding:10px;margin-bottom:8px">
          <div class="row"><strong>${UI.esc(character ? character.name : '已删除的角色')}</strong><label class="check"><input type="checkbox" data-m="enabled" ${member.enabled !== false ? 'checked' : ''}>上场</label><button type="button" class="btn btn-small btn-danger" data-m-del>移除</button></div>
          <label class="field"><span class="field-label">话多 ${Number(member.talkativeness).toFixed(2)}</span><input type="range" min="0" max="1" step="0.05" data-m="talk" value="${Number(member.talkativeness) || 0}"></label>
        </div>`;
      }).join('')}</div>
      <div class="row"><select id="add-member"><option value="">添加角色</option>${missing.map((character) => `<option value="${UI.esc(character.id)}">${UI.esc(character.name)}</option>`).join('')}</select><button type="button" class="btn" id="add-member-btn">加入</button></div>
    </div><aside class="paper" id="group-preview"></aside></div>`;
    const paintPreview = () => {
      body.querySelector('#group-preview').innerHTML = `<p class="eyebrow">CAST</p><h2></h2><p class="muted"></p><ol></ol>`;
      const aside = body.querySelector('#group-preview');
      aside.querySelector('h2').textContent = group.name || '未命名群';
      aside.querySelector('p.muted').textContent = (F.ACTIVATION.find((item) => item.id === group.activation) || {}).label || '';
      aside.querySelector('ol').innerHTML = group.members.map((member) => `<li>${member.enabled === false ? '（未上场）' : ''}${UI.esc(UI.charById(member.characterId)?.name || '缺失')} · ${Number(member.talkativeness).toFixed(2)}</li>`).join('');
    };
    paintPreview();
    UI.bindFields(body, group, paintPreview,['groups',group.id]);
    body.querySelectorAll('[data-member]').forEach((row) => {
      const member = group.members[Number(row.dataset.member)];
      row.querySelector('[data-m="enabled"]').onchange = (event) => { member.enabled = event.target.checked; paintPreview(); UI.markDirty('groups',group.id); };
      row.querySelector('[data-m="talk"]').oninput = (event) => {
        member.talkativeness = Number(event.target.value);
        row.querySelector('.field-label').textContent = `话多 ${member.talkativeness.toFixed(2)}`;
        if (root.TAI18n) root.TAI18n.localize(row.querySelector('.field-label'));
        paintPreview();
        UI.markDirty('groups',group.id);
      };
      row.querySelector('[data-m-del]').onclick = () => { group.members.splice(Number(row.dataset.member), 1); UI.markDirty('groups',group.id); UI.renderStage(); };
    });
    body.querySelector('#add-member-btn').onclick = () => {
      const character=UI.charById(body.querySelector('#add-member').value);
      if (!character) return;
      group.members.push({characterId:character.id,talkativeness:character.talkativeness ?? 0.5,enabled:true});
      UI.markDirty('groups',group.id);
      UI.renderStage();
    };
  }

  function chat(stage) {
    const lib = UI.state.lib;
    const chats = lib.chats.filter((item) => UI.matchQuery(item.name + item.characterName));
    const current = chats.find((item) => item.id === UI.state.sel.chat) || chats[0] || null;
    if (current) UI.state.sel.chat = current.id;
    const backgrounds = lib.assets.filter((asset) => asset.kind === 'background' || asset.kind === 'avatar');
    stage.innerHTML = `<div class="toolbar">
      <button type="button" class="btn btn-primary" id="import-chat">导入 JSON / JSONL</button>
      <button type="button" class="btn" id="export-chat" ${current ? '' : 'disabled'}>导出阅读稿</button>
      <button type="button" class="btn btn-danger" id="del-chat" ${current ? '' : 'disabled'}>删除</button>
      <label class="dark-muted">背景<select id="chat-bg"><option value="">无</option>${backgrounds.map((asset) => `<option value="${UI.esc(asset.id)}"${lib.settings.chatBackgroundAssetId === asset.id ? ' selected' : ''}>${UI.esc(asset.name)}</option>`).join('')}</select></label>
      ${hint('导入 jsonl 或消息数组，也可拖进来。背景只影响这页。导出的阅读稿不会写回酒馆。')}
    </div>${UI.picker(chats, current && current.id, (item) => `${item.messages.length} 条`)}<div id="chat-body"></div>`;
    UI.bindPicker(stage, (id) => { UI.state.sel.chat = id; UI.renderStage(); });
    stage.querySelector('#chat-bg').onchange = (event) => {
      lib.settings.chatBackgroundAssetId = event.target.value || null;
      UI.markDirty('settings');
      UI.renderStage();
    };
    const importButton = stage.querySelector('#import-chat');
    const importChat = async (file) => {
      if (!file) return;
      try {
        const text = await UI.readText(file);
        const parsed = F.chatFromText(text, file.name);
        await commitCurrentLibrary(candidate => {
          if (!(typeof parsed.id === 'string' && parsed.id.trim() || Number.isSafeInteger(parsed.id)) ||
              candidate.chats.some(row => String(row.id) === String(parsed.id))) parsed.id = Store.uid('chat');
          candidate.chats.unshift(parsed);
        });
        if (importButton.isConnected) UI.state.sel.chat = parsed.id;
        UI.renderStage();
        UI.toast(`已读入 ${parsed.messages.length} 条消息`,{kind:'success'});
      } catch (error) { UI.toast(UI.t(error.message || '这份聊天认不出'),{kind:'error'}); }
    };
    importButton.onclick = async () => importChat(await UI.pickFile('.json,.jsonl,.txt,application/json'));
    stage.ondragover = (event) => event.preventDefault();
    stage.ondrop = (event) => { event.preventDefault(); importChat(event.dataTransfer.files && event.dataTransfer.files[0]); };
    if (!current) {
      const empty = UI.empty('还没有聊天', '导入酒馆的 jsonl 或消息数组。示例库里有一场雨夜。', '', null);
      stage.querySelector('#chat-body').appendChild(empty);
      return;
    }
    stage.querySelector('#export-chat').onclick = () => {
      const filename = `${UI.safeName(current.name)}.json`;
      UI.downloadJson(filename, current);
      UI.showExport(filename, '阅读稿。只供保存查阅，不会写回酒馆的 chats。');
    };
    stage.querySelector('#del-chat').onclick = () => deleteWork('chats',current);
    const body = stage.querySelector('#chat-body');
    const query = UI.state.passageQuery || '';
    body.innerHTML = `<div class="chat-wrap"><div class="paper stack">
      <strong>书签</strong>
      <div id="bookmark-list">${current.bookmarks.map((mark) => `<button type="button" class="btn btn-small bookmark" data-jump="${mark.index}">#${mark.index} ${UI.esc(mark.excerpt)}</button>`).join('') || '<p class="muted">还没有书签</p>'}</div>
    </div><div class="paper chat-paper" id="chat-paper">
      <div class="row"><input id="passage" type="text" placeholder="在这场聊天里找句子" value="${UI.esc(query)}"><button type="button" class="btn btn-small" id="prev-hit">上一处</button><button type="button" class="btn btn-small" id="next-hit">下一处</button><button type="button" class="btn btn-small" id="copy-sel">复制选段</button><button type="button" class="btn btn-small" id="mark-sel">选段做成书签</button></div>
      ${hint('涂选正文后再复制或做成书签。上一处、下一处在搜索命中之间跳。')}
      <p class="muted" id="hit-count"></p>
      <div id="chat-log"></div>
    </div></div>`;
    const paper = body.querySelector('#chat-paper');
    const bg = UI.assetById(lib.settings.chatBackgroundAssetId);
    if (bg) paper.style.backgroundImage = `linear-gradient(rgba(7,9,13,0.82), rgba(7,9,13,0.9)), url("${bg.dataUrl}")`;
    const log = body.querySelector('#chat-log');
    let marks = [];
    const renderLog = () => {
      const needle = (UI.state.passageQuery || '').trim();
      log.innerHTML = current.messages.map((message, index) => {
        const safe = UI.esc(message.mes);
        const html = needle ? safe.replace(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (hit) => `<mark>${hit}</mark>`) : safe;
        return `<article class="msg ${message.is_user ? 'user' : ''}" data-index="${index}"><header><span class="who">${UI.esc(message.name)}</span><span>${UI.esc(message.send_date || '')}</span></header><div class="body">${html.replace(/\n/g, '<br>')}</div></article>`;
      }).join('');
      root.TAJournal.markChat(log,current);
      marks = [...log.querySelectorAll('mark')];
      body.querySelector('#hit-count').textContent = needle ? `${marks.length} 处` : `${current.messages.length} 条消息`;
      if (root.TAI18n) root.TAI18n.localize(body.querySelector('#hit-count'));
    };
    renderLog();
    body.querySelector('#passage').addEventListener('input', (event) => {
      UI.state.passageQuery = event.target.value;
      UI.state.hit = 0;
      renderLog();
    });
    const jump = (delta) => {
      if (!marks.length) return;
      UI.state.hit = ((UI.state.hit || 0) + delta + marks.length) % marks.length;
      marks[UI.state.hit].scrollIntoView({ block: 'center' });
    };
    body.querySelector('#next-hit').onclick = () => jump(1);
    body.querySelector('#prev-hit').onclick = () => jump(-1);
    body.querySelectorAll('[data-jump]').forEach((button) => {
      button.onclick = () => log.querySelector(`[data-index="${button.dataset.jump}"]`)?.scrollIntoView({ block: 'center' });
    });
    const selectionInLog = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || !log.contains(selection.anchorNode)) return null;
      const node = selection.anchorNode.nodeType === 1 ? selection.anchorNode : selection.anchorNode.parentElement;
      const message = node.closest('[data-index]');
      return { text: selection.toString().trim(), index: message ? Number(message.dataset.index) : 0 };
    };
    body.querySelector('#copy-sel').onclick = () => {
      const picked = selectionInLog();
      if (!picked || !picked.text) { UI.toast('请先在正文里涂选一段'); return; }
      UI.copyText(picked.text);
    };
    body.querySelector('#mark-sel').onclick = () => {
      const picked = selectionInLog();
      if (!picked || !picked.text) { UI.toast('请先在正文里涂选一段'); return; }
      current.bookmarks.push({ id: Store.uid('bm'), index: picked.index, excerpt: picked.text.slice(0, 80), note: '' });
      UI.markDirty('chats',current.id,'metadata');
      UI.renderStage();
    };
  }

  async function readImage(file) {
    try { return await UI.readDataUrl(file); }
    catch (error) { throw new Error(file.name + ' · ' + UI.t(error.message)); }
  }

  async function ingestImages(files, kind) {
    if (!files?.length) return;
    const staged = [];
    try {
      for (const file of files) {
        if (!file.type.startsWith('image/')) throw new Error(file.name + ' · ' + UI.t('不是图片'));
        if (Store.backend !== 'indexedDB' && file.size > 1.6 * 1024 * 1024) throw new Error(`${file.name} 超过 1.6MB，请先压过再传`);
        if (Store.backend !== 'indexedDB' && file.size > 400 * 1024) {
          const answer = await UI.ask({
            title: '这张图不小',
            body: `${file.name} 大约 ${Math.round(file.size / 1024)}KB。素材以文本形式存在浏览器里，太大容易把库写满。`,
            actions: [{ id: 'yes', label: '仍然收进库', kind: 'btn-primary' }, { id: 'no', label: '取消' }],
          });
          if (answer !== 'yes') return;
        }
        const dataUrl = await readImage(file);
        staged.push({ id: Store.uid('asset'), name: file.name, kind, dataUrl, mime: file.type, bytes: file.size, createdAt: stamp() });
      }
      await commitCurrentLibrary(candidate => {
        candidate.assets = staged.reverse().concat(candidate.assets);
        if (Store.backend !== 'indexedDB' && Store.bytes(candidate) > 4.2 * 1024 * 1024) throw new Error('库快满了，这张放不下');
      });
      UI.renderStage();
    } catch (error) { UI.toast(UI.t(error.message),{kind:'error'}); }
  }

  function assets(stage) {
    const lib = UI.state.lib;
    const kind = UI.state.assetKind || 'all';
    const list = lib.assets.filter((asset) => (kind === 'all' || asset.kind === kind) && UI.matchQuery(asset.name));
    const asset = list.find((item) => item.id === UI.state.sel.asset) || null;
    stage.innerHTML = `<div class="toolbar">
      <button type="button" class="btn btn-primary" data-kind="avatar">上传头像</button>
      <button type="button" class="btn" data-kind="expression">上传表情</button>
      <button type="button" class="btn" data-kind="background">上传背景</button>
      ${['all', 'avatar', 'expression', 'background'].map((value) => `<button type="button" class="btn btn-small${kind === value ? ' btn-primary' : ''}" data-filter="${value}">${{ all: '全部', avatar: '头像', expression: '表情', background: '背景' }[value]}</button>`).join('')}
      <span class="spacer"></span>
      <span class="dark-muted">库约 ${Math.round(Store.bytes(lib) / 1024)} KB</span>
      ${hint(Store.backend === 'indexedDB' ? '图片保存在本机。拖入的图片会作为头像。' : '按种类上传。超过约 400KB 会先问你，超过 1.6MB 不收。拖进来的图先当头像。')}
    </div>
    <div class="work"><div class="asset-grid" id="asset-grid">${list.map((item) => `<button type="button" class="paper asset-card${item.id === (asset && asset.id) ? ' on' : ''}" data-id="${UI.esc(item.id)}"><img alt="" src="${UI.esc(item.dataUrl)}"><b>${UI.esc(item.name)}</b><small class="muted">${item.kind} · ${Math.max(1, Math.round((item.bytes || 0) / 1024))}KB</small></button>`).join('')}</div><div id="asset-side"></div></div>`;
    if (!list.length) stage.querySelector('#asset-grid').appendChild(UI.empty('素材库是空的', '上传头像、表情或聊天背景。大图会先提醒你。', '', null));
    stage.querySelectorAll('[data-kind]').forEach((button) => { button.onclick = () => ingestImagesFrom(button.dataset.kind); });
    stage.querySelectorAll('[data-filter]').forEach((button) => { button.onclick = () => { UI.state.assetKind = button.dataset.filter; UI.renderStage(); }; });
    stage.querySelectorAll('.asset-card').forEach((card) => { card.onclick = () => { UI.state.sel.asset = Store.byId(list,card.dataset.id)?.id; paintSide(); stage.querySelectorAll('.asset-card').forEach((item) => item.classList.toggle('on', item.dataset.id === card.dataset.id)); }; });
    stage.ondragover = (event) => event.preventDefault();
    stage.ondrop = (event) => { event.preventDefault(); return ingestImages([...event.dataTransfer.files], 'avatar'); };
    async function ingestImagesFrom(nextKind) {
      const files = await UI.pickFile('image/*', true);
      return ingestImages(files, nextKind);
    }
    function paintSide() {
      const current = lib.assets.find((item) => item.id === UI.state.sel.asset);
      const side = stage.querySelector('#asset-side');
      if (!current) { side.innerHTML = '<div class="paper empty"><h3>点一张图</h3><p class="muted">然后指定给角色，或设成聊天背景。</p></div>'; return; }
      side.innerHTML = `<div class="paper stack">
        ${UI.field('名称', UI.text('name', current.name))}
        ${UI.field('种类', `<select data-field="kind">${[['avatar', '头像'], ['expression', '表情'], ['background', '背景']].map(([value, label]) => `<option value="${value}"${current.kind === value ? ' selected' : ''}>${label}</option>`).join('')}</select>`)}
        ${UI.field('给角色当头像', `<select id="as-avatar"><option value="">选择角色</option>${lib.characters.map((character) => `<option value="${UI.esc(character.id)}">${UI.esc(character.name)}</option>`).join('')}</select>`)}
        <button type="button" class="btn" id="set-avatar">设为头像</button>
        ${UI.field('加入角色表情', `<select id="as-exp"><option value="">选择角色</option>${lib.characters.map((character) => `<option value="${UI.esc(character.id)}">${UI.esc(character.name)}</option>`).join('')}</select>`)}
        <button type="button" class="btn" id="set-exp">加入表情</button>
        <button type="button" class="btn" id="set-bg">设为聊天背景</button>
        <button type="button" class="btn btn-danger" id="del-asset">删除素材</button>
      </div>`;
      UI.bindFields(side, current, null,['assets',current.id,'metadata']);
      side.querySelector('#set-avatar').onclick = () => {
        const character = UI.charById(side.querySelector('#as-avatar').value);
        if (!character) { UI.toast('先选角色'); return; }
        character.avatarAssetId = current.id;
        current.kind = 'avatar';
        UI.markDirty('characters',character.id); UI.markDirty('assets',current.id,'metadata');
        UI.toast(`已设为「${character.name}」的头像`);
      };
      side.querySelector('#set-exp').onclick = () => {
        const character = UI.charById(side.querySelector('#as-exp').value);
        if (!character) { UI.toast('先选角色'); return; }
        character.expressionAssetIds = character.expressionAssetIds || [];
        if (!character.expressionAssetIds.includes(current.id)) character.expressionAssetIds.push(current.id);
        current.kind = 'expression';
        UI.markDirty('characters',character.id); UI.markDirty('assets',current.id,'metadata');
        UI.toast(`已加入「${character.name}」的表情`);
      };
      side.querySelector('#set-bg').onclick = () => {
        lib.settings.chatBackgroundAssetId = current.id;
        current.kind = 'background';
        UI.markDirty('settings'); UI.markDirty('assets',current.id,'metadata');
        UI.toast('聊天背景已换上');
      };
      side.querySelector('#del-asset').onclick = () => deleteWork('assets',current,'删除图片会解除使用它的引用。删除后可在提示中撤销。');
    }
    paintSide();
  }

  function regex(stage) {
    const lib = UI.state.lib;
    const list = lib.regexScripts.filter((script) => UI.matchQuery(script.scriptName + script.findRegex));
    const script = list.find((item) => item.id === UI.state.sel.regex) || list[0] || null;
    if (script) UI.state.sel.regex = script.id;
    stage.innerHTML = `<div class="toolbar">
      <button type="button" class="btn btn-primary" id="new-rx">新建脚本</button>
      <button type="button" class="btn" id="import-rx">导入 JSON</button>
      <button type="button" class="btn btn-primary" id="export-rx">导出全部</button>
      <button type="button" class="btn btn-danger" id="del-rx" ${script ? '' : 'disabled'}>删除</button>
      ${hint('新建或导入酒馆的正则 JSON。导出的仍是原来的数组。右侧按顺序讲每一截；试一句会标出匹配、分组、替换和没吃到的字。')}
    </div>${UI.picker(list, script && script.id, (item) => (item.disabled ? '停用' : '启用'))}<div id="rx-body"></div>`;
    mountPageAssist(stage, 'regex');
    UI.bindPicker(stage, (id) => { UI.state.sel.regex = id; UI.renderStage(); });
    stage.querySelector('#new-rx').onclick = () => {
      const created = { id: Store.uid('rx'), scriptName: '新脚本', findRegex: '', replaceString: '', trimStrings: [], placement: [2], disabled: false, markdownOnly: false, promptOnly: false, runOnEdit: false, substituteRegex: 0, minDepth: null, maxDepth: null };
      lib.regexScripts.unshift(created);
      UI.state.sel.regex = created.id;
      UI.markDirty();
      UI.renderStage();
    };
    stage.querySelector('#export-rx').onclick = () => {
      UI.downloadJson('regex-scripts.json', F.regexToExport(lib.regexScripts));
      UI.toast('已导出正则数组');
      UI.showExport('regex-scripts.json', '正则数组。在酒馆的正则扩展里导入。');
    };
    stage.querySelector('#import-rx').onclick = async () => {
      try {
        const file = await UI.pickFile('.json,application/json');
        if (!file) return;
        const scripts = F.regexFromImport(await parseJsonFile(file));
        scripts.forEach(item => { item.id = Store.uid('rx'); });
        await commitCurrentLibrary(candidate => { candidate.regexScripts = candidate.regexScripts.concat(scripts); });
        UI.renderStage();
      } catch (error) { UI.toast(UI.t(error.message),{kind:'error'}); }
    };
    if (!script) { stage.querySelector('#rx-body').appendChild(UI.empty('还没有脚本', '新建一条，或导入酒馆的正则 JSON。', '', null)); return; }
    stage.querySelector('#del-rx').onclick = () => deleteWork('regexScripts',script);
    const body = stage.querySelector('#rx-body');
    body.innerHTML = `<div class="work"><div class="paper stack">
      ${UI.field('名称', UI.text('scriptName', script.scriptName))}
      ${UI.field('查找', UI.text('findRegex', script.findRegex), '可写 /表达式/gi ，或不加斜杠')}
      <p class="help" id="rx-error"></p>
      ${UI.field('替换', UI.text('replaceString', script.replaceString), '可用 $1')}
      ${script.trimStrings?.length ? `<details><summary>裁剪字符串</summary>${script.trimStrings.map((value, index) => `<label class="field"><span>#${index + 1}</span><textarea rows="2" data-trim-index="${index}">${UI.esc(value)}</textarea></label>`).join('')}</details>` : ''}
      <div class="stack" id="places">${F.PLACEMENTS.map((place) => `<label class="check"><input type="checkbox" value="${place.id}" ${(script.placement || []).includes(place.id) ? 'checked' : ''}>${place.label}</label>`).join('')}<span class="help">勾选这则脚本作用的位置，与酒馆一致。</span></div>
      <label class="check"><input data-field="disabled" type="checkbox" ${script.disabled ? 'checked' : ''}>停用</label>
      <label class="check"><input data-field="markdownOnly" type="checkbox" ${script.markdownOnly ? 'checked' : ''}>仅 Markdown 显示</label>
      <label class="check"><input data-field="promptOnly" type="checkbox" ${script.promptOnly ? 'checked' : ''}>仅提示词</label>
      <div class="grid-2">${UI.field('最小深度', `<input data-field="minDepth" type="number" value="${script.minDepth ?? ''}">`)}${UI.field('最大深度', `<input data-field="maxDepth" type="number" value="${script.maxDepth ?? ''}">`)}</div>
    </div><aside class="paper stack" id="rx-side"><p class="eyebrow">表达式</p><div id="rx-read"></div><p class="eyebrow">试一句</p>${hint('贴一行字。下面给出匹配、捕获组和替换结果，不写入库。')}<textarea id="lab" rows="6" data-nolen>${UI.esc(UI.state.lab || '')}</textarea><div class="row"><button type="button" class="btn" id="run-rx">试跑</button><button type="button" class="btn" id="stop-rx" hidden>停止试跑</button></div><pre id="lab-out" class="snippet" role="status"></pre></aside></div>`;
    body.querySelectorAll('[data-trim-index]').forEach(node => { node.oninput = () => { script.trimStrings[Number(node.dataset.trimIndex)] = node.value; UI.markDirty('regexScripts',script.id); }; });
    const runner = root.TARegexRunner.createRunner();
    const sampleInput = body.querySelector('#lab'), stop = body.querySelector('#stop-rx');
    const out = body.querySelector('#lab-out');
    let generation = 0, timer;
    function paintRegex(trial, sample) {
      const read = body.querySelector('#rx-read');
      const error = body.querySelector('#rx-error');
      if (!String(script.findRegex || '').trim()) {
        error.textContent = '';
        UI.fillLesson(read, ['写下查找式后，这里按书写顺序讲每一截：字面、转义、字符类、锚点、量词、或者、分组和标志。']);
      } else {
        error.textContent = trial.ok ? '' : UI.t(trial.error);
        const steps = [...(trial.steps || [])];
        if (!trial.ok) steps.push(UI.t(trial.error));
        else if (!trial.groups.length) steps.push(UI.t('这则表达式没有捕获组。括号如果写成 (?: )，只分组，不记成绩。'));
        else steps.push(UI.t('rx.groups', { count: trial.groups.length, list: trial.groups.map((group) => group.name ? UI.t('rx.groupNamed', { n: group.index, name: group.name }) : UI.t('rx.group', { n: group.index })).join('、') }));
        UI.fillLesson(read, steps);
      }
      if (!sample) {
        out.textContent = UI.t('输入样例以预览匹配和替换。');
        return;
      }
      if (!trial.ok) {
        out.textContent = UI.t(trial.error);
        return;
      }
      if (!trial.matches.length) {
        out.textContent = UI.t('没有匹配。')+'\n'+trial.replaced;
        return;
      }
      const lines = [];
      trial.matches.forEach((match, index) => {
        lines.push(UI.t('匹配')+' '+(index+1)+' · '+UI.t('位置')+' '+(match.index+1)+' · '+match.text);
        match.groups.forEach((group) => {
          const who = group.name ? UI.t('rx.groupNamed',{n:group.index,name:group.name}) : UI.t('rx.group',{n:group.index});
          lines.push(who+' · '+group.value);
        });
      });
      if (trial.moreMatches) lines.push(UI.t('仅列出前八处匹配。'));
      else if (trial.unmatched.length) lines.push(UI.t('未匹配文本')+'\n'+trial.unmatched.join(' · '));
      lines.push(UI.t('替换结果')+'\n'+trial.replaced);
      out.textContent = lines.join('\n');
    }
    function stopTrial() {
      generation++;
      clearTimeout(timer);
      runner.cancel();
      stop.hidden = true;
    }
    function schedule(immediate = false) {
      stopTrial();
      const current = generation, sample = sampleInput.value;
      const run = async () => {
        if (!body.isConnected) return;
        stop.hidden = false;
        out.textContent = UI.t('正在试跑正则…');
        try {
          const [trial] = await runner.run(script.findRegex,[sample],script.replaceString);
          if (generation === current && body.isConnected) paintRegex(trial,sample);
        } catch (error) {
          if (generation === current && body.isConnected) out.textContent = UI.t(error.message);
        } finally {
          if (generation === current) stop.hidden = true;
        }
      };
      if (immediate) run(); else timer = setTimeout(run,140);
    }
    UI.bindFields(body, script, (key) => {
      if (key === 'minDepth' || key === 'maxDepth') script[key] = script[key] === '' ? null : Number(script[key]);
      if (key === 'findRegex' || key === 'replaceString') schedule();
    },['regexScripts',script.id]);
    body.querySelectorAll('#places input').forEach((box) => {
      box.onchange = () => {
        script.placement = [...body.querySelectorAll('#places input:checked')].map((item) => Number(item.value));
        UI.markDirty('regexScripts',script.id);
      };
    });
    sampleInput.oninput = () => { UI.state.lab = sampleInput.value; schedule(); };
    body.querySelector('#run-rx').onclick = () => schedule(true);
    stop.onclick = () => { stopTrial(); out.textContent = UI.t('正则试跑已取消。'); };
    schedule(true);
  }

  function quick(stage) {
    const lib = UI.state.lib;
    const sets = lib.quickReplySets.filter((set) => UI.matchQuery(set.name + set.replies.map((reply) => reply.label).join(' ')));
    const set = sets.find((item) => item.id === UI.state.sel.qr) || sets[0] || null;
    if (set) UI.state.sel.qr = set.id;
    stage.innerHTML = `<div class="toolbar">
      <button type="button" class="btn btn-primary" id="new-qr">新建一套</button>
      <button type="button" class="btn" id="import-qr">导入 JSON</button>
      <button type="button" class="btn btn-primary" id="export-qr" ${set ? '' : 'disabled'}>导出这套</button>
      <button type="button" class="btn btn-danger" id="del-qr" ${set ? '' : 'disabled'}>删除</button>
      ${hint('一套里有多条短句。导出为 Quick Reply v2；每条颜色记在 atelierColor。点「复制内容」只复制句子。')}
    </div>${UI.picker(sets, set && set.id, (item) => `${item.replies.length} 条`)}<div id="qr-body"></div>`;
    mountPageAssist(stage, 'quick');
    root.TACreationAssist.selectedReply(stage,set);
    UI.bindPicker(stage, (id) => { UI.state.sel.qr = id; UI.renderStage(); });
    stage.querySelector('#new-qr').onclick = () => {
      const created = { id: Store.uid('qrset'), name: '新的快捷回复', replies: [] };
      lib.quickReplySets.unshift(created);
      UI.state.sel.qr = created.id;
      UI.markDirty();
      UI.renderStage();
    };
    const importReplies = stage.querySelector('#import-qr');
    importReplies.onclick = async () => {
      try {
        const file = await UI.pickFile('.json,application/json');
        if (!file) return;
        const imported = F.qrFromImport(await parseJsonFile(file));
        imported.id = Store.uid('qrset');
        imported.replies.forEach((reply) => { reply.id = Store.uid('qr'); });
        await commitCurrentLibrary(candidate => candidate.quickReplySets.unshift(imported));
        if (importReplies.isConnected) UI.state.sel.qr = imported.id;
        UI.renderStage();
      } catch (error) { UI.toast(UI.t(error.message),{kind:'error'}); }
    };
    if (!set) { stage.querySelector('#qr-body').appendChild(UI.empty('还没有快捷回复', '做一组可以复制进输入框的短句。', '', null)); return; }
    stage.querySelector('#export-qr').onclick = () => {
      const filename = `${UI.safeName(set.name)}.json`;
      UI.downloadJson(filename, F.qrToExport(set));
      UI.toast('已导出快捷回复集');
      UI.showExport(filename, 'Quick Reply v2。在酒馆快捷回复扩展里导入。');
    };
    stage.querySelector('#del-qr').onclick = () => deleteWork('quickReplySets',set);
    const body = stage.querySelector('#qr-body');
    body.innerHTML = `<div class="paper stack">${UI.field('套名', UI.text('name', set.name))}
      <div id="qr-list">${set.replies.map((reply) => `<div class="paper" data-id="${UI.esc(reply.id)}" style="padding:10px">
        <div class="row"><input data-k="label" value="${UI.esc(reply.label)}" placeholder="按钮文字"><input data-k="color" type="color" value="${UI.esc(reply.color || '#c6a15a')}"><button type="button" class="btn btn-small" data-copy>复制内容</button><button type="button" class="btn btn-small btn-danger" data-del>删除</button></div>
        <textarea data-k="message" rows="3">${UI.esc(reply.message)}</textarea>
      </div>`).join('')}</div>
      <button type="button" class="btn" id="add-qr">添加一条</button><div id="qr-lesson"></div></div>`;
    UI.bindFields(body, set, null,['quickReplySets',set.id]);
    UI.mountLengths(body);
    const paintQrLesson = () => {
      const exported = F.qrToExport(set);
      const steps = [UI.t('qr.lead', { name: exported.name, color: exported.color || UI.t('空') })];
      if (!exported.qrList.length) steps.push(UI.t('这一套还没有句子。添加后，每一条变成 qrList 里的一项。'));
      exported.qrList.forEach((item, index) => {
        const message = String(item.message || '').replace(/\s+/g, ' ').trim();
        steps.push(UI.t('qr.item', { n: index + 1, label: item.label || UI.t('空'), text: message ? message.slice(0, 40) : UI.t('空'), color: item.atelierColor || UI.t('空') }));
      });
      UI.fillLesson(body.querySelector('#qr-lesson'), steps);
    };
    paintQrLesson();
    body.querySelectorAll('[data-id]').forEach((row) => {
      const reply = Store.byId(set.replies,row.dataset.id);
      row.querySelectorAll('[data-k]').forEach((node) => {
        node.addEventListener('input', () => { reply[node.dataset.k] = node.value; UI.markDirty('quickReplySets',set.id); paintQrLesson(); });
      });
      row.querySelector('[data-copy]').onclick = () => UI.copyText(reply.message || '');
      row.querySelector('[data-del]').onclick = () => { set.replies = set.replies.filter((item) => item.id !== reply.id); UI.markDirty('quickReplySets',set.id); UI.renderStage(); };
    });
    body.querySelector('#add-qr').onclick = () => {
      set.replies.push({ id: Store.uid('qr'), label: '新回复', message: '', color: '#c6a15a', title: '' });
      UI.markDirty('quickReplySets',set.id);
      UI.renderStage();
    };
  }

  function timeline(stage) {
    root.TAJournal.render(stage,mountPageAssist);
  }

  function nodeLabel(node) {
    return (node.characterId != null && UI.charById(node.characterId)?.name) || node.label || '未命名';
  }

  function graph(stage) {
    let lib = UI.state.lib, graphData = lib.graph;
    stage.innerHTML = `<div class="toolbar">
      <button type="button" class="btn" id="sync-nodes">从角色同步</button>
      <button type="button" class="btn btn-primary" id="export-graph">导出为世界书</button>
      ${hint('先从角色同步人物，再拖圆点。右侧选起点终点并写上关系。')}
    </div><div class="work"><div class="graph-wrap"><svg id="graph-svg" viewBox="0 0 800 560"></svg></div><div class="graph-side paper" id="graph-side"></div></div>`;
    mountPageAssist(stage, 'graph');
    const svg = stage.querySelector('#graph-svg');
    const paint = () => {
      const edges = graphData.edges.map((edge) => {
        const from = graphData.nodes.find((node) => node.id === edge.from);
        const to = graphData.nodes.find((node) => node.id === edge.to);
        if (!from || !to) return '';
        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy) || 1;
        const labelX = midX + (-dy / length) * 16;
        const labelY = midY + (dx / length) * 16;
        return `<g data-edge="${UI.esc(edge.id)}"><line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="transparent" stroke-width="16"/><line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="#ff2bd6" stroke-width="1.6"/><text x="${labelX}" y="${labelY}" fill="#3dffe8" font-size="13" text-anchor="middle">${UI.esc(edge.label || '')}</text></g>`;
      }).join('');
      const nodes = graphData.nodes.map((node) => `<g data-node="${UI.esc(node.id)}" transform="translate(${node.x} ${node.y})" style="cursor:grab"><circle r="36" fill="#101820" stroke="#3dffe8"/><text text-anchor="middle" y="5" font-size="14" fill="#d6ff3f">${UI.esc(nodeLabel(node).slice(0, 4))}</text></g>`).join('');
      svg.innerHTML = edges + nodes;
      svg.querySelectorAll('[data-node]').forEach((nodeEl) => {
        nodeEl.onpointerdown = (event) => {
          event.preventDefault();
          const node = graphData.nodes.find((item) => String(item.id) === nodeEl.dataset.node);
          UI.state.sel.node = node.id;
          const start = point(event);
          const dx = start.x - node.x;
          const dy = start.y - node.y;
          const move = (ev) => {
            const next = point(ev);
            node.x = Math.max(48, Math.min(752, next.x - dx));
            node.y = Math.max(48, Math.min(512, next.y - dy));
            nodeEl.setAttribute('transform', `translate(${node.x} ${node.y})`);
            paintEdgesOnly();
          };
          const up = () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            UI.markDirty('graph');
            paintSide();
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        };
      });
      svg.querySelectorAll('[data-edge]').forEach((edgeEl) => {
        edgeEl.onclick = () => { UI.state.sel.edge = graphData.edges.find(item=>String(item.id)===edgeEl.dataset.edge)?.id; paintSide(); };
      });
    };
    function paintEdgesOnly() {
      graphData.edges.forEach((edge) => {
        const from = graphData.nodes.find((node) => node.id === edge.from);
        const to = graphData.nodes.find((node) => node.id === edge.to);
        const group = svg.querySelector(`[data-edge="${CSS.escape(edge.id)}"]`);
        if (!from || !to || !group) return;
        group.querySelectorAll('line').forEach((line) => { line.setAttribute('x1', from.x); line.setAttribute('y1', from.y); line.setAttribute('x2', to.x); line.setAttribute('y2', to.y); });
        const text = group.querySelector('text');
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const length = Math.hypot(dx, dy) || 1;
        text.setAttribute('x', (from.x + to.x) / 2 + (-dy / length) * 16);
        text.setAttribute('y', (from.y + to.y) / 2 + (dx / length) * 16);
      });
    }
    function point(event) {
      const svgPoint = svg.createSVGPoint();
      svgPoint.x = event.clientX;
      svgPoint.y = event.clientY;
      const matrix = svg.getScreenCTM();
      const local = svgPoint.matrixTransform(matrix.inverse());
      return { x: local.x, y: local.y };
    }
    function paintSide() {
      const side = stage.querySelector('#graph-side');
      const form = Object.fromEntries([...side.querySelectorAll('select,input')].map(el => [el.id,el.value]));
      const edge = graphData.edges.find((item) => item.id === UI.state.sel.edge);
      side.innerHTML = `<h3>连一条线</h3>
        <label class="field"><span class="field-label">起点</span><select id="edge-from"></select></label>
        <label class="field"><span class="field-label">终点</span><select id="edge-to"></select></label>
        <label class="field"><span class="field-label">关系</span><input id="edge-label" type="text" placeholder="旧识、对手、主雇"></label>
        <label class="field"><span class="field-label">短注</span><input id="edge-note" type="text"></label>
        <button type="button" class="btn btn-primary" id="add-edge">添加关系</button>
        <label class="field"><span class="field-label">自定义人物</span><input id="node-label" type="text" placeholder="不在角色库里的名字"></label>
        <button type="button" class="btn" id="add-node">添加人物</button>
        ${edge ? `<hr><p>选中：${UI.esc(edge.label)}</p><button type="button" class="btn btn-danger" id="del-edge">删除这条线</button>` : ''}
        <p class="help">拖动圆点。导出时每条线变成一条选择性世界书条目。</p>
        <div id="graph-lesson"></div>`;
      const from = side.querySelector('#edge-from'), to = side.querySelector('#edge-to');
      for (const select of [from,to]) {
        for (const node of graphData.nodes) {
          const option = new Option(nodeLabel(node),String(node.id));
          option.dataset.noTranslate = ''; select.add(option);
        }
        if (graphData.nodes.some(node=>String(node.id)===form[select.id])) select.value = form[select.id];
        else if (select === to && select.options.length > 1) select.value = [...select.options].find(o=>o.value!==from.value).value;
      }
      for (const input of side.querySelectorAll('input')) input.value = form[input.id] || '';
      const built = F.graphToBook(graphData, lib);
      const steps = [UI.t('graph.lead')];
      if (!built.entries.length) steps.push(UI.t('还没有线。写上关系之后，这里会逐条说它会变成怎样的条目。'));
      built.entries.forEach((entry, index) => {
        steps.push(UI.t('graph.item', { n: index + 1, title: entry.comment, keys: entry.keys.join('、') || UI.t('没有'), secondary: (entry.secondaryKeys || []).join('、') || UI.t('没有'), order: entry.order, text: entry.content }));
      });
      UI.fillLesson(side.querySelector('#graph-lesson'), steps);
      side.querySelector('#add-edge').onclick = () => {
        const from = side.querySelector('#edge-from').value;
        const to = side.querySelector('#edge-to').value;
        const label = side.querySelector('#edge-label').value.trim();
        if (!from || !to || from === to) { UI.toast('请选两个不同的人'); return; }
        if (!label) { UI.toast('写上关系'); return; }
        graphData.edges.push({ id: Store.uid('edge'), from:graphData.nodes.find(n=>String(n.id)===from).id,
          to:graphData.nodes.find(n=>String(n.id)===to).id,label,note:side.querySelector('#edge-note').value.trim() });
        side.querySelector('#edge-label').value = ''; side.querySelector('#edge-note').value = '';
        UI.markDirty('graph');
        paint();
        paintSide();
      };
      side.querySelector('#add-node').onclick = () => {
        const label = side.querySelector('#node-label').value.trim();
        if (!label) return;
        graphData.nodes.push({ id: Store.uid('node'), characterId: null, label, x: 400, y: 280 });
        side.querySelector('#node-label').value = '';
        UI.markDirty('graph');
        paint();
        paintSide();
      };
      if (edge) side.querySelector('#del-edge').onclick = () => {
        graphData.edges = graphData.edges.filter((item) => item.id !== edge.id);
        UI.state.sel.edge = null;
        UI.markDirty('graph');
        paint();
        paintSide();
      };
    }
    stage.querySelector('#sync-nodes').onclick = () => {
      let changed = false;
      const synced = new Map(graphData.nodes.filter(node=>node.characterId != null).map(node=>[String(node.characterId),node]));
      lib.characters.forEach((character, index) => {
        const existing = synced.get(String(character.id));
        if (existing) {
          if (existing.label !== (character.name || '')) { existing.label = character.name || ''; changed = true; }
          return;
        }
        const angle = (index / Math.max(1, lib.characters.length)) * Math.PI * 2;
        graphData.nodes.push({ id: Store.uid('node'), characterId: character.id, label: character.name, x: 400 + Math.cos(angle) * 200, y: 280 + Math.sin(angle) * 150 });
        changed = true;
      });
      if (changed) UI.markDirty('graph');
      paint();
      paintSide();
      UI.toast('已把缺席的角色放到图上');
    };
    stage.querySelector('#export-graph').onclick = async () => {
      try {
        const result = F.syncGraphBook(UI.state.lib,UI.state.replyReference);
        if (!result.previous || JSON.stringify(result.previous)!==JSON.stringify(result.book)) {
          await UI.commitLibrary(result.library,[],false,null,result.previous ? {scopes:[['worldBooks',result.book.id],['graph']]} : {});
        } else if (!await UI.flush()) throw new Error('正在保存，请稍后重试。');
        lib = UI.state.lib; graphData = lib.graph;
        const filename = UI.safeName(result.book.name)+'.json';
        UI.downloadJson(filename,F.bookToWorldInfo(result.book));
        const message = UI.t('graph.exportSaved',{name:result.book.name}) +
          (result.retained ? ' '+UI.t('graph.exportRetained',{count:result.retained}) : '');
        UI.toast(message); UI.showExport(filename,message);
      } catch (error) {
        UI.toast(UI.t(error.message),{kind:'error'});
      }
    };
    paint();
    paintSide();
  }

  function check(stage) {
    const lib = UI.state.lib;
    const character = UI.selected(lib.characters, UI.state.sel.checkChar ?? 'ch_draft');
    const bookId = UI.state.sel.checkBook === undefined ? (lib.worldBooks[0]?.id ?? '') : UI.state.sel.checkBook;
    if (character) UI.state.sel.checkChar = character.id;
    stage.innerHTML = `<div class="toolbar">
      <label class="dark-muted">角色<select id="check-char" ${lib.characters.length ? '' : 'disabled'}>${lib.characters.length ? '' : '<option value="">还没有角色卡</option>'}${lib.characters.map((item) => `<option value="${UI.esc(item.id)}"${character && item.id === character.id ? ' selected' : ''}>${UI.esc(item.name)}</option>`).join('')}</select></label>
      <label class="dark-muted">对照世界书<select id="check-book"><option value="">不对照</option>${lib.worldBooks.map((item) => `<option value="${UI.esc(item.id)}"${item.id === bookId ? ' selected' : ''}>${UI.esc(item.name)}</option>`).join('')}</select></label>
      <button type="button" class="btn" id="run-check" ${character ? '' : 'disabled'}>本地规则检查</button>
      <button type="button" class="btn btn-primary" id="semantic-check" ${character ? '' : 'disabled'}>AI 逻辑与人设检查</button>
      <button type="button" class="btn" id="export-check">导出报告</button>
      ${hint('本地规则检查与 AI 审查分开展示。AI 意见须有原文证据，所有检查都只生成报告。')}
    </div><p class="model-progress" id="check-progress" role="status"></p><div id="check-lesson"></div><div id="model-check"></div><div id="findings"></div>`;
    const source = () => ({
      card: root.NIJANStudio.cardContent(UI.charById(stage.querySelector('#check-char').value)),
      book: root.NIJANStudio.bookContent(Store.byId(lib.worldBooks,stage.querySelector('#check-book').value)),
    });
    const paint = () => {
      const context = source();
      const host = stage.querySelector('#findings');
      const reportHost = stage.querySelector('#model-check');
      if (!context.card) {
        host.innerHTML = `<div class="paper empty"><h3>还没有角色卡可检查</h3><p>${root.nijanDesktop ? '从设置好的文件夹读取，或导入一张 JSON、PNG 角色卡。' : '这里显示当前浏览器已导入的角色卡。先导入一张，或回到原来保存资料的入口。'}</p><div class="row"><button type="button" class="btn btn-primary" data-check-import>导入角色卡</button>${root.nijanDesktop ? '<button type="button" class="btn" data-check-folder>读取角色卡文件夹</button>' : ''}</div></div>`;
        host.querySelector('[data-check-import]').onclick = () => document.querySelector('[data-shell="import-card"]').click();
        host.querySelector('[data-check-folder]')?.addEventListener('click', () => UI.readFolders());
        reportHost.innerHTML = '';
        UI.state.lastFindings = null;
        return;
      }
      const scopedLibrary = context.book ? lib : Object.assign({}, lib, {worldBooks: []});
      const findings = F.checkConsistency(scopedLibrary, context.card.id, context.book?.id);
      const report = (lib.settings.aiReviews || []).findLast((item) => item.cardId === context.card.id && (item.bookId ?? null) === (context.book?.id ?? null));
      const stale = !!report && report.source !== JSON.stringify({card:context.card,book:root.NIJANAI.reviewBook(context.book,report.entryIds)});
      UI.state.lastFindings = {character: context.card.name, book: context.book?.name || null, localFindings: findings, aiReview: report ? {...root.NIJANReview.gradedReport(report, lib), stale} : null};
      reportHost.innerHTML = report ? `<section class="paper ai-review"><h3>AI 检查报告</h3><p class="help">${report.entryIds ? `仅检查选中的 ${report.entryIds.length} 条世界书条目，不能代表整本书。` : "检查范围为所选角色卡与整本对照世界书。"}</p><p class="help">${UI.esc(new Date(report.createdAt).toLocaleString())}</p>${stale ? '<p class="banner">报告基于之前的稿件，原文已变化，请重新检查。</p>' : ''}${root.NIJANReview.html(report,lib)}</section>` : '<p class="help">当前选择还没有 AI 检查报告。</p>';
      root.NIJANReview.bind(reportHost,report);
      UI.fillLesson(stage.querySelector('#check-lesson'), [
        `本地规则检查：${context.card.name}${context.book ? `，对照「${context.book.name}」` : '，不对照世界书'}。可选留白只作提示。`,
        UI.t('check.names'), UI.t('check.colors'), UI.t('check.rules'),
      ]);
      host.innerHTML = `<h3>本地规则检查</h3>${findings.map((item) => `<article class="paper finding"><div class="sev ${item.severity}">${UI.esc(UI.t(item.severity === 'error' ? '冲突' : item.severity === 'warn' ? '存疑' : '备注'))}</div><h3>${UI.esc(UI.t(item.title))}</h3><p>${UI.esc(UI.t(item.detail))}</p>${item.snippet ? `<p class="snippet">${highlight(item.snippet, item.highlight)}</p>` : ''}</article>`).join('') || '<div class="paper empty"><p>本地规则未发现问题；这不代表已经通过 AI 审查。</p></div>'}`;
    };
    const syncTask = root.TATaskActivity.bindReview(stage.querySelector('#check-progress'), {
      button:stage.querySelector('#semantic-check'), progress:stage.querySelector('#check-progress'),
      source, after:paint
    });
    stage.querySelector('#run-check').onclick = paint;
    stage.querySelector('#check-char').onchange = (event) => { UI.state.sel.checkChar = UI.charById(event.target.value)?.id; syncTask(); };
    stage.querySelector('#check-book').onchange = (event) => { UI.state.sel.checkBook = Store.byId(lib.worldBooks,event.target.value)?.id ?? ''; syncTask(); };
    stage.querySelector('#export-check').onclick = () => {
      paint();
      if (!UI.state.lastFindings) { UI.toast('先选择要检查的角色。'); return; }
      const filename = `一致性-${UI.safeName(UI.state.lastFindings.character)}.json`;
      UI.downloadJson(filename, UI.state.lastFindings);
      UI.showExport(filename, '一致性报告，包含当前选择的本地检查和最近一次 AI 报告。');
    };
    paint();
  }


  function highlight(snippet, token) {
    const safe = UI.esc(snippet);
    if (!token) return safe;
    return safe.replace(new RegExp(UI.esc(token).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), (hit) => `<mark>${hit}</mark>`);
  }

  function script(stage) {
    const lib = UI.state.lib;
    const scripts = lib.scripts.filter((item) => UI.matchQuery(item.name + item.beats.map((beat) => beat.line).join('\n')));
    const current = scripts.find((item) => item.id === UI.state.sel.script) || scripts[0] || null;
    if (current) UI.state.sel.script = current.id;
    stage.innerHTML = `<div class="toolbar">
      <button type="button" class="btn btn-primary" id="new-script">新建剧本</button>
      <button type="button" class="btn btn-primary" id="export-script" ${current ? '' : 'disabled'}>导出 JSON</button>
      <button type="button" class="btn btn-danger" id="del-script" ${current ? '' : 'disabled'}>删除</button>
      ${hint('选说话的人再写句子。触发词可留空。上移、下移改顺序，右侧是预览。')}
    </div>${UI.picker(scripts, current && current.id, (item) => `${item.beats.length} 拍`)}<div id="script-body"></div>`;
    mountPageAssist(stage, 'script');
    UI.bindPicker(stage, (id) => { UI.state.sel.script = id; UI.renderStage(); });
    stage.querySelector('#new-script').onclick = () => {
      const created = { id: Store.uid('script'), name: '新剧本', beats: [{ id: Store.uid('sb'), speaker: 'narrator', line: '', trigger: '' }] };
      lib.scripts.unshift(created);
      UI.state.sel.script = created.id;
      UI.markDirty();
      UI.renderStage();
    };
    if (!current) { stage.querySelector('#script-body').appendChild(UI.empty('还没有剧本', '按顺序写旁白和角色的句子。', '', null)); return; }
    stage.querySelector('#export-script').onclick = () => {
      const filename = `${UI.safeName(current.name)}.json`;
      UI.downloadJson(filename, F.scriptToExport(current, lib));
      UI.toast('已导出剧本');
      UI.showExport(filename, '剧本草稿 JSON。酒馆没有对应的导入。');
    };
    stage.querySelector('#del-script').onclick = () => deleteWork('scripts',current);
    const speakers = [['narrator', UI.t('旁白')], ...lib.characters.map((character) => [character.id, character.name])];
    const body = stage.querySelector('#script-body');
    const paint = () => {
      body.innerHTML = `<div class="work"><div class="stack" id="beats">${UI.field('', '') && ''}<div class="paper" style="margin-bottom:10px">${UI.field('剧本名', UI.text('name', current.name))}</div>
        ${current.beats.map((beat, index) => `<article class="paper stack" data-i="${index}" style="margin-bottom:8px">
          <div class="row"><select data-k="speaker">${!speakers.some(([value])=>String(value)===String(beat.speaker))?`<option value="" selected>${UI.esc(beat.speakerName || UI.t('未指定发言人'))}</option>`:''}${speakers.map(([value,label])=>`<option value="${UI.esc(value)}"${String(beat.speaker)===String(value)?' selected':''}>${UI.esc(label)}</option>`).join('')}</select><button type="button" class="btn btn-small" data-up>上移</button><button type="button" class="btn btn-small" data-down>下移</button><button type="button" class="btn btn-small btn-danger" data-del>删除</button></div>
          <textarea data-k="line" rows="3">${UI.esc(beat.line)}</textarea>
          <input data-k="trigger" type="text" value="${UI.esc(beat.trigger || '')}" placeholder="可选触发词">
        </article>`).join('')}
        <button type="button" class="btn" id="add-beat">加一拍</button></div>
        <aside class="paper script-page" id="script-preview"></aside></div>`;
      const preview = () => {
        const exported = F.scriptToExport(current, lib);
        body.querySelector('#script-preview').innerHTML = `<p class="eyebrow">SCRIPT</p><h2>${UI.esc(current.name)}</h2>${current.beats.map((beat) => {
          const who = beat.speaker === 'narrator' ? UI.t('旁白') : F.scriptSpeaker(beat,lib);
          return `<div class="script-line"><div class="who">${UI.esc(who)}</div>${beat.trigger ? `<div class="trigger">${UI.t('script.trigger', { word: beat.trigger })}</div>` : ''}<p>${UI.esc(beat.line || '……')}</p></div>`;
        }).join('')}<div id="script-lesson"></div>`;
        UI.fillLesson(body.querySelector('#script-lesson'), [
          UI.t('script.lead', { name: exported.name, count: exported.beats.length }),
          ...exported.beats.map((beat) => UI.t('script.beat', {
            n: beat.order,
            who: beat.speaker === '旁白' || beat.speaker === 'narrator' ? UI.t('旁白') : beat.speaker,
            text: String(beat.line || '').replace(/\s+/g, ' ').trim().slice(0, 40) || UI.t('空'),
            tail: beat.trigger ? UI.t('script.tailOn', { word: beat.trigger }) : UI.t('script.tailOff'),
          })),
        ]);
      };
      UI.bindFields(body, current, preview,['scripts',current.id]);
      preview();
      body.querySelectorAll('[data-i]').forEach((row) => {
        const index = Number(row.dataset.i);
        const beat = current.beats[index];
        row.querySelectorAll('[data-k]').forEach((node) => {
          const eventName = node.tagName === 'SELECT' ? 'change' : 'input';
          node.addEventListener(eventName, () => { beat[node.dataset.k] = node.value; if(node.dataset.k==='speaker')delete beat.speakerName; preview(); UI.markDirty('scripts',current.id); });
        });
        row.querySelector('[data-del]').onclick = () => { current.beats.splice(index, 1); UI.markDirty('scripts',current.id); paint(); };
        row.querySelector('[data-up]').onclick = () => { if (index === 0) return; const [item] = current.beats.splice(index, 1); current.beats.splice(index - 1, 0, item); UI.markDirty('scripts',current.id); paint(); };
        row.querySelector('[data-down]').onclick = () => { if (index >= current.beats.length - 1) return; const [item] = current.beats.splice(index, 1); current.beats.splice(index + 1, 0, item); UI.markDirty('scripts',current.id); paint(); };
      });
      body.querySelector('#add-beat').onclick = () => { current.beats.push({ id: Store.uid('sb'), speaker: 'narrator', line: '', trigger: '' }); UI.markDirty('scripts',current.id); paint(); };
      UI.mountLengths(body);
    };
    paint();
  }

  function backupContent(library) {
    return {...library,meta:{...library.meta,updatedAt:undefined}};
  }

  function discardsRecentEdit(before, current, restored) {
    if (before === current || current === restored) return false;
    const values = [before,current,restored];
    const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
    if (values.every(value => value && typeof value === 'object' && !Array.isArray(value))) {
      const keys = new Set([...Object.keys(before),...Object.keys(current)]);
      return [...keys].some(key => discardsRecentEdit(before[key],current[key],restored[key]));
    }
    if (values.every(Array.isArray)) {
      const key = ['id','characterId'].find(key => values.every(rows => rows.every(row => row?.[key] != null)));
      if (key) {
        const [original,live,result] = values.map(rows => new Map(rows.map(row => [row[key],row])));
        const ids = new Set([...original.keys(),...live.keys()]);
        if ([...ids].some(id => discardsRecentEdit(original.get(id),live.get(id),result.get(id)))) return true;
        // A backup may add records. Compare the order of the ones present in the live collection.
        const order = [...live.keys()];
        return !same([...original.keys()],order) && !same(order,[...result.keys()].filter(id => live.has(id)));
      }
    }
    return !same(before,current) && !same(current,restored);
  }

  function backup(stage) {
    const lib = UI.state.lib;
    const rows = [
      ['角色', lib.characters.length],
      ['世界书', lib.worldBooks.length],
      ['提示词', lib.promptPresets.length],
      ['群', lib.groups.length],
      ['聊天', lib.chats.length],
      ['素材', lib.assets.length],
      ['正则', lib.regexScripts.length],
      ['快捷回复', lib.quickReplySets.length],
      ['剧本', lib.scripts.length],
      ['主题', lib.themes.length],
    ];
    stage.innerHTML = `<div class="toolbar">
      <button type="button" class="btn btn-primary" id="save-backup">导出整库</button>
      <button type="button" class="btn" id="load-backup">从备份恢复</button>
      ${Store.hasMigrationBackup ? '<button type="button" class="btn" id="migration-backup">'+UI.esc(UI.t('下载迁移前存档'))+'</button>' : ''}
      <button type="button" class="btn" id="backup-demo">载入示例</button>
      <button type="button" class="btn btn-danger" id="backup-clear">清空库</button>
      ${hint('导出一份带日期的 JSON。恢复时可把文件拖进来，再选替换或合并。')}
    </div>
    <p class="help" id="backup-note">${UI.esc((lib.settings && lib.settings.backupNote) || '')}</p>
    <div class="paper">
      <p class="eyebrow">LIBRARY</p>
      <h2>${UI.esc(lib.meta.name || '我的酒馆库')}</h2>
      <p>${UI.t('backup.about', { kb: Math.round(Store.bytes(lib) / 1024) })}</p>
      <div class="stats">${rows.map(([label, count]) => `<div class="stat"><b>${count}</b><span>${label}</span></div>`).join('')}</div>
      <p class="help">${UI.t('合并前逐项对比差异；替换会用备份覆盖整个资料库。')}</p>
    </div>`;
    mountPageAssist(stage, 'backup');
    root.TAIntegrityPanel.alternatives(stage,lib);
    root.TAHistoryPanel.mountOverview(stage);
    async function restoreFile(file) {
      if (!file) return;
      try {
        const data = await parseJsonFile(file);
        const {library:incoming,workState}=F.readBackup(data);
        const normalized = Store.verify(incoming);
        const atConfirmation = structuredClone(backupContent(UI.state.lib));
        let baseline,plan,review,mergeError='';
        if(workState){
          try {baseline=await root.TALibraryDB.workingState();}
          catch (_) {baseline=await root.TALibraryDB.replacementGuard();mergeError=UI.t('本机工作记录无法读取。可以选择完整替换，或取消恢复。');}
        }
        if(!mergeError){
          try {
            plan=root.TABackupReview.plan(UI.state.lib,incoming);
            review=root.TAIntegrityPanel.review(plan);
          } catch(error) {mergeError=UI.t(error.message);}
        }
        const content=review?.content || document.createElement('div');
        if(workState){
          const count=(s)=>UI.t('backup.workCounts',{d:s.drafts.length,v:s.versions.length,p:s.limits.length,r:s.records.length});
          const details=document.createElement('section');details.className='stack';
          const lines=[UI.t('备份内的工作状态')+' · '+count(workState)];
          if(baseline.state)lines.push(UI.t('当前设备的工作状态')+' · '+count(baseline.state));
          lines.push(UI.t('替换会用备份中的草稿、快照、保留策略和返回记录替换本机对应资料。'));
          if(review)lines.push(UI.t('合并保留双方不同的内容。同编号异文的草稿和返回记录另存，快照保留范围取较宽值。'));
          for(const value of lines){
            const p=document.createElement('p');p.textContent=value;details.append(p);
          }
          if(plan){
            const lite=s=>({...s,versions:[],limits:[]});
            const {copies}=root.TAWorkBackup.merge(lite(baseline.state),lite(workState),plan.proposed);
            if(copies.length){
              const box=document.createElement('details'),summary=document.createElement('summary'),list=document.createElement('ul');
              summary.textContent=UI.t('合并时另存的工作记录')+' · '+copies.length;
              for(const name of copies){const li=document.createElement('li');li.dataset.noTranslate='';li.textContent=name;list.append(li);}
              box.append(summary,list);details.append(box);
            }
          }
          content.prepend(details);
        }else{
          const note=document.createElement('p');note.textContent=UI.t('此旧版备份只含作品。已有的草稿、版本历史和模型返回记录将保留。');
          content.prepend(note);
        }
        const answer = await UI.ask({
          title: '恢复这份备份',
          body: `${UI.t('角色卡')} · ${normalized.characters.length}    ${UI.t('世界书')} · ${normalized.worldBooks.length}\n${mergeError || UI.t('合并前逐项对比差异；替换会用备份覆盖整个资料库。')}`,
          content,
          actions: [
            ...(review?[{ id: 'merge', label: '合并进来', kind: 'btn-primary' }]:[]),
            { id: 'replace', label: '替换当前库', kind: 'btn-danger' },
            { id: 'no', label: '取消' },
          ],
        });
        if (answer !== 'replace' && answer !== 'merge') return;
        const live = UI.state.lib;
        const copies=new Map();
        const candidate = answer === 'replace' ? normalized : root.TABackupReview.apply(plan,review.choices,live,copies);
        const currentContent = backupContent(live);
        const stale = answer === 'replace'
          ? JSON.stringify(atConfirmation) !== JSON.stringify(currentContent)
          : discardsRecentEdit(atConfirmation,currentContent,backupContent(candidate));
        if (stale) throw new Error('资料库已变化，请重新打开。');
        let transfer;
        if(workState){
          const state=answer==='replace'?workState:root.TAWorkBackup.merge(baseline.state,workState,candidate,copies).state;
          transfer=root.TAWorkBackup.transfer(baseline,state,answer);
        }
        const keepFocus=document.activeElement===stage.querySelector('#load-backup');
        await UI.commitLibrary(candidate,[],false,null,{transfer});
        if(answer==='replace')root.TAIntegrityPanel.resetUndo();
        UI.state.loreUndo?.clear();
        UI.applyTheme();
        UI.toast(answer === 'replace' ? '已替换为备份' : '已合并备份');
        UI.renderStage();
        if(keepFocus)document.querySelector('#load-backup')?.focus();
      } catch (error) { UI.toast(UI.t(error.message),{kind:'error'}); }
    }
    stage.querySelector('#migration-backup')?.addEventListener('click',async () => {
      try {
        const raw = await Store.migrationBackup();
        if (!raw) throw new Error('资料库已变化，请重新打开。');
        UI.downloadText('Quilvori-before-migration.json',raw);
      } catch (error) { UI.toast(UI.t(error.message),{kind:'error'}); }
    });
    stage.querySelector('#save-backup').onclick = async event => {
      const button=event.currentTarget;button.disabled=true;
      try{
        let packet;
        if(root.TALibraryDB.database()){
          try{
            if(await UI.flush()){
              const snapshot=await root.TALibraryDB.workingState(true);
              packet=F.backupOf(snapshot.library,snapshot.state);
            }else{
              const proceed=await UI.ask({title:'当前改动尚未写入',body:'可将当前窗口的作品和设备中已保存的工作记录导出到同一文件。',
                actions:[{id:'export',label:'导出当前窗口'},{id:'cancel',label:'取消'}]});
              if(proceed!=='export')return;
              const library=structuredClone(UI.state.lib),snapshot=await root.TALibraryDB.workingState(false,true);
              packet=F.backupOf(library,snapshot.state);
            }
          }catch(error){
            const choice=await UI.ask({title:'无法读取完整工作状态',body:UI.t(error.message),
              actions:[{id:'works',label:'仅导出当前作品库'},{id:'cancel',label:'取消'}]});
            if(choice!=='works')return;
            packet=F.backupOf(UI.state.lib,null);
          }
        }else packet=F.backupOf(UI.state.lib,null);
        const now = new Date();
        const day = [now.getFullYear(),now.getMonth()+1,now.getDate()].map(n=>String(n).padStart(2,'0')).join('-');
        const filename = UI.t('backup.filename',{day});
        UI.downloadJson(filename,packet);
        UI.toast(packet.workState?'整库已导出':UI.t('已导出作品库，文件仅含当前作品。'));
        UI.showExport(filename, '整库 JSON。回到「整库备份」，拖进来再选替换或合并。');
      }catch(error){UI.toast(UI.t(error.message),{kind:'error'});}finally{button.disabled=false;}
    };
    stage.querySelector('#load-backup').onclick = async () => restoreFile(await UI.pickFile('.json,application/json'));
    stage.querySelector('#backup-demo').onclick = UI.confirmLoadDemo;
    stage.querySelector('#backup-clear').onclick = UI.confirmClear;
    stage.ondragover = (event) => event.preventDefault();
    stage.ondrop = (event) => {
      event.preventDefault();
      restoreFile(event.dataTransfer.files && event.dataTransfer.files[0]);
    };
  }


  function mountSticker(stage, owner) {
    const host = stage.querySelector('#sticker-host');
    if (!host) return;
    const lib = UI.state.lib;
    if (!Array.isArray(lib.stickerPacks)) lib.stickerPacks = [];
    host.innerHTML = `<div class="paper stack"><p class="eyebrow">表情包（可选）</p><p class="help">一套可以同时挂到人物卡和世界书。没选的话，导出只有卡和世界书。</p><label class="field"><span class="field-label">使用的一套</span><select id="pack-select"><option value="">不使用</option>${lib.stickerPacks.map((pack) => `<option value="${UI.esc(pack.id)}"${owner && owner.stickerPackId === pack.id ? ' selected' : ''}>${UI.esc(pack.name)}</option>`).join('')}</select></label><div class="row"><button type="button" class="btn btn-small" id="pack-new">新建一套</button><button type="button" class="btn btn-small" id="pack-add">加入图片</button><button type="button" class="btn btn-small" id="pack-export">导出表情文件夹</button></div></div>`;
    host.querySelector('#pack-select').onchange = (event) => {
      if (!owner) { UI.toast('先选定一张卡或一本书'); return; }
      owner.stickerPackId = Store.byId(lib.stickerPacks,event.target.value)?.id ?? null;
      UI.markDirty(UI.state.route==='lore' ? 'worldBooks' : 'characters',owner.id);
      UI.renderStage();
    };
    host.querySelector('#pack-new').onclick = () => {
      const name = window.prompt('表情包名称', '一套表情');
      if (!name) return;
      const pack = { id: Store.uid('pack'), name: name.trim(), stickers: [] };
      lib.stickerPacks.push(pack);
      if (owner) owner.stickerPackId = pack.id;
      UI.markDirty();
      UI.renderStage();
    };
    host.querySelector('#pack-add').onclick = async () => {
      const packId = owner?.stickerPackId;
      if (!packId) { UI.toast('先选定一套表情包'); return; }
      const collection = UI.state.route === 'lore' ? 'worldBooks' : 'characters';
      try {
        const files = await UI.pickFile('image/*', true);
        if (!files?.length) return;
        const stickers = [];
        for (const file of files) {
          stickers.push({name:file.name,dataUrl:await readImage(file)});
        }
        await commitCurrentLibrary(candidate => {
          const pack = candidate.stickerPacks.find(item => item.id === packId);
          if (!pack || !candidate[collection].some(item => item.id === owner.id)) throw new Error('资料库已变化，请重新打开。');
          pack.stickers = (pack.stickers || []).concat(stickers);
        });
        UI.renderStage();
      } catch (error) { UI.toast(UI.t(error.message),{kind:'error'}); }
    };
    host.querySelector('#pack-export').onclick = () => {
      const pack = lib.stickerPacks.find((item) => owner && item.id === owner.stickerPackId);
      if (!pack) { UI.toast('这张卡或这本书没有表情包'); return; }
      return exportStickerFiles(pack, owner.name || pack.name);
    };
  }

  async function exportStickerFiles(pack, characterName, cardReceipt) {
    const report = (message, kind) => {
      UI.toast(message, {kind});
      UI.showExport(cardReceipt?.filename || pack.name, [cardReceipt?.message, message].filter(Boolean).join(' '));
    };
    const stickers = pack.stickers || [];
    if (!stickers.length) {
      report(UI.t('这套表情包里还没有图片。'), 'info');
      return;
    }
    const failureText = err => {
      const key = {
        'invalid-expression-folder':'请先设置人物卡文件夹，再导出表情。',
        'invalid-expression-name':'export.expressionData','invalid-expression-export':'export.expressionData',
        'duplicate-expression-name':'export.expressionData','invalid-expression-image':'export.expressionData',
        'unsafe-expression-file':'export.expressionTarget','invalid-expression-path':'export.expressionTarget',
        'expression-changed':'export.expressionChanged','expression-busy':'export.expressionBusy',
        'expression-filesystem':'export.expressionFilesystem','expression-recovery':'export.expressionRecovery',
      }[err?.code];
      return key ? UI.t(key,{path:err.recovery || err.file || characterName}) : UI.t(err?.reason || err?.message || 'write-failed');
    };
    try {
      const files = root.TAStBundle.expressionFiles(characterName,stickers);
      if (root.nijanDesktop) {
        const paths = await root.nijanDesktop.getPaths();
        if (!paths?.cards) {
          report(UI.t('请先设置人物卡文件夹，再导出表情。'), 'warning');
          return;
        }
        const dest = await root.nijanDesktop.writeExpressions({folder:paths.cards,character:characterName,files,lang:root.TAI18n?.prefs.lang});
        if (!dest || dest.canceled) {
          report(UI.t('已取消表情导出。'), 'info');
          return;
        }
        if(dest.ok===false){
          report(UI.t('export.expressionsFailed',{reason:failureText(dest)}),'error');
          return;
        }
        const written=UI.t('export.expressionsWritten',{count:files.length,path:dest.directory || dest});
        report(dest.cleanup?written+' '+UI.t('export.expressionCleanup',{path:dest.cleanup}):written,dest.cleanup?'warning':'success');
        return;
      }
      for (const sticker of files) {
        const link = document.createElement('a');
        link.href = sticker.dataUrl;
        link.download = sticker.name;
        document.body.appendChild(link);
        try { link.click(); } finally { link.remove(); }
      }
      report(UI.t('export.expressionsRequested', {count:files.length, path:`${characterName}/expressions`}), 'info');
    } catch (error) {
      if (error.name === 'AbortError') report(UI.t('已取消表情导出。'), 'info');
      else report(UI.t('export.expressionsFailed', {reason:failureText(error)}), 'error');
    }
  }

  function mountJson(stage, kind, owner) {
    const host = stage.querySelector('#json-host');
    if (!host || !owner || !root.TAI18n || !root.TAI18n.prefs.jsonMode) { if (host) host.innerHTML = ''; return; }
    const data = kind === 'card' ? F.characterToCard(owner, null) : F.bookToWorldInfo(owner);
    host.innerHTML = `<details class="paper"><summary>JSON 互转</summary><textarea id="json-box" rows="8">${UI.esc(JSON.stringify(data, null, 2))}</textarea><button type="button" class="btn" id="json-back">从 JSON 转回</button></details>`;
    host.querySelector('#json-back').onclick = async () => {
      try {
        const raw = host.querySelector('#json-box').value;
        const next = structuredClone(UI.state.lib);
        if (kind === 'card') {
          const target = next.characters.find(row=>row.id===owner.id);
          const {card} = root.TAFolderImport.parseCard({name:'card.json'},new TextEncoder().encode(raw));
          if (card.book) {
            const companion = root.TAFolderImport.makeBook(card.book,card.name+' · '+UI.t('世界书'));
            next.worldBooks.unshift(companion); card.embeddedBookId = companion.id;
          }
          delete card.book;
          Object.assign(target,card);
        } else {
          const target = next.worldBooks.find(row=>row.id===owner.id);
          const ids = new Map(F.bookToCharacterBook(target).entries.map((entry,index)=>[entry.id,target.entries[index].id]));
          const book = F.worldInfoToBook(JSON.parse(raw),owner.name);
          book.entries = book.entries.map(entry => {
            const id = ids.get(entry.stUid) || Store.uid('lore'); ids.delete(entry.stUid);
            return {...entry,id};
          });
          Object.assign(target,book);
        }
        await UI.commitLibrary(next);
        UI.renderStage();
      } catch (error) { UI.toast(error.message || '这份 JSON 转不回来'); }
    };
  }

  function tutorial(stage) {
    const steps = [
      ['打开', '在这个目录运行 python3 -m http.server 8765，或在桌面版运行 npm start。浏览器打开本机 8765。'],
      ['导入', '左侧「导入角色卡」接受 JSON 或带 chara 的 PNG。「导入世界书」接受酒馆 {entries}，也接受条目名、触发关键词、正文。页面上方的虚线框可以直接拖。'],
      ['书写', '角色卡工坊写字段。世界书看板改条目。段落预设会写成真正的作者注、世界书、正则和快捷回复。'],
      ['检查', '人设一致性检查始终做空字段、重复和关键词。配置了模型之后，同一页的「语义检查」才读前后矛盾。'],
      ['导出到酒馆', '角色卡 JSON 或 PNG 放到 SillyTavern 的 characters，或在角色列表里导入。世界书 JSON 放到 worlds，或在世界信息里导入。正则数组放到正则扩展。快捷回复放到 Quick Reply。表情图片放到该角色目录下的 expressions。世界书只在你选了表情包时记下套名。'],
      ['文件夹', '桌面版可以用页面上方的按钮选定人物卡文件夹和世界书文件夹，并读取里面已有的文件。两条路径会写在页面上。'],
    ];
    stage.innerHTML = `<div class="paper stack"><p class="eyebrow">GUIDE</p><h2>从打开到放进酒馆</h2>${steps.map(([title, body], index) => `<section><h3>${index + 1}. ${title}</h3><p>${body}</p></section>`).join('')}<div class="row"><button type="button" class="btn btn-primary" id="walk-demo">用示例走一遍导入、检查和导出</button><a class="btn" href="lore.html">去世界书页</a><a class="btn" href="check.html">去检查页</a></div><div id="walk-out"></div></div>`;
    stage.querySelector('#walk-demo').onclick = () => {
      const lib = UI.state.lib;
      const book = lib.worldBooks[0];
      const character = lib.characters[0];
      const imported = book ? F.worldInfoToEntries(F.bookToWorldInfo(book)) : [];
      const findings = character ? F.checkConsistency(lib, character.id, book && book.id) : [];
      const cardName = character ? `${UI.safeName(character.name)}.json` : '角色卡.json';
      const bookName = book ? `${UI.safeName(book.name)}.json` : '世界书.json';
      stage.querySelector('#walk-out').innerHTML = `<ol class="lesson"><li>导入：示例世界书「${UI.esc(book ? book.name : '')}」拆出 ${imported.length} 条，第一条是「${UI.esc(imported[0] ? imported[0].comment : '')}」。</li><li>检查：对「${UI.esc(character ? character.name : '')}」跑规则检查，得到 ${findings.length} 条。语义检查要等模型配置好。</li><li>导出：${UI.esc(cardName)} 放到酒馆 characters；${UI.esc(bookName)} 放到酒馆 worlds。正则是 regex-scripts.json，快捷回复是各套自己的 JSON。</li></ol>`;
    };
  }

  function sections(stage) {root.TASections.render(stage);}

  function memory(stage) {
    const lib = UI.state.lib;
    if (typeof lib.memoryHtml !== 'string') lib.memoryHtml = '';
    const steps = [
      ['安装扩展', '在 SillyTavern 打开扩展页。若还没有 JS-Slash-Runner（酒馆助手），用扩展管理器安装并启用。已经装过就只要启用。'],
      ['打开面板', '点聊天页上的酒馆助手按钮，进入脚本。'],
      ['导入文件', '新建一条脚本，类型选 HTML。点导入，选择叙翎集导出的 HTML 记忆文件；如果导入只收 JSON，就把文件内容粘进脚本正文。'],
      ['启用面板', '保存并勾选启用。聊天旁边会出现这块 HTML 记忆面板。以后在叙翎集改完，重新导出，再替换同一条脚本的内容。'],
    ];
    stage.innerHTML = `<div class="stack">
      <section class="paper stack">
        <div class="row">
          <button type="button" class="btn" id="memory-import">导入 HTML</button>
          <button type="button" class="btn btn-primary" id="memory-export">导出 HTML</button>
        </div>
        ${UI.field('记忆 HTML', `<textarea id="memory-html" rows="14">${UI.esc(lib.memoryHtml)}</textarea>`)}
        <p class="help">这里写或贴 SillyTavern 记忆扩展用来显示的 HTML 面板。预览在下方，脚本跑在隔离框里。</p>
        <div id="memory-assist"></div>
      </section>
      <section class="paper">
        <h3>预览</h3>
        <iframe id="memory-preview" class="memory-frame" sandbox="allow-scripts" title="HTML 记忆预览"></iframe>
      </section>
      <section class="paper stack">
        <h3>放进 SillyTavern</h3>
        <ol class="lesson">${steps.map(([title, body], index) => `<li><strong>${index + 1}. ${title}</strong> ${body}</li>`).join('')}</ol>
      </section>
    </div>`;
    const frame = stage.querySelector('#memory-preview');
    const area = stage.querySelector('#memory-html');
    const paint = () => { frame.srcdoc = area.value || '<p></p>'; };
    area.addEventListener('input', () => { lib.memoryHtml = area.value; UI.markDirty('memoryHtml'); paint(); });
    paint();
    mountPageAssist(stage, 'memory');
    stage.querySelector('#memory-import').onclick = async () => {
      const original = UI.state.lib.memoryHtml;
      try {
        const file = await UI.pickFile('.html,.json,text/html,application/json');
        if (!file) return;
        const raw = await file.text();
        let html = raw;
        if (/\.json$/i.test(file.name) || raw.trim().startsWith('{')) {
          const data = JSON.parse(raw);
          html = data.html || data.memory || data.content || '';
          if (typeof html !== 'string' || !html) throw new Error('这份 JSON 里没有 html');
        }
        await commitCurrentLibrary(candidate => {
          if (candidate.memoryHtml !== original) throw new Error('资料库已变化，请重新打开。');
          candidate.memoryHtml = html;
        });
        UI.renderStage();
        UI.toast('已导入 HTML 记忆',{kind:'success'});
      } catch (error) {
        if (area.isConnected && area.value !== UI.state.lib.memoryHtml) UI.renderStage();
        UI.toast(UI.t(error.message || '这份记忆读不了'),{kind:'error'});
      }
    };
    stage.querySelector('#memory-export').onclick = () => {
      const filename = '叙翎集-html-memory.html';
      UI.downloadText(filename, area.value || '', 'text/html');
      UI.showExport(filename, 'HTML 记忆文件。按本页步骤放进 SillyTavern 的酒馆助手。');
    };
  }

  function paintFindings(host, findings) {
    if (!host) return;
    const buckets = { empty: [], name: [], rule: [], model: [] };
    findings.forEach((item) => {
      const title = String(item.title || '');
      const bucket = item.evidence ? 'model' : /空|empty/i.test(title) ? 'empty' : /名|typo|发色|瞳/i.test(title) ? 'name' : /模型|语义/.test(title) ? 'model' : 'rule';
      buckets[bucket].push(item);
    });
    const block = (key, label) => `<section><h4>${UI.t(label)}</h4>${buckets[key].length ? buckets[key].map((item) => `<p><strong>${UI.esc(UI.t(item.severity === 'error' ? '冲突' : item.severity === 'warn' ? '存疑' : '备注'))}</strong> ${UI.esc(UI.t(item.title))}${item.entry ? ` · ${UI.esc(item.entry)}` : ''}${item.place ? ` · ${UI.esc(item.place)}` : ''}。${UI.esc(item.detail || '')}</p>`).join('') : `<p class="help">${UI.t('这里还没有。')}</p>`}</section>`;
    host.innerHTML = `${block('empty', '空栏')}${block('name', '名字与笔误')}${block('rule', '恒定规矩')}${block('model', '模型判断')}`;
  }

  async function runPersona(host, character, bookId) {
    if (!character) { UI.toast('先有一张角色卡'); return; }
    const findings = F.checkConsistency(UI.state.lib, character.id, bookId ?? null);
    paintFindings(host, findings);
  }

  async function fillGaps(character) {
    if (!character) { UI.toast('先有一张角色卡'); return; }
    root.NIJANOrganizePanel.open({ kind: 'character', cardId: character.id });
  }

  function mountAiBar(stage, page) {
    if (!stage || stage.querySelector('.ai-toolbar')) return;
    const host = document.createElement('section');
    host.className = 'paper stack ai-toolbar';
    const cards = UI.state.lib.characters || [];
    const books = UI.state.lib.worldBooks || [];
    host.innerHTML = `<div class="row"><label class="field"><span class="field-label">${UI.t('角色卡')}</span><select data-logic-card>${cards.map((item) => `<option value="${UI.esc(item.id)}"${item.id === UI.state.sel.character ? ' selected' : ''}>${UI.esc(item.name || '未命名')}</option>`).join('')}</select></label><label class="field"><span class="field-label">${UI.t('世界书')}</span><select data-logic-book>${books.map((item) => `<option value="${UI.esc(item.id)}"${item.id === UI.state.sel.book ? ' selected' : ''}>${UI.esc(item.name || '未命名')}</option>`).join('')}</select></label></div><div class="row"><button type="button" class="btn" data-ai="persona">${UI.t('本地规则检查')}</button><button type="button" class="btn" data-ai="logic">${UI.t('AI 逻辑与人设检查')}</button><button type="button" class="btn" data-ai="gaps">${UI.t(page === 'book' ? 'AI 整理条目' : '整理分栏')}</button></div><p class="model-progress"></p><div class="ai-check-grid" data-ai-out></div>`;
    const toolbar = stage.querySelector('.toolbar');
    if (toolbar) toolbar.insertAdjacentElement('afterend', host);
    else stage.prepend(host);
    host.querySelectorAll('[data-logic-card], [data-logic-book]').forEach((select) => UI.enhanceSelect(select));
    const out = host.querySelector('[data-ai-out]');
    const chosenCard = () => UI.charById(host.querySelector('[data-logic-card]').value);
    const chosenBook = () => Store.byId(UI.state.lib.worldBooks,host.querySelector('[data-logic-book]').value);
    const progress = host.querySelector('.model-progress');
    host.querySelector('[data-ai="persona"]').onclick = () => {
      progress.textContent = UI.t('正在检查…');
      const card = chosenCard();
      const book = chosenBook();
      if (card) UI.state.sel.character = card.id;
      if (book) UI.state.sel.book = book.id;
      runPersona(out, card, book && book.id);
      progress.textContent = UI.t('检查写完了');
    };
    const syncTask = root.TATaskActivity.bindReview(host,{
      button:host.querySelector('[data-ai="logic"]'),progress,output:out,
      source:()=>({card:root.NIJANStudio.cardContent(chosenCard()),book:root.NIJANStudio.bookContent(chosenBook())})
    });
    host.querySelector('[data-logic-card]').addEventListener('change',()=>{ UI.state.sel.character=chosenCard()?.id; syncTask(); });
    host.querySelector('[data-logic-book]').addEventListener('change',()=>{ UI.state.sel.book=chosenBook()?.id; syncTask(); });
    host.querySelector('[data-ai="gaps"]').onclick = () => {
      progress.textContent = '';
      if (page === 'book') {
        const book = chosenBook();
        if (book) root.NIJANOrganizePanel.open({ kind: 'world', bookId: book.id });
        else UI.toast('先选一本世界书');
      } else fillGaps(chosenCard()).catch((error) => UI.toast(error.message));
    };
  }

  function mountPageAssist(stage, kind) {
    if (!stage || stage.querySelector('.ai-assist')) return;
    const box = document.createElement('section');
    box.className = 'paper stack ai-assist';
    box.innerHTML = `<h3>${UI.esc(root.NIJANAI.MODULES[kind] || 'AI 辅助')}</h3><label class="field"><span class="field-label">写下要求</span><textarea rows="3" data-assist></textarea></label><button type="button" class="btn" data-assist-go>生成并预览</button><p class="model-progress" role="status"></p>`;
    stage.prepend(box);
    root.TATaskActivity.bindAssist(box,kind);
  }

  function studio(stage) {
    if (root.NIJANStudio) root.NIJANStudio.render(stage);
  }

  root.TALibraryDB.start({
    home, resources: stage => root.TAResourcePanel.render(stage), themes:stage=>root.TAThemeWorkshop.render(stage), studio, characters, lore, prompts, groups, chat, assets, regex, quick, timeline, graph, check, script, backup, sections, memory, tutorial,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
