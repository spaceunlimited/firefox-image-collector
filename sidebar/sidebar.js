// Sidebar controller: state, events, actions, storage sync.
import * as store from '../shared/store.js';
import { FAILURE_TEXT } from '../shared/format.js';
import { ALL_SITES, hasAllSites } from '../shared/permissions.js';
import { followTheme } from '../shared/theme.js';
import { hydrateIcons } from '../shared/icons.js';
import { filterEntries, groupEntries, orderTags, tagCounts, latestCapture, canOpenImage, SORTS, GROUPINGS } from './model.js';
import { renderGroups, refreshTimes } from './view.js';
import { TagSearch } from './tag-search.js';
import { ViewOptions } from './view-options.js';
import { ThumbLoader } from './thumbs.js';
import { createNotice } from './notice.js';
import { CardMenu } from './menu.js';
import { DetailsPanel } from './details.js';

hydrateIcons(document);

const $ = (id) => document.getElementById(id);
const els = {
  search: $('search'),
  optionsBtn: $('options-btn'),
  filterBar: $('filter-bar'),
  rangePill: $('range-pill'),
  customRange: $('custom-range'),
  from: $('from'),
  to: $('to'),
  viewToggle: $('view-toggle'),
  openSettings: $('open-settings'),
  list: $('list'),
  empty: $('empty'),
  noResults: $('no-results'),
  count: $('count'),
  banner: $('access-banner'),
  grantAccess: $('grant-access'),
  dismissBanner: $('dismiss-banner'),
};

const state = {
  entries: [],
  byId: new Map(),
  query: '',
  range: { kind: 'all' },
  view: 'grid',
  // Persisted in settings:
  groupBy: 'date',
  sort: 'added-desc',
  tagOrder: [],
  hiddenTags: [],
  showRest: true,
  hasAccess: true,
  bannerDismissed: false,
  collapsed: new Set(),
};

const RANGE_LABELS = { today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', custom: 'Custom range' };

const thumbs = new ThumbLoader((ids) => store.getThumbs(ids));
const notice = createNotice($('notice'));
const menu = new CardMenu($('card-menu'), (action, id) => runAction(action, id));
let searchTimer = null;
const tagSearch = new TagSearch({
  field: $('search-field'),
  input: els.search,
  tokens: $('search-tokens'),
  list: $('tag-suggest'),
  getCounts: () => tagCounts(state.entries),
  onChange: () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 80);
  },
});
const viewOptions = new ViewOptions($('view-panel'), els.optionsBtn, applyViewOptions);
const details = new DetailsPanel($('details'), {
  loadPreview,
  onAction: (action, id) => runAction(action, id),
  onOpenUrl: openUrl,
  onTagsChange: saveTags,
  onClose: (id) => els.list.querySelector(`.card[data-id="${CSS.escape(id ?? '')}"] .menu-btn`)?.focus(),
});

const allTags = () => tagCounts(state.entries).map(([t]) => t);

// ---------- rendering ----------

function render() {
  const now = Date.now();
  const counts = tagCounts(state.entries);
  tagSearch.prune(new Set(counts.map(([t]) => t)));
  const visible = filterEntries(state.entries, { query: tagSearch.query, range: state.range, tags: tagSearch.tags }, now);
  const order = orderTags(counts, state.tagOrder);
  const groups = groupEntries(
    visible,
    { groupBy: state.groupBy, sort: state.sort, tagOrder: order, hiddenTags: state.hiddenTags, showRest: state.showRest },
    now,
  );
  renderGroups(els.list, groups, { thumbs, now, collapsed: state.collapsed });
  els.empty.hidden = state.entries.length > 0;
  els.noResults.hidden = state.entries.length === 0 || visible.length > 0;
  const total = state.entries.length;
  const rangeActive = state.range.kind !== 'all';
  const filtering = rangeActive || tagSearch.tags.size > 0 || tagSearch.query.trim() !== '';
  els.rangePill.hidden = !rangeActive;
  els.rangePill.textContent = RANGE_LABELS[state.range.kind] ?? '';
  els.optionsBtn.classList.toggle('is-active', rangeActive);
  els.filterBar.hidden = total === 0 || !filtering;
  els.count.textContent = `${visible.length} of ${total}`;
  const countMap = new Map(counts);
  viewOptions.render({
    groupBy: state.groupBy,
    sort: state.sort,
    range: state.range.kind,
    tags: order.map((tag) => ({ tag, count: countMap.get(tag) ?? 0, visible: !state.hiddenTags.includes(tag) })),
    showRest: state.showRest,
  });
  const blocked = state.entries.some((e) => e.lastCopy?.status === 'failed' && e.lastCopy.reason === 'cors');
  els.banner.hidden = state.hasAccess || state.bannerDismissed || !blocked;
}

