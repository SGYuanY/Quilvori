/* Preview and import bounded raster wallpapers into the private local asset library. */
(function (root) {
  'use strict';
  const MAX_BYTES = 12 * 1024 * 1024, MAX_SAVED_BYTES = 500 * 1024, MAX_LIBRARY_SIZE = 4.2 * 1024 * 1024;
  const fail = code => Object.assign(new Error(code), { code });
  const checkAbort = signal => { if (signal?.aborted) throw fail('cancelled'); };
  const copy = value => JSON.parse(JSON.stringify(value));
  function dimensions(width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > 40000000) throw fail('wallpaper-dimensions');
    return { width, height };
  }
  function inspect(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (!bytes.length) throw fail('empty-file');
    if (bytes.length > MAX_BYTES) throw fail('too-large');
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const ascii = (at, length) => String.fromCharCode(...bytes.subarray(at, at + length));
    if (bytes.length >= 24 && [137,80,78,71,13,10,26,10].every((n, i) => bytes[i] === n) && ascii(12, 4) === 'IHDR') {
      return { mime: 'image/png', ...dimensions(view.getUint32(16), view.getUint32(20)) };
    }
    if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
      let offset = 2;
      while (offset + 3 < bytes.length) {
        if (bytes[offset++] !== 255) break;
        while (bytes[offset] === 255) offset++;
        const marker = bytes[offset++];
        if (marker === 217 || marker === 218) break;
        if (marker === 1 || marker >= 208 && marker <= 215) continue;
        if (offset + 2 > bytes.length) break;
        const length = view.getUint16(offset);
        if (length < 2 || offset + length > bytes.length) break;
        if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && length >= 8) {
          return { mime: 'image/jpeg', ...dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3)) };
        }
        offset += length;
      }
    }
    if (bytes.length >= 20 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
      const end = view.getUint32(4, true) + 8;
      if (end > bytes.length) throw fail('wallpaper-format');
      for (let offset = 12; offset + 8 <= end;) {
        const tag = ascii(offset, 4), size = view.getUint32(offset + 4, true), data = offset + 8;
        if (data + size > end) break;
        if (tag === 'VP8X' && size >= 10) {
          const uint24 = at => bytes[at] + (bytes[at + 1] << 8) + (bytes[at + 2] << 16);
          return { mime: 'image/webp', ...dimensions(uint24(data + 4) + 1, uint24(data + 7) + 1) };
        }
        if (tag === 'VP8L' && size >= 5 && bytes[data] === 47) {
          return { mime: 'image/webp', ...dimensions(1 + bytes[data + 1] + ((bytes[data + 2] & 63) << 8), 1 + (bytes[data + 2] >> 6) + (bytes[data + 3] << 2) + ((bytes[data + 4] & 15) << 10)) };
        }
        if (tag === 'VP8 ' && size >= 10 && ascii(data + 3, 3) === '\x9d\x01\x2a') {
          return { mime: 'image/webp', ...dimensions(view.getUint16(data + 6, true) & 16383, view.getUint16(data + 8, true) & 16383) };
        }
        offset = data + size + (size % 2);
      }
    }
    throw fail('wallpaper-format');
  }
  function encodedImage(dataUrl) {
    const match = typeof dataUrl === 'string' && dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
    if (!match || match[2].length % 4) throw fail('wallpaper-decode');
    return { dataUrl, mime: match[1], bytes: match[2].length / 4 * 3 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0) };
  }
  const decode = (bytes, mime) => root.createImageBitmap(new Blob([bytes], { type: mime }));
  function encode(bitmap, width, height, quality) {
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d'); if (!ctx) throw fail('wallpaper-decode');
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas.toDataURL('image/webp', quality);
  }
  async function prepare(input, options = {}) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input), header = inspect(bytes);
    checkAbort(options.signal);
    let bitmap;
    try {
      bitmap = await (options.decode || decode)(bytes, header.mime);
      checkAbort(options.signal); dimensions(bitmap.width, bitmap.height);
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      let width = Math.max(1, Math.round(bitmap.width * scale)), height = Math.max(1, Math.round(bitmap.height * scale));
      for (let pass = 0; pass < 7; pass++) {
        checkAbort(options.signal);
        const encoded = encodedImage(await (options.encode || encode)(bitmap, width, height, pass === 0 ? .82 : .7));
        checkAbort(options.signal);
        if (encoded.bytes <= MAX_SAVED_BYTES) {
          const hash = await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(encoded.dataUrl));
          checkAbort(options.signal);
          return { ...encoded, width, height, originalWidth: bitmap.width, originalHeight: bitmap.height,
            fingerprint: [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('') };
        }
        width = Math.max(1, Math.floor(width * .78)); height = Math.max(1, Math.floor(height * .78));
      }
      throw fail('wallpaper-save-size');
    } catch (error) { throw error.code ? error : fail('wallpaper-decode'); }
    finally { bitmap?.close?.(); }
  }
  function existing(library, prepared) {
    return (library.assets || []).find(asset => asset.dataUrl === prepared.dataUrl || asset.source?.fingerprint === prepared.fingerprint);
  }
  function buildImport(library, prepared, options = {}) {
    const attribution = root.TAResourceSource.clean(options.attribution), name = String(options.title || '').trim().slice(0, 200);
    if (!attribution) throw fail('wallpaper-source');
    if (!name) throw fail('wallpaper-name');
    const encoded = encodedImage(prepared.dataUrl);
    if (!encoded.bytes || encoded.bytes > MAX_SAVED_BYTES) throw fail('wallpaper-save-size');
    dimensions(prepared.width, prepared.height);
    if (!/^[a-f0-9]{64}$/.test(prepared.fingerprint || '')) throw fail('wallpaper-decode');
    const found = existing(library, prepared); if (found) return { existingId: found.id };
    const stamp = new Date().toISOString(), source = { ...attribution, kind: options.url ? 'link' : 'file', fingerprint: prepared.fingerprint, importedAt: stamp };
    if (options.url) source.url = root.TALinkImport.safeUrl(options.url);
    const asset = { id: root.TAStore.uid('asset'), name, kind: 'background', ...encoded, width: prepared.width, height: prepared.height, createdAt: stamp, source };
    const next = copy(library); next.assets ||= []; next.assets.unshift(asset);
    if (JSON.stringify(next).length > MAX_LIBRARY_SIZE) throw fail('wallpaper-capacity');
    return { library: next, assetId: asset.id, receipt: { assetId: asset.id, snapshot: JSON.stringify(asset) } };
  }
  function undo(library, receipt) {
    const asset = (library.assets || []).find(item => item.id === receipt.assetId);
    if (!asset) return copy(library);
    if (library.settings?.chatBackgroundAssetId === asset.id || (library.characters || []).some(card => card.avatarAssetId === asset.id || (card.expressionAssetIds || []).includes(asset.id))) throw fail('import-in-use');
    if (JSON.stringify(asset) !== receipt.snapshot) throw fail('wallpaper-edited');
    const next = copy(library); next.assets = next.assets.filter(item => item.id !== asset.id); return next;
  }

  const UI = () => root.TAUI, tr = value => UI().t(value), esc = value => UI().esc(value);
  const host = () => document.getElementById('modal-root');
  const messages = {
    'wallpaper-format': '只支持 PNG、JPEG 或 WebP 图片，不支持 SVG、网页或主题文件。',
    'wallpaper-dimensions': '图片尺寸过大或无效，请选择不超过 8192 像素且总像素不超过 4000 万的图片。',
    'wallpaper-decode': '图片无法解码，请重新选择完整的图片文件。',
    'wallpaper-save-size': '图片压缩后仍然过大，请换一张较小的图片。',
    'wallpaper-source': '缺少有效的作者或原帖信息。',
    'wallpaper-name': '请给这张壁纸起个名字。',
    'wallpaper-confirm-source': '请先确认图片来自上述作者原帖，再保存到素材库。',
    'wallpaper-capacity': '本地素材库空间不足，请先导出备份或清理不需要的素材。',
    'wallpaper-edited': '这张壁纸导入后已被修改，不能直接撤销。',
    'import-in-use': '这张图片已被角色或聊天背景使用，请先取消引用再撤销。',
  };
  const message = error => messages[error?.code] ? tr(messages[error.code]) : root.TALinkImportPanel?.message(error) || tr(error.message || '图片没有读进来。');
  let session = null;
  function close() {
    if (!session) return;
    const prior = session; session = null; prior.controller?.abort();
    host().innerHTML = ''; host().classList.remove('show', 'link-import-open'); host().onclick = null;
    document.removeEventListener('keydown', keyboard, true); if (prior.focus?.isConnected) prior.focus.focus();
  }
  function keyboard(event) {
    if (!session) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    if (event.key === 'Tab') {
      const controls = [...host().querySelectorAll('button:not(:disabled),input:not(:disabled),a')].filter(node => node.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }
  async function load(current, read) {
    if (session !== current) return;
    current.controller?.abort(); const controller = new AbortController(); current.controller = controller;
    current.busy = true; current.prepared = null; current.sourceConfirmed = false; current.failed = false; current.status = tr('正在读取…'); render();
    try {
      const file = await read(controller.signal);
      if (session !== current || current.controller !== controller) return;
      checkAbort(controller.signal);
      const prepared = await prepare(file.bytes, { signal: controller.signal });
      if (session !== current || current.controller !== controller) return;
      current.prepared = prepared; current.downloadUrl = file.url || ''; current.filename = file.filename || '';
      if (!file.url) current.url = '';
      current.title ||= String(file.filename || tr('壁纸')).replace(/\.(png|jpe?g|webp)$/i, '');
      current.status = tr('图片已处理，请预览后导入。');
    } catch (error) { if (session === current && current.controller === controller) { current.failed = true; current.status = message(error); } }
    finally { if (session === current && current.controller === controller) { current.busy = false; render(); } }
  }
  function persist(library) {
    root.TAStore.save(library);
    clearTimeout(UI().state.timer); UI().state.lib = library; UI().state.save = 'saved';
  }
  function reveal(id, preserveUndo = false) {
    close(); UI().state.assetKind = 'all'; UI().state.sel.asset = id;
    // A full-page navigation would destroy the undo receipt held by the toast.
    if (preserveUndo && document.body?.dataset?.page && document.body.dataset.page !== 'assets') UI().renderStage();
    else UI().go('assets');
  }
  function apply(current) {
    try {
      if (session !== current || current.busy || !current.prepared) return;
      if (!current.sourceConfirmed) throw fail('wallpaper-confirm-source');
      const result = buildImport(UI().state.lib, current.prepared, { title: current.title, attribution: current.attribution, url: current.downloadUrl });
      if (result.existingId) { reveal(result.existingId); UI().toast(tr('这张图片已在素材库，已为你打开。')); return; }
      persist(result.library); reveal(result.assetId, true);
      UI().toast(tr('壁纸已导入，聊天背景保持不变。'), { kind: 'success', action: { label: tr('撤销'), onClick: () => {
        try { persist(undo(UI().state.lib, result.receipt)); if (UI().state.sel.asset === result.assetId) UI().state.sel.asset = null; UI().renderStage(); UI().toast(tr('已撤销壁纸导入。')); }
        catch (error) { UI().toast(message(error), { kind: 'error' }); }
      } } });
    } catch (error) { current.failed = true; current.status = error.code === 'quota' || error.code === 'no-storage' ? tr(error.message) : message(error); render(); }
  }
  function render() {
    const current = session; if (!current) return;
    const prepared = current.prepared, attribution = current.attribution;
    host().innerHTML = `<section class="modal paper link-import-modal" role="dialog" aria-modal="true" aria-labelledby="wallpaper-title"><header class="organize-heading"><h3 id="wallpaper-title">${tr('导入壁纸')}</h3><button type="button" class="btn" data-wallpaper-close>${tr('关闭')}</button></header><p class="help">${tr('导入时会缩小并重新编码图片，移除隐藏元数据，保存大小不超过 500 KB。')}</p>${attribution ? `<p data-no-translate>${esc(attribution.author.name)} · <a href="${esc(attribution.postUrl)}" target="_blank" rel="noopener noreferrer">${esc(tr('查看原帖'))}</a></p><p class="help" data-no-translate>${esc(attribution.license.note || tr('授权说明以原帖为准。'))}</p>` : `<p class="link-error">${tr(messages['wallpaper-source'])}</p>`}<label class="field"><span class="field-label">${tr('图片链接')}</span><input type="url" data-wallpaper-url data-no-translate value="${esc(current.url)}" ${current.busy ? 'disabled' : ''} autocomplete="off"></label><div class="row"><button type="button" class="btn" data-wallpaper-download ${current.busy || !attribution ? 'disabled' : ''}>${tr('读取链接')}</button><button type="button" class="btn" data-wallpaper-local ${current.busy || !attribution ? 'disabled' : ''}>${tr('选择本地图片')}</button>${current.busy ? `<button type="button" class="btn" data-wallpaper-stop>${tr('停止读取')}</button>` : ''}</div><p class="link-status${current.failed ? ' link-error' : ''}" role="status">${esc(current.status)}</p>${prepared ? `<section data-wallpaper-preview><img src="${esc(prepared.dataUrl)}" alt="${esc(tr('壁纸预览'))}" style="display:block;max-width:100%;max-height:320px;object-fit:contain;margin:0 auto;border-radius:8px"><p class="help">${tr('缩略导入')} · ${prepared.originalWidth} × ${prepared.originalHeight} → ${prepared.width} × ${prepared.height} · ${Math.ceil(prepared.bytes / 1024)} KB</p><label class="field"><span class="field-label">${tr('名称')}</span><input type="text" data-wallpaper-name data-no-translate maxlength="200" value="${esc(current.title)}"></label><label class="check"><input type="checkbox" data-wallpaper-source-confirm ${current.sourceConfirmed ? 'checked' : ''}><span>${tr('确认这张图片来自上述作者原帖')}</span></label><button type="button" class="btn btn-primary" data-wallpaper-apply ${current.sourceConfirmed ? '' : 'disabled'}>${tr(existing(UI().state.lib, prepared) ? '打开已有素材' : '导入壁纸')}</button></section>` : ''}</section>`;
    host().querySelector('[data-wallpaper-close]').onclick = close;
    host().querySelector('[data-wallpaper-url]').oninput = event => { current.url = event.target.value; current.prepared = null; current.sourceConfirmed = false; host().querySelector('[data-wallpaper-preview]')?.remove(); };
    host().querySelector('[data-wallpaper-download]').onclick = () => load(current, signal => root.TALinkImport.download(current.url, { signal }));
    host().querySelector('[data-wallpaper-local]').onclick = async () => {
      const file = await UI().pickFile('.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp');
      if (!file || session !== current) return;
      return load(current, async () => { if (file.size > MAX_BYTES) throw fail('too-large'); return { bytes: new Uint8Array(await file.arrayBuffer()), filename: file.name }; });
    };
    const stop = host().querySelector('[data-wallpaper-stop]'); if (stop) stop.onclick = () => current.controller?.abort();
    const name = host().querySelector('[data-wallpaper-name]'); if (name) name.oninput = event => { current.title = event.target.value; };
    const confirm = host().querySelector('[data-wallpaper-source-confirm]'); if (confirm) confirm.onchange = event => { current.sourceConfirmed = event.target.checked; host().querySelector('[data-wallpaper-apply]').disabled = !current.sourceConfirmed; };
    const save = host().querySelector('[data-wallpaper-apply]'); if (save) save.onclick = () => apply(current);
    root.TAI18n?.localize(host());
  }
  function open(options = {}) {
    close(); session = { title: String(options.title || ''), url: String(options.url || ''), attribution: root.TAResourceSource.clean(options.attribution), status: '', focus: document.activeElement, busy: false };
    host().classList.add('show', 'link-import-open'); host().onclick = event => { if (event.target === host()) close(); };
    document.addEventListener('keydown', keyboard, true); render(); host().querySelector('[data-wallpaper-close]').focus();
  }
  const api = { open, close, inspect, prepare, buildImport, undo, MAX_BYTES, MAX_SAVED_BYTES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TAWallpaperImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
