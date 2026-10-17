import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeBrowser } from './fake-browser.js';
import * as store from '../../shared/store.js';

let fake;
beforeEach(() => {
  fake = installFakeBrowser();
});

const cap = (over = {}) => ({
  at: 1_000,
  kind: 'http',
  imageUrl: 'https://cdn.com/a.png',
  pageUrl: 'https://site.com/page',
  pageTitle: 'Page',
  copied: true,
  hash: 'sha256:aaa',
  width: 100,
  height: 50,
  thumb: 'data:image/webp;base64,T',
  ...over,
});

test('first capture creates an entry, thumb and index', async () => {
  const { entry, isNew } = await store.recordCapture(cap());
  assert.equal(isNew, true);
  assert.deepEqual(entry.urls, ['https://cdn.com/a.png']);
  assert.equal(entry.copyCount, 1);
  assert.equal(entry.hasThumb, true);
  assert.equal(fake.data.get(store.thumbKey(entry.id)), 'data:image/webp;base64,T');
  const index = await store.readIndex();
  assert.deepEqual(index.ids, [{ id: entry.id, last: 1000 }]);
  assert.equal(index.urls['https://cdn.com/a.png'], entry.id);
  assert.equal(index.hashes['sha256:aaa'], entry.id);
});

test('same URL merges into one entry with two captures', async () => {
  const a = await store.recordCapture(cap());
  const b = await store.recordCapture(cap({ at: 2_000, pageUrl: 'https://other.com/', hash: null, thumb: null }));
  assert.equal(b.isNew, false);
  assert.equal(b.entry.id, a.entry.id);
  assert.equal(b.entry.captures.length, 2);
  assert.equal(b.entry.lastCapturedAt, 2000);
  assert.equal(b.entry.copyCount, 2);
});

test('fragment differences still merge', async () => {
  const a = await store.recordCapture(cap());
  const b = await store.recordCapture(cap({ imageUrl: 'https://cdn.com/a.png#x' }));
  assert.equal(b.entry.id, a.entry.id);
});

test('same bytes under a different URL merge and list both URLs', async () => {
  const a = await store.recordCapture(cap());
  const b = await store.recordCapture(cap({ imageUrl: 'https://mirror.com/a.png', at: 3_000 }));
  assert.equal(b.entry.id, a.entry.id);
  assert.deepEqual(b.entry.urls, ['https://cdn.com/a.png', 'https://mirror.com/a.png']);
  const index = await store.readIndex();
  assert.equal(index.urls['https://mirror.com/a.png'], a.entry.id);
});

test('different files stay separate and sort newest first', async () => {
  const a = await store.recordCapture(cap());
  const b = await store.recordCapture(cap({ imageUrl: 'https://cdn.com/b.png', hash: 'sha256:bbb', at: 5_000 }));
  const all = await store.loadAll();
  assert.deepEqual(all.map((e) => e.id), [b.entry.id, a.entry.id]);
});

test('failed copy is recorded with a reason', async () => {
  const { entry } = await store.recordCapture(cap({ copied: false, reason: 'cors', hash: null, thumb: null }));
  assert.deepEqual(entry.lastCopy, { status: 'failed', reason: 'cors', at: 1000 });
  assert.equal(entry.copyCount, 0);
  assert.equal(entry.hasThumb, false);
});

test('data: captures group by hash only and store the full copy', async () => {
  const c = cap({ kind: 'data', imageUrl: 'data:image/png;base64,AAAA', label: 'Embedded image/png', full: 'data:image/png;base64,AAAA' });
  const a = await store.recordCapture(c);
  assert.deepEqual(a.entry.urls, ['Embedded image/png']);
  assert.equal(a.entry.hasFull, true);
  const index = await store.readIndex();
  assert.deepEqual(index.urls, {});
  const b = await store.recordCapture({ ...c, at: 2_000 });
  assert.equal(b.entry.id, a.entry.id);
});

