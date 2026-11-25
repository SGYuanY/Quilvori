import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const toNative = value => JSON.parse(JSON.stringify(value));
const path = new URL('../js/search.js', import.meta.url);
const fixtures = () => ({
  characters: [
    {id:'a/1', name:'Aster', personality:'Curious', scenario:'At the station', system_prompt:'Wait for a signal.', post_history_instructions:'Close the gate.',
      creator_notes:'Version notes', tags:['cloud','蓝色'], alternate_greetings:['Good evening.', 'İ — Look for the GLASS tower.']},
    {id:'a/2', name:'Glass Fox'},
  ],
  worldBooks: [{id:'book:#%', name:'Night Routes', description:'Glass district', entries:[
    {id:'e/?#',comment:'Observatory',content:'The glass tower overlooks the city.',keys:['tower'],secondaryKeys:['蓝色'],outletName:'night-watch'},
  ]}],
  promptPresets: [{id:'p/1',name:'Voice',blocks:[{id:'<b>',name:'Narrator',kind:'custom',role:'system',content:'A voice like glass.'}]}],
  regexScripts: [{id:'re#1',scriptName:'Clean',findRegex:'/(?<x>hello)/gi',replaceString:'$1 — GLASS',trimStrings:['literal .*',' leading ']}],
});
const lib = fixtures(), calls = [];
const fixtureURL = new URL('https://example.invalid/characters.html');

const ctx = vm.createContext({
  URL, URLSearchParams, location: { href:fixtureURL.href, assign:href=>calls.push(['assign',href]) },
  history:{replaceState:(_a,_b,href)=>calls.push(['replace',href])},
  document:{body:{dataset:{}}}, CSS:{escape:value=>value},
  TAUI:{state:{lib,sel:{},save:'saved'},t:key=>key,toast:msg=>calls.push(['toast',msg]),
    go:page=>calls.push(['go',page])},
});
vm.runInContext(fs.readFileSync(path,'utf8'),ctx);
const search = ctx.TASearch;
ctx.TAUI.openAddress=href=>{
  const url=new URL(href,fixtureURL), route=url.pathname.split('/').pop().replace('.html','');
  calls.push(['address',href]); search.restoreAddress(route,url);ctx.TAUI.go(route);
};
const hits = needle => [...search.matches(lib,needle)];

const glass = hits('glass');
assert.equal(glass.length,6);
assert.equal(glass[0].title,'Glass Fox');
assert.deepEqual(new Set(glass.map(hit=>hit.target.kind)),new Set(['character','book','entry','block','regex']));
assert.equal(hits('SYSTEM')[0].target.field,'role');
assert.equal(hits('VOICE')[0].target.kind,'preset');
assert.equal(hits('evening')[0].target.index,0);
assert.equal(hits('蓝色').length,2);
assert.equal(hits('蓝色')[1].target.field,'secondaryKeys');
assert.equal(hits('night-watch')[0].target.field,'outletName');
for (const field of ['personality','scenario','system_prompt','post_history_instructions','creator_notes']) assert.equal(hits(lib.characters[0][field])[0].target.field,field);
assert.equal(hits('.*')[0].target.field,'trimStrings');
assert.equal(hits('(?<x>')[0].target.field,'findRegex');
assert.equal(hits('   ').length,0);
const greeting = glass.find(hit=>hit.target.field==='alternate_greetings');
assert.equal(lib.characters[0].alternate_greetings[greeting.target.index].slice(greeting.target.from,greeting.target.to),'GLASS');
assert.match(search.describe(greeting),/备用开场 2/);
const shared = hits('overlooks')[0];
const roundTrip = new URL(search.href(shared.target), fixtureURL);
assert.deepEqual(toNative(search.address('lore',roundTrip)),toNative(shared.target));
assert.equal(search.address('lore',new URL('lore.html?field=constructor#ok',fixtureURL)),null);
assert.equal(search.address('lore',new URL('lore.html#%zz',fixtureURL)),null);
assert.equal(search.address('toString',new URL('lore.html#id',fixtureURL)),null);
assert.equal(search.address('prompts',new URL('prompts.html?block=abc#p',fixtureURL)).field,'name');
const shelfBook = search.address('lore',new URL('lore.html#book%3A%23%25',fixtureURL));
assert.equal(shelfBook.selectOnly,true);
assert.equal(search.href(shelfBook),'lore.html#book%3A%23%25');
const large = {...lib,characters:Array.from({length:97},(_,i)=>({id:'c'+i,name:'Needle '+i}))};
const found = [];
for (let offset = 0; ; offset += 12) {
  const page = search.page(search.matches(large,'needle'),offset,12);
  found.push(...page.items);
  if (!page.more) break;
}
assert.equal(found.length,97);
assert.equal(new Set(found.map(hit=>hit.target.id)).size,97);
assert.equal(hits('revised').length,0);
lib.characters[0].description='revised field';
search.invalidate();
assert.equal(hits('revised')[0].target.field,'description');

await search.open(shared.target);
assert.equal(ctx.TAUI.state.sel.book,'book:#%');
assert.equal(ctx.TAUI.state.sel.entry,'e/?#');
assert.equal(ctx.TAUI.state.openFold.lore,'content');
assert.deepEqual(calls.at(-1),['go','lore']);
await search.open(greeting.target);
assert.equal(ctx.TAUI.state.openFold.char,'greetings');
assert.equal(ctx.TAUI.state.cardView,'edit');
let focused, selectedRange;
search.focus({querySelector(selector) {
  focused=selector;
  return {closest:()=>null,matches:s=>s!=='select',focus(){},scrollIntoView(){},
    setSelectionRange(from,to){selectedRange=lib.characters[0].alternate_greetings[1].slice(from,to);}};
}},'characters');
assert.equal(focused,'[data-greet="1"]'); assert.equal(selectedRange,'GLASS');
ctx.document.body.dataset.page='regex'; ctx.TAUI.state.save='dirty';
calls.length=0;
await search.open(shared.target);
assert.deepEqual(calls.map(row=>row[0]),['address','go']);
assert.equal(new URL(calls[0][1],fixtureURL).href,roundTrip.href);
ctx.location.href=roundTrip.href; ctx.document.body.dataset.page='lore';
search.restoreAddress('lore');
assert.equal(ctx.TAUI.state.sel.entry,'e/?#');
await search.open(shelfBook);
assert.equal(ctx.TAUI.state.sel.book,'book:#%');
search.focus({querySelector:()=>{ throw Error('Shelf navigation unexpectedly focused a field'); }},'lore');
lib.worldBooks[0].entries=[];
await search.open(shared.target);
assert.equal(calls.at(-1)[0],'toast');
console.log('Full-text fields, literal matching, pagination, editor focus and safe cross-page navigation passed.');
