/* Character card editor, gallery and native PNG export. */
(function (root) {
  const UI = root.TAUI;
  const F = root.TAFormats;
  const Store = root.TAStore;
  const cardImportTip='更新酒馆已有角色时，打开该角色，选「更多 → 替换 / 更新 → 从文件替换」。新角色可在「角色管理」导入 PNG 或 JSON。';
  const {mountGalleryPager}=root.TACollectionControls;
  const {showReading,mountChips,mountSticker,exportStickerFiles,mountJson,mountAiBar}=root.TAWorkEditorTools;

  function stamp() { return new Date().toISOString(); }

  function blankCharacter() {
    return {
      id: Store.uid('ch'), name: '新角色', description: '', personality: '', scenario: '',
      first_mes: '', mes_example: '', creator_notes: '', system_prompt: '', post_history_instructions: '',
      alternate_greetings: [], tags: [], creator: '', character_version: '1.0.0', talkativeness: 0.5,
      avatarAssetId: null, expressionAssetIds: [], createdAt: stamp(), updatedAt: stamp(),
    };
  }

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
    const text = JSON.stringify(F.characterToCard(character,book));
    if (character.avatarAssetId != null && character.avatarAssetId !== '') {
      const avatar = UI.assetById(character.avatarAssetId);
      const {png} = await root.TAPortraitImage.read(avatar?.dataUrl || '');
      return root.TAPng.embedChara(png,text);
    }
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    drawSeal(ctx, character.name);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('浏览器没有给出 PNG');
    return root.TAPng.embedChara(new Uint8Array(await blob.arrayBuffer()),text);
  }

  async function exportCharacterPng(character, book) {
    UI.downloadBlob(`${UI.safeName(character.name)}.png`, new Blob([await makeCardPng(character,book)], { type: 'image/png' }));
  }

  async function exportCharacterJson(character,book,includeExpressions) {
    const filename = UI.safeName(character.name)+'.json';
    const pack = Store.byId(UI.state.lib.stickerPacks,character.stickerPackId);
    try {
      const card = F.characterToCard(character,book);
      if (pack?.stickers?.length) card.data.extensions.expression_folder = character.name+'/expressions';
      UI.downloadJson(filename,card);
    } catch (error) {
      UI.toast(UI.t('export.cardFailed',{reason:UI.t(error.message)}),{kind:'error'});
      return;
    }
    const requested = UI.t('export.cardRequested',{format:'JSON'}), message = requested+' '+UI.t(cardImportTip);
    UI.toast(requested,{kind:'info'}); UI.showExport(filename,message);
    if (pack && includeExpressions) await exportStickerFiles(pack,character.name,{filename,message});
  }

  function portraitRecovery(toolbar,character,bookOf) {
    const exportButton = toolbar.querySelector('[data-act=png]');
    const active = () => toolbar.isConnected && !exportButton.disabled && UI.state.sel.character === character.id;
    let panel;
    return error => {
      if (error?.code !== 'card.localPortrait' || !active()) return false;
      if (!panel?.isConnected) {
        panel = document.createElement('section');
        panel.className = 'card-portrait-recovery'; panel.tabIndex = -1;
        panel.innerHTML = '<p role="alert">'+UI.esc(UI.t('card.localPortrait'))+'</p><div class="row">'+
          '<button type="button" class="btn" data-portrait-replace>'+UI.esc(UI.t('card.reselectPortrait'))+'</button>'+
          '<button type="button" class="btn" data-portrait-json>'+UI.esc(UI.t('card.saveText'))+'</button></div>';
        toolbar.querySelector('.work-export-guide').before(panel);
        panel.querySelector('[data-portrait-json]').onclick = () => {
          const live = Store.byId(UI.state.lib.characters,character.id);
          if (live && active()) return exportCharacterJson(live,bookOf(),false);
        };
        const replace = panel.querySelector('[data-portrait-replace]');
        replace.onclick = async () => {
          const previousId = character.avatarAssetId, oldImage = UI.assetById(previousId)?.dataUrl;
          replace.disabled = true;
          try {
            const file = await UI.pickFile('image/*');
            if (!file || !active()) return;
            const {png} = await root.TAPortraitImage.read(file);
            const asset = await root.TACardPortraits.makeAsset(Store.uid('asset'),file.name,png);
            if (!active()) return;
            const lib = UI.state.lib;
            if (Store.byId(lib.characters,character.id) !== character || character.avatarAssetId !== previousId ||
                UI.assetById(previousId)?.dataUrl !== oldImage) throw new Error('sync.staleWork');
            const updated = {...character,avatarAssetId:asset.id,updatedAt:stamp()};
            delete updated.folderAvatarPending;
            await root.TAHistory.commitWorks({...lib,assets:[...lib.assets,asset],
              characters:lib.characters.map(card => card === character ? updated : card)},[['characters',character]],
              {reason:'更换头像前',recordChanges:true});
            if (active()) UI.renderStage();
            UI.toast(UI.t('card.portraitReplaced'),{kind:'success'});
          } catch (err) {
            if (active()) UI.toast(UI.t(err.code || err.message),{kind:'error'});
          } finally {replace.disabled=false;}
        };
      }
      panel.focus({preventScroll:true}); panel.scrollIntoView({block:'nearest'});
      return true;
    };
  }

  function characters(stage) {
    const lib = UI.state.lib;
    const list = UI.state.query.trim() ? lib.characters.filter(character => UI.matchQuery([
      character.name, (character.tags || []).join(' '), character.description, character.personality,
    ].join('\n'))) : lib.characters;
    const character = UI.selected(list,UI.state.sel.character);
    UI.bindWork('characters',character);
    if (character) UI.state.sel.character = character.id;
    const books = lib.worldBooks;
    const duplicateBooks=root.TAWorkRelations.duplicateNames(books);
    const galleryOn = UI.state.cardView === 'gallery';
    stage.innerHTML = `<div class="dropwell"><div><strong>把角色卡拖到这里</strong><span>JSON，或带 chara 数据的 PNG。</span></div><button type="button" class="btn btn-primary" id="card-drop-btn">选择文件</button></div><div id="sticker-host"></div><div id="json-host"></div><div class="toolbar">
      <button type="button" class="btn${galleryOn ? ' btn-primary' : ''}" data-act="view-gallery">画廊</button>
      <button type="button" class="btn${galleryOn ? '' : ' btn-primary'}" data-act="view-edit">编辑</button>
      <button type="button" class="btn btn-primary" data-act="new">新建角色</button>
      <button type="button" class="btn" data-act="import">导入 JSON / PNG</button>
      <button type="button" class="btn" data-act="dup" ${character ? '' : 'disabled'}>复制</button>
      <button type="button" class="btn btn-danger" data-act="del" ${character ? '' : 'disabled'}>删除</button>
      <span class="spacer"></span>
      <label class="dark-muted">导出时附带<select id="attach-book"><option value="">不附带世界书</option>${books.map((book) => `<option value="${UI.esc(book.id)}" data-no-translate>${UI.esc(root.TAWorkPage.itemLabel(book,duplicateBooks))}</option>`).join('')}</select></label>
      <button type="button" class="btn btn-primary" data-act="json" ${character ? '' : 'disabled'}>导出 JSON</button>
      <button type="button" class="btn btn-primary" data-act="png" ${character ? '' : 'disabled'}>导出 PNG</button>
      ${character ? `<p class="note work-export-guide">${UI.esc(UI.t(cardImportTip))}</p>` : ''}
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
      delete copy.creationSource;
      delete copy.creationRecordKeys;
      delete copy.creationPeerKeys;
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
    stage.querySelector('[data-act="del"]').onclick = () => root.TAIntegrityPanel.remove('characters',character,'这张卡会从本机库里拿走。已经导出的文件还在。');
    const toolbar = stage.querySelector('.toolbar');
    const bookOf = () => Store.byId(UI.state.lib.worldBooks,stage.querySelector('#attach-book').value);
    const recoverPortrait = portraitRecovery(toolbar,character,bookOf);
    root.TAHistoryPanel.mount(toolbar,'characters',character);
    let workLinks;
    if(!galleryOn){
      root.TACardSyncPanel.mount(toolbar,character,recoverPortrait);
      workLinks=root.TAWorkPage.editorLinks(toolbar,'character',character);
    }
    root.TAStBundle.mount(stage,character,bookOf,makeCardPng,recoverPortrait);
    const attached = Store.byId(books,character.embeddedBookId ?? character.source?.embeddedBookId);
    if (attached) stage.querySelector('#attach-book').value = attached.id;
    stage.querySelector('#attach-book').addEventListener('change', () => {
      character.embeddedBookId = bookOf()?.id ?? ''; UI.markDirty('characters',character.id);
      if(workLinks){workLinks.remove();workLinks=root.TAWorkPage.editorLinks(toolbar,'character',character);}
    });
    stage.querySelector('[data-act="json"]').onclick = () => exportCharacterJson(character,bookOf(),true);
    stage.querySelector('[data-act="png"]').onclick = () => exportCharacterPng(character, bookOf()).then(() => {
      const message = UI.t('export.cardRequested', {format:'PNG'});
      UI.toast(message, {kind:'info'});
      if(toolbar.isConnected) toolbar.querySelector('.card-portrait-recovery')?.remove();
      UI.showExport(`${UI.safeName(character.name)}.png`, message+' '+UI.t(cardImportTip));
    }).catch(error => {
      if(!recoverPortrait(error)) UI.toast(UI.t('export.cardFailed',{reason:UI.t(error.message)}),{kind:'error'});
    });
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
        if(!visible)toolbar.querySelector('.card-portrait-recovery')?.remove();
        currentLabel.textContent=visible ? UI.t('当前角色')+' · '+root.TAIntegrityPanel.displayName(character) : UI.t('请在画廊中选择角色卡。');
        grid.innerHTML = items.map(item => {
          const avatar = assetsById.get(item.avatarAssetId), name = UI.esc(root.TAIntegrityPanel.displayName(item));
          const face = avatar ? `<img alt="" src="${UI.esc(UI.imageUrl(avatar))}" loading="lazy" decoding="async">` : `<div class="seal-fallback" data-no-translate>${UI.esc((item.name || '名').slice(0,1))}</div>`;
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
        ${UI.fold('personality', UI.t('workPage.personality'), UI.area('personality', character.personality, 4))}
        ${UI.fold('scenario', '情景', UI.area('scenario', character.scenario, 4))}
        ${UI.fold('first_mes', '开场白', UI.area('first_mes', character.first_mes, 6))}
        ${UI.fold('greetings', '备用开场', '<div id="greetings"></div>', '点「添加」再写。导出为备用开场白。')}
        ${UI.fold('mes_example', '对话示例', UI.area('mes_example', character.mes_example, 5), '可用 {{char}} 与 {{user}}')}
        ${UI.fold('creator_notes', '创作者备注', UI.area('creator_notes', character.creator_notes, 3))}
        ${UI.fold('system_prompt', UI.t('workPage.mainPrompt'), UI.area('system_prompt', character.system_prompt, 3) + '<a class="work-page-link" href="sections.html?part=style">'+UI.esc(UI.t('workPage.studioStyle'))+'</a>', UI.t('workPage.promptHelp'))}
        ${UI.fold('post_history_instructions', UI.t('workPage.postHistory'), UI.area('post_history_instructions', character.post_history_instructions, 3), '放在对话历史之后，给模型的补充指令。')}
      </div>
      <aside class="paper card-preview" id="char-preview"></aside>
    </div>`;
    const preview = body.querySelector('#char-preview');
    preview.innerHTML = `<div data-preview-face></div><p class="eyebrow">CHARACTER · V2</p>
        <h2 id="prev-name"></h2>
        <div class="tags" id="prev-tags"></div>
        <p class="clamp" id="prev-desc"></p>
        <div class="bubble" id="prev-mes"></div>
        <p class="muted" id="prev-meta"></p>
        <div id="card-lesson"></div>
        <div id="card-import"></div>`;
    let portrait;
    const paintPreview = () => {
      const avatar = UI.assetById(character.avatarAssetId);
      const face = preview.querySelector('[data-preview-face]');
      const next=avatar ? UI.imageUrl(avatar) : (character.name || '名').slice(0,1);
      if(portrait!==next){
        portrait=next;
        const node=document.createElement(avatar?'img':'div');
        node.className=avatar?'avatar':'avatar seal-fallback';
        if(avatar){node.alt='';node.src=next;}else node.textContent=next;
        face.replaceChildren(node);
      }
      preview.querySelector('#prev-name').textContent = character.name || '未命名';
      preview.querySelector('#prev-tags').innerHTML = (character.tags || []).map((tag) => `<span class="tag">${UI.esc(tag)}</span>`).join('');
      preview.querySelector('#prev-desc').textContent = character.description || '描述还空着。';
      preview.querySelector('#prev-mes').textContent = character.first_mes || '还没有开场白。';
      preview.querySelector('#prev-meta').textContent = `${character.creator || '未署名'} · ${character.character_version || '无版本'} · 话多 ${Number(character.talkativeness || 0).toFixed(2)}`;
      const attached=bookOf(),data=F.characterToCard(character).data;
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
        attached ? UI.t('card.book', { name: attached.name || UI.t('未命名'), count: attached.entries.length }) : UI.t('card.bookNone'),
        UI.t('card.spec'),
      ]);
      const importedCard = UI.state.cardImportId === character.id ? F.explainCard(character) : null;
      showReading(preview.querySelector('#card-import'), UI.t('import.cardTitle'), importedCard);
    };
    stage.querySelector('#attach-book').onchange=paintPreview;
    paintPreview();
    UI.state.openFold ||= {};
    if (!UI.state.openFold.char) UI.state.openFold.char = 'description';
    UI.mountFolds(body.querySelector('#char-form'), 'char');
    UI.bindFields(body, character, (key) => {
      if (key === 'avatarAssetId') {
        character.avatarAssetId = UI.assetById(character.avatarAssetId)?.id ?? null;
        toolbar.querySelector('.card-portrait-recovery')?.remove();
      }
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

  root.TACharacterEditor = {render:characters,create:blankCharacter};
})(globalThis);
