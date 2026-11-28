'use strict';
// Tự cập nhật: hỏi máy chủ softe.ai, tải file, KIỂM SHA-256, rồi mở trình cài. Hàm thuần để test không cần Electron.
const crypto = require('node:crypto');
const fs = require('node:fs');

const MAX_BYTES = 2 * 1024 ** 3;
// Hạn giờ: hỏi máy chủ 20 giây; bắt đầu tải (có phản hồi) 30 giây; đang tải mà 60 giây không có dữ liệu mới là treo; cả lần tải không quá 3 giờ.
// Có hạn giờ thì một kết nối treo không giữ việc kiểm tra mãi (main.js chỉ chạy một lần kiểm tra một lúc).
const CHECK_TIMEOUT_MS = 20_000;
const START_TIMEOUT_MS = 30_000;
const STALL_TIMEOUT_MS = 60_000;
const TOTAL_TIMEOUT_MS = 3 * 60 * 60 * 1000;

// Chỉ tải từ máy của softe.ai hoặc trang Releases của GitHub (máy chủ có bị sửa cũng không đẩy được link tới nơi lạ). Link GitHub chuyển tiếp tới
// kho tệp *.githubusercontent.com: chỉ được ở bước tải (kiểm lại địa chỉ cuối), không phải link máy chủ đưa.
function hostOk(host) {
  return host === 'softe.ai' || host.endsWith('.softe.ai') || host === 'github.com';
}
function finalHostOk(host) {
  return hostOk(host) || host === 'githubusercontent.com' || host.endsWith('.githubusercontent.com');
}

function platformKey(p = process.platform) {
  return p === 'darwin' ? 'mac' : p === 'win32' ? 'win' : null;
}

function updateUrl(api, platform, version) {
  const q = new URLSearchParams({ platform, version });
  return `${api.replace(/\/$/, '')}/app/desktop/update?${q}`;
}

