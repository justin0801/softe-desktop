'use strict';
// Đường dẫn softe:// và menu "Đi tới" (src/deeplink.js): hàm thuần, không cần Electron.
const test = require('node:test');
const assert = require('node:assert');
const links = require('../src/deeplink');

const SITE = 'https://softe.ai';
const STATE = 'eyJ1IjoiYSIsInAiOiJsaW5rIiwiYyI6ImRlc2t0b3AifQ.0123456789abcdef0123456789abcdef01234567';
const ID = '3f2b8c1e-9a7d-4e21-b6c5-0d9e8f7a6b5c';
const parse = (raw, site = SITE) => links.parseDeepLink(raw, site);

test('ba dạng được nhận, địa chỉ dựng lại từ softe.ai của app', () => {
  assert.strictEqual(parse('softe://code'), 'https://softe.ai/code');
  assert.strictEqual(parse('softe://code/'), 'https://softe.ai/code');
  assert.strictEqual(parse(`softe://code/${ID}`), `https://softe.ai/code/${ID}`);
  assert.strictEqual(parse(`softe://code/${ID}/`), `https://softe.ai/code/${ID}`);
  assert.strictEqual(parse(`softe://code/github?code=abc123&state=${STATE}`), `https://softe.ai/code/github/callback?code=abc123&state=${STATE}`);
  assert.strictEqual(parse(`softe://code/github/?state=${STATE}&code=abc`), `https://softe.ai/code/github/callback?code=abc&state=${STATE}`,
    'thứ tự tham số theo danh sách cố định');
  // cài GitHub App xong: installation_id + setup_action
  assert.strictEqual(parse(`softe://code/github?installation_id=987654&setup_action=install&state=${STATE}`),
    `https://softe.ai/code/github/callback?state=${STATE}&installation_id=987654&setup_action=install`);
  // người dùng bấm "Hủy" ở GitHub: error + error_description (có khoảng trắng, viết "+" hay "%20" đều được)
  assert.strictEqual(parse(`softe://code/github?error=access_denied&error_description=The+user+has+denied&state=${STATE}`),
    `https://softe.ai/code/github/callback?state=${STATE}&error=access_denied&error_description=The+user+has+denied`);
  assert.strictEqual(parse(`softe://code/github?error_description=No%20thanks&state=${STATE}`),
    `https://softe.ai/code/github/callback?state=${STATE}&error_description=No+thanks`);
  // staging khi chạy từ mã nguồn; máy của lập trình viên (http://localhost) cũng được
  assert.strictEqual(parse('softe://code', 'https://staging.softe.ai'), 'https://staging.softe.ai/code');
  assert.strictEqual(parse('softe://code', 'http://localhost:3000'), 'http://localhost:3000/code');
  assert.strictEqual(parse('softe://code', 'https://softe.ai/some/path?x=1'), 'https://softe.ai/code', 'chỉ lấy gốc của địa chỉ softe.ai');
});

test('tham số lạ của dạng GitHub bị bỏ, phần dư (#...) bị bỏ; dạng khác không mang tham số nào theo', () => {
  assert.strictEqual(parse(`softe://code/github?code=a1&state=${STATE}&next=https://evil.example&redirect=/x&token=t#frag`),
    `https://softe.ai/code/github/callback?code=a1&state=${STATE}`);
  assert.strictEqual(parse('softe://code?next=https://evil.example#x'), 'https://softe.ai/code');
  assert.strictEqual(parse(`softe://code/${ID}?state=x&code=y#z`), `https://softe.ai/code/${ID}`);
});

