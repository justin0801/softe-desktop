'use strict';
// Phần Electron của xử lý tệp trên máy, với Electron giả: cửa sổ ẩn bị nhốt, ô cửa softeLocal, preload, rào chắn chung, kiểm tư thế.
const test = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const assets = require('../src/local/assets');
const { normalize } = require('../src/local/result');
const settings = require('../src/local/settings');
const { createWorkerHost, registerScheme } = require('../src/local/worker-host');
const { install, frameOf } = require('../src/local');
const hardening = require('../src/hardening');
const posture = require('../src/posture');
const { LIMITS } = require('../src/local/limits');
const { bootMain, SITE_URL } = require('./main-harness');

const DIR = path.join(__dirname, '..', 'src', 'local');
const GB = 1024 ** 3;

test('địa chỉ riêng chỉ nhận đúng tệp trong danh sách', () => {
  assert.equal(assets.assetOf('softe-local://app/worker.html'), 'worker.html');
  assert.equal(assets.assetOf('softe-local://app/vendor/pdfjs/pdf.min.mjs'), 'vendor/pdfjs/pdf.min.mjs');
  for (const bad of ['softe-local://evil/worker.html', 'https://app/worker.html', 'softe-local://app/../main.js', 'softe-local://app/%2e%2e/main.js',
    'softe-local://app/worker.html?x=1', 'softe-local://app/worker.html#x', 'softe-local://u:p@app/worker.html', 'softe-local://app/main.js',
    'softe-local://app/vendor/pdfjs/VENDOR.json', 'softe-local://app/%zz', 'softe-local://app:81/worker.html', 'rubbish', '', 'softe-local://app/constructor']) {
    assert.equal(assets.assetOf(bad), null, bad);
  }
});

