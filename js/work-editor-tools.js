/* Shared import feedback, editor controls, attached media and JSON editing. */
(function (root) {
  const UI = root.TAUI;
  const F = root.TAFormats;
  const Store = root.TAStore;
  const {readImage,commitCurrentLibrary}=UI;

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
      if (packId == null || packId === '') { UI.toast('先选定一套表情包'); return; }
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
    const collection = kind === 'card' ? 'characters' : 'worldBooks';
    const serialize = work => kind === 'card' ? F.characterToCard(work,null) : F.bookToWorldInfo(work);
    const data = serialize(owner), before = JSON.stringify(data);
    host.innerHTML = `<details class="paper"><summary>JSON 互转</summary><textarea id="json-box" rows="8">${UI.esc(JSON.stringify(data, null, 2))}</textarea><button type="button" class="btn" id="json-back">从 JSON 转回</button></details>`;
    host.querySelector('#json-back').onclick = async () => {
      try {
        const raw = host.querySelector('#json-box').value;
        const lib = UI.state.lib, current = Store.byId(lib[collection],owner.id);
        if (!current || current.id !== owner.id || JSON.stringify(serialize(current)) !== before) {
          throw new Error(UI.t('资料库已变化，请重新打开。'));
        }
        const target = structuredClone(current);
        const next = {...lib,[collection]:lib[collection].map(row=>row===current ? target : row)};
        let scopes = [[collection,current.id]];
        if (kind === 'card') {
          const {card} = root.TAFolderImport.parseCard({name:'card.json'},new TextEncoder().encode(raw));
          if (card.book) {
            const companion = root.TAFolderImport.makeBook(card.book,card.name+' · '+UI.t('世界书'));
            next.worldBooks = [companion,...lib.worldBooks]; card.embeddedBookId = companion.id;
            scopes = undefined;
          }
          delete card.book;
          Object.assign(target,card);
        } else {
          const prior = new Map(F.bookToCharacterBook(target).entries.map((entry,index)=>[entry.id,target.entries[index]]));
          const book = F.worldInfoToBook(JSON.parse(raw),owner.name);
          book.entries = book.entries.map(entry => {
            const previous = prior.get(entry.stUid);
            prior.delete(entry.stUid);
            return {...entry,id:previous?.id ?? Store.uid('lore'),...(previous?.graphSource ? {graphSource:previous.graphSource} : {})};
          });
          Object.assign(target,book);
        }
        await root.TAHistory.commitWorks(next,[[collection,current]],{reason:'JSON 互转前',scopes});
        UI.renderStage();
      } catch (error) { UI.toast(error.message || '这份 JSON 转不回来'); }
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

  root.TAWorkEditorTools = {showReading,mountChips,mountSticker,exportStickerFiles,mountJson,mountAiBar};
})(globalThis);
