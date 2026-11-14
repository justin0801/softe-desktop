'use strict';
// Màn chờ + trang mất mạng (có Mochi). Không cần Electron: hàm thuần, tệp HTML/CSS/JS, khóa mã băm, và mã nguồn main.js.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const shell = require('../src/shell');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const PAGES = path.join(SRC, 'pages');
const MOCHI = path.join(SRC, 'mochi');
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const HTML_FILES = ['splash.html', 'offline.vi.html', 'offline.en.html'];
const SITE = 'https://softe.ai';

// ---------- hàm thuần ----------

test('pageLang: bắt đầu bằng "vi" thì tiếng Việt, còn lại tiếng Anh', () => {
  for (const l of ['vi', 'vi-VN', 'vi_VN', 'VI', 'Vi-vn', ' vi-VN ']) assert.strictEqual(shell.pageLang(l), 'vi', l);
  for (const l of ['en', 'en-US', 'en-GB', 'fr', 'zh-CN', 'ja', 'de-DE', 'vie', 'viet', '', '  ', undefined, null, 42, {}]) {
    assert.strictEqual(shell.pageLang(l), 'en', String(l));
  }
});

test('offlinePage / splashHash: hai ngôn ngữ, ngôn ngữ lạ về tiếng Anh', () => {
  assert.strictEqual(shell.offlinePage('vi'), 'offline.vi.html');
  assert.strictEqual(shell.offlinePage('en'), 'offline.en.html');
  assert.strictEqual(shell.offlinePage('fr'), 'offline.en.html');
  assert.strictEqual(shell.offlinePage(undefined), 'offline.en.html');
  assert.strictEqual(shell.splashHash('vi'), 'vi');
  assert.strictEqual(shell.splashHash('en'), 'en');
  assert.strictEqual(shell.splashHash('xx'), 'en');
});

test('pagePath: chỉ ba trang của app, không nhận tên tệp khác', () => {
  for (const f of HTML_FILES) {
    assert.strictEqual(shell.pagePath(f), path.join(PAGES, f));
    assert.ok(fs.existsSync(shell.pagePath(f)), `${f} phải tồn tại`);
  }
  for (const bad of ['../main.js', '../../package.json', 'page.css', 'offline.fr.html', '', undefined, '/etc/passwd']) {
    assert.throws(() => shell.pagePath(bad), String(bad));
  }
});

test('failureMatters: chỉ lỗi mạng của khung chính, của địa chỉ softe.ai', () => {
  const fail = (o) => shell.failureMatters({ errorCode: -105, isMainFrame: true, validatedURL: `${SITE}/`, ...o }, SITE);
  assert.strictEqual(fail({}), true);
  for (const code of [-2, -7, -21, -100, -101, -102, -104, -105, -106, -109, -118, -130, -200, -310]) {
    assert.strictEqual(fail({ errorCode: code }), true, `mã ${code}`);
  }
  assert.strictEqual(fail({ validatedURL: `${SITE}/chat/abc` }), true);
  assert.strictEqual(fail({ validatedURL: 'https://www.softe.ai/' }), true);
  // ERR_ABORTED (-3) không phải lỗi mạng (lượt tải bị thay bằng lượt khác)
  assert.strictEqual(shell.ERR_ABORTED, -3);
  assert.strictEqual(fail({ errorCode: -3 }), false);
  // khung con (iframe) không làm cả cửa sổ mất mạng
  assert.strictEqual(fail({ isMainFrame: false }), false);
  assert.strictEqual(fail({ isMainFrame: undefined }), false);
  assert.strictEqual(fail({ isMainFrame: 'true' }), false);
  // địa chỉ không phải trang của app: chính hai trang cục bộ, trang lạ, giao thức khác, rỗng
  for (const url of ['https://evil.example/', 'https://softe.ai.evil.example/', 'http://softe.ai/', 'file:///x/src/pages/offline.vi.html',
    'file:///x/src/pages/splash.html', 'about:blank', 'javascript:alert(1)', '', undefined, null, 'không phải địa chỉ']) {
    assert.strictEqual(fail({ validatedURL: url }), false, String(url));
  }
  // không phải mã lỗi
  for (const code of [0, 1, 200, 500, NaN, undefined, null, '-105', -105.5]) assert.strictEqual(fail({ errorCode: code }), false, String(code));
  assert.strictEqual(shell.failureMatters(null, SITE), false);
  assert.strictEqual(shell.failureMatters(undefined, SITE), false);
  // bản chạy thử trên máy lập trình
  assert.strictEqual(shell.failureMatters({ errorCode: -102, isMainFrame: true, validatedURL: 'http://localhost:3000/chat' }, 'http://localhost:3000'), true);
});

