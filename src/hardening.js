'use strict';
// Rào chắn chung cho MỌI cửa sổ và trang (ý từ cách hermes-agent kiểm tư thế an ninh lúc khởi động và chặn đường vòng: cảnh báo, không bao giờ chặn app mở,
// mỗi kiểm tra tự an toàn). Phần thuần để test không cần Electron; main.js chỉ nối dây.
const { allowedHost } = require('./config');

// Che thứ trông như khóa / mã trước khi in ra nhật ký (không bao giờ in nội dung của người dùng; chỉ mã và số liệu).
const SECRETS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT
  /\b(?:sk|pk|rk|ghp|gho|ghs|github_pat|xox[abpr])[-_][A-Za-z0-9_-]{16,}/gi,
  /([?&#](?:access_token|refresh_token|token|code|state|key|social|verifier|challenge)=)[^&#\s]+/gi,
  /\b[A-Fa-f0-9]{40,}\b/g,
];
function redact(value) {
  let s = typeof value === 'string' ? value : value instanceof Error ? `${value.name}: ${value.message}` : String(value);
  s = s.replace(SECRETS[3], '$1[đã che]');
  for (const re of [SECRETS[0], SECRETS[1], SECRETS[2], SECRETS[4]]) s = s.replace(re, '[đã che]');
  return s.length > 500 ? `${s.slice(0, 500)}…` : s;
}

// Điều hướng KHUNG CHÍNH bằng chuyển hướng (302) tới nơi không phải softe.ai: chặn rồi mở bằng trình duyệt của máy (như will-navigate). Khung con không tính.
function redirectDecision(url, isMainFrame, site) {
  if (isMainFrame === false) return 'allow';
  return allowedHost(url, site) ? 'allow' : 'external';
}

// Quyền thiết bị (USB, Bluetooth, HID, cổng nối tiếp...) và chia sẻ màn hình: không bao giờ.
function lockDevices(ses) {
  if (typeof ses.setDevicePermissionHandler === 'function') ses.setDevicePermissionHandler(() => false);
  if (typeof ses.setDisplayMediaRequestHandler === 'function') ses.setDisplayMediaRequestHandler((request, cb) => cb({}));
}

// Gắn cho mọi nội dung web được tạo ra (cửa sổ chính, cửa sổ con, và mọi thứ bất ngờ): không `<webview>`, chuyển hướng ra ngoài thì mở ở trình duyệt.
function guardContents(contents, { site, external }) {
  if (!contents || typeof contents.on !== 'function') return;
  contents.on('will-attach-webview', (e) => e.preventDefault());
  contents.on('will-redirect', (e, url, isInPlace, isMainFrame) => {
    if (redirectDecision(url, isMainFrame, site) === 'external') { e.preventDefault(); external(url); }
  });
}

function install({ app, session, site, external }) {
  app.on('web-contents-created', (e, contents) => guardContents(contents, { site, external }));
  // Chứng chỉ sai là từ chối, không bao giờ "tiếp tục dù sao".
  app.on('certificate-error', (e, wc, url, error, cert, cb) => { e.preventDefault(); cb(false); });
  if (session && session.defaultSession) lockDevices(session.defaultSession);
}

module.exports = { redact, redirectDecision, guardContents, lockDevices, install };
