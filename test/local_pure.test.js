'use strict';
// Phần thuần của xử lý trên máy (src/local): làm sạch chữ, giới hạn, cổng, đọc PDF thật bằng pdf.js đã đưa vào repo, mã băm thư viện.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { cleanText, MAX_TEXT } = require('../src/local/sanitize');
const { LIMITS, deviceClass, estimateMs, tooSlow, textLooksOk, ocrScale } = require('../src/local/limits');
const { createGate } = require('../src/local/gate');
const { extractPdfText } = require('../src/local/pdf-text');

const SITE = 'https://softe.ai';
const GB = 1024 ** 3;

const { makePdf } = require('./helpers/make-pdf');

test('cleanText: bỏ ký tự điều khiển và vô hình, cắt đúng trần', () => {
  const dirty = 'a\u0000b​c‮d﻿e\u{E0041}f\r\nxin chào  \n\n\n\n\n\nhết';
  const { text } = cleanText(dirty);
  assert.equal(text, 'abcdef\nxin chào\n\n\nhết');
  assert.deepEqual(cleanText(5), { text: '', truncated: false });
  const big = cleanText('x'.repeat(MAX_TEXT + 10));
  assert.equal(big.text.length, MAX_TEXT); assert.equal(big.truncated, true);
  const pair = cleanText('a😀', 2); // không cắt giữa cặp thay thế
  assert.equal(pair.text, 'a'); assert.equal(pair.truncated, true);
  assert.equal(cleanText('a\uD800b').text, 'ab'); // ký tự thay thế lẻ bị bỏ
});

test('deviceClass: chỉ ok khi đủ RAM, CPU, cắm điện, máy không nóng; không biết gì là yếu', () => {
  const good = { totalMem: 16 * GB, cpus: 8, onBattery: false, thermal: 'nominal' };
  assert.equal(deviceClass(good), 'ok');
  assert.equal(deviceClass({ ...good, totalMem: 4 * GB }), 'weak');
  assert.equal(deviceClass({ ...good, cpus: 2 }), 'weak');
  assert.equal(deviceClass({ ...good, onBattery: true }), 'weak');
  assert.equal(deviceClass({ ...good, onBattery: undefined }), 'weak');
  assert.equal(deviceClass({ ...good, thermal: 'serious' }), 'weak');
  assert.equal(deviceClass({ ...good, thermal: 'critical' }), 'weak');
  assert.equal(deviceClass(), 'weak');
  assert.equal(deviceClass({ ...good, totalMem: NaN }), 'weak');
});

test('ước lượng thời gian: quá 40 giây thì không bắt đầu', () => {
  assert.equal(tooSlow(estimateMs(100)), false);
  assert.equal(tooSlow(estimateMs(500)), true);
  assert.equal(tooSlow(estimateMs(-1)), true);
  assert.equal(tooSlow(estimateMs(NaN)), true);
});

test('textLooksOk: rỗng, quá ít chữ, lặp một ký tự bị loại', () => {
  assert.equal(textLooksOk('', 1), false);
  assert.equal(textLooksOk('ngắn', 1), false);
  assert.equal(textLooksOk('a'.repeat(500), 1), false);
  assert.equal(textLooksOk('Đây là một đoạn văn bản tiếng Việt đủ dài và đa dạng để qua kiểm tra.', 1), true);
  assert.equal(textLooksOk('Đây là một đoạn văn bản tiếng Việt đủ dài và đa dạng để qua kiểm tra.', 400), false); // 400 trang mà ít chữ: ảnh quét
  assert.equal(textLooksOk(null, 1), false);
});

const top = (over = {}) => ({ key: 'f1', url: `${SITE}/chat`, isTop: true, ...over });

test('cổng: chỉ khung trên cùng của softe.ai, có mã đúng, một việc một lúc', () => {
  const gate = createGate({ site: SITE });
  assert.equal(gate.hello(top({ isTop: false })), null, 'khung con không được cấp mã');
  assert.equal(gate.hello(top({ url: 'https://evil.example/' })), null);
  assert.equal(gate.hello(top({ url: 'http://softe.ai/' })), null, 'khác giao thức');
  assert.equal(gate.hello(top({ url: 'https://softe.ai.evil.example/' })), null);
  assert.equal(gate.hello(top({ url: 'file:///x' })), null);
  assert.equal(gate.hello(top({ url: 'https://softe.ai:8443/' })), null, 'khác cổng');
  assert.equal(gate.hello(top({ url: 'https://softe.ai:443/chat' })) !== null, true, 'cổng mặc định viết rõ vẫn là cùng cổng');
  assert.equal(gate.hello({ ...top(), key: undefined }), null);
  const tok = gate.hello(top());
  assert.match(tok, /^[0-9a-f]{48}$/);
  assert.equal(gate.admit(top(), 'sai', { size: 10 }).reason, 'off');
  assert.equal(gate.admit(top({ isTop: false }), tok, { size: 10 }).reason, 'off');
  assert.equal(gate.admit(top({ url: 'https://evil.example/' }), tok, { size: 10 }).reason, 'off');
  assert.equal(gate.admit(top({ url: `${SITE}/other` }), tok, { size: 10 }).reason, 'off', 'đổi địa chỉ là mã hết hiệu lực');
  assert.equal(gate.admit(top(), tok, { size: 0 }).reason, 'unsupported');
  assert.equal(gate.admit(top(), tok, { size: LIMITS.maxBytes + 1 }).reason, 'too_large');
  const a = gate.admit(top(), tok, { size: 10 });
  assert.equal(a.ok, true);
  assert.equal(gate.admit(top(), tok, { size: 10 }).reason, 'busy', 'một việc một lúc');
  a.release(); a.release();
  assert.equal(gate.busy, false);
  assert.equal(gate.admit(top(), tok, { size: 10 }).ok, true);
});