test('isRetry: chỉ #retry của chính trang mất mạng trong app, không phải của web', () => {
  const base = 'file:///Applications/Softe.app/Contents/Resources/app.asar/src/pages';
  assert.strictEqual(shell.RETRY_HASH, 'retry');
  assert.strictEqual(shell.isRetry(`${base}/offline.vi.html#retry`), true);
  assert.strictEqual(shell.isRetry(`${base}/offline.en.html#retry`), true);
  assert.strictEqual(shell.isRetry('file:///C:/Users/a/AppData/Local/Programs/Softe/resources/app.asar/src/pages/offline.en.html#retry'), true);
  assert.strictEqual(shell.isRetry('file:///home/me/softe-desktop/src/pages/offline.vi.html#retry'), true);
  for (const url of [
    `${base}/offline.vi.html`, `${base}/offline.vi.html#`, `${base}/offline.vi.html#other`, `${base}/offline.vi.html#retry2`, `${base}/offline.vi.html#Retry`,
    `${base}/splash.html#retry`, `${base}/splash.html#vi`, `${base}/page.css#retry`,
    'https://softe.ai/#retry', 'https://softe.ai/pages/offline.vi.html#retry', 'https://evil.example/src/pages/offline.en.html#retry',
    'http://localhost:3000/#retry', 'about:blank#retry', 'javascript:1#retry', 'không phải địa chỉ', '', undefined, null, 5,
  ]) assert.strictEqual(shell.isRetry(url), false, String(url));
});

test('backgroundFor: nền cửa sổ khi chưa vẽ xong, theo sáng/tối của máy', () => {
  assert.strictEqual(shell.backgroundFor(false), shell.BACKGROUNDS.light);
  assert.strictEqual(shell.backgroundFor(true), shell.BACKGROUNDS.dark);
  assert.notStrictEqual(shell.BACKGROUNDS.light, shell.BACKGROUNDS.dark);
  assert.notStrictEqual(shell.backgroundFor(false).toLowerCase(), '#ffffff', 'không còn nền trắng cứng');
});

// ---------- các trang HTML ----------

