'use strict';
// main.js chạy thật với Electron giả (test/main-harness.js): đường dẫn softe://, menu "Đi tới", lối tắt Dock / danh sách nhảy, gọi người dùng.
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { bootMain, SITE_URL, PAGES_URL } = require('./main-harness');

const ID = '3f2b8c1e-9a7d-4e21-b6c5-0d9e8f7a6b5c';
const STATE = 'eyJ1IjoiYSIsInAiOiJsaW5rIiwiYyI6ImRlc2t0b3AifQ.0123456789abcdef0123456789abcdef01234567';
const GH_LINK = `softe://code/github?code=a1b2&state=${STATE}`;
const GH_PAGE = `${SITE_URL}/code/github/callback?code=a1b2&state=${STATE}`;
const SPLASH = `${PAGES_URL}/splash.html#vi`;
const openUrl = (m, url) => { let prevented = false; m.app.emit('open-url', { preventDefault() { prevented = true; } }, url); return prevented; };
const secondInstance = (m, ...args) => m.app.emit('second-instance', {}, ['C:\\Softe\\Softe.exe', ...args], 'C:\\');
const goItems = (m) => m.menu.find((x) => x.label === 'Đi tới').submenu;
const SOCIAL = 'k3J9fQ2x_aB-7Lm0Zp8RtYu1VwXs6HgDcEnA5oIq';
const labels = (m) => m.menu.map((x) => x.role || x.label);

test('softe:// được đăng ký cho app: bản cài một kiểu, chạy từ mã nguồn thì chỉ đúng thư mục app; lần mở thứ hai không đăng ký, không mở cửa sổ', () => {
  const packaged = bootMain();
  assert.deepStrictEqual(packaged.events.filter((e) => e[0] === 'protocol'), [['protocol', 'softe']]);
  const dev = bootMain({ defaultApp: true, argv: ['/usr/bin/electron', '.'] });
  assert.deepStrictEqual(dev.events.filter((e) => e[0] === 'protocol'), [['protocol', 'softe', '/opt/Softe/softe', [path.resolve('.')]]]);
  const second = bootMain({ primary: false, argv: ['C:\\Softe\\Softe.exe', 'softe://code'] });
  assert.ok(second.events.includes('quit'), 'lần mở thứ hai thoát (app đang chạy nhận dòng lệnh ở second-instance)');
  assert.deepStrictEqual(second.events.filter((e) => e[0] === 'protocol'), []);
  assert.strictEqual(second.windows.length, 0, 'không mở cửa sổ');
  assert.strictEqual(second.menu, null, 'không dựng menu');
  assert.deepStrictEqual(second.timers, [], 'không hẹn kiểm tra cập nhật');
});

test('lần mở đầu bằng đường dẫn (Windows): màn chờ trước, rồi mở đúng trang đó; mất mạng rồi thử lại vẫn mở trang đó; vào được rồi thì thôi', () => {
  const m = bootMain({ platform: 'win32', argv: ['C:\\Softe\\Softe.exe', GH_LINK] });
  assert.deepStrictEqual(m.files().map((f) => f.file), ['splash.html'], 'màn chờ hiện ngay như mọi lần');
  assert.deepStrictEqual(m.urls(), []);
  m.finish(SPLASH);
  assert.deepStrictEqual(m.urls(), [GH_PAGE], 'màn chờ tải xong thì mở trang của đường dẫn, không phải trang chủ');
  // mất mạng: trang mất mạng, "Thử lại" mở lại đúng trang đó (mã GitHub chưa dùng tới)
  m.fail(-106, GH_PAGE); m.navigate(`${PAGES_URL}/offline.vi.html?n=1`);
  m.inPage(`${PAGES_URL}/offline.vi.html?n=1#retry`);
  assert.deepStrictEqual(m.urls(), [GH_PAGE, GH_PAGE]);
  // trang vào được (did-navigate tới softe.ai): quên đường dẫn, lần sau là trang chủ như thường
  m.navigate(GH_PAGE);
  m.fail(-106, `${SITE_URL}/code`); m.navigate(`${PAGES_URL}/offline.vi.html?n=1`);
  m.inPage(`${PAGES_URL}/offline.vi.html?n=1#retry`);
  assert.deepStrictEqual(m.urls(), [GH_PAGE, GH_PAGE, SITE_URL]);
  assert.strictEqual(m.timers.length, 2, 'không thêm hẹn giờ');
});

