/* Public-link normalization, bounded downloads and additive card/book imports. */
(function (root) {
  'use strict';
  const MAX_BYTES = 12 * 1024 * 1024, TIMEOUT = 30000;
  const CARD_FIELDS = ['name','description','personality','scenario','first_mes','mes_example','creator_notes','system_prompt','post_history_instructions','alternate_greetings','tags','creator','character_version','talkativeness'];
  const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const resourceSource = value => root.TAResourceSource?.clean(value) || null;
  const linkSource = (prepared, importedAt) => Object.assign({
    kind: 'link', url: prepared.url, fingerprint: prepared.fingerprint, importedAt,
  }, resourceSource(prepared.attribution) || resourceSource(prepared.character?.source) || resourceSource(prepared.book?.source) || {});
  function error(code) { const err = new Error(code); err.code = code; return err; }
  function normalizeUrl(input) {
    let value = String(input || '').trim();
    if (value.startsWith('<') && value.endsWith('>')) value = value.slice(1, -1);
    let url; try { url = new URL(value); } catch (_) { throw error('invalid-url'); }
    if (url.protocol !== 'https:') throw error('https-required');
    if (url.username || url.password || url.port && url.port !== '443') throw error('invalid-url');
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (host === 'localhost' || !host.includes('.') && !host.includes(':') || /\.(localhost|local|internal|lan)$/.test(host) || /^(0|10|127)\./.test(host) || /^169\.254\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.startsWith('[') && !/^\[[23]/i.test(host)) throw error('private-url');
    if (/^(?:(?:www|canary|ptb)\.)?discord(?:app)?\.com$/.test(host) && url.pathname.startsWith('/channels/')) throw error('discord-message');
    if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
      const [a,b,c] = host.split('.').map(Number);
      if (a === 0 || a === 10 || a === 127 || a >= 224 || a === 100 && b >= 64 && b <= 127 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 && (c === 0 || c === 2)) || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113) throw error('private-url');
    }
    if (host === 'github.com' || host === 'www.github.com') {
      const match = url.pathname.match(/^\/([^/]+)\/([^/]+)\/(blob|raw)\/(.+)$/);
      if (!match) throw error('github-file');
      url = new URL(`https://raw.githubusercontent.com/${match[1]}/${match[2]}/${match[4]}`);
    }
    url.hash = '';
    return url.href;
  }
  function safeUrl(value) { const url = new URL(normalizeUrl(value)); url.search = ''; url.hash = ''; return url.href; }
  function filename(value) {
    try { return decodeURIComponent(new URL(value).pathname.split('/').pop() || '').replace(/[\u0000-\u001f]/g, '').slice(0, 200); }
    catch (_) { return ''; }
  }
  async function readResponse(response, signal) {
    const length = Number(response.headers.get('content-length'));
    if (length > MAX_BYTES) { response.body?.cancel().catch(() => {}); throw error('too-large'); }
    if (!response.body?.getReader) { const bytes = new Uint8Array(await response.arrayBuffer()); if (bytes.length > MAX_BYTES) throw error('too-large'); return bytes; }
    const reader = response.body.getReader(), chunks = []; let size = 0;
    try {
      while (true) {
        if (signal?.aborted) throw error('cancelled');
        const { value, done } = await reader.read(); if (done) break;
        size += value.length; if (size > MAX_BYTES) { await reader.cancel(); throw error('too-large'); } chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const output = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
    return output;
  }
  async function downloadBrowser(input, { signal, redirect = 'follow' } = {}) {
    const url = normalizeUrl(input), controller = new AbortController(); let timedOut = false;
    const cancel = () => controller.abort();
    if (signal?.aborted) throw error('cancelled');
    signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, TIMEOUT);
    try {
      const response = await root.fetch(url, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect, headers: { Accept: 'application/json,image/png,application/octet-stream;q=0.9' } });
      if (!response.ok) throw error(`http-${response.status}`);
      const finalUrl = normalizeUrl(response.url || url), bytes = await readResponse(response, controller.signal);
      return { bytes, url: safeUrl(finalUrl), contentType: response.headers.get('content-type') || '', filename: filename(finalUrl) };
    } catch (err) {
      if (controller.signal.aborted) throw error(timedOut ? 'timeout' : 'cancelled');
      throw err.code ? err : error('browser-network');
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
  }
  async function download(input, { signal } = {}) {
    const url = normalizeUrl(input);
    if (!root.nijanDesktop?.downloadLink) return downloadBrowser(url, { signal });
    // These public CDNs support CORS. Chromium respects desktop system proxies.
    // Do not follow redirects here; arbitrary hosts keep the pinned downloader.
    if (['raw.githubusercontent.com','cdn.discordapp.com','media.discordapp.net'].includes(new URL(url).hostname)) {
      try { return await downloadBrowser(url,{signal,redirect:'error'}); }
      catch (err) { if(!['browser-network','timeout'].includes(err.code))throw err; }
    }
    const id = root.TAStore.uid('link'), cancel = () => root.nijanDesktop.cancelLink(id);
    if (signal?.aborted) throw error('cancelled');
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      const result = await root.nijanDesktop.downloadLink({ id, url });
      if (signal?.aborted) throw error('cancelled');
      if (!result.ok) throw error(result.code || 'network');
      return Object.assign({}, result, { bytes: new Uint8Array(result.bytes) });
    } finally { signal?.removeEventListener('abort', cancel); }
  }
  const stable = (value) => Array.isArray(value) ? value.map(stable) : object(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
  const signature = (book) => JSON.stringify(stable({ description: book.description || '', settings:book.stBookFields || {},extensions:book.stBookExtensions || {}, entries: (book.entries || []).map(({ id, stUid, ...entry }) => entry) }));
  const cardSignature = (card) => JSON.stringify(stable({ ...Object.fromEntries(CARD_FIELDS.map((field) => [field,card[field] ?? (['tags','alternate_greetings'].includes(field)?[]:field==='talkativeness'?.5:'')])), ...root.TAFormats.signatureMetadata(card) }));
  async function digest(value) { return [...new Uint8Array(await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map((byte) => byte.toString(16).padStart(2, '0')).join(''); }
  async function prepare(file, options = {}) {
    const explicitSource = resourceSource(options.attribution);
    const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes);
    if (!bytes.length) throw error('empty-file');
    if (bytes.length > MAX_BYTES) throw error('too-large');
    const png = [137,80,78,71,13,10,26,10].every((value, index) => bytes[index] === value);
    let json;
    try {
      if (png) { const raw = root.TAPng.readChara(bytes); if (!raw) throw error('no-card-data'); json = JSON.parse(raw); }
      else {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
        if (/^\s*(?:<!doctype\s+html|<html|<head|<body)/i.test(text)) throw error('html-page');
        json = JSON.parse(text);
      }
    } catch (err) { throw err.code ? err : error(png ? 'invalid-card' : 'invalid-json'); }
    const candidate = options.kind === 'character' ? root.TAFormats.singleCard(json) : Array.isArray(json) && json.length === 1 ? json[0] : json;
    const card = object(candidate?.character?.data) ? candidate.character : candidate;
    const data = object(card?.data) ? card.data : card;
    const isCard = png || /^chara_card_v[23]$/.test(card?.spec || '') || object(data) && ['description','personality','first_mes','scenario'].some((key) => typeof data[key] === 'string') && !data.entries;
    if (options.kind === 'character') {
      if (!isCard || !object(data) || !['name','description','personality','scenario','first_mes','mes_example'].some((field)=>typeof data[field]==='string')) throw error('not-character-card');
      let character;
      if (data.alternate_greetings != null && (!Array.isArray(data.alternate_greetings) || !data.alternate_greetings.every((value) => typeof value === 'string'))) throw error('invalid-card');
      try { character = root.TAFormats.cardToCharacter(card); } catch (_) { throw error('invalid-card'); }
      const attribution = explicitSource || resourceSource(character.source);
      if (attribution) character.source = attribution;
      else delete character.source;
      const talk=Number(data.extensions?.talkativeness??card.talkativeness??.5);if(Number.isFinite(talk))character.talkativeness=talk;
      delete character.book;
      if (CARD_FIELDS.some((field) => ['tags','alternate_greetings'].includes(field) ? !Array.isArray(character[field]) || !character[field].every((value) => typeof value === 'string') : field !== 'talkativeness' && typeof character[field] !== 'string')) throw error('invalid-card');
      character.name = character.name.trim() || filename(file.url).replace(/\.(json|png)$/i,'') || '角色卡';
      let embedded = null, embeddedError = false, avatar = null;
      if (data?.character_book) {
        // A companion book may credit a different author from its enclosing card.
        const bookSource = resourceSource(options.embeddedAttribution) || resourceSource(data.character_book.extensions?.quilvori_source);
        try { embedded = await prepare(file, { attribution: bookSource }); } catch (_) { embeddedError = true; }
      }
      const size=png&&bytes.length>=24?new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength):null;
      const width=size?.getUint32(16),height=size?.getUint32(20),canAvatar=width>0&&height>0&&width<=8192&&height<=8192&&width*height<=40000000;
      if (png && canAvatar && options.makeAvatar) { try { avatar = await options.makeAvatar(bytes); } catch (_) {} }
      if (!avatar && png && canAvatar && bytes.length <= 260000) {
        let binary='';for(let offset=0;offset<bytes.length;offset+=32768)binary+=String.fromCharCode(...bytes.subarray(offset,offset+32768));
        avatar={dataUrl:`data:image/png;base64,${btoa(binary)}`,mime:'image/png',bytes:bytes.length};
      }
      if (avatar && (!/^data:image\/(?:png|jpeg|webp);base64,/.test(avatar.dataUrl || '') || avatar.bytes > 300000 || !Number.isFinite(avatar.bytes))) avatar=null;
      return { target:'character',kind:'character',character,embedded,embeddedError,avatar,avatarOmitted:png&&!avatar,url:safeUrl(file.url),bytes:bytes.length,fingerprint:await digest(cardSignature(character)),...(attribution?{attribution}:{}) };
    }
    let spec = json, kind = 'world';
    if (isCard) { spec = data?.character_book; kind = 'embedded'; if (!spec?.entries) throw error('no-embedded-book'); }
    let parsedBook, entries;
    try { parsedBook = root.TAFormats.worldInfoToBook(spec); entries = parsedBook.entries; }
    catch (failure) { if (failure.code === 'invalid-entries') throw failure; throw error('not-world-book'); }
    const declaredEntries = spec?.entries ?? spec?.data?.entries;
    if (!entries.length && (!declaredEntries || typeof declaredEntries !== 'object')) throw error('empty-book');
    const base = String(spec?.name || spec?.data?.name || file.filename || filename(file.url) || '').replace(/\.(json|png)$/i, '').trim();
    const name = base || (kind === 'embedded' ? `${data.name || ''} · 世界书` : '世界书');
    const attribution = explicitSource || resourceSource(parsedBook.source);
    const book = { ...parsedBook, name, entries, ...(attribution ? { source: attribution } : {}) };
    const fingerprint = await digest(signature(book));
    return { target:'world',book, fingerprint, kind, url: safeUrl(file.url), bytes: bytes.length, total: entries.length, constant: entries.filter((entry) => entry.constant).length, unnamed: entries.filter((entry) => !String(entry.comment || '').trim()).length, ...(attribution ? { attribution } : {}) };
  }
  function findExisting(library, prepared) {
    const character=prepared.target==='character',collection=character?library.characters||[]:library.worldBooks||[];
    return collection.find((item) => item.source?.kind === 'link' && item.source.url === prepared.url && item.source.fingerprint === prepared.fingerprint) || collection.find((item) => character?cardSignature(item)===cardSignature(prepared.character):signature(item)===signature(prepared.book));
  }
  function plan(library, prepared, requestedName, { includeBook = true } = {}) {
    if(prepared.target==='character') {
      const existing=findExisting(library,prepared),operations=[],stamp=new Date().toISOString();
      let cardId=existing?.id,bookId='';
      if(!existing) {
        const name=String(requestedName||'').trim();if(!name)throw error('name-required');
        const character=Object.assign({id:root.TAStore.uid('ch'),createdAt:stamp,updatedAt:stamp,avatarAssetId:null,expressionAssetIds:[]},clone(prepared.character),{name,source:linkSource(prepared,stamp)});
        if(prepared.avatar){const asset=Object.assign({id:root.TAStore.uid('asset'),name:`${name} · 头像`,kind:'avatar',createdAt:stamp},clone(prepared.avatar));character.avatarAssetId=asset.id;operations.push({key:root.TAStore.uid('op'),kind:'add',path:['assets'],value:asset,label:name});}
        cardId=character.id;operations.push({key:root.TAStore.uid('op'),kind:'add',path:['characters'],value:character,label:name});
      }
      if(includeBook&&prepared.embedded) {
        const bookPlan=plan(library,prepared.embedded,prepared.embedded.book.name);bookId=bookPlan.existingId||bookPlan.bookId||'';operations.push(...(bookPlan.operations||[]));
      }
      const addedCard=operations.find((op)=>op.path[0]==='characters');if(addedCard&&bookId)addedCard.value.source.embeddedBookId=bookId;
      else if(existing&&bookId&&existing.source?.embeddedBookId!==bookId)operations.push({key:root.TAStore.uid('op'),kind:'set',path:['characters'],id:existing.id,field:'source',before:existing.source?clone(existing.source):undefined,after:Object.assign({},existing.source,{embeddedBookId:bookId}),label:existing.name});
      return {id:root.TAStore.uid('proposal'),task:'import:link',createdAt:stamp,operations,cardId,bookId,existingId:existing?.id};
    }
    const existing = findExisting(library, prepared); if (existing) return { existingId: existing.id };
    const name = String(requestedName || '').trim(); if (!name) throw error('name-required');
    const book = Object.assign({}, clone(prepared.book), { id: root.TAStore.uid('book'), name, source: linkSource(prepared,new Date().toISOString()) });
    book.entries.forEach((entry) => { entry.id = root.TAStore.uid('lore'); });
    return { id: root.TAStore.uid('proposal'), task: 'import:link', bookId:book.id,createdAt: new Date().toISOString(), operations: [{ key: root.TAStore.uid('op'), kind: 'add', path: ['worldBooks'], value: book, label: name }] };
  }
  function undo(library,receipt) {
    const removed=(key)=>new Set(receipt.operations.filter((op)=>op.kind==='add'&&op.path[0]===key).map((op)=>op.value.id));
    const cards=removed('characters'),assets=removed('assets'),books=removed('worldBooks');
    if((library.characters||[]).some((card)=>{
      const sourceChange=receipt.operations.find(op=>op.kind==='set'&&op.path[0]==='characters'&&op.id===card.id&&op.field==='source');
      const sourceAfterUndo=sourceChange?sourceChange.before:card.source;
      return !cards.has(card.id)&&(assets.has(card.avatarAssetId)||(card.expressionAssetIds||[]).some((id)=>assets.has(id))||books.has(card.embeddedBookId ?? sourceAfterUndo?.embeddedBookId));
    })||assets.has(library.settings?.chatBackgroundAssetId))throw error('import-in-use');
    root.NIJANAI.undo(library,receipt);
  }
  const api = { MAX_BYTES, TIMEOUT, error, normalizeUrl, safeUrl, filename, download, downloadBrowser, readResponse, prepare, findExisting, plan, signature, cardSignature, undo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TALinkImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
