'use strict';
// Cầu chì Electron và cấu hình dựng: các đường vòng không dùng phải được tắt; afterPack nối đúng.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { WANTED } = require('../scripts/fuses');
const pkg = require('../package.json');

test('cầu chì: tắt RunAsNode, NODE_OPTIONS, --inspect; chỉ nạp mã từ app.asar', () => {
  assert.deepEqual(WANTED, { RunAsNode: false, EnableNodeOptionsEnvironmentVariable: false, EnableNodeCliInspectArguments: false, OnlyLoadAppFromAsar: true });
  const { FuseV1Options } = require('@electron/fuses');
  for (const k of Object.keys(WANTED)) assert.ok(k in FuseV1Options, `${k} có thật trong @electron/fuses`);
});

test('cầu chì chưa thử trên máy thật vẫn KHÔNG bị bật (README ghi lý do)', () => {
  for (const k of ['EnableEmbeddedAsarIntegrityValidation', 'GrantFileProtocolExtraPrivileges', 'EnableCookieEncryption']) assert.ok(!(k in WANTED), k);
});

test('electron-builder gọi afterPack của app; tệp có thật và dùng đúng cấu hình', () => {
  assert.equal(pkg.build.afterPack, 'scripts/after-pack.js');
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'after-pack.js'), 'utf8');
  assert.match(src, /flipFuses\(exe, config\)/); assert.match(src, /require\('\.\/fuses'\)/);
  assert.equal(typeof require('../scripts/after-pack').default, 'function');
});

test('Mac: ký tạm (ad-hoc) sau khi đổi cầu chì CHỈ ở bản cuối, không ở hai thư mục tạm x64 / arm64 của bản universal', () => {
  const { configFor } = require('../scripts/after-pack');
  const { FuseV1Options } = require('@electron/fuses');
  const mac = (dir) => configFor('darwin', dir);
  assert.equal(mac('/o/dist/mac-universal').resetAdHocDarwinSignature, true);          // Apple Silicon từ chối app có chữ ký hỏng
  assert.equal(mac('/o/dist/mac-arm64').resetAdHocDarwinSignature, true);
  assert.equal(mac('/o/dist/mac-universal-x64-temp').resetAdHocDarwinSignature, undefined);   // ký ở đây là ghép universal lỗi (_CodeSignature khác nhau)
  assert.equal(mac('/o/dist/mac-universal-arm64-temp').resetAdHocDarwinSignature, undefined);
  assert.equal(configFor('win32', 'C:\\o\\dist\\win-unpacked').resetAdHocDarwinSignature, undefined);
  for (const [k, v] of Object.entries(WANTED)) assert.equal(mac('/o/dist/mac-universal')[FuseV1Options[k]], v);   // cầu chì vẫn đúng
});

test('@electron/fuses chỉ là phần dựng (devDependency), không vào app', () => {
  assert.ok(pkg.devDependencies['@electron/fuses']);
  assert.ok(!pkg.dependencies || !pkg.dependencies['@electron/fuses']);
  assert.ok(pkg.build.files.every((f) => !f.includes('scripts')), 'scripts không đóng gói vào app');
  assert.ok(pkg.build.files.includes('src/**/*'), 'thư viện đọc PDF nằm trong src/ nên được đóng gói');
});
