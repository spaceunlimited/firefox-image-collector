import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { ICON_PATHS } from '../../shared/icons.js';

const read = (p) => readFile(new URL(`../../${p}`, import.meta.url), 'utf8');

test('every icon used in markup and scripts exists in the generated set', async () => {
  const used = new Set();
  const html = await read('sidebar/sidebar.html');
  for (const m of html.matchAll(/data-icon="([^"]+)"/g)) used.add(m[1]);
  for (const f of await readdir(new URL('../../sidebar/', import.meta.url))) {
    if (!f.endsWith('.js')) continue;
    const js = await read(`sidebar/${f}`);
    for (const m of js.matchAll(/createIcon\('([^']+)'/g)) used.add(m[1]);
  }
  used.add('up').add('down'); // view-options.js passes these through a variable
  assert.ok(used.size >= 16, `found only ${used.size} icon uses`);
  for (const name of used) assert.ok(ICON_PATHS[name], `missing icon: ${name}`);
});

test('no inline icon paths are left in the sidebar markup', async () => {
  const html = await read('sidebar/sidebar.html');
  assert.equal(/<svg[^>]*>\s*<(path|circle)/.test(html), false);
});
