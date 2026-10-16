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

/** @returns {Promise<{ ok: boolean, reason?: string, scaled?: boolean }>} */
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
  const out = await processBytes(got.bytes, got.contentType, {}, { copy: true, thumbnail: !entry.hasThumb });
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
  console.log('[recopy]', { id, ok: out.copied, reason: out.reason });
  return { ok: out.copied, reason: out.reason, scaled: out.scaled };
}
