'use strict';
// Ô cửa window.softeLocal ở phía main (softe-be/docs/ung-dung-may-tinh-chay-cuc-bo.md, mục 10.2): ba lời gọi, mỗi lời gọi qua cổng (gate.js).
//   softe-local:hello         -> mã cho khung trang này (hoặc null)
//   softe-local:capabilities  -> { extract: 'ok' | 'weak' | 'off', kinds, maxBytes }
//   softe-local:extract       -> { ok: true, text, pages, truncated, by } | { ok: false, reason }
// Mặc định TẮT (người dùng bật ở menu Trợ giúp) và tắt khi tư thế khởi động có điểm rủi ro. Mọi lỗi thành { ok: false } (không bao giờ ném ra trang).
const os = require('node:os');
const path = require('node:path');
const fsReal = require('node:fs');
const { createGate } = require('./gate');
const { createWorkerHost } = require('./worker-host');
const { normalize } = require('./result');
const settings = require('./settings');
const { LIMITS, deviceClass } = require('./limits');

const OFF = Object.freeze({ extract: 'off', kinds: Object.freeze([]), maxBytes: 0 });

function frameOf(ev) {
  const f = ev && ev.senderFrame;
  if (!f) return null;
  return { key: `${f.processId}:${f.routingId}`, url: String(f.url || ''), isTop: f.parent === null };
}

function deviceNow({ powerMonitor, osImpl = os }) {
  try {
    return deviceClass({
      totalMem: osImpl.totalmem(), cpus: osImpl.cpus().length,
      onBattery: powerMonitor ? powerMonitor.isOnBatteryPower() : undefined,
      thermal: powerMonitor && typeof powerMonitor.getCurrentThermalState === 'function' ? powerMonitor.getCurrentThermalState() : 'nominal',
    });
  } catch { return 'weak'; }
}

// `risky`: tư thế khởi động có cờ gỡ lỗi từ xa hay NODE_OPTIONS (posture.js): ai nối được vào bộ gỡ lỗi đọc được tệp: không xử lý gì trên máy.
function install({ electron, cfg, version, risky = false, fs = fsReal, dir = __dirname, userData, host }) {
  const { ipcMain, powerMonitor } = electron;
  const file = path.join(userData, settings.NAME);
  let enabled = settings.readEnabled(file, fs);
  const gate = createGate({ site: cfg.site });
  const worker = host || createWorkerHost({ electron, dir, fs });
  const usable = () => enabled && !risky;

  ipcMain.handle('softe-local:hello', (ev) => { try { return usable() ? gate.hello(frameOf(ev)) : null; } catch { return null; } });

  ipcMain.handle('softe-local:capabilities', (ev) => {
    try {
      const f = frameOf(ev);
      if (!usable() || !gate.allows(f)) return OFF;
      return { extract: deviceNow({ powerMonitor }) === 'ok' ? 'ok' : 'weak', kinds: ['pdf'], maxBytes: LIMITS.maxBytes };
    } catch { return OFF; }
  });

  ipcMain.handle('softe-local:extract', async (ev, token, payload) => {
    try {
      if (!usable()) return { ok: false, reason: 'off' };
      if (deviceNow({ powerMonitor }) !== 'ok') return { ok: false, reason: 'weak' };
      if (!payload || typeof payload !== 'object' || payload.kind !== 'pdf' || typeof payload.name !== 'string' || payload.name.length > 255) return { ok: false, reason: 'unsupported' };
      const b = payload.bytes;
      const bytes = b instanceof ArrayBuffer ? new Uint8Array(b.slice(0)) : ArrayBuffer.isView(b) ? new Uint8Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)) : null;
      if (!bytes) return { ok: false, reason: 'unsupported' };
      const admitted = gate.admit(frameOf(ev), token, { size: bytes.length });
      if (!admitted.ok) return { ok: false, reason: admitted.reason };
      try {
        return normalize(await worker.run(bytes, { budgetMs: LIMITS.jobMs }), version);
      } finally { admitted.release(); }
    } catch { return { ok: false, reason: 'failed' }; }
  });

  return {
    get enabled() { return enabled; },
    setEnabled(on) { enabled = on === true; settings.writeEnabled(file, fs, enabled); return enabled; },
    gate,
  };
}

module.exports = { install, frameOf, deviceNow, OFF };
