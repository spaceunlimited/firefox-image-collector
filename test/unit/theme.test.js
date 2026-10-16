import { test } from 'node:test';
import assert from 'node:assert/strict';
import { themeVars, parseColor, isDark, chooseVars, colorAlpha } from '../../shared/theme.js';

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

// Ash (nova-ash@mozilla.org) light colors, as theme.getCurrent() returns them even in dark mode.
const ASH_LIGHT = { frame: [239, 237, 242], toolbar: [255, 255, 255, 0.4], sidebar: [255, 255, 255], sidebar_text: [18, 17, 20], toolbar_field: [255, 255, 255] };

test('chooseVars drops light colors when Firefox is dark, and the reverse', () => {
  assert.deepEqual(chooseVars(ASH_LIGHT, true), {});
  assert.equal(chooseVars(ASH_LIGHT, false)['--ic-bg'], 'rgb(255, 255, 255)');
  const darkOnly = { sidebar: '#1d1b1f', sidebar_text: '#fff' };
  assert.equal(chooseVars(darkOnly, true)['--ic-bg'], '#1d1b1f');
  assert.deepEqual(chooseVars(darkOnly, false), {});
  assert.equal(chooseVars(darkOnly, null)['--ic-bg'], '#1d1b1f');
  assert.deepEqual(chooseVars({}, true), {});
});

test('translucent colors are not used as solid backgrounds', () => {
  assert.equal(colorAlpha('rgba(255, 255, 255, 0.4)'), 0.4);
  assert.equal(colorAlpha('#ffffff80').toFixed(2), '0.50');
  assert.equal(colorAlpha('#fff'), 1);
  assert.equal(themeVars({ toolbar: [255, 255, 255, 0.4], frame: [239, 237, 242] })['--ic-bg'], 'rgb(239, 237, 242)');
});

test('shortRelativeTime', async () => {
  const { shortRelativeTime } = await import('../../shared/format.js');
  const now = 1_000_000_000_000;
  assert.equal(shortRelativeTime(now - 10_000, now), 'now');
  assert.equal(shortRelativeTime(now - 14 * 60_000, now), '14m');
  assert.equal(shortRelativeTime(now - 3 * 3_600_000, now), '3h');
  assert.equal(shortRelativeTime(now - 2 * 86_400_000, now), '2d');
  assert.equal(shortRelativeTime(now - 400 * 86_400_000, now), '1y');
});

test('a field the same color as the background gets a visible tint', () => {
  const vars = themeVars({ sidebar: [255, 255, 255], sidebar_text: [18, 17, 20], toolbar_field: [255, 255, 255] });
  assert.match(vars['--ic-field'], /^color-mix/);
  assert.equal(themeVars({ sidebar: '#ffffff', toolbar_field: '#e0e0e6' })['--ic-field'], '#e0e0e6');
});
