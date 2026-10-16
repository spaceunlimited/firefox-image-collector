// Single storage abstraction over browser.storage.local, used by every extension context.
//
// Keys:
//   meta          { schemaVersion }
//   settings      user settings, merged over DEFAULT_SETTINGS
//   index         { ids: [{ id, last }] newest first, urls: { normUrl: id }, hashes: { sha: id } }
//   entry:<id>    entry metadata, no image data
//   thumb:<id>    thumbnail data URL
//   full:<id>     stored copy of the original, only for data:/blob: sources
import { normalizeUrl } from './url.js';

export const SCHEMA_VERSION = 1;
export const MAX_CAPTURES_PER_ENTRY = 200;
export const MAX_TITLE_LENGTH = 300;
export const DEFAULT_SETTINGS = Object.freeze({
  autoDeleteDays: null,
  view: 'grid',
});

export const entryKey = (id) => `entry:${id}`;
export const thumbKey = (id) => `thumb:${id}`;
export const fullKey = (id) => `full:${id}`;

export class StorageFullError extends Error {
  constructor(cause) {
    super('Storage is full');
    this.name = 'StorageFullError';
    this.cause = cause;
  }
}

const area = () => browser.storage.local;

// Serializes read-modify-write cycles within one extension context.
let chain = Promise.resolve();
function withLock(fn) {
  const run = chain.then(fn);
  chain = run.catch(() => {});
  return run;
}

export function emptyIndex() {
  return { ids: [], urls: {}, hashes: {} };
}

function normalizeIndex(index) {
  if (!index || !Array.isArray(index.ids)) return emptyIndex();
  return { ids: index.ids, urls: index.urls ?? {}, hashes: index.hashes ?? {} };
}

export async function readIndex() {
  const { index } = await area().get('index');
  return normalizeIndex(index);
}

function newId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Keeps index.ids sorted by `last`, newest first.
function placeInIndex(index, id, last) {
  const ids = index.ids.filter((x) => x.id !== id);
  let at = ids.findIndex((x) => x.last < last);
  if (at === -1) at = ids.length;
  ids.splice(at, 0, { id, last });
  index.ids = ids;
}

function dropFromIndex(index, id) {
  index.ids = index.ids.filter((x) => x.id !== id);
  for (const [k, v] of Object.entries(index.urls)) if (v === id) delete index.urls[k];
  for (const [k, v] of Object.entries(index.hashes)) if (v === id) delete index.hashes[k];
}

function registerInIndex(index, entry) {
  if (entry.kind === 'http') {
    for (const u of entry.urls) if (!index.urls[u]) index.urls[u] = entry.id;
  }
  if (entry.hash && !index.hashes[entry.hash]) index.hashes[entry.hash] = entry.id;
  placeInIndex(index, entry.id, entry.lastCapturedAt);
}

// Writes `sets`; on failure retries once without image data, so the metadata survives a full disk.
async function writeWithFallback(sets, entry, previous) {
  try {
    await area().set(sets);
    return { degraded: false };
  } catch (err) {
    const id = entry.id;
    delete sets[thumbKey(id)];
    delete sets[fullKey(id)];
    entry.hasThumb = previous.hasThumb;
    entry.hasFull = previous.hasFull;
    try {
      await area().set(sets);
      return { degraded: true };
    } catch (err2) {
      throw new StorageFullError(err2 ?? err);
    }
  }
}

function newEntry(id, kind, at) {
  return {
    id,
    hash: null,
    urls: [],
    kind,
    mime: null,
    width: null,
    height: null,
    bytes: null,
    tags: [],
    firstCapturedAt: at,
    lastCapturedAt: at,
    captures: [],
    copyCount: 0,
    lastCopy: null,
    hasThumb: false,
    hasFull: false,
  };
}

/**
 * Records one capture. Merges into an existing entry by normalized URL, then by content hash.
 * @param {object} c capture: { at, kind, imageUrl, label?, pageUrl, pageTitle, frameUrl?, copied,
 *   reason?, hash?, mime?, width?, height?, bytes?, thumb?, full? }
 * @returns {Promise<{ entry, isNew, degraded }>}
 */
export function recordCapture(c) {
  return withLock(async () => {
    const index = await readIndex();
    const norm = c.kind === 'http' ? normalizeUrl(c.imageUrl) : null;

    let entry = null;
    for (const id of [norm && index.urls[norm], c.hash && index.hashes[c.hash]]) {
      if (!id) continue;
      entry = (await area().get(entryKey(id)))[entryKey(id)] ?? null;
      if (entry) break;
    }
    const isNew = !entry;
    if (isNew) entry = newEntry(newId(), c.kind, c.at);
    const previous = { hasThumb: entry.hasThumb, hasFull: entry.hasFull };

    const listedUrl = norm ?? c.label ?? c.kind;
    if (!entry.urls.includes(listedUrl)) entry.urls.push(listedUrl);
    entry.hash ??= c.hash ?? null;
    entry.mime ??= c.mime ?? null;
    if (c.width && c.height) {
      entry.width = c.width;
      entry.height = c.height;
    }
    if (c.bytes) entry.bytes = c.bytes;
    entry.firstCapturedAt = Math.min(entry.firstCapturedAt, c.at);
    entry.lastCapturedAt = Math.max(entry.lastCapturedAt, c.at);

    const capture = {
      at: c.at,
      imageUrl: listedUrl,
      pageUrl: c.pageUrl ?? '',
      pageTitle: (c.pageTitle ?? '').slice(0, MAX_TITLE_LENGTH),
      copied: Boolean(c.copied),
    };
    if (c.frameUrl) capture.frameUrl = c.frameUrl;
    entry.captures.push(capture);
    if (entry.captures.length > MAX_CAPTURES_PER_ENTRY) {
      entry.captures = entry.captures.slice(-MAX_CAPTURES_PER_ENTRY);
    }
    if (c.copied) entry.copyCount += 1;
    entry.lastCopy = c.copied
      ? { status: 'ok', at: c.at }
      : { status: 'failed', reason: c.reason ?? 'unknown', at: c.at };

    if (norm) index.urls[norm] = entry.id;
    if (c.hash) index.hashes[c.hash] = entry.id;
    placeInIndex(index, entry.id, entry.lastCapturedAt);

    const sets = { index, [entryKey(entry.id)]: entry };
    if (c.thumb && !entry.hasThumb) {
      sets[thumbKey(entry.id)] = c.thumb;
      entry.hasThumb = true;
    }
    if (c.full && !entry.hasFull) {
      sets[fullKey(entry.id)] = c.full;
      entry.hasFull = true;
    }
    const { degraded } = await writeWithFallback(sets, entry, previous);
    return { entry, isNew, degraded };
  });
}

