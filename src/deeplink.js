'use strict';
// Đường dẫn softe:// và menu "Đi tới": phần thuần (không cần Electron; test/deeplink.test.js). main.js chỉ nối dây.
// Một trang web (trang nối GitHub của Softe Code mở trong trình duyệt của máy), lối tắt của Dock / danh sách nhảy, hay người dùng gõ tay
// đều có thể gửi đường dẫn softe:// tới app, nên đường dẫn là dữ liệu KHÔNG đáng tin: chỉ nhận đúng ba dạng dưới đây, và địa chỉ mở ra trong cửa sổ
// luôn được dựng lại từ địa chỉ softe.ai của app (config.js), không bao giờ lấy từ đường dẫn.
//   softe://code                     -> <softe.ai>/code
//   softe://code/<mã phiên>          -> <softe.ai>/code/<mã phiên>            (mã phiên: UUID chữ thường)
//   softe://code/github?code=&state= -> <softe.ai>/code/github/callback?...   (kết quả đăng nhập GitHub; xem softe-be docs/studio-dev-code.md mục 3)
const { allowedHost } = require('./config');

const SCHEME = 'softe';
const MAX_LENGTH = 2048;
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Phần GitHub gửi về mà trang nối GitHub cần, và độ dài tối đa: đúng như softe-fe src/lib/code-link.ts::FOR_APP / appReturnUrl.
const GITHUB_PARAMS = Object.freeze([['code', 100], ['state', 400], ['installation_id', 20], ['setup_action', 20], ['error', 60], ['error_description', 200]]);
// Menu "Đi tới" (và lối tắt "Mở Softe Code"). Phím tắt Cmd/Ctrl + 1, 2, 3: web không dùng (Softe Code dùng Cmd/Ctrl + K cho bảng lệnh),
// Mac không dành riêng (Cmd + Shift + 3/4/5 là chụp màn hình), không đụng phím của menu Sửa / Xem / Cửa sổ.
const GO_TO = Object.freeze([
  Object.freeze({ label: 'Softe Code', path: '/code', accelerator: 'CmdOrCtrl+1' }),
  Object.freeze({ label: 'Trò chuyện', path: '/chat', accelerator: 'CmdOrCtrl+2' }),
  Object.freeze({ label: 'Tổng quan', path: '/dashboard', accelerator: 'CmdOrCtrl+3' }),
]);
const CODE_LINK = `${SCHEME}://code`;

// Gốc của softe.ai: https (hoặc http chỉ với máy của chính lập trình viên khi chạy từ mã nguồn). Không đúng thì null: không mở gì.
function siteOrigin(site) {
  let b;
  try { b = new URL(site); } catch { return null; }
  if (b.username || b.password) return null;
  if (b.protocol === 'https:') return b.origin;
  if (b.protocol === 'http:' && (b.hostname === 'localhost' || b.hostname === '127.0.0.1')) return b.origin;
  return null;
}

// Một trang của softe.ai (đường dẫn cố định của app, như "/code").
function pageUrl(pathname, site) {
  const origin = siteOrigin(site);
  if (!origin || typeof pathname !== 'string' || !/^\/[a-z0-9/-]*$/.test(pathname)) return null;
  return new URL(pathname, origin).toString();
}

