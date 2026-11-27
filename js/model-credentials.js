/* Desktop keys use the OS keystore. Browsers use an origin-scoped, non-extractable AES key. */
(function (root) {
  'use strict';
  function database() {
    if(!root.indexedDB)throw new Error('credential-unavailable');
    return new Promise((resolve,reject) => {
      const request = indexedDB.open('quilvori-credentials',1);
      request.onupgradeneeded = () => request.result.createObjectStore('keys');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function browserKey(create) {
    if (!root.crypto?.subtle) throw new Error('credential-unavailable');
    const db=await database();
    try {
      const saved = await new Promise((resolve,reject) => {
        const read = db.transaction('keys').objectStore('keys').get('model');
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
      });
      if (saved) return saved;
      if(!create)throw new Error('credential-unavailable');
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
  function base64(bytes) {
    return btoa(Array.from(bytes,byte=>String.fromCharCode(byte)).join(''));
  }
  function malformedEnvelope(value) {
    const encoded=s=>typeof s==='string' && s.length>0 && s.length%4===0 && /^[A-Za-z0-9+/]+={0,2}$/.test(s);
    if(value.startsWith('os1.'))return !encoded(value.slice(4));
    if(!value.startsWith('web1.'))return false;
    const parts=value.split('.');
    if(parts.length!==3 || !encoded(parts[1]) || !encoded(parts[2]) || parts[1].length!==16 || parts[1].includes('='))return true;
    const cipher=parts[2],length=cipher.length*3/4-(cipher.endsWith('==')?2:cipher.endsWith('=')?1:0);
    return length<16;
  }
  async function seal(id, value) {
    if (root.nijanDesktop) return 'os1.'+await root.nijanDesktop.sealModelKey(id,value);
    const iv = crypto.getRandomValues(new Uint8Array(12)), enc = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(id)},await browserKey(true),enc.encode(value));
    return 'web1.'+base64(iv)+'.'+base64(new Uint8Array(encrypted));
  }
  async function open(id, envelope) {
    if (typeof envelope !== 'string') throw new Error('invalid-key');
    if (root.nijanDesktop && envelope.startsWith('os1.')) return root.nijanDesktop.openModelKey(id,envelope.slice(4));
    if (root.nijanDesktop || !envelope.startsWith('web1.')) throw new Error('credential-unavailable');
    const parts = envelope.split('.');
    if (parts.length !== 3) throw new Error('invalid-key');
    const bytes = value => Uint8Array.from(atob(value),c=>c.charCodeAt(0));
    const aesKey = await browserKey(false);
    const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(parts[1]),additionalData:new TextEncoder().encode(id)},aesKey,bytes(parts[2]));
    return new TextDecoder().decode(plain);
  }
  const headKey='connections.head',intentKey='connections.pending',slotKey=index=>'connections.'+index;
  // Run synchronous localStorage changes only inside the transaction's last request callback.
  // A thrown callback, an aborted request and a failed commit all reject the returned promise.
  function write(db,action,readIndex=0) {
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('keys','readwrite'),store=tx.objectStore('keys');
      const before=store.get(intentKey),current=readIndex ? store.get(slotKey(readIndex)) : null,head=store.get(headKey);
      let result,failure;
      head.onsuccess=()=>{try{result=action(store,head.result,before.result ?? [],current?.result);}catch(error){failure=error;tx.abort();}};
      tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(failure || tx.error || Error('credential-unavailable'));
    });
  }
  const sameHead=(head,expected)=>(head?.index ?? 0)===expected.index && (head?.revision ?? null)===expected.revision;
  async function registryState(legacy) {
    const db=await database();
    try{
      const snapshot=await write(db,(store,head,intents)=>{
        if(head!=null && (!Number.isSafeInteger(head.index) || head.index<0 || typeof head.revision!=='string'))throw Error('credential-unavailable');
        if(head?.index)return {head,request:store.get(slotKey(head.index))};
        const source=legacy(),revision=head?.revision ?? null;
        // A process can exit after writing localStorage but before its IDB transaction commits.
        // Complete only the exact, already protected value that the prior transaction prepared.
        const intent=intents.find(i=>i.from===revision && i.index===source.index && source.raw===(i.index ? i.revision : i.data));
        if(intent){
          const repaired={index:intent.index,revision:intent.revision};
          if(intent.index)store.put(intent.data,slotKey(intent.index));
          store.put(repaired,headKey);store.delete(intentKey);
          return {head:repaired,raw:intent.data};
        }
        if(source.index!==0 || (head && source.raw==null))throw Error('credential-unavailable');
        return {head:{index:0,revision},raw:source.raw};
      });
      const raw=snapshot.request ? snapshot.request.result : snapshot.raw;
      if(snapshot.head.index && typeof raw!=='string')throw Error('credential-unavailable');
      return {...snapshot.head,raw};
    }finally{db.close();}
  }
  // Separate renderers can see different localStorage caches even inside a Web Lock.
  // The independent database revision decides which writer may publish. Rebuilt registries
  // live in this same transaction, and appending a slot preserves its damaged predecessor.
  async function publishRegistry(expected,index,data,revision,validateLegacy,writeLegacy,rollbackLegacy,cancel) {
    const db=await database();
    function forget(store,intents){
      const rest=intents.filter(i=>i.revision!==revision);
      if(rest.length)store.put(rest,intentKey);else store.delete(intentKey);
    }
    try{
      if(!expected.index){
        if(cancel?.())return false;
        await write(db,(store,head,intents)=>{
          if(!sameHead(head,expected))throw Error('credential-stale');
          store.put([...intents,{from:expected.revision,index,revision,data}],intentKey);
        });
      }
      return await write(db,(store,head,intents,current)=>{
        if(!sameHead(head,expected) || (expected.index ? current!==expected.raw : !intents.some(i=>i.revision===revision)))throw Error('credential-stale');
        if(cancel?.()){if(!expected.index)forget(store,intents);return false;}
        if(!expected.index)validateLegacy();
        if(index)store.put(data,slotKey(index));else writeLegacy(data);
        store.put({index,revision},headKey);
        if(!expected.index)store.delete(intentKey);
        return true;
      },expected.index);
    }catch(error){
      if(!expected.index){
        // A newer writer owns its own values. If rolling back also fails, retain the verified
        // intent so startup can finish the interrupted write without guessing or copying secrets.
        try{await write(db,(store,head,intents)=>{
          if(sameHead(head,expected) && intents.some(i=>i.revision===revision)){rollbackLegacy();forget(store,intents);}
        });}catch(_){}
      }
      throw error;
    }finally{db.close();}
  }
  root.TAModelKeyCodec = {seal,open,malformedEnvelope,registryState,publishRegistry};
})(globalThis);
