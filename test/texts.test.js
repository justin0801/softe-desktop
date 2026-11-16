'use strict';
// Chữ của chính app, tiếng Việt và tiếng Anh (src/texts.js): ngôn ngữ theo trang đang xem, như web.
const test = require('node:test');
const assert = require('node:assert');
const { TEXTS, languageOf, textsFor } = require('../src/texts');

const SITE = 'https://softe.ai';

test('hai ngôn ngữ có đúng cùng các khóa và không khóa nào để trống', () => {
  assert.deepStrictEqual(Object.keys(TEXTS.en).sort(), Object.keys(TEXTS.vi).sort());
  for (const lang of ['vi', 'en']) for (const [k, v] of Object.entries(TEXTS[lang])) assert.ok(typeof v === 'string' && v.trim() !== '', `${lang}.${k}`);
  assert.ok(Object.isFrozen(TEXTS) && Object.isFrozen(TEXTS.vi) && Object.isFrozen(TEXTS.en));
});

test('app không bán gì: không chữ nào về mua bán, giá, credit, gói hay khuyến mãi; không chữ Trung; không tên nhà cung cấp', () => {
  const forbidden = /(mua|giá|credit|gói|khuyến mãi|thanh toán|nạp|buy|price|pricing|plan|promo|discount|pay|purchase|subscription|upgrade|juao|[㐀-鿿])/i;
  for (const lang of ['vi', 'en']) for (const [k, v] of Object.entries(TEXTS[lang])) assert.ok(!forbidden.test(v), `${lang}.${k}: ${v}`);
});

test('ngôn ngữ theo trang: /en của softe.ai tiếng Anh, trang softe.ai khác tiếng Việt', () => {
  assert.strictEqual(languageOf(`${SITE}/en`, 'vi-VN', SITE), 'en');
  assert.strictEqual(languageOf(`${SITE}/en/`, 'vi-VN', SITE), 'en');
  assert.strictEqual(languageOf(`${SITE}/en/code?x=1`, 'vi-VN', SITE), 'en');
  assert.strictEqual(languageOf('https://www.softe.ai/en/chat', 'vi-VN', SITE), 'en');
  assert.strictEqual(languageOf(SITE, 'en-US', SITE), 'vi', 'trang chủ softe.ai là bản tiếng Việt, dù máy tiếng Anh');
  assert.strictEqual(languageOf(`${SITE}/code`, 'en-US', SITE), 'vi');
  assert.strictEqual(languageOf(`${SITE}/english`, 'en-US', SITE), 'vi', '"/english" không phải "/en"');
  assert.strictEqual(languageOf(`${SITE}/entry`, 'en-US', SITE), 'vi');
});

test('trang riêng của app, địa chỉ lạ và lúc chưa biết gì: theo ngôn ngữ của máy (cùng luật với màn chờ)', () => {
  for (const url of ['', undefined, null, 5, 'file:///app/src/pages/splash.html', 'https://evil.example/en/x', 'not a url', 'https://softe.ai.evil.example/en']) {
    assert.strictEqual(languageOf(url, 'vi-VN', SITE), 'vi', String(url));
    assert.strictEqual(languageOf(url, 'en-US', SITE), 'en', String(url));
  }
  assert.strictEqual(languageOf('', 'vi', SITE), 'vi');
  assert.strictEqual(languageOf('', 'fr-FR', SITE), 'en', 'ngôn ngữ lạ về tiếng Anh');
  assert.strictEqual(languageOf('', undefined, SITE), 'en');
});

test('bộ chữ: vi là tiếng Việt, mọi thứ khác là tiếng Anh', () => {
  assert.strictEqual(textsFor('vi'), TEXTS.vi);
  assert.strictEqual(textsFor('en'), TEXTS.en);
  assert.strictEqual(textsFor('fr'), TEXTS.en);
  assert.strictEqual(textsFor(undefined), TEXTS.en);
});
