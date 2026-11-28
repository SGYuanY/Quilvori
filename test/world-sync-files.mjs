import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

const require=createRequire(import.meta.url);
const modulePath=require.resolve('../electron/world-sync');
const {createWorldSync,MAX_BYTES}=require(modulePath);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sample=content=>({entries:{0:{uid:0,comment:'Tide',key:['port'],content,extensions:{harbor:{zone:3}}}},metadata:{edition:1}});
const initial=Buffer.from('\uFEFF'+JSON.stringify(sample('low tide'),null,'\t').replaceAll('\n','\r\n')+'\r\n');

async function fixture(t) {
  const parent=await fs.realpath(os.tmpdir());
  const temp=await fs.mkdtemp(path.join(parent,'quilvori-world-sync-'));
  t.after(async()=>{
    const safe=await fs.realpath(temp);
    assert.equal(path.dirname(safe),parent);
    assert.ok(path.basename(safe).startsWith('quilvori-world-sync-'));
    await fs.rm(safe,{recursive:true,force:true,maxRetries:4,retryDelay:80});
  });
  const profile=path.join(temp,'test-profile'),worlds=path.join(temp,'worlds');
  await fs.mkdir(profile); await fs.mkdir(worlds);
  const file=path.join(worlds,'海港.json');
  await fs.writeFile(file,initial);
  return {temp,profile,worlds,file,service:createWorldSync(profile)};
}

test('picking an exact file issues an opaque per-profile grant, reusable across restarts and concurrent picks',async t=>{
  const {profile,worlds,file,service}=await fixture(t);
  const [first,second]=await Promise.all([service.bind(file),createWorldSync(profile).bind(file)]);
  assert.equal(first.target,second.target);
  assert.equal(first.name,'海港.json'); assert.equal(first.hash,hash(initial));
  assert.deepEqual(first.document,sample('low tide')); assert.equal(first.receipt,null);assert.equal(first.canRestore,false);
  assert.ok(!JSON.stringify(first).includes(worlds));
  assert.deepEqual(await createWorldSync(profile).read(first.target),first);
  await assert.rejects(service.read(file),{code:'world-sync-unbound'});
  const other=path.join(worlds,'other.json');await fs.writeFile(other,initial);
  assert.notEqual((await service.bind(other)).target,first.target);
});

test('a confirmed write and its retry preserve native fields and formatting; restore returns the exact previous bytes',async t=>{
  const {profile,worlds,file,service}=await fixture(t), bound=await service.bind(file);
  const next=await service.write(bound.target,bound.hash,sample('high tide'),'op1');
  assert.equal(next.canRestore,true); assert.equal(next.receipt.previousHash,bound.hash);assert.equal(next.receipt.hash,next.hash);
  assert.equal(next.receipt.kind,'write'); assert.equal(next.receipt.operationId,'op1');
  const after=await fs.readFile(file);
  assert.ok(after.toString('utf8').startsWith('\uFEFF{\r\n\t'));assert.ok(after.toString('utf8').endsWith('\r\n'));
  assert.equal(next.hash,hash(after));
  const reopened=createWorldSync(profile);
  assert.deepEqual(await reopened.write(bound.target,bound.hash,sample('high tide'),'op1'),next);
  await assert.rejects(reopened.write(bound.target,bound.hash,sample('different'),'op1'),{code:'world-sync-changed'});
  const noop=await reopened.write(bound.target,next.hash,next.document,'op2');
  assert.equal(noop.hash,next.hash); assert.equal(noop.canRestore,true);
  const restored=await reopened.restore(bound.target,noop.hash,'undo1');
  assert.equal(restored.hash,bound.hash);assert.equal(restored.canRestore,false);assert.equal(restored.receipt.kind,'restore');
  assert.deepEqual(await fs.readFile(file),initial);
  assert.deepEqual(await reopened.restore(bound.target,noop.hash,'undo1'),restored);
  await assert.rejects(reopened.restore(bound.target,restored.hash,'undo2'),{code:'world-sync-no-backup'});
  await assert.rejects(reopened.write(bound.target,bound.hash,sample('high tide'),'op1'),{code:'world-sync-changed'});
  assert.deepEqual(await fs.readdir(worlds),[path.basename(file)]);
});

