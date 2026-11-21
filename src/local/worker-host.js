'use strict';
// Cửa sổ ẩn bị nhốt hoàn toàn để đọc một tệp (softe-be/docs/ung-dung-may-tinh-chay-cuc-bo.md, mục 10.1). Mỗi việc một cửa sổ MỚI, xong là hủy.
//  - Hộp cát của Chromium (sandbox, contextIsolation, không Node), vùng lưu chỉ trong bộ nhớ (partition không có `persist:`).
//  - Không mạng: mọi yêu cầu ngoài softe-local://app/... bị hủy; mọi quyền bị từ chối; không mở cửa sổ khác, không điều hướng đi nơi khác.
//  - Không tệp: trang chỉ nạp những tệp trong assets.SERVED (thư viện bên thứ ba khớp mã băm), qua địa chỉ riêng.
//  - Giới hạn cứng, vượt là hủy cả cửa sổ: thời gian, bộ nhớ.
// Kết quả là dữ liệu không đáng tin: người gọi phải đưa qua result.normalize. Electron được đưa vào (test dùng bản giả).
const crypto = require('node:crypto');
const fsReal = require('node:fs');
const path = require('node:path');
const assets = require('./assets');
const { LIMITS } = require('./limits');

const POLL_MS = 1000;

function registerScheme(protocol) {
  if (protocol && typeof protocol.registerSchemesAsPrivileged === 'function') {
    protocol.registerSchemesAsPrivileged([{ scheme: assets.SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
  }
}

function createWorkerHost({ electron, dir = __dirname, fs = fsReal, limits = LIMITS, setTimer = setTimeout, clearTimer = clearTimeout,
                           setPoll = setInterval, clearPoll = clearInterval, random = () => crypto.randomBytes(8).toString('hex'),
                           onConsole = null } = {}) { // onConsole: chỉ để thử / gỡ lỗi (nhật ký của trang trong cửa sổ ẩn); bản thật không truyền
  const { BrowserWindow, session, ipcMain, app } = electron;
  const hashes = assets.readHashes(fs, dir);

  function serve(request) {
    const rel = assets.assetOf(request.url);
    const r = rel ? assets.loadAsset(rel, { fs, dir, hashes }) : { ok: false, status: 404 };
    if (!r.ok) return new Response(null, { status: r.status });
    return new Response(r.body, { status: 200, headers: { 'content-type': r.type, 'content-security-policy': assets.CSP, 'cache-control': 'no-store' } });
  }

  function lock(ses) {
    ses.protocol.handle(assets.SCHEME, serve);
    // Không mạng: chỉ địa chỉ riêng của app. (Hủy trước khi gửi: không có DNS, không kết nối.)
    ses.webRequest.onBeforeRequest((details, cb) => cb({ cancel: !String(details.url).startsWith(`${assets.SCHEME}://${assets.HOST}/`) }));
    ses.setPermissionRequestHandler((wc, permission, cb) => cb(false));
    ses.setPermissionCheckHandler(() => false);
    if (typeof ses.setDevicePermissionHandler === 'function') ses.setDevicePermissionHandler(() => false);
  }

  // Đọc một tệp: trả { ok, text, pages, truncated } hoặc { ok: false, reason } (chưa làm sạch: dùng result.normalize). Không bao giờ ném lỗi.
  function run(bytes, { budgetMs = limits.jobMs } = {}) {
    return new Promise((resolve) => {
      let id; let w; let part; let ses;
      try {
        id = random();
        part = `softe-local-${id}`; // không có `persist:` => bộ nhớ, mất khi hủy
        ses = session.fromPartition(part, { cache: false });
        lock(ses);
        w = new BrowserWindow({
          show: false, width: 400, height: 300, paintWhenInitiallyHidden: true,
          webPreferences: {
            sandbox: true, contextIsolation: true, nodeIntegration: false, nodeIntegrationInWorker: false, nodeIntegrationInSubFrames: false,
            webSecurity: true, allowRunningInsecureContent: false, webviewTag: false, devTools: false, spellcheck: false, enableWebSQL: false,
            navigateOnDragDrop: false, backgroundThrottling: false, session: ses,
            preload: path.join(dir, 'worker-preload.js'),
          },
        });
      } catch { resolve({ ok: false, reason: 'failed' }); return; }
      const wc = w.webContents;
      let settled = false; let timer; let poll;
      const onReady = (ev) => { if (ev.sender === wc) wc.send('softe-local:job', { id, bytes, budgetMs }); };
      const onDone = (ev, rid, raw) => { if (ev.sender === wc && rid === id) finish(raw); };
      function finish(raw) {
        if (settled) return;
        settled = true;
        clearTimer(timer); clearPoll(poll);
        ipcMain.removeListener('softe-local:ready', onReady);
        ipcMain.removeListener('softe-local:done', onDone);
        try { if (!w.isDestroyed()) w.destroy(); } catch { /* bỏ qua */ }
        resolve(raw && typeof raw === 'object' ? raw : { ok: false, reason: 'failed' });
      }
      ipcMain.on('softe-local:ready', onReady);
      ipcMain.on('softe-local:done', onDone);
      wc.setWindowOpenHandler(() => ({ action: 'deny' }));
      wc.on('will-navigate', (e) => e.preventDefault());
      wc.on('will-redirect', (e) => e.preventDefault());
      wc.on('will-attach-webview', (e) => e.preventDefault());
      if (onConsole) wc.on('console-message', (e, level, message) => { try { onConsole(level, String(message).slice(0, 400)); } catch { /* bỏ qua */ } });
      wc.on('render-process-gone', () => finish({ ok: false, reason: 'failed' }));
      wc.on('did-fail-load', () => finish({ ok: false, reason: 'failed' }));
      timer = setTimer(() => finish({ ok: false, reason: 'timeout' }), budgetMs + 2000);
      poll = setPoll(() => { // bộ nhớ của cửa sổ này vượt trần: hủy
        try {
          const pid = wc.getOSProcessId();
          const me = app.getAppMetrics().find((m) => m.pid === pid);
          if (me && me.memory && me.memory.workingSetSize * 1024 > limits.maxWorkerBytes) finish({ ok: false, reason: 'failed' });
        } catch { /* không đo được thì thôi: còn giới hạn thời gian */ }
      }, POLL_MS);
      w.loadURL(`${assets.SCHEME}://${assets.HOST}/worker.html`).catch(() => finish({ ok: false, reason: 'failed' }));
    });
  }

  return { run, serve, lock };
}

module.exports = { createWorkerHost, registerScheme };
