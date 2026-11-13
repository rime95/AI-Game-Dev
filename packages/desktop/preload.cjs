// Exposes a small, explicit save-file API to the game page. The page never gets Node or filesystem access.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('stmDesktop', {
  listSaves: () => ipcRenderer.invoke('saves:list'),
  readSave: (id) => ipcRenderer.invoke('saves:read', id),
  writeSave: (id, meta, data) => ipcRenderer.invoke('saves:write', id, meta, data),
  deleteSave: (id) => ipcRenderer.invoke('saves:delete', id),
  savesFolder: () => ipcRenderer.invoke('saves:folder'),
  quit: () => ipcRenderer.send('app:quit'),
});
