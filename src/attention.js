'use strict';
// Gọi người dùng khi một phiên Softe Code đang đợi họ mà cửa sổ app không được xem: nháy biểu tượng trên thanh tác vụ (Windows) hoặc
// nảy biểu tượng Dock một lần (Mac). Phần thuần (không cần Electron; test/attention.test.js); main.js chỉ nối dây.
// Chỉ đọc TIÊU ĐỀ của trang: web đặt tiêu đề theo trạng thái phiên (softe-fe src/lib/code-title.ts::tabTitle). Không IPC, không preload,
// không quyền mới (không dùng thông báo của hệ điều hành).
//   "❓ Cần bạn: …", "❓ Cần bạn (2): …", "❓ Needs you: …"  phiên đợi người dùng duyệt / trả lời
//   "⏸ Tạm dừng: …", "⏸ Paused: …"                          hết ngân sách của lượt: người dùng thêm ngân sách để làm tiếp
//   "⚠ Lỗi: …", "⚠ Failed: …"                                lượt bị lỗi: người dùng gửi lại tin
// "● … · Code" (AI đang làm) và "… · Code" (AI nghỉ) không gọi ai: tiêu đề kết thúc bằng " · Code" không bao giờ là lời gọi, kể cả khi tên phiên
// (lấy từ tin nhắn đầu) tự bắt đầu bằng "⚠ Lỗi:" hay "❓ Cần bạn:" (dán một dòng lỗi vào làm tin nhắn đầu).
const NEEDS_PERSON = Object.freeze([
  /^❓ (?:Cần bạn|Needs you)(?: \(\d{1,4}\))?: /u,
  /^⏸ (?:Tạm dừng|Paused): /u,
  /^⚠ (?:Lỗi|Failed): /u,
]);
const MAX_TITLE = 400;

function needsAttention(title) {
  if (typeof title !== 'string' || title.length > MAX_TITLE) return false;
  const t = title.normalize('NFC');
  if (t.endsWith(' · Code')) return false;
  return NEEDS_PERSON.some((re) => re.test(t));
}

// Một bước cho mỗi lần tiêu đề đổi. `last`: tiêu đề "cần người dùng" gần nhất đã gọi, hoặc đã hiện khi cửa sổ đang được xem (người dùng thấy rồi).
// Chỉ gọi khi tiêu đề CHUYỂN sang một trạng thái cần người dùng khác với lần trước, và cửa sổ không được xem; tiêu đề trở lại bình thường thì quên.
// Trả { alert, last }.
function attentionStep(last, title, focused) {
  if (!needsAttention(title)) return { alert: false, last: null };
  const t = title.normalize('NFC');
  if (t === last) return { alert: false, last };
  return { alert: focused !== true, last: t };
}

module.exports = { NEEDS_PERSON, MAX_TITLE, needsAttention, attentionStep };
