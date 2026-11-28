import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import cardFiles from '../electron/card-sync.js';
import worldFiles from '../electron/world-sync.js';
import '../js/png.js';

const {createCardSync,MAX_BYTES}=cardFiles;
const {createWorldSync}=worldFiles;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
function sample(description,spec='v2') {
  return {spec:'chara_card_'+spec,spec_version:spec==='v3'?'3.0':'2.0',data:{
    name:'Harbor guide',description,personality:'Attentive',scenario:'A lighthouse',first_mes:'Good morning.',
    mes_example:'',creator_notes:'',system_prompt:'',post_history_instructions:'',alternate_greetings:[],
    tags:[],creator:'Fixture',character_version:'1',extensions:{fixture:{harbor:3}},
  }};
}
function bytes(ext,description) {
  if(ext==='json')return Buffer.from('\uFEFF'+JSON.stringify(sample(description),null,'\t').replaceAll('\n','\r\n')+'\r\n');
  return Buffer.from(TAPng.writeCardVariants(pixel,{chara:sample(description),ccv3:sample(description,'v3')},null));
}

// A second process terminates at the publication boundary. Its finally blocks cannot clean up.
if(process.argv[2]==='interrupt'){
  const [, , ,profile,file,when,kind,target,expected]=process.argv;
  const child=createCardSync(profile,{...fs,async rename(from,to){
    if(to===file && when==='before')process.exit(73);
    await fs.rename(from,to);
    if(to===file && when==='after')process.exit(73);
  }});
  if(kind==='write')await child.write(target,expected,bytes('png','new edition'),'interrupted');
  else await child.restore(target,expected,'interrupted');
  throw Error('The synthetic interruption did not reach the selected file.');
}

async function fixture(t,ext='png') {
  const parent=await fs.realpath(os.tmpdir()),root=await fs.mkdtemp(path.join(parent,'quilvori-card-sync-'));
  t.after(async()=>{
    const resolved=await fs.realpath(root);
    assert.equal(path.dirname(resolved),parent);assert.ok(path.basename(resolved).startsWith('quilvori-card-sync-'));
    await fs.rm(resolved,{recursive:true,force:true,maxRetries:4,retryDelay:80});
  });
  const profile=path.join(root,'test-profile'),cards=path.join(root,'characters');
  await fs.mkdir(profile);await fs.mkdir(cards);
  const file=path.join(cards,'海港.'+ext),sibling=path.join(cards,'Another slot.'+ext);
  const original=bytes(ext,'original edition'),other=bytes(ext,'another card with the same name');
  const chatDir=path.join(root,'chats','海港');
  await fs.mkdir(chatDir,{recursive:true});
  const chat=path.join(chatDir,'existing.jsonl'),messages='{"chat_metadata":{}}\n{"name":"Harbor guide","mes":"Hello"}\n';
  await fs.writeFile(file,original);await fs.writeFile(sibling,other);await fs.writeFile(chat,messages);
  async function unchanged(){
    assert.deepEqual(await fs.readdir(cards).then(names=>names.sort()),[path.basename(file),path.basename(sibling)].sort());
    assert.deepEqual(await fs.readFile(sibling),other);assert.equal(await fs.readFile(chat,'utf8'),messages);
  }
  return {root,profile,file,sibling,original,service:createCardSync(profile),unchanged};
}

for(const ext of ['png','json']){
  test(ext+' reads, idempotent writes, exact previous bytes and restart keep the original slot and chat',async t=>{
    const {profile,file,original,service,unchanged}=await fixture(t,ext);
    const bound=await service.bind(file);
    assert.equal(bound.name,'海港.'+ext);assert.equal(bound.hash,hash(original));assert.equal(bound.canRestore,false);
    assert.ok(bound.bytes instanceof Uint8Array);assert.deepEqual(Buffer.from(bound.bytes),original);
    const replacement=bytes(ext,'new edition'),writable=new Uint8Array(replacement);
    const writing=service.write(bound.target,bound.hash,writable,'one');writable.fill(0);
    const result=await writing;
    assert.equal(result.receipt.operationId,'one');assert.equal(result.canRestore,true);
    assert.deepEqual(await fs.readFile(file),replacement);
    if(ext==='png')assert.deepEqual(Object.keys(TAPng.cardVariants(result.bytes)).sort(),['ccv3','chara']);
    const reopened=createCardSync(profile);
    assert.deepEqual(await reopened.write(bound.target,bound.hash,replacement,'one'),result);
    const noop=await reopened.write(bound.target,result.hash,replacement,'unchanged');assert.equal(noop.canRestore,true);
    const restored=await reopened.restore(bound.target,noop.hash,'undo');
    assert.equal(restored.canRestore,false);assert.deepEqual(await fs.readFile(file),original);
    assert.deepEqual(await reopened.restore(bound.target,noop.hash,'undo'),restored);
    await assert.rejects(reopened.restore(bound.target,restored.hash,'again'),{code:'card-sync-no-backup'});
    await unchanged();
  });
}

