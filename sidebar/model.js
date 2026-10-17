// Pure filtering and grouping for the sidebar. No DOM, no browser APIs.
import { domainOf } from '../shared/url.js';
import { dayGroupLabel, dayKey } from '../shared/format.js';

const DAY = 86_400_000;

export function searchText(entry) {
  const parts = [...entry.urls, ...entry.tags];
  for (const c of entry.captures) parts.push(c.pageUrl, domainOf(c.pageUrl), c.pageTitle, c.imageUrl);
  for (const u of entry.urls) parts.push(domainOf(u));
  return parts.join('\n').toLowerCase();
}

// Every whitespace-separated word must appear somewhere.
export function matchesQuery(entry, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = searchText(entry);
  return words.every((w) => text.includes(w));
}

/**
 * @param {{ kind: 'all'|'today'|'7d'|'30d'|'custom', from?: string, to?: string }} range
 *   from/to are "YYYY-MM-DD" local dates, inclusive.
 * @returns {[number, number]} [start, end) in epoch ms
 */
export function rangeBounds(range, now = Date.now()) {
  const today = dayKey(now);
  switch (range.kind) {
    case 'today':
      return [today, Infinity];
    case '7d':
      return [today - 6 * DAY, Infinity];
    case '30d':
      return [today - 29 * DAY, Infinity];
    case 'custom': {
      const parse = (s) => (s ? new Date(`${s}T00:00:00`).getTime() : NaN);
      const from = parse(range.from);
      const to = parse(range.to);
      return [Number.isNaN(from) ? -Infinity : from, Number.isNaN(to) ? Infinity : to + DAY];
    }
    default:
      return [-Infinity, Infinity];
  }
}

export function inRange(entry, [start, end]) {
  if (start === -Infinity && end === Infinity) return true;
  return entry.captures.some((c) => c.at >= start && c.at < end);
}

export function hasAllTags(entry, tags) {
  for (const t of tags) if (!entry.tags.includes(t)) return false;
  return true;
}

export function filterEntries(entries, { query = '', range = { kind: 'all' }, tags = new Set() }, now = Date.now()) {
  const bounds = rangeBounds(range, now);
  return entries.filter((e) => hasAllTags(e, tags) && inRange(e, bounds) && matchesQuery(e, query));
}

export const SORTS = ['added-desc', 'added-asc'];
export const GROUPINGS = ['date', 'tag', 'none'];

// Sorts by the time an image was first added; ties broken by id so the order is stable.
export function sortEntries(entries, sort = 'added-desc') {
  const dir = sort === 'added-asc' ? 1 : -1;
  return [...entries].sort((a, b) => dir * (a.firstCapturedAt - b.firstCapturedAt) || a.id.localeCompare(b.id));
}

// Groups already sorted entries by calendar day of `field`, keeping their order.
export function groupByDay(entries, now = Date.now(), field = 'lastCapturedAt') {
  const groups = [];
  let current = null;
  for (const e of entries) {
    const key = `day:${dayKey(e[field])}`;
    if (!current || current.key !== key) {
      current = { key, label: dayGroupLabel(e[field], now), entries: [] };
      groups.push(current);
    }
    current.entries.push(e);
  }
  return groups;
}

// The user's saved tag order, followed by tags it doesn't know yet (most used first).
export function orderTags(counts, savedOrder = []) {
  const known = new Set(counts.map(([t]) => t));
  const ordered = savedOrder.filter((t) => known.has(t));
  const seen = new Set(ordered);
  for (const [t] of counts) if (!seen.has(t)) ordered.push(t);
  return ordered;
}

/**
 * One group per visible tag, in `order`; an image with several tags appears in each of them.
 * Images in none of the visible groups go to a trailing group unless `showRest` is false.
 */
export function groupByTag(entries, { order = [], hidden = [], showRest = true } = {}) {
  const visible = order.filter((t) => !hidden.includes(t));
  const groups = visible
    .map((t) => ({ key: `tag:${t}`, label: t, entries: entries.filter((e) => e.tags.includes(t)) }))
    .filter((g) => g.entries.length);
  if (showRest) {
    const rest = entries.filter((e) => !e.tags.some((t) => visible.includes(t)));
    if (rest.length) {
      const label = rest.every((e) => e.tags.length === 0) ? 'Untagged' : 'Other';
      groups.push({ key: 'rest', label, entries: rest, rest: true });
    }
  }
  return groups;
}

/**
 * Sorts, then groups. `opts`: { groupBy, sort, tagOrder, hiddenTags, showRest }.
 * Grouping "none" returns one group without a heading.
 */
export function groupEntries(entries, opts = {}, now = Date.now()) {
  const sorted = sortEntries(entries, opts.sort);
  if (opts.groupBy === 'tag') {
    return groupByTag(sorted, { order: opts.tagOrder, hidden: opts.hiddenTags, showRest: opts.showRest !== false });
  }
  if (opts.groupBy === 'none') return sorted.length ? [{ key: 'all', label: null, entries: sorted }] : [];
  return groupByDay(sorted, now, 'firstCapturedAt');
}

// Tags with counts, most used first, ties alphabetical.
export function tagCounts(entries) {
  const counts = new Map();
  for (const e of entries) for (const t of e.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function latestCapture(entry) {
  return entry.captures.at(-1) ?? null;
}

export const MAX_TAG_LENGTH = 32;

// Tags matching what's typed, for the search field's suggestions: prefix matches first.
export function matchTags(counts, query, exclude = new Set(), max = 8) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const pool = counts.filter(([t]) => !exclude.has(t));
  const prefix = pool.filter(([t]) => t.startsWith(q));
  const inner = pool.filter(([t]) => !t.startsWith(q) && t.includes(q));
  return [...prefix, ...inner].slice(0, max);
}

// Tags are lowercase, single-spaced, without commas, and at most MAX_TAG_LENGTH characters.
export function normalizeTag(raw) {
  return String(raw ?? '')
    .replace(/,/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .slice(0, MAX_TAG_LENGTH)
    .trim();
}

// Whether "Open image" has something to show.
export function canOpenImage(entry) {
  return Boolean((entry.kind === 'http' && entry.urls[0]) || entry.hasFull || entry.hasThumb);
}

export const MAX_TAG_SUGGESTIONS = 8;

// Existing tags to offer while typing: prefix matches first, then other matches, skipping
// tags the entry already has. With an empty query, the most used tags. `allTags` is sorted by use.
export function suggestTags(allTags, entryTags, query, max = MAX_TAG_SUGGESTIONS) {
  const q = normalizeTag(query);
  const available = allTags.filter((t) => !entryTags.includes(t) && t !== q);
  if (!q) return available.slice(0, max);
  const prefix = available.filter((t) => t.startsWith(q));
  const inner = available.filter((t) => !t.startsWith(q) && t.includes(q));
  return [...prefix, ...inner].slice(0, max);
}
