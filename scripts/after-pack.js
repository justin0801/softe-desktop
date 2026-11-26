'use strict';
// electron-builder gọi sau khi gói app, TRƯỚC khi ký: bật / tắt cầu chì (scripts/fuses.js) trên chương trình Electron vừa dựng.
const path = require('node:path');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
const { WANTED } = require('./fuses');

// Đổi cầu chì là sửa chương trình, nên làm hỏng chữ ký sẵn có của Electron. Mac Apple Silicon (arm64) từ chối mở app có chữ ký hỏng, và khi chưa có
// chứng chỉ ký (hiện tại: không có CSC_LINK) electron-builder không ký lại, nên phải ký tạm (ad-hoc) ngay sau khi đổi (resetAdHocDarwinSignature, xem README của
// @electron/fuses, mục Apple Silicon). Có chứng chỉ thì electron-builder ký đè lên sau đó. CHỈ làm ở bản cuối: Mac universal dựng hai thư mục tạm (x64, arm64:
// tên kết thúc bằng "-temp") rồi ghép; ký ad-hoc ở hai thư mục tạm làm tệp _CodeSignature của hai bên khác nhau và việc ghép báo lỗi.
function configFor(platform, appOutDir) {
  const config = { version: FuseVersion.V1 };
  for (const [key, value] of Object.entries(WANTED)) config[FuseV1Options[key]] = value;
  if (platform === 'darwin' && !/-temp$/.test(path.basename(String(appOutDir)))) config.resetAdHocDarwinSignature = true;
  return config;
}

exports.configFor = configFor;
exports.default = async function afterPack(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  const name = packager.appInfo.productFilename;
  const exe = electronPlatformName === 'darwin' ? path.join(appOutDir, `${name}.app`) : path.join(appOutDir, `${name}.exe`);
  const config = configFor(electronPlatformName, appOutDir);
  await flipFuses(exe, config);
};
