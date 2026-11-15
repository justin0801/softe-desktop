'use strict';
// Link ra ngoài (src/config.js::externalOk): chỉ web, email và điện thoại. Mọi kiểu khác không bao giờ được mở từ một trang web.
const test = require('node:test');
const assert = require('node:assert');
const { externalOk } = require('../src/config');

test('web, email và điện thoại được mở', () => {
  for (const url of [
    'https://example.com', 'http://example.com/a?b=c#d', 'https://sub.example.com:8443/x',
    'mailto:support@softe.ai', 'mailto:support@softe.ai?subject=Hello&body=Hi%20there', 'mailto:a@b.c?cc=x@y.z&bcc=q@w.e', 'MAILTO:support@softe.ai?SUBJECT=Hi',
    'tel:+84123456789', 'tel:0123456789',
  ]) assert.strictEqual(externalOk(url), true, url);
});

test('mọi kiểu khác không bao giờ: tệp, mã chạy, ứng dụng cài sẵn, dữ liệu nhúng', () => {
  for (const url of [
    'file:///etc/passwd', 'file://host/share/x', 'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>1</script>', 'blob:https://softe.ai/abc',
    'ms-msdt:/id PCWDiagnostic', 'ms-settings:privacy', 'search-ms:query=x', 'vscode://file/etc/passwd', 'slack://open', 'zoommtg://x', 'steam://run/1', 'ftp://example.com/x', 'ssh://host', 'softe://code',
  ]) assert.strictEqual(externalOk(url), false, url);
});

test('mailto không đính kèm tệp, không có người dùng:mật khẩu, không có #', () => {
  for (const url of [
    'mailto:a@b.c?attachment=C:/secret.txt', 'mailto:a@b.c?attach=x', 'mailto:a@b.c?subject=Hi&attachment=x', 'mailto:a@b.c?in-reply-to=x', 'mailto:a@b.c?x=1',
    'mailto:a@b.c#frag', 'mailto:user:pw@b.c',
  ]) assert.strictEqual(externalOk(url), false, url);
});

test('đầu vào hỏng: không phải chuỗi, rỗng, quá dài, có dấu cách hay ký tự điều khiển, không phân tích được', () => {
  for (const url of [undefined, null, 5, {}, [], '', 'not a url', ' https://example.com', 'https://example.com ', 'https://exa mple.com', 'https://example.com/\n', 'https://example.com/\u0000', 'https://example.com/\u007f', 'https://example.com/\t', '://x', 'https://']) {
    assert.strictEqual(externalOk(url), false, JSON.stringify(url));
  }
  assert.strictEqual(externalOk(`https://example.com/${'a'.repeat(2048)}`), false, 'dài quá 2048');
  assert.strictEqual(externalOk(`https://example.com/${'a'.repeat(2000)}`), true, 'dài vừa');
});
