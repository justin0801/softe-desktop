'use strict';
// Quyền "ghi vào một thư mục" cho trang softe.ai: File System Access API, `showDirectoryPicker` (Sản xuất film hàng loạt: "tải cả đợt về một thư mục").
// Hàm thuần để test không cần Electron; main.js đưa vào nơi lấy thông tin của máy (thư mục cá nhân, dữ liệu của app...) đúng lúc có yêu cầu.
//
// Vì sao cần: Electron không có hộp hỏi riêng cho thư mục. Người dùng chọn thư mục trong hộp thoại của hệ điều hành, rồi Electron hỏi bộ xử lý quyền
// (`setPermissionRequestHandler`, quyền 'fileSystem', hai lần: 'writable' rồi 'readable'). Từ chối thì trang nhận `AbortError` ("The user aborted a request")
// dù người dùng không hủy: đã thử với Electron 33.2.1. Lưu MỘT tệp (`showSaveFilePicker`) và chọn tệp mở (`showOpenFilePicker`, `<input type=file>`)
// không đi qua bộ xử lý này nên không cần cấp gì.
//
// Luật cứng (test giữ: test/permissions.test.js):
//  - chỉ trang softe.ai (cùng luật `allowedHost` với quyền micro);
//  - chỉ THƯ MỤC (isDirectory === true) và chỉ hai kiểu 'writable' / 'readable'; tệp lẻ, và mọi quyền 'fileSystem' khác, bị từ chối;
//  - thư mục nhạy cảm không bao giờ được cấp, dù người dùng đã chọn: gốc ổ đĩa, thư mục cá nhân (chính nó, không phải thư mục con), thư mục cha của các
//    thư mục cá nhân (Users, home, Volumes), thư mục hệ điều hành và chương trình, dữ liệu của chính app (có phiên đăng nhập), nơi app được cài,
//    thư mục ẩn ngay dưới thư mục cá nhân (.ssh, .aws, .config...), ~/Library (Mac), AppData (Windows). Đường dẫn được chuẩn hóa trước khi so (.., dấu gạch cuối,
//    hoa thường trên Windows và Mac) và cả đường dẫn thật sau khi theo liên kết tượng trưng (`where.realpath`).
const path = require('node:path');
const { allowedHost } = require('./config');

// Thư mục hệ thống (cả thư mục con cũng bị chặn). Windows lấy từ biến môi trường của máy, thiếu thì dùng mặc định.
const SYSTEM = Object.freeze({
  darwin: ['/System', '/Library', '/Applications', '/usr', '/bin', '/sbin', '/etc', '/var', '/private', '/opt', '/dev', '/cores'],
  linux: ['/etc', '/usr', '/bin', '/sbin', '/lib', '/lib32', '/lib64', '/boot', '/dev', '/proc', '/sys', '/var', '/opt', '/root', '/run'],
});
// Thư mục cha của các thư mục cá nhân: chỉ chính nó bị chặn (thư mục con là của người dùng nên được chọn).
const PARENTS = Object.freeze({ darwin: ['/Users', '/Volumes'], linux: ['/home', '/mnt', '/media'], win32: [] });
const WIN_DEFAULTS = Object.freeze({
  SystemRoot: 'C:\\Windows', ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)', ProgramW6432: 'C:\\Program Files', ProgramData: 'C:\\ProgramData',
});
const WIN_USER_DATA = Object.freeze(['APPDATA', 'LOCALAPPDATA']);

function systemFolders(platform, env = {}) {
  if (platform === 'win32') {
    const own = Object.keys(WIN_DEFAULTS).map((k) => env[k] || WIN_DEFAULTS[k]);
    return [...own, ...WIN_USER_DATA.map((k) => env[k]).filter(Boolean)];
  }
  return [...(SYSTEM[platform] || SYSTEM.linux)];
}

// `raw` (một chuỗi do Electron đưa, vẫn coi là không đáng tin) có phải thư mục được phép cấp không. `where`: { platform, env, home, userData, appDirs, realpath }.
function pathOk(raw, where = {}) {
  const platform = where.platform || process.platform;
  const P = platform === 'win32' ? path.win32 : path.posix;
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 4096 || /[\u0000-\u001f\u007f]/.test(raw) || !P.isAbsolute(raw)) return false;
  const fold = (s) => (platform === 'win32' || platform === 'darwin' ? s.toLowerCase() : s);
  const norm = (s) => {
    let n = P.normalize(s);
    const root = P.parse(n).root;
    while (n.length > root.length && /[\\/]$/.test(n)) n = n.slice(0, -1);
    return fold(n);
  };
  const absolute = (list) => (Array.isArray(list) ? list : []).filter((x) => typeof x === 'string' && x.length > 0 && P.isAbsolute(x));
  const home = absolute([where.home])[0] || null;
  const target = norm(raw);
  if (P.parse(target).root === target) return false; // gốc ổ đĩa, gốc hệ thống, gốc chia sẻ mạng
  const same = (p) => target === norm(p);
  const within = (p) => { const n = norm(p); return target === n || target.startsWith(n.endsWith(P.sep) ? n : n + P.sep); };

  const parents = [...(PARENTS[platform] || PARENTS.linux)];
  if (home) parents.push(P.dirname(home));
  if (parents.some(same)) return false;
  const blocked = [...systemFolders(platform, where.env || {}), ...absolute([where.userData]), ...absolute(where.appDirs)];
  if (platform === 'darwin' && home) blocked.push(P.join(home, 'Library'));
  if (blocked.some(within)) return false;
  if (home) {
    if (same(home)) return false;
    // thư mục ẩn ngay dưới thư mục cá nhân: khóa, khóa đăng nhập, cấu hình công cụ (.ssh, .aws, .gnupg, .config...)
    const rel = P.relative(norm(home), target);
    const first = rel.split(P.sep)[0];
    if (rel && first !== '..' && first.startsWith('.') && !P.isAbsolute(rel)) return false;
  }
  return true;
}

// Quyền 'fileSystem' mà Electron hỏi sau khi người dùng chọn thư mục: có cấp không. `details` là thông tin Electron đưa (requestingUrl, isDirectory, fileAccessType, filePath).
function folderAllowed(details, site, where = {}) {
  if (!details || typeof details !== 'object') return false;
  if (!allowedHost(details.requestingUrl || '', site)) return false;
  if (details.isDirectory !== true) return false;
  if (details.fileAccessType !== 'writable' && details.fileAccessType !== 'readable') return false;
  const raw = details.filePath;
  if (!pathOk(raw, where)) return false;
  // Đường dẫn thật sau khi theo liên kết tượng trưng cũng phải qua luật (một liên kết tên vô hại trỏ vào thư mục hệ thống). Không đọc được thì giữ đường dẫn đã kiểm.
  if (typeof where.realpath === 'function') {
    let real = null;
    try { real = where.realpath(raw); } catch { real = null; }
    if (real !== null && real !== undefined && !pathOk(real, where)) return false;
  }
  return true;
}

module.exports = { folderAllowed, pathOk, systemFolders };
