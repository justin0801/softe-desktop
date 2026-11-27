'use strict';
// Tự cập nhật (main.js + updater.js + update-nag.js): proxy hệ thống (net.fetch), hạn giờ, báo lỗi, tiến độ, "Để sau" không nhắc liên tục,
// mất mạng về đúng trang. Luật cứng: không bao giờ cài tệp thiếu hoặc sai SHA-256 (test/updater.test.js giữ phần đó).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const u = require('../src/updater');
const nag = require('../src/update-nag');
const { bootMain, flush, SITE_URL, PAGES_URL } = require('./main-harness');

const SHA = crypto.createHash('sha256').update('hello').digest('hex');
const ANSWER = { update: true, version: '1.9.0', url: 'https://downloads.softe.ai/Softe-1.9.0.dmg', sha256: SHA, size: 5, notes: 'x' };
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sd-')), 'f.bin');

// ---- updater.js: hạn giờ và máy chủ cho phép ----

test('hạn giờ: máy chủ không bao giờ trả lời thì check bị từ chối sau hạn, không treo', async () => {
  const hang = () => new Promise(() => {}); // không nghe signal, không trả lời
  const real = global.setTimeout;
  global.setTimeout = (fn, ms, ...a) => real(fn, ms === u.CHECK_TIMEOUT_MS ? 20 : ms, ...a); // rút hạn 20 giây xuống 20 ms cho test
  try { await assert.rejects(u.check('https://a/v1', 'mac', '1.0.0', hang), /timeout/); } finally { global.setTimeout = real; }
});

test('check đưa signal cho fetchFn (để hủy được kết nối)', async () => {
  let got = null;
  await u.check('https://a/v1', 'mac', '1.0.0', async (url, o) => { got = o; return { ok: false }; });
  assert.ok(got && got.signal && typeof got.signal.aborted === 'boolean');
});

test('hạn giờ: tải mà không có dữ liệu về thì bị hủy, tệp dở bị xóa', async () => {
  const dest = tmp();
  const stuck = async () => ({ ok: true, body: (async function* () { yield Buffer.from('he'); await new Promise(() => {}); })() });
  await assert.rejects(u.download({ ...ANSWER }, dest, stuck, null, { stall: 30, start: 1000, total: 5000 }), /timeout/);
  assert.ok(!fs.existsSync(dest));
});

test('hạn giờ: máy chủ không phản hồi lúc bắt đầu tải', async () => {
  const dest = tmp();
  await assert.rejects(u.download({ ...ANSWER }, dest, () => new Promise(() => {}), null, { start: 30, stall: 1000, total: 5000 }), /timeout/);
  assert.ok(!fs.existsSync(dest));
});

test('tải bình thường vẫn xong, có báo tiến độ, và vẫn kiểm SHA-256', async () => {
  const dest = tmp(); const seen = [];
  await u.download({ ...ANSWER }, dest, async () => ({ ok: true, body: Readable.from([Buffer.from('he'), Buffer.from('llo')]) }), (n, t) => seen.push([n, t]));
  assert.deepStrictEqual(seen, [[2, 5], [5, 5]]);
  const bad = tmp();
  await assert.rejects(u.download({ ...ANSWER }, bad, async () => ({ ok: true, body: Readable.from([Buffer.from('hellX')]) })), /bad_checksum/);
  assert.ok(!fs.existsSync(bad));
});

test('một hàm báo tiến độ bị lỗi không làm hỏng việc tải', async () => {
  const dest = tmp();
  await u.download({ ...ANSWER }, dest, async () => ({ ok: true, body: Readable.from([Buffer.from('hello')]) }), () => { throw new Error('x'); });
  assert.ok(fs.existsSync(dest));
});

test('chỉ nhận link từ softe.ai hoặc GitHub; host lạ bị từ chối (kể cả tên giống)', () => {
  for (const ok of ['https://softe.ai/a.dmg', 'https://downloads.softe.ai/a.dmg', 'https://files.softe.ai/x/a.exe', 'https://github.com/softe/softe-desktop/releases/download/v1/a.dmg'])
    assert.ok(u.parseAnswer({ ...ANSWER, url: ok }), ok);
  for (const bad of ['https://evil.example/a.dmg', 'https://softe.ai.evil.example/a.dmg', 'https://evilsofte.ai/a.dmg', 'https://github.com.evil.example/a',
                     'https://objects.githubusercontent.com/a.dmg', 'https://gist.github.com/a', 'https://xsofte.ai/a'])
    assert.strictEqual(u.parseAnswer({ ...ANSWER, url: bad }), null, bad);
});