test('đường dẫn lạ hay có mẹo thì bị bỏ (null)', () => {
  const bad = [
    // không phải chuỗi, rỗng, quá dài
    undefined, null, 42, {}, [], '', `softe://code/github?state=${STATE}&code=${'a'.repeat(2048)}`,
    // lược đồ / tên máy khác, chữ hoa, dạng viết khác
    'https://softe.ai/code', 'http://softe.ai/code', 'file:///etc/passwd', 'javascript:alert(1)', 'softe:code', 'softe:/code', 'softe:///code',
    'SOFTE://code', 'Softe://code', 'softe://CODE', 'softe://Code/github?state=x', 'softe://code.evil.example', 'softe://code.', 'softe://codex',
    'softe://evil.example/code', 'softe://code@evil.example', 'softe://user@code', 'softe://user:pass@code', 'softe://code:80', 'softe://code:443/',
    'softe://co%64e', ' softe://code', 'softe://code ', '\tsofte://code', 'softe://code\n', 'softe://code\u0000', 'softe://cоde',
    // đường dẫn khác ba dạng
    'softe://code/chat', 'softe://code/github/callback?state=x', 'softe://code/github/x?state=x', 'softe://code//github?state=x',
    'softe://code/settings', `softe://code/${ID}/files`, `softe://code/${ID.toUpperCase()}`, 'softe://code/3f2b8c1e-9a7d-4e21-b6c5-0d9e8f7a6b5',
    'softe://code/not-a-uuid', 'softe://code/../code', 'softe://code/github/..', 'softe://code/./github?state=x', 'softe://code/github/.?state=x',
    'softe://code/.', 'softe://code/github.?state=x', `softe://code/%2e%2e/${ID}`,
    `softe://code/${ID}%2f`, 'softe://code/%67ithub?state=x', 'softe://code\\github?state=x', 'softe://code/github\\?state=x',
    // khoảng trắng / chữ ngoài ASCII ở bất cứ đâu
    'softe://code/github?state=a b', 'softe://code/github?state=ạ', 'softe://code/github?state=x&error_description=Không',
  ];
  for (const raw of bad) assert.strictEqual(parse(raw), null, JSON.stringify(raw));
});

test('dạng GitHub: thiếu state, tham số sai như trang web (appReturnUrl) thì bỏ cả đường dẫn', () => {
  const ok = `state=${STATE}`;
  const bad = [
    'softe://code/github', 'softe://code/github?', 'softe://code/github?code=abc', 'softe://code/github?state=', 'softe://code/github?state=&code=a',
    `softe://code/github?${ok}&code=${'a'.repeat(101)}`, `softe://code/github?state=${'s'.repeat(401)}`,
    `softe://code/github?${ok}&installation_id=${'1'.repeat(21)}`, `softe://code/github?${ok}&installation_id=12a`, `softe://code/github?${ok}&installation_id=-1`,
    `softe://code/github?${ok}&setup_action=${'i'.repeat(21)}`, `softe://code/github?${ok}&error=${'e'.repeat(61)}`,
    `softe://code/github?${ok}&error_description=${'d'.repeat(201)}`,
    // khoảng trắng chỉ được ở error_description; ký tự điều khiển / chữ ngoài ASCII sau khi giải mã thì không ở đâu cả
    `softe://code/github?${ok}&code=a+b`, `softe://code/github?${ok}&code=a%20b`, `softe://code/github?state=a%09b`, `softe://code/github?${ok}&error=a%0Ab`,
    `softe://code/github?${ok}&error_description=a%0Ab`, `softe://code/github?${ok}&error_description=%C3%A1`, `softe://code/github?${ok}&code=%00`,
    // một tham số hai lần: không đoán cái nào đúng
    `softe://code/github?${ok}&state=other`, `softe://code/github?${ok}&code=a&code=b`,
  ];
  for (const raw of bad) assert.strictEqual(parse(raw), null, raw);
  // tham số trống bị bỏ qua (như trang web), không làm hỏng đường dẫn
  assert.strictEqual(parse(`softe://code/github?code=&${ok}&error=`), `https://softe.ai/code/github/callback?${ok}`);
  // đúng giới hạn thì được
  assert.ok(parse(`softe://code/github?code=${'a'.repeat(100)}&state=${'s'.repeat(400)}&installation_id=${'9'.repeat(20)}`));
});

test('địa chỉ softe.ai của app không đúng thì không mở gì', () => {
  for (const site of ['', 'softe.ai', 'ftp://softe.ai', 'http://softe.ai', 'http://evil.example', 'https://user:pw@softe.ai', 'javascript:alert(1)', undefined, null]) {
    assert.strictEqual(links.parseDeepLink('softe://code', site), null, String(site));
    assert.strictEqual(links.pageUrl('/code', site), null, String(site));
  }
});

