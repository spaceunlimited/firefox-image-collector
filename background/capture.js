// Capture pipeline: probe ∥ fetch → (page fallback) → decode → copy → thumbnail → store.
import { probeImage, extractImage } from '../content/probe.js';
import { kindOf, chooseImageUrl } from '../shared/url.js';
import { formatBytes } from '../shared/format.js';
import { hasAllSites } from '../shared/permissions.js';
import { recordCapture, StorageFullError } from '../shared/store.js';
import { sniffMime, decode, copyToClipboard, makeThumbnail, sha256, blobToDataUrl, CaptureError } from './image.js';
import { flashBadge, toast } from './feedback.js';

const FETCH_TIMEOUT_MS = 20_000;
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_FULL_BYTES = 2 * 1024 * 1024;
const PROGRESS_TOAST_DELAY_MS = 500;

/** @returns {Promise<{ bytes: Uint8Array, contentType: string|null } | { error: string }>} */
export async function fetchImage(url) {
  try {
    // With host permission the fetch bypasses CORS and may send cookies. Without it,
    // only CORS-enabled hosts answer, and those reject credentialed requests to "*".
    const credentials = url.startsWith('data:') ? 'omit' : (await hasAllSites()) ? 'include' : 'omit';
    const res = await fetch(url, { credentials, cache: 'force-cache', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (!res.ok) {
      console.warn('[capture] fetch failed', url.slice(0, 120), 'HTTP', res.status);
      return { error: 'http', status: res.status };
    }
    if (Number(res.headers.get('content-length')) > MAX_BYTES) return { error: 'toolarge' };
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) return { error: 'toolarge' };
    if (!bytes.byteLength) return { error: 'nobytes' };
    return { bytes, contentType: res.headers.get('content-type') };
  } catch (e) {
    console.warn('[capture] fetch failed', url.slice(0, 120), e?.name, e?.message);
    return { error: e?.name === 'TimeoutError' ? 'timeout' : 'cors' };
  }
}

async function inject(tabId, frameId, func, args) {
  try {
    const [res] = await browser.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, func, args });
    return res?.result ?? null;
  } catch (e) {
    // Cross-origin frames without host permission, privileged pages, discarded tabs.
    console.warn('[capture] page script failed', func.name, 'frame', frameId, e?.message);
    return null;
  }
}

/**
 * Decodes, copies and summarizes image bytes.
 * @param {{ copy?: boolean, thumbnail?: boolean }} opts
 */
export async function processBytes(bytes, contentType, hint = {}, { copy = true, thumbnail = true } = {}) {
  const mime = sniffMime(bytes, contentType);
  const out = { mime, bytes: bytes.byteLength, hash: await sha256(bytes), copied: false, scaled: false };
  let bitmap = null;
  try {
    bitmap = await decode(bytes, mime, hint);
    out.width = bitmap.width;
    out.height = bitmap.height;
  } catch (e) {
    console.warn('[capture] decode failed', mime, e);
  }
  if (copy) {
    try {
      const { scaled } = await copyToClipboard(bytes, mime, bitmap);
      out.copied = true;
      out.scaled = scaled;
    } catch (e) {
      out.reason = e instanceof CaptureError ? e.reason : 'clipboard';
      console.warn('[capture] copy failed', out.reason, e);
    }
  }
  if (bitmap) {
    if (thumbnail) {
      try {
        out.thumb = await makeThumbnail(bitmap);
      } catch (e) {
        console.warn('[capture] thumbnail failed', e);
      }
    }
    bitmap.close();
  }
  return out;
}

// Locates image bytes for a menu click, trying the background fetch first and the page second.
async function obtainBytes(info, tab, meta, firstFetch) {
  const frameId = info.frameId ?? 0;
  const srcUrl = info.srcUrl;
  const imageUrl = chooseImageUrl(srcUrl, meta);
  let got = (await firstFetch) ?? { error: 'nobytes' };
  // The probe found a better URL (srcset choice or the real file behind a lazy-load
  // placeholder). Never fall back to the placeholder bytes.
  if (imageUrl !== srcUrl) got = kindOf(imageUrl) === 'blob' ? { error: 'nobytes' } : await fetchImage(imageUrl);
  if (!got.bytes && got.error !== 'toolarge') {
    const extracted = await inject(tab.id, frameId, extractImage, [info.targetElementId, imageUrl]);
    console.log('[capture] page fallback', extracted?.dataUrl ? 'got image' : extracted?.error ?? 'no result');
    if (extracted?.dataUrl) {
      const fromPage = await fetchImage(extracted.dataUrl);
      if (fromPage.bytes) got = fromPage;
    } else if (extracted?.error === 'tainted') {
      got = { error: 'cors' };
    } else if (extracted?.error === 'notloaded' && got.error === 'nobytes') {
      got = { error: 'notloaded' };
    }
  }
  return { imageUrl, got };
}

