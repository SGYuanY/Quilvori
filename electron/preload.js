const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nijanDesktop', {
  getPaths: () => ipcRenderer.invoke('folders:get'),
  pick: (kind) => ipcRenderer.invoke('folders:pick', kind),
  list: (folder) => ipcRenderer.invoke('folders:list', folder),
  read: (file) => ipcRenderer.invoke('folders:read', file),
  writeExpressions: (payload) => ipcRenderer.invoke('folders:writeExpressions', payload),
});
