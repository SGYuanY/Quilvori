/* Device-local primitives shared by character and world-book synchronization. */
(function(root) {
  'use strict';
  const active=new Map();
  function withWork(kind,id,task){
    const key='quilvori-'+kind+'-sync-'+JSON.stringify(id);
    if(root.navigator?.locks?.request)return root.navigator.locks.request(key,task);
    const job=(active.get(key) || Promise.resolve()).catch(()=>{}).then(task);
    active.set(key,job);
    return job.finally(()=>{if(active.get(key)===job)active.delete(key);});
  }
  async function digest(bytes) {
    const value=await root.crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(value),n=>n.toString(16).padStart(2,'0')).join('');
  }
  function jsonHash(value) {
    const sorted=(_key,v)=>v && typeof v==='object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])) : v;
    return digest(new TextEncoder().encode(JSON.stringify(value,sorted)));
  }
  root.TAFileSync={withWork,digest,jsonHash};
})(globalThis);
