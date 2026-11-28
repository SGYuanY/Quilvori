import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {syncEntryScripts} from '../scripts/entry-scripts.mjs';

const mainEntry = new URL('../electron/main.js', import.meta.url);
const mainRequire = createRequire(mainEntry);
const policy = mainRequire('./navigation');
const appRoot = fileURLToPath(new URL('../', import.meta.url));
const local = name => pathToFileURL(path.join(appRoot, name)).href;
const native = value => JSON.parse(JSON.stringify(value));
let total = 0;
async function test(name, run) { await run(); total++; console.log('ok', name); }

function contents(url = local('index.html')) {
  const web = new EventEmitter();
  web.id = 7; web.isDestroyed = () => false;
  web.mainFrame = { url, parent: null };
  web.setWindowOpenHandler = handler => { web.openWindow = handler; };
  return web;
}

await test('all shipped app pages retain local navigation including entity hashes and query parameters', () => {
  const pages = fs.readdirSync(appRoot).filter(name => name.endsWith('.html'));
  assert.deepEqual(pages.sort(), [...policy.appPages].sort());
  syncEntryScripts(appRoot, {check:true});
  assert.ok(pages.includes('resources.html') && pages.includes('characters.html'));
  for (const page of pages) {
    assert.equal(policy.isTrustedLocalUrl(local(page), appRoot), true, page);
    assert.equal(policy.isTrustedLocalUrl(`${local(page)}?entry=entry_1#book_1`, appRoot), true, page);
  }
});


await test('the build repairs only the marked scripts and checks the resulting order without writing', () => {
  const temp = fs.realpathSync(tmpdir());
  const root = fs.mkdtempSync(path.join(temp, 'quilvori-entry-scripts-'));
  const file = name => path.join(root, name);
  const read = name => fs.readFileSync(file(name), 'utf8');
  const tags = ['one', 'two'].map(name => '  <script src="js/'+name+'.js"></script>');
  const entry = (name, scripts) => [
    '<!DOCTYPE html>', '<title>'+name+'</title>', '<body data-page="'+name+'">',
    '  <a href="lore.html?entry=sample#book">Open book</a>',
    '  <!-- Shared scripts (source: index.html) -->', ...scripts, '  <!-- End shared scripts -->',
    '  <script src="js/local.js"></script>', '</body>', '',
  ].join(name === 'index.html' ? '\n' : '\r\n');
  try {
    fs.mkdirSync(file('js'));
    for (const name of ['one', 'two', 'local']) fs.writeFileSync(file('js/'+name+'.js'), '');
    for (const name of policy.appPages) {
      fs.writeFileSync(file(name), entry(name, name === 'lore.html' ? tags.toReversed() : tags));
    }

    assert.throws(() => syncEntryScripts(root, {check:true}), /stale in lore\.html/);
    assert.equal(read('lore.html'), entry('lore.html', tags.toReversed()));
    syncEntryScripts(root);
    for (const name of policy.appPages) assert.equal(read(name), entry(name, tags), name);
    const stableTime = new Date(2000, 0, 1);
    fs.utimesSync(file('lore.html'), stableTime, stableTime);
    syncEntryScripts(root);
    syncEntryScripts(root, {check:true});
    assert.equal(fs.statSync(file('lore.html')).mtimeMs, stableTime.getTime());

    fs.writeFileSync(file('index.html'), entry('index.html', [tags[0], tags[0]]));
    assert.throws(() => syncEntryScripts(root), /Duplicate shared script.*one\.js/);
    fs.writeFileSync(file('index.html'), entry('index.html', [...tags, '  <script src="js/missing.js"></script>']));
    assert.throws(() => syncEntryScripts(root, {check:true}), /index\.html.*missing script.*missing\.js/);
    fs.writeFileSync(file('index.html'), entry('index.html', tags));

    fs.writeFileSync(file('lore.html'), entry('lore.html', tags.toReversed()));
    fs.writeFileSync(file('tutorial.html'), entry('tutorial.html', ['  <p>Keep this content</p>']));
    assert.throws(() => syncEntryScripts(root), /tutorial\.html.*unexpected content/);
    assert.equal(read('lore.html'), entry('lore.html', tags.toReversed()), 'preflight the other pages before writing');
    fs.writeFileSync(file('tutorial.html'), entry('tutorial.html', tags).replace('js/local.js', 'js/absent.js?rev=1'));
    assert.throws(() => syncEntryScripts(root, {check:true}), /tutorial\.html.*missing script.*absent\.js/);
    fs.writeFileSync(file('tutorial.html'), entry('tutorial.html', tags).replace('js/local.js', './js/one.js?rev=1'));
    assert.throws(() => syncEntryScripts(root), /tutorial\.html.*outside its block/);
    fs.unlinkSync(file('tutorial.html'));
    assert.throws(() => syncEntryScripts(root, {check:true}), /ENOENT.*tutorial\.html/);
  } finally {
    assert.equal(path.dirname(fs.realpathSync(root)), temp);
    fs.rmSync(root, {recursive:true, force:true});
  }
});

