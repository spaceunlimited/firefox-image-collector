// Copies a collected image to the clipboard again, from its stored URLs or stored copy.
import { getEntry, getFull, updateEntry, saveThumb } from '../shared/store.js';
import { fetchImage, processBytes } from './capture.js';

async function findBytes(entry) {
  let lastError = 'nobytes';
  if (entry.kind === 'http') {
    for (const url of entry.urls) {
      const got = await fetchImage(url);
      if (got.bytes) return { got };
      lastError = got.error;
    }
  }
  if (entry.hasFull) {
    const full = await getFull(entry.id);
    if (full) {
      const got = await fetchImage(full);
      if (got.bytes) return { got };
    }
  }
  return { error: lastError };
}

/**
 * SVG entries re-copy as markup text, like their original capture; everything else as an
 * image. When the background clipboard rejects the text, it is returned so the sidebar
 * (a focused page) can write it and confirm with a 'recopy-succeeded' message.
 * @returns {Promise<{ ok: boolean, reason?: string, scaled?: boolean, asSvg?: boolean, text?: string }>}
 */
export async function recopy(id) {
  const entry = await getEntry(id);
  if (!entry) return { ok: false, reason: 'missing' };
  const { got, error } = await findBytes(entry);
  const at = Date.now();
  if (!got) {
    await updateEntry(id, (e) => {
      e.lastCopy = { status: 'failed', reason: error, at };
    });
    return { ok: false, reason: error };
  }
  const asSvg = entry.mime === 'image/svg+xml';
  const out = await processBytes(got.bytes, got.contentType, {}, { copy: !asSvg, thumbnail: !entry.hasThumb });
  let text = null;
  if (asSvg) {
    text = new TextDecoder().decode(got.bytes);
    try {
      await navigator.clipboard.writeText(text);
      out.copied = true;
    } catch (e) {
      out.reason = 'clipboard';
      console.warn('[recopy] background text copy failed', e?.message);
    }
  }
  await updateEntry(id, (e) => {
    if (out.copied) e.copyCount += 1;
    e.lastCopy = out.copied ? { status: 'ok', at } : { status: 'failed', reason: out.reason, at };
    if (out.width && !e.width) {
      e.width = out.width;
      e.height = out.height;
    }
    e.hash ??= out.hash;
    e.mime ??= out.mime;
  });
  if (out.thumb && !entry.hasThumb) await saveThumb(id, out.thumb);
  console.log('[recopy]', { id, ok: out.copied, reason: out.reason, asSvg });
  const res = { ok: out.copied, reason: out.reason, scaled: out.scaled, asSvg };
  if (asSvg && !out.copied) res.text = text;
  return res;
}

// Records a copy the sidebar completed after the background clipboard failed.
export function markCopied(id) {
  return updateEntry(id, (e) => {
    e.copyCount += 1;
    e.lastCopy = { status: 'ok', at: Date.now() };
  });
}
