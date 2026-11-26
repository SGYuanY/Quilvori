import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const ctx = vm.createContext({});
for (const file of ['prompt-presets.js','formats.js']) {
  vm.runInContext(readFileSync(new URL('../js/'+file, import.meta.url), 'utf8'), ctx, {filename:file});
}
const {presetFromImport, presetToExport} = ctx.TAFormats;
const plain = obj => JSON.parse(JSON.stringify(obj));

test('empty text, native system flags and legacy system text stay distinct', () => {
  const preset = presetFromImport({blocks:[
    {id:0, name:'Empty', content:'', system_prompt:'Unused', enabled:false},
    {id:'007', name:'Native flag', system_prompt:true},
    {id:'note', name:'Author note', system_prompt:'Preserve me.'},
  ]});
  const file = presetToExport(preset);
  assert.deepEqual(plain(file.prompts.map(p => [p.identifier,p.content,p.system_prompt,p.enabled])), [
    [0,'',true,false],['007','',true,true],['note','Preserve me.',true,true],
  ]);
  assert.equal(file.prompts[2].injection_depth,4);
  assert.deepEqual(plain(presetToExport(presetFromImport(file))),plain(file));
  const old = presetToExport({blocks:[{id:0}]});
  assert.equal(old.prompts[0].identifier,'0');
  assert.equal(old.prompts[0].content,'');
});

test('native order uses the selected scope, skips markers and keeps unused blocks available', () => {
  const source = {prompts:[
    {identifier:0, name:'First'}, {identifier:'002', name:'Second'}, {identifier:'marker', marker:true},
  ], prompt_order:[
    {character_id:7, order:[{identifier:0,enabled:false}]},
    {character_id:100001, order:[{identifier:'marker'}, {identifier:'002',enabled:true}, {identifier:'0',enabled:false}]},
  ]};
  const ordered = presetToExport(presetFromImport(source)).prompt_order[0];
  assert.deepEqual(plain(ordered),{character_id:100001,order:[{identifier:'002',enabled:true},{identifier:0,enabled:false}]});
  const chosen = presetFromImport(source,0);
  assert.equal(chosen.blocks[1].stOrderOmitted,true);
  assert.deepEqual(plain(presetToExport(chosen).prompt_order),[source.prompt_order[0]]);
  source.prompt_order.unshift(null, {character_id:1});
  assert.deepEqual(plain(presetToExport(presetFromImport(source,0)).prompt_order),[source.prompt_order[2]]);
});

test('invalid input reports the exact field before producing a library record', () => {
  const scope = order => ({prompts:[{identifier:'a'}],prompt_order:[{character_id:0,order}]});
  for (const [input,field] of [
    [{prompts:{}},'prompts'],
    [{blocks:[{content:'ok'},{content:{text:'keep this'}}]},'blocks[1].content'],
    [{prompts:[{enabled:'false'}]},'prompts[0].enabled'],
    [{prompts:[{system_prompt:{text:'keep this'}}]},'prompts[0].system_prompt'],
    [{prompts:[1]},'prompts[0]'],
    [{prompts:[{identifier:0},{identifier:'0'}]},'prompts[1].identifier'],
    [scope([{identifier:'a',enabled:'false'}]),'prompt_order[0].order[0].enabled'],
    [{prompts:[{identifier:'a'}],prompt_order:[null,{order:[{identifier:'a',enabled:'false'}]}]},'prompt_order[1].order[0].enabled'],
    [scope({}),'prompt_order[0].order'],
  ]) {
    assert.throws(()=>presetFromImport(input),error=>error.presetField===field,field);
  }
  assert.throws(()=>presetFromImport(scope([]),5),error=>error.presetField==='prompt_order[5]');
});
