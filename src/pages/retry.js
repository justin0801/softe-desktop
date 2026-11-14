// Trang mất mạng: "Thử lại" là liên kết #retry (app nghe did-navigate-in-page rồi tải lại softe.ai).
// Mã này chỉ thêm ba việc nhỏ: hiện dòng "đang thử", tự thử lại khi máy báo có mạng trở lại, và tự thử lại sau một lúc khi máy
// báo đã có mạng mà lần thử trước vẫn lỗi (khi đó sẽ không còn sự kiện "online" nào nữa). Lùi dần: 10 giây, 20, 40... tối đa 5 phút;
// sau mỗi lần lỗi app tải lại trang này kèm ?n=<số lần mất mạng liên tiếp>. Các số giữ cùng số với src/shell.js (test so hai bên).
(function () {
  'use strict';
  var BASE_MS = 10000;
  var CAP_MS = 300000;
  var MAX_TRIES = 20;
  var link = document.getElementById('retry');
  var busy = document.getElementById('busy');
  var timer = null;
  function showBusy() { if (busy) busy.hidden = false; }
  function retry() {
    if (timer) { clearTimeout(timer); timer = null; }
    showBusy();
    if (window.location.hash !== '#retry') window.location.hash = 'retry';
  }
  if (link) link.addEventListener('click', showBusy);
  window.addEventListener('online', retry);
  var found = /[?&]n=(\d+)/.exec(window.location.search || '');
  var tries = Math.min(found ? parseInt(found[1], 10) || 1 : 1, MAX_TRIES);
  // Máy báo "không có mạng" thì chờ sự kiện "online" (ở trên), không thử vô ích.
  if (navigator.onLine !== false) {
    var base = Math.min(BASE_MS * Math.pow(2, tries - 1), CAP_MS);
    timer = setTimeout(retry, Math.round(base * (0.8 + 0.4 * Math.random())));
  }
})();
