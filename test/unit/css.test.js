import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// A `display` rule on an element beats the browser's default `[hidden] { display: none }`,
// which makes hidden dialogs show up. Every stylesheet must restore it.
for (const file of ['sidebar/sidebar.css', 'options/options.css']) {
  test(`${file} keeps [hidden] elements hidden`, async () => {
    const css = await readFile(new URL(`../../${file}`, import.meta.url), 'utf8');
    assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
  });
}