test('lần mở sau (second-instance): đường dẫn mở trong cửa sổ đang chạy, cửa sổ được đưa lên trước; đường dẫn lạ chỉ đưa cửa sổ lên', () => {
  const m = bootMain({ platform: 'win32' });
  m.finish(SPLASH); m.navigate(`${SITE_URL}/chat`);
  m.w.minimized = true;
  secondInstance(m, `softe://code/${ID}`);
  assert.deepStrictEqual(m.urls(), [SITE_URL, `${SITE_URL}/code/${ID}`]);
  assert.deepStrictEqual(m.events.filter((e) => e === 'restore' || e === 'focus'), ['restore', 'focus']);
  const before = m.urls().length;
  for (const bad of ['softe://evil', 'softe://code/../../x', 'https://evil.example/code', 'SOFTE://code', 'softe://code/github?code=a', `softe://code/${ID}%2f..`, '--inspect=9229']) {
    secondInstance(m, bad);
  }
  secondInstance(m);
  assert.strictEqual(m.urls().length, before, 'không mở gì lạ');
  assert.strictEqual(m.events.filter((e) => e === 'focus').length, 9, 'mỗi lần mở lại app vẫn đưa cửa sổ lên trước');
  assert.strictEqual(m.windows.length, 1);
});

test('đường dẫn tới lúc cửa sổ còn ở màn chờ: để dành, màn chờ tải xong mới mở (không mở hai lần)', () => {
  const m = bootMain({ platform: 'win32' });
  secondInstance(m, 'softe://code');
  assert.deepStrictEqual(m.urls(), [], 'chưa qua màn chờ: chưa tải gì');
  secondInstance(m, `softe://code/${ID}`);   // cái mới hơn thắng
  m.finish(SPLASH);
  assert.deepStrictEqual(m.urls(), [`${SITE_URL}/code/${ID}`]);
});

test('Mac: đường dẫn tới trước khi app sẵn sàng (open-url) được để dành; đã đóng hết cửa sổ thì mở cửa sổ mới cho nó', () => {
  const m = bootMain({ platform: 'darwin', ready: false });
  assert.strictEqual(openUrl(m, GH_LINK), true, 'preventDefault');
  assert.strictEqual(m.windows.length, 0, 'chưa sẵn sàng: chưa có cửa sổ');
  m.ready();
  assert.strictEqual(m.windows.length, 1);
  m.finish(SPLASH);
  assert.deepStrictEqual(m.urls(), [GH_PAGE]);
  m.navigate(GH_PAGE);
  // đóng cửa sổ (Mac: app còn chạy), rồi bấm một đường dẫn
  m.w.gone = true; m.w.emit('closed');
  openUrl(m, `softe://code/${ID}`);
  assert.strictEqual(m.windows.length, 2, 'mở cửa sổ mới');
  m.finish(SPLASH);
  assert.deepStrictEqual(m.urls(), [GH_PAGE, `${SITE_URL}/code/${ID}`]);
  // đường dẫn lạ: không làm gì ngoài đưa cửa sổ lên
  const n = m.urls().length;
  for (const bad of ['softe://evil', 'https://evil.example', 'softe://code/github?code=x', 'softe://code?x=" onload=alert(1)']) openUrl(m, bad);
  assert.strictEqual(m.urls().length, n);
  assert.strictEqual(m.windows.length, 2);
});

