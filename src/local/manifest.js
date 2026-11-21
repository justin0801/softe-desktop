'use strict';
// Danh sách mô hình (giọng nói, AI nhỏ...) có CHỮ KÝ của chủ dự án: kẻ chiếm được kho tệp hay máy chủ cũng không đưa được mô hình giả vào máy người dùng
// (softe-be/docs/ung-dung-may-tinh-chay-cuc-bo.md, mục 10.3). Ed25519: chữ ký ký trên đúng các byte của manifest.json; khóa công khai nằm sẵn trong app.
// CHƯA có khóa công khai (PUBLIC_KEY_PEM rỗng) thì từ chối mọi thứ: chủ dự án tạo khóa bằng `node scripts/make-manifest-key.js`, ghi khóa công khai vào đây,
// giữ khóa riêng NGOÀI repo (không bao giờ commit). Chưa có tính năng nào dùng mô hình tải về (chưa làm): đây là nền để làm sau, và có test.
const crypto = require('node:crypto');

const PUBLIC_KEY_PEM = '';
const MAX_MODELS = 50;
const MAX_BYTES = 2 * 1024 ** 3;
const ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SHA = /^[0-9a-f]{64}$/;

function keyOf(pem) {
  try { return pem ? crypto.createPublicKey(pem) : null; } catch { return null; }
}

// Kiểm chữ ký rồi đọc nội dung. `text`: chuỗi manifest.json; `signature`: chuỗi base64 của chữ ký. Trả { ok: true, manifest } hoặc { ok: false, reason }.
function verifyManifest(text, signature, pem = PUBLIC_KEY_PEM) {
  const key = keyOf(pem);
  if (!key || key.asymmetricKeyType !== 'ed25519') return { ok: false, reason: 'no_key' };
  if (typeof text !== 'string' || text.length === 0 || text.length > 200_000 || typeof signature !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(signature)) return { ok: false, reason: 'bad_input' };
  let good = false;
  try { good = crypto.verify(null, Buffer.from(text, 'utf8'), key, Buffer.from(signature, 'base64')); } catch { good = false; }
  if (!good) return { ok: false, reason: 'bad_signature' };
  const manifest = parseManifest(text);
  return manifest ? { ok: true, manifest } : { ok: false, reason: 'bad_manifest' };
}

// Đọc nghiêm: đúng dạng thì trả bản đã dựng lại (chỉ các trường biết), sai một chỗ là null.
function parseManifest(text) {
  let raw;
  try { raw = JSON.parse(text); } catch { return null; }
  if (!raw || typeof raw !== 'object' || raw.version !== 1 || !Array.isArray(raw.models) || raw.models.length > MAX_MODELS) return null;
  const seen = new Set(); const models = [];
  for (const m of raw.models) {
    if (!m || typeof m !== 'object' || !ID.test(m.id) || seen.has(m.id) || !FILE.test(m.file) || !SHA.test(m.sha256) ||
        !Number.isInteger(m.bytes) || m.bytes < 1 || m.bytes > MAX_BYTES || typeof m.license !== 'string' || m.license.length > 64) return null;
    seen.add(m.id);
    models.push({ id: m.id, file: m.file, bytes: m.bytes, sha256: m.sha256, license: m.license });
  }
  return { version: 1, models };
}

// Tệp đã tải về có đúng là mô hình `id` trong danh sách (đúng cỡ, đúng mã băm) không.
function modelMatches(manifest, id, bytes) {
  const m = manifest && manifest.models && manifest.models.find((x) => x.id === id);
  if (!m || !Buffer.isBuffer(bytes) || bytes.length !== m.bytes) return false;
  return crypto.createHash('sha256').update(bytes).digest('hex') === m.sha256;
}

module.exports = { PUBLIC_KEY_PEM, verifyManifest, parseManifest, modelMatches };