async function refreshAccess() {
  state.hasAccess = await hasAllSites().catch(() => true);
  render();
}

async function reload() {
  state.entries = await store.loadAll();
  state.byId = new Map(state.entries.map((e) => [e.id, e]));
  render();
  const openId = details.openId;
  if (openId) {
    const entry = state.byId.get(openId);
    if (entry) details.update(entry, allTags());
    else details.close();
  }
}

// Shows the stored copy or thumbnail at once, then swaps in the full image once it has loaded.
async function loadPreview(entry, img) {
  img.alt = latestCapture(entry)?.pageTitle || 'Collected image';
  const stored = (entry.hasFull && (await store.getFull(entry.id))) || (await store.getThumbs([entry.id]))[entry.id];
  if (stored) img.src = stored;
  if (entry.kind !== 'http' || !/^https?:/i.test(entry.urls[0] ?? '') || entry.hasFull) return;
  const full = img.ownerDocument.createElement('img');
  full.referrerPolicy = 'no-referrer';
  full.onload = () => {
    if (img.isConnected) img.src = full.src;
  };
  full.src = entry.urls[0];
}

// ---------- actions ----------

const BLOCKED_SCHEMES = /^(file|about|chrome|resource|moz-extension|view-source|data|blob|javascript):/i;

function shortUrl(url) {
  return url.length > 80 ? `${url.slice(0, 77)}…` : url;
}

async function openUrl(url) {
  if (!url) return notice.show('No address was recorded.');
  if (BLOCKED_SCHEMES.test(url)) {
    return notice.show(`Firefox doesn't let extensions open this kind of page: ${shortUrl(url)}`, { ms: 8000 });
  }
  try {
    await browser.tabs.create({ url });
  } catch (err) {
    console.warn('[sidebar] cannot open', url, err);
    notice.show(`Couldn't open ${shortUrl(url)}`);
  }
  return undefined;
}

function openImage(entry) {
  if (entry.kind === 'http' && entry.urls[0]) return openUrl(entry.urls[0]);
  return browser.tabs.create({ url: browser.runtime.getURL(`viewer/viewer.html?id=${encodeURIComponent(entry.id)}`) });
}

async function recopy(entry) {
  notice.show('Copying…', { ms: 30_000 });
  let res;
  try {
    res = await browser.runtime.sendMessage({ type: 'recopy', id: entry.id });
  } catch (err) {
    console.error('[sidebar] recopy failed', err);
    res = { ok: false, reason: 'unknown' };
  }
  if (res?.ok) notice.show(res.scaled ? 'Copied at reduced size' : 'Copied');
  else notice.show(`Couldn't copy. ${FAILURE_TEXT[res?.reason] ?? FAILURE_TEXT.unknown}`, { ms: 7000 });
}

async function remove(entry) {
  if (details.openId === entry.id) details.close();
  els.list.querySelector(`.card[data-id="${CSS.escape(entry.id)}"]`)?.remove();
  const bundle = await store.removeEntry(entry.id);
  notice.show('Image deleted', {
    ms: 6000,
    action: {
      label: 'Undo',
      run: () => store.restoreEntry(bundle).catch((e) => notice.show(`Couldn't restore: ${e.message}`)),
    },
  });
}

function saveTags(id, tags) {
  store.updateEntry(id, (e) => {
    e.tags = tags;
  }).catch((e) => notice.show(`Couldn't save tags: ${e.message}`));
}

function runAction(action, id) {
  const entry = state.byId.get(id);
  if (!entry) return;
  switch (action) {
    case 'recopy':
      recopy(entry);
      break;
    case 'open-image':
      openImage(entry);
      break;
    case 'open-page':
      openUrl(latestCapture(entry)?.pageUrl);
      break;
    case 'details':
      details.open(entry, allTags());
      break;
    case 'tags':
      details.open(entry, allTags(), { focusTags: true });
      break;
    case 'delete':
      remove(entry);
      break;
    default:
      console.warn('[sidebar] unknown action', action);
  }
}

// ---------- toolbar events ----------