test('menu "Đi tới": Softe Code, Trò chuyện, Tổng quan, Dựng phim (Cmd/Ctrl + 1, 2, 3, 4), giữ ngôn ngữ đang xem, nằm giữa Xem và Cửa sổ', () => {
  const m = bootMain({ platform: 'win32' });
  assert.deepStrictEqual(m.menu.map((x) => x.role || x.label), ['editMenu', 'viewMenu', 'Đi tới', 'windowMenu', 'Trợ giúp']);
  assert.deepStrictEqual(goItems(m).map((i) => [i.label, i.accelerator]), [['Softe Code', 'CmdOrCtrl+1'], ['Trò chuyện', 'CmdOrCtrl+2'], ['Tổng quan', 'CmdOrCtrl+3'], ['Dựng phim', 'CmdOrCtrl+4']]);
  // bấm lúc còn màn chờ: để dành
  goItems(m)[0].click();
  assert.deepStrictEqual(m.urls(), []);
  m.finish(SPLASH);
  assert.deepStrictEqual(m.urls(), [`${SITE_URL}/code`]);
  m.navigate(`${SITE_URL}/code`);
  goItems(m)[1].click();
  assert.deepStrictEqual(m.urls().at(-1), `${SITE_URL}/chat`);
  m.navigate(`${SITE_URL}/en/chat`);
  const goEn = m.menu.find((x) => x.label === 'Go to').submenu;   // trang tiếng Anh: chữ của menu cũng tiếng Anh (test "chữ của app" bên dưới)
  goEn[2].click();
  assert.deepStrictEqual(m.urls().at(-1), `${SITE_URL}/en/dashboard`, 'trang tiếng Anh thì mở bản tiếng Anh');
  // Mac: thêm menu app ở đầu (vai trò appMenu), "Đi tới" vẫn giữa Xem và Cửa sổ
  const mac = bootMain({ platform: 'darwin' });
  const roles = mac.menu.map((x) => x.role || x.label);
  assert.ok(roles.indexOf('Đi tới') === roles.indexOf('viewMenu') + 1 && roles.indexOf('windowMenu') === roles.indexOf('Đi tới') + 1);
});

test('lối tắt "Mở Softe Code": menu Dock (Mac), danh sách nhảy (Windows, chạy lại app với softe://code); Linux không có', () => {
  const mac = bootMain({ platform: 'darwin' });
  const dock = mac.events.filter((e) => e[0] === 'dockMenu');
  assert.strictEqual(dock.length, 1);
  assert.deepStrictEqual(dock[0][1].map((i) => i.label), ['Mở Softe Code']);
  mac.finish(SPLASH); mac.navigate(SITE_URL);
  dock[0][1][0].click();
  assert.strictEqual(mac.urls().at(-1), `${SITE_URL}/code`);
  assert.deepStrictEqual(mac.events.filter((e) => e[0] === 'tasks'), [], 'Mac không có danh sách nhảy');

  const win = bootMain({ platform: 'win32' });
  const tasks = win.events.filter((e) => e[0] === 'tasks');
  assert.strictEqual(tasks.length, 1);
  assert.deepStrictEqual(tasks[0][1], [{ program: 'C:\\Softe\\Softe.exe', arguments: 'softe://code', iconPath: 'C:\\Softe\\Softe.exe', iconIndex: 0,
                                         title: 'Mở Softe Code', description: 'Mở Softe Code trong app Softe' }]);
  assert.deepStrictEqual(win.events.filter((e) => e[0] === 'dockMenu'), []);
  // bấm mục đó: Windows chạy lại app với softe://code, app đang chạy nhận ở second-instance
  win.finish(SPLASH); win.navigate(SITE_URL);
  secondInstance(win, tasks[0][1][0].arguments);
  assert.strictEqual(win.urls().at(-1), `${SITE_URL}/code`);
  const dev = bootMain({ platform: 'win32', defaultApp: true, argv: ['C:\\node_modules\\electron\\dist\\electron.exe', '.'] });
  assert.strictEqual(dev.events.find((e) => e[0] === 'tasks')[1][0].arguments, `"${path.resolve('.')}" softe://code`);

  const linux = bootMain({ platform: 'linux' });
  assert.deepStrictEqual(linux.events.filter((e) => e[0] === 'tasks' || e[0] === 'dockMenu'), []);
});

