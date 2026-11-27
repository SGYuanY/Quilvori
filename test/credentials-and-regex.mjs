import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const source = name => readFileSync(new URL('../js/'+name+'.js',import.meta.url),'utf8');
const realCodec=vm.createContext({});vm.runInContext(source('model-credentials'),realCodec);
const codec = () => {
  const vault=new Map(),slots=new Map();let head={index:0,revision:null};
  return {
    malformedEnvelope:realCodec.TAModelKeyCodec.malformedEnvelope,
    slots,
    async registryState(legacy){return {...head,raw:head.index?slots.get(head.index):legacy().raw};},
    async publishRegistry(expected,index,data,revision,check,write,_rollback,cancel){
      if(head.revision!==expected.revision || head.index!==expected.index || (head.index && slots.get(head.index)!==expected.raw))throw Error('credential-stale');
      if(cancel?.())return false;
      if(!head.index)check();
      if(index)slots.set(index,data);else write(data);
      head={index,revision};return true;
    },
    async seal(id,key) { const token=webcrypto.randomUUID();vault.set(token,{id,key});return token; },
    async open(id,token) { const row=vault.get(token);if(!row || row.id!==id)throw Error('locked');return row.key; },
  };
};
function store(raw) {
  const map=new Map(raw==null?[]:[['nijan-model',raw]]);
  return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),entries:()=>Array.from(map)};
}
function model(localStorage,provider,extra={}) {
  const ctx=vm.createContext({localStorage,TAModelKeyCodec:provider,crypto:webcrypto,structuredClone,Event,AbortController,setTimeout,clearTimeout,...extra});
  vm.runInContext(source('model'),ctx);
  return ctx.NIJANModel;
}
test('both legacy layouts migrate after a verified round trip, with keys still scoped to their original profiles',async()=>{
  const provider=codec(), primary='synthetic-first-key', secondary='synthetic-second-key';
  for(const legacy of [{model:'Old writer',key:primary}, {active:'writer',key:primary,profiles:[
    {id:'writer',name:'Writer',config:{model:'Old writer',key:primary}},
    {id:'review',name:'Reviewer',config:{key:secondary}}]}]){
    const disk=store(JSON.stringify(legacy)), api=model(disk,provider);
    await api.ready;
    assert.equal(api.load().key,primary);
    if(legacy.profiles){api.selectProfile('review');assert.equal(api.load().key,secondary);}
    api.save({temperature:.4});await api.flushCredentials();
    const raw=disk.getItem('nijan-model');
    assert.ok(!raw.includes(primary) && !raw.includes(secondary));
    const reopened=model(disk,provider);await reopened.ready;
    assert.equal(reopened.load().key,legacy.profiles?secondary:primary);
    assert.equal(reopened.load().temperature,.4);
    reopened.save({key:''});await reopened.flushCredentials();
    const cleared=model(disk,provider);await cleared.ready;assert.equal(cleared.load().key,'');
    if(legacy.profiles){cleared.selectProfile('writer');assert.equal(cleared.load().key,primary);}
  }
});
test('a failed unlock or failed verification leaves the original bytes until a successful retry',async()=>{
  const raw=JSON.stringify({baseUrl:'https://example.invalid',model:'Fixture',key:'fixture-only-migration'});
  const disk=store(raw), provider=codec(), read=provider.open;
  provider.open=async()=>{throw Error('temporarily locked');};
  const api=model(disk,provider);await api.ready;
  assert.equal(disk.getItem('nijan-model'),raw);assert.equal(api.credentialStatus().locked,true);assert.equal(api.credentialStatus().recoverable,false);
  await assert.rejects(api.rebuildCredentials(api.credentialStatus().recoveryToken));
  assert.throws(()=>api.save({key:''}));assert.equal(disk.getItem('nijan-model'),raw);
  provider.open=read;await api.retryCredentials();
  assert.equal(api.load().key,'fixture-only-migration');assert.ok(!disk.getItem('nijan-model').includes('fixture-only-migration'));
});
test('only malformed known connection data offers a rebuild and leaves the original untouched until confirmation',async()=>{
  const profile={id:'p',name:'Primary',config:{},models:[]};
  for(const raw of ['', '{bad', 'null','false','[]','"scalar"',JSON.stringify({format:2,profiles:[]}),
    JSON.stringify({profiles:[null]}),JSON.stringify({profiles:[profile,profile]}),JSON.stringify({profiles:[{...profile,config:[]}]}),
    JSON.stringify({format:2,active:'other',profiles:[profile]}),JSON.stringify({profiles:[{...profile,sealedKey:{data:'x'}}]}),
    JSON.stringify({profiles:[{...profile,models:{id:'x'}}]}),JSON.stringify({profiles:[{...profile,models:[{id:'m',efforts:[{}]}]}]}),
    JSON.stringify({profiles:[{...profile,key:'misplaced legacy fixture'}]}),JSON.stringify({model:[]}),
    ...[[],{},true,false,0,-1].map(format=>JSON.stringify({format,model:'test'}))]){
    const disk=store(raw),api=model(disk,codec());await api.ready;
    const status=api.credentialStatus();assert.equal(status.locked,true);assert.equal(status.recoverable,true);
    assert.ok(status.recoveryToken!=null);assert.throws(()=>api.save({model:'overwrite'}));
    await assert.rejects(api.rebuildCredentials(null));assert.deepEqual(disk.entries(),[['nijan-model',raw]]);
  }
  for(const version of [34,'v5.1',1]){
    const future=JSON.stringify({format:version,profiles:[]}),disk=store(future),api=model(disk,codec());await api.ready;
    assert.equal(api.credentialStatus().locked,true);assert.equal(api.credentialStatus().recoverable,false);
    await assert.rejects(api.rebuildCredentials(api.credentialStatus().recoveryToken));assert.deepEqual(disk.entries(),[['nijan-model',future]]);
  }
});
test('an explicitly null legacy format migrates in place just like an absent marker',async()=>{
  const key='test-only-null-format';
  for(const before of [{format:null},{format:null,baseUrl:'https://fixture.invalid',model:'Author',key},
    {format:null,active:'p',profiles:[{id:'p',name:'Author',config:{model:'Author',key}}]}]){
    const disk=store(JSON.stringify(before)),provider=codec(),api=model(disk,provider);await api.ready;
    assert.equal(api.credentialStatus().locked,false);assert.equal(api.credentialStatus().recoverable,false);
    assert.equal(api.load().key,before.key || before.profiles?.[0].config.key || '');
    assert.equal(JSON.parse(disk.getItem('nijan-model')).format,2);assert.equal(disk.getItem('nijan-model.recovery.1'),null);
    assert.ok(!disk.getItem('nijan-model').includes(key));
    const reopened=model(disk,provider);await reopened.ready;assert.equal(reopened.load().key,api.load().key);
  }
});
test('confirmed recovery retains each original in place, protects new keys, and reopens the latest saved profiles',async()=>{
  const oldKey='fixture-only-legacy-material',newKey='fixture-only-new-material',old='{ "key": "'+oldKey+'", broken';
  const disk=store(old),provider=codec();
  disk.setItem('library-sentinel','unchanged library');
  const api=model(disk,provider);await api.ready;
  await api.rebuildCredentials(api.credentialStatus().recoveryToken);
  assert.equal(api.credentialStatus().locked,false);assert.equal(api.load().key,'');assert.equal(api.load().baseUrl,'');
  api.newProfile('Recovered connection');api.save({baseUrl:'https://fixture.invalid',model:'writer',key:newKey});
  await api.flushCredentials();
  assert.equal(JSON.parse(provider.slots.get(1)).format,2);
  assert.equal(disk.getItem('nijan-model'),old);
  assert.deepEqual(disk.entries().filter(([,value])=>value.includes(oldKey)).map(([key])=>key),['nijan-model']);
  assert.ok(disk.entries().every(([,value])=>!value.includes(newKey)));
  assert.ok(!JSON.stringify(api.credentialStatus()).includes(oldKey));
  const next=model(disk,provider);await next.ready;assert.equal(next.load().key,newKey);assert.equal(next.load().model,'writer');
  const damagedAgain='{bad second registry';provider.slots.set(1,damagedAgain);
  const last=model(disk,provider);await last.ready;await last.rebuildCredentials(last.credentialStatus().recoveryToken);
  last.save({model:'third'});await last.flushCredentials();
  assert.equal(disk.getItem('nijan-model'),old);assert.equal(provider.slots.get(1),damagedAgain);
  const third=model(disk,provider);await third.ready;assert.equal(third.load().model,'third');
  assert.equal(disk.getItem('library-sentinel'),'unchanged library');
});
test('a temporarily unreadable sealed registry and unavailable storage offer retry without rebuilding',async()=>{
  const disk=store(),provider=codec(),initial=model(disk,provider);await initial.ready;
  initial.save({model:'Author',key:'synthetic-unlock'});await initial.flushCredentials();
  const raw=disk.getItem('nijan-model'),open=provider.open;
  provider.open=async()=>{throw Error('Private platform error synthetic-unlock');};
  const api=model(disk,provider);await api.ready;
  assert.equal(api.credentialStatus().recoverable,false);assert.ok(!api.credentialStatus().issue.includes('synthetic-unlock'));
  await assert.rejects(api.rebuildCredentials(api.credentialStatus().recoveryToken));assert.deepEqual(disk.entries(),[['nijan-model',raw]]);
  provider.open=open;await api.retryCredentials();assert.equal(api.load().key,'synthetic-unlock');
  const read=disk.getItem;disk.getItem=()=>{throw Error('read denied');};
  const blocked=model(disk,provider);await blocked.ready;assert.equal(blocked.credentialStatus().recoverable,false);
  disk.getItem=read;await blocked.retryCredentials();assert.equal(blocked.load().key,'synthetic-unlock');
});
test('failure and stale recovery confirmations preserve the live slot and concurrent recovery creates a single winner',async()=>{
  const raw='broken A',disk=store(raw),provider=codec(),first=model(disk,provider),other=model(disk,provider);
  await Promise.all([first.ready,other.ready]);
  const oldTicket=first.credentialStatus().recoveryToken,write=disk.setItem;
  disk.setItem=(key,value)=>{if(key.includes('.recovery.'))throw Error('write denied');return write(key,value);};
  await assert.rejects(first.rebuildCredentials(oldTicket));assert.deepEqual(disk.entries(),[['nijan-model',raw]]);
  disk.setItem=write;disk.setItem('nijan-model','broken B');await assert.rejects(first.rebuildCredentials(oldTicket));
  assert.deepEqual(disk.entries(),[['nijan-model','broken B']]);
  await assert.rejects(first.retryCredentials());
  await assert.rejects(first.rebuildCredentials(oldTicket));await assert.rejects(other.retryCredentials());
  const attempts=await Promise.allSettled([first,other].map(api=>api.rebuildCredentials(api.credentialStatus().recoveryToken)));
  assert.deepEqual(attempts.map(x=>x.status).sort(),['fulfilled','rejected']);
  assert.deepEqual(disk.entries().map(([key])=>key),['nijan-model','nijan-model.recovery.1']);
  assert.equal(disk.getItem('nijan-model'),'broken B');
  const loser=attempts[0].status==='rejected'?first:other;await loser.retryCredentials();
  assert.equal(loser.credentialStatus().locked,false);loser.save({model:'after conflict'});await loser.flushCredentials();
  assert.equal(JSON.parse(provider.slots.get(1)).model,'after conflict');
});
test('broken known envelope syntax is recoverable, while well-formed encrypted values and unknown envelopes remain retryable',async()=>{
  const good='web1.AAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAA==';
  for(const [sealedKey,damaged] of [['web1.incomplete',true],['os1.?',true],[good,false],['os1.YWJj',false],['future.new',false]]){
    const raw=JSON.stringify({format:2,active:'p',profiles:[{id:'p',name:'P',config:{},sealedKey}]}),disk=store(raw),provider=codec();
    let attempts=0;provider.open=async()=>{attempts++;throw Error('temporarily unavailable');};
    const api=model(disk,provider);await api.ready;
    assert.equal(api.credentialStatus().recoverable,damaged);assert.equal(attempts,damaged?0:1);
    assert.equal(disk.getItem('nijan-model'),raw);
  }
});
test('a standalone consumer without the codec cannot overwrite a damaged original or a recovered registry',async()=>{
  const raw=JSON.stringify({profiles:[]}),disk=store(raw);
  const standalone=model(disk);assert.throws(()=>standalone.save({model:'discarded'}));
  assert.deepEqual(disk.entries(),[['nijan-model',raw]]);
  const secured=model(disk,codec());await secured.ready;await secured.rebuildCredentials(secured.credentialStatus().recoveryToken);
  const before=disk.entries(),other=model(disk);
  assert.throws(()=>other.newProfile('Discarded'));assert.deepEqual(disk.entries(),before);
  const legacyCodec=codec();delete legacyCodec.publishRegistry;delete legacyCodec.registryState;
  const mixed=model(disk,legacyCodec);await mixed.ready;
  assert.equal(mixed.credentialStatus().locked,true);assert.equal(mixed.credentialStatus().recoverable,false);
  assert.throws(()=>mixed.save({model:'Discarded'}));assert.deepEqual(disk.entries(),before);
});
test('startup, retry and external changes notify listeners after unlocking completes, including synchronous adapters',async()=>{
  const disk=store('{broken'),provider=codec(),states=[];
  let api,storageEvent;
  const normal=provider.registryState;provider.registryState=legacy=>({...legacy(),revision:null});
  api=model(disk,provider,{addEventListener:(type,fn)=>{if(type==='storage')storageEvent=fn;},
    dispatchEvent:e=>{if(e.type==='quilvori-credential-status')states.push(api.credentialStatus().opening);}});
  await api.ready;assert.deepEqual(states,[false]);
  disk.setItem('nijan-model','{}');await api.retryCredentials();assert.deepEqual(states,[false,false]);
  provider.registryState=normal;storageEvent({key:'nijan-model'});await api.ready;
  assert.deepEqual(states,[false,false,true,false]);
});
test('overlapping writes and a second window cannot publish a stale key',async()=>{
  const disk=store(),provider=codec(),first=model(disk,provider),other=model(disk,provider);
  await Promise.all([first.ready,other.ready]);
  first.save({key:'fixture-discarded'});first.save({key:'fixture-current'});await first.flushCredentials();
  const published=disk.getItem('nijan-model');
  other.save({key:'fixture-stale'});await assert.rejects(other.flushCredentials());assert.equal(disk.getItem('nijan-model'),published);
  await other.retryCredentials();assert.equal(other.load().key,'fixture-current');
  assert.ok(!published.includes('fixture-'));
});
test('desktop key envelopes require a real keystore and the matching profile',async()=>{
  const require=createRequire(import.meta.url);
  const {credentialVault}=require('../electron/model-credentials');
  const mock={isAsyncEncryptionAvailable:async()=>true,encryptStringAsync:async value=>Buffer.from(value),decryptStringAsync:async data=>({result:data.toString()})};
  const vault=credentialVault(mock,'win32'),sealed=await vault.seal('a','fixture');
  assert.equal(await vault.open('a',sealed),'fixture');
  await assert.rejects(vault.open('b',sealed));
  await assert.rejects(credentialVault({...mock,getSelectedStorageBackend:()=> 'basic_text'},'linux').seal('a','fixture'));
  await assert.rejects(credentialVault({...mock,isAsyncEncryptionAvailable:async()=>false},'darwin').seal('a','fixture'));
});
test('switching profiles sharing one endpoint and key keeps a late model list out of the other profile',async()=>{
  let reply,started;
  const requested=new Promise(resolve=>{started=resolve;});
  const api=model(store(),codec(),{fetch:async()=>{started();return new Promise(resolve=>{reply=resolve;});}});
  await api.ready;
  const settings={baseUrl:'https://example.invalid',key:'fixture-private'};
  api.save(settings);api.newProfile('Checking');api.save(settings);
  const other=api.profiles().find(row=>row.active).id;
  api.selectProfile('default');await api.flushCredentials();
  const request=api.listModels();await requested;
  api.selectProfile(other);
  reply({ok:true,json:async()=>({data:[{id:'stale-model'}]})});
  await assert.rejects(request,/配置已变化/);
  assert.deepEqual(Array.from(api.rememberedModels()),[]);
});
test('single, zero-length and capped global previews correspond to the replacement result',()=>{
  const ctx=vm.createContext({});vm.runInContext(source('formats'),ctx);
  const check=ctx.TAFormats.regexTrial;
  const one=check('/a/','aba','X');assert.equal(one.matches.length,1);assert.equal(one.replaced,'Xba');
  const zero=check('/^/gm','day','*');assert.deepEqual(Array.from(zero.unmatched),['day']);
  const many=check('/a/g','aaaaaaaaaa','X');
  assert.equal(many.matches.length,8);assert.equal(many.moreMatches,true);assert.equal(many.replaced,'XXXXXXXXXX');
});

