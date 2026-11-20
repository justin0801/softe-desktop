'use strict';
// Chữ của chính app (menu, hộp thoại cập nhật, lối tắt, menu chuột phải) bằng tiếng Việt và tiếng Anh, như web và app điện thoại. Phần thuần (không cần Electron;
// test/texts.test.js); main.js chỉ nối dây. Chữ nào Electron tự dịch theo máy (Sửa, Xem, Cửa sổ, Sao chép, Dán...) thì dùng vai trò (role) của nó, không viết lại ở đây.
//
// Ngôn ngữ theo TRANG ĐANG XEM, đúng luật của web ("Tiếng Việt là ngôn ngữ chính, tiếng Anh dưới /en"): cửa sổ đang ở một trang tiếng Anh (/en/...) của softe.ai
// thì tiếng Anh, ở trang softe.ai khác thì tiếng Việt. Trang riêng của app (màn chờ, trang mất mạng) và lúc chưa biết gì thì theo ngôn ngữ của máy
// (cùng luật với hai trang đó: shell.pageLang). Không thêm lời nào về mua bán, giá, credit hay khuyến mãi (app không bán gì, CLAUDE.md).
const { allowedHost } = require('./config');
const { pageLang } = require('./shell');

const TEXTS = Object.freeze({
  vi: Object.freeze({
    goTo: 'Đi tới', help: 'Trợ giúp', checkUpdate: 'Kiểm tra cập nhật',
    code: 'Softe Code', chat: 'Trò chuyện', dashboard: 'Tổng quan', editor: 'Dựng phim',
    openCode: 'Mở Softe Code', openCodeHint: 'Mở Softe Code trong app Softe',
    upToDate: 'Bạn đang dùng bản mới nhất.',
    newVersion: 'Có bản mới', notesFallback: 'Bản cập nhật sẵn sàng tải về.',
    updateNow: 'Cập nhật ngay', later: 'Để sau', quit: 'Thoát',
    updateFailedTitle: 'Không cập nhật được', updateFailedBody: 'Kiểm tra mạng rồi thử lại.',
    openLink: 'Mở liên kết trong trình duyệt', copyLink: 'Sao chép địa chỉ liên kết', openMail: 'Soạn email', copyMail: 'Sao chép địa chỉ email',
    localFiles: 'Đọc tệp PDF ngay trên máy này (thử nghiệm)',
  }),
  en: Object.freeze({
    goTo: 'Go to', help: 'Help', checkUpdate: 'Check for updates',
    code: 'Softe Code', chat: 'Chat', dashboard: 'Overview', editor: 'Video editor',
    openCode: 'Open Softe Code', openCodeHint: 'Open Softe Code in the Softe app',
    upToDate: 'You are on the latest version.',
    newVersion: 'A new version is available', notesFallback: 'The update is ready to download.',
    updateNow: 'Update now', later: 'Later', quit: 'Quit',
    updateFailedTitle: 'Could not update', updateFailedBody: 'Check your connection and try again.',
    openLink: 'Open link in browser', copyLink: 'Copy link address', openMail: 'Write an email', copyMail: 'Copy email address',
    localFiles: 'Read PDF files on this computer (beta)',
  }),
});

// Ngôn ngữ của chữ trong app lúc này. `url`: trang cửa sổ đang hiện (có thể là trang riêng của app hoặc rỗng); `locale`: ngôn ngữ của máy; `site`: địa chỉ softe.ai.
function languageOf(url, locale, site) {
  if (typeof url === 'string' && url && allowedHost(url, site)) {
    let path;
    try { path = new URL(url).pathname; } catch { return pageLang(locale); }
    return path === '/en' || path.startsWith('/en/') ? 'en' : 'vi';
  }
  return pageLang(locale);
}

// Bộ chữ của một ngôn ngữ (ngôn ngữ lạ về tiếng Anh, như shell.offlinePage).
function textsFor(lang) { return lang === 'vi' ? TEXTS.vi : TEXTS.en; }

module.exports = { TEXTS, languageOf, textsFor };
