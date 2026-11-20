'use strict';
// Menu của app. Hàm thuần (không cần Electron) để test.
// Menu Sửa KHÔNG có Hoàn tác / Làm lại: nếu có, Cmd/Ctrl+Z bị menu giữ và không tới trang (trình dựng phim cần phím này; docs/studio-phim-dung-phim.md).
// Menu "Đi tới": Cmd/Ctrl + 1..4 tới các màn chính, 4 là Dựng phim.
const GO = [
  { label: 'Trò chuyện', key: '1', path: '/chat' },
  { label: 'Tạo', key: '2', path: '/create' },
  { label: 'Tệp', key: '3', path: '/files' },
  { label: 'Dựng phim', key: '4', path: '/studio/film/editor' },
];

function template({ plat, home, goto, back, forward, checkUpdate }) {
  return [
    ...(plat === 'mac' ? [{ role: 'appMenu' }] : []),
    { label: 'Sửa', submenu: [{ role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { role: 'viewMenu' },
    { label: 'Đi tới', submenu: [
      ...GO.map((g) => ({ label: g.label, accelerator: `CmdOrCtrl+${g.key}`, click: () => goto(g.path) })),
      { type: 'separator' },
      { label: 'Trang chủ', accelerator: 'CmdOrCtrl+Shift+H', click: home },
      { label: 'Quay lại', accelerator: plat === 'mac' ? 'Cmd+[' : 'Alt+Left', click: back },
      { label: 'Tiến tới', accelerator: plat === 'mac' ? 'Cmd+]' : 'Alt+Right', click: forward },
    ] },
    { role: 'windowMenu' },
    { label: 'Trợ giúp', submenu: [{ label: 'Kiểm tra cập nhật', click: checkUpdate }] },
  ];
}

module.exports = { template, GO };