function feedbackText(result, { incognito, storageFull, needsPermission }) {
  if (storageFull) return { text: 'Not saved: storage is full.', variant: 'warn' };
  if (incognito) {
    return result.copied
      ? { text: 'Copied. Not saved in private windows.', variant: 'ok' }
      : { text: "Couldn't copy.", variant: 'warn' };
  }
  if (result.copied) return { text: result.scaled ? 'Copied (reduced size) & saved' : 'Copied & saved', variant: 'ok' };
  return { text: needsPermission ? 'Saved, not copied. Allow site access in settings.' : 'Saved, not copied.', variant: 'warn' };
}

export async function captureFromMenu(info, tab) {
  // Large images take seconds to convert; tell the user something is happening.
  const progress = { timer: null, shown: null };
  progress.timer = setTimeout(() => {
    progress.shown = toast(tab.id, 'Copying…', 'progress');
  }, PROGRESS_TOAST_DELAY_MS);
  try {
    return await capture(info, tab, progress);
  } finally {
    clearTimeout(progress.timer);
  }
}

async function capture(info, tab, progress) {
  const at = Date.now();
  const frameId = info.frameId ?? 0;
  // Start the probe and the fetch together; the probe must run before the target id expires.
  const probeP = info.targetElementId != null ? inject(tab.id, frameId, probeImage, [info.targetElementId]) : null;
  const firstFetch = kindOf(info.srcUrl) === 'blob' ? null : fetchImage(info.srcUrl);
  const meta = await probeP;
  console.log('[capture] start', { srcUrl: info.srcUrl.slice(0, 120), frameId, probe: meta });
  const { imageUrl, got } = await obtainBytes(info, tab, meta, firstFetch);
  const kind = kindOf(imageUrl);

  const result = {
    at,
    kind,
    imageUrl,
    pageUrl: info.pageUrl ?? tab.url ?? '',
    pageTitle: tab.title ?? '',
    frameUrl: frameId ? info.frameUrl : undefined,
    width: meta?.naturalWidth || null,
    height: meta?.naturalHeight || null,
    copied: false,
  };

  if (got.bytes) {
    Object.assign(result, await processBytes(got.bytes, got.contentType, meta ?? {}));
    if (kind !== 'http') {
      result.label = `${kind === 'data' ? 'Embedded' : 'Generated'} ${result.mime ?? 'image'} · ${formatBytes(result.bytes)}`;
      if (got.bytes.byteLength <= MAX_FULL_BYTES) {
        result.full = await blobToDataUrl(new Blob([got.bytes], { type: result.mime ?? 'application/octet-stream' }));
      }
    }
  } else {
    result.reason = got.error;
    if (kind !== 'http') result.label = `${kind === 'data' ? 'Embedded' : 'Generated'} image`;
  }

  let storageFull = false;
  if (!tab.incognito) {
    try {
      await recordCapture(result);
    } catch (e) {
      if (!(e instanceof StorageFullError)) throw e;
      storageFull = true;
    }
  }

  const needsPermission = !result.copied && result.reason === 'cors' && !(await hasAllSites());
  const { text, variant } = feedbackText(result, { incognito: tab.incognito, storageFull, needsPermission });
  clearTimeout(progress.timer);
  await progress.shown; // so the final toast always replaces it
  flashBadge(tab.id, variant);
  toast(tab.id, text, variant);
  console.log('[capture] done', {
    ms: Date.now() - at,
    imageUrl,
    copied: result.copied,
    reason: result.reason,
    mime: result.mime,
    dims: [result.width, result.height],
    scaled: result.scaled,
  });
  return result;
}
