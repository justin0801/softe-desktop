'use strict';
// Quyền ghi vào một THƯ MỤC người dùng vừa chọn (showDirectoryPicker: "tải cả đợt về một thư mục" của Sản xuất film hàng loạt): src/permissions.js,
// và đoạn nối trong src/main.js (chạy thật main.js với Electron giả: test/main-harness.js). Phần đã thử với Electron 33.2.1 thật (Linux) ghi ở CLAUDE.md.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { folderAllowed, pathOk, systemFolders } = require('../src/permissions');
const { PROD_SITE } = require('../src/config');
const { bootMain } = require('./main-harness');

const SRC = path.join(__dirname, '..', 'src');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');

const MAC = { platform: 'darwin', home: '/Users/an', userData: '/Users/an/Library/Application Support/Softe',
              appDirs: ['/Applications/Softe.app/Contents/Resources/app.asar', '/Applications/Softe.app/Contents/MacOS'], env: {} };
const WIN = { platform: 'win32', home: 'C:\\Users\\An', userData: 'C:\\Users\\An\\AppData\\Roaming\\Softe',
              appDirs: ['C:\\Users\\An\\AppData\\Local\\Programs\\Softe\\resources\\app.asar', 'C:\\Users\\An\\AppData\\Local\\Programs\\Softe'],
              env: { SystemRoot: 'C:\\Windows', ProgramFiles: 'C:\\Program Files', 'ProgramFiles(x86)': 'C:\\Program Files (x86)', ProgramData: 'C:\\ProgramData',
                     APPDATA: 'C:\\Users\\An\\AppData\\Roaming', LOCALAPPDATA: 'C:\\Users\\An\\AppData\\Local' } };
const LIN = { platform: 'linux', home: '/home/an', userData: '/home/an/.config/Softe', appDirs: ['/opt/softe/resources/app.asar', '/opt/softe'], env: {} };

const ask = (filePath, extra = {}) => ({ requestingUrl: `${PROD_SITE}/studio/film/batch`, isDirectory: true, fileAccessType: 'writable', filePath, ...extra });

test('thư mục thường người dùng tự chọn được cấp, cho cả hai kiểu Electron hỏi (writable rồi readable), ở cả Mac, Windows, Linux', () => {
  const ok = {
    mac: [MAC, ['/Users/an/Movies/Softe clips', '/Users/an/Movies/clips/', '/Users/an/Downloads', '/Users/an/Desktop/đợt 1', '/Volumes/Samsung T7/clips']],
    win: [WIN, ['C:\\Users\\An\\Videos\\clips', 'C:\\Users\\An\\Downloads', 'D:\\clips', 'E:\\Phim\\đợt 1\\', '\\\\nas\\share\\clips']],
    lin: [LIN, ['/home/an/Videos/clips', '/mnt/data/clips', '/media/an/USB/clips']],
  };
  for (const [where, list] of Object.values(ok)) {
    for (const p of list) {
      for (const type of ['writable', 'readable']) assert.strictEqual(folderAllowed(ask(p, { fileAccessType: type }), PROD_SITE, where), true, `${where.platform} ${type} ${p}`);
    }
  }
});

test('chỉ trang softe.ai (cùng luật allowedHost với micro); trang khác, địa chỉ giống, địa chỉ lạ đều bị từ chối', () => {
  const good = '/Users/an/Movies/clips';
  for (const url of [`${PROD_SITE}/`, 'https://www.softe.ai/studio/film/batch', 'https://softe.ai/en/studio/film/batch']) assert.ok(folderAllowed(ask(good, { requestingUrl: url }), PROD_SITE, MAC), url);
  for (const url of ['https://softe.ai.evil.example/', 'http://softe.ai/', 'https://a.softe.ai/', 'https://user:pw@softe.ai/', 'file:///x', 'javascript:1', '', undefined, null, 5]) {
    assert.strictEqual(folderAllowed(ask(good, { requestingUrl: url }), PROD_SITE, MAC), false, String(url));
  }
  const noUrl = ask(good); delete noUrl.requestingUrl;
  assert.strictEqual(folderAllowed(noUrl, PROD_SITE, MAC), false);
});

