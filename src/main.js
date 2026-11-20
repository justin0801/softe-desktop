'use strict';
const { app, BrowserWindow, shell, dialog, Menu, session, clipboard } = require('electron');
const path = require('node:path');
const os = require('node:os');
const { resolve, allowedHost, allowedPermission } = require('./config');
const updater = require('./updater');
const { parseDeepLink, findLink, langOf } = require('./deeplink');
const { needsAttention } = require('./attention');

const cfg = resolve(app.isPackaged);
const plat = updater.platformKey();
const CLIENT = plat === 'mac' ? 'desktop-mac' : 'desktop-win';
const CHECK_EVERY = 4 * 60 * 60 * 1000;
let win = null;
let busy = false;
let pendingLink = findLink(process.argv); // link softe:// đã bấm trước khi cửa sổ sẵn sàng
const PAGES = path.join(__dirname, 'pages');

app.userAgentFallback = `${app.userAgentFallback} softe-desktop/${app.getVersion()}`;

if (!app.requestSingleInstanceLock()) app.quit();
// Đăng ký softe:// để trình duyệt của máy mở lại app (đăng nhập Google / Apple, nối GitHub). Chỉ trang softe.ai tạo các link này.
if (process.defaultApp && process.argv[1]) app.setAsDefaultProtocolClient('softe', process.execPath, [path.resolve(process.argv[1])]);
else app.setAsDefaultProtocolClient('softe');

// Mở link softe:// TRONG cửa sổ app (nơi người dùng đã đăng nhập). Link lạ hoặc sai dạng thì bỏ qua.
function handleLink(raw) {
  if (!raw) return;
  if (!win) { pendingLink = raw; return; }
  const dest = parseDeepLink(raw, cfg.site, langOf(win.webContents.getURL()));
  if (win.isMinimized()) win.restore();
  win.focus();
  if (dest) win.loadURL(dest).catch(() => {});
}
app.on('open-url', (e, url) => { e.preventDefault(); handleLink(url); });          // Mac
app.on('second-instance', (e, argv) => { handleLink(findLink(argv)); if (win) { if (win.isMinimized()) win.restore(); win.focus(); } }); // Windows

function create() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 900, minHeight: 600, title: 'Softe', icon: path.join(__dirname, '..', 'build', 'icon.png'), backgroundColor: '#ffffff',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true,
                      preload: path.join(__dirname, 'preload.js') },
  });
  // Màn chờ có Mochi (trang tĩnh trong app), rồi mở softe.ai hoặc link softe:// đang chờ.
  win.loadFile(path.join(PAGES, 'loading.html')).catch(() => {}).then(() => {
    if (!win) return;
    const dest = pendingLink && parseDeepLink(pendingLink, cfg.site);
    pendingLink = null;
    win.loadURL(dest || cfg.site).catch(() => {});
  });
  retryOnFail(win.webContents);
  // Softe Code gọi người dùng bằng dấu ❓ ⚠ ⏸ ở đầu tiêu đề: cửa sổ không ở phía trước thì nhấp nháy / nảy biểu tượng.
  win.webContents.on('page-title-updated', (e, title) => {
    if (win && !win.isFocused() && needsAttention(title)) {
      win.flashFrame(true);
      if (process.platform === 'darwin' && app.dock) app.dock.bounce('informational');
    }
  });
  win.on('focus', () => win && win.flashFrame(false));
  win.webContents.on('context-menu', (e, p) => contextMenu(win.webContents, p));
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
  // Chỉ cấp vài quyền cho softe.ai (micro/camera, sao chép-dán, toàn màn hình, thông báo); mọi quyền khác từ chối.
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => {
    cb(allowedPermission(permission, details.requestingUrl, cfg.site));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission, origin) => allowedPermission(permission, origin, cfg.site));
  // Tải file: xong thì báo và mở thư mục chứa file.
  session.defaultSession.on('will-download', (e, item) => {
    item.once('done', (ev, state) => {
      if (state === 'completed') shell.showItemInFolder(item.getSavePath());
      else if (state === 'interrupted') dialog.showErrorBox('Tải file chưa xong', 'Kiểm tra mạng rồi thử lại.');
    });
  });
}

// Menu chuột phải: sao chép, dán, mở link, lưu ảnh (web trong app không có sẵn).
function contextMenu(wc, p) {
  const t = [];
  const add = (x) => t.push(x);
  if (p.linkURL) {
    add({ label: 'Mở link trong trình duyệt', click: () => { if (/^https?:\/\//i.test(p.linkURL)) shell.openExternal(p.linkURL); } });
    add({ label: 'Sao chép link', click: () => clipboard.writeText(p.linkURL) });
    add({ type: 'separator' });
  }
  if (p.mediaType === 'image') {
    add({ label: 'Sao chép ảnh', click: () => wc.copyImageAt(p.x, p.y) });
    add({ label: 'Lưu ảnh', click: () => wc.downloadURL(p.srcURL) });
    add({ type: 'separator' });
  }
  if (p.isEditable) {
    (p.dictionarySuggestions || []).slice(0, 4).forEach((w) => add({ label: w, click: () => wc.replaceMisspelling(w) }));
    if (p.misspelledWord) add({ type: 'separator' });
    add({ role: 'undo', label: 'Hoàn tác' }); add({ role: 'redo', label: 'Làm lại' }); add({ type: 'separator' });
    add({ role: 'cut', label: 'Cắt' });
  }
  if (p.isEditable || p.selectionText) add({ role: 'copy', label: 'Sao chép' });
  if (p.isEditable) { add({ role: 'paste', label: 'Dán' }); add({ role: 'selectAll', label: 'Chọn tất cả' }); }
  if (!t.length) { add({ label: 'Tải lại', click: () => wc.reload() }); }
  Menu.buildFromTemplate(t).popup();
}

// Mất mạng: trang báo có Mochi (trang tĩnh trong app) và tự thử lại, thay vì trang trắng.
function retryOnFail(wc) {
  let timer = null;
  wc.on('did-fail-load', (e, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3 || !allowedHost(url, cfg.site)) return; // -3: người dùng chủ động chuyển trang
    wc.loadFile(path.join(PAGES, 'offline.html')).catch(() => {});
    clearTimeout(timer);
    timer = setTimeout(() => { if (!wc.isDestroyed()) wc.loadURL(cfg.site); }, 10000);
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
    { role: 'editMenu' }, { role: 'viewMenu' },
    { label: 'Điều hướng', submenu: [
      { label: 'Trang chủ', accelerator: 'CmdOrCtrl+Shift+H', click: () => win && win.loadURL(cfg.site) },
      { label: 'Quay lại', accelerator: plat === 'mac' ? 'Cmd+[' : 'Alt+Left', click: () => win && win.webContents.navigationHistory.canGoBack() && win.webContents.navigationHistory.goBack() },
      { label: 'Tiến tới', accelerator: plat === 'mac' ? 'Cmd+]' : 'Alt+Right', click: () => win && win.webContents.navigationHistory.canGoForward() && win.webContents.navigationHistory.goForward() },
    ] },
    { role: 'windowMenu' },
    { label: 'Trợ giúp', submenu: [{ label: 'Kiểm tra cập nhật', click: () => checkUpdate(true) }] },
  ]));
  setTimeout(() => checkUpdate(false), 5000);
  setInterval(() => checkUpdate(false), CHECK_EVERY);
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!win) create(); });
