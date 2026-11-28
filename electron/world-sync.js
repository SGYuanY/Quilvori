/* File grants and the durable write journal for standalone SillyTavern World Info. */
'use strict';
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');

const MAX_BYTES = 32 * 1024 * 1024;
const MAX_RECORD = 128 * 1024;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const sha256 = /^[a-f0-9]{64}$/;
const operation = /^[a-zA-Z0-9_.:-]{1,128}$/;
const queues = new Map();
const codes = new Set(['changed','unbound','missing','invalid','too-large','unsafe','no-backup','recovery','io'].map(s=>'world-sync-'+s));
const fail = kind => { const code='world-sync-'+kind; throw Object.assign(new Error(code),{code}); };
const publicError = e => codes.has(e?.code) ? e.code : 'world-sync-io';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const idOf = stat => ({dev:String(stat.dev),ino:String(stat.ino)});
const idMatches = (stat,id) => !!stat && !!id && String(stat.dev)===id.dev && String(stat.ino)===id.ino;
const validId = id => !!id && /^\d+$/.test(id.dev) && /^[1-9]\d*$/.test(id.ino);
const samePath = (a,b) => path.relative(a,b)==='';
const sameVersion = (a,b) => idMatches(a,idOf(b)) && a.size===b.size && a.ctimeNs===b.ctimeNs && a.mtimeNs===b.mtimeNs;
const isHash = s => typeof s==='string' && sha256.test(s);
const isOperation = s => typeof s==='string' && operation.test(s);
const isGrant = s => typeof s==='string' && uuid.test(s);
const isRecord = v => v!==null && typeof v==='object' && !Array.isArray(v);
const isBackup = v => v===null || (isRecord(v) && [0,1].includes(v.slot) && isHash(v.hash));
const isReceipt = v => isRecord(v) && isOperation(v.operationId) && ['write','restore'].includes(v.kind) && isHash(v.previousHash) && isHash(v.hash);
const validFile = s => typeof s==='string' && !s.includes('\0') && path.isAbsolute(s) && /\.json$/i.test(path.basename(s)) && !(process.platform==='win32' && path.basename(s).includes(':'));
const stageName = (target,nonce) => '.quilvori-world-'+target+'-'+nonce+'.tmp';
const backupName = (target,slot) => target+'.previous-'+slot;

function checkRecord(value,target) {
  const p=value?.pending;
  if (!isRecord(value) || value.version!==1 || value.target!==target || !validFile(value.file) || !validId(value.directory)
      || !(value.receipt===null || isReceipt(value.receipt)) || !isBackup(value.backup)
      || !Array.isArray(value.recent) || !value.recent.every(isOperation)
      || !(p===null || (isRecord(p) && isGrant(p.nonce) && isReceipt(p.receipt) && isBackup(p.backup) && (p.stage===null || validId(p.stage))))) fail('recovery');
  return value;
}

function checkDocument(value) {
  // Use the same World Info validation as the comparison preview, including
  // native UID rules and the handling of older/third-party entry settings.
  require('../js/formats');
  require('../js/world-sync');
  try { return globalThis.TAWorldSync.validate(value); }
  catch { fail('invalid'); }
}

function parseDocument(bytes) {
  try { return checkDocument(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))); }
  catch { fail('invalid'); }
}