await test('other local files, nested pages and web content cannot become trusted application pages', () => {
  for (const value of [local('unknown.html'), local('js/ui.js'), local('nested/index.html'), local('../index.html'),
    'https://example.com/index.html', 'http://localhost/index.html', 'about:blank', 'data:text/html,test',
    'file://example.com/index.html', `${local('index.html')}/%2f../outside.html`]) {
    assert.equal(policy.isTrustedLocalUrl(value, appRoot), false);
  }
});

await test('privileged IPC requires the live main frame, not a local-looking iframe or remote page', () => {
  const web = contents();
  assert.equal(policy.isTrustedSender({ sender: web, senderFrame: web.mainFrame }, appRoot), true);
  for (const frame of [null, { url: local('index.html'), parent: web.mainFrame }, { url: local('index.html'), parent: null }]) {
    assert.equal(policy.isTrustedSender({ sender: web, senderFrame: frame }, appRoot), false);
  }
  web.mainFrame.url = 'https://example.com/source';
  assert.equal(policy.isTrustedSender({ sender: web, senderFrame: web.mainFrame }, appRoot), false);
  web.mainFrame.url = local('index.html'); web.isDestroyed = () => true;
  assert.equal(policy.isTrustedSender({ sender: web, senderFrame: web.mainFrame }, appRoot), false);
});

await test('external HTTP(S) links retain their destination while credentials and unsafe protocols are rejected', () => {
  for (const url of ['https://example.com/post/7?view=full#comment-2', 'http://example.com/help']) assert.equal(policy.safeExternalUrl(url), url);
  for (const url of ['https://user:fixture@example.com/post', 'https://user@example.com/post', 'file:///private.txt',
    'javascript:alert(1)', 'data:text/html,test', 'blob:https://example.com/id', 'discord://channel/1',
    '//example.com', 'https:example.com', 'https://example.com/\nnext', 'https://example.com/' + 'a'.repeat(8192)]) {
    assert.equal(policy.safeExternalUrl(url), null);
  }
});

await test('popups are denied and remote navigation opens the system browser instead of replacing the app', () => {
  const web = contents(), opened = [];
  policy.installNavigationPolicy(web, appRoot, url => { opened.push(url); return Promise.resolve(); });
  assert.deepEqual(web.openWindow({ url: 'https://example.com/source' }), { action: 'deny' });
  assert.deepEqual(opened, ['https://example.com/source']);
  web.openWindow({ url: 'javascript:alert(1)' }); web.openWindow({ url: local('index.html') });
  assert.equal(opened.length, 1);
  for (const eventName of ['will-navigate', 'will-redirect']) {
    let prevented = false;
    web.emit(eventName, { preventDefault() { prevented = true; } }, 'https://example.com/remote');
    assert.equal(prevented, true); assert.equal(opened.at(-1), 'https://example.com/remote');
    prevented = false;
    web.emit(eventName, { preventDefault() { prevented = true; } }, local('lore.html') + '#book_1');
    assert.equal(prevented, false);
  }
  const before = opened.length;
  let prevented = false;
  web.emit('will-navigate', { preventDefault() { prevented = true; } }, { url: 'file:///untrusted.txt' });
  assert.equal(prevented, true); assert.equal(opened.length, before);
  assert.equal(web.listenerCount('will-download'), 0, 'the browser download path remains unchanged');
});

