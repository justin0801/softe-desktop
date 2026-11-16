'use strict';
// Studio Bán hàng online và Studio Tài chính mở rộng là trang của web (softe-fe /studio/shop/<màn>, /studio/finance/more/<màn>): app máy tính chỉ cần mở chúng
// TRONG cửa sổ, không có mã riêng (không logic nghiệp vụ, không bán gì trong app). Nhập / xuất Excel dùng ô chọn tệp và tải tệp của chính cửa sổ web.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { allowedHost, PROD_SITE } = require('../src/config');

const SHOP = ['products', 'fees', 'calc', 'tools', 'tools/shop_listing', 'check', 'orders', 'customers', 'reports', 'media'];
const FINANCE = ['jars', 'report', 'recurring', 'debts', 'hui', 'gifts', 'calc'];
const PAGES = [
  '/studio/shop', ...SHOP.map((v) => `/studio/shop/${v}`),
  '/studio/finance', ...FINANCE.map((v) => `/studio/finance/more/${v}`),
].flatMap((p) => [p, `/en${p}`]);

test('các màn Shop và Tài chính mở rộng mở trong cửa sổ app (cùng địa chỉ softe.ai)', () => {
  for (const p of PAGES) assert.ok(allowedHost(`${PROD_SITE}${p}`, PROD_SITE), p);
});

test('địa chỉ giống softe.ai nhưng không phải softe.ai vẫn mở ngoài trình duyệt', () => {
  for (const url of ['https://softe.ai.evil.example/studio/shop/products', 'https://evil.example/studio/finance/more/jars', 'http://softe.ai/studio/shop/calc',
                     'https://user:pw@softe.ai/studio/finance/more/debts']) {
    assert.strictEqual(allowedHost(url, PROD_SITE), false, url);
  }
});

test('app không có mã riêng cho hai Studio này (chỉ cửa sổ mở web)', () => {
  for (const f of ['main.js', 'preload.js', 'config.js']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
    assert.ok(!/studio\/(shop|finance)|shop-studio|finance_pro|\/finance\//i.test(src), f);
  }
});

test('app không chặn tải tệp (xuất Excel) và không có đường ghi tệp riêng', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.ok(!/will-download/.test(src) && !/downloadURL/.test(src), 'tải tệp để mặc định của Electron (hộp "Lưu thành…")');
});
