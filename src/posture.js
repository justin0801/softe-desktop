'use strict';
// Kiểm tư thế an ninh lúc khởi động (ý từ hermes-agent `security_audit_startup`: CHỈ cảnh báo, không bao giờ chặn app mở, mỗi kiểm tra tự an toàn:
// một kiểm tra lỗi không làm hỏng kiểm tra khác). Kết quả đưa vào nhật ký (đã che) và quyết định có cho xử lý tệp trên máy không (`risky`).
const DEBUG_FLAGS = ['--inspect', '--inspect-brk', '--inspect-port', '--remote-debugging-port', '--remote-debugging-pipe', '--remote-allow-origins'];
const UNSAFE_FLAGS = ['--no-sandbox', '--disable-web-security', '--disable-site-isolation-trials', '--allow-running-insecure-content', '--disable-gpu-sandbox',
  '--ignore-certificate-errors', '--disable-features=IsolateOrigins', '--enable-unsafe-swiftshader'];
const RISKY_ENV = ['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'ELECTRON_EXTRA_LAUNCH_ARGS', 'ELECTRON_ENABLE_LOGGING', 'ELECTRON_DEBUG_NOTIFICATIONS'];

const flagName = (a) => String(a).split('=')[0];
const CHECKS = [
  { id: 'debug_flags', risky: true, run: ({ argv }) => argv.some((a) => DEBUG_FLAGS.includes(flagName(a))) },
  { id: 'unsafe_flags', risky: true, run: ({ argv }) => argv.some((a) => UNSAFE_FLAGS.includes(a) || UNSAFE_FLAGS.includes(flagName(a))) },
  { id: 'node_env', risky: true, run: ({ env }) => RISKY_ENV.some((k) => env[k] !== undefined && env[k] !== '') },
  { id: 'unpackaged', risky: false, run: ({ packaged }) => packaged === false },
];

// Trả { warnings: [mã...], risky }. Không ném lỗi.
function audit({ argv = [], env = {}, packaged = true } = {}) {
  const ctx = { argv: Array.isArray(argv) ? argv : [], env: env && typeof env === 'object' ? env : {}, packaged };
  const warnings = []; let risky = false;
  for (const c of CHECKS) {
    try { if (c.run(ctx)) { warnings.push(c.id); if (c.risky) risky = true; } } catch { /* mỗi kiểm tra tự an toàn */ }
  }
  return { warnings, risky };
}

module.exports = { audit, DEBUG_FLAGS, UNSAFE_FLAGS, RISKY_ENV };
