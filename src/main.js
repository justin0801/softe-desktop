'use strict';
const { app, BrowserWindow, shell, dialog, Menu, session } = require('electron');
const path = require('node:path');
const os = require('node:os');
const { resolve, allowedHost } = require('./config');
const updater = require('./updater');

const cfg = resolve(app.isPackaged);
const plat = updater.platformKey();
const CLIENT = plat === 'mac' ? 'desktop-mac' : 'desktop-win';
const CHECK_EVERY = 4 * 60 * 60 * 1000;
let win = null;
let busy = false;

app.userAgentFallback = `${app.userAgentFallback} softe-desktop/${app.getVersion()}`;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

function create() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 900, minHeight: 600, title: 'Softe', icon: path.join(__dirname, '..', 'build', 'icon.png'), backgroundColor: '#ffffff',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true,
                      preload: path.join(__dirname, 'preload.js') },
  });
  win.loadURL(cfg.site);
  // Link ra ngoài: trình duyệt của máy. Chỉ http(s).
  const external = (url) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); };
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (allowedHost(url, cfg.site)) return { action: 'allow' };
    external(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!allowedHost(url, cfg.site)) { e.preventDefault(); external(url); }
  });
  win.on('closed', () => { win = null; });
}

// Máy chủ thấy đây là app máy tính (không phải bản web).
function tagRequests() {
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [`${cfg.api.replace(/\/v1$/, '')}/*`] }, (d, cb) => {
    d.requestHeaders['X-Softe-Client'] = CLIENT;
    cb({ requestHeaders: d.requestHeaders });
  });
  // Chỉ cấp quyền micro (nút nói chuyện); mọi quyền khác từ chối.
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => {
    cb(permission === 'media' && allowedHost(details.requestingUrl || '', cfg.site));
  });
}

async function checkUpdate(manual) {
  if (busy || !plat) return;
  busy = true;
  try {
    const info = await updater.check(cfg.api, plat, app.getVersion());
    if (!info) { if (manual) dialog.showMessageBox(win, { message: 'Bạn đang dùng bản mới nhất.' }); return; }
    const ask = await dialog.showMessageBox(win, {
      type: 'info', buttons: ['Cập nhật ngay', info.required ? 'Thoát' : 'Để sau'], defaultId: 0,
      message: `Có bản mới ${info.version}`, detail: info.notes || 'Bản cập nhật sẵn sàng tải về.',
    });
    if (ask.response !== 0) { if (info.required) app.quit(); return; }
    const ext = plat === 'mac' ? 'dmg' : 'exe';
    const file = await updater.download(info, path.join(os.tmpdir(), `softe-update-${info.version}.${ext}`));
    await shell.openPath(file); // Mac: mở ổ .dmg, kéo vào Applications. Windows: chạy trình cài.
    app.quit();
  } catch (e) {
    if (manual) dialog.showErrorBox('Không cập nhật được', 'Kiểm tra mạng rồi thử lại.');
  } finally { busy = false; }
}

app.whenReady().then(() => {
  tagRequests();
  create();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(plat === 'mac' ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu' }, { role: 'viewMenu' }, { role: 'windowMenu' },
    { label: 'Trợ giúp', submenu: [{ label: 'Kiểm tra cập nhật', click: () => checkUpdate(true) }] },
  ]));
  setTimeout(() => checkUpdate(false), 5000);
  setInterval(() => checkUpdate(false), CHECK_EVERY);
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!win) create(); });
