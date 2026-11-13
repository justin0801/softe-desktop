'use strict';
// Tự cập nhật: hỏi máy chủ softe.ai, tải file, KIỂM SHA-256, rồi mở trình cài. Hàm thuần để test không cần Electron.
const crypto = require('node:crypto');
const fs = require('node:fs');

const MAX_BYTES = 2 * 1024 ** 3;

function platformKey(p = process.platform) {
  return p === 'darwin' ? 'mac' : p === 'win32' ? 'win' : null;
}

function updateUrl(api, platform, version) {
  const q = new URLSearchParams({ platform, version });
  return `${api.replace(/\/$/, '')}/app/desktop/update?${q}`;
}

// Chỉ nhận câu trả lời đúng dạng; link tải phải là https và không có user:pass.
function parseAnswer(a) {
  if (!a || typeof a !== 'object' || a.update !== true) return null;
  let u;
  try { u = new URL(a.url); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  const sha = typeof a.sha256 === 'string' ? a.sha256.toLowerCase() : null;
  if (!sha || !/^[0-9a-f]{64}$/.test(sha)) return null; // không có mã kiểm tra thì không cài
  return { version: String(a.version), notes: String(a.notes || ''), url: a.url, sha256: sha,
           required: a.required === true, size: Number.isInteger(a.size) ? a.size : null };
}

async function check(api, platform, version, fetchFn = fetch) {
  const r = await fetchFn(updateUrl(api, platform, version), { headers: { accept: 'application/json' } });
  if (!r.ok) return null;
  return parseAnswer(await r.json());
}

async function sha256File(path) {
  const h = crypto.createHash('sha256');
  await new Promise((res, rej) => fs.createReadStream(path).on('data', (d) => h.update(d)).on('end', res).on('error', rej));
  return h.digest('hex');
}

async function download(info, dest, fetchFn = fetch) {
  const r = await fetchFn(info.url);
  if (!r.ok || !r.body) throw new Error('download_failed');
  const out = fs.createWriteStream(dest);
  let n = 0;
  try {
    for await (const chunk of r.body) {
      n += chunk.length;
      if (n > MAX_BYTES || (info.size && n > info.size)) throw new Error('too_big');
      if (!out.write(chunk)) await new Promise((res) => out.once('drain', res));
    }
    await new Promise((res, rej) => out.end((e) => (e ? rej(e) : res())));
  } catch (e) {
    out.destroy();
    fs.rmSync(dest, { force: true });
    throw e;
  }
  if ((await sha256File(dest)) !== info.sha256) {
    fs.rmSync(dest, { force: true });
    throw new Error('bad_checksum');
  }
  return dest;
}

module.exports = { platformKey, updateUrl, parseAnswer, check, download, sha256File };
