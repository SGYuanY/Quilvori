import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

let id = 0;
const sandbox = vm.createContext({structuredClone, TAStore:{uid:()=> 'new-'+(++id)}});
for (const name of ['formats','context-tools']) {
  vm.runInContext(fs.readFileSync(new URL('../js/'+name+'.js',import.meta.url),'utf8'),sandbox,{filename:name+'.js'});
}
const C = sandbox.TAContext, F = sandbox.TAFormats;
const entry = (id,options={})=>({id,comment:id,keys:[id],secondaryKeys:[],content:'content '+id,enabled:true,order:100,position:'before_char',...options});
const book = (...entries)=>({name:'Fixture',entries});
const native = value=>JSON.parse(JSON.stringify(value));
const ids = rows=>Array.from(rows,row=>row.entry.id);
let passed = 0;
function test(name,fn) { fn(); passed++; console.log('ok',name); }

test('multilingual estimates count Unicode code points, spaces and empty text',()=>{
  assert.equal(C.estimate('a字한🙂').chars,4);
  assert.ok(C.estimate('字字字').tokens>C.estimate('abc').tokens);
  assert.ok(C.estimate(' '.repeat(8)).tokens>0);
  assert.deepEqual(native(C.estimate('')),{chars:0,tokens:0});
});
test('book costs include all text, while constant overhead uses enabled constants only',()=>{
  const draft=book(entry('a',{constant:true,content:'字字'}),entry('b',{constant:true,enabled:false,content:'abcd'}),entry('c',{content:'x'}));
  const stats=C.totals(draft);
  assert.equal(stats.chars,7); assert.equal(stats.constantChars,2); assert.equal(stats.constants,1); assert.equal(stats.enabled,2);
  draft.entries[0].content='新的文字';
  assert.equal(C.entrySize(draft.entries[0]).chars,4); assert.equal(C.totals(draft).constantChars,4);
});
test('all four ST secondary rules distinguish none, some and all matches',()=>{
  const rules=[0,1,2,3].map(logic=>entry(String(logic),{keys:['base'],secondaryKeys:['alpha','beta'],selective:true,selectiveLogic:logic}));
  for (const [sample,expected] of [['base',['1','2']],['base alpha',['0','1']],['base alpha beta',['0','3']]]) {
    assert.deepEqual(ids(C.simulate(book(...rules),sample).selected),expected);
  }
});
test('entry scope, physical line numbers, case, whole words and multiword keys are honored',()=>{
  const draft=book(entry('a',{keys:['Red'],caseSensitive:true,stSettings:{scanDepth:1}}),entry('b',{keys:['red'],matchWholeWords:true}),entry('c',{keys:['a red'],matchWholeWords:true}));
  const preview=C.simulate(draft,'Red\n\nA redwood',{scanDepth:2});
  assert.deepEqual(ids(preview.selected),['b','c']);
  assert.deepEqual(native(preview.selected.find(hit=>hit.entry.id==='b').lines),[1]);
  assert.deepEqual(native(preview.selected.find(hit=>hit.entry.id==='c').lines),[3]);
  assert.deepEqual(ids(C.simulate(draft,'Red',{scanDepth:0}).selected),['a']);
});
test('preview leaves regex and macro uncertainty explicit and accepts independently decisive literal hits',()=>{
  const draft=book(entry('regex',{keys:['/a+/i']}),entry('mixed',{keys:['/a+/i','gate']}),
    entry('not-all',{keys:['gate'],secondaryKeys:['/a+/','absent'],selective:true,selectiveLogic:1}),
    entry('and-all',{keys:['gate'],secondaryKeys:['{{user}}','gate'],selective:true,selectiveLogic:3}));
  const result=C.simulate(draft,'gate'); assert.deepEqual(ids(result.selected),['mixed','not-all']);
  assert.ok(result.skipped.every(row=>row.reason==='正则或宏需在酒馆验证'));
});
test('runtime checks identify individual selected and unresolved entries',()=>{
  const draft=book(entry('plain',{constant:true}),entry('conditional',{constant:true,content:'Hello {{user}}',
    stSettings:{probability:25,group:'weather',cooldown:2}}),entry('unknown',{keys:['{{char}}']}),
    entry('inactive',{enabled:false,stSettings:{vectorized:true}}));
  const result=C.simulate(draft,'hello');
  const flags=Object.fromEntries(result.verifyInST.map(row=>[row.entry.id,Array.from(row.reasons)]));
  assert.deepEqual(flags.conditional,['正文宏展开','概率抽取','分组抽选','跨轮计时']);
  assert.deepEqual(flags.unknown,['正则或宏关键词']);
  assert.equal(flags.plain,undefined);assert.equal(flags.inactive,undefined);
});
test('single-book budget follows order, stops ordinary allocations at overflow, still includes exempt entries',()=>{
  const result=C.simulate(book(entry('matched',{keys:['door'],order:400,content:'A'}),entry('large',{constant:true,order:300,content:'字'.repeat(20)}),
    entry('small',{constant:true,order:200,content:'B'}),entry('exempt',{constant:true,order:100,content:'C',stSettings:{ignoreBudget:true}})),'door',{budget:5});
  assert.deepEqual(ids(result.selected),['matched','exempt']);
  assert.deepEqual(ids(result.skipped),['large','small']);
  assert.ok(result.skipped.every(row=>row.reason==='超出预算'));
  assert.deepEqual(ids(C.simulate(book(entry('exact',{constant:true,content:'A'})),'',{budget:C.estimate('A\n').tokens}).selected),[]);
});
test('recursion traces activating entries and respects per-entry recursion flags',()=>{
  const draft=book(entry('seed',{keys:['rain'],content:'clock cellar'}),entry('clock',{content:'echo',stSettings:{preventRecursion:true}}),
    entry('cellar',{stSettings:{excludeRecursion:true}}),entry('echo'));
  const direct=C.simulate(draft,'rain'), deep=C.simulate(draft,'rain',{recursion:true});
  assert.deepEqual(ids(direct.selected),['seed']); assert.deepEqual(ids(deep.selected),['seed','clock']);
  assert.deepEqual(native(deep.selected[1].parents),['seed']);
});
test('fixed-depth role slots, disabled entries and named outlets have independent placement and costs',()=>{
  const rows=[entry('late',{constant:true,order:200}),entry('early',{constant:true,order:1}),entry('depth',{constant:true,position:'at_depth',depth:0,stSettings:{role:2}}),
    entry('out1',{constant:true,position:'outlet',outletName:'news',order:30}),entry('out2',{constant:true,position:'outlet',outletName:'news',order:20}),
    entry('off',{constant:true,enabled:false}),entry('missing',{constant:true,position:'outlet'}),entry('zero',{constant:true,stSettings:{useProbability:true,probability:0}})];
  const p=C.simulate(book(...rows),'');
  assert.deepEqual(ids(p.groups.get('before_char')),['early','late']);
  assert.deepEqual(ids(p.groups.get('at_depth · 0 · 2')),['depth']);
  assert.deepEqual(ids(p.groups.get('outlet · news')),['out1','out2']);
  assert.equal(p.outletTokens,C.estimate('content out1\ncontent out2').tokens); assert.equal(p.spent,C.estimate('content early\ncontent late').tokens+C.estimate('content depth').tokens);
  assert.deepEqual(new Set(ids(p.skipped)),new Set(['off','missing','zero']));
});
test('health findings identify actionable entries and references distinguish outlet use from possible recursion',()=>{
  const source=entry('source',{constant:true,comment:'Market Square',content:'{{outlet::dispatch}} A door opens.'});
  const dest=entry('place',{keys:['door','a'],content:'字'.repeat(550),position:'at_depth',depth:10});
  const draft=book(source,dest,entry('overlap',{keys:['door']}),entry('unused',{enabled:false,keys:['door']}),entry('out',{position:'outlet',outletName:'dispatch'}));
  const report=C.analyze(draft);
  for (const reason of ['关键词过宽','共用关键词，可细化或合并','正文较长，可拆分','注入深度超过 8']) assert.ok(report.findings.some(row=>row.entry===dest&&row.reason===reason));
  assert.ok(report.findings.every(row=>row.entry.id!=='unused'));
  const links=C.relations(draft,source);
  assert.ok(links.some(row=>row.to.id==='out'&&row.explicit));
  assert.ok(links.some(row=>row.to.id==='place'&&!row.explicit&&row.key.includes('door')));
  assert.ok(links.every(row=>row.to.id!=='unused'));
  const situation={...source,keys:[]}; assert.deepEqual(native(C.suggestions(situation)),['Market Square']);
  assert.deepEqual(native(C.suggestions({...situation,comment:'Global rules'})),[]);
});
test('overlapping keywords respect whole-word and case rules and point at the shorter trigger',()=>{
  const broad=entry('broad',{keys:['arch']}), exact=entry('exact',{keys:['arch'],matchWholeWords:true}), upper=entry('upper',{keys:['ARCH'],caseSensitive:true});
  const longer=entry('longer',{keys:['archivist'],caseSensitive:true});
  const findings=C.analyze(book(broad,exact,upper,longer)).findings.filter(row=>row.reason==='短关键词也会匹配较长的触发词');
  assert.deepEqual(ids(findings),['broad']); assert.match(findings[0].detail,/archivist/);
});
test('delayed recursion starts with the first configured level once a seed enables recursion',()=>{
  const waiting=entry('wait',{keys:['rain'],stSettings:{delayUntilRecursion:3}});
  const bare=C.simulate(book(waiting),'rain',{recursion:true}); assert.equal(bare.selected.length,0);
  const seeded=C.simulate(book(entry('seed',{constant:true}),waiting),'rain',{recursion:true});
  assert.equal(seeded.selected.find(row=>row.entry.id==='wait').round,1);
});
test('large book directory paginates grouped results and reveals a target beyond the initial page',()=>{
  const entries=Array.from({length:1050},(_,i)=>entry('entry-'+i,{comment:'Title '+i,content:i===1037?'needle in final group':'body',secondaryKeys:i===47?['needle in keys']:[],position:i<1000?'before_char':'after_char'}));
  const defs=[{id:'before_char',label:'Before'},{id:'after_char',label:'After'}];
  const first=C.directoryPage(entries,defs,{}), deep=C.directoryPage(entries,defs,{reveal:'entry-1037'});
  assert.equal(first.count,1050); assert.equal(first.pages,21); assert.equal(first.groups[0].entries.length,50);
  assert.equal(deep.page,20); assert.equal(deep.groups[0].entries[37].id,'entry-1037');
  const filter=C.directoryPage(entries,defs,{query:'NeEdLe',page:500});
  assert.equal(filter.page,0); assert.equal(filter.count,2); assert.deepEqual(Array.from(filter.groups,g=>g.entries[0].id),['entry-47','entry-1037']);
  assert.equal(C.directoryPage(entries,defs,{outer:'final group',query:'missing'}).count,0);
});
test('character review locates both original fields and reports overlong passages',()=>{
  const sentence='The bell rings at noon.';
  const findings=C.characterChecks({description:sentence,personality:sentence,scenario:'字'.repeat(510)});
  assert.ok(findings.some(row=>row.field==='personality'&&row.other==='description'&&row.excerpt===sentence));
  assert.ok(findings.some(row=>row.field==='scenario'&&row.reason==='可移入世界书'));
});
test('export opts are independent, retain metadata and never mutate the source',()=>{
  const source=book(entry('short',{content:'Intro\n\n\nEnd  \n\nIntro'}),entry('off',{enabled:false})); source.stBookFields={scan_depth:7};
  const saved=JSON.stringify(source);
  const untouched=C.buildEdition(source); assert.deepEqual(native(untouched.book),source); assert.equal(untouched.changes.length,0);
  const dedup=C.edition(source,{dedup:true}); assert.equal(dedup.entries[0].content,'Intro\n\n\nEnd  ');
  const compact=C.edition(source,{compact:true}); assert.equal(compact.entries[0].content,'Intro\n\nEnd\n\nIntro');
  const combined=C.buildEdition(source,{skipDisabled:true,compact:true,dedup:true,core:['short']}); assert.equal(combined.book.entries[0].content,'Intro\n\nEnd');
  assert.equal(combined.changes.length,2); assert.equal(combined.book.entries.length,1);
  assert.equal(JSON.stringify(source),saved); assert.deepEqual(native(combined.book.stBookFields),{scan_depth:7});
});
test('export leaves code whitespace intact and never cuts inside a long macro or paired source block',()=>{
  const ticks=String.fromCharCode(96).repeat(3), code=ticks+'text\n'+'keep  \n\n\n'.repeat(200)+ticks+'\n';
  const macro='{{format::{{char}}::'+'x'.repeat(1700)+'}}';
  const source='字'.repeat(300)+'\n'+code+'\n'+macro+'\n'+'界'.repeat(300);
  const parts=C.edition(book(entry('source',{content:source})),{split:true}).entries.map(e=>e.content);
  assert.equal(parts.join(''),source); assert.ok(parts.some(part=>part.includes(code))); assert.ok(parts.some(part=>part.includes(macro)));
  const cleaned=C.edition(book(entry('code',{content:code})),{compact:true,dedup:true}); assert.equal(cleaned.entries[0].content,code);
  const blocked=book(entry('html',{content:'<details>'+source+'</details>'}));
  assert.equal(C.edition(blocked,{split:true}).entries.length,1);
});
test('splits retain every character, trigger metadata, and part order in both ST placement directions',()=>{
  for (const position of ['before_char','outlet']) {
    const long='A'.repeat(1800)+'。'+'界'.repeat(500)+'\n\nEnd.', metadata={group:'places',probability:45};
    const original=book(entry('chapter',{stUid:91,keys:['market'],position,outletName:'place',stSettings:metadata,order:73,content:long}));
    const result=C.edition(original,{split:true}), parts=result.entries;
    assert.ok(parts.length>2); assert.equal(parts.map(e=>e.content).join(''),long);
    assert.equal(new Set(parts.map(e=>e.stUid)).size,parts.length);
    assert.ok(parts.some(e=>e.stUid===91)); assert.equal(parts[0].id,'chapter');
    assert.ok(parts.every(e=>e.order===73 && e.keys[0]==='market' && e.stSettings.probability===45));
    assert.ok(parts.every(e=>C.estimate(e.content).tokens<=300));
    const exported=F.bookToWorldInfo(result), reloaded=F.worldInfoToBook(exported,'fixture');
    reloaded.entries.forEach((e,i)=>{e.id=String(i);});
    const preview=C.simulate(reloaded,'market',{budget:10000});
    const actual=[...preview.groups.values()][0].map(row=>row.entry.content).join('');
    assert.equal(actual,long);
  }
});
console.log(passed+' context checks passed');
