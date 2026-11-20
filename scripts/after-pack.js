'use strict';
// electron-builder gọi sau khi gói app, TRƯỚC khi ký: bật / tắt cầu chì (scripts/fuses.js) trên chương trình Electron vừa dựng.
const path = require('node:path');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
const { WANTED } = require('./fuses');

exports.default = async function afterPack(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  const name = packager.appInfo.productFilename;
  const exe = electronPlatformName === 'darwin' ? path.join(appOutDir, `${name}.app`) : path.join(appOutDir, `${name}.exe`);
  const config = { version: FuseVersion.V1 };
  for (const [key, value] of Object.entries(WANTED)) config[FuseV1Options[key]] = value;
  await flipFuses(exe, config);
};
