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

module.exports = { resolve, allowedHost, externalOk, PROD_SITE, PROD_API };
