'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { template, GO } = require('../src/menu');

const noop = () => {};
const build = (plat) => template({ plat, home: noop, goto: noop, back: noop, forward: noop, checkUpdate: noop });
const items = (t) => t.flatMap((m) => m.submenu || []);

test('menu Sửa không giữ Hoàn tác / Làm lại (để Cmd/Ctrl+Z tới trình dựng phim)', () => {
  for (const plat of ['mac', 'win']) {
    const t = build(plat);
    const edit = t.find((m) => m.label === 'Sửa');
    assert.ok(edit);
    assert.deepEqual(edit.submenu.map((i) => i.role), ['cut', 'copy', 'paste', 'selectAll']);
    assert.ok(!t.some((m) => m.role === 'editMenu'));
    assert.ok(!items(t).some((i) => /^(undo|redo)$/.test(i.role || '') || /(^|\+)z$/i.test(i.accelerator || '')));
  }
});

test('menu Đi tới: Cmd/Ctrl+4 là Dựng phim, đường dẫn trong softe.ai', () => {
  const go = build('win').find((m) => m.label === 'Đi tới');
  const four = go.submenu.find((i) => i.accelerator === 'CmdOrCtrl+4');
  assert.equal(four.label, 'Dựng phim');
  let got; template({ plat: 'win', home: noop, goto: (p) => { got = p; }, back: noop, forward: noop, checkUpdate: noop })
    .find((m) => m.label === 'Đi tới').submenu.find((i) => i.accelerator === 'CmdOrCtrl+4').click();
  assert.equal(got, '/studio/film/editor');
  for (const g of GO) assert.match(g.path, /^\/[a-z\/]+$/);
});

test('không có hai lối tắt trùng nhau', () => {
  const keys = items(build('mac')).map((i) => i.accelerator).filter(Boolean);
  assert.equal(new Set(keys).size, keys.length);
});
