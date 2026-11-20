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
});
const VENDOR_DIR = 'vendor/pdfjs/';
// Không tải gì ra ngoài, không mã nội tuyến, không ảnh, không kiểu dáng.
const CSP = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'none'; style-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

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
      const want = hashes && hashes[rel.slice(VENDOR_DIR.length)];
      if (!want || crypto.createHash('sha256').update(body).digest('hex') !== want) return { ok: false, status: 403 };
    }
    return { ok: true, status: 200, type: SERVED[rel], body };
  } catch { return { ok: false, status: 404 }; }
}

function readHashes(fs, dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, VENDOR_DIR, 'VENDOR.json'), 'utf8')).files || {}; } catch { return {}; }
}

module.exports = { SCHEME, HOST, SERVED, CSP, assetOf, loadAsset, readHashes };
