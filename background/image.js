// Image decoding, conversion and hashing. Runs in the background event page,
// which has a DOM, OffscreenCanvas and createImageBitmap.

export const MAX_PIXELS = 40_000_000;
export const MAX_SIDE = 16_384;
// Thumbnails fill square tiles (object-fit: cover), so size them by their short side, enough for
// a ~150px tile on a 2x display, and cap the long side to keep storage small.
export const THUMB_MIN_SIDE = 240;
export const THUMB_MAX_SIDE = 480;

export class CaptureError extends Error {
  constructor(reason, message) {
    super(message ?? reason);
    this.name = 'CaptureError';
    this.reason = reason;
  }
}

const ascii = (b, offset, length) => String.fromCharCode(...b.subarray(offset, offset + length));

// Identifies the format from magic bytes; falls back to the Content-Type header.
export function sniffMime(bytes, contentType) {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === 'PNG') return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (ascii(b, 0, 4) === 'GIF8') return 'image/gif';
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return 'image/webp';
  if (ascii(b, 4, 4) === 'ftyp') {
    const brands = ascii(b, 8, Math.min(b.length, 64) - 8);
    if (/avi[fs]/.test(brands)) return 'image/avif';
    if (/hei[cx]|hev[cx]/.test(brands)) return 'image/heic';
  }
  if ((b[0] === 0xff && b[1] === 0x0a) || ascii(b, 4, 4) === 'JXL ') return 'image/jxl';
  if (ascii(b, 0, 2) === 'BM') return 'image/bmp';
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'image/x-icon';
  const head = new TextDecoder().decode(b.subarray(0, 2048)).replace(/^﻿/, '').trimStart();
  if (head.startsWith('<') && /<svg[\s>]/i.test(head)) return 'image/svg+xml';
  const ct = contentType?.split(';')[0].trim().toLowerCase();
  return ct?.startsWith('image/') ? ct : null;
}

// Scales (w, h) down to fit the pixel and side budget.
export function fitBudget(w, h, maxPixels = MAX_PIXELS, maxSide = MAX_SIDE) {
  let scale = Math.min(1, Math.sqrt(maxPixels / (w * h)), maxSide / w, maxSide / h);
  if (!Number.isFinite(scale) || scale <= 0) scale = 1;
  return { width: Math.max(1, Math.floor(w * scale)), height: Math.max(1, Math.floor(h * scale)), scaled: scale < 1 };
}

// Works out a raster size for an SVG: intrinsic size, else rendered size, else 1024 wide.
export function svgRasterSize(svgText, hint = {}) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = doc.documentElement;
  const abs = (v) => (/^\s*[\d.]+\s*(px)?\s*$/.test(v ?? '') ? parseFloat(v) : null);
  const w = abs(svg.getAttribute('width'));
  const h = abs(svg.getAttribute('height'));
  const vb = (svg.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  let ratio = vb.length === 4 && vb[2] > 0 && vb[3] > 0 ? vb[2] / vb[3] : null;
  if (w && h) return { width: Math.round(w), height: Math.round(h) };
  if (!ratio && hint.renderedWidth && hint.renderedHeight) ratio = hint.renderedWidth / hint.renderedHeight;
  ratio ||= 1;
  if (w) return { width: Math.round(w), height: Math.round(w / ratio) };
  if (h) return { width: Math.round(h * ratio), height: Math.round(h) };
  if (hint.renderedWidth) {
    return { width: Math.round(hint.renderedWidth), height: Math.round(hint.renderedWidth / ratio) };
  }
  return { width: 1024, height: Math.round(1024 / ratio) };
}

async function decodeViaImg(blob, size) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const width = size?.width || img.naturalWidth;
    const height = size?.height || img.naturalHeight;
    if (!width || !height) throw new CaptureError('decode', 'image has no size');
    const fit = fitBudget(width, height);
    const canvas = new OffscreenCanvas(fit.width, fit.height);
    canvas.getContext('2d').drawImage(img, 0, 0, fit.width, fit.height);
    return canvas.transferToImageBitmap();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Decodes image bytes into an ImageBitmap (first frame for animations).
 * @param {Uint8Array} bytes
 * @param {string|null} mime
 * @param {{ renderedWidth?: number, renderedHeight?: number }} hint from the page probe
 */
export async function decode(bytes, mime, hint = {}) {
  const blob = new Blob([bytes], { type: mime ?? '' });
  if (mime === 'image/svg+xml') {
    const size = svgRasterSize(new TextDecoder().decode(bytes), hint);
    return decodeViaImg(blob, size);
  }
  try {
    return await createImageBitmap(blob);
  } catch {
    // Some formats (e.g. ICO in older builds) only decode through <img>.
    return decodeViaImg(blob, null);
  }
}

async function bitmapToPng(bitmap) {
  const fit = fitBudget(bitmap.width, bitmap.height);
  const canvas = new OffscreenCanvas(fit.width, fit.height);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, fit.width, fit.height);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return { data: await blob.arrayBuffer(), type: 'png', scaled: fit.scaled };
}

const toArrayBuffer = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);

/**
 * Writes the image to the clipboard. PNG and JPEG pass through; everything else, or a
 * pass-through the clipboard rejects, is re-encoded as PNG from the decoded bitmap.
 * @returns {Promise<{ scaled: boolean }>}
 */
export async function copyToClipboard(bytes, mime, bitmap) {
  const passType = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpeg' : null;
  if (passType) {
    try {
      await browser.clipboard.setImageData(toArrayBuffer(bytes), passType);
      return { scaled: false };
    } catch (e) {
      if (!bitmap) throw new CaptureError('clipboard', e?.message);
    }
  }
  if (!bitmap) throw new CaptureError(mime ? 'decode' : 'unsupported');
  const png = await bitmapToPng(bitmap);
  try {
    await browser.clipboard.setImageData(png.data, 'png');
  } catch (e) {
    throw new CaptureError('clipboard', e?.message);
  }
  return { scaled: png.scaled };
}

export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

// Target size for a thumbnail: short side THUMB_MIN_SIDE, long side at most THUMB_MAX_SIDE, never upscaled.
export function thumbSize(width, height, minSide = THUMB_MIN_SIDE, maxSide = THUMB_MAX_SIDE) {
  const scale = Math.min(1, minSide / Math.min(width, height), maxSide / Math.max(width, height));
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

export async function makeThumbnail(bitmap) {
  const { w, h } = thumbSize(bitmap.width, bitmap.height);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.8 });
  return blobToDataUrl(blob);
}

export async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return 'sha256:' + Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
