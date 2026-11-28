/* Import configured folders into the local library without changing source files. */
(function (root) {
  'use strict';
  const sourceKey = (path) => String(path || '').replace(/\\/g, '/');
  const plainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
  const decode = (bytes) => JSON.parse(new TextDecoder().decode(bytes).replace(/^\uFEFF/, ''));
  const cardFields = ['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'creator_notes', 'system_prompt', 'post_history_instructions', 'alternate_greetings', 'tags', 'creator', 'character_version', 'talkativeness'];
  const attribution = work => root.TAResourceSource?.clean(work.source) || null;
  function signature(card) {
    const source=attribution(card);
    return JSON.stringify(stable({ ...Object.fromEntries(cardFields.map((key) => [key, card[key] ?? (['tags', 'alternate_greetings'].includes(key) ? [] : key === 'talkativeness' ? .5 : '')])), ...root.TAFormats.signatureMetadata(card), ...(source ? {source} : {}), embeddedBookId:card.embeddedBookId ?? card.source?.embeddedBookId ?? null }));
  }
  const stable = (value) => Array.isArray(value) ? value.map(stable) : plainObject(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
  function nativeIds(book) {
    return JSON.stringify((book.entries || []).map(entry=>entry.stUid ?? null));
  }
  function bookSignature(book) {
    return JSON.stringify(stable([attribution(book),!!book.stOriginalData,book.name,book.description || '',book.stBookFields || {},book.stBookExtensions || {},(book.entries || []).map(({id,stUid,...entry})=>entry)]));
  }
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
  function makeBook(spec, fallback, fromCharacterBook=false) {
    if (!spec || typeof spec !== 'object') throw new Error('这个文件没有世界书条目。');
    const imported = root.TAFormats.worldInfoToBook(spec, fallback, fromCharacterBook);
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
        book = makeBook(card.book,card.name+' · '+ui.t('世界书'),true);
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
  const digest = async bytes => [...new Uint8Array(await root.crypto.subtle.digest('SHA-256', bytes))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
  function portraitDigest(bytes) {
    // Ignore card text and editor annotations. Keep image, palette, transparency and color-profile data.
    const chunks = root.TAPng.parseChunks(bytes).filter(c => !['tEXt','iTXt','zTXt','tIME'].includes(c.type));
    const image = new Uint8Array(chunks.reduce((size, c) => size + c.raw.length, 0));
    let offset = 0;
    for (const {raw} of chunks) { image.set(raw, offset); offset += raw.length; }
    return digest(image);
  }
  // Keep this encoding compatible with existing unmarked folder-scan JPEGs.
  async function makeAvatar(bytes) {
    const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
    try {
      const ratio=Math.min(1,192/bitmap.width,256/bitmap.height);
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(bitmap.width*ratio));
      canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
      const context=canvas.getContext('2d');
      context.fillStyle='#212420';context.fillRect(0,0,canvas.width,canvas.height);
      context.drawImage(bitmap,0,0,canvas.width,canvas.height);
      const dataUrl=canvas.toDataURL('image/jpeg',.8);
      return {dataUrl,mime:'image/jpeg',bytes:Math.ceil(dataUrl.length*.75)};
    } finally {bitmap.close();}
  }
  function pngAvatar(bytes) {
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768) binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    return {dataUrl:'data:image/png;base64,' + btoa(binary), mime:'image/png', bytes:bytes.length};
  }
  function cardScanner(library, sources, options, report, adoptBook) {
    const variants = new Map(), origins = new Map(), byId = new Map(), assets = new Map(library.assets.map(asset => [asset.id, asset]));
    const originalArt = new Map(), jsonCards = new Set();
    let remaining = options.avatarBudget ?? 750000;
    for (const [path, source] of Object.entries(sources)) {
      if (source?.kind === 'cards' && /\.json$/i.test(path)) jsonCards.add(source.id);
    }
    function index(card, key) {
      if (!variants.has(key)) variants.set(key, []);
      variants.get(key).push(card);
      byId.set(card.id, card);
    }
    function rememberOrigin(card, hash) {
      if (!origins.has(hash)) origins.set(hash, new Set());
      origins.get(hash).add(card);
      card.folderTextHash ??= hash;
    }
    for (const card of library.characters) {
      index(card, signature(card));
      if (card.folderTextHash) rememberOrigin(card, card.folderTextHash);
    }

    return async function scan(file, bytes, hash, previous) {
      const priorCard = byId.get(previous?.id), png = /\.png$/i.test(file.name);
      const sameFile = priorCard && previous.hash === hash;
      if (sameFile && (!png || (previous.portraitHash && previous.portraitHash === priorCard.folderPortraitHash && !priorCard.folderAvatarPending))) {
        report.unchanged++;
        return previous;
      }
      const portraitHash = png ? await portraitDigest(bytes) : null;
      let thumbnail;
      const thumb = () => thumbnail ||= Promise.resolve().then(() => options.makeAvatar?.(bytes)).catch(() => null);
      async function matchesPortrait(card) {
        if (card.folderPortraitHash) return card.folderPortraitHash === portraitHash;
        const asset = assets.get(card.avatarAssetId);
        if (!asset?.dataUrl) return false;
        if (asset.dataUrl.startsWith('data:image/png;base64,')) {
          if (!originalArt.has(asset.id)) {
            try {
              const raw = Uint8Array.from(atob(asset.dataUrl.split(',')[1]), c => c.charCodeAt(0));
              originalArt.set(asset.id, await portraitDigest(raw));
            } catch (_) { originalArt.set(asset.id, null); }
          }
          return originalArt.get(asset.id) === portraitHash;
        }
        // v0.2.0 desktop scans kept only a JPEG thumbnail and a whole-file hash.
        return (await thumb())?.dataUrl === asset.dataUrl;
      }
      async function attachPortrait(card) {
        const small = remaining > 0 ? await thumb() : null;
        const avatar = small?.dataUrl && small.bytes <= remaining ? small :
          bytes.length <= Math.min(260000, remaining) ? pngAvatar(bytes) : null;
        if (!avatar) { card.folderAvatarPending = true; report.avatarsOmitted++; return; }
        const id = root.TAStore.uid('asset');
        const asset = {...avatar, id, name:card.name + ' · 头像', kind:'avatar', createdAt:new Date().toISOString(),
          ...(avatar===small ? {folderPortraitPreview:true} : {})};
        assets.set(id, asset);
        library.assets.push(asset);
        card.avatarAssetId = id;
        delete card.folderAvatarPending;
        remaining -= avatar.bytes;
      }
      // A legacy source hash can already name a different portrait. Verify it once while preserving local text edits.
      if (sameFile && await matchesPortrait(priorCard)) {
        priorCard.folderPortraitHash = portraitHash;
        previous.portraitHash = portraitHash;
        if (priorCard.folderAvatarPending) {
          if (priorCard.avatarAssetId) delete priorCard.folderAvatarPending;
          else await attachPortrait(priorCard);
        }
        report.unchanged++;
        return previous;
      }

      const {card:partial} = parseCard(file, bytes);
      if (partial.book != null) {
        try { partial.embeddedBookId = adoptBook(makeBook(partial.book, partial.name + ' · 角色书',true)).id; }
        catch (error) { report.failed.push({name:file.name + ' · 内嵌世界书', reason:error.message || String(error)}); }
      }
      delete partial.book;
      const textKey = signature(partial), textHash = await digest(new TextEncoder().encode(textKey));
      const sourceIdentity=JSON.stringify(attribution(partial));
      const candidates = [...new Set([...(variants.get(textKey) || []), ...(origins.get(textHash) || [])])]
        .filter(candidate=>JSON.stringify(attribution(candidate))===sourceIdentity);
      let card;
      if (priorCard && previous.textHash === textHash && (!png || previous.portraitHash === portraitHash)) {
        card = priorCard;
      } else if (png) {
        for (const candidate of candidates) {
          if (await matchesPortrait(candidate)) { card = candidate; break; }
        }
        card ||= candidates.find(c => jsonCards.has(c.id) && !c.folderPortraitHash && !c.avatarAssetId);
      } else card = candidates.includes(priorCard) ? priorCard : candidates[0];
      if (!card) {
        const stamp = new Date().toISOString();
        card = {...partial, id:root.TAStore.uid('ch'), createdAt:stamp, updatedAt:stamp, avatarAssetId:null, expressionAssetIds:[]};
        library.characters.push(card);
        index(card, textKey);
        report.cards++;
        report.firstCardId ||= card.id;
      } else report.unchanged++;
      if (png) {
        if (!card.avatarAssetId && (!card.folderPortraitHash || card.folderAvatarPending)) await attachPortrait(card);
        card.folderPortraitHash = portraitHash;
      } else jsonCards.add(card.id);
      rememberOrigin(card, textHash);
      if (priorCard && priorCard.id !== card.id) report.updatedCardId ||= card.id;
      return {hash, textHash, id:card.id, kind:'cards', ...(png ? {portraitHash} : {})};
    };
  }
  async function importAll(library, paths, adapter, options = {}) {
    const next = structuredClone(library);
    next.chats ||= []; next.settings ||= {}; next.assets ||= []; next.characters ||= []; next.worldBooks ||= [];
    const sources = next.settings.folderImports ||= {};
    const report = { cards: 0, books: 0, chats: 0, unchanged: 0, failed: [], firstCardId: '', firstBookId: '', avatarsOmitted: 0 };
    const seenBooks=new Map();
    function indexBook(book,key) {
      const editions=seenBooks.get(key) || {byUid:new Map()};
      editions.embedded=book;
      editions.byUid.set(nativeIds(book),book);
      seenBooks.set(key,editions);
    }
    for(const book of next.worldBooks)indexBook(book,bookSignature(book));
    const adoptBook = (book,standalone=false) => {
      const key=bookSignature(book),editions=seenBooks.get(key);
      const existing=standalone ? editions?.byUid.get(nativeIds(book)) : editions?.embedded;
      if (existing) return existing;
      next.worldBooks.push(book); indexBook(book,key); report.books++; report.firstBookId ||= book.id;
      return book;
    };
    const scanCard = cardScanner(next, sources, options, report, adoptBook);
    const seenChats = new Map(next.chats.filter(chat=>chat.stFileHash).map(chat=>[chat.stFileHash,chat]));
    // Previous versions folded case and could join different editions under one ID.
    // Keep local edits on unambiguous receipts, re-identify shared legacy sources.
    const legacy=new Map(), legacyHashes=new Map(), caseVariants=new Map();
    for(const [key,source] of Object.entries(sources)) if(source){
      const folded=key.toLowerCase();
      caseVariants.set(folded,caseVariants.has(folded) ? null : key);
      if(source.identityVersion===2)continue;
      legacy.set(key,source);
      const keyId=JSON.stringify([source.kind,source.id]);
      if(!legacyHashes.has(keyId))legacyHashes.set(keyId,new Set());
      legacyHashes.get(keyId).add(source.hash);
    }
    for (const kind of ['cards', 'worlds', 'chats']) {
      if (!paths[kind] || (kind !== 'cards' && options.cardsOnly)) continue;
      let files;
      try { files = await adapter.list(paths[kind]); }
      catch (error) { report.failed.push({ name: paths[kind], reason: error.message || String(error) }); continue; }
      const selected=files.filter(file=>kind==='cards' ? /\.(png|json)$/i.test(file.name) : kind==='chats' ? /\.jsonl$/i.test(file.name) : /\.json$/i.test(file.name));
      const counts=new Map();
      for(const file of selected){const folded=sourceKey(file.full).toLowerCase();counts.set(folded,(counts.get(folded)||0)+1);}
      for (const file of selected) {
        try {
          const raw = await adapter.read(file.full);
          const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
          const hash = await digest(bytes), key = sourceKey(file.full), folded=key.toLowerCase();
          const old=legacy.get(folded), collision=counts.get(folded)>1;
          const formerPath=!collision && caseVariants.get(folded);
          const former=formerPath && sources[formerPath];
          let previous=sources[key] || old || (former?.hash===hash && former.kind===kind ? former : undefined);
          const collection = kind==='cards' ? next.characters : kind==='chats' ? next.chats : next.worldBooks;
          let prior=previous?.hash===hash && collection.find(item=>item.id===previous.id);
          let book;
          const readBook=()=>book ||= makeBook(decode(bytes),file.name.replace(/\.json$/i, ''));
          if(prior && previous.identityVersion!==2 && (collision || legacyHashes.get(JSON.stringify([kind,prior.id]))?.size>1)){
            const candidate=kind==='worlds' ? readBook() : kind==='cards' ? parseCard(file,bytes).card : null;
            const identity=work=>kind==='worlds' ? [attribution(work),!!work.stOriginalData,nativeIds(work)] : attribution(work);
            const differentOwner=kind==='chats' && (prior.stOwner || '')!==(file.owner || '');
            if(differentOwner || candidate && (JSON.stringify(stable(identity(candidate)))!==JSON.stringify(stable(identity(prior))) || collision && candidate.name!==prior.name)){
              previous=null;prior=null;
            }
          }
          let receipt;
          if (kind === 'cards') {
            receipt=await scanCard(file,bytes,hash,previous);
          } else if(prior) {
            receipt=previous;report.unchanged++;
          } else if (kind === 'chats') {
            const chatKey = JSON.stringify([file.owner || '',hash]);
            let chat=seenChats.get(chatKey);
            if(chat) report.unchanged++;
            else {
              const parsed=root.TAFormats.chatFromText(new TextDecoder().decode(bytes),file.name);
              chat={...parsed,id:root.TAStore.uid('chat'),stFileHash:chatKey,stOwner:file.owner || ''};
              next.chats.push(chat);seenChats.set(chatKey,chat);report.chats++;
            }
            receipt={hash,id:chat.id,kind};
          } else {
            const added = adoptBook(readBook(),true);
            receipt={hash,id:added.id,kind};
            if (added !== book) report.unchanged++;
          }
          sources[key]={...receipt,identityVersion:2};
          if(old && key!==folded && !collision && sources[folded]?.identityVersion!==2)delete sources[folded];
          else if(formerPath && formerPath!==key && previous===former)delete sources[formerPath];
        } catch (error) { report.failed.push({ name: file.owner ? file.owner + '/' + file.name : file.name, reason: error.message || String(error) }); }
        options.onProgress?.(report);
      }
    }
    return { library: next, report };
  }
  root.TAFolderImport = { importAll, importDocument, parseCard, makeBook, makeAvatar, profileFiles };
})(globalThis);