test('chỉ THƯ MỤC và chỉ writable / readable: tệp lẻ, kiểu khác, thiếu thông tin đều bị từ chối', () => {
  const p = '/Users/an/Movies/clips';
  assert.strictEqual(folderAllowed(ask(p, { isDirectory: false }), PROD_SITE, MAC), false, 'tệp lẻ');
  assert.strictEqual(folderAllowed(ask(p, { isDirectory: undefined }), PROD_SITE, MAC), false);
  assert.strictEqual(folderAllowed(ask(p, { isDirectory: 'true' }), PROD_SITE, MAC), false, 'chuỗi không phải true');
  for (const t of ['readwrite', 'write', 'all', '', undefined, null, 1]) assert.strictEqual(folderAllowed(ask(p, { fileAccessType: t }), PROD_SITE, MAC), false, String(t));
  for (const bad of [undefined, null, 'x', 5, [], () => {}]) assert.strictEqual(folderAllowed(bad, PROD_SITE, MAC), false);
  for (const fp of [undefined, null, '', 5, {}, [], 'relative/path', './x', '../x', 'C:foo', '~/clips', 'x'.repeat(5000), '/Users/an/a\u0000b', '/Users/an/a\nb', '/Users/an/\u007f']) {
    assert.strictEqual(folderAllowed(ask(fp), PROD_SITE, MAC), false, JSON.stringify(fp));
  }
});

test('Mac: gốc, thư mục cá nhân, thư mục cha, hệ thống, chương trình, dữ liệu của app, Library, thư mục ẩn: không bao giờ cấp', () => {
  const no = ['/', '/Users', '/Users/an', '/Users/an/', '/Volumes', '/System', '/System/Library/Fonts', '/Library', '/Library/Application Support', '/Applications', '/Applications/Softe.app',
              '/usr', '/usr/local/clips', '/bin', '/sbin', '/etc', '/var/folders', '/private/var/db', '/opt/homebrew', '/dev', '/cores',
              '/Users/an/Library', '/Users/an/Library/Application Support/Softe', '/Users/an/Library/Application Support/Softe/Partitions/x', '/Users/an/Library/Keychains',
              '/Users/an/.ssh', '/Users/an/.aws/x', '/Users/an/.config/gh', '/Users/an/.Trash'];
  for (const p of no) assert.strictEqual(pathOk(p, MAC), false, p);
  assert.strictEqual(folderAllowed(ask('/Users/an'), PROD_SITE, MAC), false);
});

test('Mac: ".." và dấu gạch cuối không đánh lừa được; hoa thường không đổi kết quả (ổ đĩa Mac không phân biệt)', () => {
  for (const p of ['/Users/an/Movies/../.ssh', '/Users/an/Movies/../../..', '/Users/an/Movies/clips/../../..', '/Users/an/Movies/clips/../../../an',
                   '/USERS/AN', '/users/an/library/keychains', '/Users/AN/LIBRARY', '/SYSTEM', '/Users/an//', '/Users/an/./']) {
    assert.strictEqual(pathOk(p, MAC), false, p);
  }
  assert.strictEqual(pathOk('/Users/an/Movies/./clips/../clips', MAC), true);
});

test('Windows: gốc ổ đĩa, Users, thư mục cá nhân, Windows, Program Files, ProgramData, AppData, dữ liệu và nơi cài app, thư mục ẩn: không bao giờ cấp', () => {
  const no = ['C:\\', 'c:\\', 'D:\\', 'C:/', 'C:\\Users', 'C:\\Users\\', 'C:\\Users\\An', 'c:\\users\\an\\', 'C:\\Users\\An\\',
              'C:\\Windows', 'C:\\Windows\\System32', 'c:\\WINDOWS\\temp', 'C:\\Program Files', 'C:\\Program Files\\Softe', 'C:\\Program Files (x86)\\x', 'C:\\ProgramData\\x',
              'C:\\Users\\An\\AppData\\Roaming', 'C:\\Users\\An\\AppData\\Roaming\\Softe', 'C:\\Users\\An\\AppData\\Local', 'C:\\Users\\An\\AppData\\Local\\Programs\\Softe',
              'C:\\Users\\An\\AppData\\Local\\Programs\\Softe\\resources', 'C:\\Users\\An\\.ssh', 'C:\\Users\\An\\.aws\\x',
              '\\\\nas\\share', '\\\\nas\\share\\', 'C:foo', 'relative\\path', 'Videos\\clips',
              'C:\\Users\\An\\Videos\\..\\.ssh', 'C:\\Users\\An\\Videos\\..\\..\\..\\Windows', 'C:\\Users\\An\\Videos\\clips\\..\\..\\..'];
  for (const p of no) assert.strictEqual(pathOk(p, WIN), false, p);
  assert.strictEqual(pathOk('c:\\USERS\\an\\videos\\Clips', WIN), true, 'hoa thường không đổi thư mục thường');
});