test('gọi người dùng: phiên Code đợi họ mà cửa sổ không được xem thì nháy thanh tác vụ (Windows) / nảy Dock một lần (Mac); không tải gì', () => {
  const need = '❓ Cần bạn: Sửa lỗi đăng nhập';
  const w = bootMain({ platform: 'win32', focused: false });
  w.finish(SPLASH); w.navigate(`${SITE_URL}/code/${ID}`);
  const loads = w.calls.length;
  w.title('● Sửa lỗi đăng nhập · Code');
  assert.deepStrictEqual(w.events.filter((e) => typeof e === 'string' && e.startsWith('flashFrame')), [], 'AI đang làm: không gọi');
  w.title(need); w.title(need);
  assert.deepStrictEqual(w.events.filter((e) => typeof e === 'string' && e.startsWith('flashFrame')), ['flashFrame:true'], 'một lần cho một lần chuyển');
  w.w.emit('focus');
  assert.ok(w.events.includes('flashFrame:false'), 'người dùng quay lại cửa sổ: thôi nháy');
  w.title('⏸ Tạm dừng: Sửa lỗi đăng nhập');
  assert.strictEqual(w.events.filter((e) => e === 'flashFrame:true').length, 2, 'việc khác cần người dùng: gọi nữa');
  assert.strictEqual(w.calls.length, loads, 'tiêu đề đổi không bao giờ tải gì');
  assert.deepStrictEqual(w.events.filter((e) => typeof e === 'string' && e.startsWith('bounce')), [], 'Windows không nảy Dock');

  const mac = bootMain({ platform: 'darwin', focused: false });
  mac.finish(SPLASH); mac.navigate(SITE_URL);
  mac.title('⚠ Failed: Fix login');
  assert.deepStrictEqual(mac.events.filter((e) => typeof e === 'string' && (e.startsWith('bounce') || e === 'flashFrame:true')), ['bounce:informational']);

  // đang xem cửa sổ: người dùng thấy rồi, không gọi; rời đi mà tiêu đề không đổi thì cũng không gọi
  const seen = bootMain({ platform: 'win32', focused: true });
  seen.finish(SPLASH); seen.navigate(SITE_URL);
  seen.title(need);
  seen.w.focused = false;
  seen.title(need);
  assert.deepStrictEqual(seen.events.filter((e) => e === 'flashFrame:true'), []);
  // cửa sổ đã đóng: không gọi
  const gone = bootMain({ platform: 'win32', focused: false });
  gone.w.gone = true;
  gone.title(need);
  assert.deepStrictEqual(gone.events.filter((e) => e === 'flashFrame:true'), []);
});

