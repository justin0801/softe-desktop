'use strict';
// Tạo cặp khóa Ed25519 để ký danh sách mô hình. Chạy MỘT lần, ở máy của chủ dự án:  node scripts/make-manifest-key.js <thư-mục-ngoài-repo>
// Ghi manifest-private.pem (KHÔNG BAO GIỜ commit, giữ kín) và manifest-public.pem (dán vào PUBLIC_KEY_PEM của src/local/manifest.js).
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const dir = process.argv[2];
if (!dir) { console.error('Dùng: node scripts/make-manifest-key.js <thư-mục-ngoài-repo>'); process.exit(1); }
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'manifest-private.pem'), privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
fs.writeFileSync(path.join(dir, 'manifest-public.pem'), publicKey.export({ type: 'spki', format: 'pem' }));
console.log(`Đã ghi hai tệp vào ${dir}. Giữ manifest-private.pem kín; dán nội dung manifest-public.pem vào PUBLIC_KEY_PEM.`);
