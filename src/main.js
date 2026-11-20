'use strict';
const { app, BrowserWindow, shell, dialog, Menu, session, nativeTheme, clipboard } = require('electron');
const path = require('node:path');
const os = require('node:os');
const { resolve, allowedHost, allowedPermission, externalOk } = require('./config');
const updater = require('./updater');
const pages = require('./shell'); // màn chờ + trang mất mạng (có Mochi): phần thuần ở shell.js
const links = require('./deeplink'); // đường dẫn softe:// và menu "Đi tới": phần thuần ở deeplink.js
const attention = require('./attention'); // phiên Softe Code đợi người dùng: nháy thanh tác vụ / nảy Dock (phần thuần ở attention.js)
const texts = require('./texts'); // chữ của chính app (menu, hộp thoại, lối tắt) tiếng Việt và tiếng Anh: phần thuần ở texts.js
const context = require('./context'); // menu chuột phải (Sao chép, Dán, mở link...): phần thuần ở context.js

const cfg = resolve(app.isPackaged);
const plat = updater.platformKey();
const CLIENT = plat === 'mac' ? 'desktop-mac' : 'desktop-win';
const CHECK_EVERY = 4 * 60 * 60 * 1000;
let win = null;
let busy = false;
let started = false; // cửa sổ đầu tiên đã được tạo (whenReady): trước đó đường dẫn softe:// chỉ được để dành
// Trang softe.ai sẽ mở ở lần tải tới thay cho trang chủ: đường dẫn softe://, menu "Đi tới", lối tắt của Dock / danh sách nhảy. Giữ tới khi một trang
// softe.ai thật sự vào được (did-navigate), nên mất mạng rồi "Thử lại" vẫn mở đúng trang đó. Windows / Linux: app được mở bằng một đường dẫn softe://.
let next = links.fromArgv(process.argv, cfg.site);
// Ngôn ngữ của chữ trong app (menu, hộp thoại): theo trang đang xem (/en/... là tiếng Anh), trước khi có trang thì theo máy (texts.languageOf).
let uiLang = texts.languageOf('', app.getLocale(), cfg.site);
const say = () => texts.textsFor(uiLang);

app.userAgentFallback = `${app.userAgentFallback} softe-desktop/${app.getVersion()}`;

const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();
else registerProtocol();
// Mở app lần nữa (Windows / Linux, kể cả bấm một đường dẫn softe:// hay "Mở Softe Code" ở danh sách nhảy): lần mở sau đưa dòng lệnh của nó
// cho app đang chạy rồi thoát. Không có đường dẫn thì chỉ đưa cửa sổ lên trước, như trước đây.
app.on('second-instance', (e, argv) => { go(links.fromArgv(argv, cfg.site), true); });
// macOS gửi đường dẫn softe:// bằng sự kiện này, có thể trước cả khi app sẵn sàng: phải nghe ngay từ đầu.
app.on('open-url', (e, url) => { e.preventDefault(); go(links.parseDeepLink(url, cfg.site), true); });

// softe:// mở app này (bản cài cũng tự đăng ký: "protocols" trong package.json). Chạy từ mã nguồn (electron .) thì phải chỉ đúng thư mục app.
// Chỉ ghi khi app này chưa là nơi nhận (mỗi lần mở không ghi lại vào registry của Windows).
function registerProtocol() {
  if (!process.defaultApp) {
    if (!app.isDefaultProtocolClient(links.SCHEME)) app.setAsDefaultProtocolClient(links.SCHEME);
    return;
  }
  if (process.argv.length >= 2) {
    const args = [path.resolve(process.argv[1])];
    if (!app.isDefaultProtocolClient(links.SCHEME, process.execPath, args)) app.setAsDefaultProtocolClient(links.SCHEME, process.execPath, args);
  }
}

