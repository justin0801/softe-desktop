'use strict';
// Trang có cảnh báo "chưa lưu" (beforeunload): app phải hỏi, không được âm thầm chặn việc đóng / tải lại.
const test = require('node:test');
const assert = require('node:assert');
const { bootMain } = require('./main-harness');
const { TEXTS } = require('../src/texts');

const unload = (wc) => { let prevented = false; wc.emit('will-prevent-unload', { preventDefault() { prevented = true; } }); return prevented; };

test('cửa sổ chính: chọn "Rời đi" thì cho rời (bỏ qua cảnh báo của trang)', () => {
  const m = bootMain({ leaveChoice: 0 });
  assert.equal(unload(m.wc), true);
  assert.equal(m.boxes.length, 1);
  assert.deepEqual(m.boxes[0].buttons, [TEXTS.vi.leavePage, TEXTS.vi.stayPage]);
});

test('cửa sổ chính: chọn "Ở lại" (hoặc đóng hộp) thì giữ trang', () => {
  assert.equal(unload(bootMain({ leaveChoice: 1 }).wc), false);
});

test('cửa sổ con cũng được hỏi', () => {
  const m = bootMain({ leaveChoice: 0 });
  const child = m.child();
  assert.equal(unload(child.webContents), true);
  assert.equal(m.boxes.length, 1);
});

test('hộp hỏi mặc định là "Ở lại" (không mất dữ liệu khi bấm Enter)', () => {
  const m = bootMain();
  unload(m.wc);
  assert.equal(m.boxes[0].defaultId, 1);
  assert.equal(m.boxes[0].cancelId, 1);
});
