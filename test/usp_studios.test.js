'use strict';
// Các Studio Creator, Nấu ăn, Phim & Ảnh, Sức khỏe, Làm đẹp (softe-be docs/usp-studios-phan-1.md) là trang của web (softe-fe /studio/<khóa>): bảng công cụ nằm
// dưới danh sách dự án của từng Studio. App máy tính chỉ cần mở chúng TRONG cửa sổ, không có mã riêng (không logic nghiệp vụ, không bán gì trong app).
// Call sheet Word / Excel dùng tải tệp của chính cửa sổ web; dữ liệu Sức khỏe chỉ đi giữa cửa sổ và máy chủ, app không đọc, không ghi, không lưu.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { allowedHost, PROD_SITE } = require('../src/config');

const STUDIOS = ['creator', 'cooking', 'film', 'wellness', 'beauty'];
const PAGES = STUDIOS.flatMap((s) => [`/studio/${s}`, `/en/studio/${s}`]);

test('các Studio USP mở trong cửa sổ app (cùng địa chỉ softe.ai)', () => {
  for (const p of PAGES) assert.ok(allowedHost(`${PROD_SITE}${p}`, PROD_SITE), p);
});

test('địa chỉ giống softe.ai nhưng không phải softe.ai vẫn mở ngoài trình duyệt', () => {
  for (const url of ['https://softe.ai.evil.example/studio/wellness', 'https://evil.example/studio/cooking', 'http://softe.ai/studio/beauty',
                     'https://user:pw@softe.ai/studio/film']) {
    assert.strictEqual(allowedHost(url, PROD_SITE), false, url);
  }
});

test('app không có mã riêng cho các Studio này (chỉ cửa sổ mở web)', () => {
  for (const f of ['main.js', 'preload.js', 'config.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
    assert.ok(!/studio\/(creator|cooking|film|wellness|beauty)|\/usp\/|wellness|habit/i.test(src), f);
  }
});

test('app không chặn tải tệp (call sheet Word / Excel) và không có đường ghi tệp riêng', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.ok(!/will-download/.test(src) && !/downloadURL/.test(src), 'tải tệp để mặc định của Electron (hộp "Lưu thành…")');
});

test('app chỉ cấp quyền micro (và ghi vào thư mục người dùng chọn, xem test/permissions.test.js): Studio Sức khỏe không xin thêm quyền nào', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.ok(/permission === 'media'/.test(src), 'micro vẫn có');
  assert.ok(!/geolocation|notifications|camera|clipboard-read/.test(src));
});