function encodeDocument(document,original) {
  checkDocument(document);
  const text=original.toString('utf8'), indent=text.match(/\n([ \t]+)"/)?.[1] || '';
  let body;
  try {
    body=JSON.stringify(document,null,indent);
    if (Buffer.byteLength(body)>MAX_BYTES) fail('too-large');
    if (!isDeepStrictEqual(document,JSON.parse(body))) fail('invalid');
  } catch(e) { if (codes.has(e.code)) throw e; fail('invalid'); }
  if (text.includes('\r\n')) body=body.replaceAll('\n','\r\n');
  if (text.startsWith('\uFEFF')) body='\uFEFF'+body;
  if (text.endsWith('\n')) body+=text.endsWith('\r\n')?'\r\n':'\n';
  if (Buffer.byteLength(body)>MAX_BYTES) fail('too-large');
  return Buffer.from(body,'utf8');
}

async function statAt(io,file) {
  try { return await io.lstat(file,{bigint:true}); }
  catch(e) { if (e.code==='ENOENT' || e.code==='ENOTDIR') return null; throw e; }
}

async function directory(io,dir,expected) {
  const stat=await statAt(io,dir);
  if (!stat) fail('missing');
  if (!stat.isDirectory() || stat.ino<=0n || !samePath(await io.realpath(dir),dir)) fail('unsafe');
  if (expected && !idMatches(stat,expected)) fail('changed');
  return idOf(stat);
}

function regular(stat) {
  if (!stat || !stat.isFile() || stat.ino<=0n || stat.nlink!==1n) fail('unsafe');
}

async function readFile(io,file,limit,missing) {
  const named=await statAt(io,file);
  if (!named) fail(missing);
  regular(named);
  if (!samePath(await io.realpath(file),file)) fail('unsafe');
  const handle=await io.open(file,constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const before=await handle.stat({bigint:true}); regular(before);
    if (!sameVersion(before,named)) fail('changed');
    if (before.size>BigInt(limit)) fail('too-large');
    const bytes=Buffer.alloc(Number(before.size));
    let offset=0;
    while (offset<bytes.length) {
      const {bytesRead}=await handle.read(bytes,offset,bytes.length-offset,offset);
      if (!bytesRead) fail('changed');
      offset+=bytesRead;
    }
    const after=await handle.stat({bigint:true}), end=await statAt(io,file);
    if (!end || !sameVersion(after,before) || !sameVersion(end,before) || end.nlink!==1n) fail('changed');
    return {bytes,stat:after,hash:digest(bytes)};
  } finally { await handle.close(); }
}

async function syncDirectory(io,dir) {
  // Windows does not expose directory fsync via Node. All file handles are synced before rename.
  if (process.platform==='win32') return;
  const handle=await io.open(dir,'r');
  try { await handle.sync(); }
  catch(e) { if (!['EINVAL','ENOTSUP','EOPNOTSUPP'].includes(e.code)) throw e; }
  finally { await handle.close(); }
}

async function removeOwned(io,file,id) {
  const stat=await statAt(io,file);
  if (stat && idMatches(stat,id) && stat.isFile() && stat.nlink===1n) await io.unlink(file);
}

async function privateWrite(io,file,bytes) {
  const dir=path.dirname(file), temporary=path.join(dir,'.'+randomUUID()+'.tmp');
  const handle=await io.open(temporary,'wx',0o600);
  let id;
  try {
    try {
      id=idOf(await handle.stat({bigint:true}));
      await handle.writeFile(bytes); await handle.sync();
    } finally { await handle.close(); }
    await io.rename(temporary,file);
    await syncDirectory(io,dir);
  } finally { await removeOwned(io,temporary,id); }
}

function createWorldSync(profile,io=fs) {
  const queueKey=process.platform==='win32' ? path.resolve(profile).toLowerCase() : path.resolve(profile);
  const seen=new Map();
  let root,checkedPrivateTemps=false;
  async function storage() {
    if (!root) root=path.join(await io.realpath(profile),'world-sync');
    try { await io.mkdir(root,{mode:0o700}); await syncDirectory(io,path.dirname(root)); }
    catch(e) { if (e.code!=='EEXIST') throw e; }
    await directory(io,root);
    if (!checkedPrivateTemps) {
      // A terminated metadata/backup save can leave its exclusive temp here.
      // This directory is private to one Electron profile and its serialized queue.
      for (const name of await io.readdir(root)) {
        if (!name.startsWith('.') || !name.endsWith('.tmp') || !isGrant(name.slice(1,-4))) continue;
        const file=path.join(root,name), stat=await statAt(io,file);
        if (stat?.isFile() && stat.nlink===1n) await removeOwned(io,file,idOf(stat));
      }
      checkedPrivateTemps=true;
    }
  }
  function serial(work) {
    // Electron has one owner for a userData profile. All its grants share this queue.
    const task=(queues.get(queueKey) || Promise.resolve()).catch(()=>{}).then(async()=>{
      await storage();
      return work();
    });
    queues.set(queueKey,task);
    return task.finally(()=>{if (queues.get(queueKey)===task) queues.delete(queueKey);});
  }
  const recordFile = target => path.join(root,target+'.json');
  const save = meta => privateWrite(io,recordFile(meta.target),JSON.stringify(meta));
  async function load(target) {
    if (!isGrant(target)) fail('unbound');
    const {bytes}=await readFile(io,recordFile(target),MAX_RECORD,'unbound');
    let value;
    try { value=JSON.parse(bytes.toString('utf8')); }
    catch { fail('recovery'); }
    return checkRecord(value,target);
  }
  async function current(meta) {
    await directory(io,path.dirname(meta.file),meta.directory);
    return readFile(io,meta.file,MAX_BYTES,'missing');
  }
  function complete(meta,pending) {
    return {...meta,receipt:pending.receipt,backup:pending.backup,pending:null,
      recent:[...meta.recent.slice(-63),pending.receipt.operationId]};
  }
  async function retireBackup(target,old,active) {
    if (!old || old.slot===active?.slot) return;
    // Receipt and active backup are already durable. A busy inactive slot can be
    // reclaimed by the next write; never turn a successful publication into a retry.
    try {
      const file=path.join(root,backupName(target,old.slot));
      const previous=await readFile(io,file,MAX_BYTES,'recovery');
      if (previous.hash===old.hash) await removeOwned(io,file,idOf(previous.stat));
    } catch { /* At most two fixed backup slots exist per binding. */ }
  }
  async function reconcile(meta,live) {
    const p=meta.pending;
    if (!p) return meta;
    const stage=path.join(path.dirname(meta.file),stageName(meta.target,p.nonce));
    await directory(io,path.dirname(meta.file),meta.directory);
    const staged=await statAt(io,stage);
    // A renamed stage has its recorded file identity at the destination. A subsequent
    // external atomic save can replace that inode while keeping the confirmed result.
    const published=idMatches(live.stat,p.stage) || (!!p.stage && !staged && live.hash===p.receipt.hash);
    const next=published ? complete(meta,p) : {...meta,pending:null};
    await removeOwned(io,stage,p.stage);
    await save(next);
    await retireBackup(meta.target,published ? meta.backup : p.backup,next.backup);
    return next;
  }
  function snapshot(meta,live) {
    const document=parseDocument(live.bytes);
    seen.set(meta.target,{hash:live.hash,id:idOf(live.stat)});
    return {target:meta.target,name:path.basename(meta.file),hash:live.hash,document,receipt:meta.receipt,
      canRestore:!!meta.backup && meta.receipt?.hash===live.hash};
  }
  async function open(target) {
    const grant=await load(target),live=await current(grant);
    return {meta:await reconcile(grant,live),live};
  }
  async function bind(picked) {
    if (!validFile(picked)) fail('invalid');
    const parent=await io.realpath(path.dirname(picked));
    const file=path.join(parent,path.basename(picked));
    const grant={version:1,target:randomUUID(),file,directory:await directory(io,parent),
      receipt:null,backup:null,pending:null,recent:[]};
    const live=await current(grant);
    parseDocument(live.bytes);
    for (const name of await io.readdir(root)) {
      if (!name.endsWith('.json') || !isGrant(name.slice(0,-5))) continue;
      let existing;
      try { existing=await load(name.slice(0,-5)); }
      catch(e) { if (e.code==='world-sync-recovery') continue; throw e; }
      if (samePath(existing.file,file) && isDeepStrictEqual(existing.directory,grant.directory)) {
        return snapshot(await reconcile(existing,live),live);
      }
    }
    await save(grant);
    return snapshot(grant,live);
  }
  async function storedBackup(target,backup) {
    const file=path.join(root,backupName(target,backup.slot));
    const stored=await readFile(io,file,MAX_BYTES,'recovery');
    if (stored.hash!==backup.hash) fail('recovery');
    parseDocument(stored.bytes);
    return stored.bytes;
  }
  async function change(target,expectedHash,document,operationId,kind) {
    if (!isHash(expectedHash) || !isOperation(operationId)) fail('invalid');
    const {meta,live}=await open(target);
    const original=parseDocument(live.bytes);
    if (meta.recent.includes(operationId)) {
      const old=meta.receipt;
      if (!old || old.operationId!==operationId || old.kind!==kind || old.previousHash!==expectedHash
          || old.hash!==live.hash || (kind==='write' && !isDeepStrictEqual(original,document))) fail('changed');
      return snapshot(meta,live);
    }
    const observed=seen.get(target);
    if (expectedHash!==live.hash || (observed?.hash===live.hash && !idMatches(live.stat,observed.id))) fail('changed');
    if (kind==='restore' && (!meta.backup || meta.receipt?.hash!==live.hash)) fail('no-backup');
    const bytes=kind==='restore' ? await storedBackup(target,meta.backup)
      : isDeepStrictEqual(document,original) ? live.bytes : encodeDocument(document,live.bytes);
    const receipt={operationId,kind,previousHash:live.hash,hash:digest(bytes)};
    const pending={receipt,nonce:randomUUID(),stage:null,backup:null};
    if (receipt.hash===live.hash) {
      pending.backup=meta.receipt?.hash===live.hash ? meta.backup : null;
      const latest=await current(meta);
      if (!sameVersion(latest.stat,live.stat) || latest.hash!==live.hash) fail('changed');
      const next=complete(meta,pending);
      await save(next);
      await retireBackup(target,meta.backup,next.backup);
      const verified=await current(meta);
      if (verified.hash!==receipt.hash) fail('changed');
      return snapshot(next,verified);
    }
    if (kind==='write') {
      pending.backup={slot:meta.backup?.slot===0 ? 1 : 0,hash:live.hash};
      const file=path.join(root,backupName(target,pending.backup.slot));
      await privateWrite(io,file,live.bytes);
      await storedBackup(target,pending.backup);
    }
    const dir=path.dirname(meta.file);
    const stage=path.join(dir,stageName(target,pending.nonce)), journal={...meta,pending};
    await save(journal);
    await directory(io,dir,meta.directory);
    const handle=await io.open(stage,'wx',0o600);
    try {
      try {
        pending.stage=idOf(await handle.stat({bigint:true}));
        await save(journal);
        await handle.writeFile(bytes);
        await handle.chmod(Number(live.stat.mode & 0o777n));
        await handle.sync();
      } finally { await handle.close(); }
      const ready=await readFile(io,stage,MAX_BYTES,'recovery');
      if (!idMatches(ready.stat,pending.stage) || ready.hash!==receipt.hash) fail('changed');
      const latest=await current(meta);
      if (!sameVersion(latest.stat,live.stat) || latest.hash!==live.hash) fail('changed');
      await io.rename(stage,meta.file);
      await syncDirectory(io,dir);
      const published=await current(meta);
      const next=complete(meta,pending);
      await save(next);
      await retireBackup(target,meta.backup,next.backup);
      if (published.hash!==receipt.hash) fail('changed');
      return snapshot(next,published);
    } finally {
      await directory(io,dir,meta.directory);
      await removeOwned(io,stage,pending.stage);
    }
  }
  return {
    bind: file=>serial(()=>bind(file)),
    read: target=>serial(async()=>{const {meta,live}=await open(target);return snapshot(meta,live);}),
    write: (target,hash,doc,id)=>serial(()=>change(target,hash,doc,id,'write')),
    restore: (target,hash,id)=>serial(()=>change(target,hash,null,id,'restore')),
  };
}

module.exports={createWorldSync,MAX_BYTES,publicError};
