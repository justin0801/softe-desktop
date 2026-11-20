'use strict';
// Menu chuột phải (src/context.js): phần thuần, không cần Electron.
const test = require('node:test');
const assert = require('node:assert');
const { contextTemplate, mailAddress } = require('../src/context');
const { TEXTS } = require('../src/texts');

const kinds = (items) => items.map((i) => i.role || i.type || i.label);
const make = (params, t = TEXTS.vi) => {
  const log = [];
  const items = contextTemplate(params, t, { open: (u) => log.push(['open', u]), copy: (s) => log.push(['copy', s]) });
  return { items, log };
};

test('ô nhập: Hoàn tác, Làm lại, rồi Cắt, Sao chép, Dán, Chọn tất cả (chữ do Electron dịch theo máy)', () => {
  assert.deepStrictEqual(kinds(make({ isEditable: true, selectionText: '' }).items), ['undo', 'redo', 'separator', 'cut', 'copy', 'paste', 'selectAll']);
  assert.deepStrictEqual(kinds(make({ isEditable: true, selectionText: 'đã chọn' }).items), ['undo', 'redo', 'separator', 'cut', 'copy', 'paste', 'selectAll'], 'ô nhập thì luôn đủ bộ');
});

test('chữ đã chọn ngoài ô nhập: chỉ Sao chép; chỗ trống hay chỉ dấu cách: không có menu', () => {
  assert.deepStrictEqual(kinds(make({ isEditable: false, selectionText: 'xin chào' }).items), ['copy']);
  assert.deepStrictEqual(make({ isEditable: false, selectionText: '' }).items, []);
  assert.deepStrictEqual(make({ isEditable: false, selectionText: ' \n\t ' }).items, []);
  assert.deepStrictEqual(make({}).items, []);
});

test('link web: mở bằng trình duyệt của máy và sao chép địa chỉ, đúng chữ của ngôn ngữ', () => {
  const vi = make({ linkURL: 'https://example.com/a?x=1' });
  assert.deepStrictEqual(kinds(vi.items), ['Mở liên kết trong trình duyệt', 'Sao chép địa chỉ liên kết']);
  vi.items[0].click(); vi.items[1].click();
  assert.deepStrictEqual(vi.log, [['open', 'https://example.com/a?x=1'], ['copy', 'https://example.com/a?x=1']]);
  assert.deepStrictEqual(kinds(make({ linkURL: 'https://example.com/b' }, TEXTS.en).items), ['Open link in browser', 'Copy link address']);
});

test('link email: soạn thư và sao chép đúng địa chỉ email (bỏ tham số, giải mã %40)', () => {
  const r = make({ linkURL: 'mailto:support%40softe.ai?subject=Hi' });
  assert.deepStrictEqual(kinds(r.items), ['Soạn email', 'Sao chép địa chỉ email']);
  r.items[0].click(); r.items[1].click();
  assert.deepStrictEqual(r.log, [['open', 'mailto:support%40softe.ai?subject=Hi'], ['copy', 'support@softe.ai']]);
  assert.strictEqual(mailAddress('mailto:a@b.c'), 'a@b.c');
  assert.strictEqual(mailAddress('mailto:%E0%A4%A'), '%E0%A4%A', 'mã hỏng: giữ nguyên, không ném lỗi');
});

test('link kiểu lạ không có mục nào; link cộng chữ đã chọn: nhóm link rồi nhóm Sao chép, có đường kẻ giữa', () => {
  for (const bad of ['javascript:alert(1)', 'blob:https://softe.ai/x', 'file:///etc/passwd', 'ms-msdt:/id x', 'mailto:a@b.c?attachment=x', '']) assert.deepStrictEqual(make({ linkURL: bad }).items, [], bad);
  assert.deepStrictEqual(kinds(make({ linkURL: 'https://example.com', selectionText: 'a' }).items), ['Mở liên kết trong trình duyệt', 'Sao chép địa chỉ liên kết', 'separator', 'copy']);
  assert.deepStrictEqual(kinds(make({ linkURL: 'https://example.com', isEditable: true }).items), ['Mở liên kết trong trình duyệt', 'Sao chép địa chỉ liên kết', 'separator', 'undo', 'redo', 'separator', 'cut', 'copy', 'paste', 'selectAll']);
});

test('tham số lạ không làm hỏng: không phải đối tượng, kiểu sai', () => {
  for (const p of [undefined, null, 5, 'x', [], { linkURL: 5, selectionText: 5, isEditable: 'yes' }]) assert.deepStrictEqual(make(p).items, [], JSON.stringify(p));
});