test('cổng: tối đa 6 việc mỗi phút, qua phút thì được lại', () => {
  let t = 1_000_000;
  const gate = createGate({ site: SITE, now: () => t });
  const tok = gate.hello(top());
  for (let i = 0; i < LIMITS.perMinute; i += 1) { const a = gate.admit(top(), tok, { size: 5 }); assert.equal(a.ok, true); a.release(); t += 1000; }
  assert.equal(gate.admit(top(), tok, { size: 5 }).reason, 'busy');
  t += 61_000;
  assert.equal(gate.admit(top(), tok, { size: 5 }).ok, true);
});

test('cổng: quên khung thì mã hết hiệu lực', () => {
  const gate = createGate({ site: SITE });
  const tok = gate.hello(top());
  gate.forget('f1');
  assert.equal(gate.admit(top(), tok, { size: 5 }).reason, 'off');
});

test('thư viện bên thứ ba đã đưa vào repo (pdf.js, tesseract.js) khớp mã băm đã khóa, và mọi tệp vendor đều có mã băm', () => {
  const vendor = path.join(__dirname, '..', 'src', 'local', 'vendor');
  for (const part of ['pdfjs', 'tesseract']) {
    const dir = path.join(vendor, part);
    const meta = JSON.parse(fs.readFileSync(path.join(dir, 'VENDOR.json'), 'utf8'));
    assert.ok(meta.package && meta.license === 'Apache-2.0', part);
    const listed = Object.keys(meta.files).sort();
    const onDisk = [];
    (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else if (e.name !== 'VENDOR.json') onDisk.push(path.relative(dir, f).split(path.sep).join('/')); } }(dir));
    assert.deepEqual(onDisk.sort(), listed, `${part}: tệp trên đĩa và sổ mã băm phải đúng bằng nhau`);
    for (const [file, sha] of Object.entries(meta.files)) {
      assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, file))).digest('hex'), sha, `${part}/${file} bị đổi: cập nhật VENDOR.json có chủ đích`);
    }
  }
});

test('tỉ lệ vẽ trang để OCR: tối đa 2 lần, trang khổng lồ thì nhỏ lại để không vượt 12 triệu điểm ảnh', () => {
  assert.equal(ocrScale(595, 842), 2);
  const huge = ocrScale(14400, 14400);
  assert.ok(huge < 0.3 && huge >= 0.05);
  assert.ok(14400 * huge * 14400 * huge <= 12_000_000 * 1.001, 'ảnh sau khi vẽ không vượt 12 triệu điểm');
  assert.equal(ocrScale(0, 0) <= 2, true);
});

test('đọc PDF thật bằng pdf.js: lấy chữ, trang, và từ chối tệp xấu', async () => {
  // Trong cửa sổ ẩn (Chromium) các lớp này có sẵn; ở Node chỉ cần bản giả tối thiểu để thư viện nạp được (không vẽ gì, chỉ lấy chữ).
  for (const n of ['DOMMatrix', 'Path2D', 'ImageData']) if (!globalThis[n]) globalThis[n] = class { constructor() { this.a = this.d = 1; } };
  const pdfjs = await import('../src/local/vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = require('node:url').pathToFileURL(path.join(__dirname, '..', 'src', 'local', 'vendor', 'pdfjs', 'pdf.worker.min.mjs')).href;
  const long = 'Hop dong thue nha so mot hai ba bon nam sau bay tam chin';
  const ok = await extractPdfText(pdfjs, makePdf([long, `${long} trang hai`]));
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.equal(ok.pages, 2);
  assert.match(ok.text, /Hop dong thue nha/);
  assert.match(ok.text, /trang hai/);
  assert.equal(ok.truncated, false);
  assert.equal((await extractPdfText(pdfjs, new Uint8Array(0))).reason, 'unsupported');
  assert.equal((await extractPdfText(pdfjs, new Uint8Array(Buffer.from('not a pdf at all')))).reason, 'unsupported');
  assert.equal((await extractPdfText(pdfjs, 'chuỗi')).reason, 'unsupported');
  const broken = makePdf([long]).slice(0, 120); // PDF bị cắt cụt
  assert.equal((await extractPdfText(pdfjs, broken)).ok, false);
  const scan = await extractPdfText(pdfjs, makePdf(['.'])); // gần như không có chữ: coi như ảnh quét
  assert.deepEqual(scan, { ok: false, reason: 'needs_ocr' });
  const late = await extractPdfText(pdfjs, makePdf([long]), { deadline: 0, now: () => 5 });
  assert.equal(late.reason, 'timeout');
  const cut = await extractPdfText(pdfjs, makePdf([long, long, long]), { maxPages: 2 });
  assert.equal(cut.ok, true); assert.equal(cut.truncated, true); assert.equal(cut.pages, 3);
});
