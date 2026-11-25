/* A SillyTavern user-directory package. Its individual files use ST's native formats. */
(function (root) {
  'use strict';
  const encoder = new TextEncoder();
  const imageExtensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif' };
  const maxFiles = 4096, maxBytes = 256 * 1024 * 1024;
  const error = (code, file = '') => Object.assign(new Error(code), { code, file });
  function segment(name) {
    if (typeof name !== 'string' || !name || name.startsWith('.') || /[<>:"/\\|?*\u0000-\u001f\u007f]|[. ]$/.test(name)
      || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name) || encoder.encode(name).length > 255) {
      throw error('invalid-name', String(name || ''));
    }
    return name;
  }
  function portableStem(value, fallback) {
    let name = String(value || '').normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g,'').trim().replace(/^\.+|[. ]+$/g,'');
    if (!name) name = fallback;
    if (/^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(name)) name = '_' + name;
    let result = '', length = 0;
    for (const ch of name) {
      length += encoder.encode(ch).length;
      if (length > 230) break;
      result += ch;
    }
    return result.replace(/[. ]+$/,'') || fallback;
  }
  function validatePaths(paths) {
    if (!Array.isArray(paths) || !paths.length || paths.length > maxFiles) throw error('size');
    const seen = new Set(), spriteFolders = [];
    let cardName = '', worlds = 0;
    for (const relative of paths) {
      if (typeof relative !== 'string' || relative.length > 1024) throw error('invalid-layout');
      const parts = relative.split('/').map(segment);
      const canonical = relative.normalize('NFC').toLowerCase();
      if (seen.has(canonical)) throw error('duplicate', relative);
      seen.add(canonical);
      if (parts.length === 2 && parts[0] === 'characters' && parts[1].endsWith('.png')) {
        if (cardName) throw error('invalid-layout',relative);
        cardName = segment(parts[1].slice(0,-4));
      } else if (parts.length === 2 && parts[0] === 'worlds' && parts[1].endsWith('.json')) {
        if (++worlds > 1) throw error('invalid-layout',relative);
      } else if (parts.length === 2 && parts[0] === 'QuickReplies' && parts[1].endsWith('.json')) {
        continue;
      } else if (parts.length === 3 && parts[0] === 'characters' && /\.(png|jpe?g|gif|webp|avif)$/i.test(parts[2])) {
        spriteFolders.push(parts[1]);
      } else throw error('invalid-layout',relative);
    }
    if (!cardName || spriteFolders.some(folder=>folder !== cardName)) throw error('invalid-layout');
  }
  function validateFiles(files) {
    if (!Array.isArray(files)) throw error('invalid-layout');
    if (files.length > maxFiles) throw error('size');
    validatePaths(files.map(file=>file?.path));
    let total = 0;
    for (const file of files) {
      const bytes = file.bytes;
      if (!ArrayBuffer.isView(bytes) || Object.prototype.toString.call(bytes) !== '[object Uint8Array]' || !bytes.byteLength) {
        throw error('invalid-file',file.path);
      }
      total += bytes.byteLength;
      if (total > maxBytes) throw error('size');
    }
  }
  function checkContent(file) {
    const {path,bytes} = file;
    if (path.endsWith('.json')) {
      try {
        const doc = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
        if (path.startsWith('worlds/') && doc?.entries && typeof doc.entries === 'object' && !Array.isArray(doc.entries)) return;
        if (path.startsWith('QuickReplies/') && doc?.version===2 && typeof doc.name==='string' && Array.isArray(doc.qrList)) return;
      } catch (_) { /* Report the affected file by its previewed name. */ }
      throw error('invalid-file',path);
    }
    const ext = path.slice(path.lastIndexOf('.')+1).toLowerCase();
    const ascii = (a,b) => String.fromCharCode(...bytes.subarray(a,b));
    const magic = (...expected) => expected.every((byte,i)=>bytes[i]===byte);
    const valid = ext === 'png' ? magic(137,80,78,71,13,10,26,10)
      : ext === 'jpg' || ext === 'jpeg' ? magic(255,216,255)
      : ext === 'gif' ? ['GIF87a','GIF89a'].includes(ascii(0,6))
      : ext === 'webp' ? ascii(0,4)==='RIFF' && ascii(8,12)==='WEBP'
      : ext === 'avif' && ascii(4,8)==='ftyp' && /avif|avis/.test(ascii(8,64));
    if (!valid) throw error('invalid-file',path);
  }
  function imageType(dataUrl) {
    const match = typeof dataUrl === 'string' && /^data:(image\/[a-z0-9.+-]+)(?:;[^,]*)?,/i.exec(dataUrl);
    if (!match) throw error('invalid-image');
    return match[1].toLowerCase();
  }
  function imageRecord(stem, image) {
    const mime = imageType(image.dataUrl);
    const ext = imageExtensions[mime] || 'png'; // Rasterize SVG and other browser-readable sources.
    const label = portableStem(String(image.name || '').replace(/\.(png|jpe?g|gif|webp|avif|svg|bmp|apng)$/i,''),'expression');
    return {path:'characters/' + stem + '/' + label + '.' + ext, image, mime};
  }
  function plan(library, character, book, selection) {
    const stem = segment(selection.name);
    segment(stem + '.png');
    const exportCard = {...character, name:stem};
    const exportBook = book && selection.worldFile ? {...book, name:portableStem(book.name,'world')} : book;
    const records = [{path:'characters/' + stem + '.png', card:exportCard, book:exportBook}];
    if (exportBook && selection.worldFile) {
      records.push({path:'worlds/' + exportBook.name + '.json', world:exportBook});
    }
    for (const pack of library.stickerPacks || []) {
      if (selection.packs.includes(pack.id)) for (const sticker of pack.stickers || []) records.push(imageRecord(stem,sticker));
    }
    for (const id of selection.expressions) {
      const image = (library.assets || []).find(asset=>asset.id===id);
      if (!image || !(character.expressionAssetIds || []).includes(id)) throw error('invalid-image');
      records.push(imageRecord(stem,image));
    }
    for (const set of library.quickReplySets || []) {
      if (selection.quickReplies.includes(set.id)) {
        const name = portableStem(set.name,'quick-reply');
        records.push({path:'QuickReplies/' + name + '.json', quickReply:set});
      }
    }
    validatePaths(records.map(row=>row.path));
    return records;
  }
  async function rasterize(dataUrl) {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image,0,0);
    const blob = await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    if (!blob) throw error('invalid-image');
    return new Uint8Array(await blob.arrayBuffer());
  }
  async function imageBytes(row) {
    const dataUrl = row.image.dataUrl;
    try {
      if (!imageExtensions[row.mime] || !/;base64,/i.test(dataUrl.slice(0,dataUrl.indexOf(',') + 1))) return await rasterize(dataUrl);
      const binary = atob(dataUrl.slice(dataUrl.indexOf(',')+1));
      return Uint8Array.from(binary, char=>char.charCodeAt(0));
    } catch (_) { throw error('invalid-image',row.path); }
  }
  async function materialize(records, makeCardPng) {
    const files = [];
    let total = 0;
    for (const row of records) {
      let bytes;
      if (row.card) bytes = await makeCardPng(row.card,row.book);
      else if (row.image) bytes = await imageBytes(row);
      else {
        const value = row.world ? root.TAFormats.bookToWorldInfo(row.world) : root.TAFormats.qrToExport(row.quickReply);
        bytes = encoder.encode(JSON.stringify(value,null,2));
      }
      total += bytes.byteLength;
      if (total > maxBytes) throw error('size');
      const file = {path:row.path,bytes};
      checkContent(file);
      files.push(file);
    }
    validateFiles(files);
    return files;
  }

  // PKZIP STORE records. UTF-8 names, CRC32, offsets and sizes are in both headers.
  function zip(files, date = new Date()) {
    validateFiles(files);
    const local = [], central = [];
    const time = (date.getHours()<<11) | (date.getMinutes()<<5) | (date.getSeconds()>>1);
    const day = ((Math.max(1980,Math.min(2107,date.getFullYear()))-1980)<<9) | ((date.getMonth()+1)<<5) | date.getDate();
    let offset = 0, centralSize = 0;
    for (const {path,bytes} of files) {
      const name = encoder.encode(path), crc = root.TAPng.crc32(bytes);
      const header = new Uint8Array(30 + name.length), directory = new Uint8Array(46 + name.length);
      const h = new DataView(header.buffer), d = new DataView(directory.buffer);
      h.setUint32(0,0x04034b50,true); d.setUint32(0,0x02014b50,true); d.setUint16(4,20,true);
      for (const [view,base] of [[h,4],[d,6]]) {
        view.setUint16(base,20,true); view.setUint16(base+2,0x800,true);
        view.setUint16(base+6,time,true); view.setUint16(base+8,day,true);
        view.setUint32(base+10,crc,true);
        view.setUint32(base+14,bytes.length,true); view.setUint32(base+18,bytes.length,true);
        view.setUint16(base+22,name.length,true);
      }
      d.setUint32(42,offset,true); header.set(name,30); directory.set(name,46);
      local.push(header,bytes); central.push(directory);
      offset += header.length + bytes.length; centralSize += directory.length;
    }
    const end = new Uint8Array(22), footer = new DataView(end.buffer);
    footer.setUint32(0,0x06054b50,true); footer.setUint16(8,files.length,true); footer.setUint16(10,files.length,true);
    footer.setUint32(12,centralSize,true); footer.setUint32(16,offset,true);
    return new Blob([...local,...central,end],{type:'application/zip'});
  }

  const messages = {
    'invalid-name':'文件名不能用于酒馆目录', 'invalid-layout':'资源包的目录结构无效',
    'duplicate':'两项资源使用同一个文件名', 'invalid-file':'文件内容无效', 'size':'资源包最多支持 4096 个文件、256 MiB',
    'invalid-image':'无法读取表情图片', 'invalid-profile':'请选择包含 characters 和 worlds 的酒馆用户目录',
    'unsafe-directory':'目标目录包含链接或已经变更', 'conflict':'目标文件已存在',
    'write-failed':'写入失败，请检查磁盘空间和权限', 'unsupported-filesystem':'该磁盘不支持安全安装，请下载 ZIP',
    'cleanup-failed':'清理未完成，请检查列出的路径',
  };
  function mount(stage, character, bookOf, makeCardPng) {
    const ui = root.TAUI, lib = ui.state.lib, t = ui.t, esc = ui.esc;
    const details = document.createElement('details');
    details.className = 'ws-assist-details'; details.id = 'st-bundle';
    const assets = (character.expressionAssetIds || []).map(id=>lib.assets.find(a=>a.id===id)).filter(Boolean);
    const checkboxes = (attribute, rows, selected) => rows.map(row=>'<label class="check"><input type="checkbox" data-'+attribute+' value="'+esc(row.id)+'" '+(selected.includes(row.id)?'checked':'')+'><span data-no-translate>'+esc(row.name)+'</span></label>').join('');
    details.innerHTML = '<summary>'+esc(t('酒馆资源包'))+'</summary><div class="paper stack">'
      +'<label class="field"><span class="field-label">'+esc(t('包内角色名'))+'</span><input data-bundle-name value="'+esc(portableStem(character.name,'character'))+'"></label>'
      +'<p data-embedded data-no-translate class="help"></p><label class="check"><input data-world-file type="checkbox" checked>'+esc(t('另附独立世界书 JSON'))+'</label>'
      +(lib.stickerPacks?.length ? '<fieldset><legend>'+esc(t('表情包'))+'</legend>'+checkboxes('pack',lib.stickerPacks,[character.stickerPackId])+'</fieldset>' : '')
      +(assets.length ? '<fieldset><legend>'+esc(t('角色关联表情'))+'</legend>'+checkboxes('expression',assets,assets.map(a=>a.id))+'</fieldset>' : '')
      +(lib.quickReplySets?.length ? '<fieldset><legend>'+esc(t('快捷回复'))+'</legend>'+checkboxes('qr',lib.quickReplySets,lib.quickReplySets.filter(set=>set.workSource?.characterId===character.id).map(set=>set.id))+'</fieldset>' : '')
      +(lib.quickReplySets?.length || assets.length || lib.stickerPacks?.length ? '<p class="help">'+esc(t('表情图的文件名对应酒馆表情标签。快捷回复集可在酒馆的快捷回复设置中启用。'))+'</p>' : '')
      +'<h4>'+esc(t('包内文件'))+'</h4><ul data-files data-no-translate></ul><p class="help">'+esc(t('解压到酒馆用户目录，再刷新酒馆。也可以在相应的酒馆工具中分别导入。'))+'</p>'
      +'<div class="row"><button type="button" class="btn btn-primary" data-zip>'+esc(t('下载 ZIP'))+'</button>'
      +(root.nijanDesktop?.installBundle ? '<button type="button" class="btn" data-install>'+esc(t('安装到酒馆用户目录'))+'</button>' : '')
      +'</div><p role="status" aria-live="polite" data-bundle-status data-no-translate></p></div>';
    stage.querySelector('.toolbar').after(details);
    const field = key=>details.querySelector('[data-'+key+']');
    const selected = key=>[...details.querySelectorAll('[data-'+key+']:checked')].map(node=>node.value);
    const status = field('bundle-status');
    let busy = false;
    function message(err) {
      return t(messages[err.code] || err.message || '写入失败，请检查磁盘空间和权限') + (err.file ? ' · '+err.file : '');
    }
    function currentPlan() {
      return plan(lib,character,bookOf(),{name:field('bundle-name').value,worldFile:field('world-file').checked,
        packs:selected('pack'), expressions:selected('expression'), quickReplies:selected('qr')});
    }
    function preview(keepStatus = false) {
      if (busy || !details.isConnected) return;
      const book = bookOf();
      field('world-file').disabled = !book;
      field('embedded').textContent = t('内嵌世界书')+' · '+(book?.name || t('不附带世界书'));
      const list = field('files'); list.replaceChildren();
      if (keepStatus !== true) status.textContent = '';
      let valid = false;
      try {
        for (const row of currentPlan()) {
          const item = document.createElement('li'); item.textContent = row.path; list.append(item);
        }
        valid = true;
      } catch (err) { status.textContent = message(err); }
      for (const button of details.querySelectorAll('button')) button.disabled = !valid;
    }
    async function run(install) {
      if (busy) return;
      busy = true;
      const inputs = [...details.querySelectorAll('input,button')];
      try {
        // Capture the reviewed selection before awaiting image conversion or the picker.
        const records = structuredClone(currentPlan()), filename = records[0].card.name + '.zip';
        for (const node of inputs) node.disabled = true;
        status.textContent = t('正在准备资源包…');
        const files = await materialize(records,makeCardPng);
        if (install) {
          const result = await root.nijanDesktop.installBundle(files);
          if (result.canceled) status.textContent = t('已取消');
          else if (result.ok) {
            status.textContent = t('已安装到')+' '+result.directory;
            if (result.cleanup) status.textContent += ' · ' + t(messages['cleanup-failed'])+' '+result.cleanup;
          }
          else status.textContent = message(result);
        } else {
          ui.downloadBlob(filename,zip(files));
          status.textContent = t('已导出')+' '+filename;
        }
      } catch (err) { status.textContent = message(err); }
      finally {
        busy = false;
        for (const node of inputs) node.disabled = false;
        preview(true);
      }
    }
    details.addEventListener('toggle',()=>{ if (details.open) preview(); });
    details.addEventListener('change',preview); field('bundle-name').oninput = preview;
    stage.querySelector('#attach-book').addEventListener('change',preview);
    field('zip').onclick = ()=>run(false);
    if (field('install')) field('install').onclick = ()=>run(true);
    queueMicrotask(preview);
  }
  const api = {segment,portableStem,validatePaths,validateFiles,checkContent,plan,materialize,zip,mount};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TAStBundle = api;
})(globalThis);