test('phục vụ tệp: thư viện bên thứ ba phải khớp mã băm; tệp ngoài danh sách bị từ chối', () => {
  const hashes = assets.readHashes(fs, DIR);
  assert.ok(Object.keys(hashes).length >= 2);
  const ok = assets.loadAsset('vendor/pdfjs/pdf.min.mjs', { fs, dir: DIR, hashes });
  assert.equal(ok.ok, true); assert.match(ok.type, /javascript/);
  assert.equal(assets.loadAsset('vendor/pdfjs/pdf.min.mjs', { fs, dir: DIR, hashes: { 'pdfjs/pdf.min.mjs': '0'.repeat(64) } }).status, 403, 'sai mã băm');
  assert.equal(assets.loadAsset('vendor/pdfjs/pdf.min.mjs', { fs, dir: DIR, hashes: {} }).status, 403, 'không có mã băm');
  const evil = { readFileSync: () => Buffer.from('console.log(1)') }; // tệp bị tráo
  assert.equal(assets.loadAsset('vendor/pdfjs/pdf.worker.min.mjs', { fs: evil, dir: DIR, hashes }).status, 403);
  assert.equal(assets.loadAsset('../main.js', { fs, dir: DIR, hashes }).status, 404);
  assert.equal(assets.loadAsset('worker.html', { fs, dir: DIR, hashes }).ok, true);
  assert.match(assets.CSP, /default-src 'none'/); assert.match(assets.CSP, /connect-src 'self' data: blob:/); assert.match(assets.CSP, /img-src data: blob:/); assert.ok(!/unsafe-inline|unsafe-eval(?!')|https?:/.test(assets.CSP.replace("'wasm-unsafe-eval'", '')));
});

test('worker.html không có mã nội tuyến, không tải gì từ ngoài', () => {
  const html = fs.readFileSync(path.join(DIR, 'worker.html'), 'utf8');
  assert.ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html.replace(/<!--[\s\S]*?-->/g, '')), 'không script nội tuyến');
  assert.ok(!/https?:|<link|<img|<iframe|style=/.test(html));
  for (const f of ['worker-page.mjs', 'worker-preload.js']) assert.ok(!/fetch\(|XMLHttpRequest|WebSocket|eval\(|new Function|http/.test(fs.readFileSync(path.join(DIR, f), 'utf8')), f);
});

test('kết quả từ cửa sổ ẩn được dựng lại: chỉ bốn trường, làm sạch lại, lý do lạ thành failed', () => {
  const good = normalize({ ok: true, text: 'Xin​ chào các bạn, đây là hợp đồng', pages: 3, truncated: false, evil: 'x', __proto__: { a: 1 } }, '1.4.0');
  assert.deepEqual(good, { ok: true, text: 'Xin chào các bạn, đây là hợp đồng', pages: 3, truncated: false, by: 'desktop/1.4.0' });
  assert.deepEqual(Object.keys(good).sort(), ['by', 'ok', 'pages', 'text', 'truncated']);
  for (const bad of [null, 5, 'x', {}, { ok: true }, { ok: true, text: 5, pages: 1 }, { ok: true, text: 'a', pages: 0 }, { ok: true, text: 'a', pages: 1.5 }, { ok: true, text: 'a', pages: 1e9 }]) {
    assert.equal(normalize(bad, '1.4.0').ok, false, JSON.stringify(bad));
  }
  assert.deepEqual(normalize({ ok: true, text: '​\u0000', pages: 1 }, '1.4.0'), { ok: false, reason: 'needs_ocr' });
  assert.deepEqual(normalize({ ok: true, text: 'abc', pages: 1 }, 'x.y'), { ok: false, reason: 'failed' });
  assert.deepEqual(normalize({ ok: false, reason: 'needs_ocr' }, '1.4.0'), { ok: false, reason: 'needs_ocr' });
  assert.deepEqual(normalize({ ok: false, reason: '<script>' }, '1.4.0'), { ok: false, reason: 'failed' });
  assert.equal(normalize({ ok: true, text: 'a'.repeat(2_000_000), pages: 2 }, '1.4.0').truncated, true);
});

test('công tắc: mặc định tắt, tệp hỏng là tắt, ghi rồi đọc lại đúng', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'softe-set-'));
  const file = path.join(dir, settings.NAME);
  assert.equal(settings.readEnabled(file, fs), false);
  fs.writeFileSync(file, '{"enabled":"yes"}'); assert.equal(settings.readEnabled(file, fs), false);
  fs.writeFileSync(file, 'rác'); assert.equal(settings.readEnabled(file, fs), false);
  assert.equal(settings.writeEnabled(file, fs, true), true); assert.equal(settings.readEnabled(file, fs), true);
  assert.equal(settings.writeEnabled(path.join(dir, 'no', 'such', 'x.json'), fs, true), false, 'ghi lỗi không ném');
});

// ---- Electron giả cho cửa sổ ẩn ----
function fakeElectron({ onLoad } = {}) {
  const rec = { windows: [], sessions: [], sent: [], removed: [] };
  const ipc = new EventEmitter();
  ipc.handle = () => {};
  class WC extends EventEmitter {
    constructor() { super(); this.open = null; }
    setWindowOpenHandler(fn) { this.open = fn; }
    send(ch, payload) { rec.sent.push({ ch, payload }); }
    getOSProcessId() { return 4242; }
  }
  class Win {
    constructor(opts) { this.options = opts; this.webContents = new WC(); this.destroyed = false; rec.windows.push(this); }
    loadURL(url) { this.url = url; if (onLoad) onLoad(this); return Promise.resolve(); }
    destroy() { this.destroyed = true; }
    isDestroyed() { return this.destroyed; }
  }
  const sessionFake = () => {
    const s = { handled: {}, perms: [], requests: null, devices: null };
    s.protocol = { handle(scheme, fn) { s.handled[scheme] = fn; } };
    s.webRequest = { onBeforeRequest(fn) { s.requests = fn; } };
    s.setPermissionRequestHandler = (fn) => s.perms.push(['request', fn]);
    s.setPermissionCheckHandler = (fn) => s.perms.push(['check', fn]);
    s.setDevicePermissionHandler = (fn) => { s.devices = fn; };
    return s;
  };
  const electron = {
    BrowserWindow: Win, ipcMain: ipc, app: { getAppMetrics: () => rec.metrics || [] },
    session: { fromPartition(name, o) { const s = sessionFake(); s.name = name; s.opts = o; rec.sessions.push(s); return s; } },
  };
  return { electron, rec, ipc };
}
const fakeTimers = () => { const t = { fire: null, cleared: 0, poll: null }; return { t, setTimer: (fn) => { t.fire = fn; return 1; }, clearTimer: () => { t.cleared += 1; }, setPoll: (fn) => { t.poll = fn; return 2; }, clearPoll: () => {} }; };