function applyView(view) {
  state.view = view;
  document.body.dataset.view = view;
  const next = view === 'grid' ? 'list' : 'grid';
  els.viewToggle.setAttribute('aria-label', `Switch to ${next} view`);
  els.viewToggle.title = `Switch to ${next} view`;
}

function setRange(kind) {
  els.customRange.hidden = kind !== 'custom';
  state.range = { kind, from: els.from.value, to: els.to.value };
  render();
  if (kind === 'custom') els.from.focus();
}
const updateCustomRange = () => setRange('custom');
els.from.addEventListener('change', updateCustomRange);
els.to.addEventListener('change', updateCustomRange);

els.rangePill.addEventListener('click', () => setRange('all'));

const PERSISTED = ['groupBy', 'sort', 'tagOrder', 'hiddenTags', 'showRest'];

// Changes from the view options popover. Grouping, sort and tag groups are remembered.
function applyViewOptions(patch) {
  if ('range' in patch) {
    setRange(patch.range);
    return;
  }
  Object.assign(state, patch);
  render();
  const saved = Object.fromEntries(Object.entries(patch).filter(([k]) => PERSISTED.includes(k)));
  if (Object.keys(saved).length) store.setSettings(saved).catch((e) => console.warn('[sidebar] settings not saved', e));
}

els.viewToggle.addEventListener('click', () => {
  applyView(state.view === 'grid' ? 'list' : 'grid');
  store.setSettings({ view: state.view });
});

els.openSettings.addEventListener('click', () => browser.runtime.openOptionsPage());

// permissions.request must run directly in the click handler.
els.grantAccess.addEventListener('click', () => {
  browser.permissions
    .request(ALL_SITES)
    .then((granted) => notice.show(granted ? 'Site access allowed. Use Re-copy on failed images.' : 'Site access was not allowed.'))
    .catch((e) => console.warn('[sidebar] permission request failed', e))
    .finally(refreshAccess);
});
els.dismissBanner.addEventListener('click', () => {
  state.bannerDismissed = true;
  render();
});
browser.permissions.onAdded.addListener(refreshAccess);
browser.permissions.onRemoved.addListener(refreshAccess);

// ---------- card events ----------

els.list.addEventListener('click', (e) => {
  const head = e.target.closest('.group-head');
  if (head) {
    const key = head.dataset.key;
    if (state.collapsed.has(key)) state.collapsed.delete(key);
    else state.collapsed.add(key);
    render();
    els.list.querySelector(`.group-head[data-key="${CSS.escape(key)}"]`)?.focus();
    return;
  }
  const card = e.target.closest('.card');
  if (!card) return;
  const entry = state.byId.get(card.dataset.id);
  if (!entry) return;
  const menuBtn = e.target.closest('.menu-btn');
  if (menuBtn) {
    menu.toggle(menuBtn, entry.id, {
      'open-image': canOpenImage(entry),
      'open-page': Boolean(latestCapture(entry)?.pageUrl),
    });
    return;
  }
  if (e.target.closest('.thumb')) openUrl(latestCapture(entry)?.pageUrl);
});

// Keyboard shortcut on a focused card: Delete/Backspace removes it.
els.list.addEventListener('keydown', (e) => {
  if (e.key !== 'Delete' && e.key !== 'Backspace') return;
  const card = e.target.closest('.card');
  const entry = card && state.byId.get(card.dataset.id);
  if (entry) {
    e.preventDefault();
    remove(entry);
  }
});

// Escape closes the details panel even when focus is outside it.
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !menu.isOpen && !viewOptions.isOpen && details.openId && !e.defaultPrevented) details.close();
});

// ---------- sync ----------

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

setInterval(() => {
  refreshTimes(els.list);
  refreshTimes($('details'));
}, 60_000);

async function boot() {
  followTheme().catch((e) => console.warn('[sidebar] theme failed', e));
  const settings = await store.getSettings();
  applyView(settings.view);
  state.groupBy = GROUPINGS.includes(settings.groupBy) ? settings.groupBy : 'date';
  state.sort = SORTS.includes(settings.sort) ? settings.sort : 'added-desc';
  state.tagOrder = Array.isArray(settings.tagOrder) ? settings.tagOrder : [];
  state.hiddenTags = Array.isArray(settings.hiddenTags) ? settings.hiddenTags : [];
  state.showRest = settings.showRest !== false;
  if (settings.autoDeleteDays) await store.purgeOlderThan(settings.autoDeleteDays);
  state.hasAccess = await hasAllSites().catch(() => true);
  await reload();
}

boot().catch((e) => console.error('[sidebar] boot failed', e));
