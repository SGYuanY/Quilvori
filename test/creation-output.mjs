import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {test} from 'node:test';

const env=vm.createContext({console,structuredClone,Date,Array,Object,RegExp,Error,TextEncoder,TextDecoder,Uint8Array,Uint32Array});
for(const file of ['formats','store','ai-tasks','creation-output']) {
  vm.runInContext(fs.readFileSync(new URL('../js/'+file+'.js',import.meta.url),'utf8'),env,{filename:file});
}
const collect=env.NIJANCreationOutput.collect, native=value=>JSON.parse(JSON.stringify(value));
const entry={key:'tide, 雾港',comment:'Light',content:'Leave the brass light burning.'};
const stbook={name:'Northern Almanac',entries:{'42':{uid:42,...entry,key:['chart','harbour'],keysecondary:['wind'],position:4,depth:0,order:0,disable:false,constant:false}}};
test('a combined response becomes two independently validated previews, preserving narrative facts and omitted fields',()=>{
  const src={character:{name:'Evan',age:46,appearance:{hair:'Grey',eyes:'Hazel'},description:'Keeper of the north light.',first_mes:'  Good evening.\n',tags:['sea']},world:[entry]};
  const before=JSON.stringify(src), res=collect(src,['character','world']);
  assert.deepEqual(native(res.errors),{});assert.deepEqual(native(res.present),['character','world']);
  assert.equal(res.results.world.world.name,'Evan · 世界书');
  assert.deepEqual(native(res.results.world.world.entries),[{comment:entry.comment,content:entry.content,keys:['tide','雾港']}]);
  const card=res.results.character.character;
  assert.equal(card.first_mes,src.character.first_mes);assert.ok(card.description.startsWith(src.character.description));
  assert.match(card.description,/age：46/);assert.match(card.description,/"hair": "Grey"/);assert.match(card.description,/"eyes": "Hazel"/);
  assert.ok(!Object.hasOwn(card,'scenario'));
  card.tags.push('test');assert.equal(JSON.stringify(src),before);
});
test('requested kinds govern publication, ignored names are reported and nothing writes to a library',()=>{
  const src={character:{name:'Evan'},world:[entry]},library=env.TAStore.emptyLibrary();
  const res=collect(src,new Set(['world']),{reference:{card:{name:'Not the author'}}});
  assert.deepEqual(Object.keys(res.results),['world']);assert.deepEqual(Array.from(res.ignored),['character']);
  assert.equal(library.characters.length,0);assert.equal(library.worldBooks.length,0);
  const onlyCard=collect(src,'create:character');
  assert.deepEqual(Object.keys(onlyCard.results),['character']);assert.deepEqual(Array.from(onlyCard.ignored),['world']);
});
test('standard ST card envelopes and embedded World Info map native activation values without truthy coercion',()=>{
  const src={spec:'chara_card_v2',spec_version:'2.0',creatorcomment:'Draft note',data:{name:'The pilot',description:'Knows this coast.',
    first_mes:'Fog.',character_book:stbook,alternate_greetings:['West.']}};
  const {results,errors}=collect(src,['character','world']);
  assert.deepEqual(native(errors),{});
  assert.equal(results.character.character.creator_notes,'Draft note');assert.deepEqual(native(results.character.character.alternate_greetings),['West.']);
  assert.equal(results.world.world.name,stbook.name);const [{keys,secondaryKeys,position,depth,order,enabled}]=results.world.world.entries;
  assert.deepEqual(native(keys),['chart','harbour']);assert.deepEqual(native(secondaryKeys),['wind']);
  assert.equal(position,'at_depth');assert.equal(depth,0);assert.equal(order,0);assert.equal(enabled,true);
  const raw={world:{name:'Book',entries:[{...entry,position:'invalid',enabled:'false'}]}};
  assert.ok(collect(raw,'world').errors.world);assert.ok(collect({world:[{...entry,disable:'false'}]},'world').errors.world);
});
test('incomplete characters and invalid books produce separate module errors and presence survives validation',()=>{
  const failCard=collect({character:{appearance:{eyes:'silver'}},world:[entry]},['character','world']);
  assert.deepEqual(Array.from(failCard.present),['character','world']);assert.ok(failCard.errors.character);assert.ok(failCard.results.world);
  assert.equal(failCard.results.world.world.name,'世界书');
  const failBook=collect({character:{name:'Archivist'},world:[entry,{comment:'Unwritten'}]},['character','world']);
  assert.deepEqual(Array.from(failBook.present),['character','world']);assert.ok(failBook.results.character);assert.ok(failBook.errors.world);assert.ok(!failBook.results.world);
  const absent=collect({character:{name:'Archivist'}},['character','world']);
  assert.deepEqual(Array.from(absent.present),['character']);assert.ok(absent.errors.world);
});
test('standalone entries, typed envelopes and Chinese aliases use explicit titles and preserve exact bodies',()=>{
  env.TAI18n={t:k=>k==='世界书'?'World book':k};
  try {
    const src={'角色卡':{'姓名':'索引员','外貌':{眼睛:'棕色'},'性格':'谨慎','备用开场白':['你好。']},'世界书':[{'条目名':'潮汐钟楼','触发关键词':'钟楼、港口','正文':'夜里亮灯。\n  第二行。'}]};
    const result=collect(src,['character','world'],{worldTitle:'海岸手册'}).results;
    assert.equal(result.world.world.name,'海岸手册');assert.equal(result.world.world.entries[0].content,src.世界书[0].正文);
    assert.deepEqual(native(result.world.world.entries[0].keys),['钟楼','港口']);assert.equal(result.character.character.name,'索引员');
    assert.equal(collect([entry],'world').results.world.world.name,'World book');
    assert.equal(collect({data:stbook},'world').results.world.world.entries[0].comment,'Light');
    assert.deepEqual(native(collect({world:entry},'world').results.world.world.entries[0].keys),['tide','雾港']);
  } finally {delete env.TAI18n;}
});
test('fenced output can contain two independent documents and malformed or ambiguous data never gets guessed',()=>{
  const fence=String.fromCharCode(96).repeat(3);
  const raw='A draft follows.\n'+fence+'json\n'+JSON.stringify({character:{name:'Evan'}})+'\n'+fence+'\n\n'+fence+'JSON\n'+JSON.stringify([entry])+'\n'+fence;
  assert.deepEqual(Object.keys(collect(raw,['character','world']).results),['character','world']);
  for(const src of ['{"character":',fence+'json\n{"world": {\n'+fence,'ordinary prose']) {
    const result=collect(src,['character','world']);assert.deepEqual(native(result.results),{});assert.deepEqual(native(result.present),[]);assert.equal(result.code,'invalid-output');
  }
  assert.ok(collect([{name:'A',description:'first'},{name:'B',description:'second'}],'character').errors.character);
  assert.ok(collect({character:{name:'A',姓名:'B'}},'character').errors.character);
  assert.equal(collect({name:'Unknown type'},['character','world']).present.length,0);
});
test('clarifications and provider-declared failures are reported with their text and a meaningful code',()=>{
  const wants=['character','world'];
  let res=collect({status:'needs_input',question:'Which coast?'},wants);assert.equal(res.code,'needs-input');
  assert.equal(res.errors.character,'Which coast?');assert.equal(res.errors.world,'Which coast?');
  res=collect({error:{message:'provider fixture'}},wants);assert.equal(res.code,'model-error');assert.equal(res.errors.world,'provider fixture');
});
test('text is not evaluated, raw input is not mutated, and long character/body text is not truncated',()=>{
  const body='甲{{char}}<script>throw Error("fixture")</script>乙\n'.repeat(1000);
  const raw={角色卡:{名字:'Emily',外貌:{hair:body},年龄:0},世界书:{书名:'保真',条目:[{标题:'原文',正文:body,关键词:['x,y','z']}]},untrusted:{system:'No effect'}};
  const source=JSON.stringify(raw),result=collect(raw,['character','world']);
  assert.ok(result.results.character.character.description.includes(JSON.stringify(body)));
  assert.equal(result.results.world.world.entries[0].content,body);assert.deepEqual(native(result.results.world.world.entries[0].keys),['x,y','z']);assert.equal(source,JSON.stringify(raw));
});