test('both cancellation and a deadline terminate the Worker; an old reply cannot settle a subsequent run',async()=>{
  const workers=[],alarms=new Map();
  class PendingWorker {
    constructor(){workers.push(this);}
    postMessage(message){this.message=message;}
    terminate(){this.terminated=true;}
  }
  let next=0;
  const ctx=vm.createContext({Blob,URL,Worker:PendingWorker,setTimeout:fn=>{alarms.set(++next,fn);return next;},clearTimeout:id=>alarms.delete(id)});
  vm.runInContext(source('formats'),ctx);vm.runInContext(source('regex-runner'),ctx);
  const runner=ctx.TARegexRunner.createRunner(), run=()=>runner.run('hello',['hello'],'world');
  const initial=run();assert.deepEqual(Array.from(workers[0].message.samples),['hello']);
  runner.cancel();await assert.rejects(initial,/取消/);assert.equal(workers[0].terminated,true);
  const slow=run();[...alarms.values()][0]();await assert.rejects(slow,/超时/);assert.equal(workers[1].terminated,true);
  const final=run();workers[0].onmessage({data:['stale']});workers[2].onmessage({data:['current']});
  assert.deepEqual(await final,['current']);assert.equal(workers[2].terminated,true);assert.equal(alarms.size,0);
});
