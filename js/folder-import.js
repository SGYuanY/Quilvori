/* Import configured folders into the local library without changing source files. */
(function (root) {
  'use strict';
  const sourceKey = (path) => String(path || '').replace(/\\/g, '/').toLowerCase();
  const plainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
  const decode = (bytes) => JSON.parse(new TextDecoder().decode(bytes).replace(/^\uFEFF/, ''));
  const cardFields = ['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'creator_notes', 'system_prompt', 'post_history_instructions', 'alternate_greetings', 'tags', 'creator', 'character_version', 'talkativeness'];
  function signature(card) {
    return JSON.stringify(stable({ ...Object.fromEntries(cardFields.map((key) => [key, card[key] ?? (['tags', 'alternate_greetings'].includes(key) ? [] : key === 'talkativeness' ? .5 : '')])), ...root.TAFormats.signatureMetadata(card), embeddedBookId:card.embeddedBookId || card.source?.embeddedBookId || null }));
  }
  const stable = (value) => Array.isArray(value) ? value.map(stable) : plainObject(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
  const bookSignature = (book) => JSON.stringify(stable([book.name,book.description || '',book.stBookFields || {},book.stBookExtensions || {},(book.entries || []).map(({id,stUid,...entry})=>entry)]));
  function parseCard(file, bytes) {
    const png = /\.png$/i.test(file.name);
    const text = png ? root.TAPng.readChara(bytes) : null;
    if (png && !text) throw new Error('这张图片里没有角色卡数据。');
    const value = png ? JSON.parse(text) : decode(bytes);
    const json = root.TAFormats.singleCard(value);
    const wrapped = plainObject(json?.character?.data) ? json.character : json;
    const data = plainObject(wrapped?.data) ? wrapped.data : wrapped;
    if (!plainObject(data) || !['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example'].some((key) => typeof data[key] === 'string')) throw new Error('这个文件不是角色卡。');
    if (data.entries && !data.character_book && !wrapped.spec?.startsWith?.('chara_card_')) throw new Error('这个文件不是角色卡。');
    const card = root.TAFormats.cardToCharacter(wrapped);
    card.name = String(card.name || file.name.replace(/\.(png|json)$/i, '')).trim();
    return { card, png };
  }
  function makeBook(spec, fallback) {
    if (!spec || typeof spec !== 'object') throw new Error('这个文件没有世界书条目。');
    const imported = root.TAFormats.worldInfoToBook(spec, fallback);
    return {
      ...imported, id: root.TAStore.uid('book'),
      entries: imported.entries.map((entry) => Object.assign({ secondaryKeys: [], constant: false, selective: true, order: 100, position: 'before_char', enabled: true, depth: 4, outletName: '' }, entry, { id: root.TAStore.uid('lore') })),
    };
  }
  async function importDocument(kind,file) {
    const ui = root.TAUI, stamp = new Date().toISOString();
    const bytes = new Uint8Array(await file.arrayBuffer());
    let card, book, asset, avatarOmitted = false;
    if (kind === 'character') {
      const parsed = parseCard(file,bytes);
      card = {...parsed.card,id:root.TAStore.uid('ch'),createdAt:stamp,updatedAt:stamp,avatarAssetId:null,expressionAssetIds:[]};
      if (card.book) {
        book = makeBook(card.book,card.name+' · '+ui.t('世界书'));
        card.embeddedBookId = book.id;
      }
      delete card.book;
      if (parsed.png && (root.TAStore.backend === 'indexedDB' || file.size <= 900000)) {
        const id = root.TAStore.uid('asset');
        asset = {id,name:card.name+' · '+ui.t('头像'),kind:'avatar',dataUrl:await ui.readDataUrl(file),mime:'image/png',bytes:file.size,createdAt:stamp};
        card.avatarAssetId = id;
      } else avatarOmitted = parsed.png;
    } else book = makeBook(decode(bytes),file.name.replace(/\.json$/i,''));
    // Capture the current library only after the asynchronous file reads.
    const next = structuredClone(ui.state.lib);
    if (asset) next.assets.push(asset);
    if (book) next.worldBooks.unshift(book);
    if (card) next.characters.unshift(card);
    await ui.commitLibrary(next);
    return {card,book,avatarOmitted};
  }
  // webkitRelativePath starts at the directory explicitly chosen by the user.
  function profileFiles(files) {
    const buckets = {cards:[],worlds:[],chats:[]}, byPath = new Map();
    for (const file of files) {
      const full = String(file.webkitRelativePath || '').replace(/\\/g,'/');
      const parts = full.split('/');
      if (parts.some(part=>!part || part === '.' || part === '..')) continue;
      const sub = ['characters','worlds','chats'].includes(parts[0]) ? parts : parts.slice(1);
      const kind = sub[0] === 'characters' && sub.length === 2 && /\.(png|json)$/i.test(file.name) ? 'cards'
        : sub[0] === 'worlds' && sub.length === 2 && /\.json$/i.test(file.name) ? 'worlds'
        : sub[0] === 'chats' && sub.length === 3 && /\.jsonl$/i.test(file.name) ? 'chats' : null;
      if (!kind) continue;
      buckets[kind].push({full,name:file.name,owner:kind==='chats'?sub[1]:''}); byPath.set(full,file);
    }
    for (const list of Object.values(buckets)) list.sort((a,b)=>a.full.localeCompare(b.full));
    return {buckets, paths:{cards:'cards',worlds:'worlds',chats:'chats'},
      list:async kind=>buckets[kind], read:async path=>new Uint8Array(await byPath.get(path).arrayBuffer())};
  }
  async function importAll(library, paths, adapter, options = {}) {
    const next = structuredClone(library);
    next.chats ||= []; next.settings ||= {}; next.assets ||= []; next.characters ||= []; next.worldBooks ||= [];
    const sources = next.settings.folderImports ||= {};
    const report = { cards: 0, books: 0, chats: 0, unchanged: 0, failed: [], firstCardId: '', firstBookId: '', avatarsOmitted: 0 };
    let remainingAvatarBytes = options.avatarBudget ?? 750000;
    const seenCards = new Map(next.characters.map((card) => [signature(card), card]));
    const seenBooks = new Map(next.worldBooks.map((book) => [bookSignature(book), book]));
    const adoptBook = (book) => {
      const key = bookSignature(book), existing = seenBooks.get(key);
      if (existing) return existing;
      next.worldBooks.push(book); seenBooks.set(key, book); report.books++; report.firstBookId ||= book.id;
      return book;
    };
    const digest = async (bytes) => [...new Uint8Array(await root.crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const seenChats = new Map(next.chats.filter(chat=>chat.stFileHash).map(chat=>[chat.stFileHash,chat]));
    for (const kind of ['cards', 'worlds', 'chats']) {
      if (!paths[kind] || (kind !== 'cards' && options.cardsOnly)) continue;
      let files;
      try { files = await adapter.list(paths[kind]); }
      catch (error) { report.failed.push({ name: paths[kind], reason: error.message || String(error) }); continue; }
      for (const file of files.filter((file) => kind === 'cards' ? /\.(png|json)$/i.test(file.name) : kind === 'chats' ? /\.jsonl$/i.test(file.name) : /\.json$/i.test(file.name))) {
        try {
          const raw = await adapter.read(file.full);
          const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
          const hash = await digest(bytes), key = sourceKey(file.full), previous = sources[key];
          const collection = kind === 'cards' ? next.characters : kind === 'chats' ? next.chats : next.worldBooks;
          if (previous?.hash === hash && collection.some((item) => item.id === previous.id)) { report.unchanged++; continue; }
          if (kind === 'cards') {
            const { card: partial, png } = parseCard(file, bytes);
            const specBook = partial.book;
            delete partial.book;
            if (specBook != null) {
              try { partial.embeddedBookId = adoptBook(makeBook(specBook, `${partial.name} · 角色书`)).id; }
              catch (error) { report.failed.push({ name: `${file.name} · 内嵌世界书`, reason: error.message || String(error) }); }
            }
            const existing = seenCards.get(signature(partial));
            if (existing) { sources[key] = { hash, id: existing.id, kind }; report.unchanged++; continue; }
            const stamp = new Date().toISOString();
            const card = Object.assign({ id: root.TAStore.uid('ch'), createdAt: stamp, updatedAt: stamp, avatarAssetId: null, expressionAssetIds: [] }, partial);
            // Bound avatar storage so a large folder cannot prevent card text being saved.
            let avatar = null;
            if (png && remainingAvatarBytes > 0 && options.makeAvatar) {
              try { avatar = await options.makeAvatar(bytes); } catch (_) { /* Card text can still be imported. */ }
            }
            if (avatar?.dataUrl && avatar.bytes <= remainingAvatarBytes) {
              const id = root.TAStore.uid('asset');
              next.assets.push({ id, name: `${card.name} · 头像`, kind: 'avatar', dataUrl: avatar.dataUrl, mime: avatar.mime, bytes: avatar.bytes, createdAt: stamp });
              card.avatarAssetId = id; remainingAvatarBytes -= avatar.bytes;
            } else if (png && bytes.length <= Math.min(260000, remainingAvatarBytes)) {
              const id = root.TAStore.uid('asset');
              let binary = ''; for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
              next.assets.push({ id, name: `${card.name} · 头像`, kind: 'avatar', dataUrl: `data:image/png;base64,${btoa(binary)}`, mime: 'image/png', bytes: bytes.length, createdAt: stamp });
              card.avatarAssetId = id; remainingAvatarBytes -= bytes.length;
            } else if (png) report.avatarsOmitted++;
            next.characters.push(card); seenCards.set(signature(card), card);
            sources[key] = { hash, id: card.id, kind }; report.cards++; report.firstCardId ||= card.id;
          } else if (kind === 'chats') {
            const chatKey = JSON.stringify([file.owner || '',hash]);
            const existing = seenChats.get(chatKey);
            if (existing) { sources[key] = {hash,id:existing.id,kind}; report.unchanged++; continue; }
            const parsed = root.TAFormats.chatFromText(new TextDecoder().decode(bytes),file.name);
            const chat = {...parsed,id:root.TAStore.uid('chat'),stFileHash:chatKey,stOwner:file.owner || ''};
            next.chats.push(chat); seenChats.set(chatKey,chat); sources[key] = {hash,id:chat.id,kind}; report.chats++;
          } else {
            const spec = decode(bytes), book = makeBook(spec, file.name.replace(/\.json$/i, ''));
            const added = adoptBook(book);
            sources[key] = { hash, id: added.id, kind };
            if (added !== book) report.unchanged++;
          }
        } catch (error) { report.failed.push({ name: file.owner ? file.owner + '/' + file.name : file.name, reason: error.message || String(error) }); }
        options.onProgress?.(report);
      }
    }
    return { library: next, report };
  }
  root.TAFolderImport = { importAll, importDocument, parseCard, makeBook, profileFiles };
})(globalThis);