await test('an unavailable system URL handler never turns a denied popup into a child window', async () => {
  for (const open of [() => { throw new Error('missing handler'); }, () => Promise.reject(new Error('missing handler'))]) {
    const web = contents(); policy.installNavigationPolicy(web, appRoot, open);
    assert.deepEqual(web.openWindow({ url: 'https://example.com/source' }), { action: 'deny' });
    await new Promise(resolve => setImmediate(resolve));
  }
});

function mainEnvironment(options = {}) {
  const calls = [], handlers = new Map(), windows = [];
  const configured = { cards: path.join(appRoot, 'test-cards'), worlds: path.join(appRoot, 'test-worlds') };
  const appData = path.join(appRoot, 'test-app-data');
  const paths = { appData, userData: options.profile || path.join(appData, 'Quilvori'), sessionData: options.profile || path.join(appData, 'Quilvori') };
  const lifecycle = { ready: false, quits: 0, lockedProfiles: [], readyCallbacks: [] };
  const fakeFs = {
    mkdirSync() { calls.push('mkdir'); },
    promises: options.folderIO || { readFile: async () => JSON.stringify(configured) },
  };
  const app = new EventEmitter();
  Object.assign(app, { getName: () => 'Quilvori', getLocale: ()=>'en-US', getPath: name => paths[name], setPath: (name, value) => { paths[name] = value; },
    requestSingleInstanceLock: () => { lifecycle.lockedProfiles.push(paths.userData); return options.lock !== false; },
    quit: () => { lifecycle.quits++; }, isReady: () => lifecycle.ready,
    whenReady: () => ({ then: run => { lifecycle.readyCallbacks.push(run); if (options.ready !== false) { lifecycle.ready = true; run(); } } }),
  });
  const electron = {
    app,
    BrowserWindow: class extends EventEmitter {
      constructor(options) { super(); this.options = options; this.webContents = contents(); this.actions = []; this.destroyed = false; this.minimized = false; windows.push(this); }
      loadFile(file) { this.loaded = file; }
      isDestroyed() { return this.destroyed; }
      isMinimized() { return this.minimized; }
      restore() { this.minimized = false; this.actions.push('restore'); }
      show() { this.actions.push('show'); }
      focus() { this.actions.push('focus'); }
      close() { this.destroyed = true; this.emit('closed'); }
    },
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    dialog: {
      showOpenDialog: async (owner,picker) => {
        calls.push('pick');
        if (options.syncPick) return options.syncPick(owner,picker);
        return {canceled:false,filePaths:[configured.cards]};
      },
      showMessageBox: async (win,prompt) => {
        assert.equal(win,windows[0]);assert.equal(prompt.defaultId,0);assert.equal(prompt.cancelId,0);
        assert.ok(prompt.detail.includes('happy.png'));calls.push('confirm-overwrite');
        options.afterExpressionPrompt?.(configured);
        return {response:options.expressionResponse ?? 0};
      },
    },
    shell: { openExternal: async () => { calls.push('external'); } },
  };
  const get = name => {
    if (name === 'electron') return electron;
    if (name === 'fs') return fakeFs;
    if (name === './profile') return { preserveLegacyProfile: app => mainRequire(name).preserveLegacyProfile(app, fakeFs) };
    if (name === './remote-import') return { downloadRemote: async () => { calls.push('download'); return { bytes: new Uint8Array([1]), url: 'https://example.com/file.json' }; } };
    if (name === './navigation') return policy;
    if (name === './world-sync' && options.worldService) return {
      createWorldSync:()=>options.worldService,
      publicError:mainRequire(name).publicError,
    };
    if (name === './card-sync' && options.cardService) return {
      createCardSync:()=>options.cardService,
      publicError:mainRequire(name).publicError,
    };
    if (name === './expression-export') return {
      overwriteOptions: mainRequire(name).overwriteOptions,
      exportExpressions: async (payload,_io,{confirm,allowed})=>{
        calls.push('expression-plan');
        const directory=path.join(payload.folder,payload.character,'expressions');
        if(options.conflictingExpression && !await confirm({directory,names:['happy.png'],count:payload.files.length}))return {canceled:true};
        assert.equal(await allowed(),true);
        calls.push('expression-write');return directory;
      },
    };

    if (name === './st-bundle') return { installBundle: async (directory,files) => { calls.push('install'); return {directory,count:files.length}; } };
    return mainRequire(name);
  };
  vm.runInNewContext(fs.readFileSync(mainEntry, 'utf8'), {
    require: get, __dirname: path.join(appRoot, 'electron'), process: { platform: options.platform || process.platform }, Buffer, AbortController, console,
  }, { filename: 'electron/main.js' });
  return { calls, handlers, windows, configured, app, paths, lifecycle };
}

