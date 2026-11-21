'use strict';
// (Tệp dùng được ở main (CommonJS) và trong cửa sổ ẩn (script thường): bọc trong hàm để không đụng tên toàn cục.)
(function () {
// Giới hạn cứng và quyết định "máy này đủ khỏe không" cho phần xử lý trên máy (docs/ung-dung-may-tinh-chay-cuc-bo.md, softe-be, mục 10).
// Mọi hàm thuần: không đọc máy, không Electron (test được).
const MB = 1024 * 1024;
const LIMITS = Object.freeze({
  maxBytes: 20 * MB,        // tệp lớn hơn: để máy chủ làm
  jobMs: 45_000,            // quá giờ thì hủy cửa sổ và máy chủ làm thay (phía web cũng hẹn 45 giây)
  maxPages: 500,            // như máy chủ (_pdf_text)
  maxWorkerBytes: 1_500 * MB, // bộ nhớ của cửa sổ đọc tệp: vượt là giết
  perMinute: 6,             // số việc mỗi phút
  slowMs: 40_000,           // dự kiến lâu hơn thì không bắt đầu trên máy
  perPageMs: 150,           // ước lượng ban đầu cho lớp chữ của PDF (sau này nhớ số đo thật)
  minMemBytes: 8 * 1024 * MB,
  minCpus: 4,
  ocrPages: 10,             // PDF ảnh quét dài hơn thì để máy chủ OCR (chậm hơn nhiều trên máy người dùng)
  ocrMaxPixels: 12_000_000, // như máy chủ (tasks_heavy.OCR_MAX_PIXELS)
});

// Tỉ lệ vẽ một trang để OCR: 2 lần (144 điểm / inch, như máy chủ) trừ khi ảnh quá lớn. Đúng công thức của softe-be tasks_heavy.ocr_scale.
function ocrScale(widthPt, heightPt) {
  const area = Math.max(1, Number(widthPt) * Number(heightPt));
  return Math.max(0.05, Math.min(2.0, Math.sqrt(LIMITS.ocrMaxPixels / area)));
}

const HOT = new Set(['serious', 'critical']);

// `ok` chỉ khi đủ RAM, đủ nhân CPU, đang cắm điện và máy không nóng. Không biết gì thì coi là yếu (an toàn: máy chủ làm).
function deviceClass({ totalMem, cpus, onBattery, thermal } = {}) {
  if (!Number.isFinite(totalMem) || totalMem < LIMITS.minMemBytes) return 'weak';
  if (!Number.isInteger(cpus) || cpus < LIMITS.minCpus) return 'weak';
  if (onBattery !== false) return 'weak'; // pin, hay không biết: để máy chủ làm, đỡ hao pin
  if (HOT.has(thermal)) return 'weak';
  return 'ok';
}

function estimateMs(pages, perPageMs = LIMITS.perPageMs) {
  if (!Number.isFinite(pages) || pages < 0) return Infinity;
  return Math.ceil(pages * perPageMs);
}
const tooSlow = (ms) => !(ms <= LIMITS.slowMs);

// Kiểm chất lượng chữ đọc ra: không dùng kết quả rỗng, quá ít chữ so với số trang (PDF ảnh quét), hay toàn một ký tự lặp.
function textLooksOk(text, pages) {
  if (typeof text !== 'string') return false;
  const t = text.replace(/\s+/g, '');
  if (t.length < Math.max(20, Math.min(pages || 1, 50) * 5)) return false;
  const sample = t.slice(0, 2000);
  if (new Set(sample).size < 8) return false;
  return true;
}

const api = { LIMITS, deviceClass, estimateMs, tooSlow, textLooksOk, ocrScale };
if (typeof module === 'object' && module.exports) module.exports = api; else (globalThis.softeLocalLib = globalThis.softeLocalLib || {})['limits'] = api;
}());
