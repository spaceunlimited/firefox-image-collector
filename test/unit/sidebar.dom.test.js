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
    const value = await check();
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
      pageTitle: 'An article', copied: true, hash: 'sha256:a', width: 640, height: 400, thumb: 'data:image/webp;base64,AA', mime: 'image/png',
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
  fake.api.theme.current = { colors: { sidebar: '#102030', sidebar_text: '#ffffff', popup: '#203040' } };
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
  assert.equal(cardFor(pngId).querySelector('.count-badge').textContent, '2×');
  assert.equal(cardFor(pngId).querySelector('.dims').textContent, '640 × 400');
  assert.equal(cardFor(fileId).querySelector('.warn').hidden, false);
  assert.equal(cardFor(pngId).querySelector('.type-label').textContent, 'PNG');
  assert.equal(cardFor(fileId).querySelector('.type-label').hidden, true);
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

  // A second image gets the existing tag offered as a suggestion.
  key(doc.body, 'Escape');
  click(cardFor(fileId).querySelector('.menu-btn'));
  click(doc.querySelector('#card-menu [data-action="tags"]'));
  const input2 = panel.querySelector('.tag-input');
  input2.value = 'mo';
  input2.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const suggestion = await waitFor(() => panel.querySelector('.tag-suggestion'), 'suggestion');
  assert.equal(suggestion.textContent, 'mood board');
  suggestion.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
  click(suggestion);
  await waitFor(async () => (await store.getEntry(fileId)).tags.includes('mood board'), 'suggested tag saved');
  assert.deepEqual((await store.getEntry(fileId)).tags, ['mood board']);
  assert.equal(input2.value, '');
  key(doc.body, 'Escape');

  click(cardFor(pngId).querySelector('.menu-btn'));
  click(doc.querySelector('#card-menu [data-action="details"]'));
  await waitFor(() => panel.querySelector('.tag-chip'), 'tag chip again');
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

const openPanel = () => {
  const panel = doc.getElementById('view-panel');
  if (panel.hidden) click(doc.getElementById('options-btn'));
  return panel;
};

test('date range in the options panel narrows the list and the pill clears it', async () => {
  const panel = openPanel();
  assert.equal(panel.hidden, false);
  assert.equal(panel.querySelector('[data-range="all"]').getAttribute('aria-checked'), 'true');
  click(panel.querySelector('[data-range="today"]'));
  const pill = doc.getElementById('range-pill');
  assert.equal(pill.hidden, false);
  assert.equal(pill.textContent, 'Today');
  assert.equal(doc.getElementById('filter-bar').hidden, false);
  assert.equal(cards().length, 2);
  click(pill);
  assert.equal(pill.hidden, true);
  key(panel, 'Escape');
  assert.equal(panel.hidden, true);
});

test('day groups fold and unfold', () => {
  const head = doc.querySelector('.group-head');
  assert.equal(head.getAttribute('aria-expanded'), 'true');
  click(head);
  assert.equal(cards().length, 0);
  assert.equal(doc.querySelector('.group-head').getAttribute('aria-expanded'), 'false');
  click(doc.querySelector('.group-head'));
  assert.equal(cards().length, 2);
});

test('follows the installed theme and returns to defaults', async () => {
  const root = doc.documentElement;
  assert.equal(root.style.getPropertyValue('--ic-bg'), '#102030');
  assert.equal(root.style.getPropertyValue('--ic-popup'), '#203040');
  assert.equal(root.style.colorScheme, 'dark');
  fake.api.theme.set({});
  await waitFor(() => root.style.getPropertyValue('--ic-bg') === '', 'theme reset');
  assert.equal(root.dataset.theme, 'default');
});

test('typing in search suggests tags; picking one adds a filter chip; Backspace removes it', async () => {
  await store.updateEntry(pngId, (e) => {
    e.tags = ['mood board', 'logo'];
  });
  await store.updateEntry(fileId, (e) => {
    e.tags = [];
  });
  await waitFor(() => cards().length === 2 && fake.data.get(store.entryKey(pngId)).tags.length === 2, 'tags saved');
  await new Promise((r) => setTimeout(r, 150));
  const search = doc.getElementById('search');
  search.value = 'mo';
  search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  const list = doc.getElementById('tag-suggest');
  assert.equal(list.hidden, false);
  assert.deepEqual([...list.querySelectorAll('[role=option]')].map((o) => o.dataset.tag), ['mood board']);
  assert.equal(search.getAttribute('aria-expanded'), 'true');
  key(search, 'Enter');
  assert.equal(list.hidden, true);
  assert.equal(search.value, '');
  assert.deepEqual([...doc.querySelectorAll('#search-tokens .token')].map((t) => t.firstChild.textContent), ['mood board']);
  await waitFor(() => cards().length === 1, 'filtered by tag');
  assert.equal(cards()[0].dataset.id, pngId);
  key(search, 'Backspace');
  assert.equal(doc.querySelectorAll('#search-tokens .token').length, 0);
  await waitFor(() => cards().length === 2, 'filter removed');
});

test('group by tag follows the tag order, which can be rearranged and is remembered', async () => {
  const panel = openPanel();
  click(panel.querySelector('[data-group="tag"]'));
  assert.equal(panel.querySelector('.tag-groups').hidden, false);
  const labels = () => [...doc.querySelectorAll('.group-label')].map((l) => l.textContent);
  assert.deepEqual(labels(), ['logo', 'mood board', 'Untagged']);
  assert.deepEqual([...panel.querySelectorAll('.tag-row')].map((r) => r.dataset.tag), ['logo', 'mood board']);
  // Move "mood board" up.
  click(panel.querySelector('.tag-row[data-tag="mood board"] [data-move="up"]'));
  assert.deepEqual(labels(), ['mood board', 'logo', 'Untagged']);
  // Untick "logo": its group disappears.
  const box = panel.querySelector('.tag-row[data-tag="logo"] input');
  box.checked = false;
  box.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.deepEqual(labels(), ['mood board', 'Untagged']);
  // Hide images not in a group.
  const rest = panel.querySelector('.rest-toggle input');
  rest.checked = false;
  rest.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.deepEqual(labels(), ['mood board']);
  await waitFor(async () => (await store.getSettings()).showRest === false, 'settings saved');
  const settings = await store.getSettings();
  assert.equal(settings.groupBy, 'tag');
  assert.deepEqual(settings.tagOrder, ['mood board', 'logo']);
  assert.deepEqual(settings.hiddenTags, ['logo']);
  // Restore for the following tests.
  rest.checked = true;
  rest.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  const box2 = panel.querySelector('.tag-row[data-tag="logo"] input');
  box2.checked = true;
  box2.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
});

test('sort oldest first applies within groups; group by none shows one list', () => {
  const panel = openPanel();
  click(panel.querySelector('[data-group="date"]'));
  assert.deepEqual(cards().map((c) => c.dataset.id), [fileId, pngId]);
  click(panel.querySelector('[data-sort="added-asc"]'));
  assert.deepEqual(cards().map((c) => c.dataset.id), [pngId, fileId]);
  click(panel.querySelector('[data-group="none"]'));
  assert.equal(doc.querySelectorAll('.group-head').length, 0);
  assert.deepEqual(cards().map((c) => c.dataset.id), [pngId, fileId]);
  click(panel.querySelector('[data-sort="added-desc"]'));
  click(panel.querySelector('[data-group="date"]'));
  key(panel, 'Escape');
});