test('cửa sổ ẩn: nhốt hoàn toàn (hộp cát, không Node, không mạng, không quyền), gửi việc, nhận kết quả, rồi hủy', async () => {
  const { electron, rec, ipc } = fakeElectron({ onLoad: (w) => setImmediate(() => { ipc.emit('softe-local:ready', { sender: w.webContents }); }) });
  const tm = fakeTimers();
  const host = createWorkerHost({ electron, dir: DIR, ...tm, random: () => 'abc123' });
  const p = host.run(new Uint8Array([1, 2, 3]), { budgetMs: 5000 });
  await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
  const w = rec.windows[0];
  const o = w.options.webPreferences;
  assert.equal(w.options.show, false);
  assert.deepEqual([o.sandbox, o.contextIsolation, o.nodeIntegration, o.nodeIntegrationInWorker, o.nodeIntegrationInSubFrames, o.webSecurity, o.allowRunningInsecureContent, o.webviewTag, o.devTools],
    [true, true, false, false, false, true, false, false, false]);
  assert.match(o.preload, /worker-preload\.js$/);
  assert.equal(rec.sessions[0].name, 'softe-local-abc123'); assert.ok(!rec.sessions[0].name.startsWith('persist:'), 'vùng lưu chỉ trong bộ nhớ');
  assert.equal(o.session, rec.sessions[0]);
  const s = rec.sessions[0];
  // mạng: chỉ địa chỉ riêng được đi qua
  const verdict = (url) => { let r; s.requests({ url }, (x) => { r = x; }); return r.cancel; };
  assert.equal(verdict('softe-local://app/worker.html'), false);
  for (const u of ['https://evil.example/x', 'http://169.254.169.254/', 'file:///etc/passwd', 'ws://x/', 'softe-local://evil/x', 'data:text/html,x']) assert.equal(verdict(u), true, u);
  // quyền: từ chối hết
  for (const [kind, fn] of s.perms) { if (kind === 'request') { let r; fn({}, 'media', (x) => { r = x; }); assert.equal(r, false); } else assert.equal(fn(), false); }
  assert.equal(s.devices(), false);
  assert.equal(w.webContents.open().action, 'deny');
  let prevented = 0; for (const ev of ['will-navigate', 'will-redirect', 'will-attach-webview']) w.webContents.emit(ev, { preventDefault() { prevented += 1; } });
  assert.equal(prevented, 3);
  // việc đã gửi đúng nội dung và hạn
  const job = rec.sent.find((x) => x.ch === 'softe-local:job').payload;
  assert.equal(job.id, 'abc123'); assert.equal(job.budgetMs, 5000); assert.deepEqual([...job.bytes], [1, 2, 3]);
  // kết quả từ một cửa sổ KHÁC hay sai mã việc bị bỏ qua
  ipc.emit('softe-local:done', { sender: {} }, 'abc123', { ok: true, text: 'giả', pages: 1 });
  ipc.emit('softe-local:done', { sender: w.webContents }, 'khac', { ok: true, text: 'giả', pages: 1 });
  assert.equal(w.destroyed, false);
  ipc.emit('softe-local:done', { sender: w.webContents }, 'abc123', { ok: true, text: 'thật', pages: 2 });
  assert.deepEqual(await p, { ok: true, text: 'thật', pages: 2 });
  assert.equal(w.destroyed, true, 'xong là hủy cả cửa sổ');
  assert.equal(ipc.listenerCount('softe-local:ready'), 0); assert.equal(ipc.listenerCount('softe-local:done'), 0);
});

