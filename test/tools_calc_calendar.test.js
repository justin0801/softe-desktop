'use strict';
// Máy tính (vay, tiết kiệm, thuế, phí sàn) và Lịch Việt Nam là trang của web (softe-fe /tools/calc, /tools/calendar): app máy tính chỉ mở chúng TRONG cửa sổ,
// không có mã riêng cho chúng (không logic nghiệp vụ, không số liệu, không bán gì trong app).
const test = require('node:test');
const assert = require('node:assert');
const { allowedHost, PROD_SITE } = require('../src/config');

const PAGES = ['/tools/calc', '/tools/calendar', '/en/tools/calc', '/en/tools/calendar'];

test('hai trang công cụ mở trong cửa sổ app (cùng địa chỉ softe.ai)', () => {
  for (const p of PAGES) assert.ok(allowedHost(`${PROD_SITE}${p}`, PROD_SITE), p);
});

test('địa chỉ giống softe.ai nhưng không phải softe.ai vẫn mở ngoài trình duyệt', () => {
  for (const url of ['https://softe.ai.evil.example/tools/calc', 'https://evil.example/tools/calendar', 'http://softe.ai/tools/calc', 'https://user:pw@softe.ai/tools/calendar']) {
    assert.strictEqual(allowedHost(url, PROD_SITE), false, url);
  }
});

test('app không có mã riêng cho máy tính và lịch (chỉ cửa sổ mở web)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  for (const f of ['main.js', 'preload.js', 'config.js', 'shell.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
    assert.ok(!/tools\/(calc|calendar)|lunar|âm lịch|calc\.|vn_calendar/i.test(src), f);
  }
});
