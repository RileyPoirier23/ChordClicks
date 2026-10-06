const { contextBridge, ipcRenderer } = require('electron');
const inv = (ch, a) => ipcRenderer.invoke(ch, a);
contextBridge.exposeInMainWorld('rcc', {
  // virtual camera
  start: () => ipcRenderer.send('vcam:start'),
  stop: () => ipcRenderer.send('vcam:stop'),
  frame: b => ipcRenderer.send('vcam:frame', b),
  setupVcam: () => inv('vcam:setup'),
  onStatus: f => ipcRenderer.on('vcam:status', (_, m) => f(m)),
  // accounts + library
  auth: {
    status: () => inv('auth:status'),
    register: a => inv('auth:register', a),
    login: a => inv('auth:login', a),
    logout: () => inv('auth:logout'),
    deleteAccount: a => inv('auth:delete', a),
  },
  lib: {
    load: () => inv('lib:load'),
    save: l => inv('lib:save', l),
    exportTo: l => inv('lib:export', l),
    importFrom: () => inv('lib:import'),
  },
  version: () => inv('app:version'),
  saveRecording: (name, buf) => inv('rec:save', { name, data: buf }),
  savePdf: (name, html) => inv('pdf:save', { name, html }),
  setHotkeys: map => inv('hk:set', map),
  onHotkey: f => ipcRenderer.on('hk:fire', (_, a) => f(a)),
  sync: { status: () => inv('sync:status'), login: a => inv('sync:login', a), logout: () => inv('sync:logout'), run: l => inv('sync:run', l) },
});
