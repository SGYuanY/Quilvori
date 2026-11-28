// Run with node scripts/benchmark-library.mjs. The fixture opens a fresh, offline
// Electron profile and the launcher removes it after the measurement finishes.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,open as openFile,readFile,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const size = {cards:500,books:160,entriesPerBook:40,chats:64,messagesPerChat:80,portraits:32,portraitWidth:256};
const warmups = 5, samples = 30;

// This function is passed to the real application renderer, with no access to Node or the network.
async function seed(size) {
  if (TAStore.backend !== 'indexedDB') throw Error('The benchmark requires IndexedDB.');
  TAI18n.save({lang:'en'}); TAI18n.apply();
  const lib = TAStore.emptyLibrary();
  const prose = 'The survey team records a new mark on the synthetic harbor chart. ';
  const make = (count,fn) => Array.from({length:count},(_,index) => fn(index));
  const width = size.portraitWidth, canvas = document.createElement('canvas');
  canvas.width = canvas.height = width;
  const ctx = canvas.getContext('2d');
  lib.assets = make(size.portraits,index => {
    const image = ctx.createImageData(width,width);
    let seed = index + 1;
    for (let p=0;p<image.data.length;p+=4) {
      seed = (Math.imul(seed,1664525) + 1013904223) >>> 0;
      image.data[p] = seed >>> 24; image.data[p+1] = seed >>> 16 & 255;
      image.data[p+2] = seed >>> 8 & 255; image.data[p+3] = 255;
    }
    ctx.putImageData(image,0,0);
    const dataUrl = canvas.toDataURL('image/png');
    return {id:'portrait-'+index,name:'Synthetic portrait '+index,kind:'avatar',mime:'image/png',dataUrl,
      bytes:atob(dataUrl.split(',')[1]).length};
  });
  lib.characters = make(size.cards,index => ({
    id:'card-'+index,name:'Synthetic pilot '+index,description:'Card '+index+'. '+prose.repeat(16),
    personality:prose.repeat(3),scenario:prose.repeat(3),first_mes:prose.repeat(3),
    tags:['fixture','harbor'],alternate_greetings:[prose],creator:'Benchmark',talkativeness:0.5,
    avatarAssetId:'portrait-'+(index%size.portraits),embeddedBookId:'book-'+(index%size.books),
  }));
  lib.worldBooks = make(size.books,index => ({
    id:'book-'+index,name:'Synthetic register '+index,description:'Survey '+index,
    entries:make(size.entriesPerBook,entry => ({id:'entry-'+entry,stUid:entry,comment:'Marker '+index+'-'+entry,
      content:prose.repeat(5),keys:['marker-'+index+'-'+entry],enabled:true,position:'before_char'})),
  }));
  lib.chats = make(size.chats,index => ({
    id:'chat-'+index,name:'Synthetic log '+index,messages:make(size.messagesPerChat,message => ({
      name:message%2 ? 'Pilot' : 'Surveyor',is_user:!!(message%2),mes:'Message '+message+' '+prose.repeat(5),
    })),
  }));
  const normalized = TAStore.verify(lib);
  await TAUI.commitLibrary(normalized,[],true);
  return new TextEncoder().encode(JSON.stringify(normalized)).length;
}

async function measure(kind,index) {
  const ui = TAUI, card = kind === 'character';
  const settle = () => new Promise(done => setTimeout(done,0));
  const stamp = () => performance.now();
  if (ui.state.route !== (card ? 'characters' : 'lore')) ui.go(card ? 'characters' : 'lore');
  let id, open;
  if (card) {
    document.querySelector('[data-act="view-gallery"]').click();
    const buttons = [...document.querySelectorAll('[data-open-card]')];
    if (!buttons.length) throw Error('Gallery has no cards.');
    const button = buttons[index%buttons.length]; id = button.dataset.openCard;
    open = () => button.click();
  } else {
    const select = document.querySelector('#book-select');
    if (!select) throw Error('No world-book selector.');
    id = select.options[(index*7+1)%select.options.length].value;
    open = () => {select.value=id; select.dispatchEvent(new Event('change',{bubbles:true}));};
  }
  await settle();
  document.getElementById('stage').getBoundingClientRect();
  let start = stamp(); open();
  const field = document.querySelector(card ? '#char-form [data-field="description"]' : '#lore-editor [data-field="content"]');
  if (!field || (card ? ui.state.sel.character : ui.state.sel.book) !== id) throw Error('The selected editor did not open.');
  document.getElementById(card ? 'char-form' : 'lore-editor').getBoundingClientRect();
  const openToLayout = stamp()-start;
  const input = () => field.dispatchEvent(new Event('input',{bubbles:true}));
  const marker = ' [bench '+index+']';
  field.focus(); await settle();
  start = stamp(); field.value+=marker; input();
  const inputHandler = stamp()-start;
  document.getElementById('stage').getBoundingClientRect();
  const inputToLayout = stamp()-start;
  const item = card ? TAStore.byId(ui.state.lib.characters,id) :
    TAStore.byId(TAStore.byId(ui.state.lib.worldBooks,id).entries,ui.state.sel.entry);
  if (!item || !String(card ? item.description : item.content).endsWith(marker)) throw Error('Input did not reach the work.');
  // Isolate the write from the layout sample. The normal 320 ms typing debounce
  // is bypassed with flush(), which resolves after the real IndexedDB transaction.
  if (!(await ui.flush())) throw Error('Could not save the input sample.');
  field.value+='.'; input();
  if (ui.state.save !== 'dirty') throw Error('An unedited work cannot be timed.');
  start=stamp();
  if (!(await ui.flush()) || ui.state.save !== 'saved') throw Error('IndexedDB did not commit the edit.');
  const save = stamp()-start;
  return {openToLayout,inputHandler,inputToLayout,save,id,entryId:card ? null : ui.state.sel.entry,end:marker+'.'};
}