// Loads all entries newest first. Drops index ids whose entry is missing.
export async function loadAll() {
  const index = await readIndex();
  if (!index.ids.length) return [];
  const got = await area().get(index.ids.map((x) => entryKey(x.id)));
  const entries = [];
  const missing = [];
  for (const { id } of index.ids) {
    const e = got[entryKey(id)];
    if (e) entries.push(e);
    else missing.push(id);
  }
  if (missing.length) {
    withLock(async () => {
      const idx = await readIndex();
      for (const id of missing) dropFromIndex(idx, id);
      await area().set({ index: idx });
    }).catch((e) => console.warn('[store] self-heal failed', e));
  }
  return entries.sort((a, b) => b.lastCapturedAt - a.lastCapturedAt);
}

export async function getEntry(id) {
  return (await area().get(entryKey(id)))[entryKey(id)] ?? null;
}

export async function getThumbs(ids) {
  if (!ids.length) return {};
  const got = await area().get(ids.map(thumbKey));
  const out = {};
  for (const id of ids) if (got[thumbKey(id)]) out[id] = got[thumbKey(id)];
  return out;
}

export async function getFull(id) {
  return (await area().get(fullKey(id)))[fullKey(id)] ?? null;
}

// Applies `mutate(entry)` and saves. Returns the updated entry, or null if it no longer exists.
export function updateEntry(id, mutate) {
  return withLock(async () => {
    const entry = await getEntry(id);
    if (!entry) return null;
    mutate(entry);
    const index = await readIndex();
    placeInIndex(index, id, entry.lastCapturedAt);
    await area().set({ [entryKey(id)]: entry, index });
    return entry;
  });
}

// Stores a thumbnail for an entry that has none yet (e.g. after a successful re-copy).
export function saveThumb(id, thumb) {
  return withLock(async () => {
    const entry = await getEntry(id);
    if (!entry) return;
    entry.hasThumb = true;
    await area().set({ [entryKey(id)]: entry, [thumbKey(id)]: thumb });
  });
}

// Deletes an entry and returns everything needed to restore it.
export function removeEntry(id) {
  return withLock(async () => {
    const got = await area().get([entryKey(id), thumbKey(id), fullKey(id)]);
    const index = await readIndex();
    dropFromIndex(index, id);
    await area().set({ index });
    await area().remove([entryKey(id), thumbKey(id), fullKey(id)]);
    return {
      entry: got[entryKey(id)] ?? null,
      thumb: got[thumbKey(id)] ?? null,
      full: got[fullKey(id)] ?? null,
    };
  });
}

export function restoreEntry(bundle) {
  return withLock(async () => {
    const { entry, thumb, full } = bundle;
    if (!entry) return;
    const index = await readIndex();
    registerInIndex(index, entry);
    const sets = { index, [entryKey(entry.id)]: entry };
    if (thumb) sets[thumbKey(entry.id)] = thumb;
    if (full) sets[fullKey(entry.id)] = full;
    await area().set(sets);
  });
}

// Deletes entries whose last capture is older than `days`. Returns the number removed.
export function purgeOlderThan(days, now = Date.now()) {
  return withLock(async () => {
    if (!days || days <= 0) return 0;
    const cutoff = now - days * 86_400_000;
    const index = await readIndex();
    const old = index.ids.filter((x) => x.last < cutoff).map((x) => x.id);
    if (!old.length) return 0;
    for (const id of old) dropFromIndex(index, id);
    await area().set({ index });
    await area().remove(old.flatMap((id) => [entryKey(id), thumbKey(id), fullKey(id)]));
    return old.length;
  });
}

export async function getSettings() {
  const { settings } = await area().get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
}

export function setSettings(patch) {
  return withLock(async () => {
    const next = { ...(await getSettings()), ...patch };
    await area().set({ settings: next });
    return next;
  });
}

// Removes all collected data but keeps settings.
export function clearAll() {
  return withLock(async () => {
    const all = await area().get(null);
    const keys = Object.keys(all).filter((k) => k !== 'settings');
    await area().remove(keys);
    await area().set({ meta: { schemaVersion: SCHEMA_VERSION }, index: emptyIndex() });
  });
}

export async function ensureSchema() {
  const { meta } = await area().get('meta');
  if (!meta) await area().set({ meta: { schemaVersion: SCHEMA_VERSION } });
  // Future migrations go here, keyed on meta.schemaVersion.
}