test('quota error retries without image data', async () => {
  fake = installFakeBrowser({ failSetWhen: (items) => Object.keys(items).some((k) => k.startsWith('thumb:')) });
  const { entry, degraded } = await store.recordCapture(cap());
  assert.equal(degraded, true);
  assert.equal(entry.hasThumb, false);
  assert.ok(fake.data.get(store.entryKey(entry.id)));
});

test('remove and restore round-trip', async () => {
  const { entry } = await store.recordCapture(cap());
  const bundle = await store.removeEntry(entry.id);
  assert.equal((await store.loadAll()).length, 0);
  assert.equal(fake.data.has(store.thumbKey(entry.id)), false);
  await store.restoreEntry(bundle);
  const all = await store.loadAll();
  assert.equal(all.length, 1);
  assert.equal((await store.readIndex()).urls['https://cdn.com/a.png'], entry.id);
  assert.equal(fake.data.get(store.thumbKey(entry.id)), 'data:image/webp;base64,T');
});

test('loadAll drops dangling index ids', async () => {
  const { entry } = await store.recordCapture(cap());
  fake.data.delete(store.entryKey(entry.id));
  assert.deepEqual(await store.loadAll(), []);
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual((await store.readIndex()).ids, []);
});

test('purgeOlderThan removes old entries only', async () => {
  const day = 86_400_000;
  const now = 100 * day;
  await store.recordCapture(cap({ at: now - 40 * day }));
  const fresh = await store.recordCapture(cap({ imageUrl: 'https://cdn.com/new.png', hash: 'sha256:n', at: now - day }));
  assert.equal(await store.purgeOlderThan(30, now), 1);
  assert.deepEqual((await store.loadAll()).map((e) => e.id), [fresh.entry.id]);
});

test('captures are capped per entry', async () => {
  for (let i = 0; i < store.MAX_CAPTURES_PER_ENTRY + 5; i++) {
    await store.recordCapture(cap({ at: i, thumb: null }));
  }
  const [entry] = await store.loadAll();
  assert.equal(entry.captures.length, store.MAX_CAPTURES_PER_ENTRY);
  assert.equal(entry.captures.at(-1).at, store.MAX_CAPTURES_PER_ENTRY + 4);
});

test('settings merge over defaults', async () => {
  assert.deepEqual(await store.getSettings(), { autoDeleteDays: null, view: 'grid', groupBy: 'date', sort: 'added-desc', tagOrder: [], hiddenTags: [], showRest: true });
  await store.setSettings({ view: 'list' });
  assert.equal((await store.getSettings()).view, 'list');
});

test('concurrent captures of the same URL do not duplicate', async () => {
  await Promise.all([store.recordCapture(cap()), store.recordCapture(cap({ at: 2_000 }))]);
  const all = await store.loadAll();
  assert.equal(all.length, 1);
  assert.equal(all[0].captures.length, 2);
});

test('saveThumb sets the thumbnail and flag', async () => {
  const { entry } = await store.recordCapture(cap({ thumb: null }));
  assert.equal(entry.hasThumb, false);
  await store.saveThumb(entry.id, 'data:image/webp;base64,N');
  assert.equal((await store.getEntry(entry.id)).hasThumb, true);
  assert.equal(fake.data.get(store.thumbKey(entry.id)), 'data:image/webp;base64,N');
});

test('updateEntry mutates and re-sorts the index', async () => {
  const a = await store.recordCapture(cap());
  await store.recordCapture(cap({ imageUrl: 'https://cdn.com/b.png', hash: 'sha256:b', at: 5_000 }));
  await store.updateEntry(a.entry.id, (e) => {
    e.tags = ['x'];
    e.lastCapturedAt = 9_000;
  });
  const all = await store.loadAll();
  assert.equal(all[0].id, a.entry.id);
  assert.deepEqual(all[0].tags, ['x']);
  assert.equal(await store.updateEntry('nope', () => {}), null);
});
