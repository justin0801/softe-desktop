'use strict';
// Chạy thật src/main.js với một Electron giả (không cần Electron): dùng chung cho test/shell.test.js (màn chờ, trang mất mạng) và
// test/desktop-links.test.js (đường dẫn softe://, menu "Đi tới", lối tắt, gọi người dùng). Tệp này không có test nào.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const EventEmitter = require('node:events');

const SRC = path.join(__dirname, '..', 'src');
const mainSrc = fs.readFileSync(path.join(SRC, 'main.js'), 'utf8');
const SITE_URL = 'https://softe.ai';
const PAGES_URL = 'file:///Applications/Softe.app/Contents/Resources/app.asar/src/pages';

// main.js chạy trong một vm riêng: mảng / đối tượng của nó thuộc "thế giới" khác (deepStrictEqual so cả nguyên mẫu). Chép sang thế giới của test;
// hàm (click của menu) giữ nguyên để test bấm được.
function copy(v) {
  if (Array.isArray(v)) return Array.from(v, copy);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, copy(x)]));
  return v;
}

// Tùy chọn: locale, loadFileFails (loadFile bị từ chối), platform ('darwin' / 'win32' / 'linux'; mặc định nền tảng thật), argv (dòng lệnh mở app),
// defaultApp (chạy từ mã nguồn: electron .), primary (giữ được khóa một-bản-chạy), ready (false: app chưa sẵn sàng, gọi m.ready() sau),
// focused (cửa sổ đang được xem).
function bootMain({ locale = 'vi-VN', loadFileFails = false, platform = process.platform, argv = ['/opt/Softe/softe'], defaultApp = false,
                    primary = true, ready = true, focused = true } = {}) {
  const calls = []; const timers = []; const windows = []; const events = [];
  const externals = []; const popups = []; // địa chỉ mở bằng ứng dụng của máy; menu chuột phải đã bật lên
  let menu = null; let readyFn = null; let isReady = false;
  class FakeContents extends EventEmitter {
    constructor() { super(); this.url = ''; this.openHandler = null; }
    getURL() { return this.url; }
    setWindowOpenHandler(fn) { this.openHandler = fn; }
  }
  class FakeWindow extends EventEmitter {
    constructor(options) { super(); this.options = options; this.webContents = new FakeContents(); this.gone = false; this.focused = focused; this.minimized = false; windows.push(this); }
    loadURL(url) { calls.push({ kind: 'loadURL', url }); return Promise.resolve(); }
    loadFile(file, o = {}) { calls.push({ kind: 'loadFile', file: path.basename(file), hash: o.hash, query: o.query }); return loadFileFails ? Promise.reject(new Error('không tải được')) : Promise.resolve(); }
    isDestroyed() { return this.gone; }
    isMinimized() { return this.minimized; }
    restore() { this.minimized = false; events.push('restore'); }
    focus() { events.push('focus'); }
    isFocused() { return this.focused; }
    flashFrame(flag) { events.push(`flashFrame:${flag}`); }
  }
  const app = Object.assign(new EventEmitter(), {
    isPackaged: !defaultApp, userAgentFallback: 'UA', getVersion: () => '1.1.0', getLocale: () => locale,
    quit() { events.push('quit'); },
    requestSingleInstanceLock: () => primary,
    isReady: () => isReady,
    whenReady: () => ({ then: (fn) => { readyFn = fn; if (ready) { isReady = true; fn(); } } }),
    setAsDefaultProtocolClient: (...a) => { events.push(['protocol', ...copy(a)]); return true; },
    // Như Electron: false cho tới khi app này được đăng ký (ở đây: chưa bao giờ, nên main.js luôn đăng ký đúng một lần mỗi lần mở).
    isDefaultProtocolClient: (...a) => { events.push(['is-protocol', ...copy(a)]); return false; },
    setUserTasks: (tasks) => { events.push(['tasks', copy(tasks)]); return true; },
    dock: platform === 'darwin' ? { bounce: (type) => { events.push(`bounce:${type}`); return 1; }, setMenu: (m) => { events.push(['dockMenu', copy(m)]); } } : undefined,
  });
  const electron = {
    app, BrowserWindow: FakeWindow, shell: { openExternal(url) { externals.push(url); }, openPath() {} }, dialog: {}, nativeTheme: { shouldUseDarkColors: false },
    clipboard: { writeText(text) { events.push(['clipboard', text]); } },
    Menu: { setApplicationMenu(m) { menu = copy(m); events.push('menu'); }, buildFromTemplate: (t) => Object.assign(t, { popup() { popups.push(copy(t)); } }) },
    session: { defaultSession: { webRequest: { onBeforeSendHeaders() {} }, setPermissionRequestHandler() {} } },
  };
  // process thật, chỉ thay vài trường (platform của process là thuộc tính chỉ đọc: phải định nghĩa lại, không gán được).
  const own = { platform, argv, defaultApp, execPath: platform === 'win32' ? 'C:\\Softe\\Softe.exe' : '/opt/Softe/softe' };
  const fakeProcess = Object.create(process, Object.fromEntries(Object.entries(own).map(([k, value]) => [k, { value, enumerable: true }])));
  const file = path.join(SRC, 'main.js');
  const req = Module.createRequire(file);
  const run = vm.runInNewContext(`(function (require, module, exports, __dirname, __filename, setTimeout, setInterval) {${mainSrc}\n})`, { process: fakeProcess });
  run((id) => (id === 'electron' ? electron : req(id)), { exports: {} }, {}, SRC, file,
    (fn, ms) => timers.push(`setTimeout ${ms}`), (fn, ms) => timers.push(`setInterval ${ms}`));
  const at = (url) => { const w = windows.at(-1); if (w) w.webContents.url = url; };
  const m = {
    app, calls, timers, windows, events, at, externals, popups,
    get w() { return windows.at(-1); },
    get wc() { return windows.at(-1).webContents; },
    get menu() { return menu; },
    ready() { isReady = true; if (readyFn) readyFn(); },
    finish(url) { at(url); m.wc.emit('did-finish-load'); },
    fail(code, url, main = true) { m.wc.emit('did-fail-load', {}, code, 'ERR', url, main); },
    navigate(url) { at(url); m.wc.emit('did-navigate', {}, url); },
    inPage(url, main = true) { at(url); m.wc.emit('did-navigate-in-page', {}, url, main); },
    title(t) { m.w.emit('page-title-updated', { preventDefault() {} }, t, true); },
    // Một cửa sổ con mở bằng link target=_blank (setWindowOpenHandler 'allow'): Electron báo did-create-window trên trang mẹ. Trả về cửa sổ con.
    child(parent = m.wc) { const c = new FakeWindow({}); parent.emit('did-create-window', c, {}); return c; },
    // Trang mẹ (hoặc trang bất kỳ) xin mở / chuyển tới `url`: trả { opened: action của setWindowOpenHandler } hoặc { prevented } cho will-navigate.
    open(url, wc = m.wc) { return wc.openHandler({ url }); },
    navigating(url, wc = m.wc) { let prevented = false; wc.emit('will-navigate', { preventDefault() { prevented = true; } }, url); return prevented; },
    rightClick(params, wc = m.wc) { wc.emit('context-menu', {}, params); },
    urls: () => calls.filter((c) => c.kind === 'loadURL').map((c) => c.url),
    files: () => calls.filter((c) => c.kind === 'loadFile'),
  };
  return m;
}
const flush = () => new Promise((r) => setImmediate(r));

module.exports = { bootMain, flush, mainSrc, SITE_URL, PAGES_URL, SRC };
