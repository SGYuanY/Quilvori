const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

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
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 900,
    minHeight: 660,
    backgroundColor: '#121319',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'index.html'));
}

app.whenReady().then(createWindow);

ipcMain.handle('folders:get', () => readPaths());
ipcMain.handle('folders:pick', async (event, kind) => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  if (result.canceled || !result.filePaths[0]) return readPaths();
  const paths = readPaths();
  paths[kind === 'worlds' ? 'worlds' : 'cards'] = result.filePaths[0];
  return writePaths(paths);
});
ipcMain.handle('folders:list', (event, folder) => {
  if (!folder || !fs.existsSync(folder)) return [];
  return fs.readdirSync(folder).filter((name) => /\.(json|png)$/i.test(name)).map((name) => ({ name, full: path.join(folder, name) }));
});
ipcMain.handle('folders:read', (event, file) => fs.readFileSync(file));
ipcMain.handle('folders:writeExpressions', (event, { folder, character, files }) => {
  const dest = path.join(folder, character, 'expressions');
  fs.mkdirSync(dest, { recursive: true });
  (files || []).forEach((file) => {
    const data = Buffer.from(String(file.dataUrl).split(',')[1] || '', 'base64');
    fs.writeFileSync(path.join(dest, file.name), data);
  });
  return dest;
});
