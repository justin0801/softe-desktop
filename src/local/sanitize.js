'use strict';
// (Tệp dùng được ở main (CommonJS) và trong cửa sổ ẩn (script thường): bọc trong hàm để không đụng tên toàn cục.)
(function () {
// Làm sạch chữ do phần đọc tệp trả ra TRƯỚC khi qua cổng ra trang web. Chữ từ tệp là dữ liệu không đáng tin: bỏ ký tự điều khiển và
// ký tự vô hình / đổi chiều chữ (dùng để giấu chỉ thị cho AI), rồi cắt theo trần. Máy chủ làm lại bước này (đây là hàng rào phụ).
const MAX_TEXT = 1_500_000; // đúng MAX_TEXT của softe-be/app/worker/tasks_heavy.py

// Điều khiển (trừ xuống dòng và tab), ký tự rộng 0 / đổi chiều / định dạng ẩn, ký tự thẻ vô hình U+E0000..E007F, ký tự thay thế lẻ.
const BAD = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F­؜᠎​-‏‪-‮⁠-⁯﻿￹-￻]|[\u{E0000}-\u{E007F}]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/gu;

function cleanText(input, max = MAX_TEXT) {
  if (typeof input !== 'string') return { text: '', truncated: false };
  let t = input.replace(/\r\n?/g, '\n').replace(BAD, '');
  t = t.replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim();
  let truncated = false;
  if (t.length > max) {
    truncated = true;
    t = t.slice(0, max);
    const last = t.charCodeAt(t.length - 1);
    if (last >= 0xD800 && last <= 0xDBFF) t = t.slice(0, -1); // không cắt giữa một cặp thay thế
  }
  return { text: t, truncated };
}

const api = { cleanText, MAX_TEXT, BAD };
if (typeof module === 'object' && module.exports) module.exports = api; else (globalThis.softeLocalLib = globalThis.softeLocalLib || {})['sanitize'] = api;
}());