// Địa chỉ softe.ai mở cho đường dẫn `raw`, hoặc null khi đường dẫn không đúng một trong ba dạng (mọi thứ lạ: tên máy khác, chữ hoa,
// "..", ký tự mã hóa trong phần đường dẫn, khoảng trắng, chữ ngoài ASCII, cổng, tên người dùng, quá dài...). Tham số lạ của dạng GitHub bị bỏ;
// một tham số GitHub sai (quá dài, ký tự lạ, lặp lại) thì cả đường dẫn bị bỏ, như appReturnUrl của web.
function parseDeepLink(raw, site) {
  if (typeof raw !== 'string' || raw.length > MAX_LENGTH) return null;
  if (!/^softe:\/\/code(?=$|[/?#])/.test(raw)) return null;        // đúng chữ thường, đúng "code" (không softe://CODE, softe://code.x, softe://u@code, softe://code:80)
  if (!/^[\x21-\x7e]+$/.test(raw)) return null;                     // chỉ ký tự ASCII in được: không khoảng trắng, không ký tự điều khiển, không chữ lạ
  const route = raw.split(/[?#]/, 1)[0];
  if (/[\\%.]/.test(route)) return null;                           // phần đường dẫn không có ".", "\" hay ký tự mã hóa (%2e, %2f...): ba dạng đúng không có chúng
  const origin = siteOrigin(site);
  if (!origin) return null;
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== `${SCHEME}:` || u.host !== 'code' || u.username || u.password || u.port) return null;
  const p = u.pathname;
  if (p === '' || p === '/') return new URL('/code', origin).toString();
  const session = /^\/([^/]+)\/?$/.exec(p);
  if (session && SESSION_ID.test(session[1])) return new URL(`/code/${session[1]}`, origin).toString();
  if (p !== '/github' && p !== '/github/') return null;
  const from = u.searchParams;
  if (!from.get('state')) return null;
  const out = new URL('/code/github/callback', origin);
  for (const [name, max] of GITHUB_PARAMS) {
    const all = from.getAll(name);
    if (all.length > 1) return null;                                // hai giá trị: không đoán cái nào đúng
    const v = all[0];
    if (v === undefined || v === '') continue;
    if (v.length > max || !/^[\x20-\x7e]+$/.test(v) || (name !== 'error_description' && /\s/.test(v))) return null;
    if (name === 'installation_id' && !/^\d+$/.test(v)) return null;
    out.searchParams.set(name, v);
  }
  return out.toString();
}

// Đường dẫn softe:// trong dòng lệnh mở app (Windows / Linux: lần mở đầu, hoặc lần mở thứ hai chuyển cho app đang chạy). Đọc từ cuối:
// Windows để đường dẫn ở cuối. Trả địa chỉ softe.ai (đã kiểm như parseDeepLink) hoặc null.
function fromArgv(argv, site) {
  if (!Array.isArray(argv)) return null;
  for (let i = argv.length - 1; i >= 0; i--) {
    const a = argv[i];
    if (typeof a === 'string' && a.startsWith(`${SCHEME}://`)) {
      const target = parseDeepLink(a, site);
      if (target) return target;
    }
  }
  return null;
}

// Giữ ngôn ngữ người dùng đang xem: cửa sổ đang ở một trang tiếng Anh của softe.ai (/en/...) thì mở bản tiếng Anh của trang đích.
function withLanguage(target, currentUrl, site) {
  if (typeof target !== 'string' || !allowedHost(target, site)) return null;
  if (typeof currentUrl !== 'string' || !allowedHost(currentUrl, site)) return target;
  const now = new URL(currentUrl).pathname;
  if (now !== '/en' && !now.startsWith('/en/')) return target;
  const t = new URL(target);
  if (t.pathname === '/en' || t.pathname.startsWith('/en/')) return target;
  t.pathname = `/en${t.pathname === '/' ? '' : t.pathname}`;
  return t.toString();
}

// Đối số của mục "Mở Softe Code" trong danh sách nhảy của Windows: app chạy từ mã nguồn (electron .) cần đường dẫn thư mục app trước.
function jumpArguments(defaultApp, appPath) {
  if (defaultApp && typeof appPath === 'string' && appPath && !/["\r\n]/.test(appPath)) return `"${appPath}" ${CODE_LINK}`;
  return CODE_LINK;
}

// Có mở trang `page` vì một đường dẫn không: không khi cửa sổ đang hiện đúng trang đó, và không khi đường dẫn trước mới tới chưa quá LINK_GAP_MS
// (trừ khi trang trước đó còn chưa mở được: lần đầu luôn mở). `last`: { page, at } của lần mở trước vì đường dẫn.
const LINK_GAP_MS = 1500;
function shouldOpen(page, shown, last, now) {
  if (typeof page !== 'string' || !page) return false;
  if (typeof shown === 'string' && shown === page) return false;
  if (last && typeof last.at === 'number' && last.page && now - last.at < LINK_GAP_MS) return false;
  return true;
}

module.exports = { SCHEME, MAX_LENGTH, GITHUB_PARAMS, GO_TO, CODE_LINK, LINK_GAP_MS, siteOrigin, pageUrl, parseDeepLink, fromArgv, withLanguage, jumpArguments, shouldOpen };