test('fromArgv: tìm đường dẫn softe:// hợp lệ trong dòng lệnh (từ cuối), bỏ mọi thứ khác', () => {
  assert.strictEqual(links.fromArgv(['C:\\Softe\\Softe.exe', 'softe://code'], SITE), 'https://softe.ai/code');
  assert.strictEqual(links.fromArgv(['/opt/softe', '--flag', `softe://code/${ID}`], SITE), `https://softe.ai/code/${ID}`);
  assert.strictEqual(links.fromArgv(['exe', 'softe://code', `softe://code/${ID}`], SITE), `https://softe.ai/code/${ID}`, 'cái cuối cùng');
  assert.strictEqual(links.fromArgv(['exe', 'softe://code', 'softe://evil'], SITE), 'https://softe.ai/code', 'cái cuối sai thì lấy cái hợp lệ trước đó');
  for (const argv of [['exe'], ['exe', 'https://softe.ai/code'], ['exe', 'SOFTE://code'], ['exe', '--softe://code'], ['exe', 'softe://evil'], [], undefined, null, 'softe://code', [42, {}]]) {
    assert.strictEqual(links.fromArgv(argv, SITE), null, JSON.stringify(argv));
  }
});

test('withLanguage: cửa sổ đang ở trang tiếng Anh thì mở bản tiếng Anh; không bao giờ ra ngoài softe.ai', () => {
  const w = (t, now) => links.withLanguage(t, now, SITE);
  assert.strictEqual(w('https://softe.ai/code', 'https://softe.ai/en/chat'), 'https://softe.ai/en/code');
  assert.strictEqual(w('https://softe.ai/code', 'https://softe.ai/en'), 'https://softe.ai/en/code');
  assert.strictEqual(w(`https://softe.ai/code/github/callback?code=a&state=${STATE}`, 'https://www.softe.ai/en/dashboard'),
    `https://softe.ai/en/code/github/callback?code=a&state=${STATE}`, 'giữ nguyên tham số');
  assert.strictEqual(w('https://softe.ai/', 'https://softe.ai/en/chat'), 'https://softe.ai/en');
  assert.strictEqual(w('https://softe.ai/en/code', 'https://softe.ai/en/chat'), 'https://softe.ai/en/code', 'không thêm /en hai lần');
  assert.strictEqual(w('https://softe.ai/code', 'https://softe.ai/chat'), 'https://softe.ai/code');
  assert.strictEqual(w('https://softe.ai/code', 'https://softe.ai/enterprise'), 'https://softe.ai/code', '/enterprise không phải tiếng Anh');
  assert.strictEqual(w('https://softe.ai/code', 'file:///app/src/pages/splash.html#en'), 'https://softe.ai/code', 'màn chờ: không đoán');
  assert.strictEqual(w('https://softe.ai/code', 'https://evil.example/en/x'), 'https://softe.ai/code');
  assert.strictEqual(w('https://softe.ai/code', ''), 'https://softe.ai/code');
  for (const t of ['https://evil.example/code', 'http://softe.ai/code', 'javascript:alert(1)', '', null, undefined]) assert.strictEqual(w(t, 'https://softe.ai/en'), null, String(t));
});

test('menu "Đi tới": bốn trang của softe.ai, phím tắt Cmd/Ctrl + 1, 2, 3, 4 (không phải phím của web hay của Mac)', () => {
  assert.deepStrictEqual(links.GO_TO.map((g) => [g.id, g.path, g.accelerator]), [
    ['code', '/code', 'CmdOrCtrl+1'], ['chat', '/chat', 'CmdOrCtrl+2'], ['dashboard', '/dashboard', 'CmdOrCtrl+3'], ['editor', '/studio/film/editor', 'CmdOrCtrl+4'],
  ]);
  // chữ của từng mục có cả hai ngôn ngữ (texts.js), mỗi mục một chữ riêng
  const { TEXTS } = require('../src/texts');
  for (const lang of ['vi', 'en']) {
    const words = links.GO_TO.map((g) => TEXTS[lang][g.id]);
    assert.ok(words.every((x) => typeof x === 'string' && x), `${lang}: đủ chữ cho mọi mục`);
    assert.strictEqual(new Set(words).size, words.length, `${lang}: không trùng nhau`);
  }
  const keys = links.GO_TO.map((g) => g.accelerator);
  assert.strictEqual(new Set(keys).size, keys.length, 'không trùng nhau');
  for (const k of keys) {
    assert.ok(!/\+K$/i.test(k), 'Cmd/Ctrl+K là bảng lệnh của Softe Code trên web');
    assert.ok(!/Shift\+[345]$/.test(k), 'Cmd+Shift+3/4/5 là chụp màn hình của Mac');
    assert.ok(!/^(CmdOrCtrl\+)(C|V|X|A|Z|R|W|M|Q|H|0|Plus|-|=)$/i.test(k), 'không đụng phím của menu Sửa / Xem / Cửa sổ');
  }
  assert.ok(Object.isFrozen(links.GO_TO) && links.GO_TO.every(Object.isFrozen));
  for (const g of links.GO_TO) assert.strictEqual(links.pageUrl(g.path, SITE), `https://softe.ai${g.path}`);
  for (const p of ['code', '//evil.example', '/code?x=1', '/code#x', '/../x', 'https://evil.example', null]) assert.strictEqual(links.pageUrl(p, SITE), null, String(p));
});

