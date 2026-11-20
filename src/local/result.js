'use strict';
// Kết quả từ cửa sổ ẩn là DỮ LIỆU KHÔNG ĐÁNG TIN (tệp độc có thể làm trang trong cửa sổ đó nói bất cứ gì): main dựng lại kết quả công khai từ đầu,
// chỉ giữ đúng bốn trường, làm sạch chữ lần nữa, và chỉ nhận lý do lỗi trong danh sách.
const { cleanText } = require('./sanitize');

const REASONS = Object.freeze(['weak', 'off', 'timeout', 'too_large', 'unsupported', 'needs_ocr', 'busy', 'failed']);
const VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;

function normalize(raw, version) {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'failed' };
  if (raw.ok === true) {
    if (typeof raw.text !== 'string' || !VERSION.test(String(version))) return { ok: false, reason: 'failed' };
    const pages = raw.pages;
    if (!Number.isInteger(pages) || pages < 1 || pages > 100_000) return { ok: false, reason: 'failed' };
    const { text, truncated } = cleanText(raw.text);
    if (!text) return { ok: false, reason: 'needs_ocr' };
    return { ok: true, text, pages, truncated: truncated || raw.truncated === true, by: `desktop/${version}` };
  }
  return { ok: false, reason: REASONS.includes(raw.reason) ? raw.reason : 'failed' };
}

module.exports = { normalize, REASONS };
