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
    if (chunk.type === 'tEXt') {
      const zero = data.indexOf(0);
      if (zero < 0) return '';
      return new TextDecoder().decode(data.subarray(0, zero));
    }
    if (chunk.type === 'iTXt') {
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

  function charaPayload(jsonText) {
    const b64 = utf8ToB64(jsonText);
    let name = 'chara';
    try { if (JSON.parse(jsonText).spec === 'chara_card_v3') name = 'ccv3'; } catch (_) {}
    const keyword = new TextEncoder().encode(name);
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
    const preferred = texts.find((chunk) => keywordOf(chunk) === 'ccv3')
      || texts.find((chunk) => keywordOf(chunk) === 'chara');
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
      if ((chunk.type === 'tEXt' || chunk.type === 'iTXt') && (keywordOf(chunk) === 'chara' || keywordOf(chunk) === 'ccv3')) return;
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

  root.TAPng = { crc32, parseChunks, readChara, embedChara, utf8ToB64, b64ToUtf8 };
})(typeof globalThis !== 'undefined' ? globalThis : window);
