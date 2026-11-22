/* The fourteen workshop modules, plus the desk overview. */
(function (root) {
  const UI = root.TAUI;
  const F = root.TAFormats;
  const Store = root.TAStore;

  function stamp() { return new Date().toISOString(); }

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

  function adoptCharacterBook(spec, ownerName) {
    if (!spec || !Array.isArray(spec.entries) || !spec.entries.length) return null;
    const book = {
      id: Store.uid('book'),
      name: spec.name || `${ownerName || '角色'}·角色书`,
      description: spec.description || '随角色卡导入',
      entries: F.worldInfoToEntries({ entries: spec.entries }).map((entry) => Object.assign(blankEntry(), entry, { id: Store.uid('lore') })),
    };
    UI.state.lib.worldBooks.push(book);
    return book;
  }

  function pushCharacter(partial, book) {
    const clean = Object.assign({}, partial);
    delete clean.book;
    const character = Object.assign(blankCharacter(), clean, { id: Store.uid('ch'), createdAt: stamp(), updatedAt: stamp() });
    const specBook = book || partial.book;
    if (specBook) {
      const saved = adoptCharacterBook(specBook, character.name);
      if (saved) UI.toast(`一并收入角色书「${saved.name}」，${saved.entries.length} 条`);
    }
    UI.state.lib.characters.unshift(character);
    UI.state.sel.character = character.id;
    UI.markDirty();
    UI.renderStage();
  }

  async function importCharacterFile(file) {
    try {
      if (!file) return;
      const isPng = /png$/i.test(file.type) || /\.png$/i.test(file.name);
      if (isPng) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const raw = root.TAPng.readChara(bytes);
        if (!raw) throw new Error('这张 PNG 里没有 chara 数据');
        const card = JSON.parse(raw);
        const partial = F.cardToCharacter(card);
        if (file.size <= 900000) {
          const asset = {
            id: Store.uid('asset'), name: `${partial.name || file.name}·头像`, kind: 'avatar',
            dataUrl: await UI.readDataUrl(file), mime: 'image/png', bytes: file.size, createdAt: stamp(),
          };
          UI.state.lib.assets.push(asset);
          partial.avatarAssetId = asset.id;
        } else {
          UI.toast('PNG 太大，没有收进素材库，卡面文字已经导入');
        }
        pushCharacter(partial, partial.book);
        UI.toast(`已导入角色「${partial.name || '未命名'}」`);
        return;
      }
      const card = await parseJsonFile(file);
      const partial = F.cardToCharacter(card);
      pushCharacter(partial, partial.book);
      UI.toast(`已导入角色「${partial.name || '未命名'}」`);
    } catch (error) {
      UI.toast(error.message || '导入失败');
    }
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

  async function exportCharacterPng(character, book) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    drawSeal(ctx, character.name);
    const avatar = UI.assetById(character.avatarAssetId);
    if (avatar) {
      try {
        const image = await loadImage(avatar.dataUrl);
        ctx.drawImage(image, 0, 0, 512, 512);
      } catch (error) { /* 印章已经画好 */ }
    }
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('浏览器没有给出 PNG');
    const png = root.TAPng.embedChara(new Uint8Array(await blob.arrayBuffer()), JSON.stringify(F.characterToCard(character, book)));
    UI.downloadBlob(`${UI.safeName(character.name)}.png`, new Blob([png], { type: 'image/png' }));
  }

  function mountChips(host, list, placeholder, onChange) {
    const paint = (focus) => {
      host.innerHTML = `${list.map((item, index) => `<button type="button" class="chip" data-i="${index}">${UI.esc(item)} ×</button>`).join('')}<input class="chip-input" placeholder="${UI.esc(placeholder)}">`;
      host.querySelectorAll('.chip').forEach((button) => {
        button.onclick = () => {
          list.splice(Number(button.dataset.i), 1);
          paint(false);
          onChange();
          UI.markDirty();
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
        UI.markDirty();
      });
      if (focus) input.focus();
    };
    paint(false);
  }

  function home(stage) {
    const lib = UI.state.lib;
    const entries = lib.worldBooks.reduce((sum, book) => sum + book.entries.length, 0);
    const messages = lib.chats.reduce((sum, chat) => sum + chat.messages.length, 0);
    const stats = [
      ['角色', lib.characters.length, 'characters'],
      ['世界书条目', entries, 'lore'],
      ['聊天消息', messages, 'chat'],
      ['素材', lib.assets.length, 'assets'],
      ['正则', lib.regexScripts.length, 'regex'],
      ['快捷回复', lib.quickReplySets.reduce((sum, set) => sum + set.replies.length, 0), 'quick'],
      ['时间线', lib.timeline.notes.length + lib.timeline.beats.length, 'timeline'],
      ['关系', lib.graph.edges.length, 'graph'],
    ];
    stage.innerHTML = `<section class="hero paper">
      <p class="eyebrow">听雨楼书案</p>
      <h2>稿子先在这里写完，再送去酒馆。</h2>
      <p class="lede">酒馆工坊不代替 SillyTavern。角色、世界书、正则和一场聊天都留在这台浏览器里，导出的是酒馆认得的文件。</p>
      <div class="row">
        <button type="button" class="btn btn-primary" data-go="characters">去写角色</button>
        <button type="button" class="btn" data-go="backup">整库备份</button>
        <button type="button" class="btn" id="home-demo">载入示例</button>
        <button type="button" class="btn btn-danger" id="home-clear">清空库</button>
      </div>
    </section>
    <div class="stats">${stats.map(([label, count, id]) => `<button type="button" class="paper stat" data-go="${id}"><b>${count}</b><span>${label}</span></button>`).join('')}</div>
    <div class="cast">${lib.characters.filter((character) => UI.matchQuery(character.name)).map((character) => {
      const avatar = UI.assetById(character.avatarAssetId);
      return `<figure class="paper"><button type="button" data-open="${UI.esc(character.id)}">${avatar ? `<img alt="" src="${UI.esc(avatar.dataUrl)}">` : `<div class="seal-fallback">${UI.esc(character.name.slice(0, 1) || '名')}</div>`}<figcaption><strong>${UI.esc(character.name)}</strong><div class="muted">${UI.esc((character.tags || []).join(' · ') || '未加标签')}</div></figcaption></button></figure>`;
    }).join('') || '<div class="paper empty"><h3>书案是空的</h3><p>载入示例，或从角色卡工坊新写一张。</p></div>'}</div>`;
    stage.querySelectorAll('[data-go]').forEach((button) => { button.onclick = () => UI.go(button.dataset.go); });
    stage.querySelectorAll('[data-open]').forEach((button) => {
      button.onclick = () => { UI.state.sel.character = button.dataset.open; UI.go('characters'); };
    });
    stage.querySelector('#home-demo').onclick = UI.confirmLoadDemo;
    stage.querySelector('#home-clear').onclick = UI.confirmClear;
  }

  function characters(stage) {
    const lib = UI.state.lib;
    const list = lib.characters.filter((character) => UI.matchQuery([character.name, character.tags.join(' '), character.description, character.personality].join('\n')));
    const character = list.find((item) => item.id === UI.state.sel.character) || list[0] || null;
    if (character) UI.state.sel.character = character.id;
    const books = lib.worldBooks;
    stage.innerHTML = `<div class="toolbar">
      <button type="button" class="btn btn-primary" data-act="new">新建角色</button>
      <button type="button" class="btn" data-act="import">导入 JSON / PNG</button>
      <button type="button" class="btn" data-act="dup" ${character ? '' : 'disabled'}>复制</button>
      <button type="button" class="btn btn-danger" data-act="del" ${character ? '' : 'disabled'}>删除</button>
      <span class="spacer"></span>
      <label class="dark-muted">导出时附带<select id="attach-book"><option value="">不附带世界书</option>${books.map((book) => `<option value="${UI.esc(book.id)}">${UI.esc(book.name)}</option>`).join('')}</select></label>
      <button type="button" class="btn btn-primary" data-act="json" ${character ? '' : 'disabled'}>导出 JSON</button>
      <button type="button" class="btn btn-primary" data-act="png" ${character ? '' : 'disabled'}>导出 PNG</button>
    </div>
    ${UI.picker(list, character && character.id, (item) => (item.tags || []).slice(0, 3).join(' · '))}
    <div id="char-body"></div>`;
    const body = stage.querySelector('#char-body');
    UI.bindPicker(stage, (id) => { UI.state.sel.character = id; UI.renderStage(); });
    stage.querySelector('[data-act="new"]').onclick = () => {
      const created = blankCharacter();
      lib.characters.unshift(created);
      UI.state.sel.character = created.id;
      UI.markDirty();
      UI.renderStage();
    };
    stage.querySelector('[data-act="import"]').onclick = async () => importCharacterFile(await UI.pickFile('.json,.png,application/json,image/png'));
    stage.ondragover = (event) => event.preventDefault();
    stage.ondrop = (event) => { event.preventDefault(); importCharacterFile(event.dataTransfer.files && event.dataTransfer.files[0]); };
    if (!character) {
      body.appendChild(UI.empty(lib.characters.length ? '没有符合的角色' : '还没有角色', '新建一张，或把酒馆导出的 JSON、PNG 拖到这页。', '', null));
      return;
    }
    stage.querySelector('[data-act="dup"]').onclick = () => {
      const copy = structuredClone(character);
      copy.id = Store.uid('ch');
      copy.name = `${character.name} 的副本`;
      copy.createdAt = stamp();
      lib.characters.unshift(copy);
      UI.state.sel.character = copy.id;
      UI.markDirty();
      UI.renderStage();
    };
    stage.querySelector('[data-act="del"]').onclick = async () => {
      const answer = await UI.ask({ title: `删除「${character.name}」`, body: '这张卡会从本机库里拿走。已经导出的文件还在。', actions: [{ id: 'yes', label: '删除', kind: 'btn-danger' }, { id: 'no', label: '留下' }] });
      if (answer !== 'yes') return;
      lib.characters = lib.characters.filter((item) => item.id !== character.id);
      lib.groups.forEach((group) => { group.members = group.members.filter((member) => member.characterId !== character.id); });
      UI.markDirty();
      UI.renderStage();
    };
    const bookOf = () => lib.worldBooks.find((book) => book.id === stage.querySelector('#attach-book').value) || null;
    stage.querySelector('[data-act="json"]').onclick = () => {
      UI.downloadJson(`${UI.safeName(character.name)}.json`, F.characterToCard(character, bookOf()));
      UI.toast('已导出角色卡 JSON');
    };
    stage.querySelector('[data-act="png"]').onclick = () => exportCharacterPng(character, bookOf()).then(() => UI.toast('已导出带 chara 数据的 PNG')).catch((error) => UI.toast(error.message));
    const avatars = lib.assets.filter((asset) => asset.kind === 'avatar' || asset.kind === 'expression');
    body.innerHTML = `<div class="work">
      <div class="paper stack" id="char-form">
        ${UI.field('名字', UI.text('name', character.name))}
        <div class="grid-2">
          ${UI.field('创作者', UI.text('creator', character.creator))}
          ${UI.field('版本', UI.text('character_version', character.character_version))}
        </div>
        ${UI.field('标签', '<div id="char-tags" class="chips"></div>', '回车添加')}
        ${UI.field('头像', `<select data-field="avatarAssetId"><option value="">无</option>${avatars.map((asset) => `<option value="${UI.esc(asset.id)}"${asset.id === character.avatarAssetId ? ' selected' : ''}>${UI.esc(asset.name)}</option>`).join('')}</select>`, '图片在素材库上传')}
        ${UI.field('话多程度', `<input data-field="talkativeness" type="range" min="0" max="1" step="0.05" value="${Number(character.talkativeness) || 0}">`)}
        ${UI.field('描述', UI.area('description', character.description, 6))}
        ${UI.field('性格', UI.area('personality', character.personality, 4))}
        ${UI.field('情景', UI.area('scenario', character.scenario, 4))}
        ${UI.field('开场白', UI.area('first_mes', character.first_mes, 6))}
        ${UI.field('备用开场', '<div id="greetings"></div>')}
        ${UI.field('对话示例', UI.area('mes_example', character.mes_example, 5), '可用 {{char}} 与 {{user}}')}
        ${UI.field('创作者备注', UI.area('creator_notes', character.creator_notes, 3))}
        ${UI.field('系统提示', UI.area('system_prompt', character.system_prompt, 3))}
        ${UI.field('历史后指令', UI.area('post_history_instructions', character.post_history_instructions, 3))}
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
        <p class="muted" id="prev-meta"></p>`;
      preview.querySelector('#prev-name').textContent = character.name || '未命名';
      preview.querySelector('#prev-tags').innerHTML = (character.tags || []).map((tag) => `<span class="tag">${UI.esc(tag)}</span>`).join('');
      preview.querySelector('#prev-desc').textContent = character.description || '描述还空着。';
      preview.querySelector('#prev-mes').textContent = character.first_mes || '还没有开场白。';
      preview.querySelector('#prev-meta').textContent = `${character.creator || '未署名'} · ${character.character_version || '无版本'} · 话多 ${Number(character.talkativeness || 0).toFixed(2)}`;
    };
    paintPreview();
    UI.bindFields(body, character, (key) => {
      if (key === 'avatarAssetId' && !character.avatarAssetId) character.avatarAssetId = null;
      character.updatedAt = stamp();
      paintPreview();
      const pick = stage.querySelector(`.pick[data-id="${CSS.escape(character.id)}"] b`);
      if (pick) pick.textContent = character.name || '未命名';
    });
    mountChips(body.querySelector('#char-tags'), character.tags, '添加标签', paintPreview);
    const greetHost = body.querySelector('#greetings');
    const paintGreetings = () => {
      greetHost.innerHTML = `${character.alternate_greetings.map((line, index) => `<div class="row"><textarea data-greet="${index}" rows="3">${UI.esc(line)}</textarea><button type="button" class="btn btn-small btn-danger" data-drop-greet="${index}">删除</button></div>`).join('')}<button type="button" class="btn btn-small" id="add-greet">添加备用开场</button>`;
      greetHost.querySelectorAll('textarea').forEach((area) => {
        area.addEventListener('input', () => {
          character.alternate_greetings[Number(area.dataset.greet)] = area.value;
          character.updatedAt = stamp();
          UI.markDirty();
        });
      });
      greetHost.querySelectorAll('[data-drop-greet]').forEach((button) => {
        button.onclick = () => {
          character.alternate_greetings.splice(Number(button.dataset.dropGreet), 1);
          UI.markDirty();
          paintGreetings();
        };
      });
      greetHost.querySelector('#add-greet').onclick = () => {
        character.alternate_greetings.push('');
        UI.markDirty();
        paintGreetings();
      };
    };
    paintGreetings();
  }

  function lore(stage) {
    const lib = UI.state.lib;
    if (!lib.worldBooks.length) {
      stage.innerHTML = `<div class="toolbar"><button type="button" class="btn btn-primary" id="new-book">新建世界书</button><button type="button" class="btn" id="import-book">导入 JSON</button></div>`;
      stage.appendChild(UI.empty('还没有世界书', '新建一本，或导入酒馆导出的世界信息 JSON。', '', null));
      stage.querySelector('#new-book').onclick = () => addBook();
      stage.querySelector('#import-book').onclick = () => importBook();
      return;
    }
    const book = UI.selected(lib.worldBooks, UI.state.sel.book);
    UI.state.sel.book = book.id;
    const entries = book.entries.filter((entry) => UI.matchQuery([entry.comment, entry.content, ...(entry.keys || []), ...(entry.secondaryKeys || [])].join('\n')));
    const entry = entries.find((item) => item.id === UI.state.sel.entry) || null;
    stage.innerHTML = `<div class="toolbar">
      <label class="dark-muted">书<select id="book-select">${lib.worldBooks.map((item) => `<option value="${UI.esc(item.id)}"${item.id === book.id ? ' selected' : ''}>${UI.esc(item.name)}</option>`).join('')}</select></label>
      <button type="button" class="btn" id="rename-book">改书名</button>
      <button type="button" class="btn btn-primary" id="new-entry">新建条目</button>
      <button type="button" class="btn" id="import-book">导入 JSON</button>
      <button type="button" class="btn btn-primary" id="export-book">导出世界书</button>
      <button type="button" class="btn btn-danger" id="del-book">删除此书</button>
    </div>
    <div class="board-layout">
      <div class="board">${F.POSITIONS.map((position) => `<section class="column"><h3>${position.label}</h3>${entries.filter((item) => item.position === position.id).map((item) => `<article class="entry${item.id === (entry && entry.id) ? ' on' : ''}${item.enabled ? '' : ' off'}" data-id="${UI.esc(item.id)}"><b>${UI.esc(item.comment || '未命名')}</b><p>${UI.esc((item.keys || []).join(' / ') || '无关键词')}</p><div class="row"><span class="muted">${item.constant ? '恒定' : '触发'}</span><button type="button" class="btn btn-small" data-toggle="${UI.esc(item.id)}">${item.enabled ? '启用' : '停用'}</button></div></article>`).join('') || '<p class="dark-muted">空</p>'}</section>`).join('')}</div>
      <div id="lore-editor"></div>
    </div>`;
    const editor = stage.querySelector('#lore-editor');
    stage.querySelector('#book-select').onchange = (event) => { UI.state.sel.book = event.target.value; UI.state.sel.entry = null; UI.renderStage(); };
    stage.querySelector('#new-entry').onclick = () => {
      const created = blankEntry();
      book.entries.unshift(created);
      UI.state.sel.entry = created.id;
      UI.markDirty();
      UI.renderStage();
    };
    stage.querySelector('#rename-book').onclick = async () => {
      const name = window.prompt('世界书名称', book.name);
      if (name && name.trim()) { book.name = name.trim(); UI.markDirty(); UI.renderStage(); }
    };
    stage.querySelector('#export-book').onclick = () => {
      UI.downloadJson(`${UI.safeName(book.name)}.json`, F.bookToWorldInfo(book));
      UI.toast('已导出酒馆世界书 JSON');
    };
    stage.querySelector('#import-book').onclick = () => importBook();
    stage.querySelector('#del-book').onclick = async () => {
      const answer = await UI.ask({ title: `删除「${book.name}」`, body: '书里的条目会一起删除。', actions: [{ id: 'yes', label: '删除', kind: 'btn-danger' }, { id: 'no', label: '留下' }] });
      if (answer !== 'yes') return;
      lib.worldBooks = lib.worldBooks.filter((item) => item.id !== book.id);
      UI.markDirty();
      UI.renderStage();
    };
    stage.querySelectorAll('.entry').forEach((card) => {
      card.onclick = () => { UI.state.sel.entry = card.dataset.id; paintEditor(); stage.querySelectorAll('.entry').forEach((item) => item.classList.toggle('on', item.dataset.id === card.dataset.id)); };
    });
    stage.querySelectorAll('[data-toggle]').forEach((button) => {
      button.onclick = (event) => {
        event.stopPropagation();
        const target = book.entries.find((item) => item.id === button.dataset.toggle);
        target.enabled = !target.enabled;
        UI.markDirty();
        UI.renderStage();
      };
    });
    function paintEditor() {
      const current = book.entries.find((item) => item.id === UI.state.sel.entry);
      if (!current) {
        editor.innerHTML = '<div class="paper empty"><h3>选一条</h3><p class="muted">左边是按注入位置分的看板。点开一条来改。</p></div>';
        return;
      }
      editor.innerHTML = `<div class="paper stack">
        ${UI.field('条目名', UI.text('comment', current.comment))}
        ${UI.field('内容', UI.area('content', current.content, 8))}
        ${UI.field('主关键词', '<div id="keys" class="chips"></div>')}
        ${UI.field('次关键词', '<div id="keys2" class="chips"></div>', '选择性开启时，通常还要命中一个次关键词')}
        <div class="grid-2">
          ${UI.field('顺序', `<input data-field="order" type="number" value="${Number(current.order) || 0}">`)}
          ${UI.field('深度', `<input data-field="depth" type="number" value="${Number(current.depth) || 4}">`, '指定深度时使用')}
        </div>
        ${UI.field('位置', `<select data-field="position">${F.POSITIONS.map((position) => `<option value="${position.id}"${position.id === current.position ? ' selected' : ''}>${position.label}</option>`).join('')}</select>`)}
        ${UI.field('出口名', UI.text('outletName', current.outletName), '位置为出口时填写')}
        <label class="check"><input data-field="constant" type="checkbox" ${current.constant ? 'checked' : ''}>恒定注入</label>
        <label class="check"><input data-field="selective" type="checkbox" ${current.selective ? 'checked' : ''}>选择性</label>
        <label class="check"><input data-field="enabled" type="checkbox" ${current.enabled ? 'checked' : ''}>启用</label>
        <button type="button" class="btn btn-danger" id="del-entry">删除条目</button>
      </div>`;
      UI.bindFields(editor, current, (key) => {
        if (key === 'comment') {
          const title = stage.querySelector(`.entry[data-id="${CSS.escape(current.id)}"] b`);
          if (title) title.textContent = current.comment || '未命名';
        }
        if (key === 'position' || key === 'enabled' || key === 'constant') UI.renderStage();
      });
      mountChips(editor.querySelector('#keys'), current.keys, '主关键词', () => {});
      mountChips(editor.querySelector('#keys2'), current.secondaryKeys, '次关键词', () => {});
      editor.querySelector('#del-entry').onclick = () => {
        book.entries = book.entries.filter((item) => item.id !== current.id);
        UI.state.sel.entry = null;
        UI.markDirty();
        UI.renderStage();
      };
    }
    paintEditor();
    function addBook() {
      const created = { id: Store.uid('book'), name: '新世界书', description: '', entries: [] };
      lib.worldBooks.unshift(created);
      UI.state.sel.book = created.id;
      UI.markDirty();
      UI.renderStage();
    }
    async function importBook() {
      const file = await UI.pickFile('.json,application/json');
      if (!file) return;
      try {
        const json = await parseJsonFile(file);
        const entries = F.worldInfoToEntries(json).map((entry) => Object.assign(blankEntry(), entry, { id: Store.uid('lore') }));
        const created = { id: Store.uid('book'), name: file.name.replace(/\.json$/i, ''), description: '', entries };
        lib.worldBooks.unshift(created);
        UI.state.sel.book = created.id;
        UI.markDirty();
        UI.toast(`已导入 ${entries.length} 条`);
        UI.renderStage();
      } catch (error) {
        UI.toast(error.message);
      }
    }
  }

  function prompts(stage) {
    const lib = UI.state.lib;
    const preset = UI.selected(lib.promptPresets.filter((item) => UI.matchQuery(item.name)), UI.state.sel.preset);
    stage.innerHTML = `<div class="toolbar">
      <button type="button" class="btn btn-primary" id="new-preset">新建预设</button>
      <button type="button" class="btn" id="import-preset">导入 JSON</button>
      <button type="button" class="btn btn-primary" id="export-preset" ${preset ? '' : 'disabled'}>导出预设</button>
    </div>`;
    const presets = lib.promptPresets.filter((item) => UI.matchQuery(item.name + item.blocks.map((block) => block.name).join(' ')));
    const current = presets.find((item) => item.id === UI.state.sel.preset) || presets[0] || null;
    if (current) UI.state.sel.preset = current.id;
    stage.insertAdjacentHTML('beforeend', UI.picker(presets, current && current.id, (item) => `${item.blocks.length} 块`));
    UI.bindPicker(stage, (id) => { UI.state.sel.preset = id; UI.renderStage(); });
    stage.querySelector('#new-preset').onclick = () => {
      const created = { id: Store.uid('preset'), name: '新预设', blocks: [{ id: Store.uid('blk'), name: '系统', kind: 'system', role: 'system', enabled: true, content: '' }] };
      lib.promptPresets.unshift(created);
      UI.state.sel.preset = created.id;
      UI.markDirty();
      UI.renderStage();
    };
    stage.querySelector('#import-preset').onclick = async () => {
      const file = await UI.pickFile('.json,application/json');
      if (!file) return;
      try {
        const json = await parseJsonFile(file);
        const imported = F.presetFromImport(json);
        imported.id = Store.uid('preset');
        imported.blocks.forEach((block) => { block.id = Store.uid('blk'); });
        lib.promptPresets.unshift(imported);
        UI.state.sel.preset = imported.id;
        UI.markDirty();
        UI.renderStage();
      } catch (error) { UI.toast(error.message); }
    };
    if (!current) {
      stage.appendChild(UI.empty('还没有预设', '加一组有顺序的提示词块。', '', null));
      return;
    }
    stage.querySelector('#export-preset').onclick = () => {
      UI.downloadJson(`${UI.safeName(current.name)}.json`, F.presetToExport(current));
      UI.toast('已导出。请把块抄进酒馆预设，不要整份覆盖。');
    };
    const host = document.createElement('div');
    host.className = 'work';
    stage.appendChild(host);
    const paint = () => {
      host.innerHTML = `<div><div class="paper stack" style="margin-bottom:12px">${UI.field('预设名', UI.text('name', current.name))}</div>
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
        <aside class="paper"><p class="eyebrow">顺序</p><ol id="order-preview"></ol><p class="help">拖左侧的「序」重新排列。导出的 JSON 带 prompts 和 prompt_order，方便对照酒馆预设，它不是完整的模型参数包。</p></aside>`;
      UI.bindFields(host.querySelector('.paper'), current, () => paintOrder());
      const paintOrder = () => {
        host.querySelector('#order-preview').innerHTML = current.blocks.map((block) => `<li>${block.enabled ? '' : '（关）'}${UI.esc(block.name)} · ${UI.esc(block.kind)}</li>`).join('');
      };
      paintOrder();
      host.querySelectorAll('[data-block]').forEach((node) => {
        const eventName = node.tagName === 'SELECT' || node.type === 'checkbox' ? 'change' : 'input';
        node.addEventListener(eventName, () => {
          const block = current.blocks.find((item) => item.id === node.dataset.block);
          block[node.dataset.key] = node.type === 'checkbox' ? node.checked : node.value;
          if (node.dataset.key === 'enabled') node.closest('.block').classList.toggle('off', !block.enabled);
          paintOrder();
          UI.markDirty();
        });
      });
      host.querySelectorAll('[data-del]').forEach((button) => {
        button.onclick = () => {
          current.blocks = current.blocks.filter((block) => block.id !== button.dataset.del);
          UI.markDirty();
          paint();
        };
      });
      host.querySelector('#add-block').onclick = () => {
        current.blocks.push({ id: Store.uid('blk'), name: '新块', kind: 'custom', role: 'system', enabled: true, content: '' });
        UI.markDirty();
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
          const from = current.blocks.findIndex((block) => block.id === fromId);
          const to = current.blocks.findIndex((block) => block.id === toId);
          const [moved] = current.blocks.splice(from, 1);
          current.blocks.splice(to, 0, moved);
          UI.markDirty();
          paint();
        });
      });
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
      UI.downloadJson(`${UI.safeName(group.name)}.json`, F.groupToExport(group, lib));
      UI.toast('已导出群名单。酒馆需先有角色卡，再按名单建群。');
    };
    stage.querySelector('#del-group').onclick = () => {
      lib.groups = lib.groups.filter((item) => item.id !== group.id);
      UI.markDirty();
      UI.renderStage();
    };
    const body = stage.querySelector('#group-body');
    const missing = lib.characters.filter((character) => !group.members.some((member) => member.characterId === character.id));
    body.innerHTML = `<div class="work"><div class="paper stack">
      ${UI.field('群名', UI.text('name', group.name))}
      ${UI.field('情景', UI.area('scenario', group.scenario, 4))}
      ${UI.field('激活', `<select data-field="activation">${F.ACTIVATION.map((item) => `<option value="${item.id}"${group.activation === item.id ? ' selected' : ''}>${item.label}</option>`).join('')}</select>`)}
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
    UI.bindFields(body, group, paintPreview);
    body.querySelectorAll('[data-member]').forEach((row) => {
      const member = group.members[Number(row.dataset.member)];
      row.querySelector('[data-m="enabled"]').onchange = (event) => { member.enabled = event.target.checked; paintPreview(); UI.markDirty(); };
      row.querySelector('[data-m="talk"]').oninput = (event) => {
        member.talkativeness = Number(event.target.value);
        row.querySelector('.field-label').textContent = `话多 ${member.talkativeness.toFixed(2)}`;
        paintPreview();
        UI.markDirty();
      };
      row.querySelector('[data-m-del]').onclick = () => { group.members.splice(Number(row.dataset.member), 1); UI.markDirty(); UI.renderStage(); };
    });
    body.querySelector('#add-member-btn').onclick = () => {
      const id = body.querySelector('#add-member').value;
      if (!id) return;
      const character = UI.charById(id);
      group.members.push({ characterId: id, talkativeness: character ? character.talkativeness : 0.5, enabled: true });
      UI.markDirty();
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
    </div>${UI.picker(chats, current && current.id, (item) => `${item.messages.length} 条`)}<div id="chat-body"></div>`;
    UI.bindPicker(stage, (id) => { UI.state.sel.chat = id; UI.renderStage(); });
    stage.querySelector('#chat-bg').onchange = (event) => {
      lib.settings.chatBackgroundAssetId = event.target.value || null;
      UI.markDirty();
      UI.renderStage();
    };
    const importChat = async (file) => {
      if (!file) return;
      try {
        const text = await UI.readText(file);
        const parsed = F.chatFromText(text, file.name);
        parsed.id = Store.uid('chat');
        lib.chats.unshift(parsed);
        UI.state.sel.chat = parsed.id;
        UI.markDirty();
        UI.toast(`已读入 ${parsed.messages.length} 条消息`);
        UI.renderStage();
      } catch (error) { UI.toast(error.message || '这份聊天认不出'); }
    };
    stage.querySelector('#import-chat').onclick = async () => importChat(await UI.pickFile('.json,.jsonl,.txt,application/json'));
    stage.ondragover = (event) => event.preventDefault();
    stage.ondrop = (event) => { event.preventDefault(); importChat(event.dataTransfer.files && event.dataTransfer.files[0]); };
    if (!current) {
      const empty = UI.empty('还没有聊天', '导入酒馆的 jsonl 或消息数组。示例库里有一场雨夜。', '', null);
      stage.querySelector('#chat-body').appendChild(empty);
      return;
    }
    stage.querySelector('#export-chat').onclick = () => UI.downloadJson(`${UI.safeName(current.name)}.json`, current);
    stage.querySelector('#del-chat').onclick = () => { lib.chats = lib.chats.filter((item) => item.id !== current.id); UI.markDirty(); UI.renderStage(); };
    const body = stage.querySelector('#chat-body');
    const query = UI.state.passageQuery || '';
    body.innerHTML = `<div class="chat-wrap"><div class="paper stack">
      <strong>书签</strong>
      <div id="bookmark-list">${current.bookmarks.map((mark) => `<button type="button" class="btn btn-small bookmark" data-jump="${mark.index}">#${mark.index} ${UI.esc(mark.excerpt)}</button>`).join('') || '<p class="muted">还没有书签</p>'}</div>
    </div><div class="paper chat-paper" id="chat-paper">
      <div class="row"><input id="passage" type="text" placeholder="在这场聊天里找句子" value="${UI.esc(query)}"><button type="button" class="btn btn-small" id="prev-hit">上一处</button><button type="button" class="btn btn-small" id="next-hit">下一处</button><button type="button" class="btn btn-small" id="copy-sel">复制选段</button><button type="button" class="btn btn-small" id="mark-sel">选段做成书签</button></div>
      <p class="muted" id="hit-count"></p>
      <div id="chat-log"></div>
    </div></div>`;
    const paper = body.querySelector('#chat-paper');
    const bg = UI.assetById(lib.settings.chatBackgroundAssetId);
    if (bg) paper.style.backgroundImage = `linear-gradient(rgba(244,231,209,0.9), rgba(244,231,209,0.94)), url("${bg.dataUrl}")`;
    const log = body.querySelector('#chat-log');
    let marks = [];
    const renderLog = () => {
      const needle = (UI.state.passageQuery || '').trim();
      log.innerHTML = current.messages.map((message, index) => {
        const safe = UI.esc(message.mes);
        const html = needle ? safe.replace(new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (hit) => `<mark>${hit}</mark>`) : safe;
        return `<article class="msg ${message.is_user ? 'user' : ''}" data-index="${index}"><header><span class="who">${UI.esc(message.name)}</span><span>${UI.esc(message.send_date || '')}</span></header><div class="body">${html.replace(/\n/g, '<br>')}</div></article>`;
      }).join('');
      marks = [...log.querySelectorAll('mark')];
      body.querySelector('#hit-count').textContent = needle ? `${marks.length} 处` : `${current.messages.length} 条消息`;
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
      UI.markDirty();
      UI.renderStage();
    };
  }

  async function ingestImages(fileList, kind) {
    const files = [...fileList];
    for (const file of files) {
      if (!file.type.startsWith('image/')) { UI.toast(`${file.name} 不是图片`); continue; }
      if (file.size > 1.6 * 1024 * 1024) { UI.toast(`${file.name} 超过 1.6MB，请先压过再传`); continue; }
      if (file.size > 400 * 1024) {
        const answer = await UI.ask({
          title: '这张图不小',
          body: `${file.name} 大约 ${Math.round(file.size / 1024)}KB。素材以文本形式存在浏览器里，太大容易把库写满。`,
          actions: [{ id: 'yes', label: '仍然收进库', kind: 'btn-primary' }, { id: 'no', label: '取消' }],
        });
        if (answer !== 'yes') continue;
      }
      const dataUrl = await UI.readDataUrl(file);
      if (Store.bytes(UI.state.lib) + dataUrl.length > 4.2 * 1024 * 1024) { UI.toast('库快满了，这张放不下'); continue; }
      UI.state.lib.assets.unshift({ id: Store.uid('asset'), name: file.name, kind, dataUrl, mime: file.type, bytes: file.size, createdAt: stamp() });
    }
    UI.markDirty();
    UI.renderStage();
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
    </div>
    <div class="work"><div class="asset-grid" id="asset-grid">${list.map((item) => `<button type="button" class="paper asset-card${item.id === (asset && asset.id) ? ' on' : ''}" data-id="${UI.esc(item.id)}"><img alt="" src="${UI.esc(item.dataUrl)}"><b>${UI.esc(item.name)}</b><small class="muted">${item.kind} · ${Math.max(1, Math.round((item.bytes || 0) / 1024))}KB</small></button>`).join('')}</div><div id="asset-side"></div></div>`;
    if (!list.length) stage.querySelector('#asset-grid').appendChild(UI.empty('素材库是空的', '上传头像、表情或聊天背景。大图会先提醒你。', '', null));
    stage.querySelectorAll('[data-kind]').forEach((button) => { button.onclick = () => ingestImagesFrom(button.dataset.kind); });
    stage.querySelectorAll('[data-filter]').forEach((button) => { button.onclick = () => { UI.state.assetKind = button.dataset.filter; UI.renderStage(); }; });
    stage.querySelectorAll('.asset-card').forEach((card) => { card.onclick = () => { UI.state.sel.asset = card.dataset.id; paintSide(); stage.querySelectorAll('.asset-card').forEach((item) => item.classList.toggle('on', item.dataset.id === card.dataset.id)); }; });
    stage.ondragover = (event) => event.preventDefault();
    stage.ondrop = (event) => { event.preventDefault(); ingestImages(event.dataTransfer.files, 'avatar'); };
    async function ingestImagesFrom(nextKind) {
      const files = await UI.pickFile('image/*', true);
      if (files && files.length) ingestImages(files, nextKind);
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
        <p class="help">删除后，用到它的头像和背景会空出来。</p>
      </div>`;
      UI.bindFields(side, current, () => UI.markDirty());
      side.querySelector('#set-avatar').onclick = () => {
        const character = UI.charById(side.querySelector('#as-avatar').value);
        if (!character) { UI.toast('先选角色'); return; }
        character.avatarAssetId = current.id;
        current.kind = 'avatar';
        UI.markDirty();
        UI.toast(`已设为「${character.name}」的头像`);
      };
      side.querySelector('#set-exp').onclick = () => {
        const character = UI.charById(side.querySelector('#as-exp').value);
        if (!character) { UI.toast('先选角色'); return; }
        character.expressionAssetIds = character.expressionAssetIds || [];
        if (!character.expressionAssetIds.includes(current.id)) character.expressionAssetIds.push(current.id);
        current.kind = 'expression';
        UI.markDirty();
        UI.toast(`已加入「${character.name}」的表情`);
      };
      side.querySelector('#set-bg').onclick = () => {
        lib.settings.chatBackgroundAssetId = current.id;
        current.kind = 'background';
        UI.markDirty();
        UI.toast('聊天背景已换上');
      };
      side.querySelector('#del-asset').onclick = () => {
        lib.assets = lib.assets.filter((item) => item.id !== current.id);
        lib.characters.forEach((character) => {
          if (character.avatarAssetId === current.id) character.avatarAssetId = null;
          character.expressionAssetIds = (character.expressionAssetIds || []).filter((id) => id !== current.id);
        });
        if (lib.settings.chatBackgroundAssetId === current.id) lib.settings.chatBackgroundAssetId = null;
        UI.state.sel.asset = null;
        UI.markDirty();
        UI.renderStage();
      };
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
    </div>${UI.picker(list, script && script.id, (item) => (item.disabled ? '停用' : '启用'))}<div id="rx-body"></div>`;
    UI.bindPicker(stage, (id) => { UI.state.sel.regex = id; UI.renderStage(); });
    stage.querySelector('#new-rx').onclick = () => {
      const created = { id: Store.uid('rx'), scriptName: '新脚本', findRegex: '', replaceString: '', trimStrings: [], placement: [2], disabled: false, markdownOnly: false, promptOnly: false, runOnEdit: false, substituteRegex: 0, minDepth: null, maxDepth: null };
      lib.regexScripts.unshift(created);
      UI.state.sel.regex = created.id;
      UI.markDirty();
      UI.renderStage();
    };
    stage.querySelector('#export-rx').onclick = () => { UI.downloadJson('regex-scripts.json', F.regexToExport(lib.regexScripts)); UI.toast('已导出正则数组'); };
    stage.querySelector('#import-rx').onclick = async () => {
      const file = await UI.pickFile('.json,application/json');
      if (!file) return;
      try {
        F.regexFromImport(await parseJsonFile(file)).forEach((item) => { item.id = Store.uid('rx'); lib.regexScripts.push(item); });
        UI.markDirty();
        UI.renderStage();
      } catch (error) { UI.toast(error.message); }
    };
    if (!script) { stage.querySelector('#rx-body').appendChild(UI.empty('还没有脚本', '新建一条，或导入酒馆的正则 JSON。', '', null)); return; }
    stage.querySelector('#del-rx').onclick = () => { lib.regexScripts = lib.regexScripts.filter((item) => item.id !== script.id); UI.markDirty(); UI.renderStage(); };
    const body = stage.querySelector('#rx-body');
    body.innerHTML = `<div class="work"><div class="paper stack">
      ${UI.field('名称', UI.text('scriptName', script.scriptName))}
      ${UI.field('查找', UI.text('findRegex', script.findRegex), '可写 /表达式/gi ，或不加斜杠')}
      <p class="help" id="rx-error"></p>
      ${UI.field('替换', UI.text('replaceString', script.replaceString), '可用 $1')}
      <div class="stack" id="places">${F.PLACEMENTS.map((place) => `<label class="check"><input type="checkbox" value="${place.id}" ${(script.placement || []).includes(place.id) ? 'checked' : ''}>${place.label}</label>`).join('')}</div>
      <label class="check"><input data-field="disabled" type="checkbox" ${script.disabled ? 'checked' : ''}>停用</label>
      <label class="check"><input data-field="markdownOnly" type="checkbox" ${script.markdownOnly ? 'checked' : ''}>仅 Markdown 显示</label>
      <label class="check"><input data-field="promptOnly" type="checkbox" ${script.promptOnly ? 'checked' : ''}>仅提示词</label>
      <div class="grid-2">${UI.field('最小深度', `<input data-field="minDepth" type="number" value="${script.minDepth ?? ''}">`)}${UI.field('最大深度', `<input data-field="maxDepth" type="number" value="${script.maxDepth ?? ''}">`)}</div>
    </div><aside class="paper stack"><p class="eyebrow">试跑</p><textarea id="lab" rows="6">${UI.esc(UI.state.lab || '')}</textarea><button type="button" class="btn" id="run-rx">试跑</button><pre id="lab-out" class="snippet"></pre></aside></div>`;
    UI.bindFields(body, script, (key) => {
      if (key === 'minDepth' || key === 'maxDepth') script[key] = script[key] === '' ? null : Number(script[key]);
      body.querySelector('#rx-error').textContent = script.findRegex && !F.regexFromString(script.findRegex) ? '这则正则编译不过' : '';
    });
    body.querySelectorAll('#places input').forEach((box) => {
      box.onchange = () => {
        script.placement = [...body.querySelectorAll('#places input:checked')].map((item) => Number(item.value));
        UI.markDirty();
      };
    });
    const run = () => {
      UI.state.lab = body.querySelector('#lab').value;
      const pattern = F.regexFromString(script.findRegex);
      body.querySelector('#lab-out').textContent = pattern ? UI.state.lab.replace(pattern, script.replaceString || '') : '正则无效';
    };
    body.querySelector('#lab').addEventListener('input', (event) => { UI.state.lab = event.target.value; });
    body.querySelector('#run-rx').onclick = run;
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
    </div>${UI.picker(sets, set && set.id, (item) => `${item.replies.length} 条`)}<div id="qr-body"></div>`;
    UI.bindPicker(stage, (id) => { UI.state.sel.qr = id; UI.renderStage(); });
    stage.querySelector('#new-qr').onclick = () => {
      const created = { id: Store.uid('qrset'), name: '新的快捷回复', replies: [] };
      lib.quickReplySets.unshift(created);
      UI.state.sel.qr = created.id;
      UI.markDirty();
      UI.renderStage();
    };
    stage.querySelector('#import-qr').onclick = async () => {
      const file = await UI.pickFile('.json,application/json');
      if (!file) return;
      try {
        const imported = F.qrFromImport(await parseJsonFile(file));
        imported.id = Store.uid('qrset');
        imported.replies.forEach((reply) => { reply.id = Store.uid('qr'); });
        lib.quickReplySets.unshift(imported);
        UI.state.sel.qr = imported.id;
        UI.markDirty();
        UI.renderStage();
      } catch (error) { UI.toast(error.message); }
    };
    if (!set) { stage.querySelector('#qr-body').appendChild(UI.empty('还没有快捷回复', '做一组可以复制进输入框的短句。', '', null)); return; }
    stage.querySelector('#export-qr').onclick = () => { UI.downloadJson(`${UI.safeName(set.name)}.json`, F.qrToExport(set)); UI.toast('已导出快捷回复集'); };
    stage.querySelector('#del-qr').onclick = () => { lib.quickReplySets = lib.quickReplySets.filter((item) => item.id !== set.id); UI.markDirty(); UI.renderStage(); };
    const body = stage.querySelector('#qr-body');
    body.innerHTML = `<div class="paper stack">${UI.field('套名', UI.text('name', set.name))}
      <div id="qr-list">${set.replies.map((reply) => `<div class="paper" data-id="${UI.esc(reply.id)}" style="padding:10px">
        <div class="row"><input data-k="label" value="${UI.esc(reply.label)}" placeholder="按钮文字"><input data-k="color" type="color" value="${UI.esc(reply.color || '#c6a15a')}"><button type="button" class="btn btn-small" data-copy>复制内容</button><button type="button" class="btn btn-small btn-danger" data-del>删除</button></div>
        <textarea data-k="message" rows="3">${UI.esc(reply.message)}</textarea>
      </div>`).join('')}</div>
      <button type="button" class="btn" id="add-qr">添加一条</button></div>`;
    UI.bindFields(body, set);
    body.querySelectorAll('[data-id]').forEach((row) => {
      const reply = set.replies.find((item) => item.id === row.dataset.id);
      row.querySelectorAll('[data-k]').forEach((node) => {
        node.addEventListener('input', () => { reply[node.dataset.k] = node.value; UI.markDirty(); });
      });
      row.querySelector('[data-copy]').onclick = () => UI.copyText(reply.message || '');
      row.querySelector('[data-del]').onclick = () => { set.replies = set.replies.filter((item) => item.id !== reply.id); UI.markDirty(); UI.renderStage(); };
    });
    body.querySelector('#add-qr').onclick = () => {
      set.replies.push({ id: Store.uid('qr'), label: '新回复', message: '', color: '#c6a15a', title: '' });
      UI.markDirty();
      UI.renderStage();
    };
  }

  function timeline(stage) {
    const lib = UI.state.lib;
    const notes = lib.timeline.notes.filter((note) => UI.matchQuery(note.title + note.body));
    const beats = lib.timeline.beats.filter((beat) => UI.matchQuery(beat.title + beat.summary));
    const items = [
      ...beats.map((beat) => ({ kind: 'beat', floor: Number(beat.floor) || 0, order: beat.order || 0, data: beat })),
      ...notes.map((note) => ({ kind: 'note', floor: Number(note.floor) || 0, order: 0, data: note })),
    ].sort((a, b) => a.floor - b.floor || a.order - b.order);
    stage.innerHTML = `<div class="toolbar">
      <button type="button" class="btn btn-primary" id="add-note">添加楼层注记</button>
      <button type="button" class="btn" id="add-beat">添加情节</button>
      <button type="button" class="btn btn-primary" id="export-tl">导出 JSON</button>
    </div><div class="work"><div class="timeline" id="tl"></div><div id="tl-editor"></div></div>`;
    const tl = stage.querySelector('#tl');
    tl.innerHTML = items.map((item) => `<button type="button" class="paper tl-item" data-kind="${item.kind}" data-id="${UI.esc(item.data.id)}"><span class="eyebrow">${item.kind === 'beat' ? '情节' : '注记'} · 楼层 ${item.floor}</span><strong>${UI.esc(item.data.title || '未命名')}</strong><p class="muted">${UI.esc(item.kind === 'beat' ? item.data.summary : item.data.body)}</p></button>`).join('') || '<p class="dark-muted">时间线还是空的。</p>';
    stage.querySelector('#add-note').onclick = () => {
      const note = { id: Store.uid('note'), floor: 0, title: '新注记', body: '' };
      lib.timeline.notes.push(note);
      UI.state.sel.tlKind = 'note';
      UI.state.sel.tl = note.id;
      UI.markDirty();
      UI.renderStage();
    };
    stage.querySelector('#add-beat').onclick = () => {
      const beat = { id: Store.uid('beat'), order: lib.timeline.beats.length + 1, floor: 0, title: '新情节', summary: '' };
      lib.timeline.beats.push(beat);
      UI.state.sel.tlKind = 'beat';
      UI.state.sel.tl = beat.id;
      UI.markDirty();
      UI.renderStage();
    };
    stage.querySelector('#export-tl').onclick = () => { UI.downloadJson('timeline.json', F.timelineToExport(lib)); UI.toast('已导出时间线'); };
    const editor = stage.querySelector('#tl-editor');
    const paint = (kind, id) => {
      UI.state.sel.tlKind = kind;
      UI.state.sel.tl = id;
      const data = kind === 'beat' ? lib.timeline.beats.find((item) => item.id === id) : lib.timeline.notes.find((item) => item.id === id);
      if (!data) { editor.innerHTML = ''; return; }
      editor.innerHTML = `<div class="paper stack">
        ${UI.field('标题', UI.text('title', data.title))}
        ${UI.field('楼层', `<input data-field="floor" type="number" value="${Number(data.floor) || 0}">`, '对应聊天消息序号，从 0 开始')}
        ${kind === 'beat' ? UI.field('顺序', `<input data-field="order" type="number" value="${Number(data.order) || 1}">`) + UI.field('摘要', UI.area('summary', data.summary, 5)) : UI.field('正文', UI.area('body', data.body, 6))}
        <button type="button" class="btn btn-danger" id="del-tl">删除</button>
      </div>`;
      UI.bindFields(editor, data);
      editor.querySelector('#del-tl').onclick = () => {
        if (kind === 'beat') lib.timeline.beats = lib.timeline.beats.filter((item) => item.id !== id);
        else lib.timeline.notes = lib.timeline.notes.filter((item) => item.id !== id);
        UI.markDirty();
        UI.renderStage();
      };
    };
    tl.querySelectorAll('.tl-item').forEach((button) => { button.onclick = () => paint(button.dataset.kind, button.dataset.id); });
    if (UI.state.sel.tl) paint(UI.state.sel.tlKind, UI.state.sel.tl);
  }

  function nodeLabel(node) {
    return (node.characterId && UI.charById(node.characterId)?.name) || node.label || '未命名';
  }

  function graph(stage) {
    const lib = UI.state.lib;
    const graphData = lib.graph;
    stage.innerHTML = `<div class="toolbar">
      <button type="button" class="btn" id="sync-nodes">从角色同步</button>
      <button type="button" class="btn btn-primary" id="export-graph">导出为世界书</button>
    </div><div class="work"><div class="graph-wrap"><svg id="graph-svg" viewBox="0 0 800 560"></svg></div><div class="graph-side paper" id="graph-side"></div></div>`;
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
        return `<g data-edge="${UI.esc(edge.id)}"><line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="transparent" stroke-width="16"/><line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="#c6a15a" stroke-width="1.4"/><text x="${labelX}" y="${labelY}" fill="#e0c27a" font-size="13" text-anchor="middle">${UI.esc(edge.label || '')}</text></g>`;
      }).join('');
      const nodes = graphData.nodes.map((node) => `<g data-node="${UI.esc(node.id)}" transform="translate(${node.x} ${node.y})" style="cursor:grab"><circle r="36" fill="#f4e7d1" stroke="#c6a15a"/><text text-anchor="middle" y="5" font-size="14" fill="#1a120c">${UI.esc(nodeLabel(node).slice(0, 4))}</text></g>`).join('');
      svg.innerHTML = edges + nodes;
      svg.querySelectorAll('[data-node]').forEach((nodeEl) => {
        nodeEl.onpointerdown = (event) => {
          event.preventDefault();
          const node = graphData.nodes.find((item) => item.id === nodeEl.dataset.node);
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
            UI.markDirty();
            paintSide();
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up);
        };
      });
      svg.querySelectorAll('[data-edge]').forEach((edgeEl) => {
        edgeEl.onclick = () => { UI.state.sel.edge = edgeEl.dataset.edge; paintSide(); };
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
      const edge = graphData.edges.find((item) => item.id === UI.state.sel.edge);
      side.innerHTML = `<h3>连一条线</h3>
        <label class="field"><span class="field-label">起点</span><select id="edge-from">${graphData.nodes.map((node) => `<option value="${UI.esc(node.id)}">${UI.esc(nodeLabel(node))}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">终点</span><select id="edge-to">${graphData.nodes.map((node) => `<option value="${UI.esc(node.id)}">${UI.esc(nodeLabel(node))}</option>`).join('')}</select></label>
        <label class="field"><span class="field-label">关系</span><input id="edge-label" type="text" placeholder="旧识、对手、主雇"></label>
        <label class="field"><span class="field-label">短注</span><input id="edge-note" type="text"></label>
        <button type="button" class="btn btn-primary" id="add-edge">添加关系</button>
        <label class="field"><span class="field-label">自定义人物</span><input id="node-label" type="text" placeholder="不在角色库里的名字"></label>
        <button type="button" class="btn" id="add-node">添加人物</button>
        ${edge ? `<hr><p>选中：${UI.esc(edge.label)}</p><button type="button" class="btn btn-danger" id="del-edge">删除这条线</button>` : ''}
        <p class="help">拖动圆点。导出时每条线变成一条选择性世界书条目。</p>`;
      side.querySelector('#add-edge').onclick = () => {
        const from = side.querySelector('#edge-from').value;
        const to = side.querySelector('#edge-to').value;
        const label = side.querySelector('#edge-label').value.trim();
        if (!from || !to || from === to) { UI.toast('请选两个不同的人'); return; }
        if (!label) { UI.toast('写上关系'); return; }
        graphData.edges.push({ id: Store.uid('edge'), from, to, label, note: side.querySelector('#edge-note').value.trim() });
        UI.markDirty();
        paint();
        paintSide();
      };
      side.querySelector('#add-node').onclick = () => {
        const label = side.querySelector('#node-label').value.trim();
        if (!label) return;
        graphData.nodes.push({ id: Store.uid('node'), characterId: null, label, x: 400, y: 280 });
        UI.markDirty();
        paint();
        paintSide();
      };
      if (edge) side.querySelector('#del-edge').onclick = () => {
        graphData.edges = graphData.edges.filter((item) => item.id !== edge.id);
        UI.state.sel.edge = null;
        UI.markDirty();
        paint();
        paintSide();
      };
    }
    stage.querySelector('#sync-nodes').onclick = () => {
      lib.characters.forEach((character, index) => {
        if (graphData.nodes.some((node) => node.characterId === character.id)) return;
        const angle = (index / Math.max(1, lib.characters.length)) * Math.PI * 2;
        graphData.nodes.push({ id: Store.uid('node'), characterId: character.id, label: character.name, x: 400 + Math.cos(angle) * 200, y: 280 + Math.sin(angle) * 150 });
      });
      UI.markDirty();
      paint();
      UI.toast('已把缺席的角色放到图上');
    };
    stage.querySelector('#export-graph').onclick = () => {
      const built = F.graphToBook(graphData, lib);
      let book = lib.worldBooks.find((item) => item.name === '关系图');
      const entries = built.entries.map((entry) => Object.assign(blankEntry(), entry, { id: Store.uid('lore') }));
      if (book) book.entries = entries;
      else {
        book = { id: Store.uid('book'), name: '关系图', description: built.description, entries };
        lib.worldBooks.push(book);
      }
      UI.downloadJson('关系图.json', F.bookToWorldInfo(book));
      UI.markDirty();
      UI.toast('已写入世界书「关系图」，并下载 JSON');
    };
    paint();
    paintSide();
  }

  function check(stage) {
    const lib = UI.state.lib;
    const character = UI.selected(lib.characters, UI.state.sel.checkChar || 'ch_draft');
    const book = UI.selected(lib.worldBooks, UI.state.sel.checkBook || lib.worldBooks[0]?.id);
    if (character) UI.state.sel.checkChar = character.id;
    if (book) UI.state.sel.checkBook = book.id;
    stage.innerHTML = `<div class="toolbar">
      <label class="dark-muted">角色<select id="check-char">${lib.characters.map((item) => `<option value="${UI.esc(item.id)}"${character && item.id === character.id ? ' selected' : ''}>${UI.esc(item.name)}</option>`).join('')}</select></label>
      <label class="dark-muted">对照世界书<select id="check-book"><option value="">不对照</option>${lib.worldBooks.map((item) => `<option value="${UI.esc(item.id)}"${book && item.id === book.id ? ' selected' : ''}>${UI.esc(item.name)}</option>`).join('')}</select></label>
      <button type="button" class="btn btn-primary" id="run-check">重新检查</button>
      <button type="button" class="btn" id="export-check">导出报告</button>
    </div><div id="findings"></div>`;
    const paint = () => {
      const current = UI.charById(stage.querySelector('#check-char').value);
      const bookId = stage.querySelector('#check-book').value;
      if (!current) { stage.querySelector('#findings').innerHTML = '<div class="paper empty"><h3>没有角色可查</h3></div>'; return; }
      const findings = F.checkConsistency(lib, current.id, bookId || null);
      UI.state.lastFindings = { character: current.name, findings };
      const host = stage.querySelector('#findings');
      if (!findings.length) { host.innerHTML = '<div class="paper empty"><h3>这张卡对得上</h3><p>名字、开场和恒定条目里没有查出硬冲突。</p></div>'; return; }
      host.innerHTML = findings.map((item) => `<article class="paper finding"><div class="sev ${item.severity}">${item.severity === 'error' ? '冲突' : item.severity === 'warn' ? '存疑' : '备注'}</div><h3>${UI.esc(item.title)}</h3><p>${UI.esc(item.detail)}</p>${item.snippet ? `<p class="snippet">${highlight(item.snippet, item.highlight)}</p>` : ''}</article>`).join('');
    };
    stage.querySelector('#run-check').onclick = paint;
    stage.querySelector('#check-char').onchange = (event) => { UI.state.sel.checkChar = event.target.value; paint(); };
    stage.querySelector('#check-book').onchange = (event) => { UI.state.sel.checkBook = event.target.value; paint(); };
    stage.querySelector('#export-check').onclick = () => {
      paint();
      UI.downloadJson(`一致性-${UI.safeName(UI.state.lastFindings.character)}.json`, UI.state.lastFindings);
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
    </div>${UI.picker(scripts, current && current.id, (item) => `${item.beats.length} 拍`)}<div id="script-body"></div>`;
    UI.bindPicker(stage, (id) => { UI.state.sel.script = id; UI.renderStage(); });
    stage.querySelector('#new-script').onclick = () => {
      const created = { id: Store.uid('script'), name: '新剧本', beats: [{ id: Store.uid('sb'), speaker: 'narrator', line: '', trigger: '' }] };
      lib.scripts.unshift(created);
      UI.state.sel.script = created.id;
      UI.markDirty();
      UI.renderStage();
    };
    if (!current) { stage.querySelector('#script-body').appendChild(UI.empty('还没有剧本', '按顺序写旁白和角色的句子。', '', null)); return; }
    stage.querySelector('#export-script').onclick = () => { UI.downloadJson(`${UI.safeName(current.name)}.json`, F.scriptToExport(current, lib)); UI.toast('已导出剧本'); };
    stage.querySelector('#del-script').onclick = () => { lib.scripts = lib.scripts.filter((item) => item.id !== current.id); UI.markDirty(); UI.renderStage(); };
    const speakers = [['narrator', '旁白'], ...lib.characters.map((character) => [character.id, character.name])];
    const body = stage.querySelector('#script-body');
    const paint = () => {
      body.innerHTML = `<div class="work"><div class="stack" id="beats">${UI.field('', '') && ''}<div class="paper" style="margin-bottom:10px">${UI.field('剧本名', UI.text('name', current.name))}</div>
        ${current.beats.map((beat, index) => `<article class="paper stack" data-i="${index}" style="margin-bottom:8px">
          <div class="row"><select data-k="speaker">${speakers.map(([value, label]) => `<option value="${UI.esc(value)}"${beat.speaker === value ? ' selected' : ''}>${UI.esc(label)}</option>`).join('')}</select><button type="button" class="btn btn-small" data-up>上移</button><button type="button" class="btn btn-small" data-down>下移</button><button type="button" class="btn btn-small btn-danger" data-del>删除</button></div>
          <textarea data-k="line" rows="3">${UI.esc(beat.line)}</textarea>
          <input data-k="trigger" type="text" value="${UI.esc(beat.trigger || '')}" placeholder="可选触发词">
        </article>`).join('')}
        <button type="button" class="btn" id="add-beat">加一拍</button></div>
        <aside class="paper script-page" id="script-preview"></aside></div>`;
      const preview = () => {
        body.querySelector('#script-preview').innerHTML = `<p class="eyebrow">SCRIPT</p><h2>${UI.esc(current.name)}</h2>${current.beats.map((beat) => {
          const who = beat.speaker === 'narrator' ? '旁白' : (UI.charById(beat.speaker)?.name || '旁白');
          return `<div class="script-line"><div class="who">${UI.esc(who)}</div>${beat.trigger ? `<div class="trigger">触发：${UI.esc(beat.trigger)}</div>` : ''}<p>${UI.esc(beat.line || '……')}</p></div>`;
        }).join('')}`;
      };
      UI.bindFields(body, current, preview);
      preview();
      body.querySelectorAll('[data-i]').forEach((row) => {
        const index = Number(row.dataset.i);
        const beat = current.beats[index];
        row.querySelectorAll('[data-k]').forEach((node) => {
          const eventName = node.tagName === 'SELECT' ? 'change' : 'input';
          node.addEventListener(eventName, () => { beat[node.dataset.k] = node.value; preview(); UI.markDirty(); });
        });
        row.querySelector('[data-del]').onclick = () => { current.beats.splice(index, 1); UI.markDirty(); paint(); };
        row.querySelector('[data-up]').onclick = () => { if (index === 0) return; const [item] = current.beats.splice(index, 1); current.beats.splice(index - 1, 0, item); UI.markDirty(); paint(); };
        row.querySelector('[data-down]').onclick = () => { if (index >= current.beats.length - 1) return; const [item] = current.beats.splice(index, 1); current.beats.splice(index + 1, 0, item); UI.markDirty(); paint(); };
      });
      body.querySelector('#add-beat').onclick = () => { current.beats.push({ id: Store.uid('sb'), speaker: 'narrator', line: '', trigger: '' }); UI.markDirty(); paint(); };
    };
    paint();
  }

  function theme(stage) {
    const lib = UI.state.lib;
    if (!lib.themes.length) {
      lib.themes.push({ id: Store.uid('theme'), name: '夜漆', vars: { bg: '#140e0a', lacquer: '#24180f', paper: '#f4e7d1', ink: '#1a120c', accent: '#c6a15a', fontScale: 1, radius: 18 } });
      lib.activeThemeId = lib.themes[0].id;
    }
    const current = UI.selected(lib.themes, UI.state.sel.theme || lib.activeThemeId);
    UI.state.sel.theme = current.id;
    const vars = current.vars;
    stage.innerHTML = `<div class="toolbar">
      <button type="button" class="btn" id="new-theme">另存为新主题</button>
      <button type="button" class="btn btn-primary" id="use-theme">使用此主题</button>
      <button type="button" class="btn btn-primary" id="export-theme">导出 JSON</button>
      <button type="button" class="btn" id="export-css">下载 CSS</button>
      <button type="button" class="btn" id="copy-css">复制 CSS</button>
      <button type="button" class="btn btn-danger" id="del-theme">删除</button>
    </div>${UI.picker(lib.themes, current.id, (item) => item.id === lib.activeThemeId ? '使用中' : '')}
    <div class="work"><div class="paper stack">
      ${UI.field('名称', UI.text('name', current.name))}
      ${colorField('背景', 'bg')}${colorField('漆面', 'lacquer')}${colorField('纸色', 'paper')}${colorField('墨色', 'ink')}${colorField('铜饰', 'accent')}
      ${UI.field('字号', `<input id="font-scale" type="range" min="0.9" max="1.25" step="0.01" value="${Number(vars.fontScale) || 1}">`)}
      ${UI.field('圆角', `<input id="radius" type="range" min="0" max="28" step="1" value="${Number(vars.radius) || 18}">`)}
    </div><aside class="paper"><p class="eyebrow">活的预览</p><h2>纸上的句子</h2><p>主题改的是工坊自己。酒馆里要另外贴 CSS，选择器不会自动对上。</p><div class="bubble">杯沿对着你。</div><div class="swatches">${['bg', 'lacquer', 'paper', 'ink', 'accent'].map((key) => `<span class="swatch" style="background:${UI.esc(vars[key])}"></span>`).join('')}</div></aside></div>`;
    function colorField(label, key) {
      return UI.field(label, `<input type="color" data-color="${key}" value="${UI.esc(vars[key] || '#000000')}">`);
    }
    UI.bindPicker(stage, (id) => {
      UI.state.sel.theme = id;
      lib.activeThemeId = id;
      UI.applyTheme();
      UI.markDirty();
      UI.renderStage();
    });
    UI.bindFields(stage, current);
    stage.querySelectorAll('[data-color]').forEach((input) => {
      input.addEventListener('input', () => { vars[input.dataset.color] = input.value; UI.applyTheme(); UI.markDirty(); });
    });
    stage.querySelector('#font-scale').oninput = (event) => { vars.fontScale = Number(event.target.value); UI.applyTheme(); UI.markDirty(); };
    stage.querySelector('#radius').oninput = (event) => { vars.radius = Number(event.target.value); UI.applyTheme(); UI.markDirty(); };
    stage.querySelector('#use-theme').onclick = () => { lib.activeThemeId = current.id; UI.applyTheme(); UI.markDirty(); UI.toast(`正在使用「${current.name}」`); UI.renderStage(); };
    stage.querySelector('#new-theme').onclick = () => {
      const copy = structuredClone(current);
      copy.id = Store.uid('theme');
      copy.name = `${current.name} 副本`;
      lib.themes.push(copy);
      UI.state.sel.theme = copy.id;
      lib.activeThemeId = copy.id;
      UI.markDirty();
      UI.renderStage();
    };
    stage.querySelector('#export-theme').onclick = () => UI.downloadJson(`${UI.safeName(current.name)}.json`, F.themeToExport(current));
    stage.querySelector('#export-css').onclick = () => UI.downloadText(`${UI.safeName(current.name)}.css`, F.themeToCss(current), 'text/css');
    stage.querySelector('#copy-css').onclick = () => UI.copyText(F.themeToCss(current));
    stage.querySelector('#del-theme').onclick = () => {
      if (lib.themes.length <= 1) { UI.toast('至少留一个主题'); return; }
      lib.themes = lib.themes.filter((item) => item.id !== current.id);
      lib.activeThemeId = lib.themes[0].id;
      UI.state.sel.theme = lib.themes[0].id;
      UI.applyTheme();
      UI.markDirty();
      UI.renderStage();
    };
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
      <button type="button" class="btn" id="backup-demo">载入示例</button>
      <button type="button" class="btn btn-danger" id="backup-clear">清空库</button>
    </div>
    <div class="paper">
      <p class="eyebrow">LIBRARY</p>
      <h2>${UI.esc(lib.meta.name || '我的酒馆库')}</h2>
      <p>大约 ${Math.round(Store.bytes(lib) / 1024)} KB。备份是一份 JSON，里面有角色、世界书、提示词、群、聊天、素材（含图片数据）、正则、快捷回复、时间线、关系图、剧本、主题和书签。</p>
      <div class="stats">${rows.map(([label, count]) => `<div class="stat"><b>${count}</b><span>${label}</span></div>`).join('')}</div>
      <p class="help">恢复时可以整份替换，或按编号合并。合并时同一编号以备份为准。</p>
    </div>`;
    async function restoreFile(file) {
      if (!file) return;
      try {
        const incoming = F.backupLibrary(await parseJsonFile(file));
        const normalized = Store.normalize(incoming);
        const answer = await UI.ask({
          title: '恢复这份备份',
          body: `备份里有 ${normalized.characters.length} 张角色、${normalized.worldBooks.length} 本世界书。替换会清掉当前库。合并会保留当前库里备份没有的条目。`,
          actions: [
            { id: 'replace', label: '替换当前库', kind: 'btn-danger' },
            { id: 'merge', label: '合并进来', kind: 'btn-primary' },
            { id: 'no', label: '取消' },
          ],
        });
        if (answer === 'replace') UI.state.lib = normalized;
        else if (answer === 'merge') UI.state.lib = Store.merge(UI.state.lib, normalized);
        else return;
        UI.applyTheme();
        UI.flush();
        UI.toast(answer === 'replace' ? '已替换为备份' : '已合并备份');
        UI.renderStage();
      } catch (error) { UI.toast(error.message); }
    }
    stage.querySelector('#save-backup').onclick = () => {
      const date = new Date().toISOString().slice(0, 10);
      UI.downloadJson(`酒馆工坊-备份-${date}.json`, F.backupOf(lib));
      UI.toast('整库已导出');
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

  UI.mount({
    home, characters, lore, prompts, groups, chat, assets, regex, quick, timeline, graph, check, script, theme, backup,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
