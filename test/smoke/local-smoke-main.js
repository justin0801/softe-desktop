'use strict';
// Thử THẬT trên Electron (không phải bản giả): cửa sổ ẩn bị nhốt đọc một PDF qua địa chỉ riêng softe-local://. Không nằm trong `npm test` (cần Electron + màn hình ảo).
// Chạy: xvfb-run -a npx electron --no-sandbox test/smoke/local-smoke-main.js   (--no-sandbox chỉ vì chạy bằng root trong máy thử; bản thật không dùng)
const path = require('node:path');
const { app, BrowserWindow, ipcMain, session, protocol } = require('electron');
const { createWorkerHost, registerScheme } = require('../../src/local/worker-host');
const { makePdf } = require('../helpers/make-pdf');
const { normalize } = require('../../src/local/result');

registerScheme(protocol);
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  const host = createWorkerHost({ electron: { BrowserWindow, session, ipcMain, app }, dir: path.join(__dirname, '..', '..', 'src', 'local'),
    onConsole: process.env.SMOKE_DEBUG ? (l, m) => console.log('  [trang]', l, m) : null });
  const long = 'Hop dong thue nha so mot hai ba bon nam sau bay tam chin';
  const out = [];
  const t0 = Date.now();
  const good = normalize(await host.run(new Uint8Array(makePdf([long, `${long} trang hai`]))), '1.4.0');
  out.push(['pdf co chu', good.ok === true && /Hop dong thue nha/.test(good.text) && good.pages === 2, JSON.stringify(good).slice(0, 160)]);
  const blank = normalize(await host.run(new Uint8Array(makePdf(['.']))), '1.4.0');
  out.push(['pdf gan nhu trang (khong chu) -> khong co chu', blank.ok === false && blank.reason === 'needs_ocr', JSON.stringify(blank)]);
  // PDF ảnh quét (không có lớp chữ): OCR ngay trên máy, tiếng Việt có dấu
  const scanBytes = new Uint8Array(require('node:fs').readFileSync(path.join(__dirname, '..', 'fixtures', 'scan-vi.pdf')));
  const t1 = Date.now();
  const ocr = normalize(await host.run(scanBytes), '1.4.0');
  out.push(['pdf anh quet doc bang OCR tren may', ocr.ok === true && /thu[eê]/i.test(ocr.text) && /H[aàảãạ]\s*N[oộ]i|Hà Nội|nhà/i.test(ocr.text), `${Date.now() - t1} ms ${JSON.stringify(ocr).slice(0, 260)}`]);
  const junk = normalize(await host.run(new Uint8Array(Buffer.from('khong phai pdf'))), '1.4.0');
  out.push(['khong phai pdf -> unsupported', junk.ok === false && junk.reason === 'unsupported', JSON.stringify(junk)]);
  const windowsLeft = BrowserWindow.getAllWindows().length;
  out.push(['cua so an da bi huy', windowsLeft === 0, `con ${windowsLeft}`]);
  let failed = 0;
  for (const [name, ok, info] of out) { console.log(`${ok ? 'OK ' : 'LOI'} ${name}: ${info}`); if (!ok) failed += 1; }
  console.log(`THOI GIAN ${Date.now() - t0} ms`);
  app.exit(failed ? 1 : 0);
});
setTimeout(() => { console.log('QUA GIO'); app.exit(2); }, 150000);
