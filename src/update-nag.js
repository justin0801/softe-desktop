'use strict';
// Nhắc cập nhật không làm phiền: người dùng bấm "Để sau" cho một bản KHÔNG bắt buộc thì cùng bản đó chỉ được nhắc lại sau 24 giờ
// (kể cả mở lại app: mốc nằm trong thư mục dữ liệu của app, không phải bộ nhớ của trang web). Bản bắt buộc (`required`) luôn được hỏi.
// Kiểm tra THỦ CÔNG ("Kiểm tra cập nhật" ở menu Trợ giúp) luôn hỏi. Phần thuần (nhận fs và đường dẫn): test/update-nag.test.js. Không bao giờ ném lỗi.
const NAME = 'update-state.json';
const QUIET_MS = 24 * 60 * 60 * 1000;
const VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,4}$/;

function read(file, fs) {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (v && typeof v.version === 'string' && VERSION.test(v.version) && Number.isFinite(v.at)) return { version: v.version, at: v.at };
  } catch { /* chưa có hoặc hỏng: chưa nhắc gì */ }
  return null;
}

function remember(file, fs, version, now) {
  if (typeof version !== 'string' || !VERSION.test(version)) return false;
  try { fs.writeFileSync(file, `${JSON.stringify({ version, at: now })}\n`, { mode: 0o600 }); return true; } catch { return false; }
}

// Có nên hiện hộp "Có bản mới" lúc này không.
function shouldAsk({ manual, required, version }, saved, now) {
  if (manual || required) return true;
  if (!saved || saved.version !== version) return true;
  // đồng hồ máy lùi (saved.at ở tương lai) thì coi như đã qua giờ: không bao giờ nhịn nhắc mãi
  if (saved.at > now) return true;
  return now - saved.at >= QUIET_MS;
}

module.exports = { NAME, QUIET_MS, read, remember, shouldAsk };
