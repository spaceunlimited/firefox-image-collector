// Sidebar controller: state, events, storage sync.
import * as store from '../shared/store.js';
import { filterEntries, groupByDay, tagCounts, latestCapture } from './model.js';
import { renderGroups, renderTagFilters, refreshTimes } from './view.js';
import { ThumbLoader } from './thumbs.js';

const $ = (id) => document.getElementById(id);
const els = {
  search: $('search'),
  date: $('date'),
  customRange: $('custom-range'),
  from: $('from'),
  to: $('to'),
  viewToggle: $('view-toggle'),
  tagFilters: $('tag-filters'),
  list: $('list'),
  empty: $('empty'),
  noResults: $('no-results'),
  count: $('count'),
};

const state = {
  entries: [],
  byId: new Map(),
  query: '',
  range: { kind: 'all' },
  tags: new Set(),
  view: 'grid',
};

const thumbs = new ThumbLoader((ids) => store.getThumbs(ids));

function render() {
  const now = Date.now();
  const visible = filterEntries(state.entries, state, now);
  const counts = tagCounts(state.entries);
  for (const t of state.tags) if (!counts.some(([tag]) => tag === t)) state.tags.delete(t);
  renderTagFilters(els.tagFilters, counts, state.tags);
  renderGroups(els.list, groupByDay(visible, now), { thumbs, now });
  els.empty.hidden = state.entries.length > 0;
  els.noResults.hidden = state.entries.length === 0 || visible.length > 0;
  const total = state.entries.length;
  els.count.textContent = total === 0 ? '' : visible.length === total ? `${total} images` : `${visible.length} of ${total}`;
}

async function reload() {
  state.entries = await store.loadAll();
  state.byId = new Map(state.entries.map((e) => [e.id, e]));
  render();
}

function applyView(view) {
  state.view = view;
  document.body.dataset.view = view;
  const next = view === 'grid' ? 'list' : 'grid';
  els.viewToggle.setAttribute('aria-label', `Switch to ${next} view`);
  els.viewToggle.title = `Switch to ${next} view`;
}

let searchTimer = null;
els.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = els.search.value;
    render();
  }, 80);
});

function updateRange() {
  const kind = els.date.value;
  els.customRange.hidden = kind !== 'custom';
  state.range = { kind, from: els.from.value, to: els.to.value };
  render();
}
els.date.addEventListener('change', updateRange);
els.from.addEventListener('change', updateRange);
els.to.addEventListener('change', updateRange);

els.viewToggle.addEventListener('click', () => {
  applyView(state.view === 'grid' ? 'list' : 'grid');
  store.setSettings({ view: state.view });
});

els.tagFilters.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  const tag = chip.dataset.tag;
  if (state.tags.has(tag)) state.tags.delete(tag);
  else state.tags.add(tag);
  render();
});

els.list.addEventListener('click', (e) => {
  const thumb = e.target.closest('.thumb');
  if (!thumb) return;
  const entry = state.byId.get(thumb.closest('.card').dataset.id);
  const pageUrl = entry && latestCapture(entry)?.pageUrl;
  if (pageUrl) browser.tabs.create({ url: pageUrl }).catch((err) => console.warn('[sidebar] cannot open', pageUrl, err));
});

// Re-read when entries change in any context (captures from the background, other windows).
let reloadTimer = null;
browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  const keys = Object.keys(changes);
  for (const k of keys) if (k.startsWith('thumb:')) thumbs.invalidate(k.slice(6));
  if (keys.some((k) => k === 'index' || k.startsWith('entry:') || k.startsWith('thumb:'))) {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(reload, 100);
  }
});

setInterval(() => refreshTimes(els.list), 60_000);

async function boot() {
  const settings = await store.getSettings();
  applyView(settings.view);
  if (settings.autoDeleteDays) await store.purgeOlderThan(settings.autoDeleteDays);
  await reload();
}

boot().catch((e) => console.error('[sidebar] boot failed', e));
