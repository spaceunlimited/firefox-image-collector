// Shows a stored image (data:/blob: sources have no URL to open). Usage: viewer.html?id=<entry id>
import { getEntry, getFull, getThumbs } from '../shared/store.js';
import { formatDims } from '../shared/format.js';

const id = new URLSearchParams(location.search).get('id');
const img = document.getElementById('img');
const caption = document.getElementById('caption');

async function show() {
  const entry = id && (await getEntry(id));
  if (!entry) {
    caption.textContent = 'This image is no longer in the collection.';
    return;
  }
  const src = (entry.hasFull && (await getFull(id))) || (await getThumbs([id]))[id] || null;
  if (!src) {
    caption.textContent = 'No stored copy of this image.';
    return;
  }
  img.src = src;
  const last = entry.captures.at(-1);
  img.alt = last?.pageTitle || entry.urls[0] || 'Collected image';
  document.title = `${entry.urls[0] ?? 'Image'} · Image Collector`;
  const parts = [entry.urls[0], formatDims(entry.width, entry.height)];
  if (!entry.hasFull) parts.push('thumbnail only');
  caption.textContent = parts.filter(Boolean).join(' · ');
}

show();
