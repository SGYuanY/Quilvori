import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {webcrypto} from 'node:crypto';

function environment(){
  const env=vm.createContext({console,crypto:webcrypto,structuredClone,TextEncoder,TextDecoder,Uint8Array,Uint32Array,btoa,atob,Event,dispatchEvent(){}});
  for(const file of ['formats','store','ai-tasks','studio','creation-assist','studio-drafts']){
    vm.runInContext(fs.readFileSync(new URL('../js/'+file+'.js',import.meta.url),'utf8'),env,{filename:file});
  }
  const lib=env.TAStore.emptyLibrary();
  env.TAUI={t:key=>key,state:{lib}};
  return {env,lib,assist:env.TACreationAssist};
}
const plain=value=>JSON.parse(JSON.stringify(value));

test('literal templates preserve regex punctuation, dollars, path separators and unchanged lines',()=>{
  const {env,assist}=environment();
  const find=String.raw`[x] / C:\ a+(v){2}.?^$|*`;
  const prefix=assist.templateRegex('prefix',find),literal=assist.templateRegex('replace',find,'$& / $$');
  const lines=[find+'North','Still '+find,find+'South'].join('\n');
  assert.equal(env.TAFormats.regexTrial(prefix.findRegex,lines,prefix.replaceString).replaced,['North','Still '+find,'South'].join('\n'));
  assert.equal(env.TAFormats.regexTrial(literal.findRegex,lines,literal.replaceString).replaced,lines.split(find).join('$& / $$'));
  assert.throws(()=>assist.templateRegex('replace','','test'));
  env.TAUI.state.regexExamples={original:'Delete me',expected:'',unchanged:'untouched'};
  assert.equal(assist.defaultBrief('quick'),'');
  assert.deepEqual(plain(assist.context('regex',null,assist.defaultBrief('regex'))),{
    brief:'根据示例生成正则',regexExamples:{original:'Delete me',expected:'',unchanged:'untouched'},
  });
  env.TAUI.state.regexExamples.includeInAI=false;
  assert.equal(assist.defaultBrief('regex'),'');
  assert.deepEqual(plain(assist.context('regex',null,'Remove brackets')),{brief:'Remove brackets'});
});

test('native regex objects, arrays and all supported envelopes import the same script',()=>{
  const {env}=environment(),formats=env.TAFormats;
  const script={scriptName:'Line prefix',findRegex:'/^Note: /gm',replaceString:'',trimStrings:['x'],placement:[2],disabled:true,runOnEdit:true};
  const [native]=formats.regexToExport([script]);
  for(const packet of [native,[native],{scripts:[native]},{regex_scripts:[native]},{data:[native]}]){
    const [row]=formats.regexFromImport(packet);
    assert.deepEqual(plain(formats.regexToExport([row])[0]),plain(native));
  }
  for(const packet of [null,{},'text',{data:{}},[null]])assert.throws(()=>formats.regexFromImport(packet));
  assert.deepEqual(plain(formats.regexFromImport([])),[]);
});

test('bare ST expressions preserve literal whitespace and replace only the first match without g',()=>{
  const {env}=environment(),formats=env.TAFormats;
  const cases=[
    ['^Notes: ','Notes: the quay','','the quay',['Notes: ']],
    [' bell ','bell, bell rang.','X','bell,Xrang.',[' bell ']],
    [' ','a b c','·','a·b c',[' ']],
    ['bell','bell bell','ring','ring bell',['bell']],
    ['/bell/g','bell bell','ring','ring ring',['bell','bell']],
    ['  /^Notes: /gm  ','Notes: A\nNotes: B','','A\nB',['Notes: ','Notes: ']],
  ];
  for(const [expression,original,replacement,expected,matches] of cases){
    const compiled=formats.regexFromString(expression);
    assert.ok(compiled,expression);assert.equal(original.replace(compiled,replacement),expected,expression);
    const preview=formats.regexTrial(expression,original,replacement);
    assert.ok(preview.ok,expression);assert.equal(preview.replaced,expected,expression);
    assert.deepEqual(plain(preview.matches.map(match=>match.text)),matches,expression);
  }
});

