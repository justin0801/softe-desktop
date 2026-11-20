'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { allowedPermission } = require('../src/config');

const SITE = 'https://softe.ai';

test('cấp micro / camera, sao chép, toàn màn hình cho softe.ai', () => {
  for (const p of ['media', 'clipboard-sanitized-write', 'fullscreen']) assert.equal(allowedPermission(p, 'https://softe.ai/chat', SITE), true, p);
});

test('từ chối quyền khác, và mọi quyền với trang khác', () => {
  for (const p of ['geolocation', 'notifications', 'clipboard-read', 'midi', 'openExternal']) assert.equal(allowedPermission(p, 'https://softe.ai/', SITE), false, p);
  for (const u of ['https://evil.com/', 'https://softe.ai.evil.com/', 'http://softe.ai/', '', undefined]) assert.equal(allowedPermission('media', u, SITE), false, String(u));
});
