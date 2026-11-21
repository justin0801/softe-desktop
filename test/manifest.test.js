'use strict';
// Danh sách mô hình có chữ ký (src/local/manifest.js): chưa có khóa thì từ chối hết; chữ ký sai, bị sửa, sai dạng đều bị từ chối.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { verifyManifest, parseManifest, modelMatches, PUBLIC_KEY_PEM } = require('../src/local/manifest');

const pair = () => crypto.generateKeyPairSync('ed25519');
const pem = (k) => k.export({ type: 'spki', format: 'pem' });
const sign = (priv, text) => crypto.sign(null, Buffer.from(text, 'utf8'), priv).toString('base64');
const model = Buffer.from('trọng số giả của mô hình');
const goodText = JSON.stringify({ version: 1, models: [{ id: 'whisper-base', file: 'whisper-base.bin', bytes: model.length, sha256: crypto.createHash('sha256').update(model).digest('hex'), license: 'MIT' }] });

test('chưa có khóa công khai trong app thì từ chối mọi thứ (đóng theo mặc định)', () => {
  assert.equal(PUBLIC_KEY_PEM, '');
  const { privateKey } = pair();
  assert.deepEqual(verifyManifest(goodText, sign(privateKey, goodText)), { ok: false, reason: 'no_key' });
  assert.equal(verifyManifest(goodText, sign(privateKey, goodText), 'không phải khóa').reason, 'no_key');
  const rsa = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey;
  assert.equal(verifyManifest(goodText, 'x'.repeat(86) + '==', pem(rsa)).reason, 'no_key', 'chỉ nhận Ed25519');
});

test('chữ ký đúng thì nhận; sửa một byte, đổi khóa, chữ ký rác đều từ chối', () => {
  const { publicKey, privateKey } = pair();
  const sig = sign(privateKey, goodText);
  const ok = verifyManifest(goodText, sig, pem(publicKey));
  assert.equal(ok.ok, true); assert.equal(ok.manifest.models[0].id, 'whisper-base');
  assert.equal(verifyManifest(goodText.replace('whisper-base.bin', 'whisper-evil.bin'), sig, pem(publicKey)).reason, 'bad_signature');
  assert.equal(verifyManifest(goodText, sign(pair().privateKey, goodText), pem(publicKey)).reason, 'bad_signature');
  assert.equal(verifyManifest(goodText, 'A'.repeat(86) + '==', pem(publicKey)).reason, 'bad_signature');
  for (const bad of [[null, sig], ['', sig], [goodText, null], [goodText, 'ngắn'], [goodText, sig + 'x'], ['x'.repeat(200_001), sig]]) {
    assert.equal(verifyManifest(bad[0], bad[1], pem(publicKey)).reason, 'bad_input');
  }
});

test('chữ ký đúng nhưng nội dung sai dạng cũng bị từ chối', () => {
  const { publicKey, privateKey } = pair();
  const m = JSON.parse(goodText).models[0];
  const wrong = (patch) => JSON.stringify({ version: 1, models: [{ ...m, ...patch }] });
  for (const text of ['không phải json', JSON.stringify({ version: 2, models: [] }), JSON.stringify({ version: 1 }), wrong({ id: '../x' }), wrong({ id: 'A' }), wrong({ file: '../etc/passwd' }),
    wrong({ file: 'a/b' }), wrong({ sha256: 'xyz' }), wrong({ bytes: 0 }), wrong({ bytes: 1.5 }), wrong({ bytes: 3 * 1024 ** 3 }), wrong({ license: 'x'.repeat(65) }),
    JSON.stringify({ version: 1, models: [m, m] }), JSON.stringify({ version: 1, models: new Array(51).fill(0).map((_, i) => ({ ...m, id: `m${i}` })) })]) {
    assert.equal(verifyManifest(text, sign(privateKey, text), pem(publicKey)).reason, 'bad_manifest', text.slice(0, 40));
  }
});

test('manifest dựng lại chỉ giữ các trường biết', () => {
  const m = parseManifest(JSON.stringify({ version: 1, extra: 1, models: [{ ...JSON.parse(goodText).models[0], url: 'https://evil.example/x', run: 'rm -rf' }] }));
  assert.deepEqual(Object.keys(m.models[0]).sort(), ['bytes', 'file', 'id', 'license', 'sha256']);
});

test('tệp mô hình tải về phải đúng cỡ và đúng mã băm', () => {
  const m = parseManifest(goodText);
  assert.equal(modelMatches(m, 'whisper-base', model), true);
  assert.equal(modelMatches(m, 'whisper-base', Buffer.concat([model, Buffer.from('x')])), false);
  assert.equal(modelMatches(m, 'whisper-base', Buffer.from(model.toString().replace('t', 'T'))), false);
  assert.equal(modelMatches(m, 'khac', model), false);
  assert.equal(modelMatches(null, 'whisper-base', model), false);
  assert.equal(modelMatches(m, 'whisper-base', 'chuỗi'), false);
});

test('công cụ ký chạy được: tạo khóa, ký, và app xác minh được', () => {
  const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const { execFileSync } = require('node:child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'softe-key-'));
  const root = path.join(__dirname, '..');
  execFileSync('node', [path.join(root, 'scripts', 'make-manifest-key.js'), dir]);
  const file = path.join(dir, 'manifest.json'); fs.writeFileSync(file, goodText);
  const sig = execFileSync('node', [path.join(root, 'scripts', 'sign-manifest.js'), file, path.join(dir, 'manifest-private.pem')]).toString().trim();
  assert.equal(verifyManifest(goodText, sig, fs.readFileSync(path.join(dir, 'manifest-public.pem'), 'utf8')).ok, true);
  assert.equal(fs.statSync(path.join(dir, 'manifest-private.pem')).mode & 0o077, 0, 'khóa riêng chỉ chủ đọc được');
  fs.writeFileSync(file, 'rác');
  assert.throws(() => execFileSync('node', [path.join(root, 'scripts', 'sign-manifest.js'), file, path.join(dir, 'manifest-private.pem')], { stdio: 'pipe' }), 'manifest sai dạng thì không ký');
});