// Mở một trang softe.ai (đã kiểm: chỉ softe.ai) trong cửa sổ app và đưa cửa sổ lên trước. Cửa sổ còn ở màn chờ thì để dành: màn chờ tải xong
// sẽ mở nó (openSite). Chưa có cửa sổ (Mac: đã đóng hết mà app còn chạy) thì mở cửa sổ mới. `target` null: chỉ đưa cửa sổ lên trước.
// Không tải lại trang cửa sổ đang hiện (chữ người dùng đang gõ dở chỉ nằm trong trang: tải lại là mất). Đường dẫn từ BÊN NGOÀI (`external`: một
// trang bất kỳ người dùng từng cho phép mở softe:// có thể gửi liên tục) còn không tải lại quá 1 lần mỗi LINK_GAP_MS khi cửa sổ đã mở softe.ai;
// menu "Đi tới" của chính app thì không bị giới hạn. links.shouldOpen giữ luật này.
let lastLink = { page: null, at: 0 };
function go(target, external = false) {
  const shown = win && !win.isDestroyed() ? win.webContents.getURL() : '';
  const page = target ? links.withLanguage(target, shown, cfg.site) : null;
  const live = started && win && !win.isDestroyed() && opened.has(win);
  if (page && live && !links.shouldOpen(page, shown, external ? lastLink : null, Date.now())) {
    if (win.isMinimized()) win.restore();
    win.focus();
    return;
  }
  if (page) next = page;
  if (page && external && live) lastLink = { page, at: Date.now() };
  if (!started) return;
  if (!win || win.isDestroyed()) { create(); return; }
  if (page && opened.has(win)) openSite(win);
  if (win.isMinimized()) win.restore();
  win.focus();
}

// Mỗi cửa sổ nhớ hai việc: đã mất mạng liên tiếp mấy lần (trang mất mạng lùi dần khi tự thử lại) và trang mất mạng đang hiện
// có phải do chính app vừa mở không (không phải thì người dùng bấm Tải lại: thử softe.ai lại, xem did-navigate bên dưới).
const lost = new WeakMap(); // cửa sổ -> { tries, ours }
const track = (w) => { let s = lost.get(w); if (!s) { s = { tries: 0, ours: false }; lost.set(w, s); } return s; };
const opened = new WeakSet(); // cửa sổ đã qua màn chờ (đã gọi softe.ai ít nhất một lần): đường dẫn mới mở ngay
const seen = new WeakMap(); // cửa sổ -> tiêu đề "cần người dùng" gần nhất đã gọi (attention.attentionStep)

// Trang sẽ mở: trang đang để dành (nếu còn, và đúng là softe.ai), không thì trang chủ.
const nextPage = () => (next && allowedHost(next, cfg.site) ? next : cfg.site);

// Tải softe.ai. Lỗi mạng không ném ra ngoài: did-fail-load lo (hiện trang mất mạng).
function openSite(w) {
  if (w.isDestroyed()) return;
  opened.add(w);
  w.loadURL(nextPage()).catch(() => {});
}
function openOffline(w) {
  if (w.isDestroyed()) return;
  const s = track(w);
  s.tries = pages.nextTries(s.tries);
  s.ours = true;
  w.loadFile(pages.pagePath(pages.offlinePage(pages.pageLang(app.getLocale()))), { query: pages.offlineQuery(s.tries) })
    .catch(() => { s.ours = false; });
}

// Gọi người dùng (cửa sổ không được xem mà một phiên Softe Code cần họ): Mac nảy Dock một lần, Windows nháy biểu tượng trên thanh tác vụ.
function callPerson(w) {
  if (w.isDestroyed()) return;
  if (process.platform === 'darwin') { if (app.dock) app.dock.bounce('informational'); return; }
  w.flashFrame(true);
}

// Link ra ngoài: ứng dụng của máy (trình duyệt, thư, điện thoại). Chỉ http(s), mailto và tel, đã kiểm (config.externalOk): không kiểu nào khác.
function external(url) { if (externalOk(url)) shell.openExternal(url); }