test('chữ của app theo trang đang xem: tiếng Việt, sang trang /en thì menu, lối tắt Dock / danh sách nhảy đổi sang tiếng Anh, về trang thường thì tiếng Việt; chỉ dựng lại khi ngôn ngữ đổi', () => {
  const m = bootMain({ platform: 'win32' });
  assert.deepStrictEqual(labels(m), ['editMenu', 'viewMenu', 'Đi tới', 'windowMenu', 'Trợ giúp']);
  assert.deepStrictEqual(m.menu.find((x) => x.label === 'Trợ giúp').submenu.map((i) => i.label), ['Kiểm tra cập nhật']);
  const builds = () => m.events.filter((e) => e === 'menu').length;
  const tasks = () => m.events.filter((e) => e[0] === 'tasks').at(-1)[1][0];
  assert.strictEqual(builds(), 1);
  m.finish(SPLASH); m.navigate(`${SITE_URL}/chat`);
  assert.strictEqual(builds(), 1, 'trang thường vẫn tiếng Việt: không dựng lại');
  m.navigate(`${SITE_URL}/en/chat`);
  assert.deepStrictEqual(labels(m), ['editMenu', 'viewMenu', 'Go to', 'windowMenu', 'Help']);
  assert.deepStrictEqual(m.menu.find((x) => x.label === 'Go to').submenu.map((i) => [i.label, i.accelerator]), [['Softe Code', 'CmdOrCtrl+1'], ['Chat', 'CmdOrCtrl+2'], ['Overview', 'CmdOrCtrl+3'], ['Video editor', 'CmdOrCtrl+4']]);
  assert.deepStrictEqual(m.menu.find((x) => x.label === 'Help').submenu.map((i) => i.label), ['Check for updates']);
  assert.deepStrictEqual([tasks().title, tasks().description], ['Open Softe Code', 'Open Softe Code in the Softe app'], 'danh sách nhảy (Windows) đổi theo');
  assert.strictEqual(builds(), 2);
  m.inPage(`${SITE_URL}/en/code`);                       // đổi trang tại chỗ trong web (không tải lại): vẫn tiếng Anh, không dựng lại
  assert.strictEqual(builds(), 2);
  m.inPage(`${SITE_URL}/code`);                          // bấm "Tiếng Việt" của web: đổi tại chỗ
  assert.deepStrictEqual(labels(m), ['editMenu', 'viewMenu', 'Đi tới', 'windowMenu', 'Trợ giúp']);
  assert.deepStrictEqual(tasks().title, 'Mở Softe Code');
  assert.strictEqual(builds(), 3);
  // khung con của trang (iframe) không đổi chữ của app
  m.inPage(`${SITE_URL}/en/x`, false);
  assert.strictEqual(builds(), 3);
  // trang riêng của app (màn chờ, trang mất mạng) và địa chỉ lạ: giữ nguyên, không đoán
  m.navigate(`${PAGES_URL}/offline.vi.html?n=1`);
  m.navigate('https://evil.example/en/x');
  assert.strictEqual(builds(), 3);

  const mac = bootMain({ platform: 'darwin' });
  mac.finish(SPLASH); mac.navigate(`${SITE_URL}/en`);
  assert.deepStrictEqual(mac.events.filter((e) => e[0] === 'dockMenu').at(-1)[1].map((i) => i.label), ['Open Softe Code'], 'menu Dock đổi theo');
  mac.events.filter((e) => e[0] === 'dockMenu').at(-1)[1][0].click();
  assert.strictEqual(mac.urls().at(-1), `${SITE_URL}/en/code`);
});

test('máy tiếng Anh: lúc chưa có trang thì chữ tiếng Anh; softe.ai mở bản tiếng Việt (trang chủ) thì chữ tiếng Việt, như web', () => {
  const m = bootMain({ platform: 'win32', locale: 'en-US' });
  assert.deepStrictEqual(labels(m), ['editMenu', 'viewMenu', 'Go to', 'windowMenu', 'Help'], 'màn chờ: theo ngôn ngữ của máy');
  m.finish(`${PAGES_URL}/splash.html#en`); m.navigate(SITE_URL);
  assert.deepStrictEqual(labels(m), ['editMenu', 'viewMenu', 'Đi tới', 'windowMenu', 'Trợ giúp'], 'trang web tiếng Việt: chữ tiếng Việt');
  m.navigate(`${SITE_URL}/en/welcome`);
  assert.deepStrictEqual(labels(m), ['editMenu', 'viewMenu', 'Go to', 'windowMenu', 'Help']);
});

test('link ra ngoài: web, email và điện thoại mở bằng ứng dụng của máy; file:, javascript:, blob: và mọi kiểu khác không bao giờ; link softe.ai ở lại trong app', () => {
  const m = bootMain();
  m.finish(SPLASH); m.navigate(SITE_URL);
  for (const url of ['https://example.com/a', 'http://example.com', 'mailto:support@softe.ai', 'mailto:support@softe.ai?subject=Hello&body=Hi', 'tel:+84123456789']) {
    assert.strictEqual(m.open(url).action, 'deny', `${url}: cửa sổ mới bị từ chối`);
    assert.strictEqual(m.navigating(url), true, `${url}: không rời khỏi trang`);
  }
  assert.deepStrictEqual(m.externals, ['https://example.com/a', 'https://example.com/a', 'http://example.com', 'http://example.com', 'mailto:support@softe.ai', 'mailto:support@softe.ai',
    'mailto:support@softe.ai?subject=Hello&body=Hi', 'mailto:support@softe.ai?subject=Hello&body=Hi', 'tel:+84123456789', 'tel:+84123456789'], 'mỗi lần đúng một lần mở');
  const before = m.externals.length;
  for (const bad of ['file:///etc/passwd', 'javascript:alert(1)', 'blob:https://softe.ai/abc', 'data:text/html,x', 'ms-msdt:/id x', 'mailto:a@b.c?attachment=C:/x', 'mailto:a@b.c?attach=x', 'vscode://x', '']) {
    assert.strictEqual(m.open(bad).action, 'deny', bad);
    assert.strictEqual(m.navigating(bad), true, bad);
  }
  assert.strictEqual(m.externals.length, before, 'không mở gì lạ');
  assert.strictEqual(m.open(`${SITE_URL}/legal/terms`).action, 'allow', 'trang softe.ai mở được cửa sổ mới');
  assert.strictEqual(m.navigating(`${SITE_URL}/chat`), false, 'đi tới trang softe.ai trong cửa sổ: để yên');
  assert.strictEqual(m.externals.length, before);
});

