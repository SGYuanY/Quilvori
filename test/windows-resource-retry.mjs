import assert from 'node:assert/strict';
import path from 'node:path';
import {test} from 'node:test';
import {withWindowsResourceRetry} from '../scripts/windows-resource-retry.mjs';

const target = path.resolve('fixture','win-unpacked','Quilvori.exe');
const blocked = (code='UNKNOWN',syscall='open',file=target) => Object.assign(new Error('Fixture resource update'),{code,syscall,path:file});
function exercise(errors,file=target) {
  const waits = [], resources = {fixture:'integrity digest'};
  let calls = 0;
  function original(name,value) {
    calls++;
    assert.equal(name,file); assert.equal(value,resources);
    if (errors.length) throw errors.shift();
    return 'updated';
  }
  const writer = {addWinAsarIntegrity:original};
  const result = withWindowsResourceRetry(target,()=>writer.addWinAsarIntegrity(file,resources),writer,async ms=>{waits.push(ms);});
  return {done:result.finally(()=>assert.equal(writer.addWinAsarIntegrity,original)),waits,count:()=>calls};
}

test('transient open contention retries the same resource operation with the original integrity data',async()=>{
  const run = exercise([blocked(),blocked('EBUSY')]);
  assert.equal(await run.done,'updated'); assert.equal(run.count(),3); assert.deepEqual(run.waits,[300,600]);
});
test('errors after opening, other paths and unrelated failures propagate on the first attempt',async()=>{
  for (const [err,file] of [[blocked('EPERM','write'),target],[blocked('EIO'),target],
      [blocked('UNKNOWN','open',target+'.other'),target],[blocked(),target+'.other']]) {
    const run = exercise([err],file);
    await assert.rejects(run.done, e=>e===err); assert.equal(run.count(),1); assert.deepEqual(run.waits,[]);
  }
});
test('persistent contention surfaces the last real error after bounded retries',async()=>{
  const last = blocked('EACCES'), run = exercise([blocked(),blocked(),blocked(),last]);
  await assert.rejects(run.done,e=>e===last); assert.equal(run.count(),4); assert.deepEqual(run.waits,[300,600,1200]);
});
