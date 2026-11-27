'use strict';
// Địa chỉ cố định. Chỉ khi chạy từ mã nguồn (chưa đóng gói) mới cho đổi bằng biến môi trường, để thử trên máy chủ staging.
const PROD_SITE = 'https://softe.ai';
const PROD_API = 'https://api.softe.ai/v1';

function resolve(packaged, env = process.env) {
  if (packaged) return { site: PROD_SITE, api: PROD_API };
  return { site: env.SOFTE_URL || PROD_SITE, api: env.SOFTE_API || PROD_API };
}

// Chỉ những trang này được mở TRONG cửa sổ app. Mọi địa chỉ khác mở bằng trình duyệt của máy.
function allowedHost(url, site) {
  let u, base;
  try { u = new URL(url); base = new URL(site); } catch { return false; }
  if (u.protocol !== base.protocol || u.username || u.password) return false;
  const root = base.hostname.replace(/^www\./, '');
  return u.hostname === root || u.hostname === `www.${root}`;
}

// Link ra ngoài mở bằng ứng dụng của máy: chỉ web (http, https), email (mailto) và điện thoại (tel). Kiểu khác (file:, javascript:, ms-msdt:, một
// ứng dụng cài sẵn trên máy...) không bao giờ được mở từ một trang web. mailto chỉ nhận người nhận và bốn tham số thường dùng: không đính kèm tệp.
const EXTERNAL_PROTOCOLS = Object.freeze(['http:', 'https:', 'mailto:', 'tel:']);
const MAILTO_PARAMS = Object.freeze(['subject', 'body', 'cc', 'bcc']);
function externalOk(url) {
  if (typeof url !== 'string' || url.length === 0 || url.length > 2048 || /[\u0000-\u0020\u007f]/.test(url)) return false;
  let u;
  try { u = new URL(url); } catch { return false; }
  if (!EXTERNAL_PROTOCOLS.includes(u.protocol)) return false;
  if (u.protocol === 'mailto:') {
    if (u.username || u.password || u.hash) return false;
    for (const key of u.searchParams.keys()) if (!MAILTO_PARAMS.includes(key.toLowerCase())) return false;
    // Người nhận: địa chỉ email thật, không phải đường dẫn tệp hay tên có khung (`C:\x`, `a:b@c`, `<x>`, `"x"`): dấu : \ < > " không nằm trong địa chỉ chưa đóng khung.
    let to;
    try { to = decodeURIComponent(u.pathname); } catch { return false; }
    if (/[:\\<>"\u0000-\u001f\u007f]/.test(to)) return false;
  }
  return true;
}

// Quyền web được cấp, chỉ cho softe.ai: CHỈ MICRO (nói chuyện, thu giọng), sao chép (nút "Sao chép" của web), toàn màn hình (xem trước của trình dựng phim).
// Quyền 'media' của Electron gồm cả micro và hình: chỉ cấp khi yêu cầu chỉ có âm thanh. Mọi quyền khác từ chối (không hình, không vị trí, không thông báo, không đọc clipboard).
const GRANTED = new Set(['media', 'clipboard-sanitized-write', 'fullscreen']);

// details của lời xin quyền có `mediaTypes` (mảng); details của lần kiểm quyền có `mediaType` ('audio' | 'video' | 'unknown').
// Lời xin: phải là mảng không rỗng và chỉ toàn 'audio' (thiếu hay rỗng thì từ chối). Lần kiểm chỉ báo trạng thái, không cấp quyền thật
// (cấp thật đi qua lời xin ở trên), nên 'unknown' (như liệt kê thiết bị) được trả lời như micro; 'video' và mọi giá trị lạ thì từ chối.
function allowedMedia(details) {
  const d = details || {};
  if (Array.isArray(d.mediaTypes)) return d.mediaTypes.length > 0 && d.mediaTypes.every((t) => t === 'audio');
  if (typeof d.mediaType === 'string') return d.mediaType === 'audio' || d.mediaType === 'unknown';
  return false;
}

function allowedPermission(permission, url, site, details) {
  if (!GRANTED.has(permission) || !allowedHost(url || '', site)) return false;
  return permission === 'media' ? allowedMedia(details) : true;
}

module.exports = { resolve, allowedHost, allowedPermission, allowedMedia, externalOk, PROD_SITE, PROD_API };