// Cửa sổ con (link target=_blank tới chính softe.ai) và cửa sổ con của nó: cùng luật như cửa sổ chính (chỉ softe.ai trong cửa sổ, còn lại ra ngoài), cùng menu chuột phải.
function guard(contents) {
  contents.setWindowOpenHandler(({ url }) => {
    if (allowedHost(url, cfg.site)) return { action: 'allow' };
    external(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (e, url) => {
    if (!allowedHost(url, cfg.site)) { e.preventDefault(); external(url); }
  });
  contents.on('did-create-window', (child) => guard(child.webContents));
  rightClick(contents);
}

// Menu chuột phải như trình duyệt: Sao chép / Dán trong ô nhập, mở và sao chép link. Chỉ dựng menu từ thông tin của lần bấm (context.js), không đọc trang.
function rightClick(contents) {
  contents.on('context-menu', (e, params) => {
    const items = context.contextTemplate(params, say(), { open: external, copy: (text) => clipboard.writeText(text) });
    if (items.length) Menu.buildFromTemplate(items).popup();
  });
}

function create() {
  win = new BrowserWindow({
    width: 1280, height: 860, minWidth: 900, minHeight: 600, title: 'Softe', icon: path.join(__dirname, '..', 'build', 'icon.png'),
    backgroundColor: pages.backgroundFor(nativeTheme.shouldUseDarkColors), // bằng nền màn chờ: không nháy trắng
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true,
                      preload: path.join(__dirname, 'preload.js') },
  });
  const w = win; // cửa sổ này (mã mới bên dưới không đụng tới `win` toàn cục, vì cửa sổ khác có thể thay nó)
  // Link ra ngoài: ứng dụng của máy (external ở trên). Cửa sổ con và menu chuột phải: guard(), rightClick().
  win.webContents.on('did-create-window', (child) => guard(child.webContents));
  rightClick(win.webContents);
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
  // cũng vào đây (cùng địa chỉ), nên cửa sổ không bao giờ trống. (Chuỗi mất mạng KHÔNG hết ở đây: lượt tải softe.ai thất bại cũng phát
  // did-finish-load cho trang lỗi của Chromium, mang địa chỉ softe.ai; chuỗi hết ở did-navigate bên dưới, khi trang thật đã vào.)
  w.webContents.on('did-finish-load', () => {
    if (pages.isSplash(w.webContents.getURL())) openSite(w);
  });
  // "Thử lại" ở trang mất mạng là #retry trong chính trang đó (không có API nào cho trang).
  w.webContents.on('did-navigate-in-page', (e, url, isMainFrame) => {
    if (isMainFrame) refreshLanguage(url);
    if (isMainFrame && pages.isRetry(url)) openSite(w);
  });
  // Trang mất mạng vừa hiện mà không phải do app mở (Tải lại bằng F5, Ctrl/Cmd+R hay menu Xem): người dùng muốn thử lại, nên gọi softe.ai.
  // Trang do app mở thì chỉ đánh dấu cho qua một lần: không bao giờ thành vòng lặp (mỗi lần Tải lại là đúng một lượt thử).
  // Còn softe.ai đã vào được (điều hướng tới softe.ai đã commit; trang lỗi của Chromium không phát did-navigate) thì hết chuỗi mất mạng.
  w.webContents.on('did-navigate', (e, url) => {
    refreshLanguage(url);
    if (allowedHost(url, cfg.site)) { track(w).tries = 0; next = null; return; }
    if (!pages.isOfflinePage(url)) return;
    const s = track(w);
    if (s.ours) s.ours = false; else openSite(w);
  });
  win.on('closed', () => { win = null; });
  // Tiêu đề trang đổi: một phiên Softe Code đợi người dùng mà cửa sổ không được xem thì gọi họ (attention.js). Chỉ gọi, không tải gì.
  w.on('page-title-updated', (e, title) => {
    const step = attention.attentionStep(seen.get(w) ?? null, title, w.isFocused());
    seen.set(w, step.last);
    if (step.alert) callPerson(w);
  });
  w.on('focus', () => { if (!w.isDestroyed()) w.flashFrame(false); });
  // Màn chờ hiện ngay; softe.ai được gọi khi màn chờ tải xong (did-finish-load ở trên). Màn chờ ở lại tới khi trang web thật vào.
  w.loadFile(pages.pagePath(pages.SPLASH_FILE), { hash: pages.splashHash(pages.pageLang(app.getLocale())) }).catch(() => {});
}

// Máy chủ thấy đây là app máy tính (không phải bản web).
function tagRequests() {
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [`${cfg.api.replace(/\/v1$/, '')}/*`] }, (d, cb) => {
    d.requestHeaders['X-Softe-Client'] = CLIENT;
    cb({ requestHeaders: d.requestHeaders });
  });
  // Chỉ cấp micro (nói chuyện, thu giọng), sao chép, toàn màn hình, và chỉ cho softe.ai (config.allowedPermission); mọi quyền khác từ chối.
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb, details) => {
    cb(allowedPermission(permission, details.requestingUrl, cfg.site));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission, origin) => allowedPermission(permission, origin, cfg.site));
}