test('file choice, profile and object kind delimit a durable card grant',async t=>{
  const {profile,root,file,original,service,unchanged}=await fixture(t);
  const shared=await Promise.all([service.bind(file),createCardSync(profile).bind(file)]);
  assert.equal(shared[0].target,shared[1].target);
  const elsewhere=path.join(root,'another folder');await fs.mkdir(elsewhere);
  const sameName=path.join(elsewhere,path.basename(file));await fs.writeFile(sameName,original);
  const other=await service.bind(sameName);assert.notEqual(other.target,shared[0].target);
  const otherProfile=path.join(root,'another profile');await fs.mkdir(otherProfile);
  await assert.rejects(createCardSync(otherProfile).read(shared[0].target),{code:'card-sync-unbound'});
  const worlds=createWorldSync(profile),world=path.join(root,'file.json');await fs.writeFile(world,'{"entries":{}}');
  const book=await worlds.bind(world);
  await assert.rejects(service.read(book.target),{code:'card-sync-unbound'});
  await assert.rejects(worlds.read(shared[0].target),{code:'world-sync-unbound'});
  await assert.rejects(service.read(file),{code:'card-sync-unbound'});
  await unchanged();
});

test('stale or concurrent card changes and broken input preserve the most recent file',async t=>{
  const {profile,file,original,service,unchanged}=await fixture(t);
  const a=await service.bind(file),edition=bytes('png','first edition');
  const [first,second]=await Promise.allSettled([
    service.write(a.target,a.hash,edition,'first'),service.write(a.target,a.hash,bytes('png','second edition'),'second'),
  ]);
  assert.equal(first.status,'fulfilled');assert.equal(second.reason.code,'card-sync-changed');
  const external=bytes('png','another editor');await fs.writeFile(file,external);
  await assert.rejects(service.restore(a.target,first.value.hash,'outdated'),{code:'card-sync-changed'});
  const preview=await service.read(a.target);
  for(const invalid of [Buffer.from('{"not":"a PNG"}'),pixel,new Uint16Array([1]),new Uint8Array()]){
    await assert.rejects(service.write(a.target,preview.hash,invalid,'invalid'),{code:'card-sync-invalid'});
  }
  await assert.rejects(service.write(a.target,preview.hash,new Uint8Array(MAX_BYTES+1),'oversize'),{code:'card-sync-too-large'});
  const oversize=path.join(profile,'large.png');
  await fs.writeFile(oversize,'');await fs.truncate(oversize,MAX_BYTES+1);
  await assert.rejects(service.bind(oversize),{code:'card-sync-too-large'});
  const world=path.join(profile,'world.json');await fs.writeFile(world,'{"entries":{}}');
  await assert.rejects(service.bind(world),{code:'card-sync-invalid'});
  assert.deepEqual(await fs.readFile(file),external);assert.notDeepEqual(external,original);
  await unchanged();
});

for(const kind of ['write','restore']){
  for(const when of ['before','after']){
    test('restart reconciles a PNG '+kind+' interrupted '+when+' file replacement',async t=>{
      const {profile,file,original,service,unchanged}=await fixture(t),a=await service.bind(file);
      const edited=bytes('png','new edition');
      const before=kind==='write'?a:await service.write(a.target,a.hash,edited,'first');
      const result=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'interrupt',profile,file,when,kind,a.target,before.hash],{
        encoding:'utf8',timeout:15000,windowsHide:true,
      });
      assert.equal(result.status,73,result.stderr);
      const reopened=createCardSync(profile),recovered=await reopened.read(a.target);
      const isEdited=(kind==='write')===(when==='after');
      assert.deepEqual(Buffer.from(recovered.bytes),isEdited?edited:original);
      assert.equal(recovered.canRestore,isEdited);
      if(kind==='write'){
        const retry=await reopened.write(a.target,a.hash,edited,'interrupted');
        assert.equal(retry.receipt.operationId,'interrupted');
        await reopened.restore(a.target,retry.hash,'undo');
      }else await reopened.restore(a.target,before.hash,'interrupted');
      assert.deepEqual(await fs.readFile(file),original);await unchanged();
    });
  }
}
