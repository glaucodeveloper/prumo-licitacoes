'use strict';
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('prumo', {
  getConfig: () => ipcRenderer.invoke('prumo:config'),
  validateConfig: (value) => ipcRenderer.invoke('prumo:validate-config', value),
  saveConfig: (value) => ipcRenderer.invoke('prumo:save-config', value),
});
