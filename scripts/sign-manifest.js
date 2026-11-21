'use strict';
// Ký danh sách mô hình:  node scripts/sign-manifest.js <manifest.json> <manifest-private.pem>   → in chữ ký base64 (đặt vào manifest.sig cạnh manifest.json trên máy chủ).
const crypto = require('node:crypto');
const fs = require('node:fs');
const [file, keyFile] = process.argv.slice(2);
if (!file || !keyFile) { console.error('Dùng: node scripts/sign-manifest.js <manifest.json> <manifest-private.pem>'); process.exit(1); }
const text = fs.readFileSync(file, 'utf8');
const { parseManifest } = require('../src/local/manifest');
if (!parseManifest(text)) { console.error('manifest.json sai dạng: không ký.'); process.exit(1); }
console.log(crypto.sign(null, Buffer.from(text, 'utf8'), crypto.createPrivateKey(fs.readFileSync(keyFile))).toString('base64'));
