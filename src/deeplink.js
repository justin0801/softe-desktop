'use strict';
// Đường dẫn softe:// và menu "Đi tới": phần thuần (không cần Electron; test/deeplink.test.js). main.js chỉ nối dây.
// Một trang web (trang nối GitHub của Softe Code, hay bước đăng nhập Google / Apple, đều mở trong trình duyệt của máy), lối tắt của Dock / danh sách nhảy, hay người
// dùng gõ tay đều có thể gửi đường dẫn softe:// tới app, nên đường dẫn là dữ liệu KHÔNG đáng tin: chỉ nhận đúng năm dạng dưới đây, và địa chỉ mở ra trong cửa sổ
// luôn được dựng lại từ địa chỉ softe.ai của app (config.js), không bao giờ lấy từ đường dẫn.
//   softe://code                     -> <softe.ai>/code
//   softe://code/<mã phiên>          -> <softe.ai>/code/<mã phiên>            (mã phiên: UUID chữ thường)
//   softe://code/github?code=&state= -> <softe.ai>/code/github/callback?...   (kết quả đăng nhập GitHub; xem softe-be docs/studio-dev-code.md mục 3)
//   softe://welcome/persona?social=<mã> -> <softe.ai>/welcome/persona?social=<mã>   (đăng nhập Google / Apple xong, từ bản 1.2.0; softe-be docs/dang-nhap-google-apple.md:
//                                       mã dùng một lần, chỉ đổi được khi có bí mật nằm trong CHÍNH cửa sổ này: mã của kẻ khác gửi tới không mở được tài khoản nào)
//   softe://welcome?error=&error_description= -> <softe.ai>/welcome?error=...&error_description=...   (đăng nhập Google / Apple không thành: trang đăng nhập nói lý do)
const { allowedHost } = require('./config');

const SCHEME = 'softe';
const MAX_LENGTH = 2048;
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// Mã đăng nhập Google / Apple dùng một lần: chữ, số, "-" và "_", dài 20 đến 100 (softe-be: ExchangeIn.code). Lý do không thành: đúng như softe-be social_login.return_url.
const SOCIAL_CODE = /^[A-Za-z0-9_-]{20,100}$/;
const WELCOME_ERRORS = Object.freeze(['access_denied', 'server_error']);
const WELCOME_REASON = /^[a-z_]{1,40}$/;
// Phần GitHub gửi về mà trang nối GitHub cần, và độ dài tối đa: đúng như softe-fe src/lib/code-link.ts::FOR_APP / appReturnUrl.
const GITHUB_PARAMS = Object.freeze([['code', 100], ['state', 400], ['installation_id', 20], ['setup_action', 20], ['error', 60], ['error_description', 200]]);
// Menu "Đi tới" (và lối tắt "Mở Softe Code"). Phím tắt Cmd/Ctrl + 1, 2, 3, 4: web không dùng (Softe Code dùng Cmd/Ctrl + K cho bảng lệnh),
// Mac không dành riêng (Cmd + Shift + 3/4/5 là chụp màn hình), không đụng phím của menu Sửa / Xem / Cửa sổ. Chữ của từng mục (`id`) ở texts.js: tiếng Việt và tiếng Anh.
const GO_TO = Object.freeze([
  Object.freeze({ id: 'code', path: '/code', accelerator: 'CmdOrCtrl+1' }),
  Object.freeze({ id: 'chat', path: '/chat', accelerator: 'CmdOrCtrl+2' }),
  Object.freeze({ id: 'dashboard', path: '/dashboard', accelerator: 'CmdOrCtrl+3' }),
  Object.freeze({ id: 'editor', path: '/studio/film/editor', accelerator: 'CmdOrCtrl+4' }),
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

// Đăng nhập Google / Apple xong (hoặc không thành): `social` là mã dùng một lần, `error` + `error_description` là lý do. Dạng nào sai (mã lạ, lặp lại, lý do lạ) thì null;
// tham số lạ bị bỏ. Chỉ mở được trang đăng nhập của softe.ai: trang ấy đổi mã lấy phiên bằng bí mật nằm trong cửa sổ này.
function parseWelcome(u, origin) {
  const p = u.pathname;
  const from = u.searchParams;
  if (p === '/persona' || p === '/persona/') {
    const all = from.getAll('social');
    if (all.length !== 1 || !SOCIAL_CODE.test(all[0])) return null;
    const out = new URL('/welcome/persona', origin);
    out.searchParams.set('social', all[0]);
    return out.toString();
  }
  if (p === '' || p === '/') {
    const error = from.getAll('error');
    const why = from.getAll('error_description');
    if (error.length !== 1 || !WELCOME_ERRORS.includes(error[0]) || why.length > 1) return null;
    if (why.length === 1 && !WELCOME_REASON.test(why[0])) return null;
    const out = new URL('/welcome', origin);
    out.searchParams.set('error', error[0]);
    if (why.length === 1) out.searchParams.set('error_description', why[0]);
    return out.toString();
  }
  return null;
}

// Địa chỉ softe.ai mở cho đường dẫn `raw`, hoặc null khi đường dẫn không đúng một trong năm dạng (mọi thứ lạ: tên máy khác, chữ hoa,
// "..", ký tự mã hóa trong phần đường dẫn, khoảng trắng, chữ ngoài ASCII, cổng, tên người dùng, quá dài...). Tham số lạ của dạng GitHub bị bỏ;
// một tham số GitHub sai (quá dài, ký tự lạ, lặp lại) thì cả đường dẫn bị bỏ, như appReturnUrl của web.
function parseDeepLink(raw, site) {
  if (typeof raw !== 'string' || raw.length > MAX_LENGTH) return null;
  if (!/^softe:\/\/(?:code|welcome)(?=$|[/?#])/.test(raw)) return null;   // đúng chữ thường, đúng "code" hay "welcome" (không softe://CODE, softe://code.x, softe://u@code, softe://code:80)
  if (!/^[\x21-\x7e]+$/.test(raw)) return null;                     // chỉ ký tự ASCII in được: không khoảng trắng, không ký tự điều khiển, không chữ lạ
  const route = raw.split(/[?#]/, 1)[0];
  if (/[\\%.]/.test(route)) return null;                           // phần đường dẫn không có ".", "\" hay ký tự mã hóa (%2e, %2f...): ba dạng đúng không có chúng
  const origin = siteOrigin(site);
  if (!origin) return null;
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== `${SCHEME}:` || (u.host !== 'code' && u.host !== 'welcome') || u.username || u.password || u.port) return null;
  if (u.host === 'welcome') return parseWelcome(u, origin);
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

module.exports = { SCHEME, MAX_LENGTH, GITHUB_PARAMS, SOCIAL_CODE, WELCOME_ERRORS, GO_TO, CODE_LINK, LINK_GAP_MS, siteOrigin, pageUrl, parseDeepLink, fromArgv, withLanguage, jumpArguments, shouldOpen };