test('Windows: thiếu biến môi trường thì dùng mặc định, có thì theo máy (ổ đĩa khác)', () => {
  const bare = { ...WIN, env: {} };
  for (const p of ['C:\\Windows', 'C:\\Windows\\x', 'C:\\Program Files\\x', 'C:\\Program Files (x86)', 'C:\\ProgramData']) assert.strictEqual(pathOk(p, bare), false, p);
  const moved = { ...WIN, env: { ...WIN.env, SystemRoot: 'D:\\WINNT', ProgramFiles: 'D:\\Programs' } };
  assert.strictEqual(pathOk('D:\\WINNT\\System32', moved), false);
  assert.strictEqual(pathOk('D:\\Programs\\x', moved), false);
  assert.ok(systemFolders('win32', moved.env).includes('D:\\WINNT'));
  assert.ok(systemFolders('win32', {}).includes('C:\\Windows'));
  assert.ok(systemFolders('darwin').includes('/System'));
  assert.ok(systemFolders('linux').includes('/etc'));
});

test('Linux: gốc, home, thư mục cha, hệ thống, nơi cài và dữ liệu của app, thư mục ẩn: không bao giờ cấp', () => {
  for (const p of ['/', '/home', '/home/an', '/mnt', '/media', '/etc', '/etc/x', '/usr/share', '/var/tmp', '/root', '/opt/softe', '/opt/softe/resources', '/home/an/.config/Softe', '/home/an/.ssh', '/home/an/.local/share/x', '/boot']) {
    assert.strictEqual(pathOk(p, LIN), false, p);
  }
  assert.strictEqual(pathOk('/home/an/Videos', LIN), true);
  assert.strictEqual(pathOk('/Etc/clips', LIN), true, 'Linux phân biệt hoa thường: /Etc không phải /etc');
});

test('liên kết tượng trưng: đường dẫn thật cũng phải qua luật; không đọc được đường dẫn thật thì giữ đường dẫn đã kiểm', () => {
  const link = '/Users/an/Movies/looks-harmless';
  assert.strictEqual(folderAllowed(ask(link), PROD_SITE, { ...MAC, realpath: () => '/etc' }), false, 'trỏ vào /etc');
  assert.strictEqual(folderAllowed(ask(link), PROD_SITE, { ...MAC, realpath: () => '/Users/an/.ssh' }), false, 'trỏ vào thư mục ẩn');
  assert.strictEqual(folderAllowed(ask(link), PROD_SITE, { ...MAC, realpath: () => '/Users/an' }), false, 'trỏ vào thư mục cá nhân');
  assert.strictEqual(folderAllowed(ask(link), PROD_SITE, { ...MAC, realpath: () => '/Volumes/Disk/clips' }), true);
  assert.strictEqual(folderAllowed(ask(link), PROD_SITE, { ...MAC, realpath: () => { throw new Error('ENOENT'); } }), true, 'không đọc được: giữ đường dẫn đã kiểm');
  assert.strictEqual(folderAllowed(ask(link), PROD_SITE, { ...MAC, realpath: () => null }), true);
  assert.strictEqual(folderAllowed(ask('/etc'), PROD_SITE, { ...MAC, realpath: () => '/Users/an/Movies/ok' }), false, 'đường dẫn đưa vào cũng phải qua luật');
});

test('thiếu thông tin về máy thì vẫn chặn gốc và hệ thống, không ném lỗi', () => {
  assert.strictEqual(folderAllowed(ask('/'), PROD_SITE, {}), false);
  assert.strictEqual(folderAllowed(ask('/etc'), PROD_SITE, { platform: 'linux' }), false);
  assert.strictEqual(folderAllowed(ask('/home/an/Videos'), PROD_SITE, { platform: 'linux' }), true);
  assert.strictEqual(folderAllowed(ask('/Users/an/x'), PROD_SITE, { platform: 'darwin', home: 5, userData: null, appDirs: 'x', env: null }), true);
  assert.strictEqual(typeof folderAllowed(ask('/Users/an/x'), PROD_SITE), 'boolean', 'không có `where`: dùng nền tảng của máy, không ném lỗi');
});

// ---- main.js thật, Electron giả --------------------------------------------------------------------------------------------------------------

