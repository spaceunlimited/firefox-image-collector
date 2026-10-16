// URL helpers shared by background, sidebar and options. Pure functions, no browser APIs.

export function kindOf(url) {
  if (url.startsWith('data:')) return 'data';
  if (url.startsWith('blob:')) return 'blob';
  return 'http';
}

// Identity for http(s) images: drop the fragment, keep the query (CDNs select files by it).
export function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.href;
  } catch {
    return url;
  }
}

export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// Picks the URL that best represents what the user saw. `meta` comes from the in-page probe.
// Lazy-loading libraries keep the real URL in data-* attributes while src holds a placeholder.
export function chooseImageUrl(srcUrl, meta) {
  if (!meta) return srcUrl;
  const current = meta.currentSrc || srcUrl;
  const looksLikePlaceholder = meta.naturalWidth <= 1 || current.startsWith('data:');
  if (meta.lazySrc && looksLikePlaceholder) return meta.lazySrc;
  return current;
}

// Returns the URL of the widest candidate in a srcset string, resolved against base.
export function largestSrcsetCandidate(srcset, base) {
  if (!srcset) return null;
  let best = null;
  let bestScore = -1;
  for (const part of srcset.split(/,\s+/)) {
    const [url, descriptor = '1x'] = part.trim().split(/\s+/);
    if (!url) continue;
    const score = parseFloat(descriptor) || 1;
    if (score > bestScore) {
      bestScore = score;
      best = url;
    }
  }
  if (!best) return null;
  try {
    return new URL(best, base).href;
  } catch {
    return null;
  }
}
