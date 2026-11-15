'use strict';
// Gọi người dùng khi một phiên Softe Code đợi họ (src/attention.js): hàm thuần, không cần Electron.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const attention = require('../src/attention');

// Đúng như softe-fe src/lib/code-title.ts::tabTitle (tên phiên tối đa 60 ký tự).
const tab = (status, name, lang = 'vi', waiting = 1) => {
  const en = lang === 'en';
  switch (status) {
    case 'running': case 'waiting_ci': return `● ${name} · Code`;
    case 'awaiting_input': return `❓ ${en ? 'Needs you' : 'Cần bạn'}${waiting > 1 ? ` (${waiting})` : ''}: ${name}`;
    case 'paused_budget': return `⏸ ${en ? 'Paused' : 'Tạm dừng'}: ${name}`;
    case 'failed': return `⚠ ${en ? 'Failed' : 'Lỗi'}: ${name}`;
    default: return `${name} · Code`;
  }
};

test('needsAttention: phiên đợi người dùng, tạm dừng vì hết ngân sách, hoặc lỗi; cả tiếng Việt và tiếng Anh', () => {
  for (const lang of ['vi', 'en']) {
    for (const name of ['Sửa lỗi đăng nhập', 'Fix login', 'a', 'Cần bạn: ⏸ ⚠ ●', 'x'.repeat(60)]) {
      assert.strictEqual(attention.needsAttention(tab('awaiting_input', name, lang)), true, `${lang} awaiting ${name}`);
      assert.strictEqual(attention.needsAttention(tab('awaiting_input', name, lang, 3)), true, `${lang} awaiting (3) ${name}`);
      assert.strictEqual(attention.needsAttention(tab('paused_budget', name, lang)), true, `${lang} paused ${name}`);
      assert.strictEqual(attention.needsAttention(tab('failed', name, lang)), true, `${lang} failed ${name}`);
      for (const st of ['running', 'waiting_ci', 'idle', 'closed', null]) assert.strictEqual(attention.needsAttention(tab(st, name, lang)), false, `${lang} ${st} ${name}`);
    }
  }
});

test('needsAttention: tiêu đề khác thì không (trang khác của softe.ai, hai trang của app, chữ giống mà không đúng dạng)', () => {
  for (const t of ['Softe', 'softe.ai', 'Đang mở Softe…', 'Không có mạng', 'Trò chuyện · softe.ai', 'Cần bạn: x', 'Needs you: x', '❓Cần bạn: x', '❓ Cần bạn x',
    '❓ cần bạn: x', '❓ Needs You: x', '❓ Cần bạn (): x', '❓ Cần bạn (a): x', 'x ❓ Cần bạn: x', '⏸ Paused x', '⚠️ Lỗi: x', '⚠ Error: x', ' ❓ Cần bạn: x',
    '', null, undefined, 42, {}, `❓ Cần bạn: ${'x'.repeat(500)}`]) {
    assert.strictEqual(attention.needsAttention(t), false, JSON.stringify(t));
  }
});

test('needsAttention: chữ tiếng Việt viết kiểu tổ hợp (NFD) vẫn nhận ra', () => {
  assert.strictEqual(attention.needsAttention('❓ Cần bạn: x'.normalize('NFD')), true);
  assert.strictEqual(attention.needsAttention('⏸ Tạm dừng: x'.normalize('NFD')), true);
  assert.strictEqual(attention.needsAttention('⚠ Lỗi: x'.normalize('NFD')), true);
});

test('attentionStep: gọi một lần khi tiêu đề CHUYỂN sang cần người dùng mà cửa sổ không được xem; thấy rồi thì không gọi lại', () => {
  const steps = (focusedSeq, titles) => {
    let last = null; const out = [];
    titles.forEach((t, i) => { const r = attention.attentionStep(last, t, focusedSeq[i]); last = r.last; out.push(r.alert); });
    return out;
  };
  const need = tab('awaiting_input', 'A'); const need2 = tab('awaiting_input', 'A', 'vi', 2); const run = tab('running', 'A'); const plain = tab('idle', 'A');
  // không được xem: gọi đúng một lần, tiêu đề lặp lại thì không gọi thêm
  assert.deepStrictEqual(steps([false, false, false], [run, need, need]), [false, true, false]);
  // thêm một việc đợi (tiêu đề khác): gọi nữa
  assert.deepStrictEqual(steps([false, false, false], [need, need2, need2]), [true, true, false]);
  // đang được xem lúc tiêu đề đổi: người dùng thấy rồi, rời cửa sổ mà tiêu đề không đổi thì không gọi
  assert.deepStrictEqual(steps([true, false], [need, need]), [false, false]);
  // xong việc rồi lại cần: gọi lại
  assert.deepStrictEqual(steps([false, false, false, false], [need, run, plain, need]), [true, false, false, true]);
  // giá trị focused lạ thì coi như không được xem
  assert.strictEqual(attention.attentionStep(null, need, undefined).alert, true);
  assert.deepStrictEqual(attention.attentionStep('x', run, false), { alert: false, last: null });
  assert.deepStrictEqual(attention.attentionStep(null, need.normalize('NFD'), false), { alert: true, last: need.normalize('NFC') });
});

test('khớp tiêu đề của web: bản sao ở test này giống softe-fe src/lib/code-title.ts (khi có repo web bên cạnh)', (t) => {
  const file = path.join(__dirname, '..', '..', 'softe-fe', 'src', 'lib', 'code-title.ts');
  if (!fs.existsSync(file)) { t.skip('không có softe-fe bên cạnh'); return; }
  const src = fs.readFileSync(file, 'utf8');
  for (const piece of ["return `● ${name} · Code`", "`❓ ${en ? 'Needs you' : 'Cần bạn'}${a.waiting > 1 ? ` (${a.waiting})` : ''}: ${name}`",
    "`⏸ ${en ? 'Paused' : 'Tạm dừng'}: ${name}`", "`⚠ ${en ? 'Failed' : 'Lỗi'}: ${name}`", 'return `${name} · Code`']) {
    assert.ok(src.includes(piece), `code-title.ts còn: ${piece}`);
  }
});