await test('every registered privileged IPC rejects remote and subframe callers before filesystem or network work', async () => {
  const env = mainEnvironment();
  assert.deepEqual([...env.handlers.keys()].sort(), [
    'model-key:seal','model-key:open',
    'folders:get','folders:pick','folders:list','folders:read','folders:writeExpressions','bundles:install',
    'links:download','links:cancel','themes:pick','themes:inspect','themes:read','themes:activate','themes:install','themes:sample',
    'world-sync:pick','world-sync:read','world-sync:write','world-sync:restore',
    'card-sync:pick','card-sync:read','card-sync:write','card-sync:restore',
  ].sort());
  for (const kind of ['remote', 'iframe', 'unknown-local']) {
    const web = contents(kind === 'remote' ? 'https://example.com' : kind === 'unknown-local' ? local('unknown.html') : local('index.html'));
    const frame = kind === 'iframe' ? { url: local('index.html'), parent: web.mainFrame } : web.mainFrame;
    for (const [channel, handler] of env.handlers) {
      const before = env.calls.length;
      if (channel.startsWith('links:')) assert.deepEqual(native(await handler({ sender: web, senderFrame: frame })), { ok: false, code: 'invalid-url' });
      else await assert.rejects(async () => handler({ sender: web, senderFrame: frame }), /Untrusted application frame/);
      assert.equal(env.calls.length, before, channel);
    }
  }
});

