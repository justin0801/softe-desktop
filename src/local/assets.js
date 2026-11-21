'use strict';
// Những tệp mà cửa sổ ẩn được nạp, qua địa chỉ riêng softe-local://app/<tệp>. Chỉ danh sách này, không đọc đâu khác; tệp thư viện bên thứ ba
// phải khớp mã băm đã khóa trong VENDOR.json (nạp mỗi lần phục vụ: đổi một byte là từ chối).
const crypto = require('node:crypto');
const path = require('node:path');

const SCHEME = 'softe-local';
const HOST = 'app';
const SERVED = Object.freeze({
  'worker.html': 'text/html; charset=utf-8',
  'worker-page.mjs': 'text/javascript; charset=utf-8',
  'sanitize.js': 'text/javascript; charset=utf-8',
  'limits.js': 'text/javascript; charset=utf-8',
  'pdf-text.js': 'text/javascript; charset=utf-8',
  'vendor/pdfjs/pdf.min.mjs': 'text/javascript; charset=utf-8',
  'vendor/pdfjs/pdf.worker.min.mjs': 'text/javascript; charset=utf-8',
  // OCR trên máy (tesseract.js, chạy trong cửa sổ ẩn): thư viện, lõi WASM nhúng sẵn trong .js, và dữ liệu ngôn ngữ (tiếng Việt, tiếng Anh).
  'vendor/tesseract/tesseract.esm.min.js': 'text/javascript; charset=utf-8',
  'vendor/tesseract/worker.min.js': 'text/javascript; charset=utf-8',
  'vendor/tesseract/tesseract-core-simd-lstm.wasm.js': 'text/javascript; charset=utf-8',
  'vendor/tesseract/lang/vie.traineddata.gz': 'application/gzip',
  'vendor/tesseract/lang/eng.traineddata.gz': 'application/gzip',
});
// Mọi tệp dưới vendor/ là của bên thứ ba và phải khớp mã băm khóa trong VENDOR.json của thư mục con của nó (khóa: đường dẫn tính từ thư mục con).
const VENDOR_DIR = 'vendor/';
const VENDOR_PARTS = ['pdfjs', 'tesseract'];
// Không tải gì ra ngoài, không mã nội tuyến, không ảnh, không kiểu dáng. `connect-src 'self' data: blob:` và `img-src data: blob:` chỉ để OCR nạp dữ liệu ngôn ngữ từ chính địa chỉ riêng, nạp lõi WASM nhúng trong tệp và giải mã ảnh trong PDF (đều là dữ liệu cục bộ); ra mạng thì
// phiên của cửa sổ ẩn hủy mọi yêu cầu ngoài softe-local://app/ (worker-host.js), nên 'self' không mở thêm đường nào.
const CSP = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self' data: blob:; style-src 'none'; img-src data: blob:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

// Địa chỉ -> tên tệp trong danh sách, hoặc null (sai giao thức, sai máy, có `..`, có mã hóa lạ, ngoài danh sách).
function assetOf(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== `${SCHEME}:` || u.hostname !== HOST || u.username || u.password || u.port || u.search || u.hash) return null;
  let rel;
  try { rel = decodeURIComponent(u.pathname.replace(/^\/+/, '')); } catch { return null; }
  return Object.hasOwn(SERVED, rel) ? rel : null;
}

// Đọc tệp để phục vụ. Thư viện bên thứ ba phải khớp mã băm; trả { ok, status, type, body } (không ném lỗi).
function loadAsset(rel, { fs, dir, hashes }) {
  if (!Object.hasOwn(SERVED, rel)) return { ok: false, status: 404 };
  try {
    const body = fs.readFileSync(path.join(dir, rel));
    if (rel.startsWith(VENDOR_DIR)) {
      const want = hashes && hashes[rel.slice(VENDOR_DIR.length)]; // 'pdfjs/pdf.min.mjs', 'tesseract/lang/vie.traineddata.gz'...
      if (!want || crypto.createHash('sha256').update(body).digest('hex') !== want) return { ok: false, status: 403 };
    }
    return { ok: true, status: 200, type: SERVED[rel], body };
  } catch { return { ok: false, status: 404 }; }
}

function readHashes(fs, dir) {
  const all = {};
  for (const part of VENDOR_PARTS) {
    try {
      const files = JSON.parse(fs.readFileSync(path.join(dir, VENDOR_DIR, part, 'VENDOR.json'), 'utf8')).files || {};
      for (const [name, sha] of Object.entries(files)) all[`${part}/${name}`] = sha;
    } catch { /* thiếu sổ: các tệp của phần đó bị từ chối (không có mã băm thì không phục vụ) */ }
  }
  return all;
}

module.exports = { SCHEME, HOST, SERVED, CSP, VENDOR_PARTS, assetOf, loadAsset, readHashes };
