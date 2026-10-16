// Export and import formats. Pure functions; storage access lives in store.js.
import { MAX_CAPTURES_PER_ENTRY, MAX_TITLE_LENGTH } from './limits.js';

export const EXPORT_FORMAT = 'image-collector';
export const EXPORT_VERSION = 1;

/**
 * @param {object[]} entries
 * @param {Record<string, string>} thumbs id → data URL
 * @param {Record<string, string>} fulls id → data URL
 */
export function buildJson(entries, thumbs = {}, fulls = {}, now = Date.now()) {
  return JSON.stringify(
    {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: new Date(now).toISOString(),
      entries: entries.map((e) => ({ ...e, thumb: thumbs[e.id] ?? null, full: fulls[e.id] ?? null })),
    },
    null,
    1,
  );
}

const CSV_COLUMNS = ['imageUrl', 'width', 'height', 'capturedAt', 'pageUrl', 'pageTitle', 'frameUrl', 'tags', 'copied'];

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// One row per capture, RFC 4180 quoting, CRLF line endings.
export function buildCsv(entries) {
  const rows = [CSV_COLUMNS.join(',')];
  for (const e of entries) {
    for (const c of e.captures) {
      rows.push(
        [c.imageUrl, e.width, e.height, new Date(c.at).toISOString(), c.pageUrl, c.pageTitle, c.frameUrl, e.tags.join(';'), c.copied]
          .map(csvCell)
          .join(','),
      );
    }
  }
  return rows.join('\r\n') + '\r\n';
}

const str = (v, max = 4096) => (typeof v === 'string' ? v.slice(0, max) : null);
const num = (v) => (Number.isFinite(v) && v >= 0 ? v : null);
const imageDataUrl = (v) => (typeof v === 'string' && /^data:image\/[\w.+-]+;base64,/.test(v) ? v : null);

// Rebuilds an imported entry from known fields only, so a crafted file can't inject extra data.
export function sanitizeEntry(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const urls = Array.isArray(raw.urls) ? raw.urls.map((u) => str(u)).filter(Boolean) : [];
  const captures = (Array.isArray(raw.captures) ? raw.captures : [])
    .map((c) => {
      if (!c || !num(c.at)) return null;
      const out = {
        at: c.at,
        imageUrl: str(c.imageUrl) ?? urls[0] ?? '',
        pageUrl: str(c.pageUrl) ?? '',
        pageTitle: (str(c.pageTitle) ?? '').slice(0, MAX_TITLE_LENGTH),
        copied: Boolean(c.copied),
      };
      if (str(c.frameUrl)) out.frameUrl = str(c.frameUrl);
      return out;
    })
    .filter(Boolean)
    .sort((a, b) => a.at - b.at)
    .slice(-MAX_CAPTURES_PER_ENTRY);
  if (!urls.length || !captures.length) return null;
  const kind = ['http', 'data', 'blob'].includes(raw.kind) ? raw.kind : 'http';
  const reason = str(raw.lastCopy?.reason, 32);
  const thumb = imageDataUrl(raw.thumb);
  const full = imageDataUrl(raw.full);
  return {
    entry: {
      id: /^[0-9a-f]{16}$/.test(raw.id ?? '') ? raw.id : null,
      hash: /^sha256:[0-9a-f]{64}$/.test(raw.hash ?? '') ? raw.hash : null,
      urls,
      kind,
      mime: str(raw.mime, 64),
      width: num(raw.width),
      height: num(raw.height),
      bytes: num(raw.bytes),
      tags: [...new Set((Array.isArray(raw.tags) ? raw.tags : []).map((t) => str(t, 32)?.trim().toLowerCase()).filter(Boolean))],
      firstCapturedAt: captures[0].at,
      lastCapturedAt: captures.at(-1).at,
      captures,
      copyCount: num(raw.copyCount) ?? 0,
      lastCopy:
        raw.lastCopy?.status === 'failed'
          ? { status: 'failed', reason: reason ?? 'unknown', at: num(raw.lastCopy.at) ?? captures.at(-1).at }
          : raw.lastCopy?.status === 'ok'
            ? { status: 'ok', at: num(raw.lastCopy.at) ?? captures.at(-1).at }
            : null,
      hasThumb: Boolean(thumb),
      hasFull: Boolean(full),
    },
    thumb,
    full,
  };
}

/** @returns {{ items: { entry, thumb, full }[], invalid: number }} */
export function parseImport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('The file is not valid JSON.');
  }
  if (data?.format !== EXPORT_FORMAT || !Array.isArray(data.entries)) {
    throw new Error('This is not an Image Collector export.');
  }
  if (data.version > EXPORT_VERSION) throw new Error('This export comes from a newer version of Image Collector.');
  const items = [];
  let invalid = 0;
  for (const raw of data.entries) {
    const item = sanitizeEntry(raw);
    if (item) items.push(item);
    else invalid += 1;
  }
  return { items, invalid };
}

// Merges an imported entry into an existing one. Re-importing the same export changes nothing.
export function mergeEntries(base, incoming) {
  const key = (c) => `${c.at}|${c.pageUrl}`;
  const seen = new Set(base.captures.map(key));
  const captures = [...base.captures, ...incoming.captures.filter((c) => !seen.has(key(c)))]
    .sort((a, b) => a.at - b.at)
    .slice(-MAX_CAPTURES_PER_ENTRY);
  const area = (e) => (e.width ?? 0) * (e.height ?? 0);
  const bigger = area(incoming) > area(base) ? incoming : base;
  const lastCopy = (incoming.lastCopy?.at ?? 0) > (base.lastCopy?.at ?? 0) ? incoming.lastCopy : base.lastCopy;
  return {
    ...base,
    hash: base.hash ?? incoming.hash,
    urls: [...new Set([...base.urls, ...incoming.urls])],
    mime: base.mime ?? incoming.mime,
    width: bigger.width,
    height: bigger.height,
    bytes: base.bytes ?? incoming.bytes,
    tags: [...new Set([...base.tags, ...incoming.tags])],
    firstCapturedAt: Math.min(base.firstCapturedAt, incoming.firstCapturedAt),
    lastCapturedAt: Math.max(base.lastCapturedAt, incoming.lastCapturedAt),
    captures,
    copyCount: Math.max(base.copyCount, incoming.copyCount),
    lastCopy,
  };
}