for (const kind of ['card','world']) {
await test(kind+' sync binds only the native picker selection and exposes stable errors without file paths',async()=>{
  const folder=kind==='world'?'worlds':'cards', filename=kind==='world'?'Chosen.json':'Chosen.png';
  const selected=path.join(appRoot,'test-'+folder,filename),grant='confirmed-file';
  let cancel=false,navigate=false;
  const operations=[];
  const env=mainEnvironment({syncPick:async(owner,picker)=>{
    assert.equal(owner,env.windows[0]);assert.deepEqual(native(picker.properties),['openFile']);
    assert.deepEqual(native(picker.filters[0].extensions),kind==='world'?['json']:['png','json']);
    assert.equal(picker.defaultPath,env.configured[folder]);
    if(navigate)owner.webContents.mainFrame.url='https://example.com';
    return {canceled:cancel,filePaths:cancel?[]:[selected]};
  },[kind+'Service']:{
    bind:async file=>{operations.push(['pick',file]);return {target:grant};},
    read:async target=>{operations.push(['read',target]);throw Object.assign(new Error(selected),{code:'ENOENT'});},
    write:async(...args)=>{operations.push(['write',...args]);return {target:grant};},
    restore:async(...args)=>{operations.push(['restore',...args]);return {target:grant};},
  }});
  const sender=env.windows[0].webContents,event={sender,senderFrame:sender.mainFrame};
  const prefix=kind+'-sync';
  const call=(channel,...args)=>env.handlers.get(prefix+':'+channel)(event,...args);
  assert.deepEqual(native(await call('pick','unselected.json')),{ok:true,value:{target:grant}});
  const document=kind==='world'?{entries:{}}:new Uint8Array([1,2,3]);
  await call('write',grant,'reviewed',document,'op1');await call('restore',grant,'written','op2');
  assert.deepEqual(native(await call('read',grant)),{ok:false,code:prefix+'-io'});
  cancel=true;assert.deepEqual(native(await call('pick')),{ok:true,value:null});
  cancel=false;navigate=true;assert.deepEqual(native(await call('pick')),{ok:false,code:prefix+'-unsafe'});
  const other=contents();assert.deepEqual(native(await env.handlers.get(prefix+':read')({sender:other,senderFrame:other.mainFrame},grant)),{ok:false,code:prefix+'-unsafe'});
  assert.deepEqual(operations,[['pick',selected],['write',grant,'reviewed',document,'op1'],['restore',grant,'written','op2'],['read',grant]]);
});
}

await test('trusted main-frame folder workflows and bounded link downloads keep their existing behavior', async () => {
  const env = mainEnvironment(), window = env.windows[0], web = window.webContents;
  const event = { sender: web, senderFrame: web.mainFrame }, call = (channel, value) => env.handlers.get(channel)(event, value);
  assert.equal(window.loaded, path.join(appRoot, 'index.html')); assert.equal(typeof web.openWindow, 'function');
  assert.deepEqual(native(await call('folders:get')), env.configured);
  assert.equal(await call('folders:writeExpressions', { folder: env.configured.cards, character: 'Example', files: [{ name: 'happy.png', dataUrl: 'data:image/png;base64,AA==' }] }), path.join(env.configured.cards, 'Example', 'expressions'));
  assert.equal((await call('links:download', { id: 'request_1', url: 'https://example.com/file.json' })).ok, true);
  assert.doesNotThrow(() => call('links:cancel', 'request_1'));
  assert.equal(web.listenerCount('destroyed'), 0);
  assert.ok(env.calls.includes('expression-write') && env.calls.includes('download'));
  const beforeInstall = env.calls.length;
  assert.deepEqual(native(await call('bundles:install', [])), { ok:true, directory:env.configured.cards, count:0 });
  assert.deepEqual(env.calls.slice(beforeInstall), ['pick','install']);
});

