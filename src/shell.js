'use strict';
// Phần thuần của hai trang riêng của app: màn chờ lúc mở app và trang mất mạng (có Mochi).
// Không cần Electron để chạy (test/shell.test.js); main.js chỉ nối dây.
// Hai trang này là tệp tĩnh trong app, không đọc công tắc nào của máy chủ (softe-be/docs/linh-vat-mochi.md mục 3.2b).
const path = require('node:path');
const { allowedHost } = require('./config');

const PAGES_DIR = path.join(__dirname, 'pages');
const SPLASH_FILE = 'splash.html';
const OFFLINE_FILES = Object.freeze({ vi: 'offline.vi.html', en: 'offline.en.html' });
const RETRY_HASH = 'retry';          // "Thử lại" đổi #retry trong trang; main nghe did-navigate-in-page. Không có API nào cho trang.
const ERR_ABORTED = -3;              // Chromium: lượt tải bị thay bằng lượt khác. Không phải lỗi mạng.
const STILL_AFTER_MS = 20 * 1000;    // Hình động chạy ngần này rồi đổi sang ảnh đứng yên (calm.js giữ cùng số).
// Trang mất mạng tự thử lại khi máy báo đã có mạng mà softe.ai vẫn chưa vào được: lùi dần 10 giây, 20, 40... tối đa 5 phút
// (retry.js giữ cùng số; test so hai bên). Số lần mất mạng liên tiếp đi vào trang bằng ?n=.
const RETRY_BASE_MS = 10 * 1000;
const RETRY_CAP_MS = 5 * 60 * 1000;
const MAX_TRIES = 20;
// Màu nền cửa sổ trước khi trang vẽ xong: phải bằng màu nền của page.css (test giữ điều đó), để không nháy trắng.
const BACKGROUNDS = Object.freeze({ light: '#F1F4F9', dark: '#060A10' });

// Ngôn ngữ của máy: bắt đầu bằng "vi" (vi, vi-VN, vi_VN) thì tiếng Việt, còn lại tiếng Anh.
function pageLang(locale) {
  return typeof locale === 'string' && /^vi(?![a-z])/i.test(locale.trim()) ? 'vi' : 'en';
}

// Màn chờ là một tệp; ngôn ngữ đi bằng #vi / #en (CSS :target, không cần JS).
function splashHash(lang) { return lang === 'vi' ? 'vi' : 'en'; }

function offlinePage(lang) { return OFFLINE_FILES[lang === 'vi' ? 'vi' : 'en']; }

// Số lần mất mạng liên tiếp: 1, 2, 3... (dừng ở MAX_TRIES). Hết khi softe.ai vào được.
function nextTries(tries) { return Number.isInteger(tries) && tries >= 0 ? Math.min(tries + 1, MAX_TRIES) : 1; }

// Trang mất mạng mở kèm ?n=<số lần>: tệp khác địa chỉ thì Chromium tải lại hẳn (kể cả khi đang ở #retry của lần trước).
function offlineQuery(tries) { return { n: String(Number.isInteger(tries) && tries >= 1 ? Math.min(tries, MAX_TRIES) : 1) }; }

// Chờ bao lâu rồi tự thử lại (mili giây): gấp đôi mỗi lần, tối đa RETRY_CAP_MS, nhích ±20% để máy nhiều người không cùng giờ.
function retryDelay(tries, random = Math.random) {
  const n = Number.isInteger(tries) && tries > 0 ? Math.min(tries, MAX_TRIES) : 1;
  const base = Math.min(RETRY_BASE_MS * 2 ** (n - 1), RETRY_CAP_MS);
  return Math.round(base * (0.8 + 0.4 * random()));
}

// Chỉ ba tệp này được mở: không nhận tên tệp từ bất cứ đâu khác.
const PAGE_FILES = new Set([SPLASH_FILE, ...Object.values(OFFLINE_FILES)]);
function pagePath(file) {
  if (!PAGE_FILES.has(file)) throw new Error('Không phải trang của app');
  return path.join(PAGES_DIR, file);
}

function backgroundFor(dark) { return dark ? BACKGROUNDS.dark : BACKGROUNDS.light; }

// did-fail-load: chỉ lỗi mạng của KHUNG CHÍNH, của địa chỉ thuộc softe.ai, mới hiện trang mất mạng.
// Bỏ qua: khung con, ERR_ABORTED (-3), địa chỉ lạ (kể cả chính hai trang của app), mã không phải lỗi.
// Lỗi 5xx của máy chủ không vào đây (là trang của softe.ai, web tự lo).
function failureMatters(info, site) {
  const { errorCode, isMainFrame, validatedURL } = info || {};
  if (isMainFrame !== true) return false;
  if (!Number.isInteger(errorCode) || errorCode >= 0 || errorCode === ERR_ABORTED) return false;
  return allowedHost(validatedURL, site);
}

// Địa chỉ của một trang trong app (tệp cục bộ `.../pages/<tệp>`, có thể kèm ?n= hoặc #...). Web softe.ai không bao giờ tới được địa chỉ file:, nên không giả được.
function isAppPage(url, files) {
  let u;
  try { u = new URL(url); } catch { return false; }
  return u.protocol === 'file:' && files.some((f) => u.pathname.endsWith(`/pages/${f}`));
}
function isSplash(url) { return isAppPage(url, [SPLASH_FILE]); }
function isOfflinePage(url) { return isAppPage(url, Object.values(OFFLINE_FILES)); }

// Địa chỉ trang mất mạng của app kèm #retry.
function isRetry(url) {
  return isOfflinePage(url) && new URL(url).hash === `#${RETRY_HASH}`;
}

module.exports = {
  PAGES_DIR, SPLASH_FILE, OFFLINE_FILES, RETRY_HASH, STILL_AFTER_MS, RETRY_BASE_MS, RETRY_CAP_MS, MAX_TRIES, BACKGROUNDS, ERR_ABORTED,
  pageLang, splashHash, offlinePage, pagePath, backgroundFor, nextTries, offlineQuery, retryDelay,
  failureMatters, isSplash, isOfflinePage, isRetry,
};
