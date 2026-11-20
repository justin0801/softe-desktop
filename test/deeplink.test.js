'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { parseDeepLink, findLink, langOf } = require('../src/deeplink');
const { needsAttention } = require('../src/attention');

const SITE = 'https://softe.ai';
const CODE = 'a'.repeat(24);
const STATE = 'eyJjIjoiZGVza3RvcCJ9.' + 'x'.repeat(30);

test('đăng nhập Google / Apple: mã một lần mở đúng trang trong cửa sổ app', () => {
  assert.equal(parseDeepLink(`softe://welcome/persona?social=${CODE}`, SITE), `${SITE}/welcome/persona?social=${CODE}`);
  assert.equal(parseDeepLink(`softe://welcome/persona?social=${CODE}`, SITE, 'en'), `${SITE}/en/welcome/persona?social=${CODE}`);
});

test('đăng nhập Google / Apple: mã sai dạng hoặc thừa tham số bị bỏ', () => {
  for (const bad of ['softe://welcome/persona', 'softe://welcome/persona?social=short', `softe://welcome/persona?social=${'a'.repeat(101)}`,
    `softe://welcome/persona?social=${CODE}&social=${CODE}`, `softe://welcome/persona?social=${CODE}&x=1`, 'softe://welcome/persona?social=a%20b-aaaaaaaaaaaaaaaaaaaaa',
    `softe://welcome/persona?error=access_denied&social=${CODE}`]) assert.equal(parseDeepLink(bad, SITE), null, bad);
});

test('đăng nhập Google / Apple: người dùng hủy hoặc lỗi máy chủ', () => {
  assert.equal(parseDeepLink('softe://welcome?error=access_denied', SITE), `${SITE}/welcome?error=access_denied`);
  assert.equal(parseDeepLink('softe://welcome?error=server_error&error_description=email_unverified', SITE), `${SITE}/welcome?error=server_error&error_description=email_unverified`);
  for (const bad of ['softe://welcome', 'softe://welcome?error=other', 'softe://welcome?error=server_error&error_description=Bad Reason',
    'softe://welcome?error=server_error&error_description=a&error_description=b', 'softe://welcome?error=server_error&x=1']) assert.equal(parseDeepLink(bad, SITE), null, bad);
});

test('GitHub: chỉ chuyển các tham số web gửi, không bao giờ token', () => {
  const r = parseDeepLink(`softe://code/github?code=${CODE}&state=${STATE}&installation_id=77&setup_action=install&access_token=ghu_secret&foo=1`, SITE);
  assert.equal(r, `${SITE}/code/github/callback?code=${CODE}&state=${encodeURIComponent(STATE)}&installation_id=77&setup_action=install`.replace(encodeURIComponent('.'), '.'));
  assert.doesNotMatch(r, /token|ghu_|foo/);
  assert.match(parseDeepLink(`softe://code/github?error=access_denied&error_description=The+user+said+no&state=${STATE}`, SITE), /error=access_denied&error_description=The\+user\+said\+no/);
  assert.match(parseDeepLink(`softe://code/github?code=${CODE}&state=${STATE}`, SITE, 'en'), /^https:\/\/softe\.ai\/en\/code\/github\/callback\?/);
});

test('GitHub: thiếu state hoặc tham số bất thường thì bỏ', () => {
  for (const bad of [`softe://code/github?code=${CODE}`, `softe://code/github?code=has%20space&state=${STATE}`, `softe://code/github?code=${'c'.repeat(101)}&state=${STATE}`,
    `softe://code/github?code=${CODE}&state=${STATE}&installation_id=%0A7`, 'softe://code/github']) assert.equal(parseDeepLink(bad, SITE), null, bad);
});

test('link lạ bị bỏ: địa chỉ khác, đi vòng, ký tự lạ, không phải chữ', () => {
  for (const bad of ['https://softe.ai/', 'softe://evil/anything', 'softe://code/github/../x?state=a', 'softe://code%2fgithub?state=a', 'softe://code\\github?state=a',
    'softe://user:pw@code/github?state=a', 'softe://code:81/github?state=a', `softe://welcome/persona?social=${CODE}#x`, 'softe://welcome/persona\n?social=x', '', null, undefined, 5, `softe://welcome?error=access_denied${'a'.repeat(3000)}`])
    assert.equal(parseDeepLink(bad, SITE), null, String(bad));
});

test('findLink và langOf', () => {
  assert.equal(findLink(['app.exe', '--x', 'softe://welcome?error=access_denied']), 'softe://welcome?error=access_denied');
  assert.equal(findLink(['app.exe']), null);
  assert.equal(findLink(undefined), null);
  assert.equal(langOf('https://softe.ai/en/code'), 'en');
  assert.equal(langOf('https://softe.ai/encode'), 'vi');
  assert.equal(langOf('x'), 'vi');
});

test('báo chú ý khi tiêu đề Softe Code gọi người dùng', () => {
  for (const t of ['❓ Cần bạn: Sửa lỗi', '❓ Needs you (2): x', '⚠ Lỗi: x', '⏸ Tạm dừng: x', ' ​❓️ Cần bạn']) assert.equal(needsAttention(t), true, t);
  for (const t of ['● Sửa lỗi · Code', 'Sửa lỗi · Code', 'Softe', 'Hỏi ❓ giữa câu', '', null, undefined]) assert.equal(needsAttention(t), false, String(t));
});
