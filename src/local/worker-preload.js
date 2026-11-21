'use strict';
// Preload của cửa sổ ẩn (chỉ cửa sổ này): ba hàm, không hơn. Không đưa ipcRenderer ra trang.
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('softeWorker', Object.freeze({
  ready: () => ipcRenderer.send('softe-local:ready'),
  onJob: (cb) => { ipcRenderer.on('softe-local:job', (e, job) => cb(job)); },
  done: (id, result) => ipcRenderer.send('softe-local:done', id, result),
}));
