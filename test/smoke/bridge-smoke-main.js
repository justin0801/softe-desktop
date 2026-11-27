'use strict';
// Thử THẬT trên Electron: trang web (máy chủ cục bộ giả softe.ai) gọi window.softeLocal qua preload + ipc thật, và cửa sổ ẩn không ra được mạng.
// Chạy: xvfb-run -a npx electron --no-sandbox test/smoke/bridge-smoke-main.js
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, session, protocol, powerMonitor } = require('electron');
const { registerScheme, createWorkerHost } = require('../../src/local/worker-host');
const { install } = require('../../src/local');
const settings = require('../../src/local/settings');
const { makePdf } = require('../helpers/make-pdf');

registerScheme(protocol);
// Máy thử có thể không đủ "khỏe" theo luật của app: giả cấu hình để thử đường chính (luật khỏe / yếu đã có test riêng).
os.totalmem = () => 16 * 1024 ** 3; os.cpus = () => new Array(8).fill({});
powerMonitor.isOnBatteryPower = () => false;

const results = [];
const note = (name, ok, info = '') => { results.push([name, ok, info]); };
const pdfBase64 = Buffer.from(makePdf(['Hop dong thue nha so mot hai ba bon nam sau bay tam chin. Ben A giao nha cho ben B vao ngay ky hop dong, tien thue tra moi thang mot lan.'])).toString('base64');
const PAGE = `<!doctype html><title>start</title><script>
(async () => {
  const out = {};
  try {
    out.has = typeof window.softeLocal;
    out.keys = Object.keys(window.softeLocal || {}).sort().join(',');
    out.frozen = Object.isFrozen(window.softeLocal);
    out.caps = await window.softeLocal.capabilities();
    const bin = Uint8Array.from(atob('${pdfBase64}'), (c) => c.charCodeAt(0));
    out.ok = await window.softeLocal.extract(bin, { name: 'a.pdf', kind: 'pdf' });
    out.bad = await window.softeLocal.extract(new Uint8Array([1, 2, 3]), { name: 'a.pdf', kind: 'docx' });
    out.leak = [typeof window.require, typeof window.process, typeof window.ipcRenderer, typeof window.electron].join(',');
  } catch (e) { out.err = String(e); }
  document.title = 'RESULT:' + JSON.stringify(out);
})();
</script>`;

app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const server = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(PAGE); });
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  const site = `http://127.0.0.1:${server.address().port}`;
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'softe-smoke-'));
  settings.writeEnabled(path.join(userData, settings.NAME), fs, true);
  const dir = path.join(__dirname, '..', '..', 'src', 'local');
  install({ electron: { app, ipcMain, powerMonitor, BrowserWindow, session }, cfg: { site }, version: '1.4.0', userData, dir });

  // 1) trang web thật gọi ô cửa
  const w = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, preload: path.join(__dirname, '..', '..', 'src', 'preload.js') } });
  const got = await new Promise((resolve) => {
    w.on('page-title-updated', (e, t) => { if (t.startsWith('RESULT:')) resolve(JSON.parse(t.slice(7))); });
    w.loadURL(`${site}/`);
    setTimeout(() => resolve({ err: 'het gio' }), 40000);
  });
  note('co window.softeLocal, dong bang, dung 3 thu', got.has === 'object' && got.frozen === true && got.keys === 'capabilities,extract,version', JSON.stringify([got.has, got.frozen, got.keys]));
  note('trang khong thay require / process / ipcRenderer', got.leak === 'undefined,undefined,undefined,undefined', String(got.leak));
  note('capabilities ok', got.caps && got.caps.extract === 'ok' && got.caps.maxBytes > 0, JSON.stringify(got.caps));
  note('extract doc PDF that qua cua so an', got.ok && got.ok.ok === true && /Hop dong thue nha/.test(got.ok.text) && got.ok.by === 'desktop/1.4.0', JSON.stringify(got.ok).slice(0, 150));
  note('kind la docx -> unsupported', got.bad && got.bad.ok === false && got.bad.reason === 'unsupported', JSON.stringify(got.bad));
  note('khong co loi o trang', !got.err, String(got.err || ''));
  w.destroy();

  // 2) một trang KHÔNG phải softe.ai (cùng preload) không có gì dùng được
  const other = http.createServer((q, r) => { r.setHeader('content-type', 'text/html'); r.end(PAGE); });
  await new Promise((res) => other.listen(0, res));
  const w2 = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, preload: path.join(__dirname, '..', '..', 'src', 'preload.js') } });
  const got2 = await new Promise((resolve) => {
    w2.on('page-title-updated', (e, t) => { if (t.startsWith('RESULT:')) resolve(JSON.parse(t.slice(7))); });
    w2.loadURL(`http://localhost:${other.address().port}/`);
    setTimeout(() => resolve({ err: 'het gio' }), 40000);
  });
  note('trang khac softe.ai: capabilities off', got2.caps && got2.caps.extract === 'off', JSON.stringify(got2.caps));
  note('trang khac softe.ai: extract bi tu choi', got2.ok && got2.ok.ok === false && got2.ok.reason === 'off', JSON.stringify(got2.ok));
  w2.destroy();

  // 3) cửa sổ ẩn không ra được mạng: thử tải một trang mạng trong CÙNG kiểu nhốt
  const host = createWorkerHost({ electron: { BrowserWindow, session, ipcMain, app }, dir });
  const ses = session.fromPartition('softe-local-smoke-net', { cache: false });
  host.lock(ses);
  const w3 = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, session: ses } });
  const failed = await new Promise((resolve) => {
    w3.webContents.on('did-fail-load', (e, code, desc, url) => resolve({ code, desc, url }));
    w3.webContents.on('did-finish-load', () => resolve(null));
    w3.loadURL(`${site}/`).catch(() => {});
    setTimeout(() => resolve('het gio'), 15000);
  });
  note('cua so nhot khong tai duoc trang qua mang', failed && failed !== 'het gio' && failed.code !== 0, JSON.stringify(failed));
  w3.destroy();

  let bad = 0;
  for (const [n, ok, info] of results) { console.log(`${ok ? 'OK ' : 'LOI'} ${n}: ${info}`); if (!ok) bad += 1; }
  server.close(); other.close();
  app.exit(bad ? 1 : 0);
});
setTimeout(() => { console.log('QUA GIO'); app.exit(2); }, 120000);
