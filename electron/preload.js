const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('nijanDesktop', {
  sealModelKey: (id,key) => ipcRenderer.invoke('model-key:seal',id,key),
  openModelKey: (id,blob) => ipcRenderer.invoke('model-key:open',id,blob),
  getPaths: () => ipcRenderer.invoke('folders:get'),
  pick: (kind) => ipcRenderer.invoke('folders:pick', kind),
  list: (folder) => ipcRenderer.invoke('folders:list', folder),
  read: (file) => ipcRenderer.invoke('folders:read', file),
  downloadLink: (payload) => ipcRenderer.invoke('links:download', payload),
  cancelLink: (id) => ipcRenderer.invoke('links:cancel', id),
  writeExpressions: (payload) => ipcRenderer.invoke('folders:writeExpressions', payload),
  installBundle: (files) => ipcRenderer.invoke('bundles:install', files),
  themePick: () => ipcRenderer.invoke('themes:pick'),
  themeInspect: target => ipcRenderer.invoke('themes:inspect',target),
  themeRead: (target,name) => ipcRenderer.invoke('themes:read',target,name),
  themeActivate: (target,name,options) => ipcRenderer.invoke('themes:activate',target,name,options),
  themeInstall: (target,payload) => ipcRenderer.invoke('themes:install',target,payload),
  themeSample: id => ipcRenderer.invoke('themes:sample',id),
});