test('link GitHub chuyển tiếp: địa chỉ cuối phải là githubusercontent hoặc softe.ai; nơi lạ bị từ chối dù mã băm đúng', async () => {
  const via = (url) => async () => ({ ok: true, url, body: Readable.from([Buffer.from('hello')]) });
  const ok = tmp();
  await u.download({ ...ANSWER }, ok, via('https://objects.githubusercontent.com/x'));
  assert.ok(fs.existsSync(ok));
  const bad = tmp();
  await assert.rejects(u.download({ ...ANSWER }, bad, via('https://evil.example/x')), /bad_host/);
  assert.ok(!fs.existsSync(bad));
  await assert.rejects(u.download({ ...ANSWER }, tmp(), via('https://githubusercontent.com.evil.example/x')), /bad_host/);
});

// ---- update-nag.js ----

test('"Để sau": cùng bản không nhắc lại trong 24 giờ; bản bắt buộc và kiểm tay luôn hỏi; bản khác hỏi ngay', () => {
  const t0 = 1_000_000_000_000;
  const saved = { version: '1.9.0', at: t0 };
  const ask = (o, now) => nag.shouldAsk({ manual: false, required: false, version: '1.9.0', ...o }, saved, now);
  assert.strictEqual(ask({}, t0 + 4 * 3600 * 1000), false, 'sau 4 giờ (nhịp tự kiểm tra) không hỏi');
  assert.strictEqual(ask({}, t0 + nag.QUIET_MS - 1), false);
  assert.strictEqual(ask({}, t0 + nag.QUIET_MS), true, 'qua 24 giờ thì hỏi lại');
  assert.strictEqual(ask({ required: true }, t0 + 1000), true, 'bản bắt buộc luôn hỏi');
  assert.strictEqual(ask({ manual: true }, t0 + 1000), true, 'kiểm tay luôn hỏi');
  assert.strictEqual(ask({ version: '1.10.0' }, t0 + 1000), true, 'bản khác hỏi ngay');
  assert.strictEqual(ask({}, t0 - 5000), true, 'đồng hồ máy lùi: không nhịn nhắc mãi');
  assert.strictEqual(nag.shouldAsk({ manual: false, required: false, version: '1.9.0' }, null, t0), true, 'chưa từng nhắc');
});

test('mốc nhắc lưu trong tệp của app; tệp hỏng hoặc dữ liệu lạ thì coi như chưa nhắc, không bao giờ ném lỗi', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nag-'));
  const f = path.join(dir, nag.NAME);
  assert.strictEqual(nag.read(f, fs), null);
  assert.strictEqual(nag.remember(f, fs, '1.9.0', 123), true);
  assert.deepStrictEqual(nag.read(f, fs), { version: '1.9.0', at: 123 });
  for (const junk of ['{', '[]', '{"version":"../x","at":1}', '{"version":"1.9.0","at":"a"}', 'null']) { fs.writeFileSync(f, junk); assert.strictEqual(nag.read(f, fs), null, junk); }
  assert.strictEqual(nag.remember(f, fs, '../../x', 1), false);
  assert.strictEqual(nag.remember(path.join(dir, 'no', 'such', 'x.json'), fs, '1.9.0', 1), false);
});

// ---- main.js với Electron giả ----

const answerFetch = (answer, body = 'hello') => (url) => {
  if (String(url).includes('/app/desktop/update')) return Promise.resolve({ ok: true, json: async () => answer });
  return Promise.resolve({ ok: true, body: Readable.from([Buffer.from(body)]) });
};
const helpItem = (m) => m.menu.find((x) => x.label === 'Trợ giúp').submenu[0];
const settle = async () => { for (let i = 0; i < 20; i++) await flush(); await new Promise((r) => setTimeout(r, 30)); for (let i = 0; i < 5; i++) await flush(); };

test('main.js dùng net.fetch của Electron (theo proxy hệ thống) để hỏi và tải', async () => {
  const m = bootMain({ platform: 'darwin', netFetch: answerFetch(ANSWER) });
  await helpItem(m).click(); await settle();
  assert.ok(m.netCalls.some((x) => x.includes('/app/desktop/update')), 'hỏi cập nhật qua net.fetch');
  assert.ok(m.netCalls.includes(ANSWER.url), 'tải qua net.fetch');
});

test('tự kiểm tra, người dùng bấm "Cập nhật ngay", tải lỗi (sai SHA-256): phải hiện lỗi, không im lặng', async () => {
  const m = bootMain({ platform: 'darwin', netFetch: answerFetch(ANSWER, 'hellX') });
  m.timerFns[0](); await settle(); // lần tự kiểm tra (manual = false)
  assert.strictEqual(m.infoBoxes.length, 1, 'hộp "Có bản mới" hiện');
  assert.strictEqual(m.errorBoxes.length, 1, 'tải lỗi thì có hộp lỗi');
  assert.ok(m.errorBoxes[0][1].length > 5);
  assert.deepStrictEqual(m.opened, [], 'không mở tệp sai mã băm');
  assert.ok(!m.events.includes('quit'));
});

