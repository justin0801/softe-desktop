'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const u = require('../src/updater');
const { allowedHost, resolve } = require('../src/config');

const SHA = crypto.createHash('sha256').update('hello').digest('hex');
const good = { update: true, version: '1.2.0', url: 'https://downloads.softe.ai/a.dmg', sha256: SHA, size: 5 };

test('chỉ nhận câu trả lời đúng dạng', () => {
  assert.ok(u.parseAnswer(good));
  assert.strictEqual(u.parseAnswer({ ...good, update: false }), null);
  assert.strictEqual(u.parseAnswer({ ...good, url: 'http://x.com/a' }), null);
  assert.strictEqual(u.parseAnswer({ ...good, url: 'https://a:b@x.com/a' }), null);
  assert.strictEqual(u.parseAnswer({ ...good, url: 'javascript:alert(1)' }), null);
  assert.strictEqual(u.parseAnswer({ ...good, sha256: null }), null); // không mã kiểm tra thì không cài
  assert.strictEqual(u.parseAnswer({ ...good, sha256: 'zz' }), null);
  assert.strictEqual(u.parseAnswer(null), null);
});

test('địa chỉ hỏi cập nhật', () => {
  assert.strictEqual(u.updateUrl('https://api.softe.ai/v1/', 'mac', '1.0.0'),
    'https://api.softe.ai/v1/app/desktop/update?platform=mac&version=1.0.0');
  assert.strictEqual(u.platformKey('darwin'), 'mac');
  assert.strictEqual(u.platformKey('win32'), 'win');
  assert.strictEqual(u.platformKey('linux'), null);
});

const fakeFetch = (body) => async () => ({ ok: true, body: Readable.from([Buffer.from(body)]) });
const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sd-')), 'f.bin');

test('tải đúng file thì giữ lại', async () => {
  const dest = tmp();
  await u.download(good, dest, fakeFetch('hello'));
  assert.ok(fs.existsSync(dest));
});

test('sai mã kiểm tra thì xóa file và báo lỗi', async () => {
  const dest = tmp();
  await assert.rejects(u.download(good, dest, fakeFetch('hellX')), /bad_checksum/);
  assert.ok(!fs.existsSync(dest));
});

test('file lớn hơn khai báo thì dừng', async () => {
  const dest = tmp();
  await assert.rejects(u.download(good, dest, fakeFetch('hello world!!')), /too_big/);
  assert.ok(!fs.existsSync(dest));
});

test('check trả null khi máy chủ lỗi', async () => {
  assert.strictEqual(await u.check('https://a/v1', 'mac', '1.0.0', async () => ({ ok: false })), null);
  assert.ok(await u.check('https://a/v1', 'mac', '1.0.0', async () => ({ ok: true, json: async () => good })));
});

test('chỉ softe.ai mở trong cửa sổ app', () => {
  const s = 'https://softe.ai';
  assert.ok(allowedHost('https://softe.ai/chat', s));
  assert.ok(allowedHost('https://www.softe.ai/', s));
  for (const bad of ['http://softe.ai', 'https://softe.ai.evil.com', 'https://evilsofte.ai', 'https://a.softe.ai/',
                     'https://u:p@softe.ai/', 'javascript:1', 'file:///etc/passwd', 'not a url'])
    assert.ok(!allowedHost(bad, s), bad);
});

test('bản đóng gói luôn dùng địa chỉ thật', () => {
  assert.strictEqual(resolve(true, { SOFTE_URL: 'https://evil.com' }).site, 'https://softe.ai');
  assert.strictEqual(resolve(false, { SOFTE_URL: 'https://staging.softe.ai' }).site, 'https://staging.softe.ai');
});