const SOCIAL = 'k3J9fQ2x_aB-7Lm0Zp8RtYu1VwXs6HgDcEnA5oIq'; // mã dùng một lần của softe-be (token_urlsafe: chữ, số, "-", "_")

test('đăng nhập Google / Apple xong: softe://welcome/persona?social=<mã> mở trang đăng nhập của softe.ai với đúng mã đó; tham số lạ bị bỏ', () => {
  assert.strictEqual(parse(`softe://welcome/persona?social=${SOCIAL}`), `https://softe.ai/welcome/persona?social=${SOCIAL}`);
  assert.strictEqual(parse(`softe://welcome/persona/?social=${SOCIAL}`), `https://softe.ai/welcome/persona?social=${SOCIAL}`);
  assert.strictEqual(parse(`softe://welcome/persona?next=https://evil.example&social=${SOCIAL}&token=t#frag`), `https://softe.ai/welcome/persona?social=${SOCIAL}`,
    'tham số lạ và phần # bị bỏ');
  assert.strictEqual(parse(`softe://welcome/persona?social=${SOCIAL}`, 'https://staging.softe.ai'), `https://staging.softe.ai/welcome/persona?social=${SOCIAL}`);
  // mã sai dạng: ngắn, dài, ký tự lạ, thiếu, lặp lại, rỗng
  for (const bad of ['', 'short', 'x'.repeat(19), 'x'.repeat(101), `${SOCIAL}!`, `${SOCIAL} x`, `${SOCIAL}/../x`, 'a b'.repeat(10)]) {
    assert.strictEqual(parse(`softe://welcome/persona?social=${encodeURIComponent(bad)}`), null, `mã ${JSON.stringify(bad).slice(0, 30)}`);
  }
  assert.strictEqual(parse('softe://welcome/persona'), null, 'thiếu mã');
  assert.strictEqual(parse(`softe://welcome/persona?social=${SOCIAL}&social=${SOCIAL}`), null, 'hai mã: không đoán cái nào đúng');
  // mã 20 và 100 ký tự là biên của máy chủ
  assert.ok(parse(`softe://welcome/persona?social=${'a'.repeat(20)}`) && parse(`softe://welcome/persona?social=${'a'.repeat(100)}`));
});

test('đăng nhập Google / Apple không thành: softe://welcome?error=...&error_description=... mở trang đăng nhập với đúng lý do (chỉ hai mã lỗi và lý do viết thường)', () => {
  assert.strictEqual(parse('softe://welcome?error=access_denied&error_description=cancelled'), 'https://softe.ai/welcome?error=access_denied&error_description=cancelled');
  assert.strictEqual(parse('softe://welcome/?error=server_error&error_description=unavailable'), 'https://softe.ai/welcome?error=server_error&error_description=unavailable');
  assert.strictEqual(parse('softe://welcome?error=server_error'), 'https://softe.ai/welcome?error=server_error', 'lý do là tùy chọn');
  assert.strictEqual(parse('softe://welcome?error=access_denied&next=https://evil.example'), 'https://softe.ai/welcome?error=access_denied');
  for (const bad of ['softe://welcome', 'softe://welcome?error=evil', 'softe://welcome?error=ACCESS_DENIED', 'softe://welcome?error=access_denied&error=server_error',
    'softe://welcome?error=access_denied&error_description=Has%20Space', 'softe://welcome?error=access_denied&error_description=a&error_description=b',
    `softe://welcome?error=access_denied&error_description=${'x'.repeat(41)}`, 'softe://welcome?error_description=cancelled']) {
    assert.strictEqual(parse(bad), null, bad);
  }
});

