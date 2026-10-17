import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterEntries, groupByDay, tagCounts, matchesQuery, rangeBounds, sortEntries, groupByTag, groupEntries, orderTags, matchTags } from '../../sidebar/model.js';

const DAY = 86_400_000;
const now = new Date('2026-10-16T15:00:00').getTime();
const entry = (id, at, over = {}) => ({
  id,
  urls: [`https://cdn.example.com/${id}.png`],
  tags: [],
  lastCapturedAt: at,
  captures: [{ at, pageUrl: `https://www.site-${id}.com/article`, pageTitle: `Title ${id}`, imageUrl: '' }],
  ...over,
});

test('search matches URL, domain, title and tags, all words required', () => {
  const e = entry('a', now, { tags: ['moodboard'] });
  assert.ok(matchesQuery(e, 'site-a'));
  assert.ok(matchesQuery(e, 'TITLE a'));
  assert.ok(matchesQuery(e, 'cdn.example'));
  assert.ok(matchesQuery(e, 'mood'));
  assert.ok(!matchesQuery(e, 'title zebra'));
  assert.ok(matchesQuery(e, '   '));
});

test('date presets are inclusive of today', () => {
  const [start] = rangeBounds({ kind: '7d' }, now);
  assert.equal(start, new Date('2026-10-10T00:00:00').getTime());
  const [from, to] = rangeBounds({ kind: 'custom', from: '2026-10-01', to: '2026-10-02' }, now);
  assert.equal(from, new Date('2026-10-01T00:00:00').getTime());
  assert.equal(to, new Date('2026-10-03T00:00:00').getTime());
});

test('filterEntries combines tags (AND), range and query', () => {
  const entries = [
    entry('a', now, { tags: ['x', 'y'] }),
    entry('b', now - 10 * DAY, { tags: ['x'] }),
    entry('c', now - 1 * DAY, { tags: ['y'] }),
  ];
  const ids = (list) => list.map((e) => e.id);
  assert.deepEqual(ids(filterEntries(entries, { tags: new Set(['x']) }, now)), ['a', 'b']);
  assert.deepEqual(ids(filterEntries(entries, { tags: new Set(['x', 'y']) }, now)), ['a']);
  assert.deepEqual(ids(filterEntries(entries, { range: { kind: '7d' } }, now)), ['a', 'c']);
  assert.deepEqual(ids(filterEntries(entries, { query: 'site-c', range: { kind: '7d' } }, now)), ['c']);
});

test('groupByDay labels Today, Yesterday, weekday, then date', () => {
  const groups = groupByDay(
    [entry('a', now), entry('b', now - 2 * 3_600_000), entry('c', now - DAY), entry('d', now - 3 * DAY), entry('e', now - 30 * DAY)],
    now,
  );
  assert.deepEqual(groups.map((g) => g.entries.length), [2, 1, 1, 1]);
  assert.equal(groups[0].label, 'Today');
  assert.equal(groups[1].label, 'Yesterday');
  assert.equal(groups[2].label, new Date(now - 3 * DAY).toLocaleDateString(undefined, { weekday: 'long' }));
  assert.match(groups[3].label, /2026/);
});

test('tagCounts sorts by frequency then name', () => {
  const entries = [entry('a', now, { tags: ['b', 'a'] }), entry('b', now, { tags: ['b'] })];
  assert.deepEqual(tagCounts(entries), [['b', 2], ['a', 1]]);
});

test('normalizeTag', async () => {
  const { normalizeTag, MAX_TAG_LENGTH } = await import('../../sidebar/model.js');
  assert.equal(normalizeTag('  Mood   Board '), 'mood board');
  assert.equal(normalizeTag('a,b'), 'a b');
  assert.equal(normalizeTag(''), '');
  assert.equal(normalizeTag(' , '), '');
  assert.equal(normalizeTag('x'.repeat(50)).length, MAX_TAG_LENGTH);
});

test('canOpenImage', async () => {
  const { canOpenImage } = await import('../../sidebar/model.js');
  assert.equal(canOpenImage({ kind: 'http', urls: ['https://a/x.png'] }), true);
  assert.equal(canOpenImage({ kind: 'data', urls: ['Embedded'], hasFull: false, hasThumb: false }), false);
  assert.equal(canOpenImage({ kind: 'blob', urls: ['Generated'], hasFull: true }), true);
});

