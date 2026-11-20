'use strict';
// Softe Code đặt dấu ở đầu tiêu đề tab khi AI cần người dùng (softe-fe src/lib/code-title.ts): ❓ cần bạn, ⚠ lỗi, ⏸ tạm dừng.
// App đọc tiêu đề để nhấp nháy / nảy biểu tượng khi cửa sổ không ở phía trước. Hàm thuần.
const SIGNS = /^[\s ​-‍⁠﻿︎️]*(?:[❓❔❗❕⚠⏸])/u;
function needsAttention(title) {
  return typeof title === 'string' && SIGNS.test(title);
}
module.exports = { needsAttention };