test('cửa sổ con (link target=_blank tới softe.ai) và cửa sổ con của nó giữ cùng luật: ra ngoài thì mở bằng ứng dụng của máy, softe.ai ở lại', () => {
  const m = bootMain();
  m.finish(SPLASH); m.navigate(SITE_URL);
  const child = m.child();
  assert.strictEqual(typeof child.webContents.openHandler, 'function', 'cửa sổ con có bộ xử lý mở cửa sổ');
  assert.strictEqual(m.open('https://example.com/x', child.webContents).action, 'deny');
  assert.strictEqual(m.open('mailto:a@b.c', child.webContents).action, 'deny');
  assert.strictEqual(m.open(`${SITE_URL}/share/abc`, child.webContents).action, 'allow');
  assert.strictEqual(m.navigating('https://example.com/y', child.webContents), true, 'cửa sổ con không rời softe.ai bằng cách bấm link');
  assert.strictEqual(m.navigating(`${SITE_URL}/share/def`, child.webContents), false);
  assert.strictEqual(m.navigating('file:///etc/passwd', child.webContents), true);
  assert.deepStrictEqual(m.externals, ['https://example.com/x', 'mailto:a@b.c', 'https://example.com/y']);
  // cửa sổ con của cửa sổ con
  const grand = m.child(child.webContents);
  assert.strictEqual(m.open('https://example.com/z', grand.webContents).action, 'deny');
  assert.strictEqual(m.navigating('https://example.com/w', grand.webContents), true);
  assert.strictEqual(m.externals.length, 5);
  assert.strictEqual(m.windows.length, 3, 'không mở thêm cửa sổ nào');
});

test('menu chuột phải: ô nhập có Hoàn tác / Cắt / Sao chép / Dán / Chọn tất cả; chữ chọn có Sao chép; link mở và sao chép (email: soạn thư, sao chép địa chỉ); kiểu lạ không có mục nào', () => {
  const m = bootMain();
  m.finish(SPLASH); m.navigate(SITE_URL);
  const roles = (items) => items.map((i) => i.role || i.type || i.label);
  m.rightClick({ isEditable: true, selectionText: '' });
  assert.deepStrictEqual(roles(m.popups.at(-1)), ['undo', 'redo', 'separator', 'cut', 'copy', 'paste', 'selectAll']);
  m.rightClick({ isEditable: false, selectionText: 'xin chào' });
  assert.deepStrictEqual(roles(m.popups.at(-1)), ['copy']);
  m.rightClick({ isEditable: false, selectionText: '   ' });
  assert.strictEqual(m.popups.length, 2, 'chỗ trống: không hiện menu');
  m.rightClick({ linkURL: 'https://example.com/a?x=1', selectionText: 'a' });
  assert.deepStrictEqual(roles(m.popups.at(-1)), ['Mở liên kết trong trình duyệt', 'Sao chép địa chỉ liên kết', 'separator', 'copy']);
  m.popups.at(-1)[0].click(); m.popups.at(-1)[1].click();
  assert.deepStrictEqual(m.externals, ['https://example.com/a?x=1']);
  assert.deepStrictEqual(m.events.filter((e) => e[0] === 'clipboard'), [['clipboard', 'https://example.com/a?x=1']]);
  m.rightClick({ linkURL: 'mailto:support%40softe.ai?subject=Hi' });
  assert.deepStrictEqual(roles(m.popups.at(-1)), ['Soạn email', 'Sao chép địa chỉ email']);
  m.popups.at(-1)[1].click();
  assert.deepStrictEqual(m.events.filter((e) => e[0] === 'clipboard').at(-1), ['clipboard', 'support@softe.ai']);
  const n = m.popups.length;
  for (const bad of ['javascript:alert(1)', 'blob:https://softe.ai/x', 'file:///etc/passwd', 'ms-msdt:/id x']) m.rightClick({ linkURL: bad });
  assert.strictEqual(m.popups.length, n, 'link kiểu lạ: không hiện gì');
  // cửa sổ con có cùng menu; trang tiếng Anh thì chữ tiếng Anh
  m.navigate(`${SITE_URL}/en`);
  const child = m.child();
  m.rightClick({ linkURL: 'https://example.com/b' }, child.webContents);
  assert.deepStrictEqual(roles(m.popups.at(-1)), ['Open link in browser', 'Copy link address']);
});

