/* Download and preview cards or world books before adding them locally. */
(function (root) {
  'use strict';
  const UI = () => root.TAUI, L = () => root.TALinkImport;
  const tr = (key,vars) => UI().t(key,vars), esc = (value) => UI().esc(value);
  let state = null;
  const host = () => document.getElementById('modal-root');
  function message(error) {
    const code = error?.code || error?.message;
    if (code==='multiple-cards' || code==='invalid-entries') return tr(error.message);
    return tr(({
      'catalog-file':'请选择对应的附件文件。', 'invalid-url':'请粘贴一个有效的文件链接。', 'https-required':'请使用公开的 HTTPS 文件链接。', 'private-url':'这个链接指向本机或内网，请改用公开的 HTTPS 文件链接。',
      'discord-message':'这是 Discord 帖子链接。请在原帖附件上复制下载链接，再粘贴到这里。', 'github-file':'请复制 GitHub 中具体 JSON 或 PNG 文件的链接。',
      'too-large':'文件超过 12 MB，请下载后检查内容或换用较小的文件。', 'timeout':'读取超时了，可以重试或重新复制下载链接。', 'cancelled':'已停止读取。',
      'browser-network':'浏览器未能读取此链接，可能被跨域限制。可在桌面版重试，或下载文件后导入。', 'network':'未能下载文件，请检查网络或重新复制下载链接。',
      'empty-file':'链接返回了空文件。', 'html-page':'链接返回的是网页。请复制 JSON 文件或角色卡附件的下载链接。',
      'invalid-json':'这个文件不是有效的 JSON 或角色卡 PNG。', 'invalid-card':'角色卡中的数据没有读完整。', 'no-card-data':'这张 PNG 里没有角色卡数据。',
      'no-embedded-book':'这张角色卡没有内嵌世界书。', 'not-world-book':'这个文件没有可识别的世界书条目。', 'empty-book':'这本世界书没有条目。',
      'card-name-required':'请给这张角色卡起个名字。', 'name-required':'请给这本世界书起个名字。', 'redirect':'链接跳转次数过多，请复制最终文件的下载链接。', 'encoding':'服务器返回的文件编码暂不支持，请下载后导入。',
      'not-character-card':'这个链接不是角色卡，请使用角色卡 JSON 或 PNG。', 'import-in-use':'导入的内容已有其他引用，请先处理相关引用再撤销。',
      'http-401':'链接需要登录，请使用公开文件的下载链接。', 'http-403':'链接不可访问或已经过期，请从原帖重新复制附件下载链接。', 'http-404':'文件没有找到，请检查链接或到原帖获取新版。',
      'http-429':'来源暂时限制了下载频率，请稍后再试。', 'busy':'已有文件正在读取，请稍后再试。',
    })[code] || (/^http-/.test(code || '') ? '来源服务器暂时无法提供这个文件，请稍后再试。' : '文件没有读进来，请检查格式后重试。'));
  }
  function close() {
    state?.controller?.abort(); const focus = state?.focus; state = null;
    host().classList.remove('show','link-import-open');host().innerHTML='';host().onclick=null;document.removeEventListener('keydown',keyboard,true);
    if(focus?.isConnected)focus.focus();
  }
  function keyboard(event) {
    if(!state)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();return;}
    if(event.key!=='Tab')return;
    const items=[...host().querySelectorAll('button:not(:disabled),input:not(:disabled),a,summary')].filter(item=>item.getClientRects().length),first=items[0],last=items.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
  }
  async function load(session) {
    if(session.busy)return;
    session.busy=true;session.sourceConfirmed=false;session.prepared=null;session.receipt=null;session.failed=false;session.status=tr('正在读取链接，读完先看一眼。');
    const controller=new AbortController();session.controller=controller;render();
    try {
      const file=await L().download(session.url,{signal:controller.signal});
      if(session.expectedFilenames.length && !session.expectedFilenames.includes(file.filename || L().filename(file.url)))throw L().error('catalog-file');
      if(state!==session||controller.signal.aborted)return;
      const makeAvatar=async(bytes)=>{
        const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
        try{const scale=Math.min(1,192/bitmap.width,256/bitmap.height),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#212420';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);const dataUrl=canvas.toDataURL('image/jpeg',.8);return{dataUrl,mime:'image/jpeg',bytes:Math.ceil(dataUrl.length*.75)};}finally{bitmap.close();}
      };
      const prepared=await L().prepare(file,{kind:session.kind,makeAvatar,attribution:session.attribution});
      if(state!==session||controller.signal.aborted)return;
      session.prepared=prepared;session.name=session.kind==='character'?prepared.character.name:prepared.book.name;session.includeBook=true;session.query='';session.status=tr(session.kind==='character'?'角色卡已读好，确认后另存到本地。':'世界书已读好，确认后另存到本地。');
    }catch(error){if(state===session){session.failed=true;session.status=message(error);}}
    finally {if(state===session){session.busy=false;render();}}
  }
  function reveal(id,kind,preserveUndo=false) {
    if(kind==='character'){UI().state.sel.character=id;UI().state.cardView='edit';}
    else{UI().state.sel.book=id;UI().state.sel.entry=null;UI().state.loreFilter='';}
    UI().state.query='';close();if(preserveUndo&&document.body.dataset.page)UI().renderStage();else UI().go(kind==='character'?'characters':'lore');
  }
  async function apply(session) {
    try {
      if(!session.prepared||session.busy||(session.attribution&&!session.sourceConfirmed))return;
      if(!session.name.trim())throw L().error(session.kind==='character'?'card-name-required':'name-required');
      const plan=L().plan(UI().state.lib,session.prepared,session.name,{includeBook:session.includeBook});
      if(plan.existingId&&!plan.operations?.length){reveal(plan.existingId,session.kind);UI().toast(tr(session.kind==='character'?'这张角色卡已在本地，已为你打开。':'这本世界书已在本地，已为你打开。'));return;}
      const library=root.NIJANAI.copy(UI().state.lib);let receipt=root.NIJANAI.commit(library,plan),avatarSkipped=false;
      try{await UI().commitLibrary(library);}catch(error){
        const addedAssets=new Set(receipt.operations.filter(op=>op.path[0]==='assets').map(op=>op.value.id));
        if(error.code!=='quota'||!addedAssets.size)throw error;
        library.assets=library.assets.filter(asset=>!addedAssets.has(asset.id));library.characters.forEach(card=>{if(addedAssets.has(card.avatarAssetId))card.avatarAssetId=null;});
        receipt.operations=receipt.operations.filter(op=>op.path[0]!=='assets');receipt.operations.forEach(op=>{if(op.kind==='add'&&op.path[0]==='characters')op.value=root.NIJANAI.copy(library.characters.find(card=>card.id===op.value.id));});await UI().commitLibrary(library);avatarSkipped=true;
      }
      const id=session.kind==='character'?plan.cardId:plan.bookId;if(plan.bookId)UI().state.bookImportId=plan.bookId;
      session.receipt=receipt;reveal(id,session.kind,!!session.attribution);
      UI().toast(tr(session.kind==='character'?'角色卡已导入，可以撤销。':'世界书已导入，可以撤销。'),{kind:'success',action:{label:tr('撤销'),onClick:()=>undo(receipt)}});
      if(avatarSkipped)UI().toast(tr('空间不足，已保留卡片文字并省略新增头像。'));
    }catch(error){session.failed=true;session.status=error.code==='quota'||error.code==='no-storage'?tr(error.message):message(error);render();}
  }
  async function undo(receipt) {
    try {
      const library=root.NIJANAI.copy(UI().state.lib);L().undo(library,receipt);await UI().commitLibrary(library);if(!library.characters.some(card=>card.id===UI().state.sel.character))UI().state.sel.character=null;UI().state.sel.book=null;UI().state.sel.entry=null;UI().renderStage();UI().toast(tr('已撤销这次链接导入。'),{kind:'success'});
    }catch(error){UI().toast(error.code==='import-in-use'?message(error):tr(error.message),{kind:'error'});}
  }
  function entries(session) {
    const query=session.query.trim().toLowerCase(),all=session.prepared.book.entries;
    const matched=all.filter(entry=>`${entry.comment}\n${entry.content}\n${(entry.keys||[]).join(' ')}`.toLowerCase().includes(query));
    return `${matched.slice(0,50).map(entry=>`<details class="link-entry"><summary><span data-no-translate>${esc(entry.comment||tr('未命名'))}</span><small>${esc(tr(entry.constant?'常驻':'关键词触发'))}${entry.enabled===false?` · ${esc(tr('停用'))}`:''}</small></summary><p class="help"><span>${esc(tr('主关键词'))}：</span><span data-no-translate>${esc((entry.keys||[]).join('、')||tr('留白'))}</span></p><pre data-no-translate>${esc(entry.content)}</pre></details>`).join('')||`<p class="help">${esc(tr('没有找到匹配的条目。'))}</p>`}${matched.length>50?`<p class="help">${esc(tr('预览显示前 50 条匹配项，导入会保留全部条目。'))}</p>`:''}`;
  }
  function preview(session,prepared,existing,newer) {
    const card=session.kind==='character';
    const linkedBook=card&&prepared.embedded&&L().findExisting(UI().state.lib,prepared.embedded);
    const extraBook=card&&session.includeBook&&prepared.embedded&&(!linkedBook||existing?.source?.embeddedBookId!==linkedBook.id);
    const button=existing?(extraBook?'导入内嵌世界书并打开角色卡':card?'打开已有角色卡':'打开已有世界书'):card?'导入这张角色卡':'导入这本世界书';
    const fields=card?Object.entries(root.NIJANAI.CARD_FIELDS).filter(([key])=>key!=='name'&&(Array.isArray(prepared.character[key])?prepared.character[key].length:String(prepared.character[key]||'').trim())):[];
    return `<section class="link-preview"><header><h4>${esc(tr('导入预览'))}</h4><span>${esc(tr(card?'角色卡':prepared.kind==='embedded'?'从角色卡提取世界书':'世界书 JSON'))}</span></header>${card?`<div class="link-card-face">${prepared.avatar?`<img src="${esc(prepared.avatar.dataUrl)}" alt="${esc(tr('头像预览'))}">`:`<span aria-hidden="true" data-no-translate>${esc(prepared.character.name.slice(0,1))}</span>`}<div><strong data-no-translate>${esc(prepared.character.name)}</strong><p>${esc(tr('link.cardSummary',{fields:fields.length,greetings:prepared.character.alternate_greetings.length}))}</p></div></div>`:''}<label class="field"><span class="field-label">${esc(tr(card?'角色卡名称':'世界书名称'))}</span><input type="text" data-link-name data-no-translate value="${esc(session.name)}" maxlength="200"></label>${card?'':`<p class="link-counts">${esc(tr('link.summary',{count:prepared.total,constant:prepared.constant,unnamed:prepared.unnamed}))}</p>`}<p class="link-source"><span>${esc(tr('来源'))}：</span><a href="${esc(prepared.url)}" target="_blank" rel="noopener noreferrer" data-no-translate>${esc(prepared.url)}</a></p>${existing?`<p class="link-notice">${esc(tr(card?'这张卡已在本地，继续会保留已有改稿。':'这份内容已在本地，继续会打开已有世界书，并保留本地修改。'))}</p>`:newer?`<p class="link-notice">${esc(tr(card?'同一来源有新卡，将另存一张，原卡和修改保留。':'同一来源有新版，将另存一本，原有版本和修改保留。'))}</p>`:''}${card?`${prepared.embedded?`<label class="check link-include-book"><input type="checkbox" data-link-book ${session.includeBook?'checked':''}><span>${esc(tr('link.embedded',{count:prepared.embedded.total}))}</span><strong data-no-translate>${esc(prepared.embedded.book.name)}</strong></label>`:prepared.embeddedError?`<p class="link-notice">${esc(tr('内嵌世界书未读成功，角色卡正文仍可导入。'))}</p>`:`<p class="help">${esc(tr('这张角色卡没有内嵌世界书。'))}</p>`}${prepared.avatarOmitted?`<p class="help">${esc(tr('头像未能收进来，角色卡文字已保留。'))}</p>`:''}<div class="link-card-fields">${fields.map(([key,label])=>`<details class="link-entry" ${key==='description'?'open':''}><summary>${esc(tr(label))}</summary><pre data-no-translate>${esc(Array.isArray(prepared.character[key])?prepared.character[key].join('\n\n'):prepared.character[key])}</pre></details>`).join('')}</div>`:`${prepared.kind==='embedded'?`<p class="help">${esc(tr('本次只提取世界书，角色卡和头像不加入资料库。'))}</p>`:''}<label class="field"><span class="field-label">${esc(tr('查找预览条目'))}</span><input type="search" data-link-query data-no-translate value="${esc(session.query)}" placeholder="${esc(tr('搜条目名、关键词或正文'))}"></label><div class="link-entries">${entries(session)}</div>`}${session.attribution?`<label class="check link-include-book"><input type="checkbox" data-link-source-confirm ${session.sourceConfirmed?'checked':''}><span>${esc(tr('确认这份文件来自上述作者原帖'))}</span></label>`:''}<footer class="organize-footer"><span class="help">${esc(tr('本地导入不调用 AI 模型。'))}</span><button class="btn btn-primary" type="button" data-link-apply ${session.attribution&&!session.sourceConfirmed?'disabled':''}>${esc(tr(button))}</button></footer></section>`;
  }
  function render() {
    const session=state;if(!session)return;const prepared=session.prepared,card=session.kind==='character',existing=prepared&&L().findExisting(UI().state.lib,prepared);
    const collection=card?UI().state.lib.characters:UI().state.lib.worldBooks,newer=prepared&&(collection||[]).some(item=>item.source?.url===prepared.url&&!existing);
    host().innerHTML=`<section class="modal paper link-import-modal" role="dialog" aria-modal="true" aria-labelledby="link-import-title"><header class="organize-heading"><div><p class="ws-address">${esc(tr(card?'角色卡':'世界书'))}</p><h3 id="link-import-title">${esc(tr('链接导入'))}</h3></div><button class="ws-icon-button" type="button" data-link-close aria-label="${esc(tr('关闭'))}">${root.TAWorkspace.icon('close')}</button></header><p class="link-intro">${esc(tr(card?'粘贴角色卡 JSON、PNG 或 GitHub 文件链接。先预览，再决定是否带上内嵌世界书。':'粘贴世界书 JSON、GitHub 文件链接，或含世界书的角色卡链接。读完先预览，导入另存一本。'))}</p>${session.attribution?`<section class="resource-import-source"><strong>${esc(tr('来源信息'))}</strong><p><span data-no-translate>${esc(session.attribution.author.name)}</span> · <a href="${esc(session.attribution.postUrl)}" target="_blank" rel="noopener noreferrer">${esc(tr('打开原帖'))}</a></p>${session.expectedFilenames.length?`<p class="help">${esc(tr('请选择对应的附件文件。'))}</p><ul>${session.expectedFilenames.map(name=>`<li data-no-translate>${esc(name)}</li>`).join('')}</ul>`:''}</section>`:''}<details class="link-inputs" ${prepared?'':'open'}><summary>${esc(tr('更换链接'))}</summary><form data-link-form><label class="field"><span class="field-label">${esc(tr(card?'角色卡链接':'世界书链接'))}</span><input type="text" inputmode="url" autocomplete="off" spellcheck="false" data-link-url data-no-translate value="${esc(session.url)}" placeholder="${card?'https://…/character.png':'https://…/worldbook.json'}" ${session.busy?'disabled':''}></label><div class="row"><button class="btn btn-primary" type="submit" ${session.busy?'disabled':''}>${esc(tr(session.busy?'正在读取…':'读取链接'))}</button>${session.busy?`<button class="btn" type="button" data-link-stop>${esc(tr('停止读取'))}</button>`:''}<span class="help">${esc(tr('公开 HTTPS 链接 · 最大 12 MB'))}</span></div></form></details><p class="link-status${session.failed?' link-error':''}" role="status">${esc(session.status||tr('Discord 请复制附件下载链接；GitHub 可以直接复制文件页面链接。'))}</p>${prepared?preview(session,prepared,existing,newer):''}<details class="link-help"><summary>${esc(tr('哪些链接可以用？'))}</summary><p>${esc(tr(card?'支持角色卡 JSON、带卡片数据的 PNG，以及 GitHub 文件页面。':'支持世界书 JSON、GitHub 文件页面，以及带内嵌世界书的角色卡 JSON 或 PNG。'))}</p><p>${esc(tr('Discord 帖子和频道链接需要额外访问权限，这里请使用附件下载链接。过期附件需要从原帖重新复制。'))}</p><p>${esc(tr(root.nijanDesktop?'桌面版可直接下载公开文件。':'网页版受来源网站的跨域设置限制；读取失败时可用桌面版，或下载后导入文件。'))}</p></details></section>`;
    host().querySelector('[data-link-close]').onclick=close;
    host().querySelector('[data-link-form]').onsubmit=event=>{event.preventDefault();load(session);};
    host().querySelector('[data-link-url]').oninput=event=>{session.url=event.target.value;session.prepared=null;session.failed=false;host().querySelector('.link-preview')?.remove();};
    host().querySelector('[data-link-stop]')?.addEventListener('click',()=>session.controller?.abort());
    host().querySelector('[data-link-name]')?.addEventListener('input',event=>{session.name=event.target.value;});
    host().querySelector('[data-link-book]')?.addEventListener('change',event=>{session.includeBook=event.target.checked;render();});
    host().querySelector('[data-link-query]')?.addEventListener('input',event=>{session.query=event.target.value;host().querySelector('.link-entries').innerHTML=entries(session);});
    host().querySelector('[data-link-source-confirm]')?.addEventListener('change',event=>{session.sourceConfirmed=event.target.checked;host().querySelector('[data-link-apply]').disabled=!session.sourceConfirmed;});
    host().querySelector('[data-link-apply]')?.addEventListener('click',()=>apply(session));
    root.TAI18n?.localize(host());
  }
  function open(options={}) {
    if(state)close();state={kind:options.kind==='character'?'character':'world',includeBook:true,url:String(options.url||''),attribution:root.TAResourceSource?.clean(options.attribution),expectedFilenames:Array.isArray(options.expectedFilenames)?options.expectedFilenames:[],name:'',query:'',status:'',busy:false,focus:document.activeElement};host().classList.add('show','link-import-open');host().onclick=event=>{if(event.target===host())close();};document.addEventListener('keydown',keyboard,true);render();host().querySelector('[data-link-url]').focus();
  }
  root.TALinkImportPanel={open,close,message};
})(globalThis);