test('a later successful write replaces the undo baseline; a failed write leaves the prior undo available',async t=>{
  const {profile,file,service}=await fixture(t),start=await service.bind(file);
  const first=await service.write(start.target,start.hash,sample('first'),'one');
  const firstBytes=await fs.readFile(file);
  const failure=createWorldSync(profile,{...fs,rename:async(from,to)=>{
    if(to===file)throw Object.assign(new Error('Synthetic I/O failure'),{code:'EIO'});
    return fs.rename(from,to);
  }});
  await assert.rejects(failure.write(start.target,first.hash,sample('second'),'two'),{code:'EIO'});
  assert.deepEqual(await fs.readFile(file),firstBytes);assert.deepEqual(await service.read(start.target),first);
  const second=await service.write(start.target,first.hash,sample('second'),'two');
  await service.restore(start.target,second.hash,'undo');
  assert.deepEqual(await fs.readFile(file),firstBytes);
});

test('stale previews, concurrent writes and a file changed during staging never replace the newer edit',async t=>{
  const {profile,file,service}=await fixture(t),bound=await service.bind(file);
  const one=sample('one'),two=sample('two');
  const results=await Promise.allSettled([service.write(bound.target,bound.hash,one,'one'),service.write(bound.target,bound.hash,two,'two')]);
  assert.equal(results[0].status,'fulfilled');assert.equal(results[1].reason?.code,'world-sync-changed');
  const before=results[0].value;
  await fs.writeFile(file,JSON.stringify(two));
  await assert.rejects(service.restore(bound.target,before.hash,'restore'),{code:'world-sync-changed'});
  const newer=await service.read(bound.target);assert.equal(newer.canRestore,false);
  await assert.rejects(service.restore(bound.target,newer.hash,'restore'),{code:'world-sync-no-backup'});
  const foreign=JSON.stringify(sample('external edit in the middle'));
  let changed=false;
  const editing=createWorldSync(profile,{...fs,open:async(target,...args)=>{
    const h=await fs.open(target,...args);
    if(!changed && path.dirname(target)===path.dirname(file) && args[0]==='wx'){
      const sync=h.sync.bind(h);h.sync=async()=>{await sync();changed=true;await fs.writeFile(file,foreign);};
    }
    return h;
  }});
  await assert.rejects(editing.write(bound.target,newer.hash,one,'three'),{code:'world-sync-changed'});
  assert.equal(await fs.readFile(file,'utf8'),foreign);
  assert.equal((await service.read(bound.target)).receipt.operationId,'one');
});

test('a same-byte replacement requires a fresh preview; a subsequent external save remains intact',async t=>{
  const {profile,worlds,file,service}=await fixture(t),first=await service.bind(file);
  const replacement=path.join(worlds,'from-editor.tmp');
  await fs.writeFile(replacement,initial);await fs.rename(replacement,file);
  await assert.rejects(service.write(first.target,first.hash,sample('first edition'),'same-bytes'),{code:'world-sync-changed'});
  const preview=await service.read(first.target);assert.equal(preview.hash,first.hash);
  const wrote=await service.write(first.target,preview.hash,sample('first edition'),'same-bytes');
  const external=JSON.stringify(sample('edited after publication'));
  const editor=createWorldSync(profile,{...fs,rename:async(from,to)=>{
    await fs.rename(from,to);
    if (to===file) await fs.writeFile(file,external);
  }});
  await assert.rejects(editor.write(first.target,wrote.hash,sample('our second edition'),'second'),{code:'world-sync-changed'});
  const actual=await service.read(first.target);
  assert.equal(actual.hash,hash(external));assert.notEqual(actual.hash,actual.receipt.hash);
  assert.equal(actual.canRestore,false);assert.equal(await fs.readFile(file,'utf8'),external);
});

