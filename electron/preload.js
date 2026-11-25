const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nijanDesktop', {
  getPaths: () => ipcRenderer.invoke('folders:get'),
  pick: (kind) => ipcRenderer.invoke('folders:pick', kind),
  list: (folder) => ipcRenderer.invoke('folders:list', folder),
  read: (file) => ipcRenderer.invoke('folders:read', file),
  downloadLink: (payload) => ipcRenderer.invoke('links:download', payload),
  cancelLink: (id) => ipcRenderer.invoke('links:cancel', id),
  writeExpressions: (payload) => ipcRenderer.invoke('folders:writeExpressions', payload),
  installBundle: (files) => ipcRenderer.invoke('bundles:install', files),
});
