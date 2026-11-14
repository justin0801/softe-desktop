'use strict';
const { app, BrowserWindow, shell, dialog, Menu, session, nativeTheme } = require('electron');
const path = require('node:path');
const os = require('node:os');
const { resolve, allowedHost } = require('./config');
const updater = require('./updater');
const pages = require('./shell'); // màn chờ + trang mất mạng (có Mochi): phần thuần ở shell.js

const cfg = resolve(app.isPackaged);
const plat = updater.platformKey();
const CLIENT = plat === 'mac' ? 'desktop-mac' : 'desktop-win';
const CHECK_EVERY = 4 * 60 * 60 * 1000;
let win = null;
let busy = false;

app.userAgentFallback = `${app.userAgentFallback} softe-desktop/${app.getVersion()}`;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

// Mỗi cửa sổ nhớ hai việc: đã mất mạng liên tiếp mấy lần (trang mất mạng lùi dần khi tự thử lại) và trang mất mạng đang hiện
// có phải do chính app vừa mở không (không phải thì người dùng bấm Tải lại: thử softe.ai lại, xem did-navigate bên dưới).
const lost = new WeakMap(); // cửa sổ -> { tries, ours }
const track = (w) => { let s = lost.get(w); if (!s) { s = { tries: 0, ours: false }; lost.set(w, s); } return s; };

// Tải softe.ai. Lỗi mạng không ném ra ngoài: did-fail-load lo (hiện trang mất mạng).
function openSite(w) {
  if (!w.isDestroyed()) w.loadURL(cfg.site).catch(() => {});
}
function openOffline(w) {
  if (w.isDestroyed()) return;
  const s = track(w);
  s.tries = pages.nextTries(s.tries);
  s.ours = true;
  w.loadFile(pages.pagePath(pages.offlinePage(pages.pageLang(app.getLocale()))), { query: pages.offlineQuery(s.tries) })
    .catch(() => { s.ours = false; });
}

function create() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 900, minHeight: 600, title: 'Softe', icon: path.join(__dirname, '..', 'build', 'icon.png'),
    backgroundColor: pages.backgroundFor(nativeTheme.shouldUseDarkColors), // bằng nền màn chờ: không nháy trắng
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true,
                      preload: path.join(__dirname, 'preload.js') },
  });
  const w = win; // cửa sổ này (mã mới bên dưới không đụng tới `win` toàn cục, vì cửa sổ khác có thể thay nó)
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
  // Mất mạng: lỗi mạng của khung chính, của địa chỉ softe.ai, thì hiện trang mất mạng của app (bỏ qua -3, khung con, địa chỉ lạ).
  w.webContents.on('did-fail-load', (e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (pages.failureMatters({ errorCode, isMainFrame, validatedURL }, cfg.site)) openOffline(w);
  });
  // Màn chờ vẽ xong thì gọi softe.ai (không hẹn giờ, không chờ thêm): mỗi lần màn chờ tải xong, kể cả sau khi người dùng bấm Tải lại
  // lúc còn chờ (lượt tải softe.ai đang chạy bị hủy, màn chờ tải lại, nên phải gọi lại). Tệp màn chờ hỏng thì trang lỗi của Chromium
  // cũng vào đây (cùng địa chỉ), nên cửa sổ không bao giờ trống. softe.ai vào được thì hết chuỗi mất mạng.
  w.webContents.on('did-finish-load', () => {
    const url = w.webContents.getURL();
    if (pages.isSplash(url)) openSite(w);
    else if (allowedHost(url, cfg.site)) track(w).tries = 0;
  });
  // "Thử lại" ở trang mất mạng là #retry trong chính trang đó (không có API nào cho trang).
  w.webContents.on('did-navigate-in-page', (e, url, isMainFrame) => {
    if (isMainFrame && pages.isRetry(url)) openSite(w);
  });
  // Trang mất mạng vừa hiện mà không phải do app mở (Tải lại bằng F5, Ctrl/Cmd+R hay menu Xem): người dùng muốn thử lại, nên gọi softe.ai.
  // Trang do app mở thì chỉ đánh dấu cho qua một lần: không bao giờ thành vòng lặp (mỗi lần Tải lại là đúng một lượt thử).
  w.webContents.on('did-navigate', (e, url) => {
    if (!pages.isOfflinePage(url)) return;
    const s = track(w);
    if (s.ours) s.ours = false; else openSite(w);
  });
  win.on('closed', () => { win = null; });
  // Màn chờ hiện ngay; softe.ai được gọi khi màn chờ tải xong (did-finish-load ở trên). Màn chờ ở lại tới khi trang web thật vào.
  w.loadFile(pages.pagePath(pages.SPLASH_FILE), { hash: pages.splashHash(pages.pageLang(app.getLocale())) }).catch(() => {});
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
