'use strict';
// (Tệp dùng được ở main (CommonJS) và trong cửa sổ ẩn (script thường): bọc trong hàm để không đụng tên toàn cục.)
(function () {
const need = (id) => (typeof require === 'function' ? require(`./${id}`) : globalThis.softeLocalLib[id]);
// Lấy chữ từ lớp chữ của PDF bằng pdf.js (JavaScript, chạy trong cửa sổ ẩn bị nhốt, không phải ở main). `pdfjs` được đưa vào để test được ở Node.
// PDF ảnh quét (không có lớp chữ) KHÔNG đọc ở đây: trả needs_ocr để máy chủ làm (OCR trên máy là bước sau).
const { LIMITS, textLooksOk } = need('limits');
const { cleanText, MAX_TEXT } = need('sanitize');

async function extractPdfText(pdfjs, bytes, { maxPages = LIMITS.maxPages, maxChars = MAX_TEXT, deadline = Infinity, now = Date.now } = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.length === 0) return { ok: false, reason: 'unsupported' };
  if (bytes.length < 5 || String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') return { ok: false, reason: 'unsupported' };
  let doc;
  try {
    doc = await pdfjs.getDocument({
      data: bytes.slice(), // pdf.js lấy quyền sở hữu vùng nhớ
      isEvalSupported: false, enableXfa: false, disableFontFace: true, useSystemFonts: false, stopAtErrors: false,
      disableAutoFetch: true, disableStream: true, maxImageSize: 12_000_000, verbosity: 0,
    }).promise;
  } catch (e) {
    return { ok: false, reason: e && e.name === 'PasswordException' ? 'unsupported' : 'failed' };
  }
  try {
    const pages = doc.numPages;
    if (!Number.isInteger(pages) || pages < 1) return { ok: false, reason: 'failed' };
    const take = Math.min(pages, maxPages);
    const parts = []; let chars = 0;
    for (let i = 1; i <= take; i += 1) {
      if (now() > deadline) return { ok: false, reason: 'timeout' };
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let line = '';
      for (const it of content.items) {
        if (typeof it.str === 'string') line += it.str;
        if (it.hasEOL) line += '\n';
      }
      page.cleanup();
      parts.push(line); chars += line.length;
      if (chars > maxChars * 2) break; // đã quá trần: không đọc thêm
    }
    const { text, truncated } = cleanText(parts.join('\n\n'), maxChars);
    if (!textLooksOk(text, take)) return { ok: false, reason: 'needs_ocr' };
    return { ok: true, text, pages, truncated: truncated || pages > take };
  } catch {
    return { ok: false, reason: 'failed' };
  } finally {
    try { await doc.destroy(); } catch { /* bỏ qua */ }
  }
}

const api = { extractPdfText };
if (typeof module === 'object' && module.exports) module.exports = api; else (globalThis.softeLocalLib = globalThis.softeLocalLib || {})['pdf-text'] = api;
}());
