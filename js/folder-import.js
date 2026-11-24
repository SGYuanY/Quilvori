/* Import configured folders into the local library without changing source files. */
(function (root) {
  'use strict';
  const sourceKey = (path) => String(path || '').replace(/\\/g, '/').toLowerCase();
  const plainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
  const decode = (bytes) => JSON.parse(new TextDecoder().decode(bytes).replace(/^\uFEFF/, ''));
  const cardFields = ['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'creator_notes', 'system_prompt', 'post_history_instructions', 'alternate_greetings', 'tags', 'creator', 'character_version', 'talkativeness'];
  function signature(card) {
    return JSON.stringify(Object.fromEntries(cardFields.map((key) => [key, card[key] ?? (['tags', 'alternate_greetings'].includes(key) ? [] : key === 'talkativeness' ? .5 : '')])));
  }
  const stable = (value) => Array.isArray(value) ? value.map(stable) : plainObject(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
  const bookSignature = (book) => JSON.stringify([book.name, stable((book.entries || []).map(({ id, ...entry }) => entry))]);
  function parseCard(file, bytes) {
    const png = /\.png$/i.test(file.name);
    const text = png ? root.TAPng.readChara(bytes) : null;
    if (png && !text) throw new Error('这张图片里没有角色卡数据。');
    const value = png ? JSON.parse(text) : decode(bytes);
    const json = Array.isArray(value) ? value[0] : value;
    const wrapped = plainObject(json?.character?.data) ? json.character : json;
    const data = plainObject(wrapped?.data) ? wrapped.data : wrapped;
    if (!plainObject(data) || !['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example'].some((key) => typeof data[key] === 'string')) throw new Error('这个文件不是角色卡。');
    const card = root.TAFormats.cardToCharacter(wrapped);
    card.name = String(card.name || file.name.replace(/\.(png|json)$/i, '')).trim();
    return { card, png };
  }
  function makeBook(spec, fallback) {
    if (!spec || typeof spec !== 'object') throw new Error('这个文件没有世界书条目。');
    return {
      id: root.TAStore.uid('book'), name: spec.name || fallback, description: spec.description || '',
      entries: root.TAFormats.worldInfoToEntries(spec).map((entry) => Object.assign({ secondaryKeys: [], constant: false, selective: true, order: 100, position: 'before_char', enabled: true, depth: 4, outletName: '' }, entry, { id: root.TAStore.uid('lore') })),
    };
  }
  async function importAll(library, paths, adapter, options = {}) {
    const next = structuredClone(library);
    next.settings ||= {}; next.assets ||= []; next.characters ||= []; next.worldBooks ||= [];
    const sources = next.settings.folderImports ||= {};
    const report = { cards: 0, books: 0, unchanged: 0, failed: [], firstCardId: '', firstBookId: '', avatarsOmitted: 0 };
    let remainingAvatarBytes = 750000;
    const seenCards = new Map(next.characters.map((card) => [signature(card), card]));
    const seenBooks = new Map(next.worldBooks.map((book) => [bookSignature(book), book]));
    const adoptBook = (book) => {
      const key = bookSignature(book), existing = seenBooks.get(key);
      if (existing) return existing;
      next.worldBooks.push(book); seenBooks.set(key, book); report.books++; report.firstBookId ||= book.id;
      return book;
    };
    const digest = async (bytes) => [...new Uint8Array(await root.crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    for (const kind of ['cards', 'worlds']) {
      if (!paths[kind] || (kind === 'worlds' && options.cardsOnly)) continue;
      let files;
      try { files = await adapter.list(paths[kind]); }
      catch (error) { report.failed.push({ name: paths[kind], reason: error.message || String(error) }); continue; }
      for (const file of files.filter((file) => kind === 'cards' ? /\.(png|json)$/i.test(file.name) : /\.json$/i.test(file.name))) {
        try {
          const raw = await adapter.read(file.full);
          const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
          const hash = await digest(bytes), key = sourceKey(file.full), previous = sources[key];
          const collection = kind === 'cards' ? next.characters : next.worldBooks;
          if (previous?.hash === hash && collection.some((item) => item.id === previous.id)) { report.unchanged++; continue; }
          if (kind === 'cards') {
            const { card: partial, png } = parseCard(file, bytes);
            const specBook = partial.book;
            delete partial.book;
            if (specBook?.entries?.length || (plainObject(specBook?.entries) && Object.keys(specBook.entries).length)) {
              try { adoptBook(makeBook(specBook, `${partial.name} · 角色书`)); }
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
          } else {
            const spec = decode(bytes), book = makeBook(spec, file.name.replace(/\.json$/i, ''));
            const added = adoptBook(book);
            sources[key] = { hash, id: added.id, kind };
            if (added !== book) report.unchanged++;
          }
        } catch (error) { report.failed.push({ name: file.name, reason: error.message || String(error) }); }
        options.onProgress?.(report);
      }
    }
    return { library: next, report };
  }
  root.TAFolderImport = { importAll, parseCard };
})(globalThis);