test('suggestTags', async () => {
  const { suggestTags } = await import('../../sidebar/model.js');
  const all = ['mood board', 'logo', 'color', 'blue mood'];
  assert.deepEqual(suggestTags(all, [], ''), all);
  assert.deepEqual(suggestTags(all, ['logo'], ''), ['mood board', 'color', 'blue mood']);
  assert.deepEqual(suggestTags(all, [], 'mo'), ['mood board', 'blue mood']);
  assert.deepEqual(suggestTags(all, [], 'LO'), ['logo', 'color']);
  assert.deepEqual(suggestTags(all, [], 'logo'), []);
  assert.equal(suggestTags(Array.from({ length: 20 }, (_, i) => `t${i}`), [], '').length, 8);
});

test('typeLabel and mimeFromUrl', async () => {
  const { typeLabel } = await import('../../shared/format.js');
  const { mimeFromUrl } = await import('../../shared/url.js');
  assert.equal(typeLabel('image/jpeg'), 'JPG');
  assert.equal(typeLabel('image/svg+xml'), 'SVG');
  assert.equal(typeLabel('image/x-portable-pixmap'), '');
  assert.equal(typeLabel('image/qoi'), 'QOI');
  assert.equal(typeLabel(null), '');
  assert.equal(mimeFromUrl('https://a.com/x/photo.JPG?w=200'), 'image/jpeg');
  assert.equal(mimeFromUrl('https://a.com/image'), null);
  assert.equal(mimeFromUrl('not a url'), null);
});

const added = (id, first, tags = []) => ({ ...entry(id, first, { tags }), firstCapturedAt: first, lastCapturedAt: now });

test('sortEntries by time added, both directions, stable on ties', () => {
  const list = [added('b', 2), added('a', 1), added('c', 3), added('d', 2)];
  assert.deepEqual(sortEntries(list).map((e) => e.id), ['c', 'b', 'd', 'a']);
  assert.deepEqual(sortEntries(list, 'added-asc').map((e) => e.id), ['a', 'b', 'd', 'c']);
});

test('groupEntries by date uses the added day and keeps the sort inside groups', () => {
  const list = [added('old', now - 3 * DAY), added('t1', now - 60_000), added('t2', now - 120_000)];
  const desc = groupEntries(list, { groupBy: 'date', sort: 'added-desc' }, now);
  assert.deepEqual(desc.map((g) => g.label), ['Today', desc[1].label]);
  assert.deepEqual(desc[0].entries.map((e) => e.id), ['t1', 't2']);
  const asc = groupEntries(list, { groupBy: 'date', sort: 'added-asc' }, now);
  assert.deepEqual(asc.map((g) => g.entries.map((e) => e.id)), [['old'], ['t2', 't1']]);
});

test('groupByTag follows the tag order, repeats multi-tag images, and collects the rest', () => {
  const list = sortEntries([added('a', 3, ['x', 'y']), added('b', 2, ['y']), added('c', 1, []), added('d', 0, ['z'])]);
  const groups = groupByTag(list, { order: ['y', 'x', 'z'], hidden: ['z'] });
  assert.deepEqual(groups.map((g) => [g.label, g.entries.map((e) => e.id)]), [['y', ['a', 'b']], ['x', ['a']], ['Other', ['c', 'd']]]);
  assert.equal(groupByTag(list, { order: ['y', 'x', 'z'], hidden: ['z'], showRest: false }).length, 2);
  assert.equal(groupByTag(sortEntries([added('c', 1)]), { order: [] })[0].label, 'Untagged');
});

test('groupEntries none has a single unlabeled group', () => {
  const groups = groupEntries([added('a', 1), added('b', 2)], { groupBy: 'none', sort: 'added-asc' });
  assert.equal(groups.length, 1);
  assert.equal(groups[0].label, null);
  assert.deepEqual(groups[0].entries.map((e) => e.id), ['a', 'b']);
  assert.deepEqual(groupEntries([], { groupBy: 'none' }), []);
});

test('orderTags keeps the saved order and appends new tags by use', () => {
  assert.deepEqual(orderTags([['a', 5], ['b', 3], ['c', 1]], ['c', 'gone', 'a']), ['c', 'a', 'b']);
});

test('matchTags suggests prefix matches first and skips selected ones', () => {
  const counts = [['mood board', 3], ['logo', 2], ['blue mood', 1]];
  assert.deepEqual(matchTags(counts, 'mo').map(([t]) => t), ['mood board', 'blue mood']);
  assert.deepEqual(matchTags(counts, 'mo', new Set(['mood board'])).map(([t]) => t), ['blue mood']);
  assert.deepEqual(matchTags(counts, '  '), []);
});