test('cửa sổ ẩn: quá giờ, quá bộ nhớ, trang hỏng, không tải được đều hủy cửa sổ và trả lỗi', async () => {
  for (const how of ['timeout', 'memory', 'gone', 'failload']) {
    const { electron, rec, ipc } = fakeElectron();
    const tm = fakeTimers();
    const host = createWorkerHost({ electron, dir: DIR, ...tm, random: () => 'id1' });
    const p = host.run(new Uint8Array([1]), { budgetMs: 1000 });
    const w = rec.windows[0];
    if (how === 'timeout') tm.t.fire();
    if (how === 'memory') { rec.metrics = [{ pid: 4242, memory: { workingSetSize: (LIMITS.maxWorkerBytes / 1024) + 1 } }]; tm.t.poll(); }
    if (how === 'gone') w.webContents.emit('render-process-gone');
    if (how === 'failload') w.webContents.emit('did-fail-load');
    const r = await p;
    assert.equal(r.ok, false, how);
    assert.equal(r.reason, how === 'timeout' ? 'timeout' : 'failed', how);
    assert.equal(w.destroyed, true, how);
    assert.equal(ipc.listenerCount('softe-local:done'), 0, how);
  }
});

test('cửa sổ ẩn: đo bộ nhớ lỗi không làm hỏng việc; dựng cửa sổ lỗi trả failed', async () => {
  const { electron, rec } = fakeElectron();
  electron.app.getAppMetrics = () => { throw new Error('x'); };
  const tm = fakeTimers();
  const p = createWorkerHost({ electron, dir: DIR, ...tm }).run(new Uint8Array([1]));
  tm.t.poll(); // không ném
  rec.windows[0].webContents.emit('render-process-gone');
  assert.equal((await p).reason, 'failed');
  const broken = fakeElectron(); broken.electron.BrowserWindow = class { constructor() { throw new Error('no'); } };
  assert.deepEqual(await createWorkerHost({ electron: broken.electron, dir: DIR, ...fakeTimers() }).run(new Uint8Array([1])), { ok: false, reason: 'failed' });
});

test('địa chỉ riêng được phục vụ có CSP chặt; tệp ngoài danh sách là 404', async () => {
  const { electron } = fakeElectron();
  const host = createWorkerHost({ electron, dir: DIR });
  const r = host.serve({ url: 'softe-local://app/worker.html' });
  assert.equal(r.status, 200); assert.equal(r.headers.get('content-security-policy'), assets.CSP); assert.match(r.headers.get('content-type'), /text\/html/);
  assert.equal(host.serve({ url: 'softe-local://app/../main.js' }).status, 404);
  assert.equal(host.serve({ url: 'https://softe.ai/' }).status, 404);
});

