const { contextBridge, ipcRenderer } = require('electron');

async function worldRequest(channel,...args) {
  const result=await ipcRenderer.invoke('world-sync:'+channel,...args);
  if (result.ok) return result.value;
  // contextBridge copies only the standard fields of Error. A plain rejection
  // carries the stable code and message across both isolation boundaries.
  throw {name:'WorldSyncError',code:result.code,message:result.code};
}

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
  worldSyncPick: () => worldRequest('pick'),
  worldSyncRead: target => worldRequest('read',target),
  worldSyncWrite: (target,hash,document,operationId) => worldRequest('write',target,hash,document,operationId),
  worldSyncRestore: (target,hash,operationId) => worldRequest('restore',target,hash,operationId),
  themePick: () => ipcRenderer.invoke('themes:pick'),
  themeInspect: target => ipcRenderer.invoke('themes:inspect',target),
  themeRead: (target,name) => ipcRenderer.invoke('themes:read',target,name),
  themeActivate: (target,name,options) => ipcRenderer.invoke('themes:activate',target,name,options),
  themeInstall: (target,payload) => ipcRenderer.invoke('themes:install',target,payload),
  themeSample: id => ipcRenderer.invoke('themes:sample',id),
});
