/* Desktop keys use the OS keystore. Browsers use an origin-scoped, non-extractable AES key. */
(function (root) {
  'use strict';
  let keyPending;
  async function browserKey() {
    if (!root.crypto?.subtle || !root.indexedDB) throw new Error('credential-unavailable');
    const db = await new Promise((resolve,reject) => {
      const request = indexedDB.open('quilvori-credentials',1);
      request.onupgradeneeded = () => request.result.createObjectStore('keys');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const saved = await new Promise((resolve,reject) => {
        const read = db.transaction('keys').objectStore('keys').get('model');
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
      });
      if (saved) return saved;
      const generated = await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
      return await new Promise((resolve,reject) => {
        const tx = db.transaction('keys','readwrite'), keys = tx.objectStore('keys');
        const existing = keys.get('model');
        let selected;
        existing.onsuccess = () => {
          selected = existing.result || generated;
          if (!existing.result) keys.add(generated,'model');
        };
        tx.oncomplete = () => resolve(selected);
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
  }
  function key() {
    if (!keyPending) keyPending = browserKey().catch(error => { keyPending = undefined; throw error; });
    return keyPending;
  }
  function base64(bytes) {
    return btoa(Array.from(bytes,byte=>String.fromCharCode(byte)).join(''));
  }
  async function seal(id, value) {
    if (root.nijanDesktop) return 'os1.'+await root.nijanDesktop.sealModelKey(id,value);
    const iv = crypto.getRandomValues(new Uint8Array(12)), enc = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(id)},await key(),enc.encode(value));
    return 'web1.'+base64(iv)+'.'+base64(new Uint8Array(encrypted));
  }
  async function open(id, envelope) {
    if (typeof envelope !== 'string') throw new Error('invalid-key');
    if (root.nijanDesktop && envelope.startsWith('os1.')) return root.nijanDesktop.openModelKey(id,envelope.slice(4));
    if (root.nijanDesktop || !envelope.startsWith('web1.')) throw new Error('credential-unavailable');
    const parts = envelope.split('.');
    if (parts.length !== 3) throw new Error('invalid-key');
    const bytes = value => Uint8Array.from(atob(value),c=>c.charCodeAt(0));
    const aesKey = await key();
    const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(parts[1]),additionalData:new TextEncoder().encode(id)},aesKey,bytes(parts[2]));
    return new TextDecoder().decode(plain);
  }
  root.TAModelKeyCodec = {seal,open};
})(globalThis);
