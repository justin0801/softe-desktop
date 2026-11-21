'use strict';
// "Cầu chì" của Electron (@electron/fuses): tắt những đường vòng mà app KHÔNG dùng, ngay trong chương trình đã dựng (sau khi dựng không ai bật lại được mà không phá chữ ký).
// Chỉ những cầu chì AN TOÀN để tắt mà không cần thử trên máy thật. Có chủ ý CHƯA đặt (chờ thử bản dựng thật, xem README):
//   EnableEmbeddedAsarIntegrityValidation (cần dữ liệu toàn vẹn do công cụ dựng ghi; thiếu là app không mở), GrantFileProtocolExtraPrivileges (hai trang riêng của app là tệp file://),
//   EnableCookieEncryption (người dùng đang đăng nhập có thể bị đăng xuất một lần).
const WANTED = Object.freeze({
  RunAsNode: false,                              // ELECTRON_RUN_AS_NODE: biến app thành trình chạy Node cho ai có quyền đặt biến môi trường
  EnableNodeOptionsEnvironmentVariable: false,   // NODE_OPTIONS: nạp mã tùy ý vào tiến trình chính
  EnableNodeCliInspectArguments: false,          // --inspect: nối bộ gỡ lỗi vào tiến trình chính
  OnlyLoadAppFromAsar: true,                     // chỉ chạy mã trong app.asar, không đọc thư mục app tự thêm bên cạnh
});
module.exports = { WANTED };
