// Smoke test of the settings page in jsdom with a fake extension API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { installFakeBrowser } from './fake-browser.js';
import * as store from '../../shared/store.js';

let dom;
let doc;
let fake;
const downloads = [];
const day = 86_400_000;

async function waitFor(check, what, timeout = 2000) {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
const text = (id) => doc.getElementById(id).textContent;

before(async () => {
  fake = installFakeBrowser();
  let granted = true;
  fake.api.permissions = {
    contains: async () => granted,
    request: async () => (granted = true),
    remove: async () => !(granted = false),
    onAdded: { addListener() {} },
    onRemoved: { addListener() {} },
  };
  const now = Date.now();
  await store.recordCapture({ at: now, kind: 'http', imageUrl: 'https://a.com/new.png', pageUrl: 'https://a.com/', pageTitle: 'New', copied: true, thumb: 'data:image/webp;base64,N' });
  await store.recordCapture({ at: now - 100 * day, kind: 'http', imageUrl: 'https://a.com/old.png', pageUrl: 'https://a.com/', pageTitle: 'Old', copied: true });

  const html = await readFile(new URL('../../options/options.html', import.meta.url), 'utf8');
  dom = new JSDOM(html.replace(/<script[^>]*><\/script>/g, ''), { url: 'moz-extension://test/options/options.html' });
  doc = dom.window.document;
  const URLWithBlobs = class extends URL {};
  URLWithBlobs.createObjectURL = (blob) => {
    downloads.push(blob);
    return `blob:test/${downloads.length}`;
  };
  URLWithBlobs.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = function clickAnchor() {
    downloads.at(-1).filename = this.download;
  };
  Object.assign(globalThis, { window: dom.window, document: doc, URL: URLWithBlobs });
  await import('../../options/options.js');
  await waitFor(() => text('storage-info').includes('2 images'), 'storage info');
});

after(async () => {
  await new Promise((r) => setTimeout(r, 400)); // let the debounced storage refresh finish
  dom?.window.close();
});

test('shows site access and can turn it off', async () => {
  assert.equal(text('access-status'), 'Allowed on all websites');
  click(doc.getElementById('access-toggle'));
  await waitFor(() => text('access-status') === 'Not allowed', 'access off');
  click(doc.getElementById('access-toggle'));
  await waitFor(() => text('access-status') === 'Allowed on all websites', 'access on');
});

test('exports JSON and CSV as downloads', async () => {
  click(doc.getElementById('export-json'));
  await waitFor(() => text('export-msg') === 'Exported 2 images.', 'json export');
  const json = JSON.parse(await downloads.at(-1).text());
  assert.equal(json.format, 'image-collector');
  assert.equal(json.entries.length, 2);
  assert.match(downloads.at(-1).filename, /^image-collector-\d{4}-\d{2}-\d{2}\.json$/);

  click(doc.getElementById('export-csv'));
  await waitFor(() => text('export-msg').startsWith('Exported 2 rows'), 'csv export');
  assert.equal((await downloads.at(-1).text()).trimEnd().split('\r\n').length, 3);
});

test('auto-delete asks before deleting old images, and cancel reverts', async () => {
  const select = doc.getElementById('auto-delete');
  select.value = '90';
  select.dispatchEvent(new dom.window.Event('change'));
  const box = doc.getElementById('auto-delete-confirm');
  await waitFor(() => !box.hidden, 'confirm shown');
  assert.match(box.textContent, /1 image were last collected/);
  click(box.querySelector('[data-confirm="no"]'));
  await waitFor(() => select.value === '', 'reverted');
  assert.equal((await store.getSettings()).autoDeleteDays, null);

  select.value = '90';
  select.dispatchEvent(new dom.window.Event('change'));
  await waitFor(() => !box.hidden, 'confirm shown again');
  click(box.querySelector('[data-confirm="yes"]'));
  await waitFor(() => text('auto-delete-msg') === 'On. Deleted 1 image.', 'purged');
  assert.equal((await store.getSettings()).autoDeleteDays, 90);
  assert.equal((await store.loadAll()).length, 1);
});

test('delete everything confirms, then import restores from a file', async () => {
  const backup = await downloads[0].text();
  click(doc.getElementById('clear-all'));
  const box = doc.getElementById('clear-confirm');
  await waitFor(() => !box.hidden, 'clear confirm');
  click(box.querySelector('[data-confirm="yes"]'));
  await waitFor(() => text('clear-msg') === 'Deleted 1 image.', 'cleared');
  assert.equal((await store.loadAll()).length, 0);

  const input = doc.getElementById('import-file');
  const file = new dom.window.File([backup], 'backup.json', { type: 'application/json' });
  Object.defineProperty(input, 'files', { value: [Object.assign(file, { text: async () => backup })], configurable: true });
  input.dispatchEvent(new dom.window.Event('change'));
  await waitFor(() => text('import-msg').startsWith('Added'), 'import done');
  assert.equal(text('import-msg'), 'Added 2 images, merged 0.');
  assert.equal((await store.loadAll()).length, 2);
});

test('import reports a wrong file clearly', async () => {
  const input = doc.getElementById('import-file');
  Object.defineProperty(input, 'files', { value: [{ text: async () => '{"hello":1}' }], configurable: true });
  input.dispatchEvent(new dom.window.Event('change'));
  await waitFor(() => text('import-msg').startsWith('Import failed'), 'error');
  assert.match(text('import-msg'), /not an Image Collector export/);
  assert.ok(doc.getElementById('import-msg').classList.contains('error'));
});