function statistics(values) {
  const sorted = values.toSorted((a,b)=>a-b), mid=(sorted.length-1)/2;
  const round = value => Number(value.toFixed(2));
  return {median:round((sorted[Math.floor(mid)]+sorted[Math.ceil(mid)])/2),p95:round(sorted[Math.ceil(sorted.length*.95)-1])};
}

if (process.versions.electron) {
  const suite = require('../test/desktop-fixture.cjs');
  suite('library-benchmark',async({run,open,win}) => {
    // Hidden Chromium windows can wait for a throttled frame inside a forced
    // layout. Exercise a shown, inactive window without covering the user's work.
    win.setSkipTaskbar(true);win.setOpacity(0);win.showInactive();win.setContentSize(1280,900);
    await open('index');
    const viewport=await run(()=>({width:innerWidth,height:innerHeight,visibility:document.visibilityState}));
    assert.equal(viewport.visibility,'visible');
    const bytes = await run(seed,size), measurements = {}, persisted = {};
    for (const kind of ['character','worldBook']) {
      const rows = [];
      for (let index=0;index<warmups+samples;index++) {
        const sample = await run(measure,kind,index);
        if (index>=warmups) rows.push(sample);
      }
      for (const row of rows) persisted[kind+':'+row.id] = {kind,...row};
      measurements[kind] = Object.fromEntries(['openToLayout','inputHandler','inputToLayout','save'].map(key => [key,statistics(rows.map(row => row[key]))]));
    }
    // Reload through the ordinary startup path to verify the final persisted edits.
    await open('index');
    assert.ok(await run(rows => rows.every(({kind,id,entryId,end}) => {
      const lib = TAUI.state.lib;
      const record = kind==='character' ? TAStore.byId(lib.characters,id) : TAStore.byId(TAStore.byId(lib.worldBooks,id)?.entries,entryId);
      return String(kind==='character' ? record?.description : record?.content).endsWith(end);
    }),Object.values(persisted)),'Edited works must survive a reload.');
    const report = {
      environment:{os:os.type()+' '+os.release(),arch:os.arch(),cpu:os.cpus()[0]?.model?.trim(),ramGiB:Number((os.totalmem()/2**30).toFixed(1)),
        electron:process.versions.electron,chromium:process.versions.chrome,viewport:viewport.width+'x'+viewport.height,visibility:viewport.visibility,gpu:'disabled'},
      library:{...size,serializedMiB:Number((bytes/2**20).toFixed(2))},samplesPerEditor:samples,discardedWarmupsPerEditor:warmups,
      milliseconds:measurements,
      method:'Shown, inactive window. Open and input-to-layout span the UI event through synchronous layout of the populated editor. Display paint is outside the measurement. Save spans flush through the IndexedDB commit, excluding the 320 ms typing debounce. Final edits were verified after reload.',
    };
    console.log(JSON.stringify(report,null,2));
  });
} else {
  const profile = await mkdtemp(path.join(os.tmpdir(),'quilvori-ui-benchmark-'));
  try {
    const env = {...process.env,QUILVORI_TEST_PROFILE:profile};
    delete env.ELECTRON_RUN_AS_NODE;
    const logPath = path.join(profile,'benchmark.log'), log = await openFile(logPath,'w');
    let code;
    try {
      code = await new Promise((resolve,reject) => {
        const child = spawn(require('electron'),['--user-data-dir='+profile,'--disable-gpu',fileURLToPath(import.meta.url)],
          {env,windowsHide:true,stdio:['ignore',log.fd,log.fd]});
        child.on('error',reject); child.on('close',status => resolve(status ?? 1));
      });
    } finally {await log.close();}
    process.stdout.write(await readFile(logPath,'utf8'));
    process.exitCode = code;
  } finally {
    if (path.dirname(path.resolve(profile)) !== path.resolve(os.tmpdir()) || !path.basename(profile).startsWith('quilvori-ui-benchmark-'))
      throw Error('Unexpected benchmark profile.');
    await rm(profile,{recursive:true,force:true,maxRetries:8,retryDelay:200});
  }
}