test('đăng nhập Google / Apple xong: đường dẫn softe://welcome/persona?social=... mở đúng trang đó trong cửa sổ app (giữ tiếng Anh nếu đang xem /en); đường dẫn lạ không làm gì', () => {
  const m = bootMain({ platform: 'win32' });
  m.finish(SPLASH); m.navigate(`${SITE_URL}/welcome`);
  secondInstance(m, `softe://welcome/persona?social=${SOCIAL}`);
  assert.deepStrictEqual(m.urls().at(-1), `${SITE_URL}/welcome/persona?social=${SOCIAL}`);
  const n = m.urls().length;
  for (const bad of ['softe://welcome/persona?social=short', 'softe://welcome/persona', 'softe://welcome?error=evil', `softe://evil/persona?social=${SOCIAL}`]) secondInstance(m, bad);
  assert.strictEqual(m.urls().length, n, 'đường dẫn sai: không mở gì');
  // không thành (người dùng bấm Hủy ở Google): trang đăng nhập nói lý do
  const e = bootMain({ platform: 'darwin' });
  e.finish(SPLASH); e.navigate(`${SITE_URL}/en/welcome`);
  openUrl(e, 'softe://welcome?error=access_denied&error_description=cancelled');
  assert.deepStrictEqual(e.urls().at(-1), `${SITE_URL}/en/welcome?error=access_denied&error_description=cancelled`);
  // trước khi có cửa sổ: để dành, màn chờ xong mới mở
  const cold = bootMain({ platform: 'win32', argv: ['C:\\Softe\\Softe.exe', `softe://welcome/persona?social=${SOCIAL}`] });
  assert.deepStrictEqual(cold.urls(), []);
  cold.finish(SPLASH);
  assert.deepStrictEqual(cold.urls(), [`${SITE_URL}/welcome/persona?social=${SOCIAL}`]);
});

test('menu Sửa: Hoàn tác / Làm lại không giữ phím tắt, để trình dựng phim của web nhận Ctrl/Cmd + Z', () => {
  for (const platform of ['win32', 'darwin']) {
    const m = bootMain({ platform });
    const edit = m.menu.find((x) => x.role === 'editMenu');
    const byRole = Object.fromEntries(edit.submenu.filter((i) => i.role).map((i) => [i.role, i]));
    assert.strictEqual(byRole.undo.registerAccelerator, false, `${platform}: undo`);
    assert.strictEqual(byRole.redo.registerAccelerator, false, `${platform}: redo`);
    for (const r of ['cut', 'copy', 'paste', 'selectAll']) assert.ok(byRole[r] && byRole[r].registerAccelerator !== false, `${platform}: ${r} vẫn có phím tắt`);
    assert.ok(!edit.submenu.some((i) => i.label), 'chữ của menu Sửa vẫn là vai trò của Electron (tự dịch), không viết lại');
  }
});
