// Sidebar controller: state, events, actions, storage sync.
import * as store from '../shared/store.js';
import { FAILURE_TEXT } from '../shared/format.js';
import { ALL_SITES, hasAllSites } from '../shared/permissions.js';
import { followTheme } from '../shared/theme.js';
import { filterEntries, groupByDay, tagCounts, latestCapture, canOpenImage } from './model.js';
import { renderGroups, renderTagFilters, refreshTimes } from './view.js';
import { ThumbLoader } from './thumbs.js';
import { createNotice } from './notice.js';
import { CardMenu } from './menu.js';
import { DetailsPanel } from './details.js';

const $ = (id) => document.getElementById(id);
const els = {
  search: $('search'),
  filterBtn: $('filter-btn'),
  filterBar: $('filter-bar'),
  rangePill: $('range-pill'),
  customRange: $('custom-range'),
  from: $('from'),
  to: $('to'),
  viewToggle: $('view-toggle'),
  openSettings: $('open-settings'),
  tagFilters: $('tag-filters'),
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
  tags: new Set(),
  view: 'grid',
  hasAccess: true,
  bannerDismissed: false,
  collapsed: new Set(),
};

const RANGE_LABELS = { today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', custom: 'Custom range' };

const thumbs = new ThumbLoader((ids) => store.getThumbs(ids));
const notice = createNotice($('notice'));
const menu = new CardMenu($('card-menu'), (action, id) => runAction(action, id));
const filterMenu = new CardMenu($('filter-menu'), (kind) => setRange(kind));
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
  const visible = filterEntries(state.entries, state, now);
  const counts = tagCounts(state.entries);
  for (const t of state.tags) if (!counts.some(([tag]) => tag === t)) state.tags.delete(t);
  renderTagFilters(els.tagFilters, counts, state.tags);
  renderGroups(els.list, groupByDay(visible, now), { thumbs, now, collapsed: state.collapsed });
  els.empty.hidden = state.entries.length > 0;
  els.noResults.hidden = state.entries.length === 0 || visible.length > 0;
  const total = state.entries.length;
  const rangeActive = state.range.kind !== 'all';
  els.rangePill.hidden = !rangeActive;
  els.rangePill.textContent = RANGE_LABELS[state.range.kind] ?? '';
  els.filterBtn.classList.toggle('is-active', rangeActive);
  els.filterBar.hidden = total === 0 || (!rangeActive && counts.length === 0);
  els.count.textContent = visible.length === total ? `${total} ${total === 1 ? 'image' : 'images'}` : `${visible.length} of ${total}`;
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
  if (entry.kind !== 'http' || !entry.urls[0] || entry.hasFull) return;
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

let searchTimer = null;
els.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = els.search.value;
    render();
  }, 80);
});

function setRange(kind) {
  els.customRange.hidden = kind !== 'custom';
  state.range = { kind, from: els.from.value, to: els.to.value };
  render();
  if (kind === 'custom') els.from.focus();
}
const updateCustomRange = () => setRange('custom');
els.from.addEventListener('change', updateCustomRange);
els.to.addEventListener('change', updateCustomRange);

els.filterBtn.addEventListener('click', () => {
  for (const b of $('filter-menu').querySelectorAll('[data-action]')) {
    b.setAttribute('aria-checked', String(b.dataset.action === state.range.kind));
  }
  filterMenu.toggle(els.filterBtn, null);
});
els.rangePill.addEventListener('click', () => setRange('all'));

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

els.tagFilters.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  const tag = chip.dataset.tag;
  if (state.tags.has(tag)) state.tags.delete(tag);
  else state.tags.add(tag);
  render();
});

// ---------- card events ----------

els.list.addEventListener('click', (e) => {
  const head = e.target.closest('.group-head');
  if (head) {
    const key = Number(head.dataset.key);
    if (state.collapsed.has(key)) state.collapsed.delete(key);
    else state.collapsed.add(key);
    render();
    els.list.querySelector(`.group-head[data-key="${key}"]`)?.focus();
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
  if (e.key === 'Escape' && !menu.isOpen && !filterMenu.isOpen && details.openId && !e.defaultPrevented) details.close();
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
  if (settings.autoDeleteDays) await store.purgeOlderThan(settings.autoDeleteDays);
  state.hasAccess = await hasAllSites().catch(() => true);
  await reload();
}

boot().catch((e) => console.error('[sidebar] boot failed', e));
