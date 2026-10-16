import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterEntries, groupByDay, tagCounts, matchesQuery, rangeBounds } from '../../sidebar/model.js';

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