test('đăng ký địa chỉ riêng: tiêu chuẩn, an toàn; không có protocol thì không ném', () => {
  const calls = [];
  registerScheme({ registerSchemesAsPrivileged: (l) => calls.push(l) });
  assert.deepEqual(calls[0], [{ scheme: 'softe-local', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
  registerScheme(undefined); registerScheme({});
});

// ---- Ô cửa ----
function bridge({ enabled = true, risky = false, ram = 16 * GB, cpus = 8, battery = false, run, thermal = 'nominal' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'softe-ud-'));
  if (enabled) settings.writeEnabled(path.join(dir, settings.NAME), fs, true);
  const handlers = {};
  const electron = { ipcMain: { handle: (ch, fn) => { handlers[ch] = fn; } }, powerMonitor: { isOnBatteryPower: () => battery, getCurrentThermalState: () => thermal } };
  const runs = [];
  const host = { run: async (bytes, o) => { runs.push({ bytes, o }); return run ? run(bytes) : { ok: true, text: 'Nội dung hợp đồng thuê nhà đủ dài để qua kiểm tra', pages: 2, truncated: false }; } };
  const osImpl = { totalmem: () => ram, cpus: () => new Array(cpus).fill({}) };
  // deviceNow dùng os thật: ghi đè bằng mô-đun os giả qua require cache là quá nặng, nên thử qua lớp bọc: đổi totalmem / cpus trực tiếp
  const realTotal = os.totalmem; const realCpus = os.cpus; os.totalmem = osImpl.totalmem; os.cpus = osImpl.cpus;
  const b = install({ electron, cfg: { site: SITE_URL }, version: '1.4.0', risky, userData: dir, host });
  const restore = () => { os.totalmem = realTotal; os.cpus = realCpus; };
  return { b, handlers, runs, restore };
}
const frame = (over = {}) => ({ senderFrame: { processId: 7, routingId: 3, url: `${SITE_URL}/chat`, parent: null, ...over } });

test('ô cửa: mặc định tắt thì không có gì; bật rồi thì đúng đường hello → extract', async () => {
  const off = bridge({ enabled: false });
  assert.equal(off.b.enabled, false);
  assert.equal(await off.handlers['softe-local:hello'](frame()), null);
  assert.equal((await off.handlers['softe-local:capabilities'](frame())).extract, 'off');
  assert.deepEqual(await off.handlers['softe-local:extract'](frame(), 'x', { bytes: new ArrayBuffer(8), name: 'a.pdf', kind: 'pdf' }), { ok: false, reason: 'off' });
  off.restore();
  const on = bridge();
  try {
    assert.equal(on.b.enabled, true);
    const caps = await on.handlers['softe-local:capabilities'](frame());
    assert.deepEqual(caps, { extract: 'ok', kinds: ['pdf'], maxBytes: LIMITS.maxBytes });
    const tok = await on.handlers['softe-local:hello'](frame());
    assert.match(tok, /^[0-9a-f]{48}$/);
    assert.equal((await on.handlers['softe-local:capabilities'](frame({ url: 'https://evil.example/' }))).extract, 'off', 'trang lạ không biết máy khỏe hay yếu');
    assert.equal((await on.handlers['softe-local:capabilities'](frame({ parent: {} }))).extract, 'off');
    const r = await on.handlers['softe-local:extract'](frame(), tok, { bytes: new Uint8Array([37, 80, 68, 70]).buffer, name: 'hd.pdf', kind: 'pdf' });
    assert.deepEqual(r, { ok: true, text: 'Nội dung hợp đồng thuê nhà đủ dài để qua kiểm tra', pages: 2, truncated: false, by: 'desktop/1.4.0' });
    assert.equal(on.runs.length, 1); assert.equal(on.runs[0].o.budgetMs, LIMITS.jobMs);
    on.b.setEnabled(false);
    assert.equal(settings.readEnabled(path.join(os.tmpdir(), 'nope'), fs), false);
    assert.equal((await on.handlers['softe-local:capabilities'](frame())).extract, 'off');
  } finally { on.restore(); }
});

test('ô cửa: khung con, trang lạ, mã sai, kiểu lạ, quá lớn đều bị từ chối và không bao giờ chạy cửa sổ ẩn', async () => {
  const t = bridge();
  try {
    const tok = await t.handlers['softe-local:hello'](frame());
    const call = (f, token, p) => t.handlers['softe-local:extract'](f, token, p);
    const pdf = { bytes: new ArrayBuffer(8), name: 'a.pdf', kind: 'pdf' };
    assert.equal(await t.handlers['softe-local:hello'](frame({ parent: {} })), null, 'khung con');
    assert.equal(await t.handlers['softe-local:hello'](frame({ url: 'https://evil.example/' })), null);
    assert.equal(await t.handlers['softe-local:hello']({}), null, 'không có senderFrame');
    assert.equal((await call(frame({ parent: {} }), tok, pdf)).reason, 'off');
    assert.equal((await call(frame({ url: 'https://evil.example/' }), tok, pdf)).reason, 'off');
    assert.equal((await call(frame(), 'sai', pdf)).reason, 'off');
    assert.equal((await call(frame(), tok, { ...pdf, kind: 'docx' })).reason, 'unsupported');
    assert.equal((await call(frame(), tok, { ...pdf, name: 'x'.repeat(300) })).reason, 'unsupported');
    assert.equal((await call(frame(), tok, { ...pdf, bytes: 'chuỗi' })).reason, 'unsupported');
    assert.equal((await call(frame(), tok, { ...pdf, bytes: new ArrayBuffer(0) })).reason, 'unsupported');
    assert.equal((await call(frame(), tok, null)).reason, 'unsupported');
    assert.equal((await call(frame(), tok, { ...pdf, bytes: new ArrayBuffer(LIMITS.maxBytes + 1) })).reason, 'too_large');
    assert.equal(t.runs.length, 0, 'không lần nào chạy cửa sổ ẩn');
  } finally { t.restore(); }
});

test('ô cửa: máy yếu, tư thế rủi ro, cửa sổ ẩn lỗi hay trả rác: luôn { ok: false }, không ném', async () => {
  for (const [name, opts, caps, reason] of [
    ['ít RAM', { ram: 4 * GB }, 'weak', 'weak'], ['ít nhân', { cpus: 2 }, 'weak', 'weak'], ['dùng pin', { battery: true }, 'weak', 'weak'],
    ['máy nóng', { thermal: 'serious' }, 'weak', 'weak'], ['tư thế rủi ro', { risky: true }, 'off', 'off'],
  ]) {
    const t = bridge(opts);
    try {
      assert.equal((await t.handlers['softe-local:capabilities'](frame())).extract, caps, name);
      const tok = await t.handlers['softe-local:hello'](frame());
      const r = await t.handlers['softe-local:extract'](frame(), tok, { bytes: new ArrayBuffer(8), name: 'a.pdf', kind: 'pdf' });
      assert.deepEqual(r, { ok: false, reason }, name);
      assert.equal(t.runs.length, 0, name);
    } finally { t.restore(); }
  }
  const boom = bridge({ run: () => { throw new Error('nổ'); } });
  try {
    const tok = await boom.handlers['softe-local:hello'](frame());
    assert.deepEqual(await boom.handlers['softe-local:extract'](frame(), tok, { bytes: new ArrayBuffer(8), name: 'a.pdf', kind: 'pdf' }), { ok: false, reason: 'failed' });
    assert.equal(boom.b.gate.busy, false, 'lỗi vẫn nhả việc');
  } finally { boom.restore(); }
  const junk = bridge({ run: () => ({ ok: true, text: { toString() { return 'x'; } }, pages: 1 }) });
  try {
    const tok = await junk.handlers['softe-local:hello'](frame());
    assert.equal((await junk.handlers['softe-local:extract'](frame(), tok, { bytes: new ArrayBuffer(8), name: 'a.pdf', kind: 'pdf' })).ok, false);
  } finally { junk.restore(); }
});

test('ô cửa: hai việc cùng lúc thì việc thứ hai là busy', async () => {
  let release; const gateway = new Promise((r) => { release = r; });
  const t = bridge({ run: async () => { await gateway; return { ok: true, text: 'Nội dung hợp đồng thuê nhà đủ dài để qua kiểm tra', pages: 1 }; } });
  try {
    const tok = await t.handlers['softe-local:hello'](frame());
    const p = { bytes: new ArrayBuffer(8), name: 'a.pdf', kind: 'pdf' };
    const first = t.handlers['softe-local:extract'](frame(), tok, p);
    await new Promise((r) => setImmediate(r));
    assert.equal((await t.handlers['softe-local:extract'](frame(), tok, p)).reason, 'busy');
    release();
    assert.equal((await first).ok, true);
  } finally { t.restore(); }
});

test('frameOf: khung trên cùng khi không có khung cha', () => {
  assert.deepEqual(frameOf({ senderFrame: { processId: 1, routingId: 2, url: 'https://softe.ai/x', parent: null } }), { key: '1:2', url: 'https://softe.ai/x', isTop: true });
  assert.equal(frameOf({ senderFrame: { processId: 1, routingId: 2, url: 'https://softe.ai/x', parent: {} } }).isTop, false);
  assert.equal(frameOf({}), null); assert.equal(frameOf(null), null);
});

// ---- Preload ----
function runPreload(protocol) {
  const exposed = []; const invoked = [];
  const electron = { contextBridge: { exposeInMainWorld: (k, v) => exposed.push([k, v]) }, ipcRenderer: { invoke: async (ch, ...a) => { invoked.push([ch, ...a]); return ch === 'softe-local:hello' ? 'TOKEN' : { ok: true }; } } };
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
  vm.runInNewContext(`(function (require, location) {${src}\n})`, {})((id) => { assert.equal(id, 'electron'); return electron; }, { protocol });
  return { exposed, invoked };
}
test('preload: trang riêng của app không có gì; trang softe.ai có đúng một đối tượng đóng băng, mã cấp một lần cho lần tải trang', async () => {
  assert.equal(runPreload('file:').exposed.length, 0);
  assert.equal(runPreload('softe-local:').exposed.length, 0);
  const { exposed, invoked } = runPreload('https:');
  assert.equal(exposed.length, 1); assert.equal(exposed[0][0], 'softeLocal');
  const api = exposed[0][1];
  assert.ok(Object.isFrozen(api)); assert.deepEqual(Object.keys(api).sort(), ['capabilities', 'extract', 'version']); assert.equal(api.version, 1);
  await api.capabilities();
  await api.extract(new Uint8Array([1]), { name: 'a.pdf', kind: 'pdf' });
  await api.extract(new Uint8Array([2]), { name: 'b.pdf', kind: 'pdf' });
  assert.equal(invoked.filter((x) => x[0] === 'softe-local:hello').length, 1, 'xin mã một lần cho mỗi lần tải trang');
  const ex = invoked.filter((x) => x[0] === 'softe-local:extract');
  assert.equal(ex[0][1], 'TOKEN'); assert.deepEqual(Object.keys(ex[0][2]).sort(), ['bytes', 'kind', 'name']);
  await api.extract(new Uint8Array([3]));  // thiếu tham số: không ném ở preload
});

// ---- Rào chắn chung và tư thế ----
test('redact che khóa, mã, JWT khỏi nhật ký', () => {
  assert.ok(!/abcdefghijkl/.test(hardening.redact('Authorization: Bearer abcdefghijkl')));
  assert.equal(hardening.redact('https://softe.ai/cb?code=SECRET&x=1&state=abc'), 'https://softe.ai/cb?code=[đã che]&x=1&state=[đã che]');
  assert.ok(!/eyJ/.test(hardening.redact('t=eyJhbGciOiJI.eyJzdWIiOiIx.c2lnbmF0dXJl')));
  assert.ok(!/sk-/.test(hardening.redact('key sk-1234567890abcdefghij')));
  assert.equal(hardening.redact(new Error('lỗi nhỏ')), 'Error: lỗi nhỏ');
  assert.ok(hardening.redact('x'.repeat(2000)).length <= 501);
});

test('chuyển hướng khung chính tới nơi lạ thì ra trình duyệt, khung con không đụng tới; không webview', () => {
  assert.equal(hardening.redirectDecision('https://softe.ai/a', true, SITE_URL), 'allow');
  assert.equal(hardening.redirectDecision('https://evil.example/a', true, SITE_URL), 'external');
  assert.equal(hardening.redirectDecision('https://evil.example/a', false, SITE_URL), 'allow');
  const opened = []; const contents = new EventEmitter();
  hardening.guardContents(contents, { site: SITE_URL, external: (u) => opened.push(u) });
  let blocked = 0; contents.emit('will-attach-webview', { preventDefault() { blocked += 1; } });
  contents.emit('will-redirect', { preventDefault() { blocked += 1; } }, 'https://evil.example/x', false, true);
  contents.emit('will-redirect', { preventDefault() { blocked += 1; } }, 'https://softe.ai/ok', false, true);
  assert.equal(blocked, 2); assert.deepEqual(opened, ['https://evil.example/x']);
  hardening.guardContents(null, {}); hardening.guardContents({}, {});
});

test('install: chứng chỉ sai bị từ chối; quyền thiết bị và chia sẻ màn hình đóng', () => {
  const app = new EventEmitter();
  const ses = { dev: null, display: null, setDevicePermissionHandler(fn) { this.dev = fn; }, setDisplayMediaRequestHandler(fn) { this.display = fn; } };
  hardening.install({ app, session: { defaultSession: ses }, site: SITE_URL, external() {} });
  let answer = 'chưa'; let prevented = false;
  app.emit('certificate-error', { preventDefault() { prevented = true; } }, {}, 'https://x', 'ERR', {}, (v) => { answer = v; });
  assert.equal(prevented, true); assert.equal(answer, false);
  assert.equal(ses.dev(), false);
  let granted = 'chưa'; ses.display({}, (v) => { granted = v; }); assert.deepEqual(granted, {});
  const c = new EventEmitter(); let n = 0; app.emit('web-contents-created', {}, Object.assign(c, {})); c.emit('will-attach-webview', { preventDefault() { n += 1; } });
  assert.equal(n, 1, 'mọi nội dung web mới đều có rào chắn');
});

test('tư thế khởi động: cảnh báo cờ gỡ lỗi, cờ nguy hiểm, biến môi trường; chạy bình thường thì sạch; kiểm tra lỗi không làm hỏng kiểm tra khác', () => {
  assert.deepEqual(posture.audit({ argv: ['/Softe'], env: {}, packaged: true }), { warnings: [], risky: false });
  assert.deepEqual(posture.audit({ argv: ['/Softe', '--remote-debugging-port=9222'], env: {} }), { warnings: ['debug_flags'], risky: true });
  assert.deepEqual(posture.audit({ argv: ['--inspect'], env: {} }).warnings, ['debug_flags']);
  assert.deepEqual(posture.audit({ argv: ['--no-sandbox'], env: {} }).warnings, ['unsafe_flags']);
  assert.deepEqual(posture.audit({ argv: ['--ignore-certificate-errors'], env: {} }).warnings, ['unsafe_flags']);
  assert.deepEqual(posture.audit({ argv: [], env: { NODE_OPTIONS: '--require x' } }), { warnings: ['node_env'], risky: true });
  assert.deepEqual(posture.audit({ argv: [], env: { ELECTRON_RUN_AS_NODE: '1' } }).risky, true);
  assert.deepEqual(posture.audit({ argv: [], env: { NODE_OPTIONS: '' } }), { warnings: [], risky: false });
  assert.deepEqual(posture.audit({ argv: [], env: {}, packaged: false }), { warnings: ['unpackaged'], risky: false }, 'chạy từ mã nguồn: chỉ ghi chú, không rủi ro');
  assert.deepEqual(posture.audit({ argv: null, env: null }), { warnings: [], risky: false });
  assert.deepEqual(posture.audit({ argv: [Symbol('x')], env: {} }).risky, false, 'phần tử lạ không làm ném lỗi');
});

// ---- main.js nối dây ----
test('main.js: đăng ký địa chỉ riêng, dựng ô cửa, menu Trợ giúp có công tắc (mặc định tắt) và bấm được; lỗi dựng ô cửa không làm hỏng app', async () => {
  const m = bootMain();
  assert.equal(m.schemes.length, 1); assert.equal(m.schemes[0][0].scheme, 'softe-local');
  for (const ch of ['softe-local:hello', 'softe-local:capabilities', 'softe-local:extract']) assert.equal(typeof m.handlers[ch], 'function', ch);
  assert.equal((await m.handlers['softe-local:capabilities'](frame())).extract, 'off', 'mặc định tắt');
  const help = () => m.menu.find((x) => x.label === 'Trợ giúp').submenu;
  const item = help().find((i) => i.type === 'checkbox');
  assert.equal(item.checked, false);
  item.click();
  assert.equal(help().find((i) => i.type === 'checkbox').checked, true, 'bấm là bật, menu dựng lại');
  assert.equal(JSON.parse(fs.readFileSync(path.join(m.userData, settings.NAME), 'utf8')).enabled, true);
  const risky = bootMain({ argv: ['/opt/Softe/softe', '--remote-debugging-port=9222'] });
  risky.menu.find((x) => x.label === 'Trợ giúp').submenu.find((i) => i.type === 'checkbox').click();
  assert.equal((await risky.handlers['softe-local:capabilities'](frame())).extract, 'off', 'cờ gỡ lỗi từ xa: không xử lý gì trên máy dù đã bật');
});