test('tự kiểm tra mà KHÔNG có bản mới hay lỗi mạng khi chưa bấm gì: vẫn im lặng', async () => {
  const m = bootMain({ platform: 'darwin', netFetch: () => Promise.reject(new Error('net')) });
  m.timerFns[0](); await settle();
  assert.strictEqual(m.errorBoxes.length, 0);
  assert.strictEqual(m.infoBoxes.length, 0);
});

test('tải đúng thì có thanh tiến độ, mở tệp rồi mới thoát', async () => {
  const m = bootMain({ platform: 'darwin', netFetch: answerFetch(ANSWER) });
  m.timerFns[0](); await settle();
  assert.strictEqual(m.opened.length, 1);
  assert.ok(m.progress.length >= 2 && m.progress.at(-1) === -1, 'tiến độ rồi bỏ thanh');
  assert.ok(m.progress.some((p) => typeof p === 'number' && p > 0 && p < 1));
  assert.ok(m.events.includes('quit'));
});

test('openPath trả chuỗi lỗi: hiện lỗi và KHÔNG thoát (không mất phiên làm việc)', async () => {
  const m = bootMain({ platform: 'darwin', netFetch: answerFetch(ANSWER), openPathResult: 'không mở được' });
  m.timerFns[0](); await settle();
  assert.strictEqual(m.opened.length, 1);
  assert.strictEqual(m.errorBoxes.length, 1);
  assert.ok(!m.events.includes('quit'), 'không thoát khi chưa cài được gì');
});

test('"Để sau": lần tự kiểm tra kế tiếp không hỏi lại; bản bắt buộc và kiểm tay vẫn hỏi', async () => {
  const m = bootMain({ platform: 'darwin', netFetch: answerFetch(ANSWER), updateChoice: 1 });
  m.timerFns[0](); await settle();
  assert.strictEqual(m.infoBoxes.length, 1);
  m.timerFns[1](); await settle(); // nhịp 4 giờ
  assert.strictEqual(m.infoBoxes.length, 1, 'không bật lại hộp');
  await helpItem(m).click(); await settle();
  assert.strictEqual(m.infoBoxes.length, 2, 'kiểm tra tay luôn hỏi');
  const req = bootMain({ platform: 'darwin', netFetch: answerFetch({ ...ANSWER, required: true }), updateChoice: 1 });
  req.timerFns[0](); await settle(); req.timerFns[1](); await settle();
  assert.strictEqual(req.infoBoxes.length, 2, 'bản bắt buộc luôn hỏi');
  assert.ok(req.events.includes('quit'));
});

test('kiểm tra tay lúc app đang kiểm tra / tải thì báo là đang bận, không im lặng', async () => {
  let release; const gate = new Promise((r) => { release = r; });
  const m = bootMain({ platform: 'darwin', netFetch: async (url) => { await gate; return answerFetch(null)(url); } });
  m.timerFns[0](); await flush();
  const manual = helpItem(m).click(); await flush();
  assert.strictEqual(m.infoBoxes.length, 1, 'có thông báo đang bận');
  release(); await manual; await settle();
});

// ---- DESK-7: mất mạng giữa chừng về đúng trang ----

test('mất mạng ở /chat/123: "Thử lại" mở lại đúng /chat/123, không về trang chủ', () => {
  const m = bootMain({ platform: 'win32' });
  m.finish(`${PAGES_URL}/splash.html#vi`); m.navigate(`${SITE_URL}/`);
  m.fail(-106, `${SITE_URL}/chat/123`); m.navigate(`${PAGES_URL}/offline.vi.html?n=1`);
  m.inPage(`${PAGES_URL}/offline.vi.html?n=1#retry`);
  assert.strictEqual(m.urls().at(-1), `${SITE_URL}/chat/123`);
  m.navigate(`${SITE_URL}/chat/123`); // vào được: quên
  m.fail(-106, `${SITE_URL}/code`); m.navigate(`${PAGES_URL}/offline.vi.html?n=1`);
  m.inPage(`${PAGES_URL}/offline.vi.html?n=1#retry`);
  assert.strictEqual(m.urls().at(-1), `${SITE_URL}/code`);
});

test('lỗi mạng của địa chỉ lạ, khung con hay ERR_ABORTED không đổi trang sẽ mở lại', () => {
  const m = bootMain({ platform: 'win32' });
  m.finish(`${PAGES_URL}/splash.html#vi`);
  m.fail(-106, 'https://evil.example/x'); m.fail(-3, `${SITE_URL}/x`); m.fail(-106, `${SITE_URL}/frame`, false);
  m.inPage(`${PAGES_URL}/offline.vi.html?n=1#retry`);
  assert.strictEqual(m.urls().at(-1), SITE_URL, 'về trang chủ như cũ');
});