async function checkUpdate(manual) {
  if (busy || !plat) return;
  busy = true;
  try {
    const info = await updater.check(cfg.api, plat, app.getVersion());
    const t = say();
    if (!info) { if (manual) dialog.showMessageBox(win, { message: t.upToDate }); return; }
    const ask = await dialog.showMessageBox(win, {
      type: 'info', buttons: [t.updateNow, info.required ? t.quit : t.later], defaultId: 0,
      message: `${t.newVersion} ${info.version}`, detail: info.notes || t.notesFallback,
    });
    if (ask.response !== 0) { if (info.required) app.quit(); return; }
    const ext = plat === 'mac' ? 'dmg' : 'exe';
    const file = await updater.download(info, path.join(os.tmpdir(), `softe-update-${info.version}.${ext}`));
    await shell.openPath(file); // Mac: mở ổ .dmg, kéo vào Applications. Windows: chạy trình cài.
    app.quit();
  } catch (e) {
    if (manual) dialog.showErrorBox(say().updateFailedTitle, say().updateFailedBody);
  } finally { busy = false; }
}

// Lối tắt ngoài cửa sổ, đều mở Softe Code: menu của biểu tượng Dock (Mac), danh sách nhảy của biểu tượng trên thanh tác vụ (Windows:
// chạy lại app với đường dẫn softe://code, app đang chạy nhận nó ở second-instance).
function shortcuts() {
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setMenu(Menu.buildFromTemplate([{ label: say().openCode, click: () => go(links.pageUrl('/code', cfg.site)) }]));
  } else if (process.platform === 'win32') {
    app.setUserTasks([{ program: process.execPath, arguments: links.jumpArguments(process.defaultApp, process.argv[1] ? path.resolve(process.argv[1]) : ''),
                        iconPath: process.execPath, iconIndex: 0, title: say().openCode, description: say().openCodeHint }]);
  }
}

// Menu Sửa: vai trò của Electron (chữ tự dịch theo máy) với Hoàn tác / Làm lại KHÔNG giữ phím tắt (`registerAccelerator: false`): trình dựng phim của web (Studio phim)
// tự xử lý Ctrl/Cmd + Z và Ctrl/Cmd + Shift + Z (hoàn tác thao tác trên timeline); nếu menu giữ phím này thì trang không bao giờ nhận được. Trong ô nhập chữ trình duyệt vẫn tự hoàn tác.
const EDIT_SUBMENU = [
  { role: 'undo', registerAccelerator: false }, { role: 'redo', registerAccelerator: false }, { type: 'separator' },
  { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'pasteAndMatchStyle' }, { role: 'delete' }, { role: 'selectAll' },
];

// Menu của app. Sửa / Xem / Cửa sổ là vai trò của Electron (tự dịch theo máy); "Đi tới" và "Trợ giúp" là chữ của app (texts.js).
function installMenu() {
  const t = say();
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(plat === 'mac' ? [{ role: 'appMenu' }] : []),
    { role: 'editMenu', submenu: EDIT_SUBMENU }, { role: 'viewMenu' },
    { label: t.goTo, submenu: links.GO_TO.map((p) => ({ label: t[p.id], accelerator: p.accelerator, click: () => go(links.pageUrl(p.path, cfg.site)) })) },
    { role: 'windowMenu' },
    { label: t.help, submenu: [{ label: t.checkUpdate, click: () => checkUpdate(true) }] },
  ]));
}

// Trang đang xem đổi sang ngôn ngữ khác (/en/...): chữ của app đổi theo (menu, lối tắt Dock / danh sách nhảy). Chưa sẵn sàng thì chưa có gì để dựng lại.
function refreshLanguage(url) {
  const now = texts.languageOf(url, app.getLocale(), cfg.site);
  if (now === uiLang) return;
  uiLang = now;
  if (started) { installMenu(); shortcuts(); }
}

app.whenReady().then(() => {
  if (!primary) return; // lần mở thứ hai: đã chuyển dòng lệnh cho app đang chạy, đang thoát, không mở cửa sổ
  tagRequests();
  started = true;
  create();
  installMenu();
  shortcuts();
  setTimeout(() => checkUpdate(false), 5000);
  setInterval(() => checkUpdate(false), CHECK_EVERY);
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!win) create(); });
