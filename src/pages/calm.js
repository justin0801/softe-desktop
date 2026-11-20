// Hình động Mochi chỉ chạy ít giây rồi đổi sang ảnh đứng yên: trang có thể mở hàng giờ.
// (Máy bật giảm chuyển động thì chính tệp SVG đã đứng yên, không cần mã ở đây.)
(function () {
  'use strict';
  var STILL_AFTER_MS = 20000;
  var img = document.getElementById('mochi');
  var still = img && img.getAttribute('data-still');
  if (!still) return;
  setTimeout(function () { img.setAttribute('src', still); }, STILL_AFTER_MS);
})();