test('invalid data, oversize files, aliases and multiply linked files are rejected while preserving the source',async t=>{
  const {temp,profile,worlds,file,service}=await fixture(t),bound=await service.bind(file);
  const bad=path.join(worlds,'invalid.json');
  for(const text of ['{','{}','{"entries":[]}','{"entries":{"2":{"uid":1}}}']){
    await fs.writeFile(bad,text);
    await assert.rejects(service.bind(bad),{code:'world-sync-invalid'});
  }
  await fs.truncate(bad,MAX_BYTES+1);
  await assert.rejects(service.bind(bad),{code:'world-sync-too-large'});
  const sibling=path.join(temp,'linked.json');
  await fs.link(file,sibling);
  await assert.rejects(service.read(bound.target),{code:'world-sync-unsafe'});
  await assert.rejects(service.write(bound.target,bound.hash,sample('rejected'),'links'),{code:'world-sync-unsafe'});
  assert.deepEqual(await fs.readFile(sibling),initial);
  await fs.unlink(sibling);
  await fs.writeFile(bad,JSON.stringify(sample('replacement with equal bytes')));
  const moved=path.join(temp,'original-worlds');
  await fs.rename(worlds,moved);await fs.mkdir(worlds);await fs.writeFile(file,initial);
  await assert.rejects(service.write(bound.target,bound.hash,sample('rejected'),'dir'),{code:'world-sync-changed'});
  const newGrant=await createWorldSync(profile).bind(file);assert.notEqual(newGrant.target,bound.target);
  assert.deepEqual(await fs.readFile(file),initial);
});

test('a damaged backup is reported before touching the world file',async t=>{
  const {profile,file,service}=await fixture(t),a=await service.bind(file);
  const b=await service.write(a.target,a.hash,sample('keep'),'first');
  const stateDir=path.join(profile,'world-sync'),backup=(await fs.readdir(stateDir)).find(p=>p.includes('.previous-'));
  await fs.writeFile(path.join(stateDir,backup),'{}');
  await assert.rejects(service.restore(a.target,b.hash,'restore'),{code:'world-sync-recovery'});
  assert.deepEqual(JSON.parse((await fs.readFile(file,'utf8')).replace(/^\uFEFF/,'')),sample('keep'));
});

function stopDuringRename(kind,when,profile,file,target,expected) {
  const script=`
      const fs=require('node:fs/promises');
      const [mod,profile,file,when,target,expected,document,kind]=process.argv.slice(1);
      const service=require(mod).createWorldSync(profile,{...fs,rename:async(from,to)=>{
        if(to===file && when==='before')process.exit(73);
        await fs.rename(from,to);
        if(to===file && when==='after')process.exit(73);
      }});
      const pending = kind==='write'?service.write(target,expected,JSON.parse(document),'interrupted'):service.restore(target,expected,'interrupted');
      pending.catch(e=>{console.error(e);process.exitCode=2;});
    `;
  const result=spawnSync(process.execPath,['-e',script,modulePath,profile,file,when,target,expected,JSON.stringify(sample('published')),kind],{encoding:'utf8',timeout:15000});
  assert.equal(result.status,73,result.stderr);
}

for(const when of ['before','after']){
  test('restart recovers an actual process exit '+when+' atomic publication and retries once',async t=>{
    const {profile,worlds,file,service}=await fixture(t), a=await service.bind(file);
    stopDuringRename('write',when,profile,file,a.target,a.hash);
    const restarted=createWorldSync(profile),found=await restarted.read(a.target);
    assert.equal(found.document.entries[0].content,when==='before'?'low tide':'published');
    assert.equal(found.receipt?.operationId,when==='before'?undefined:'interrupted');
    assert.deepEqual(await fs.readdir(worlds),[path.basename(file)]);
    const published=await restarted.write(a.target,a.hash,sample('published'),'interrupted');
    assert.equal(published.receipt.operationId,'interrupted');assert.equal(published.canRestore,true);
    await restarted.restore(a.target,published.hash,'undo');
    assert.deepEqual(await fs.readFile(file),initial);
  });
  test('restart reconciles an interrupted byte-for-byte restore '+when+' replacement',async t=>{
    const {profile,worlds,file,service}=await fixture(t), a=await service.bind(file);
    const b=await service.write(a.target,a.hash,sample('published'),'first');
    stopDuringRename('restore',when,profile,file,a.target,b.hash);
    const restarted=createWorldSync(profile),found=await restarted.read(a.target);
    assert.equal(found.receipt.kind,when==='before'?'write':'restore');
    assert.equal(found.canRestore,when==='before');
    const restored=await restarted.restore(a.target,b.hash,'interrupted');
    assert.equal(restored.hash,a.hash);assert.equal(restored.canRestore,false);
    assert.deepEqual(await fs.readdir(worlds),[path.basename(file)]);assert.deepEqual(await fs.readFile(file),initial);
  });
}
