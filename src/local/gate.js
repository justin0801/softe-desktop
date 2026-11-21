'use strict';
// Cổng của ô cửa window.softeLocal ở phía main: ai được gọi, mỗi lần bao nhiêu, bao nhiêu việc một lúc. Thuần (không Electron).
// Luật: chỉ KHUNG TRÊN CÙNG của trang softe.ai thật; mỗi lần tải trang có một mã dùng cho cả phiên trang đó (đổi trang là mã cũ hết hiệu lực);
// một việc một lúc; tối đa N việc mỗi phút; đầu vào có trần; không bao giờ ném lỗi ra ngoài.
const crypto = require('node:crypto');
const { allowedHost } = require('../config');
const { LIMITS } = require('./limits');

function createGate({ site, now = Date.now, token = () => crypto.randomBytes(24).toString('hex'), limits = LIMITS } = {}) {
  const issued = new Map(); // khung -> { token, url }
  const recent = [];
  let busy = false;

  // allowedHost đối chiếu giao thức và tên máy; ô cửa còn đòi CÙNG CỔNG (softe.ai:8443 hay một cổng khác không phải trang của app).
  const portOf = (u) => { try { return new URL(u).port; } catch { return null; } };
  const sitePort = portOf(site);
  const siteFrame = (f) => !!f && f.isTop === true && typeof f.url === 'string' && /^https?:\/\//.test(f.url) && allowedHost(f.url, site) && portOf(f.url) === sitePort && typeof f.key === 'string';

  return {
    // Trang gọi lần đầu: cấp mã cho đúng khung này (và đúng địa chỉ lúc này).
    hello(frame) {
      if (!siteFrame(frame)) return null;
      const t = token();
      issued.set(frame.key, { token: t, url: frame.url });
      return t;
    },
    // Trước mỗi việc. Trả { ok: true, release } hoặc { ok: false, reason }.
    admit(frame, tok, { size } = {}) {
      if (!siteFrame(frame)) return { ok: false, reason: 'off' };
      const rec = issued.get(frame.key);
      if (!rec || typeof tok !== 'string' || rec.token !== tok || rec.url !== frame.url) return { ok: false, reason: 'off' };
      if (!Number.isFinite(size) || size <= 0) return { ok: false, reason: 'unsupported' };
      if (size > limits.maxBytes) return { ok: false, reason: 'too_large' };
      if (busy) return { ok: false, reason: 'busy' };
      const t = now();
      while (recent.length && t - recent[0] > 60_000) recent.shift();
      if (recent.length >= limits.perMinute) return { ok: false, reason: 'busy' };
      busy = true; recent.push(t);
      let done = false;
      return { ok: true, release() { if (!done) { done = true; busy = false; } } };
    },
    // Chỉ để hỏi "khung này có phải trang softe.ai thật, khung trên cùng không" (capabilities không được cho trang lạ biết máy khỏe hay yếu).
    allows: siteFrame,
    forget(frameKey) { issued.delete(frameKey); },
    get busy() { return busy; },
  };
}

module.exports = { createGate };
