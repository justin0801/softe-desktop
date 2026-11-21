'use strict';
// Trang riêng của app (màn chờ, mất mạng) không có gì từ máy. Trang softe.ai (http / https) chỉ có MỘT đối tượng đóng băng, `window.softeLocal`,
// với ba lời gọi (softe-be/docs/ung-dung-may-tinh-chay-cuc-bo.md, mục 10.2). Không đưa ipcRenderer, đường dẫn, tệp hay biến môi trường ra trang;
// main kiểm lại mọi thứ (khung trên cùng, địa chỉ, mã dùng cho cả lần tải trang này, kích thước, nhịp).
const { contextBridge, ipcRenderer } = require('electron');

if (location.protocol === 'https:' || location.protocol === 'http:') {
  let token = null; // mã của lần tải trang này: preload chạy lại mỗi lần tải nên mã cũ không dùng lại được
  const hello = () => { if (!token) token = ipcRenderer.invoke('softe-local:hello'); return token; };
  contextBridge.exposeInMainWorld('softeLocal', Object.freeze({
    version: 1,
    capabilities: () => ipcRenderer.invoke('softe-local:capabilities'),
    extract: async (bytes, opts) => ipcRenderer.invoke('softe-local:extract', await hello(), { bytes, name: opts && opts.name, kind: opts && opts.kind }),
  }));
}
