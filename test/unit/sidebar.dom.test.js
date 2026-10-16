// Smoke test of the sidebar page in jsdom with a fake extension API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { installFakeBrowser } from './fake-browser.js';
import * as store from '../../shared/store.js';

let dom;
let fake;
let doc;
const realSetInterval = globalThis.setInterval;

async function waitFor(check, what, timeout = 2000) {
  const start = Date.now();
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 20));
  }
}

const cards = () => [...doc.querySelectorAll('#list .card')];
const cardFor = (id) => doc.querySelector(`#list .card[data-id="${id}"]`);
const click = (el) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
const key = (el, k) => el.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

let pngId;
let fileId;

before(async () => {
  fake = installFakeBrowser();
  const now = Date.now();
  pngId = (
    await store.recordCapture({
      at: now - 60_000, kind: 'http', imageUrl: 'https://cdn.example.com/a.png', pageUrl: 'https://example.com/article',
      pageTitle: 'An article', copied: true, hash: 'sha256:a', width: 640, height: 400, thumb: 'data:image/webp;base64,AA',
    })
  ).entry.id;
  await store.recordCapture({
    at: now - 30_000, kind: 'http', imageUrl: 'https://cdn.example.com/a.png', pageUrl: 'https://other.org/page',
    pageTitle: 'Other page', copied: true,
  });
  fileId = (
    await store.recordCapture({
      at: now, kind: 'http', imageUrl: 'file:///tmp/x.png', pageUrl: 'file:///tmp/page.html',
      pageTitle: 'Local page', copied: false, reason: 'cors',
    })
  ).entry.id;

  const html = await readFile(new URL('../../sidebar/sidebar.html', import.meta.url), 'utf8');
  dom = new JSDOM(html.replace(/<script[^>]*><\/script>/g, ''), { url: 'moz-extension://test/sidebar/sidebar.html' });
  doc = dom.window.document;
  Object.assign(globalThis, {
    window: dom.window,
    document: doc,
    innerWidth: 320,
    innerHeight: 800,
    CSS: { escape: (s) => String(s).replace(/["\\]/g, '\\$&') },
    IntersectionObserver: class {
      constructor(cb) {
        this.cb = cb;
      }
      observe(target) {
        this.cb([{ isIntersecting: true, target }]);
      }
      unobserve() {}
      disconnect() {}
    },
    setInterval: () => 0,
  });
  await import('../../sidebar/sidebar.js');
  await waitFor(() => cards().length === 2, 'initial render');
});

after(() => {
  globalThis.setInterval = realSetInterval;
  dom?.window.close();
});

test('renders one card per image, newest first, grouped by day', () => {
  assert.deepEqual(cards().map((c) => c.dataset.id), [fileId, pngId]);
  assert.equal(doc.querySelector('.group-label').textContent, 'Today');
  assert.equal(cardFor(pngId).querySelector('.count').textContent, '×2');
  assert.equal(cardFor(pngId).querySelector('.dims').textContent, '640 × 400');
  assert.equal(cardFor(fileId).querySelector('.warn').hidden, false);
  assert.equal(doc.getElementById('empty').hidden, true);
});

test('thumbnail opens the latest source page; file: pages show a notice', async () => {
  click(cardFor(pngId).querySelector('.thumb'));
  await waitFor(() => fake.calls.tabsCreate.length === 1, 'tabs.create');
  assert.equal(fake.calls.tabsCreate[0].url, 'https://other.org/page');
  click(cardFor(fileId).querySelector('.thumb'));
  await waitFor(() => !doc.getElementById('notice').hidden, 'notice');
  assert.match(doc.querySelector('.notice-text').textContent, /doesn't let extensions open/);
  assert.equal(fake.calls.tabsCreate.length, 1);
});

test('card menu opens, disables what is unavailable, and closes on Escape', () => {
  const btn = cardFor(pngId).querySelector('.menu-btn');
  click(btn);
  const menuEl = doc.getElementById('card-menu');
  assert.equal(menuEl.hidden, false);
  assert.equal(btn.getAttribute('aria-expanded'), 'true');
  assert.equal(menuEl.querySelector('[data-action="open-image"]').disabled, false);
  key(menuEl, 'Escape');
  assert.equal(menuEl.hidden, true);
});

test('details shows facts and history; tags can be added and removed', async () => {
  click(cardFor(pngId).querySelector('.menu-btn'));
  click(doc.querySelector('#card-menu [data-action="details"]'));
  const panel = doc.getElementById('details');
  assert.equal(panel.hidden, false);
  assert.equal(panel.querySelectorAll('.capture-list li').length, 2);
  assert.match(panel.querySelector('.capture-list li').textContent, /Other page/);
  assert.equal(panel.querySelector('.f-dims').textContent, '640 × 400');

  const input = panel.querySelector('.tag-input');
  input.value = '  Mood Board ';
  key(input, 'Enter');
  await waitFor(() => panel.querySelector('.tag-chip'), 'tag chip');
  assert.deepEqual((await store.getEntry(pngId)).tags, ['mood board']);
  await waitFor(() => doc.querySelector('#tag-filters .chip'), 'tag filter chip');

  click(panel.querySelector('.tag-remove'));
  await waitFor(() => !panel.querySelector('.tag-chip'), 'tag removed');
  assert.deepEqual((await store.getEntry(pngId)).tags, []);

  key(doc.body, 'Escape');
  assert.equal(panel.hidden, true);
});

test('re-copy sends a message and reports the result', async () => {
  click(cardFor(pngId).querySelector('.menu-btn'));
  click(doc.querySelector('#card-menu [data-action="recopy"]'));
  await waitFor(() => fake.calls.messages.length === 1, 'recopy message');
  assert.deepEqual(fake.calls.messages[0], { type: 'recopy', id: pngId });
  await waitFor(() => doc.querySelector('.notice-text').textContent === 'Copied', 'Copied notice');
});

test('delete removes the card and Undo restores it', async () => {
  click(cardFor(pngId).querySelector('.menu-btn'));
  click(doc.querySelector('#card-menu [data-action="delete"]'));
  await waitFor(() => cards().length === 1, 'card removed');
  await waitFor(() => !fake.data.has(store.entryKey(pngId)), 'entry removed from storage');
  assert.equal(fake.data.has(store.thumbKey(pngId)), false);
  const undo = await waitFor(() => {
    const b = doc.querySelector('.notice-action');
    return !b.hidden && b.textContent === 'Undo' && b;
  }, 'Undo button');
  click(undo);
  await waitFor(() => cards().length === 2, 'card restored');
  assert.equal((await store.getEntry(pngId)).captures.length, 2);
});

test('search filters cards as you type', async () => {
  const search = doc.getElementById('search');
  search.value = 'other.org';
  search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await waitFor(() => cards().length === 1, 'filtered');
  assert.equal(cards()[0].dataset.id, pngId);
  search.value = '';
  search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  await waitFor(() => cards().length === 2, 'unfiltered');
});

test('banner offers site access when a copy was blocked and access is off', async () => {
  const banner = doc.getElementById('access-banner');
  assert.equal(banner.hidden, true);
  await fake.api.permissions.remove();
  await waitFor(() => !banner.hidden, 'banner shown');
  click(doc.getElementById('grant-access'));
  await waitFor(() => banner.hidden, 'banner hidden after grant');
  assert.match(doc.querySelector('.notice-text').textContent, /Site access allowed/);
});
