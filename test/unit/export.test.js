import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeBrowser } from './fake-browser.js';
import * as store from '../../shared/store.js';
import { buildJson, buildCsv, parseImport, sanitizeEntry, mergeEntries } from '../../shared/export.js';

let fake;
beforeEach(() => {
  fake = installFakeBrowser();
});

const cap = (over = {}) => ({
  at: 1_000, kind: 'http', imageUrl: 'https://cdn.com/a.png', pageUrl: 'https://site.com/p', pageTitle: 'Page',
  copied: true, hash: 'sha256:' + 'a'.repeat(64), width: 100, height: 50, thumb: 'data:image/webp;base64,T', ...over,
});

test('CSV has one row per capture with RFC 4180 quoting', async () => {
  await store.recordCapture(cap({ pageTitle: 'Say "hi", world' }));
  await store.recordCapture(cap({ at: 2_000, pageUrl: 'https://other.com/' }));
  await store.updateEntry((await store.loadAll())[0].id, (e) => {
    e.tags = ['a', 'b'];
  });
  const lines = buildCsv(await store.loadAll()).trimEnd().split('\r\n');
  assert.equal(lines[0], 'imageUrl,width,height,capturedAt,pageUrl,pageTitle,frameUrl,tags,copied');
  assert.equal(lines.length, 3);
  assert.equal(lines[1], 'https://cdn.com/a.png,100,50,1970-01-01T00:00:01.000Z,https://site.com/p,"Say ""hi"", world",,a;b,true');
});

test('JSON export → clear → import restores entries, thumbs and tags', async () => {
  const { entry } = await store.recordCapture(cap());
  await store.updateEntry(entry.id, (e) => {
    e.tags = ['keep'];
  });
  await store.recordCapture(cap({ imageUrl: 'https://cdn.com/b.png', hash: null, thumb: null, at: 5_000 }));
  const { entries, thumbs, fulls } = await store.exportData();
  const json = buildJson(entries, thumbs, fulls);

  await store.clearAll();
  assert.equal((await store.loadAll()).length, 0);

  const { items, invalid } = parseImport(json);
  assert.equal(invalid, 0);
  assert.deepEqual(await store.importItems(items), { added: 2, merged: 0 });
  const after = await store.loadAll();
  assert.equal(after.length, 2);
  const a = after.find((e) => e.id === entry.id);
  assert.deepEqual(a.tags, ['keep']);
  assert.equal(fake.data.get(store.thumbKey(entry.id)), 'data:image/webp;base64,T');
  assert.equal((await store.readIndex()).urls['https://cdn.com/b.png'], after[0].id);

  // Importing the same file again merges and changes nothing.
  assert.deepEqual(await store.importItems(parseImport(json).items), { added: 0, merged: 2 });
  const again = await store.loadAll();
  assert.equal(again.length, 2);
  assert.equal(again.find((e) => e.id === entry.id).captures.length, 1);
});

test('import merges with existing entries by URL and unions captures and tags', async () => {
  const { entry } = await store.recordCapture(cap({ hash: null }));
  const incoming = sanitizeEntry({
    id: 'ffffffffffffffff', urls: ['https://cdn.com/a.png'], kind: 'http', tags: ['New'], width: 200, height: 100,
    captures: [{ at: 9_000, pageUrl: 'https://elsewhere.com/', pageTitle: 'Elsewhere', copied: true }],
  });
  assert.deepEqual(await store.importItems([incoming]), { added: 0, merged: 1 });
  const merged = await store.getEntry(entry.id);
  assert.equal(merged.captures.length, 2);
  assert.deepEqual(merged.tags, ['new']);
  assert.equal(merged.width, 200);
  assert.equal(merged.lastCapturedAt, 9_000);
});

test('parseImport rejects foreign files and counts invalid entries', () => {
  assert.throws(() => parseImport('not json'), /not valid JSON/);
  assert.throws(() => parseImport('{"foo":1}'), /not an Image Collector export/);
  assert.throws(() => parseImport('{"format":"image-collector","version":99,"entries":[]}'), /newer version/);
  const { items, invalid } = parseImport(
    JSON.stringify({ format: 'image-collector', version: 1, entries: [{ urls: [], captures: [] }, null, { urls: ['x'], captures: [{ at: 1 }] }] }),
  );
  assert.equal(items.length, 1);
  assert.equal(invalid, 2);
});

test('sanitizeEntry drops unknown fields and non-image data URLs', () => {
  const item = sanitizeEntry({
    id: 'not-an-id', urls: ['https://a/x.png'], captures: [{ at: 5, pageUrl: 'https://a/' }],
    evil: '<script>', thumb: 'data:text/html;base64,PHNjcmlwdD4=', full: 'data:image/png;base64,AAAA',
  });
  assert.equal(item.entry.id, null);
  assert.equal('evil' in item.entry, false);
  assert.equal(item.thumb, null);
  assert.equal(item.full, 'data:image/png;base64,AAAA');
});

test('mergeEntries keeps the later copy status', () => {
  const base = sanitizeEntry({ urls: ['u'], captures: [{ at: 1 }], copyCount: 1, lastCopy: { status: 'failed', reason: 'cors', at: 1 } }).entry;
  const inc = sanitizeEntry({ urls: ['u'], captures: [{ at: 2 }], copyCount: 3, lastCopy: { status: 'ok', at: 2 } }).entry;
  const m = mergeEntries(base, inc);
  assert.deepEqual(m.lastCopy, { status: 'ok', at: 2 });
  assert.equal(m.copyCount, 3);
});

test('countOlderThan and bytesInUse', async () => {
  const day = 86_400_000;
  await store.recordCapture(cap({ at: 1 }));
  assert.equal(await store.countOlderThan(30, 40 * day), 1);
  assert.equal(await store.countOlderThan(null), 0);
  assert.ok((await store.bytesInUse()) > 0);
});
