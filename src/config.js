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

module.exports = { resolve, allowedHost, PROD_SITE, PROD_API };
