// Trang mất mạng: "Thử lại" là liên kết #retry (app nghe did-navigate-in-page rồi tải lại softe.ai).
// Mã này chỉ thêm hai việc nhỏ: hiện dòng "đang thử" và tự thử lại khi máy báo có mạng trở lại.
(function () {
  'use strict';
  var link = document.getElementById('retry');
  var busy = document.getElementById('busy');
  function showBusy() { if (busy) busy.hidden = false; }
  if (link) link.addEventListener('click', showBusy);
  window.addEventListener('online', function () {
    showBusy();
    if (window.location.hash !== '#retry') window.location.hash = 'retry';
  });
})();
