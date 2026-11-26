import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';

const source = name => readFileSync(new URL('../js/'+name+'.js',import.meta.url),'utf8');
const codec = () => {
  const vault=new Map();
  return {
    async seal(id,key) { const token=webcrypto.randomUUID();vault.set(token,{id,key});return token; },
    async open(id,token) { const row=vault.get(token);if(!row || row.id!==id)throw Error('locked');return row.key; },
  };
};
function store(raw) {
  const map=new Map(raw?[['nijan-model',raw]]:[]);
  return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
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
  assert.equal(disk.getItem('nijan-model'),raw);assert.equal(api.credentialStatus().locked,true);
  assert.throws(()=>api.save({key:''}));assert.equal(disk.getItem('nijan-model'),raw);
  provider.open=read;await api.retryCredentials();
  assert.equal(api.load().key,'fixture-only-migration');assert.ok(!disk.getItem('nijan-model').includes('fixture-only-migration'));
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
