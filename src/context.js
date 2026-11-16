'use strict';
// Menu chuột phải của cửa sổ web, như trình duyệt: Sao chép / Dán trong ô nhập, sao chép chữ đã chọn, mở và sao chép link. Phần thuần (không cần Electron;
// test/context.test.js); main.js chỉ nối dây (sự kiện context-menu của webContents). Chỉ dùng thông tin của lần bấm (`params` do Electron đưa), không đọc nội dung trang.
// Chữ Hoàn tác / Cắt / Sao chép / Dán / Chọn tất cả là vai trò (role) của Electron, tự dịch theo máy. Link chỉ mở được khi config.externalOk cho phép
// (http, https, mailto, tel): javascript:, blob:, file: và mọi kiểu khác không có mục nào.
const { externalOk } = require('./config');

function mailAddress(url) {
  const raw = url.slice('mailto:'.length).split('?')[0];
  try { return decodeURIComponent(raw); } catch { return raw; }
}

// Các mục của menu cho một lần bấm chuột phải (mảng rỗng: không hiện menu). `t`: bộ chữ của texts.js; `h`: { open(url), copy(text) }.
function contextTemplate(params, t, h) {
  const p = params && typeof params === 'object' ? params : {};
  const groups = [];

  const link = typeof p.linkURL === 'string' ? p.linkURL : '';
  if (link && externalOk(link)) {
    if (/^mailto:/i.test(link)) {
      groups.push([{ label: t.openMail, click: () => h.open(link) }, { label: t.copyMail, click: () => h.copy(mailAddress(link)) }]);
    } else {
      groups.push([{ label: t.openLink, click: () => h.open(link) }, { label: t.copyLink, click: () => h.copy(link) }]);
    }
  }

  if (p.isEditable === true) {
    groups.push([{ role: 'undo' }, { role: 'redo' }], [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }]);
  } else if (typeof p.selectionText === 'string' && p.selectionText.trim() !== '') {
    groups.push([{ role: 'copy' }]);
  }

  const out = [];
  for (const g of groups) {
    if (out.length) out.push({ type: 'separator' });
    out.push(...g);
  }
  return out;
}

module.exports = { contextTemplate, mailAddress };
