const { contextBridge, ipcRenderer } = require('electron');

async function syncRequest(channel,...args) {
  const result=await ipcRenderer.invoke(channel,...args);
  if (result.ok) return result.value;
  // contextBridge copies only the standard fields of Error. A plain rejection
  // carries the stable code and message across both isolation boundaries.
  throw {name:channel.startsWith('world-sync:')?'WorldSyncError':'CardSyncError',code:result.code,message:result.code};
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
  worldSyncPick: () => syncRequest('world-sync:pick'),
  worldSyncRead: target => syncRequest('world-sync:read',target),
  worldSyncWrite: (target,hash,document,operationId) => syncRequest('world-sync:write',target,hash,document,operationId),
  worldSyncRestore: (target,hash,operationId) => syncRequest('world-sync:restore',target,hash,operationId),
  cardSyncPick: () => syncRequest('card-sync:pick'),
  cardSyncRead: target => syncRequest('card-sync:read',target),
  cardSyncWrite: (target,hash,bytes,operationId) => syncRequest('card-sync:write',target,hash,bytes,operationId),
  cardSyncRestore: (target,hash,operationId) => syncRequest('card-sync:restore',target,hash,operationId),
  themePick: () => ipcRenderer.invoke('themes:pick'),
  themeInspect: target => ipcRenderer.invoke('themes:inspect',target),
  themeRead: (target,name) => ipcRenderer.invoke('themes:read',target,name),
  themeActivate: (target,name,options) => ipcRenderer.invoke('themes:activate',target,name,options),
  themeInstall: (target,payload) => ipcRenderer.invoke('themes:install',target,payload),
  themeSample: id => ipcRenderer.invoke('themes:sample',id),
});
