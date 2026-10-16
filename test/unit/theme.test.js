import { test } from 'node:test';
import assert from 'node:assert/strict';
import { themeVars, parseColor, isDark } from '../../shared/theme.js';

test('themeVars maps theme keys with fallbacks and skips missing ones', () => {
  assert.deepEqual(themeVars({}), {});
  assert.deepEqual(themeVars(undefined), {});
  const vars = themeVars({ toolbar: '#123456', toolbar_text: 'white', popup: [10, 20, 30], tab_line: 'rgb(1, 2, 3)' });
  assert.equal(vars['--ic-bg'], '#123456');
  assert.equal(vars['--ic-text'], 'white');
  assert.equal(vars['--ic-popup'], 'rgb(10, 20, 30)');
  assert.equal(vars['--ic-accent'], 'rgb(1, 2, 3)');
  assert.equal('--ic-field' in vars, false);
  assert.equal(themeVars({ sidebar: '#fff', toolbar: '#000' })['--ic-bg'], '#fff');
});

test('parseColor and isDark', () => {
  assert.deepEqual(parseColor('#fff'), [255, 255, 255]);
  assert.deepEqual(parseColor('#1c1b22'), [28, 27, 34]);
  assert.deepEqual(parseColor('rgba(10, 20, 30, 0.5)'), [10, 20, 30]);
  assert.equal(parseColor('papayawhip'), null);
  assert.equal(isDark('#1c1b22'), true);
  assert.equal(isDark('#f9f9fb'), false);
  assert.equal(isDark('rgb(120,120,120)'), true);
  assert.equal(isDark('nonsense'), null);
});