// Duyệt thẻ rất gọn (đủ cho ba trang này): trả về danh sách thẻ kèm các thẻ cha đang mở.
const VOID = new Set(['meta', 'link', 'img', 'br', 'hr', 'input']);
function tags(html) {
  const out = []; const stack = [];
  const body = html.replace(/<!--[\s\S]*?-->/g, '');
  for (const m of body.matchAll(/<(\/?)([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g)) {
    const [, close, name, rest] = m; const tag = name.toLowerCase();
    if (close) { const i = stack.lastIndexOf(tag); if (i >= 0) stack.length = i; continue; }
    const attrs = {};
    for (const a of rest.matchAll(/([\w:-]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|[^\s"'>]+))?/g)) attrs[a[1].toLowerCase()] = a[3] ?? a[4] ?? (a[2] ?? '');
    out.push({ tag, attrs, parents: [...stack] });
    if (!VOID.has(tag) && !/\/\s*$/.test(rest)) stack.push(tag);
  }
  return out;
}
// Chữ người dùng thấy: bỏ chú thích, script, style, thẻ và các phần tử bị ẩn bằng thuộc tính hidden.
function visibleText(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, '\n').split('\n').map((s) => s.trim()).filter(Boolean);
}
// "Khung xương" của trang: thẻ + thuộc tính, chữ thay bằng T, lang bỏ giá trị: hai bản ngôn ngữ phải trùng.
function skeleton(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '').replace(/\blang="[^"]*"/g, 'lang=""').replace(/>([^<]*\S[^<]*)</g, '>T<').replace(/\s+/g, ' ').trim();
}

const pageHtml = Object.fromEntries(HTML_FILES.map((f) => [f, read(PAGES, f)]));

test('hai trang mất mạng cùng cấu trúc, đúng ngôn ngữ', () => {
  assert.strictEqual(skeleton(pageHtml['offline.vi.html']), skeleton(pageHtml['offline.en.html']));
  assert.match(pageHtml['offline.vi.html'], /<html lang="vi">/);
  assert.match(pageHtml['offline.en.html'], /<html lang="en">/);
  const VI_LETTER = /[ăâđêôơưàáạảãằắặẳẵầấậẩẫèéẹẻẽềếệểễìíịỉĩòóọỏõồốộổỗờớợởỡùúụủũừứựửữỳýỵỷỹ]/i;
  assert.ok(visibleText(pageHtml['offline.vi.html']).some((t) => VI_LETTER.test(t)), 'bản Việt có chữ Việt');
  assert.ok(!visibleText(pageHtml['offline.en.html']).some((t) => VI_LETTER.test(t)), 'bản Anh không lẫn chữ Việt');
  // câu đúng ý của gói việc
  const vi = visibleText(pageHtml['offline.vi.html']).join(' ');
  assert.match(vi, /Chưa kết nối được softe\.ai/);
  assert.match(vi, /Kiểm tra mạng rồi thử lại nhé/);
  assert.match(vi, /Thử lại/);
  const en = visibleText(pageHtml['offline.en.html']).join(' ');
  assert.match(en, /Can't reach softe\.ai/);
  assert.match(en, /Check your connection and try again/);
  assert.match(en, /Try again/);
});

test('màn chờ: một tệp, hai lời (#vi / #en), một dòng chữ cho mỗi ngôn ngữ', () => {
  const html = pageHtml['splash.html'];
  const msgs = tags(html).filter((t) => (t.attrs.class || '').split(/\s+/).includes('msg'));
  assert.deepStrictEqual(msgs.map((t) => t.attrs.id), ['vi', 'en'], 'vi đứng trước en (CSS ~)');
  assert.ok(msgs.every((t) => t.attrs.lang === t.attrs.id));
  assert.ok(shell.splashHash('vi') === msgs[0].attrs.id && shell.splashHash('en') === msgs[1].attrs.id, 'hash khớp id trong trang');
  const text = visibleText(html);
  assert.ok(text.includes('Đang mở Softe…') && text.includes('Opening Softe…'), text.join('|'));
  const css = read(PAGES, 'page.css');
  assert.match(css, /#vi:target\s*{[^}]*display:\s*block/);
  assert.match(css, /#vi:target\s*~\s*#en\s*{[^}]*display:\s*none/);
});

test('mọi trang: <img> Mochi chỉ để nhìn (trang trí, không bấm, không focus, không trong <a>/<button>), tối đa một Mochi', () => {
  const want = { 'splash.html': 'loading.svg', 'offline.vi.html': 'oops.svg', 'offline.en.html': 'oops.svg' };
  for (const f of HTML_FILES) {
    const t = tags(pageHtml[f]);
    const imgs = t.filter((x) => x.tag === 'img');
    assert.strictEqual(imgs.length, 1, `${f}: đúng một ảnh (tối đa một Mochi cử động)`);
    const img = imgs[0];
    assert.strictEqual(img.attrs.src, `../mochi/${want[f]}`, f);
    assert.strictEqual(img.attrs['data-still'], '../mochi/mascot.svg', `${f}: ảnh tĩnh sau 20 giây`);
    assert.strictEqual(img.attrs.alt, '', `${f}: alt rỗng`);
    assert.strictEqual(img.attrs['aria-hidden'], 'true', `${f}: aria-hidden`);
    assert.strictEqual(img.attrs.id, 'mochi');
    assert.ok(!img.parents.some((p) => ['a', 'button', 'label', 'summary'].includes(p)), `${f}: Mochi không nằm trong thẻ bấm được`);
    for (const x of t) {
      const bad = Object.keys(x.attrs).filter((k) => /^on/.test(k) || k === 'tabindex' || k === 'role' && x.tag === 'img' || k === 'accesskey');
      assert.deepStrictEqual(bad, [], `${f}: <${x.tag}> không có ${bad.join(', ')}`);
    }
    // ảnh tĩnh và ảnh động đều nằm trong bộ chép bởi công cụ
    for (const name of [want[f], 'mascot.svg']) assert.ok(fs.existsSync(path.join(MOCHI, name)), name);
  }
  assert.match(read(PAGES, 'page.css'), /\.mochi\s*{[^}]*pointer-events:\s*none/);
});

test('mọi trang: nút "Thử lại" là thẻ <a> thật tới #retry (không phải Mochi); màn chờ không có nút', () => {
  for (const f of ['offline.vi.html', 'offline.en.html']) {
    const a = tags(pageHtml[f]).filter((x) => x.tag === 'a');
    assert.strictEqual(a.length, 1);
    assert.strictEqual(a[0].attrs.href, `#${shell.RETRY_HASH}`);
    assert.strictEqual(a[0].attrs.id, 'retry');
    assert.ok(!a[0].parents.includes('button'));
    const busy = tags(pageHtml[f]).find((x) => x.attrs.id === 'busy');
    assert.ok(busy && 'hidden' in busy.attrs, `${f}: dòng "đang thử lại" ẩn lúc đầu`);
  }
  const splash = tags(pageHtml['splash.html']);
  assert.ok(!splash.some((x) => ['a', 'button', 'input', 'form'].includes(x.tag)), 'màn chờ không bấm được gì');
});

test('mọi trang: CSP nghiêm, không tải gì từ mạng, không mã chạy trong trang', () => {
  for (const f of HTML_FILES) {
    const html = pageHtml[f];
    const meta = tags(html).find((x) => x.tag === 'meta' && (x.attrs['http-equiv'] || '').toLowerCase() === 'content-security-policy');
    assert.ok(meta, `${f}: có meta CSP`);
    const dirs = Object.fromEntries(meta.attrs.content.split(';').map((s) => s.trim()).filter(Boolean).map((s) => { const [k, ...v] = s.split(/\s+/); return [k, v]; }));
    assert.deepStrictEqual(dirs['default-src'], ["'none'"], `${f}: default-src 'none'`);
    assert.deepStrictEqual(dirs['img-src'], ["'self'"]);
    assert.deepStrictEqual(dirs['style-src'], ["'self'"]);
    assert.deepStrictEqual(dirs['script-src'], ["'self'"]);
    assert.deepStrictEqual(dirs['base-uri'], ["'none'"]);
    assert.deepStrictEqual(dirs['form-action'], ["'none'"]);
    assert.ok(!/unsafe-|\*|https?:|data:|blob:|ws:/i.test(meta.attrs.content), `${f}: không nới CSP`);
    // CSP chặn nên cũng không được dùng: không <style>, không style="", không script nội tuyến, không iframe/object/embed/form/link ngoài
    assert.ok(!/<style\b/i.test(html), `${f}: không <style> nội tuyến`);
    assert.ok(!/\sstyle\s*=/i.test(html), `${f}: không style="" nội tuyến`);
    for (const s of tags(html).filter((x) => x.tag === 'script')) assert.ok(s.attrs.src && !/^(https?:)?\/\//.test(s.attrs.src), `${f}: script chỉ là tệp cạnh trang`);
    assert.ok(!/<script\b[^>]*>\s*\S/i.test(html.replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/gi, '')), `${f}: không script nội tuyến`);
    for (const x of tags(html)) assert.ok(!['iframe', 'object', 'embed', 'form', 'base', 'frame', 'webview'].includes(x.tag), `${f}: không <${x.tag}>`);
    // mọi địa chỉ trong thuộc tính là tệp cạnh trang hoặc #neo: không http(s)://, không //
    for (const x of tags(html)) for (const k of ['src', 'href', 'data-still', 'action']) {
      const v = x.attrs[k]; if (v === undefined) continue;
      assert.ok(v.startsWith('#') || /^(\.\.\/)?[\w.-]+(\/[\w.-]+)*$/.test(v), `${f}: ${k}="${v}" phải là tệp trong app`);
    }
  }
  for (const f of ['page.css', 'calm.js', 'retry.js', ...HTML_FILES]) {
    const body = read(PAGES, f);
    assert.ok(!/https?:\/\//i.test(body), `${f}: không có http:// hay https:// nào (kể cả trong chú thích)`);
    assert.ok(!/(^|[^:\w])\/\/[a-z0-9.-]+\.[a-z]/i.test(body.replace(/\/\/[^\n]*\n/g, '\n').replace(/<!--[\s\S]*?-->/g, '')), `${f}: không địa chỉ // ngoài`);
  }
  const css = read(PAGES, 'page.css');
  assert.ok(!/url\s*\(|@import|@font-face/i.test(css), 'css không tải gì (không url(), @import, @font-face)');
  for (const f of ['calm.js', 'retry.js']) {
    assert.ok(!/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|import|require|eval|Function|postMessage|localStorage|sessionStorage|indexedDB|document\.cookie|window\.open|innerHTML|outerHTML|document\.write)\b/.test(read(PAGES, f)), `${f}: không gọi mạng, không lưu gì, không chạy chuỗi`);
  }
});

test('mọi trang: chữ không có chữ Trung, nhà cung cấp AI, mua bán / credit / gói / khuyến mãi, hay "trợ lý AI"', () => {
  const FORBIDDEN = [
    /[\u2e80-\u2fdf\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/, // chữ Trung (và dấu câu Trung)
    /juao/i, /openai/i, /anthropic/i, /gemini/i, /nhà cung cấp/i, /provider/i, /upstream/i, /token/i,
    /(?<![\p{L}\p{N}])(mua|bán|giá|gói|credit|credits|khuyến mãi|ưu đãi|giảm|thanh toán|nâng cấp|đăng ký|hóa đơn)(?![\p{L}\p{N}])/iu,
    /(?<![\p{L}\p{N}])(buy|purchase|plan|plans|price|prices|pricing|upgrade|subscribe|subscription|discount|promo|promotion|coupon|sale|trial|billing|payment|pay|premium|free|offer)(?![\p{L}\p{N}])/iu,
    /trợ lý/i, /assistant/i, /chatbot/i, /trí tuệ nhân tạo/i, /artificial/i,
  ];
  for (const f of HTML_FILES) {
    const everything = [...visibleText(pageHtml[f]), ...(/<title>([^<]*)</.exec(pageHtml[f]) || []).slice(1)];
    for (const t of everything) for (const re of FORBIDDEN) assert.ok(!re.test(t), `${f}: "${t}" chạm ${re}`);
    assert.ok(everything.length >= 1);
  }
  // tên cửa sổ: chỉ "Softe" (không Mochi, không chữ lạ)
  for (const f of HTML_FILES) assert.match(pageHtml[f], /<title>Softe<\/title>/);
});

test('page.css: nền sáng/tối bằng đúng màu nền cửa sổ; không có hình động của riêng trang', () => {
  const css = read(PAGES, 'page.css');
  const darkAt = css.indexOf('prefers-color-scheme: dark');
  assert.ok(darkAt > 0, 'có luật tối theo máy');
  const light = /--bg:\s*(#[0-9a-f]{6})/i.exec(css.slice(0, darkAt))[1];
  const dark = /--bg:\s*(#[0-9a-f]{6})/i.exec(css.slice(darkAt))[1];
  assert.strictEqual(light.toLowerCase(), shell.BACKGROUNDS.light.toLowerCase());
  assert.strictEqual(dark.toLowerCase(), shell.BACKGROUNDS.dark.toLowerCase());
  assert.match(css, /body\s*{[^}]*background:\s*var\(--bg\)/);
  // một Mochi cử động là đủ: trang không thêm hình động (chuyển động nằm trong tệp SVG)
  assert.ok(!/@keyframes|animation\s*:|transition\s*:/i.test(css), 'css không có animation / transition');
});

// ---------- JS nhỏ của hai trang (chạy trong vm, không cần trình duyệt) ----------

function fakeImg(src, still) {
  const attrs = { src, 'data-still': still };
  return { attrs, getAttribute(k) { return attrs[k] ?? null; }, setAttribute(k, v) { attrs[k] = v; } };
}

test('calm.js: sau STILL_AFTER_MS (20 giây) đổi sang ảnh tĩnh, không sớm hơn, không hẹn lại', () => {
  const code = read(PAGES, 'calm.js');
  assert.strictEqual(shell.STILL_AFTER_MS, 20000);
  assert.match(code, new RegExp(`STILL_AFTER_MS\\s*=\\s*${shell.STILL_AFTER_MS}\\b`), 'số trong calm.js bằng số trong shell.js');
  const img = fakeImg('../mochi/oops.svg', '../mochi/mascot.svg');
  const timers = [];
  vm.runInNewContext(code, { document: { getElementById: (id) => (id === 'mochi' ? img : null) }, setTimeout: (fn, ms) => timers.push({ fn, ms }) });
  assert.strictEqual(timers.length, 1, 'đúng một hẹn giờ');
  assert.strictEqual(timers[0].ms, 20000);
  assert.strictEqual(img.attrs.src, '../mochi/oops.svg', 'chưa đổi trước giờ');
  timers[0].fn();
  assert.strictEqual(img.attrs.src, '../mochi/mascot.svg');
  // trang không có ảnh Mochi hoặc không có data-still thì im lặng
  const none = [];
  vm.runInNewContext(code, { document: { getElementById: () => null }, setTimeout: (fn, ms) => none.push(ms) });
  vm.runInNewContext(code, { document: { getElementById: () => fakeImg('x', undefined) }, setTimeout: (fn, ms) => none.push(ms) });
  assert.deepStrictEqual(none, []);
});

test('retry.js: "online" tự đổi #retry một lần; bấm Thử lại hiện dòng "đang thử"; không làm gì khác', () => {
  const code = read(PAGES, 'retry.js');
  const els = { retry: { listeners: {}, addEventListener(t, fn) { this.listeners[t] = fn; } }, busy: { hidden: true } };
  const win = { location: { hash: '' }, listeners: {}, addEventListener(t, fn) { this.listeners[t] = fn; } };
  vm.runInNewContext(code, { window: win, document: { getElementById: (id) => els[id] || null } });
  assert.deepStrictEqual(Object.keys(win.listeners), ['online'], 'chỉ nghe sự kiện online');
  assert.deepStrictEqual(Object.keys(els.retry.listeners), ['click']);
  assert.strictEqual(els.busy.hidden, true);
  els.retry.listeners.click();
  assert.strictEqual(els.busy.hidden, false, 'bấm thì hiện "đang thử"');
  els.busy.hidden = true;
  win.listeners.online();
  assert.strictEqual(win.location.hash, shell.RETRY_HASH, 'có mạng lại thì đổi #retry (main sẽ tải lại softe.ai)');
  assert.strictEqual(els.busy.hidden, false);
  // đã ở #retry thì không đặt lại (đang thử rồi)
  const set = []; const w2 = { location: { get hash() { return '#retry'; }, set hash(v) { set.push(v); } }, addEventListener(t, fn) { this.on = fn; } };
  vm.runInNewContext(code, { window: w2, document: { getElementById: () => null } });
  w2.on();
  assert.deepStrictEqual(set, []);
});

// ---------- Mochi: tệp do công cụ chép, khóa mã băm ----------

test('src/mochi: đúng ba tệp, khớp MOCHI_KIT.json (sha256, dung lượng), không sửa tay', () => {
  const kit = JSON.parse(read(MOCHI, 'MOCHI_KIT.json'));
  assert.strictEqual(kit.profile, 'desktop');
  assert.strictEqual(kit.base, 'src/mochi');
  assert.deepStrictEqual(Object.keys(kit.files).sort(), ['loading.svg', 'mascot.svg', 'oops.svg']);
  assert.deepStrictEqual(Object.keys(kit.states).sort(), ['loading', 'oops']);
  const real = fs.readdirSync(MOCHI).filter((f) => f !== 'MOCHI_KIT.json').sort();
  assert.deepStrictEqual(real, Object.keys(kit.files).sort(), 'không có tệp lạ, không thiếu tệp');
  let total = 0;
  for (const [name, meta] of Object.entries(kit.files)) {
    const file = path.join(MOCHI, name);
    assert.strictEqual(sha(file), meta.sha256, `${name}: mã băm khớp khóa (không sửa tay, không chép tay)`);
    assert.strictEqual(fs.statSync(file).size, meta.bytes, `${name}: dung lượng`);
    total += meta.bytes;
  }
  assert.strictEqual(kit.totals.bytes, total);
  assert.ok(total < 80 * 1024, 'trần dung lượng của app máy tính');
  // mọi ảnh mà trang nhắc tới đều có trong bộ khóa
  for (const f of HTML_FILES) for (const m of pageHtml[f].matchAll(/\.\.\/mochi\/([\w.-]+)/g)) assert.ok(kit.files[m[1]], `${f} nhắc ${m[1]}`);
  // tệp SVG không gọi gì ra mạng (xmlns là tên, không phải lượt tải)
  for (const name of Object.keys(kit.files)) {
    const svg = read(MOCHI, name).replace(/xmlns(:\w+)?="[^"]*"/g, '');
    assert.ok(!/https?:\/\//i.test(svg) && !/<script\b|href=/i.test(svg), `${name}: không script, không liên kết`);
  }
});

// ---------- main.js nối dây đúng, các thiết lập bảo mật còn nguyên ----------

const mainSrc = read(SRC, 'main.js');
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const main = codeOnly(mainSrc);
const createBody = /function create\(\) \{[\s\S]*?\n\}\n/.exec(main)[0];

test('main.js: màn chờ trước, softe.ai sau khi màn chờ tải xong (không hẹn giờ); lỗi mạng khung chính → trang mất mạng; #retry → tải lại', () => {
  assert.match(main, /require\('\.\/shell'\)/);
  // màn chờ: loadFile(splash) rồi (dù thành công hay lỗi) mới loadURL(cfg.site)
  const iSplash = createBody.indexOf('loadFile(pages.pagePath(pages.SPLASH_FILE)');
  assert.ok(iSplash > 0, 'mở màn chờ bằng loadFile');
  assert.match(createBody.slice(iSplash), /\.catch\(\(\) => \{\}\)\s*\.then\(\(\) => openSite\(w\)\)/);
  assert.match(main, /function openSite\(w\)[\s\S]*?w\.loadURL\(cfg\.site\)\.catch\(\(\) => \{\}\)/);
  assert.ok(!/loadURL/.test(createBody), 'create() không gọi loadURL thẳng (đi qua openSite sau màn chờ)');
  assert.ok(!/setTimeout|setInterval/.test(createBody), 'không hẹn giờ cứng khi mở softe.ai');
  assert.match(createBody, /pages\.splashHash\(pages\.pageLang\(app\.getLocale\(\)\)\)/);
  // trang mất mạng
  assert.match(createBody, /on\('did-fail-load', \(e, errorCode, errorDescription, validatedURL, isMainFrame\) =>/);
  assert.match(createBody, /pages\.failureMatters\(\{ errorCode, isMainFrame, validatedURL \}, cfg\.site\)\) openOffline\(w\)/);
  assert.match(main, /function openOffline\(w\)[\s\S]*?w\.loadFile\(pages\.pagePath\(pages\.offlinePage\(pages\.pageLang\(app\.getLocale\(\)\)\)\)\)/);
  // thử lại
  assert.match(createBody, /on\('did-navigate-in-page', \(e, url, isMainFrame\) =>/);
  assert.match(createBody, /if \(isMainFrame && pages\.isRetry\(url\)\) openSite\(w\)/);
  // nền cửa sổ theo nativeTheme, không còn trắng cứng
  assert.match(createBody, /backgroundColor: pages\.backgroundFor\(nativeTheme\.shouldUseDarkColors\)/);
  assert.ok(!/backgroundColor:\s*'#fff/i.test(createBody));
  assert.match(main, /nativeTheme[^;]*= require\('electron'\)/);
});

test('main.js: luật bảo mật của repo còn nguyên (cách ly, sandbox, preload rỗng, chỉ softe.ai trong cửa sổ, header, quyền, cập nhật)', () => {
  assert.match(createBody, /webPreferences: \{ contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true,\s*preload: path\.join\(__dirname, 'preload\.js'\) \}/);
  assert.ok(!/nodeIntegration:\s*true|contextIsolation:\s*false|sandbox:\s*false|webSecurity:\s*false|webviewTag|enableRemoteModule|nodeIntegrationInSubFrames|allowRunningInsecureContent|experimentalFeatures/.test(main));
  assert.match(createBody, /setWindowOpenHandler\(\(\{ url \}\) => \{\s*if \(allowedHost\(url, cfg\.site\)\) return \{ action: 'allow' \};\s*external\(url\);\s*return \{ action: 'deny' \};\s*\}\)/);
  assert.match(createBody, /on\('will-navigate', \(e, url\) => \{\s*if \(!allowedHost\(url, cfg\.site\)\) \{ e\.preventDefault\(\); external\(url\); \}\s*\}\)/);
  assert.match(createBody, /const external = \(url\) => \{ if \(\/\^https\?:\\\/\\\/\/i\.test\(url\)\) shell\.openExternal\(url\); \};/);
  assert.match(main, /d\.requestHeaders\['X-Softe-Client'\] = CLIENT/);
  assert.match(main, /const CLIENT = plat === 'mac' \? 'desktop-mac' : 'desktop-win'/);
  assert.match(main, /cb\(permission === 'media' && allowedHost\(details\.requestingUrl \|\| '', cfg\.site\)\)/);
  assert.match(main, /const cfg = resolve\(app\.isPackaged\)/);
  assert.match(main, /require\('\.\/updater'\)/);
  assert.match(main, /updater\.check\(cfg\.api, plat, app\.getVersion\(\)\)/);
  assert.match(main, /updater\.download\(/);
  // trang của app không có đường nào ra ngoài: không IPC, không cầu nối, không chạy mã trong trang
  assert.ok(!/ipcMain|ipcRenderer|contextBridge|executeJavaScript|insertCSS|webContents\.send|\.postMessage|protocol\.(handle|register)/.test(main));
  // preload vẫn rỗng (chỉ có chú thích)
  assert.strictEqual(codeOnly(read(SRC, 'preload.js')).trim(), "'use strict';");
  // không Mochi ở hộp thoại cập nhật hay menu, biểu tượng app giữ nguyên
  assert.ok(!/mochi/i.test(main.replace(/pages\.|require\('\.\/shell'\)/g, '')), 'main.js không nhắc Mochi trong mã');
  assert.match(main, /icon: path\.join\(__dirname, '\.\.', 'build', 'icon\.png'\)/);
});

test('đóng gói: trang và hình Mochi nằm trong "files" của electron-builder, không đổi biểu tượng', () => {
  const pkg = JSON.parse(read(ROOT, 'package.json'));
  assert.ok(pkg.build.files.includes('src/**/*'), 'src/pages và src/mochi vào gói');
  assert.strictEqual(pkg.build.mac.icon, 'build/icon.png');
  assert.strictEqual(pkg.build.win.icon, 'build/icon.png');
  assert.strictEqual(pkg.main, 'src/main.js');
  assert.ok(fs.existsSync(path.join(ROOT, 'build', 'icon.png')));
});
