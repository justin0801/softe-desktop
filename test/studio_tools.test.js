'use strict';
// Công cụ của Studio Giấy tờ & pháp lý, Việc làm, Văn phòng là trang của web (softe-fe /studio/<studio>/tools): app máy tính chỉ cần mở chúng TRONG cửa sổ,
// không có mã riêng cho chúng (không logic nghiệp vụ, không bán gì trong app).
const test = require('node:test');
const assert = require('node:assert');
const { allowedHost, PROD_SITE } = require('../src/config');

const TOOLS = ['legal', 'career', 'office'].flatMap((s) => [`/studio/${s}/tools`, `/en/studio/${s}/tools`]);

test('các trang công cụ mới mở trong cửa sổ app (cùng địa chỉ softe.ai)', () => {
  for (const p of TOOLS) assert.ok(allowedHost(`${PROD_SITE}${p}`, PROD_SITE), p);
});

test('địa chỉ giống softe.ai nhưng không phải softe.ai vẫn mở ngoài trình duyệt', () => {
  for (const url of ['https://softe.ai.evil.example/studio/legal/tools', 'https://evil.example/studio/office/tools', 'http://softe.ai/studio/office/tools', 'https://user:pw@softe.ai/studio/career/tools']) {
    assert.strictEqual(allowedHost(url, PROD_SITE), false, url);
  }
});

test('app không có mã riêng cho các công cụ này (chỉ cửa sổ mở web)', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  for (const f of ['main.js', 'preload.js', 'config.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
    assert.ok(!/paperwork|careerpro|\/office\/|studio\/(legal|career|office)/i.test(src), f);
  }
});
