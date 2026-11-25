const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { preserveLegacyProfile } = require('./profile');
const { downloadRemote } = require('./remote-import');
const { isTrustedSender, installNavigationPolicy } = require('./navigation');
const { exportExpressions } = require('./expression-export');
const { installBundle } = require('./st-bundle');
const appRoot = path.resolve(__dirname, '..');
const linkRequests = new Map();

preserveLegacyProfile(app);
// Electron scopes this lock to userData, including explicit isolated QA profiles.
const primaryInstance = app.requestSingleInstanceLock();
let mainWindow = null;

const storePath = () => path.join(app.getPath('userData'), 'folders.json');

function readPaths() {
  try { return Object.assign({ cards: '', worlds: '' }, JSON.parse(fs.readFileSync(storePath(), 'utf8'))); }
  catch (error) { return { cards: '', worlds: '' }; }
}

function writePaths(next) {
  fs.mkdirSync(path.dirname(storePath()), { recursive: true });
  fs.writeFileSync(storePath(), JSON.stringify(next, null, 2));
  return next;
}

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 660,
    title: 'Quilvori · 叙翎集',
    icon: path.join(__dirname, '..', 'img', process.platform === 'win32' ? 'quilvori.ico' : 'quilvori.png'),
    backgroundColor: '#191b19',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow = win;
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
  installNavigationPolicy(win.webContents, appRoot, url => shell.openExternal(url));
  win.loadFile(path.join(__dirname, '..', 'index.html'));
  return win;
}

function focusWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    if (app.isReady()) createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

if (!primaryInstance) app.quit();
else {
  app.on('second-instance', focusWindow);
  app.on('activate', focusWindow);
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.whenReady().then(createWindow);
}

function handleTrusted(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event, appRoot)) {
      if (channel.startsWith('links:')) return { ok: false, code: 'invalid-url' };
      throw new Error('Untrusted application frame');
    }
    return handler(event, ...args);
  });
}

handleTrusted('folders:get', () => readPaths());
handleTrusted('folders:pick', async (event, kind) => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (result.canceled || !result.filePaths[0]) return readPaths();
  const paths = readPaths();
  paths[kind === 'worlds' ? 'worlds' : 'cards'] = result.filePaths[0];
  return writePaths(paths);
});
handleTrusted('folders:list', (event, folder) => {
  if (!folder) return [];
  if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) throw new Error('文件夹不存在，请重新选择。');
  return fs.readdirSync(folder, { withFileTypes: true }).filter((item) => item.isFile() && /\.(json|png)$/i.test(item.name)).map((item) => ({ name: item.name, full: path.join(folder, item.name) }));
});
handleTrusted('folders:read', (event, file) => fs.readFileSync(file));
handleTrusted('links:download', async (event, payload) => {
  if (!payload || !/^[a-zA-Z0-9_-]{1,80}$/.test(payload.id || '') || typeof payload.url !== 'string' || payload.url.length > 8192) return { ok:false, code:'invalid-url' };
  const owner = event.sender.id, key = `${owner}/${payload.id}`;
  if ([...linkRequests.keys()].filter((item) => item.startsWith(`${owner}/`)).length >= 2 || linkRequests.has(key)) return { ok:false, code:'busy' };
  const controller = new AbortController(); linkRequests.set(key,controller);
  const abort = () => controller.abort(); event.sender.once('destroyed',abort);
  try { return Object.assign({ ok:true },await downloadRemote(payload.url,{signal:controller.signal})); }
  catch (error) { return { ok:false, code:error.code || 'network' }; }
  finally { event.sender.removeListener('destroyed',abort);linkRequests.delete(key); }
});
handleTrusted('links:cancel', (event, id) => { linkRequests.get(`${event.sender.id}/${id}`)?.abort(); });
handleTrusted('folders:writeExpressions', (event, payload) => exportExpressions(payload, fs));
handleTrusted('bundles:install', async (event, files) => {
  const result = await dialog.showOpenDialog({ properties:['openDirectory'] });
  if (result.canceled || !result.filePaths[0]) return {canceled:true};
  try { return {ok:true,...await installBundle(result.filePaths[0],files)}; }
  catch (err) { return {ok:false,code:err.file !== undefined ? err.code : 'write-failed',file:err.file || ''}; }
});
