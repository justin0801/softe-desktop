'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { allowedPermission } = require('../src/config');

const SITE = 'https://softe.ai';

test('cấp quyền cần thiết cho softe.ai', () => {
  for (const p of ['media', 'clipboard-sanitized-write', 'clipboard-read', 'fullscreen', 'notifications']) {
    assert.equal(allowedPermission(p, 'https://softe.ai/chat', SITE), true, p);
  }
});

test('từ chối quyền khác hoặc trang khác', () => {
  assert.equal(allowedPermission('geolocation', 'https://softe.ai/', SITE), false);
  assert.equal(allowedPermission('media', 'https://evil.com/', SITE), false);
  assert.equal(allowedPermission('media', 'https://softe.ai.evil.com/', SITE), false);
  assert.equal(allowedPermission('media', '', SITE), false);
});
