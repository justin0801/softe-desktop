'use strict';
// Nhận link softe:// từ trình duyệt của máy (web: softe-fe src/lib/code-link.ts, src/lib/desktop-sign-in.ts). Hàm thuần, test không cần Electron.
// Chỉ nhận ĐÚNG ba dạng, đúng các tham số và giới hạn như web gửi; mọi thứ khác bỏ đi. Kết quả là một địa chỉ softe.ai để mở TRONG cửa sổ app
// (nơi người dùng đã đăng nhập và giữ bí mật của lần đăng nhập). Không bao giờ mở địa chỉ khác. Web kiểm tra chéo hàm này (softe-fe tools/code_check/desktop_signin.mjs).
//   softe://code/github?code=&state=[&installation_id=&setup_action=]  hoặc  ?error=&error_description=&state=   -> /code/github/callback?...
//   softe://welcome/persona?social=<mã một lần>                         -> /welcome/persona?social=...
//   softe://welcome?error=access_denied|server_error[&error_description=<lý_do>] -> /welcome?error=...

const CODE = /^[A-Za-z0-9_-]{20,100}$/;
const ERRORS = ['access_denied', 'server_error'];
const REASON = /^[a-z_]{1,40}$/;
const GITHUB_PIECES = [['code', 100], ['state', 400], ['installation_id', 20], ['setup_action', 20], ['error', 60], ['error_description', 200]];

// Trả về địa chỉ đầy đủ `${site}/...` hoặc null. `lang`: 'en' thì dùng trang tiếng Anh (/en/...), đoán theo trang đang mở trong cửa sổ.
function parseDeepLink(raw, site, lang = 'vi') {
  if (typeof site !== 'string' || typeof raw !== 'string' || raw.length > 2000 || !/^[\x21-\x7e]+$/.test(raw)) return null;
  const q = raw.indexOf('?');
  const head = q < 0 ? raw : raw.slice(0, q);
  if (/[\\%.@]/.test(head)) return null;
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'softe:' || u.username || u.password || u.port || u.hash) return null;
  const prefix = site.replace(/\/$/, '') + (lang === 'en' ? '/en' : '');
  const from = u.searchParams;
  const path = u.pathname.replace(/\/+$/, '');

  if (u.hostname === 'code' && path === '/github') {
    if (!from.get('state')) return null;
    const to = new URLSearchParams();
    for (const [name, max] of GITHUB_PIECES) {
      const v = from.get(name);
      if (v === null || v === '') continue;
      if (v.length > max || !/^[\x20-\x7e]+$/.test(v) || (name !== 'error_description' && /\s/.test(v))) return null;
      to.set(name, v);
    }
    return `${prefix}/code/github/callback?${to.toString()}`;
  }

  if (u.hostname === 'welcome' && path === '/persona') {
    const codes = from.getAll('social');
    if (codes.length !== 1 || !CODE.test(codes[0]) || [...from.keys()].some((k) => k !== 'social')) return null;
    return `${prefix}/welcome/persona?social=${codes[0]}`;
  }

  if (u.hostname === 'welcome' && path === '') {
    const errors = from.getAll('error'), whys = from.getAll('error_description');
    if (errors.length !== 1 || !ERRORS.includes(errors[0]) || whys.length > 1) return null;
    if ([...from.keys()].some((k) => k !== 'error' && k !== 'error_description')) return null;
    if (whys.length === 1 && !REASON.test(whys[0])) return null;
    const to = new URLSearchParams({ error: errors[0] });
    if (whys.length === 1) to.set('error_description', whys[0]);
    return `${prefix}/welcome?${to.toString()}`;
  }
  return null;
}

// Tìm link softe:// trong tham số dòng lệnh (Windows và lần mở đầu).
function findLink(argv) {
  return (argv || []).find((a) => typeof a === 'string' && /^softe:\/\//i.test(a)) || null;
}

// Trang đang mở là tiếng Anh?
function langOf(currentUrl) {
  try { return /^\/en(\/|$)/.test(new URL(currentUrl).pathname) ? 'en' : 'vi'; } catch { return 'vi'; }
}

module.exports = { parseDeepLink, findLink, langOf };
