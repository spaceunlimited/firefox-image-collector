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

// Groups entries (already newest first) by the day of their latest capture.
export function groupByDay(entries, now = Date.now()) {
  const groups = [];
  let current = null;
  for (const e of entries) {
    const key = dayKey(e.lastCapturedAt);
    if (!current || current.key !== key) {
      current = { key, label: dayGroupLabel(e.lastCapturedAt, now), entries: [] };
      groups.push(current);
    }
    current.entries.push(e);
  }
  return groups;
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