await test('native folder choices persist together and import the selected cards and world books through the renderer adapter', async () => {
  const io = fs.promises, tempParent = await io.realpath(os.tmpdir());
  const temp = await io.mkdtemp(path.join(tempParent, 'quilvori-native-folders-'));
  const profile = path.join(temp, 'profile'), cards = path.join(temp, 'My cards'), worlds = path.join(temp, 'My worlds');
  const replacement = path.join(temp, 'Another collection'), nested = path.join(cards, 'More');
  try {
    await Promise.all([profile, worlds, replacement, nested].map(directory => io.mkdir(directory, { recursive: true })));
    const settings = path.join(profile, 'folders.json'), existing = { cards: '', worlds: '', extra: 'preserved setting' };
    await io.writeFile(settings, JSON.stringify(existing));
    const renderer = vm.createContext({ console, JSON, TextEncoder, TextDecoder, Uint8Array, Uint32Array, DataView, URL,
      crypto: webcrypto, structuredClone, btoa, atob });
    for (const module of ['resource-source', 'png', 'formats', 'store', 'folder-import']) {
      vm.runInContext(await io.readFile(path.join(appRoot, 'js', module + '.js'), 'utf8'), renderer);
    }
    const card = name => JSON.stringify({ spec: 'chara_card_v2', data: { name, description: 'A test pilot' } });
    const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZlsAAAAASUVORK5CYII=', 'base64');
    const image = renderer.TAPng.embedChara(pixel, card('Illustrated Pilot'));
    const atlas = JSON.stringify({ name: 'Tide Atlas', entries: { 1: { uid: 1, comment: 'Harbor', key: ['sea'], content: 'Open at dawn' } } });
    await Promise.all([
      io.writeFile(path.join(cards, 'Pilot.JSON'), card('Pilot')), io.writeFile(path.join(cards, '画片.PNG'), image),
      io.writeFile(path.join(cards, 'notes.txt'), 'Notes'), io.writeFile(path.join(nested, 'Nested.json'), card('Nested')),
      io.writeFile(path.join(worlds, 'Atlas.json'), atlas), io.writeFile(path.join(worlds, 'cover.png'), pixel),
    ]);
    const choices = [cards, worlds, replacement];
    let changeAfterListing;
    const folderIO = Object.assign(Object.create(io), { readdir: async (...args) => {
      const entries = await io.readdir(...args);
      if (changeAfterListing) await changeAfterListing();
      return entries;
    } });
    const env = mainEnvironment({ profile, folderIO, syncPick: (owner, picker) => {
      assert.equal(owner, env.windows[0]); assert.deepEqual(native(picker.properties), ['openDirectory']);
      const folder = choices.shift();
      return { canceled: !folder, filePaths: folder ? [folder] : [] };
    } });
    const callIn = main => {
      const sender = main.windows[0].webContents, event = { sender, senderFrame: sender.mainFrame };
      return (channel, value) => main.handlers.get('folders:' + channel)(event, value);
    };
    const call = callIn(env);
    assert.deepEqual(await call('get'), existing);
    await Promise.all([call('pick', 'cards'), call('pick', 'worlds')]);
    const selected = { ...existing, cards, worlds };
    assert.deepEqual(await call('get'), selected);
    assert.deepEqual((await call('list', cards)).map(f => f.name).sort(), ['Pilot.JSON', '画片.PNG']);
    assert.deepEqual(await call('list', worlds), [{ name: 'Atlas.json', full: path.join(worlds, 'Atlas.json') }]);
    assert.deepEqual(await call('read', path.join(cards, '画片.PNG')), Buffer.from(image));
    await assert.rejects(call('read', path.join(worlds, 'cover.png')), /文件类型/);
    const adapter = { list: folder => call('list', folder), read: file => call('read', file) };
    const scan = library => renderer.TAFolderImport.importAll(library, selected, adapter);
    const imported = await scan(renderer.TAStore.emptyLibrary());
    assert.deepEqual([imported.report.cards, imported.report.books, imported.report.failed.length], [2, 1, 0]);
    assert.equal((await scan(imported.library)).report.unchanged, 3);
    assert.equal(await io.readFile(path.join(worlds, 'Atlas.json'), 'utf8'), atlas);
    changeAfterListing = async () => {
      assert.deepEqual(await call('pick', 'cards'), { ...selected, cards: replacement });
      changeAfterListing = null;
    };
    await assert.rejects(call('list', cards), /选择/);
    await assert.rejects(call('list', cards), /选择/);
    await assert.rejects(call('read', path.join(cards, 'Pilot.JSON')), /选择/);
    assert.deepEqual(await call('pick', 'cards'), { ...selected, cards: replacement });
    assert.deepEqual(await callIn(mainEnvironment({ profile, folderIO: io }))('get'), { ...selected, cards: replacement });
    assert.deepEqual(await io.readdir(profile), ['folders.json']);
  } finally {
    const owned = await io.realpath(temp);
    assert.equal(path.dirname(owned), tempParent);
    assert.ok(path.basename(owned).startsWith('quilvori-native-folders-'));
    await io.rm(owned, { recursive: true, force: true });
  }
});