test('main.js: micro vẫn như cũ, thư mục đã chọn được cấp cho softe.ai, mọi quyền khác bị từ chối, và luôn gọi lại đúng một lần', () => {
  const m = bootMain({ platform: 'darwin' });
  const from = { requestingUrl: `${PROD_SITE}/studio/film/batch` };
  assert.deepStrictEqual(m.permission('media', from), { granted: true, times: 1 });
  assert.deepStrictEqual(m.permission('media', { requestingUrl: 'https://evil.example/' }), { granted: false, times: 1 });
  assert.deepStrictEqual(m.permission('media', {}), { granted: false, times: 1 });
  for (const p of ['geolocation', 'notifications', 'clipboard-read', 'display-capture', 'midi', 'openExternal', 'fullscreen', 'unknown', 'storage-access', 'window-management', 'keyboardLock', 'idle-detection', '']) {
    assert.deepStrictEqual(m.permission(p, from), { granted: false, times: 1 }, p);
  }
  const dir = (filePath, extra = {}) => ({ ...from, isDirectory: true, fileAccessType: 'writable', filePath, ...extra });
  assert.deepStrictEqual(m.permission('fileSystem', dir('/Users/an/Movies/clips')), { granted: true, times: 1 });
  assert.deepStrictEqual(m.permission('fileSystem', dir('/Users/an/Movies/clips', { fileAccessType: 'readable' })), { granted: true, times: 1 });
  assert.deepStrictEqual(m.permission('fileSystem', dir('/Users/an/Movies/clips', { requestingUrl: 'https://evil.example/' })), { granted: false, times: 1 });
  assert.deepStrictEqual(m.permission('fileSystem', dir('/Users/an/Movies/clips.zip', { isDirectory: false })), { granted: false, times: 1 }, 'tệp lẻ');
  for (const bad of ['/', '/Users/an', '/Users/an/.ssh', '/Users/an/Library/Application Support/Softe', '/System', '/Applications/Softe.app', '/opt/Softe']) {
    assert.deepStrictEqual(m.permission('fileSystem', dir(bad)), { granted: false, times: 1 }, bad);
  }
});

test('main.js (Windows): thư mục cá nhân, AppData, nơi cài app bị chặn; thư mục thường được cấp', () => {
  const m = bootMain({ platform: 'win32', env: WIN.env });
  const dir = (filePath) => ({ requestingUrl: `${PROD_SITE}/`, isDirectory: true, fileAccessType: 'writable', filePath });
  assert.strictEqual(m.permission('fileSystem', dir('D:\\Phim\\đợt 1')).granted, true);
  assert.strictEqual(m.permission('fileSystem', dir('C:\\Users\\An\\Videos\\clips')).granted, true);
  for (const bad of ['C:\\Users\\An', 'C:\\Windows\\System32', 'C:\\Users\\An\\AppData\\Roaming\\Softe', 'C:\\Users\\An\\AppData\\Local\\Programs\\Softe', 'C:\\']) {
    assert.strictEqual(m.permission('fileSystem', dir(bad)).granted, false, bad);
  }
});

test('main.js: không lấy được thư mục cá nhân (app.getPath lỗi) thì từ chối, không ném lỗi ra ngoài, vẫn gọi lại đúng một lần', () => {
  const m = bootMain({ platform: 'darwin', paths: null });
  assert.deepStrictEqual(m.permission('fileSystem', { requestingUrl: `${PROD_SITE}/`, isDirectory: true, fileAccessType: 'writable', filePath: '/Users/an/Movies/clips' }), { granted: false, times: 1 });
  assert.deepStrictEqual(m.permission('media', { requestingUrl: `${PROD_SITE}/` }), { granted: true, times: 1 }, 'micro không phụ thuộc');
});

test('mã nguồn: chỉ MỘT bộ xử lý quyền, đi qua permissions.folderAllowed; không thêm IPC, không đổi preload, không động vào tải tệp', () => {
  const main = read('main.js');
  assert.strictEqual((main.match(/setPermissionRequestHandler\(/g) || []).length, 1);
  assert.strictEqual((main.match(/permissions\.folderAllowed\(/g) || []).length, 1);
  assert.match(main, /if \(permission === 'fileSystem'\) return cb\(folderGranted\(details\)\);/);
  assert.match(main, /cb\(permission === 'media' && allowedHost\(details\.requestingUrl \|\| '', cfg\.site\)\)/);
  assert.ok(!/setPermissionCheckHandler|setDevicePermissionHandler|will-download|downloadURL|setDownloadPath|showSaveDialog|showOpenDialog/.test(main), 'tải tệp để mặc định của Electron');
  const perm = read('permissions.js');
  const code = perm.replace(/\/\/[^\n]*/g, '');
  assert.ok(!/require\('node:(fs|child_process|net|http|https|os)'\)|ipc|shell\.|process\.exit/.test(code), 'phần thuần: chỉ path và config');
  assert.strictEqual((perm.match(/require\(/g) || []).length, 2);
});