test('softe://welcome: đúng chữ thường, không cổng, không tên người dùng, không đường dẫn khác; dạng "code" vẫn như cũ', () => {
  for (const bad of [`softe://WELCOME/persona?social=${SOCIAL}`, `softe://welcome:80/persona?social=${SOCIAL}`, `softe://u@welcome/persona?social=${SOCIAL}`,
    `softe://welcome.evil/persona?social=${SOCIAL}`, `softe://welcomex/persona?social=${SOCIAL}`, `softe://welcome/other?social=${SOCIAL}`, `softe://welcome/persona/x?social=${SOCIAL}`,
    `softe://welcome/../persona?social=${SOCIAL}`, `softe://welcome/%2e%2e/persona?social=${SOCIAL}`, `softe://welcome/persona\\?social=${SOCIAL}`, `softe://welcome/persona?social=${SOCIAL} `,
    `https://softe.ai/welcome/persona?social=${SOCIAL}`, `softe:welcome/persona?social=${SOCIAL}`, `softe://welcome/persona?social=${SOCIAL}${'x'.repeat(2100)}`]) {
    assert.strictEqual(parse(bad), null, bad.slice(0, 70));
  }
  assert.strictEqual(parse('softe://code'), 'https://softe.ai/code');
  assert.strictEqual(parse('softe://evil/persona'), null);
  // dòng lệnh (Windows / Linux): đường dẫn đăng nhập xong cũng đọc được, lấy cái cuối cùng đúng dạng
  assert.strictEqual(links.fromArgv(['Softe.exe', `softe://welcome/persona?social=${SOCIAL}`], SITE), `https://softe.ai/welcome/persona?social=${SOCIAL}`);
  assert.strictEqual(links.fromArgv(['Softe.exe', `softe://welcome/persona?social=${SOCIAL}`, 'softe://evil'], SITE), `https://softe.ai/welcome/persona?social=${SOCIAL}`);
  // giữ tiếng Anh: cửa sổ đang ở trang /en thì mở bản /en của trang đăng nhập
  assert.strictEqual(links.withLanguage(parse(`softe://welcome/persona?social=${SOCIAL}`), 'https://softe.ai/en/welcome', SITE), `https://softe.ai/en/welcome/persona?social=${SOCIAL}`);
  assert.strictEqual(links.withLanguage(parse('softe://welcome?error=access_denied'), 'https://softe.ai/en', SITE), 'https://softe.ai/en/welcome?error=access_denied');
});

test('danh sách nhảy (Windows): mở lại app với softe://code; chạy từ mã nguồn thì có thư mục app trước', () => {
  assert.strictEqual(links.CODE_LINK, 'softe://code');
  assert.strictEqual(links.parseDeepLink(links.CODE_LINK, SITE), 'https://softe.ai/code', 'lối tắt dùng đúng dạng app nhận');
  assert.strictEqual(links.jumpArguments(false, 'C:\\dev\\softe-desktop'), 'softe://code');
  assert.strictEqual(links.jumpArguments(undefined, ''), 'softe://code');
  assert.strictEqual(links.jumpArguments(true, 'C:\\dev\\softe-desktop'), '"C:\\dev\\softe-desktop" softe://code');
  assert.strictEqual(links.jumpArguments(true, 'C:\\dev\\a"b'), 'softe://code', 'đường dẫn có dấu nháy: không ghép');
  assert.strictEqual(links.jumpArguments(true, ''), 'softe://code');
});

test('a deep link never reloads the page that is open, and never twice within a moment', () => {
  const { shouldOpen, LINK_GAP_MS } = require('../src/deeplink');
  const page = 'https://softe.ai/code';
  assert.equal(shouldOpen(page, 'https://softe.ai/chat', { page: null, at: 0 }, 10_000), true);
  assert.equal(shouldOpen(page, page, { page: null, at: 0 }, 10_000), false, 'already there: only focus');
  assert.equal(shouldOpen(page, 'https://softe.ai/chat', { page: 'https://softe.ai/x', at: 9_000 }, 9_000 + LINK_GAP_MS - 1), false, 'a flood waits');
  assert.equal(shouldOpen(page, 'https://softe.ai/chat', { page: 'https://softe.ai/x', at: 9_000 }, 9_000 + LINK_GAP_MS), true);
  assert.equal(shouldOpen('', 'x', null, 0), false);
});
