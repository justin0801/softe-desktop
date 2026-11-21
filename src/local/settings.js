'use strict';
// Công tắc "Xử lý tệp trên máy này": mặc định TẮT, người dùng bật ở menu Trợ giúp. Lưu một tệp nhỏ trong thư mục dữ liệu của app (không phải bộ nhớ của trang web).
// Chỉ một giá trị đúng / sai; tệp hỏng hay thiếu thì là tắt. Không bao giờ ném lỗi.
const NAME = 'local-settings.json';

function readEnabled(file, fs) {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'));
    return !!v && v.enabled === true;
  } catch { return false; }
}

function writeEnabled(file, fs, enabled) {
  try { fs.writeFileSync(file, `${JSON.stringify({ enabled: enabled === true })}\n`, { mode: 0o600 }); return true; } catch { return false; }
}

module.exports = { NAME, readEnabled, writeEnabled };