await test('expression IPC binds approval and publication to the actual owner window and its currently configured cards folder',async()=>{
  for(const scenario of ['different-folder','other-window','cancel','approved','folder-changed']){
    const env=mainEnvironment({conflictingExpression:true,expressionResponse:scenario==='cancel'?0:1,
      afterExpressionPrompt:folders=>{if(scenario==='folder-changed')folders.cards=path.join(appRoot,'changed-cards');}});
    const sender=scenario==='other-window'?contents():env.windows[0].webContents;
    const payload={folder:scenario==='different-folder'?env.configured.worlds:env.configured.cards,character:'Example',
      files:[{name:'happy.png',dataUrl:'data:image/png;base64,AA=='}]};
    const result=await env.handlers.get('folders:writeExpressions')({sender,senderFrame:sender.mainFrame},payload);
    if(scenario==='approved')assert.equal(result,path.join(payload.folder,payload.character,'expressions'));
    else if(scenario==='cancel'||scenario==='folder-changed')assert.deepEqual(native(result),{canceled:true});
    else assert.deepEqual(native(result),{ok:false,code:'invalid-expression-folder'});
    assert.equal(env.calls.includes('confirm-overwrite'),!['different-folder','other-window'].includes(scenario));
    assert.equal(env.calls.includes('expression-write'),scenario==='approved');
  }
});

await test('single-instance locking follows the preserved profile while explicit QA profiles stay isolated', () => {
  const normal = mainEnvironment();
  assert.equal(normal.lifecycle.lockedProfiles[0], path.join(normal.paths.appData, 'nijan'));
  const isolatedPath = path.join(appRoot, 'test-isolated-profile'), isolated = mainEnvironment({ profile: isolatedPath });
  assert.equal(isolated.lifecycle.lockedProfiles[0], isolatedPath);
  assert.notEqual(isolated.lifecycle.lockedProfiles[0], normal.lifecycle.lockedProfiles[0]);
  const duplicate = mainEnvironment({ lock: false });
  assert.equal(duplicate.lifecycle.quits, 1); assert.equal(duplicate.windows.length, 0); assert.equal(duplicate.lifecycle.readyCallbacks.length, 0);
});

await test('repeated starts restore and focus the existing window without creating another window', () => {
  const env = mainEnvironment(), first = env.windows[0]; first.minimized = true;
  env.app.emit('second-instance');
  assert.deepEqual(first.actions, ['restore', 'show', 'focus']); assert.equal(env.windows.length, 1);
  env.app.emit('second-instance'); assert.equal(env.windows.length, 1);
  assert.equal(first.actions.filter(action => action === 'restore').length, 1);
});

await test('closing all windows exits on Windows and Linux while macOS activation recreates one', () => {
  for (const platform of ['win32', 'linux', 'darwin']) {
    const env = mainEnvironment({ platform }); env.windows[0].close(); env.app.emit('window-all-closed');
    assert.equal(env.lifecycle.quits, platform === 'darwin' ? 0 : 1);
    if (platform === 'darwin') {
      env.app.emit('activate'); assert.equal(env.windows.length, 2); assert.equal(env.windows[1].loaded, path.join(appRoot, 'index.html'));
      env.app.emit('activate'); assert.equal(env.windows.length, 2); assert.ok(env.windows[1].actions.includes('focus'));
    }
  }
});

await test('a repeated start before readiness does not create an early or duplicate window', () => {
  const env = mainEnvironment({ ready: false });
  env.app.emit('second-instance'); env.app.emit('activate'); assert.equal(env.windows.length, 0);
  env.lifecycle.ready = true; env.lifecycle.readyCallbacks.forEach(run => run());
  assert.equal(env.windows.length, 1); env.app.emit('second-instance'); assert.equal(env.windows.length, 1);
});

console.log(`${total} navigation and IPC checks passed`);
