'use strict';
// Màn chờ + trang mất mạng (có Mochi). Không cần Electron: hàm thuần, tệp HTML/CSS/JS, khóa mã băm, và mã nguồn main.js.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const Module = require('node:module');
const EventEmitter = require('node:events');
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
  assert.strictEqual(shell.isRetry(`${base}/offline.vi.html?n=3#retry`), true, 'trang mở kèm ?n= vẫn nhận #retry');
  assert.strictEqual(shell.isRetry(`${base}/offline.en.html?n=20#retry`), true);
  assert.strictEqual(shell.isRetry(`${base}/offline.vi.html?n=3`), false);
  assert.strictEqual(shell.isRetry(`${base}/splash.html?n=3#retry`), false);
  for (const url of [
    `${base}/offline.vi.html`, `${base}/offline.vi.html#`, `${base}/offline.vi.html#other`, `${base}/offline.vi.html#retry2`, `${base}/offline.vi.html#Retry`,
    `${base}/splash.html#retry`, `${base}/splash.html#vi`, `${base}/page.css#retry`,
    'https://softe.ai/#retry', 'https://softe.ai/pages/offline.vi.html#retry', 'https://evil.example/src/pages/offline.en.html#retry',
    'http://localhost:3000/#retry', 'about:blank#retry', 'javascript:1#retry', 'không phải địa chỉ', '', undefined, null, 5,
  ]) assert.strictEqual(shell.isRetry(url), false, String(url));
});

test('isSplash / isOfflinePage: nhận ra hai loại trang của app, kể cả kèm ?n= hoặc #...; không nhận web hay tệp khác', () => {
  const base = 'file:///Applications/Softe.app/Contents/Resources/app.asar/src/pages';
  for (const u of [`${base}/splash.html`, `${base}/splash.html#vi`, `${base}/splash.html#en`, 'file:///C:/Users/a/AppData/Local/Programs/Softe/resources/app.asar/src/pages/splash.html#vi']) {
    assert.strictEqual(shell.isSplash(u), true, u); assert.strictEqual(shell.isOfflinePage(u), false, u);
  }
  for (const u of [`${base}/offline.vi.html`, `${base}/offline.en.html`, `${base}/offline.vi.html?n=3`, `${base}/offline.en.html?n=3#retry`, `${base}/offline.vi.html#retry`]) {
    assert.strictEqual(shell.isOfflinePage(u), true, u); assert.strictEqual(shell.isSplash(u), false, u);
  }
  for (const u of [`${base}/page.css`, `${base}/calm.js`, `${base}/offline.fr.html`, 'file:///x/other/splash.html', 'file:///x/src/pages/splash.html.bak', 'file:///x/src/pages/xoffline.vi.html',
    'https://softe.ai/pages/splash.html', 'https://softe.ai/src/pages/offline.vi.html', 'http://localhost:3000/pages/splash.html', 'about:blank', 'không phải địa chỉ', '', undefined, null, 7]) {
    assert.strictEqual(shell.isSplash(u), false, String(u)); assert.strictEqual(shell.isOfflinePage(u), false, String(u));
  }
});

test('nextTries / offlineQuery: đếm số lần mất mạng liên tiếp, có trần', () => {
  assert.strictEqual(shell.MAX_TRIES, 20);
  assert.deepStrictEqual([0, 1, 2, 5, 19, 20, 21, 500].map(shell.nextTries), [1, 2, 3, 6, 20, 20, 20, 20]);
  for (const bad of [undefined, null, NaN, -1, 1.5, '3', {}, Infinity]) assert.strictEqual(shell.nextTries(bad), 1, String(bad));
  assert.deepStrictEqual(shell.offlineQuery(1), { n: '1' });
  assert.deepStrictEqual(shell.offlineQuery(7), { n: '7' });
  assert.deepStrictEqual(shell.offlineQuery(99), { n: '20' });
  for (const bad of [0, -2, undefined, NaN, '4', null]) assert.deepStrictEqual(shell.offlineQuery(bad), { n: '1' }, String(bad));
});