const VERSION = /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})$/;
function versionParts(v) {
  const m = VERSION.exec(typeof v === 'string' ? v : '');
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
// > 0 nếu a mới hơn b; null nếu một trong hai không phải dạng x.y.z.
function compareVersions(a, b) {
  const x = versionParts(a), y = versionParts(b);
  if (!x || !y) return null;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

// Chỉ nhận câu trả lời đúng dạng; link tải phải là https và không có user:pass. Số phiên bản phải là x.y.z (nó nằm trong tên file tải về).
function parseAnswer(a) {
  if (!a || typeof a !== 'object' || a.update !== true) return null;
  if (!versionParts(a.version)) return null;
  let u;
  try { u = new URL(a.url); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || !hostOk(u.hostname.toLowerCase())) return null;
  const sha = typeof a.sha256 === 'string' ? a.sha256.toLowerCase() : null;
  if (!sha || !/^[0-9a-f]{64}$/.test(sha)) return null; // không có mã kiểm tra thì không cài
  return { version: String(a.version), notes: String(a.notes || ''), url: a.url, sha256: sha,
           required: a.required === true, size: Number.isInteger(a.size) ? a.size : null };
}

// Chạy `run(signal)` với hạn giờ: quá hạn thì hủy lời gọi (signal) VÀ từ chối ngay (kể cả khi fetchFn không nghe signal), nên không bao giờ treo.
async function withTimeout(ms, run) {
  const ctl = new AbortController();
  let timer;
  const late = new Promise((_, rej) => { timer = setTimeout(() => { ctl.abort(); rej(new Error('timeout')); }, ms); });
  try { return await Promise.race([run(ctl.signal), late]); } finally { clearTimeout(timer); }
}

async function check(api, platform, version, fetchFn = fetch) {
  const info = await withTimeout(CHECK_TIMEOUT_MS, async (signal) => {
    const r = await fetchFn(updateUrl(api, platform, version), { headers: { accept: 'application/json' }, signal });
    if (!r.ok) return null;
    return parseAnswer(await r.json());
  });
  // Không bao giờ "cập nhật" xuống bản cũ hơn hay bằng bản đang chạy, dù máy chủ nói có (nhập nhầm bản, hoặc câu trả lời bị sửa).
  if (info && compareVersions(info.version, version) !== null && compareVersions(info.version, version) <= 0) return null;
  return info;
}

async function sha256File(path) {
  const h = crypto.createHash('sha256');
  await new Promise((res, rej) => fs.createReadStream(path).on('data', (d) => h.update(d)).on('end', res).on('error', rej));
  return h.digest('hex');
}

// `onProgress(đã_tải, tổng_hoặc_null)`: tùy chọn, chỉ để hiện tiến độ; không đổi gì ở việc kiểm tra SHA-256.
async function download(info, dest, fetchFn = fetch, onProgress = null, timeouts = {}) {
  const startMs = timeouts.start ?? START_TIMEOUT_MS;
  const stallMs = timeouts.stall ?? STALL_TIMEOUT_MS;
  const totalMs = timeouts.total ?? TOTAL_TIMEOUT_MS;
  const ctl = new AbortController();
  let stall = null; let total = null;
  let kill;
  const dead = new Promise((_, rej) => { kill = (why) => { ctl.abort(); rej(new Error(why)); }; });
  dead.catch(() => {}); // không để lỗi hủy thành "unhandled rejection" khi không còn ai chờ
  const arm = (ms) => { clearTimeout(stall); stall = setTimeout(() => kill('timeout'), ms); };
  total = setTimeout(() => kill('timeout'), totalMs);
  arm(startMs);
  let out = null;
  let it = null;
  try {
    const r = await Promise.race([fetchFn(info.url, { signal: ctl.signal }), dead]);
    if (!r.ok || !r.body) throw new Error('download_failed');
    // Link GitHub chuyển tiếp tới kho tệp của GitHub: địa chỉ cuối vẫn phải là nơi được phép (nếu cách tải cho biết).
    if (typeof r.url === 'string' && r.url) {
      let h = null;
      try { h = new URL(r.url).hostname.toLowerCase(); } catch { h = null; }
      if (!h || !finalHostOk(h)) throw new Error('bad_host');
    }
    const len = Number(r.headers && typeof r.headers.get === 'function' ? r.headers.get('content-length') : NaN);
    const expect = info.size || (Number.isFinite(len) && len > 0 ? len : null);
    out = fs.createWriteStream(dest);
    out.on('error', () => {});
    let n = 0;
    it = r.body[Symbol.asyncIterator]();
    for (;;) {
      arm(stallMs);
      const { done, value: chunk } = await Promise.race([it.next(), dead]);
      if (done) break;
      n += chunk.length;
      if (n > MAX_BYTES || (info.size && n > info.size)) throw new Error('too_big');
      if (!out.write(chunk)) await Promise.race([new Promise((res) => out.once('drain', res)), dead]);
      if (onProgress) { try { onProgress(n, expect); } catch { /* tiến độ chỉ để hiện */ } }
    }
    clearTimeout(stall);
    await Promise.race([new Promise((res, rej) => out.end((e) => (e ? rej(e) : res()))), dead]);
  } catch (e) {
    if (it && typeof it.return === 'function') { try { Promise.resolve(it.return()).catch(() => {}); } catch { /* bỏ */ } }
    if (out) out.destroy();
    fs.rmSync(dest, { force: true });
    throw e;
  } finally { clearTimeout(stall); clearTimeout(total); }
  if ((await sha256File(dest)) !== info.sha256) {
    fs.rmSync(dest, { force: true });
    throw new Error('bad_checksum');
  }
  return dest;
}

module.exports = { CHECK_TIMEOUT_MS, START_TIMEOUT_MS, STALL_TIMEOUT_MS, platformKey, updateUrl, parseAnswer, compareVersions, check, download, sha256File };
