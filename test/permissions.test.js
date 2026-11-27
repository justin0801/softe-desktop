'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { allowedPermission } = require('../src/config');

const SITE = 'https://softe.ai';

test('cấp micro, sao chép, toàn màn hình cho softe.ai', () => {
  assert.equal(allowedPermission('media', 'https://softe.ai/chat', SITE, { mediaTypes: ['audio'] }), true);
  for (const p of ['clipboard-sanitized-write', 'fullscreen']) assert.equal(allowedPermission(p, 'https://softe.ai/chat', SITE), true, p);
});

test('quyền media: chỉ âm thanh; hình, âm thanh + hình, thiếu hay rỗng đều bị từ chối', () => {
  const ask = (details) => allowedPermission('media', 'https://softe.ai/chat', SITE, details);
  assert.equal(ask({ mediaTypes: ['audio'] }), true);
  assert.equal(ask({ mediaTypes: ['video'] }), false);
  assert.equal(ask({ mediaTypes: ['audio', 'video'] }), false);
  assert.equal(ask({ mediaTypes: [] }), false);
  assert.equal(ask({}), false);
  assert.equal(ask(undefined), false);
  assert.equal(allowedPermission('media', 'https://softe.ai/chat', SITE), false);
  assert.equal(ask({ mediaTypes: 'audio' }), false);
});

test('kiểm quyền media (mediaType): audio và unknown được trả lời như micro, video và giá trị lạ thì không', () => {
  const check = (details) => allowedPermission('media', 'https://softe.ai/', SITE, details);
  assert.equal(check({ mediaType: 'audio' }), true);
  assert.equal(check({ mediaType: 'unknown' }), true);
  assert.equal(check({ mediaType: 'video' }), false);
  assert.equal(check({ mediaType: 'screen' }), false);
  assert.equal(check({}), false);
});

test('từ chối quyền khác, và mọi quyền với trang khác', () => {
  for (const p of ['geolocation', 'notifications', 'clipboard-read', 'midi', 'openExternal']) assert.equal(allowedPermission(p, 'https://softe.ai/', SITE), false, p);
  for (const u of ['https://evil.com/', 'https://softe.ai.evil.com/', 'http://softe.ai/', '', undefined]) assert.equal(allowedPermission('media', u, SITE, { mediaTypes: ['audio'] }), false, String(u));
});