test('retryDelay: gấp đôi mỗi lần từ 10 giây, tối đa 5 phút, nhích ±20%', () => {
  assert.strictEqual(shell.RETRY_BASE_MS, 10000);
  assert.strictEqual(shell.RETRY_CAP_MS, 300000);
  const mid = () => 0.5;
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7, 20].map((n) => shell.retryDelay(n, mid)), [10000, 20000, 40000, 80000, 160000, 300000, 300000, 300000]);
  assert.strictEqual(shell.retryDelay(1, () => 0), 8000);
  assert.strictEqual(shell.retryDelay(1, () => 0.999999), 12000);
  assert.strictEqual(shell.retryDelay(9, () => 0), 240000);
  assert.strictEqual(shell.retryDelay(9, () => 0.999999), 360000);
  for (let i = 0; i < 200; i++) { const d = shell.retryDelay(3); assert.ok(d >= 32000 && d <= 48000, String(d)); }
  for (const bad of [0, -1, undefined, NaN, '2', null]) assert.strictEqual(shell.retryDelay(bad, mid), 10000, String(bad));
  assert.strictEqual(shell.retryDelay(1000, mid), 300000);
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

// Đọc page.css thành danh sách (bộ chọn, thuộc tính, giá trị), kể cả luật nằm trong @media / @supports.
function cssDecls(css) {
  const out = [];
  const walk = (text) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf('{', i);
      if (open < 0) break;
      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth > 0) { if (text[j] === '{') depth++; else if (text[j] === '}') depth--; j++; }
      const head = text.slice(i, open).trim();
      const body = text.slice(open + 1, j - 1);
      if (head.startsWith('@')) walk(body);
      else for (const d of body.split(';')) {
        const m = /^\s*([a-z-]+)\s*:\s*([^]*?)\s*$/i.exec(d);
        if (m) for (const sel of head.split(',')) out.push([sel.trim().replace(/\s+/g, ' '), m[1].toLowerCase(), m[2]]);
      }
      i = j;
    }
  };
  walk(css.replace(/\/\*[^]*?\*\//g, ''));
  return out;
}

test('mọi trang: Mochi nhỏ một nửa so với trước (chủ dự án yêu cầu 14/11/2026): clamp(64px, 13vmin, 104px), gợi ý 96x96', () => {
  const css = read(PAGES, 'page.css');
  const decls = cssDecls(css);
  const get = (sel, prop) => decls.filter(([s, p]) => s === sel && p === prop).map(([, , v]) => v);
  // một công thức duy nhất cho cả ba trang
  assert.deepStrictEqual(get('.mochi', 'width'), ['clamp(64px, 13vmin, 104px)'], 'rộng = một nửa clamp(128px, 26vmin, 208px) cũ');
  assert.deepStrictEqual(get('.mochi', 'height'), ['auto']);
  assert.deepStrictEqual(get('.mochi', 'aspect-ratio'), ['1']);
  // Không có đường nào khác làm Mochi to lại: mọi khai báo về kích thước / co giãn trong page.css phải nằm đúng trong danh sách này
  // (bộ chọn theo id #mochi, theo thẻ img, `*`, min-width, zoom, transform, @media... đều hiện ra ở đây và làm test đỏ).
  const SIZING = /^(width|height|min-width|max-width|min-height|max-height|inline-size|block-size|min-inline-size|max-inline-size|min-block-size|max-block-size|aspect-ratio|zoom|transform|scale|translate|contain-intrinsic-[a-z-]+|object-fit|object-position)$/;
  const sizing = decls.filter(([, p]) => SIZING.test(p)).map(([s, p]) => `${s} { ${p} }`).sort();
  assert.deepStrictEqual(sizing, ['.mochi { aspect-ratio }', '.mochi { height }', '.mochi { width }', '.page { min-height }', 'body { height }', 'html { height }', 'p { max-width }'], 'chỉ .mochi đặt cỡ cho Mochi; không luật nào khác (id, thẻ img, *, media...) đặt lại cỡ');
  assert.ok(!decls.some(([, , v]) => /!important/i.test(v) && /width|height/.test(v)), 'không !important về cỡ');
  for (const f of HTML_FILES) {
    const img = tags(pageHtml[f]).find((x) => x.tag === 'img');
    assert.strictEqual(img.attrs.width, '96', `${f}: width gợi ý (trước khi CSS tải)`);
    assert.strictEqual(img.attrs.height, '96', `${f}: height gợi ý`);
    assert.strictEqual(img.attrs.class, 'mochi', `${f}: ảnh Mochi chỉ lấy cỡ từ class .mochi`);
    assert.strictEqual(img.attrs.style, undefined, `${f}: không style nội tuyến trên ảnh Mochi`);
    assert.ok(!/\sstyle\s*=/i.test(pageHtml[f]), `${f}: không có style nội tuyến`);
  }
  // khoảng cách giữa Mochi và chữ không phải cỡ của Mochi: không đổi
  assert.deepStrictEqual(get('h1', 'margin'), ['20px 0 0']);
  assert.deepStrictEqual(get('.msg', 'margin-top'), ['20px']);
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

// Chạy retry.js trong vm: đồng hồ, "navigator.onLine", ngẫu nhiên và địa chỉ trang đều là đồ giả để điều khiển.
function runRetry({ search = '', hash = '', onLine = true, random = () => 0.5 } = {}) {
  const code = read(PAGES, 'retry.js');
  const els = { retry: { listeners: {}, addEventListener(t, fn) { this.listeners[t] = fn; } }, busy: { hidden: true } };
  const timers = []; const hashSet = [];
  const location = { search, get hash() { return this._hash; }, set hash(v) { hashSet.push(v); this._hash = `#${v}`; }, _hash: hash };
  const win = { location, listeners: {}, addEventListener(t, fn) { this.listeners[t] = fn; } };
  const M = Object.create(Math); M.random = random;
  vm.runInNewContext(code, {
    window: win, navigator: { onLine }, Math: M, document: { getElementById: (id) => els[id] || null },
    setTimeout: (fn, ms) => { timers.push({ fn, ms, cleared: false }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].cleared = true; },
  });
  return { els, win, timers, hashSet, location };
}

test('retry.js: "online" tự đổi #retry; bấm Thử lại hiện dòng "đang thử"; chỉ nghe click và online', () => {
  const r = runRetry({ search: '?n=1' });
  assert.deepStrictEqual(Object.keys(r.win.listeners), ['online'], 'chỉ nghe sự kiện online');
  assert.deepStrictEqual(Object.keys(r.els.retry.listeners), ['click']);
  assert.strictEqual(r.els.busy.hidden, true);
  r.els.retry.listeners.click();
  assert.strictEqual(r.els.busy.hidden, false, 'bấm thì hiện "đang thử"');
  r.els.busy.hidden = true;
  r.win.listeners.online();
  assert.deepStrictEqual(r.hashSet, [shell.RETRY_HASH], 'có mạng lại thì đổi #retry (main sẽ tải lại softe.ai)');
  assert.strictEqual(r.els.busy.hidden, false);
  assert.ok(r.timers[0].cleared, 'đã đổi #retry thì hủy hẹn giờ (không thử hai lần)');
  // đã ở #retry thì không đặt lại (đang thử rồi)
  const again = runRetry({ search: '?n=1', hash: '#retry' });
  again.win.listeners.online();
  assert.deepStrictEqual(again.hashSet, []);
});

test('retry.js: máy báo có mạng mà lần trước vẫn lỗi thì tự thử lại, lùi dần như shell.retryDelay', () => {
  // đúng một hẹn giờ, đúng số mili giây của shell.js với mọi số lần mất mạng và mọi giá trị ngẫu nhiên
  for (const n of [1, 2, 3, 4, 5, 6, 7, 12, 20, 21, 500]) {
    for (const rnd of [0, 0.25, 0.5, 0.999]) {
      const r = runRetry({ search: `?n=${n}`, random: () => rnd });
      assert.strictEqual(r.timers.length, 1, `n=${n}: đúng một hẹn giờ`);
      assert.strictEqual(r.timers[0].ms, shell.retryDelay(n, () => rnd), `n=${n} rnd=${rnd}`);
    }
  }
  // không có ?n= hoặc ?n= hỏng: coi như lần đầu; số quá lớn: dừng ở trần
  for (const search of ['', '?', '?n=', '?n=abc', '?n=0', '?x=1', '?n=-3']) assert.strictEqual(runRetry({ search }).timers[0].ms, 10000, search);
  assert.strictEqual(runRetry({ search: '?n=99999999999999999999' }).timers[0].ms, shell.retryDelay(20, () => 0.5));
  assert.strictEqual(runRetry({ search: '?a=1&n=3' }).timers[0].ms, 40000);
  // hẹn giờ đến thì đổi #retry một lần, hiện "đang thử"
  const r = runRetry({ search: '?n=2' });
  assert.strictEqual(r.els.busy.hidden, true);
  r.timers[0].fn();
  assert.deepStrictEqual(r.hashSet, ['retry']);
  assert.strictEqual(r.els.busy.hidden, false);
  // máy báo KHÔNG có mạng: không hẹn giờ (chờ sự kiện online), nhưng online vẫn chạy
  const off = runRetry({ search: '?n=1', onLine: false });
  assert.strictEqual(off.timers.length, 0, 'không có mạng thì không thử vô ích');
  off.win.listeners.online();
  assert.deepStrictEqual(off.hashSet, ['retry']);
  // số trong retry.js bằng số trong shell.js
  const code = read(PAGES, 'retry.js');
  assert.match(code, new RegExp(`BASE_MS\\s*=\\s*${shell.RETRY_BASE_MS}\\b`));
  assert.match(code, new RegExp(`CAP_MS\\s*=\\s*${shell.RETRY_CAP_MS}\\b`));
  assert.match(code, new RegExp(`MAX_TRIES\\s*=\\s*${shell.MAX_TRIES}\\b`));
  // đúng một hẹn giờ trong mã, và không chạy lại mãi (không setInterval)
  assert.strictEqual((code.match(/\bsetTimeout\s*\(/g) || []).length, 1);
  assert.ok(!/setInterval/.test(code));
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

const count = (re, text = main) => (text.match(re) || []).length;

test('main.js: nối dây đúng (mã nguồn): màn chờ, did-finish-load, did-fail-load, did-navigate, did-navigate-in-page, một chỗ loadURL, hai chỗ loadFile', () => {
  assert.match(main, /require\('\.\/shell'\)/);
  // màn chờ: chỉ loadFile, KHÔNG nối .then(openSite): softe.ai được gọi ở did-finish-load của màn chờ (kể cả sau khi người dùng bấm Tải lại)
  assert.match(createBody, /w\.loadFile\(pages\.pagePath\(pages\.SPLASH_FILE\), \{ hash: pages\.splashHash\(pages\.pageLang\(app\.getLocale\(\)\)\) \}\)\.catch\(\(\) => \{\}\);\n\}/);
  assert.match(createBody, /on\('did-finish-load', \(\) => \{\s*if \(pages\.isSplash\(w\.webContents\.getURL\(\)\)\) openSite\(w\);\s*\}\)/);
  // did-finish-load KHÔNG đặt lại chuỗi mất mạng: lượt tải softe.ai thất bại cũng phát nó cho trang lỗi của Chromium (địa chỉ softe.ai)
  assert.ok(!/did-finish-load[\s\S]{0,200}tries\s*=\s*0/.test(createBody), 'did-finish-load không đặt lại tries');
  assert.match(main, /function openSite\(w\)[\s\S]*?w\.loadURL\(cfg\.site\)\.catch\(\(\) => \{\}\)/);
  // trang mất mạng
  assert.match(createBody, /on\('did-fail-load', \(e, errorCode, errorDescription, validatedURL, isMainFrame\) =>/);
  assert.match(createBody, /pages\.failureMatters\(\{ errorCode, isMainFrame, validatedURL \}, cfg\.site\)\) openOffline\(w\)/);
  assert.match(main, /function openOffline\(w\)[\s\S]*?w\.loadFile\(pages\.pagePath\(pages\.offlinePage\(pages\.pageLang\(app\.getLocale\(\)\)\)\), \{ query: pages\.offlineQuery\(s\.tries\) \}\)/);
  assert.match(main, /s\.tries = pages\.nextTries\(s\.tries\);\s*s\.ours = true;/);
  // thử lại bằng #retry
  assert.match(createBody, /on\('did-navigate-in-page', \(e, url, isMainFrame\) =>/);
  assert.match(createBody, /if \(isMainFrame && pages\.isRetry\(url\)\) openSite\(w\)/);
  // Tải lại ở trang mất mạng (không phải trang do app mở) thì thử softe.ai; trang do app mở chỉ được đánh dấu cho qua
  assert.match(createBody, /on\('did-navigate', \(e, url\) => \{\s*if \(allowedHost\(url, cfg\.site\)\) \{ track\(w\)\.tries = 0; return; \}\s*if \(!pages\.isOfflinePage\(url\)\) return;\s*const s = track\(w\);\s*if \(s\.ours\) s\.ours = false; else openSite\(w\);\s*\}\)/);
  // mỗi sự kiện đúng MỘT bộ nghe (thêm bộ nghe thứ hai là cách dễ nhất để tạo vòng lặp thử lại)
  for (const ev of ['did-fail-load', 'did-finish-load', 'did-navigate-in-page', 'did-navigate']) {
    assert.strictEqual(count(new RegExp(`\\.on\\('${ev}',`, 'g')), 1, `đúng một bộ nghe ${ev}`);
  }
  assert.ok(!/\.(once|addListener|prependListener|on)\(\s*'(did-start-loading|did-stop-loading|dom-ready|did-frame-finish-load|did-frame-navigate|page-title-updated|render-process-gone|unresponsive)'/.test(main), 'không thêm bộ nghe lạ');
  // softe.ai chỉ được tải ở MỘT chỗ (openSite); trang của app chỉ ở HAI chỗ (màn chờ, openOffline)
  assert.strictEqual(count(/\.loadURL\(/g), 1, 'đúng một chỗ gọi loadURL');
  assert.strictEqual(count(/\.loadFile\(/g), 2, 'đúng hai chỗ gọi loadFile');
  assert.ok(!/\.(reload|reloadIgnoringCache|navigate|goBack|goForward|goToIndex|stop)\(/.test(main), 'main không tự tải lại / điều hướng bằng cách khác');
  // chỗ gọi hai hàm mở trang: đúng những chỗ trên và không thêm
  assert.strictEqual(count(/openSite\(w\)/g) - count(/function openSite\(w\)/g), 3, 'openSite: did-finish-load, did-navigate-in-page, did-navigate');
  assert.strictEqual(count(/openOffline\(w\)/g) - count(/function openOffline\(w\)/g), 1, 'openOffline: chỉ did-fail-load');
  // không hẹn giờ cứng: trong cả main.js chỉ có hai hẹn giờ của việc kiểm tra cập nhật
  const timersFound = main.match(/\b(setTimeout|setInterval)\b[^\n]*/g) || [];
  assert.deepStrictEqual(timersFound.map((t) => t.replace(/\s+/g, ' ').trim()), [
    'setTimeout(() => checkUpdate(false), 5000);',
    'setInterval(() => checkUpdate(false), CHECK_EVERY);',
  ], 'không hẹn giờ nào khác (không hẹn giờ cứng khi mở softe.ai, không vòng thử lại trong main)');
  assert.match(createBody, /pages\.splashHash\(pages\.pageLang\(app\.getLocale\(\)\)\)/);
  // nền cửa sổ theo nativeTheme, không còn trắng cứng
  assert.match(createBody, /backgroundColor: pages\.backgroundFor\(nativeTheme\.shouldUseDarkColors\)/);
  assert.ok(!/backgroundColor:\s*'#fff/i.test(createBody));
  assert.match(main, /nativeTheme[^;]*= require\('electron'\)/);
});

// ---- chạy thật main.js với Electron giả: kiểm hành vi theo từng sự kiện (không cần Electron) ----

const SITE_URL = 'https://softe.ai';
const PAGES_URL = 'file:///Applications/Softe.app/Contents/Resources/app.asar/src/pages';
function bootMain({ locale = 'vi-VN', loadFileFails = false } = {}) {
  const calls = []; const timers = []; const windows = [];
  class FakeContents extends EventEmitter {
    constructor() { super(); this.url = ''; }
    getURL() { return this.url; }
    setWindowOpenHandler() {}
  }
  class FakeWindow extends EventEmitter {
    constructor(options) { super(); this.options = options; this.webContents = new FakeContents(); this.gone = false; windows.push(this); }
    loadURL(url) { calls.push({ kind: 'loadURL', url }); return Promise.resolve(); }
    loadFile(file, o = {}) { calls.push({ kind: 'loadFile', file: path.basename(file), hash: o.hash, query: o.query }); return loadFileFails ? Promise.reject(new Error('không tải được')) : Promise.resolve(); }
    isDestroyed() { return this.gone; }
    isMinimized() { return false; } restore() {} focus() {}
  }
  const app = Object.assign(new EventEmitter(), {
    isPackaged: true, userAgentFallback: 'UA', getVersion: () => '1.0.0', getLocale: () => locale, quit() {},
    requestSingleInstanceLock: () => true, whenReady: () => ({ then: (fn) => { fn(); } }),
  });
  const electron = {
    app, BrowserWindow: FakeWindow, shell: { openExternal() {}, openPath() {} }, dialog: {}, nativeTheme: { shouldUseDarkColors: false },
    Menu: { setApplicationMenu() {}, buildFromTemplate: (t) => t },
    session: { defaultSession: { webRequest: { onBeforeSendHeaders() {} }, setPermissionRequestHandler() {} } },
  };
  const file = path.join(SRC, 'main.js');
  const req = Module.createRequire(file);
  const run = vm.runInNewContext(`(function (require, module, exports, __dirname, __filename, setTimeout, setInterval) {${mainSrc}\n})`, { process });
  run((id) => (id === 'electron' ? electron : req(id)), { exports: {} }, {}, SRC, file,
    (fn, ms) => timers.push(`setTimeout ${ms}`), (fn, ms) => timers.push(`setInterval ${ms}`));
  const w = windows[0]; const wc = w.webContents;
  const at = (url) => { wc.url = url; };
  return {
    app, w, wc, calls, timers, windows, at,
    finish(url) { at(url); wc.emit('did-finish-load'); },
    fail(code, url, main = true) { wc.emit('did-fail-load', {}, code, 'ERR', url, main); },
    navigate(url) { at(url); wc.emit('did-navigate', {}, url); },
    inPage(url, main = true) { at(url); wc.emit('did-navigate-in-page', {}, url, main); },
    urls: () => calls.filter((c) => c.kind === 'loadURL').map((c) => c.url),
    files: () => calls.filter((c) => c.kind === 'loadFile'),
  };
}
const flush = () => new Promise((r) => setImmediate(r));

test('main.js chạy thử: mở app → màn chờ ngay; softe.ai chỉ được gọi khi màn chờ tải xong (một lần), không hẹn giờ', () => {
  const m = bootMain();
  assert.deepStrictEqual(m.files().map((f) => [f.file, f.hash, f.query]), [['splash.html', 'vi', undefined]], 'màn chờ tiếng Việt, hiện ngay');
  assert.deepStrictEqual(m.urls(), [], 'chưa gọi softe.ai khi màn chờ chưa vẽ xong');
  assert.strictEqual(m.w.options.backgroundColor, shell.BACKGROUNDS.light);
  m.finish(`${PAGES_URL}/splash.html#vi`);
  assert.deepStrictEqual(m.urls(), [SITE_URL], 'màn chờ vẽ xong thì gọi softe.ai đúng một lần');
  assert.deepStrictEqual(m.timers, ['setTimeout 5000', `setInterval ${4 * 60 * 60 * 1000}`], 'chỉ hai hẹn giờ kiểm tra cập nhật');
  assert.strictEqual(bootMain({ locale: 'en-US' }).files()[0].hash, 'en');
});

test('main.js chạy thử (lỗi: bấm Tải lại lúc còn màn chờ): màn chờ tải lại thì gọi lại softe.ai, không kẹt mãi ở "Đang mở Softe…"', () => {
  const m = bootMain();
  m.finish(`${PAGES_URL}/splash.html#vi`);
  assert.strictEqual(m.urls().length, 1);
  // softe.ai chậm; người dùng bấm Tải lại: lượt tải softe.ai bị hủy (-3), màn chờ tải lại
  m.fail(-3, `${SITE_URL}/`);
  m.finish(`${PAGES_URL}/splash.html#vi`);
  assert.deepStrictEqual(m.urls(), [SITE_URL, SITE_URL], 'gọi lại softe.ai sau khi màn chờ tải lại');
  m.finish(`${PAGES_URL}/splash.html#vi`);
  assert.strictEqual(m.urls().length, 3, 'mỗi lần màn chờ tải xong là một lượt gọi');
  // tệp màn chờ hỏng: trang lỗi của Chromium mang địa chỉ màn chờ, cũng gọi softe.ai (cửa sổ không bao giờ trống)
  m.finish(`${PAGES_URL}/splash.html#vi`);
  assert.strictEqual(m.urls().length, 4);
  assert.deepStrictEqual(m.timers.length, 2, 'không thêm hẹn giờ nào');
});

test('main.js chạy thử: lỗi mạng → trang mất mạng kèm ?n=; bỏ qua -3, khung con, địa chỉ lạ, lỗi của chính trang app; tải được softe.ai thì hết đếm', async () => {
  const m = bootMain();
  m.finish(`${PAGES_URL}/splash.html#vi`);
  m.fail(-3, `${SITE_URL}/`);
  m.fail(-105, `${SITE_URL}/`, false);
  m.fail(-105, 'https://evil.example/');
  m.fail(-6, `${PAGES_URL}/offline.vi.html?n=1`);
  m.fail(-105, `${PAGES_URL}/splash.html#vi`);
  assert.deepStrictEqual(m.files().map((f) => f.file), ['splash.html'], 'không phải lỗi mạng của khung chính thì không mở trang mất mạng');
  m.fail(-105, `${SITE_URL}/`);
  assert.deepStrictEqual(m.files().slice(1).map((f) => [f.file, f.query, f.hash]), [['offline.vi.html', { n: '1' }, undefined]]);
  assert.strictEqual(m.urls().length, 1, 'mất mạng không tự gọi lại softe.ai (trang lo việc thử lại)');
  m.navigate(`${PAGES_URL}/offline.vi.html?n=1`);
  assert.strictEqual(m.urls().length, 1, 'trang do app mở: không thử lại');
  // lần thử sau vẫn lỗi → n=2, rồi 3
  m.inPage(`${PAGES_URL}/offline.vi.html?n=1#retry`);
  m.fail(-102, `${SITE_URL}/`); m.navigate(`${PAGES_URL}/offline.vi.html?n=2`);
  m.inPage(`${PAGES_URL}/offline.vi.html?n=2#retry`);
  m.fail(-102, `${SITE_URL}/`); m.navigate(`${PAGES_URL}/offline.vi.html?n=3`);
  assert.deepStrictEqual(m.files().slice(1).map((f) => f.query.n), ['1', '2', '3']);
  assert.strictEqual(m.urls().length, 3, 'mỗi #retry đúng một lượt gọi softe.ai');
  // softe.ai vào được (điều hướng tới softe.ai đã commit) → hết chuỗi: lần mất mạng sau bắt đầu lại từ 1
  m.navigate(`${SITE_URL}/chat`);
  m.fail(-105, `${SITE_URL}/chat`);
  assert.strictEqual(m.files().at(-1).query.n, '1');
  // tiếng Anh theo máy
  const en = bootMain({ locale: 'en-GB' });
  en.fail(-105, `${SITE_URL}/`);
  assert.strictEqual(en.files().at(-1).file, 'offline.en.html');
  await flush();
});

test('main.js chạy thử (lỗi): trang lỗi của Chromium phát did-finish-load với địa chỉ softe.ai nhưng chuỗi mất mạng vẫn tăng 1, 2, 3, 4', () => {
  const m = bootMain();
  m.finish(`${PAGES_URL}/splash.html#vi`);
  for (let i = 1; i <= 4; i++) {
    m.fail(-105, `${SITE_URL}/`);                         // lượt tải softe.ai thất bại → app mở trang mất mạng
    m.finish(`${SITE_URL}/`);                             // Chromium dựng trang lỗi, getURL() vẫn là softe.ai: KHÔNG phải "vào được"
    m.navigate(`${PAGES_URL}/offline.vi.html?n=${i}`);
    m.inPage(`${PAGES_URL}/offline.vi.html?n=${i}#retry`);
  }
  assert.deepStrictEqual(m.files().slice(1).map((f) => f.query.n), ['1', '2', '3', '4']);
  // vào được thật (did-navigate tới softe.ai) thì mới bắt đầu lại từ 1
  m.navigate(`${SITE_URL}/chat`);
  m.fail(-105, `${SITE_URL}/chat`);
  assert.strictEqual(m.files().at(-1).query.n, '1');
});

test('main.js chạy thử (lỗi: Tải lại ở trang mất mạng): thử softe.ai đúng một lần mỗi lần Tải lại, không thành vòng lặp', () => {
  const m = bootMain();
  m.finish(`${PAGES_URL}/splash.html#vi`);
  m.fail(-105, `${SITE_URL}/`); m.navigate(`${PAGES_URL}/offline.vi.html?n=1`);   // trang mất mạng do app mở
  assert.strictEqual(m.urls().length, 1);
  // người dùng bấm Tải lại (F5): cùng địa chỉ, nhưng không phải do app mở
  m.navigate(`${PAGES_URL}/offline.vi.html?n=1`);
  assert.strictEqual(m.urls().length, 2, 'Tải lại thì gọi softe.ai');
  // lần thử lỗi → app mở lại trang mất mạng: lần này chỉ đánh dấu cho qua
  m.fail(-105, `${SITE_URL}/`); m.navigate(`${PAGES_URL}/offline.vi.html?n=2`);
  assert.strictEqual(m.urls().length, 2, 'không tự gọi tiếp: không vòng lặp');
  // bấm Tải lại ba lần: đúng ba lượt thử, mỗi lượt một lần
  for (let i = 0; i < 3; i++) { m.navigate(`${PAGES_URL}/offline.vi.html?n=2`); m.fail(-105, `${SITE_URL}/`); m.navigate(`${PAGES_URL}/offline.vi.html?n=${i + 3}`); }
  assert.strictEqual(m.urls().length, 5);
  // địa chỉ không phải trang mất mạng của app thì did-navigate không làm gì
  const n = m.urls().length;
  for (const u of [`${SITE_URL}/`, `${PAGES_URL}/splash.html#vi`, 'https://evil.example/pages/offline.vi.html', 'about:blank']) m.navigate(u);
  assert.strictEqual(m.urls().length, n);
  assert.deepStrictEqual(m.timers.length, 2, 'không hẹn giờ nào được thêm trong cả quá trình');
});

test('main.js chạy thử: #retry của trang mất mạng → softe.ai; #retry giả (web, màn chờ, khung con) không làm gì; loadFile lỗi không để dấu "do app mở" kẹt lại', async () => {
  const m = bootMain();
  m.finish(`${PAGES_URL}/splash.html#vi`);
  m.inPage(`${PAGES_URL}/offline.en.html?n=1#retry`);
  assert.strictEqual(m.urls().length, 2);
  m.inPage(`${SITE_URL}/#retry`); m.inPage(`${PAGES_URL}/splash.html#retry`); m.inPage(`${PAGES_URL}/offline.vi.html?n=1#retry`, false);
  m.inPage(`${PAGES_URL}/offline.vi.html?n=1`); m.inPage('https://evil.example/pages/offline.vi.html#retry');
  assert.strictEqual(m.urls().length, 2, 'chỉ #retry thật của trang app, ở khung chính');
  // loadFile trang mất mạng bị từ chối (không tới được trang): dấu được gỡ, nên lần Tải lại sau đó vẫn được tính là của người dùng
  const f = bootMain({ loadFileFails: true });
  f.finish(`${PAGES_URL}/splash.html#vi`);
  f.fail(-105, `${SITE_URL}/`);
  await flush();
  const before = f.urls().length;
  f.navigate(`${PAGES_URL}/offline.vi.html?n=1`);
  assert.strictEqual(f.urls().length, before + 1);
});

test('main.js chạy thử: kích hoạt lại app (macOS) và cửa sổ đóng rồi mới có sự kiện: không gọi gì thêm', () => {
  const m = bootMain();
  m.finish(`${PAGES_URL}/splash.html#vi`);
  const before = m.calls.length;
  m.app.emit('activate');                       // còn cửa sổ: không mở thêm cửa sổ, không gọi gì
  assert.strictEqual(m.calls.length, before);
  assert.strictEqual(m.windows.length, 1);
  m.w.gone = true;                              // cửa sổ đã hủy: sự kiện muộn không được gọi loadURL / loadFile (sẽ ném lỗi)
  m.fail(-105, `${SITE_URL}/`); m.inPage(`${PAGES_URL}/offline.vi.html#retry`); m.navigate(`${PAGES_URL}/offline.vi.html`); m.finish(`${PAGES_URL}/splash.html#vi`);
  assert.strictEqual(m.calls.length, before);
  assert.deepStrictEqual(m.timers.length, 2);
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
