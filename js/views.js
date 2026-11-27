/* The fourteen workshop modules, plus the desk overview. */
(function (root) {
  const UI = root.TAUI;
  const F = root.TAFormats;
  const Store = root.TAStore;
  const {hint,commitCurrentLibrary,readImage}=UI;
  const {mountGalleryPager}=root.TACollectionControls;

  async function parseJsonFile(file) {
    const text = await UI.readText(file);
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error('这份 JSON 读不通');
    }
  }

  const deleteWork = (collection,item,body) => root.TAIntegrityPanel.remove(collection,item,body);

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
        const item = character ? root.TACharacterEditor.create() : { id: Store.uid('book'), name: tr('新世界书'), description: '', entries: [] };
        (character ? lib.characters : lib.worldBooks).unshift(item); UI.markDirty();
        root.TAWorkspace.openEntity({ kind: character ? 'character' : 'book', id: item.id });
      }
    };
    paint();
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
      const pattern = needle ? new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi') : null;
      log.innerHTML = current.messages.map((message, index) => {
        const text = String(message.mes ?? '');
        let html = '', start = 0;
        if (pattern) {
          for (const hit of text.matchAll(pattern)) {
            html += UI.esc(text.slice(start, hit.index)) + `<mark>${UI.esc(hit[0])}</mark>`;
            start = hit.index + hit[0].length;
          }
        }
        html += UI.esc(text.slice(start));
        return `<article class="msg ${message.is_user ? 'user' : ''}" data-index="${index}"><header><span class="who">${UI.esc(message.name)}</span><span>${UI.esc(message.send_date || '')}</span></header><div class="body">${html}</div></article>`;
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
        staged.push({ id: Store.uid('asset'), name: file.name, kind, dataUrl, mime: file.type, bytes: file.size, createdAt: new Date().toISOString() });
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
    const importHelp = UI.t('保存到本机后，可导出当前脚本的 JSON，再到 SillyTavern「扩展 → Regex → 导入」选择该文件。');
    const list = lib.regexScripts.filter((script) => UI.matchQuery(script.scriptName + script.findRegex));
    const script = list.find((item) => item.id === UI.state.sel.regex) || list[0] || null;
    if (script) UI.state.sel.regex = script.id;
    stage.innerHTML = `<div class="toolbar">
      <button type="button" class="btn btn-primary" id="new-rx">新建脚本</button>
      <button type="button" class="btn" id="import-rx">导入 JSON</button>
      <button type="button" class="btn" id="export-current-rx" ${script ? '' : 'disabled'}>导出当前脚本</button>
      <button type="button" class="btn" id="export-rx" ${lib.regexScripts.length ? '' : 'disabled'}>导出全部</button>
      <button type="button" class="btn btn-danger" id="del-rx" ${script ? '' : 'disabled'}>删除</button>
    </div><p class="help regex-export-help">${UI.esc(importHelp)}</p>${UI.picker(list, script && script.id, (item) => (item.disabled ? '停用' : '启用'))}<div id="rx-body"></div>`;
    mountPageAssist(stage, 'regex');
    UI.bindPicker(stage, (id) => { UI.state.sel.regex = id; UI.renderStage(); });
    stage.querySelector('#new-rx').onclick = () => {
      const created = { id: Store.uid('rx'), scriptName: '新脚本', findRegex: '', replaceString: '', trimStrings: [], placement: [2], disabled: false, markdownOnly: false, promptOnly: false, runOnEdit: false, substituteRegex: 0, minDepth: null, maxDepth: null };
      lib.regexScripts.unshift(created);
      UI.markDirty();
      root.TASearch.open({kind:'regex',id:created.id,field:'findRegex'});
    };
    if (script) stage.querySelector('#export-current-rx').onclick = () => {
      const filename=UI.safeName(script.scriptName)+'.json';
      UI.downloadJson(filename,F.regexToExport([script])[0]);
      UI.showExport(filename,importHelp);
    };
    stage.querySelector('#export-rx').onclick = () => {
      UI.downloadJson('regex-scripts.json', F.regexToExport(lib.regexScripts));
      UI.toast('已导出正则数组');
      UI.showExport('regex-scripts.json',importHelp);
    };
    stage.querySelector('#import-rx').onclick = async () => {
      try {
        const file = await UI.pickFile('.json,application/json');
        if (!file) return;
        const scripts = F.regexFromImport(await parseJsonFile(file));
        if (!scripts.length) throw new Error('请选择包含正则脚本的 SillyTavern JSON 文件。');
        scripts.forEach(item => { item.id = Store.uid('rx'); });
        await commitCurrentLibrary(candidate => { candidate.regexScripts = candidate.regexScripts.concat(scripts); });
        if(stage.querySelector('#rx-body'))root.TASearch.open({kind:'regex',id:scripts[0].id,field:'findRegex'});
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
      <button type="button" class="btn btn-primary" id="new-qr">手动新建回复集</button>
      <button type="button" class="btn" id="import-qr">导入 JSON</button>
      <button type="button" class="btn btn-primary" id="export-qr" ${set ? '' : 'disabled'}>导出这套</button>
      <button type="button" class="btn btn-danger" id="del-qr" ${set ? '' : 'disabled'}>删除</button>
      <span class="help authoring-export-help" data-export-guide>${UI.esc(UI.t(root.TACreationAssist.guide('quick').destination))}</span>
    </div>${UI.picker(sets, set && set.id, (item) => `${item.replies.length} 条`)}<div id="qr-body"></div>`;
    mountPageAssist(stage, 'quick');
    root.TACreationAssist.selectedReply(stage,set);
    UI.bindPicker(stage, (id) => { UI.state.sel.qr = id; UI.renderStage(); });
    stage.querySelector('#new-qr').onclick = () => {
      const created = { id: Store.uid('qrset'), name: UI.t('新的快捷回复'), replies: [] };
      lib.quickReplySets.unshift(created);
      UI.state.sel.qr = created.id;
      UI.markDirty();
      UI.go('quick');stage.querySelector('#qr-body [data-field=name]')?.focus();
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
      UI.toast(UI.t('已导出快捷回复集'),{kind:'success'});
      UI.showExport(filename, UI.t(root.TACreationAssist.guide('quick').destination));
    };
    stage.querySelector('#del-qr').onclick = () => deleteWork('quickReplySets',set);
    const body = stage.querySelector('#qr-body');
    body.innerHTML = `<div class="paper stack">${UI.field('套名', UI.text('name', set.name))}
      <div id="qr-list">${set.replies.map((reply) => `<div class="paper" data-id="${UI.esc(reply.id)}" style="padding:10px">
        <div class="row"><input data-k="label" value="${UI.esc(reply.label)}" placeholder="按钮文字"><input data-k="color" type="color" value="${UI.esc(reply.color || '#c6a15a')}"><button type="button" class="btn btn-small" data-copy>复制内容</button><button type="button" class="btn btn-small btn-danger" data-del>删除</button></div>
        <textarea data-k="message" rows="3">${UI.esc(reply.message)}</textarea>
      </div>`).join('')}</div>
      <button type="button" class="btn" id="add-qr">添加一条</button><div id="qr-lesson" data-no-translate></div></div>`;
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
      set.replies.push({ id: Store.uid('qr'), label: UI.t('新回复'), message: '', color: '#c6a15a', title: '' });
      UI.markDirty('quickReplySets',set.id);
      UI.renderStage();
      stage.querySelector('#qr-list > :last-child [data-k=label]')?.focus();
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
          const changed = result.previous && JSON.stringify(result.previous) !== JSON.stringify(result.book);
          await root.TAHistory.commitWorks(result.library,result.previous ? [['worldBooks',result.previous]] : [],{
            reason:changed ? '关系图同步前' : undefined, scopes:result.previous ? [['worldBooks',result.book.id],['graph']] : undefined,
          });
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

  function script(stage) {
    const lib = UI.state.lib;
    const scripts = lib.scripts.filter((item) => UI.matchQuery(item.name + item.beats.map((beat) => beat.line).join('\n')));
    const current = scripts.find((item) => item.id === UI.state.sel.script) || scripts[0] || null;
    if (current) UI.state.sel.script = current.id;
    stage.innerHTML = `<div class="toolbar">
      <button type="button" class="btn btn-primary" id="new-script">手动新建剧本</button>
      <button type="button" class="btn btn-primary" id="export-script" ${current ? '' : 'disabled'}>导出 JSON</button>
      <button type="button" class="btn btn-danger" id="del-script" ${current ? '' : 'disabled'}>删除</button>
      <span class="help authoring-export-help" data-export-guide>${UI.esc(UI.t(root.TACreationAssist.guide('script').destination))}</span>
    </div>${UI.picker(scripts, current && current.id, (item) => `${item.beats.length} 拍`)}<div id="script-body"></div>`;
    mountPageAssist(stage, 'script');
    UI.bindPicker(stage, (id) => { UI.state.sel.script = id; UI.renderStage(); });
    stage.querySelector('#new-script').onclick = () => {
      const created = { id: Store.uid('script'), name: UI.t('新剧本'), beats: [{ id: Store.uid('sb'), speaker: 'narrator', line: '', trigger: '' }] };
      lib.scripts.unshift(created);
      UI.state.sel.script = created.id;
      UI.markDirty();
      UI.go('script');stage.querySelector('#script-body [data-field=name]')?.focus();
    };
    if (!current) { stage.querySelector('#script-body').appendChild(UI.empty('还没有剧本', '按顺序写旁白和角色的句子。', '', null)); return; }
    stage.querySelector('#export-script').onclick = () => {
      const filename = `${UI.safeName(current.name)}.json`;
      UI.downloadJson(filename, F.scriptToExport(current, lib));
      UI.toast(UI.t('已导出剧本'),{kind:'success'});
      UI.showExport(filename, UI.t(root.TACreationAssist.guide('script').destination));
    };
    stage.querySelector('#del-script').onclick = () => deleteWork('scripts',current);
    const speakers = [['narrator', UI.t('旁白')], ...lib.characters.map((character) => [character.id, character.name])];
    const body = stage.querySelector('#script-body');
    const paint = () => {
      body.innerHTML = `<div class="work"><div class="stack" id="beats">${UI.field('', '') && ''}<div class="paper" style="margin-bottom:10px">${UI.field('剧本名', UI.text('name', current.name))}</div>
        ${current.beats.map((beat, index) => `<article class="paper stack" data-i="${index}" style="margin-bottom:8px">
          <div class="row"><select data-k="speaker" data-no-translate>${!speakers.some(([value])=>String(value)===String(beat.speaker))?`<option value="" selected>${UI.esc(beat.speakerName || UI.t('未指定发言人'))}</option>`:''}${speakers.map(([value,label])=>`<option value="${UI.esc(value)}"${String(beat.speaker)===String(value)?' selected':''}>${UI.esc(label)}</option>`).join('')}</select><button type="button" class="btn btn-small" data-up>上移</button><button type="button" class="btn btn-small" data-down>下移</button><button type="button" class="btn btn-small btn-danger" data-del>删除</button></div>
          <textarea data-k="line" rows="3">${UI.esc(beat.line)}</textarea>
          <input data-k="trigger" type="text" value="${UI.esc(beat.trigger || '')}" placeholder="可选触发词">
        </article>`).join('')}
        <button type="button" class="btn" id="add-beat">加一拍</button></div>
        <aside class="paper script-page" id="script-preview" data-no-translate></aside></div>`;
      const preview = () => {
        const exported = F.scriptToExport(current, lib);
        body.querySelector('#script-preview').innerHTML = `<h2>${UI.esc(current.name)}</h2>${current.beats.map((beat) => {
          const who = beat.speaker === 'narrator' ? UI.t('旁白') : F.scriptSpeaker(beat,lib);
          return `<div class="script-line"><div class="who">${UI.esc(who)}</div>${beat.trigger ? `<div class="trigger">${UI.esc(UI.t('script.trigger', { word: beat.trigger }))}</div>` : ''}<p>${UI.esc(beat.line || '……')}</p></div>`;
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
          node.addEventListener(eventName, () => {
            if(node.dataset.k==='speaker'){
              beat.speaker=node.value;
              delete beat.speakerName;
            }else beat[node.dataset.k]=node.value;
            preview();UI.markDirty('scripts',current.id);
          });
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
      <button type="button" class="btn" id="restore-work">恢复单件作品</button>
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
    async function restoreFile(file,single=false) {
      if (!file) return;
      try {
        const data = await parseJsonFile(file);
        const {library:incoming,workState}=F.readBackup(data);
        const normalized = Store.verify(incoming);
        if(single){await root.TAWorkRestorePanel.open(normalized,workState,file.name);return;}
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
            ...((normalized.characters.length || normalized.worldBooks.length)?[{id:'one-work',label:'恢复单件作品'}]:[]),
            { id: 'replace', label: '替换当前库', kind: 'btn-danger' },
            { id: 'no', label: '取消' },
          ],
        });
        if(answer==='one-work'){await root.TAWorkRestorePanel.open(normalized,workState,file.name);return;}
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
    stage.querySelector('#restore-work').onclick = async () => restoreFile(await UI.pickFile('.json,application/json'),true);
    stage.querySelector('#backup-demo').onclick = UI.confirmLoadDemo;
    stage.querySelector('#backup-clear').onclick = UI.confirmClear;
    stage.ondragover = (event) => event.preventDefault();
    stage.ondrop = (event) => {
      event.preventDefault();
      restoreFile(event.dataTransfer.files && event.dataTransfer.files[0]);
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

  function mountPageAssist(stage, kind) {
    if (!stage || stage.querySelector('.ai-assist')) return;
    const box = document.createElement('section');
    box.className = 'paper stack ai-assist';
    const guide=root.TACreationAssist.guide(kind);
    box.innerHTML = `<h3>${UI.esc(UI.t(guide?.title || root.NIJANAI.MODULES[kind] || 'AI 辅助'))}</h3><label class="field"><span class="field-label">写下要求</span><textarea rows="3" data-assist></textarea></label><button type="button" class="btn" data-assist-go>${UI.esc(UI.t(guide?.generate || '生成并预览'))}</button><p class="model-progress" role="status"></p>`;
    const toolbar=guide && stage.querySelector('.toolbar');
    if(toolbar)toolbar.after(box);else stage.prepend(box);
    root.TATaskActivity.bindAssist(box,kind);
  }

  function studio(stage) {
    if (root.NIJANStudio) root.NIJANStudio.render(stage);
  }

  root.TALibraryDB.start({
    home, resources: stage => root.TAResourcePanel.render(stage), themes:stage=>root.TAThemeWorkshop.render(stage), studio, characters:root.TACharacterEditor.render, lore:root.TAWorldEditor.render, prompts, groups, chat, assets, regex, quick, timeline, graph, check:root.TAConsistencyPanel.render, script, backup, sections, memory, tutorial,
  });
})(typeof globalThis !== 'undefined' ? globalThis : window);