test('quick replies use only the chosen works and selected or actually relevant enabled entries',()=>{
  const {env,lib,assist}=environment();
  lib.characters=[{id:'c',name:'Pilot',description:'Chosen biography',source:{localNote:'excluded-card-private'}},{id:'other',name:'excluded-card-name'}];
  lib.worldBooks=[{id:'b',name:'Atlas',description:'Navigator notes',entries:[
    {id:'route',keys:['route'],content:'Selected route'},{id:'base',constant:true,content:'Base setting'},
    {id:'unused',keys:['unused'],content:'excluded-entry-private'},{id:'off',constant:true,enabled:false,keys:['route'],content:'excluded-disabled'},
  ]},{id:'outside',name:'excluded-book-name',entries:[]}];
  const options={characterId:'c',bookId:'b',scope:'selected',entryIds:['route','missing']};
  const context=assist.quickContext(lib,options,'Plan a route');
  assert.deepEqual(plain(context.reference.book.entries.map(e=>e.id)),['route']);
  assert.doesNotMatch(JSON.stringify(context),/excluded|Base setting/);
  const relevant=assist.quickContext(lib,{...options,scope:'relevant'},'Plan a route');
  assert.deepEqual(plain(relevant.reference.book.entries.map(e=>e.id)),['route','base']);
  assert.doesNotMatch(JSON.stringify(relevant),/excluded/);
  const empty=assist.quickContext(lib,{...options,entryIds:[]},'Ask a question');
  assert.equal(empty.reference.book.name,'Atlas');assert.equal(empty.reference.book.entries.length,0);
  const generic=assist.quickContext(lib,{},'Prompt');
  assert.deepEqual(plain(generic.reference),{card:null,book:null});
  const result={quick:{name:'Commands',replies:[{label:'Travel',message:'Set a route'}]}};
  const plan=env.NIJANAI.proposal(lib,'create:quick',result,context);
  env.NIJANAI.commit(lib,plan);
  assert.deepEqual(plain(lib.quickReplySets[0].workSource),plain(context.quickSource));
  const reopened=env.TAStore.verify(plain(lib));
  assert.equal(reopened.quickReplySets[0].workSource.bookId,'b');
  const native=env.TAFormats.qrToExport(reopened.quickReplySets[0]);
  assert.equal(native.qrList[0].message,'Set a route');
  assert.doesNotMatch(JSON.stringify(native),/workSource|Navigator notes|Selected route/);
});

test('a quick-reply preview retains only live references and a chosen cast resolves duplicate names by ID',()=>{
  const {env,lib,assist}=environment();
  lib.characters=[{id:0,name:'Pilot',description:'West coast'},{id:'b',name:'Pilot',description:'East coast'}];
  lib.worldBooks=[{id:0,name:'Harbor',entries:[{id:0,comment:'Bell',content:'Two tones'}]}];
  const ref={characterId:0,bookId:0,entryIds:[0]};
  const plan={operations:[{path:['quickReplySets'],value:{workSource:ref}}]};
  assert.equal(assist.quickSourcesAvailable(plan),true);lib.worldBooks[0].entries=[];assert.equal(assist.quickSourcesAvailable(plan),false);
  env.TAUI.state.scriptCastIds=[0,'b'];
  const ctx=assist.context('script',null,'A foggy harbor'),A=env.NIJANAI;
  const script=speaker=>({script:{name:'Crossing',beats:[{speaker,line:'Wait.'}]}});
  assert.throws(()=>A.proposal(lib,'create:script',script('Pilot'),ctx),/编号/);
  assert.throws(()=>A.proposal(lib,'create:script',script('Outsider'),ctx));
  const proposal=A.proposal(lib,'create:script',script(0),ctx);
  const receipt=A.commit(lib,proposal);
  assert.equal(receipt.operations[0].value.beats[0].speaker,'0');
  assert.equal(env.TAFormats.scriptToExport(env.TAStore.verify(lib).scripts[0],lib).beats[0].speaker,'Pilot');
  const legacy=A.proposal(lib,'create:script',script('0'),ctx);legacy.operations[0].value.beats[0].speaker=0;
  assert.equal(A.commit(lib,legacy).operations[0].value.beats[0].speaker,'0');
  const later=A.proposal(lib,'create:script',script('0'),ctx);
  lib.characters.shift();assert.throws(()=>A.commit(lib,later),/剧本引用/);
  env.TAUI.state.scriptCastIds=[];
  const independent=assist.context('script',null,'Fog');
  assert.deepEqual(plain(independent.availableCharacters),[]);
  assert.doesNotThrow(()=>A.proposal(lib,'create:script',script('narrator'),independent));
});

// Two windows can share a generation key while holding different previews.
test('draft compare-and-swap rejects stale review or undo and restores the original work ID',()=>{
  const {env,lib}=environment(),D=env.TAStudioDrafts,records=new Map();
  env.TALibraryDB={database:()=>({})};
  const plan={id:'p',batchId:'draft',task:'create:world',operations:[{key:'operation',kind:'add',path:['worldBooks'],value:{id:'world',name:'Atlas',entries:[]}}]};
  const store={
    get(key){return {result:records.get(key),set onsuccess(callback){callback();}};},
    put(row){records.set(row.id,structuredClone(row));},delete(key){records.delete(key);},
  };
  function write(change){D.writeTo(store,change,error=>{throw error;});D.committed(change);}
  const first=D.onUndo(plan);
  write(first);
  assert.deepEqual(plain(D.pending().map(row=>row.plan.operations[0].value.id)),['world']);
  const live=D.rehydrate([])[0],receipt={operations:live.operations};
  const stale=structuredClone(live);
  const adopt=D.onAdopt(live,receipt);
  write(adopt);lib.worldBooks.push(live.operations[0].value);assert.equal(D.pending().length,0);
  lib.worldBooks=[];assert.equal(D.pending().length,0);
  // An explicit undo restores the draft. A stale window cannot consume the new version.
  const restored=D.onUndo(live);write(restored);
  assert.notEqual(restored.row.revision,first.row.revision);
  assert.throws(()=>write(D.onAdopt(stale,receipt)),/另一窗口/);
  assert.throws(()=>write(D.onUndo(live)),/另一窗口/);
  assert.equal(records.size,1);assert.equal(D.pending()[0].plan.operations[0].value.id,'world');
  write(D.onAdopt(restored.row.plan,receipt));
  assert.deepEqual(plain(D.rehydrate([live])),[]);
});
