/* PNG tEXt chunk read/write for SillyTavern character cards.
   The card JSON is UTF-8, then base64, stored in a tEXt chunk named "chara"
   immediately before IEND. No dependencies. */
(function (root) {
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function u32(bytes, offset) {
    return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
  }

  function utf8ToB64(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(bin);
  }

  function b64ToUtf8(b64) {
    const bin = atob(String(b64).replace(/\s+/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  function parseChunks(bytes) {
    if (bytes.length < 8) throw new Error('不是 PNG');
    for (let i = 0; i < 8; i += 1) if (bytes[i] !== SIG[i]) throw new Error('不是 PNG');
    const chunks = [];
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = u32(bytes, offset);
      const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      const dataStart = offset + 8;
      const dataEnd = dataStart + length;
      const next = dataEnd + 4;
      if (next > bytes.length) throw new Error('PNG 数据不完整');
      chunks.push({
        type,
        data: bytes.subarray(dataStart, dataEnd),
        raw: bytes.subarray(offset, next),
      });
      offset = next;
      if (type === 'IEND') break;
    }
    return chunks;
  }

  function keywordOf(chunk) {
    const data = chunk.data;
    if (['tEXt','iTXt','zTXt'].includes(chunk.type)) {
      const zero = data.indexOf(0);
      if (zero < 0) return '';
      return new TextDecoder().decode(data.subarray(0, zero));
    }
    return '';
  }

  function textOf(chunk) {
    const data = chunk.data;
    if (chunk.type === 'tEXt') {
      const zero = data.indexOf(0);
      return new TextDecoder('latin1').decode(data.subarray(zero + 1));
    }
    if (chunk.type === 'iTXt') {
      let p = data.indexOf(0);
      if (p < 0) return '';
      const compression = data[p + 1];
      p += 2;
      const method = data[p];
      p += 1;
      if (compression !== 0 || method !== 0) return '';
      const skip = () => {
        const z = data.indexOf(0, p);
        p = z < 0 ? data.length : z + 1;
      };
      skip();
      skip();
      return new TextDecoder().decode(data.subarray(p));
    }
    return '';
  }

  function makeChunk(type, data) {
    const typeBytes = new TextEncoder().encode(type);
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(typeBytes, 4);
    out.set(data, 8);
    const crcBuf = new Uint8Array(4 + data.length);
    crcBuf.set(typeBytes, 0);
    crcBuf.set(data, 4);
    view.setUint32(8 + data.length, crc32(crcBuf));
    return out;
  }

  function charaPayload(jsonText, keywordName) {
    const b64 = utf8ToB64(jsonText);
    let name = 'chara';
    try { if (JSON.parse(jsonText).spec === 'chara_card_v3') name = 'ccv3'; } catch (_) {}
    const keyword = new TextEncoder().encode(keywordName || name);
    const text = new TextEncoder().encode(b64);
    const data = new Uint8Array(keyword.length + 1 + text.length);
    data.set(keyword, 0);
    data[keyword.length] = 0;
    data.set(text, keyword.length + 1);
    return data;
  }

  function readChara(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const chunks = parseChunks(bytes);
    const texts = chunks.filter((chunk) => chunk.type === 'tEXt' || chunk.type === 'iTXt');
    const preferred = texts.find((chunk) => keywordOf(chunk).toLowerCase() === 'ccv3')
      || texts.find((chunk) => keywordOf(chunk).toLowerCase() === 'chara');
    if (!preferred) return null;
    const raw = textOf(preferred).trim();
    if (!raw) return null;
    try {
      return b64ToUtf8(raw);
    } catch (error) {
      try {
        return decodeURIComponent(escape(atob(raw)));
      } catch (inner) {
        throw new Error('chara 数据无法解码');
      }
    }
  }

  function embedChara(buffer, jsonText) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const chunks = parseChunks(bytes);
    const parts = [new Uint8Array(SIG)];
    chunks.forEach((chunk) => {
      if (chunk.type === 'IEND') return;
      if (cardKeyword(chunk)) return;
      parts.push(chunk.raw);
    });
    parts.push(makeChunk('tEXt', charaPayload(jsonText)));
    parts.push(makeChunk('IEND', new Uint8Array(0)));
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    parts.forEach((part) => {
      out.set(part, offset);
      offset += part.length;
    });
    return out;
  }

  function cardKeyword(chunk) {
    const name = keywordOf(chunk).toLowerCase();
    return name === 'chara' || name === 'ccv3' ? name : '';
  }
  function pngError(code = 'card.png') {
    throw Object.assign(new Error(code === 'card.variant' ? 'Duplicate PNG card metadata.' : 'Invalid PNG or character metadata.'), {code});
  }
  function checkedChunks(bytes) {
    let chunks;
    try { chunks = parseChunks(bytes); } catch { return pngError(); }
    const header = chunks[0], end = chunks.at(-1);
    if (header?.type !== 'IHDR' || header.data.length !== 13 || !u32(header.data,0) || !u32(header.data,4) ||
        end?.type !== 'IEND' || end.data.length || !chunks.some(chunk => chunk.type === 'IDAT')) return pngError();
    for (const [index,chunk] of chunks.entries()) {
      if (index && chunk.type === 'IHDR' || crc32(chunk.raw.subarray(4,-4)) !== u32(chunk.raw,chunk.raw.length - 4)) return pngError();
    }
    return chunks;
  }
  function concat(parts) {
    const out = new Uint8Array(parts.reduce((size,part) => size + part.length,0));
    let offset = 0;
    for (const part of parts) { out.set(part,offset); offset += part.length; }
    return out;
  }
  function cardVariants(bytes) {
    const variants = {};
    for (const chunk of checkedChunks(bytes)) {
      const name = cardKeyword(chunk);
      if (!name) continue;
      if (Object.hasOwn(variants,name)) return pngError('card.variant');
      // ST stores base64 in tEXt. Also accept uncompressed iTXt from other editors.
      // Do not silently drop an unreadable secondary representation when rewriting a card.
      try {
        const binary = atob(textOf(chunk).trim());
        const payload = Uint8Array.from(binary, char => char.charCodeAt(0));
        variants[name] = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(payload));
      } catch { return pngError(); }
    }
    return variants;
  }
  function trailer(bytes,chunks) {
    const end = chunks.at(-1).raw;
    return bytes.subarray(end.byteOffset - bytes.byteOffset + end.length);
  }
  function portraitBytes(bytes) {
    const chunks = checkedChunks(bytes);
    return concat([bytes.subarray(0,8),...chunks.filter(chunk => !cardKeyword(chunk)).map(chunk => chunk.raw)]);
  }
  async function portraitFingerprint(bytes) {
    const chunks = checkedChunks(bytes).filter(chunk => !['tEXt','iTXt','zTXt','tIME'].includes(chunk.type));
    const digest = await root.crypto.subtle.digest('SHA-256',concat(chunks.map(chunk => chunk.raw)));
    return Array.from(new Uint8Array(digest),value => value.toString(16).padStart(2,'0')).join('');
  }
  function writeCardVariants(bytes,updates,replacement) {
    const original = checkedChunks(bytes);
    const parts = [bytes.subarray(0,8)], metadata = [], written = new Set();
    const emit = (name, keyword = name) => {
      written.add(name);
      return makeChunk('tEXt',charaPayload(JSON.stringify(updates[name]),keyword));
    };
    const cardChunk = (chunk,name) => {
      if (Object.hasOwn(updates,name)) return emit(name,keywordOf(chunk));
      // The ST PNG reader itself only decodes tEXt. On an actual write, preserve
      // unmodified JSON/base64 from iTXt but give both editions a readable container.
      if (chunk.type === 'iTXt') return makeChunk('tEXt',new TextEncoder().encode(keywordOf(chunk)+'\0'+textOf(chunk)));
      return chunk.raw;
    };
    const body = replacement ? checkedChunks(replacement) : original;
    if (replacement) {
      // The new image owns its palette, color profile and other image-dependent chunks.
      // Keep the target's text and safe-to-copy vendor chunks when they are missing from it.
      const retained = new Set(body.map(chunk => chunk.type + '/' + keywordOf(chunk)));
      for (const chunk of original) {
        const name = cardKeyword(chunk);
        if (name) metadata.push(cardChunk(chunk,name));
        else if ((keywordOf(chunk) || /^[a-z][a-z][A-Z][a-z]$/.test(chunk.type)) &&
                 !retained.has(chunk.type + '/' + keywordOf(chunk))) metadata.push(chunk.raw);
      }
    }
    for (const chunk of body) {
      if (chunk.type === 'IEND') {
        for (const name of Object.keys(updates)) if (!written.has(name)) metadata.push(emit(name));
        parts.push(...metadata,chunk.raw);
        break;
      }
      const name = cardKeyword(chunk);
      if (!name) parts.push(chunk.raw);
      else if (!replacement) parts.push(cardChunk(chunk,name));
    }
    parts.push(trailer(bytes,original));
    return concat(parts);
  }
  function readJsonBytes(bytes) {
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  }
  function writeJsonBytes(bytes,document) {
    const original = new TextDecoder().decode(bytes);
    const indent = original.match(/\n([\t ]+)"/)?.[1] || '';
    const newline = original.includes('\r\n') ? '\r\n' : '\n';
    const json = JSON.stringify(document,null,indent).replace(/\n/g,newline);
    const leading = original.match(/^\s*/)[0], trailing = original.match(/\s*$/)[0];
    const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? '\uFEFF' : '';
    return new TextEncoder().encode(bom + leading + json + trailing);
  }
  root.TAPng = {crc32,parseChunks,readChara,embedChara,utf8ToB64,b64ToUtf8,
    cardVariants,writeCardVariants,portraitBytes,portraitFingerprint,readJsonBytes,writeJsonBytes};
})(typeof globalThis !== 'undefined' ? globalThis : window);
