// Functions injected on demand with scripting.executeScript({ func }).
// Each one is serialized on its own, so it must not reference anything outside its body.

// Shows a small toast in the page. Idempotent: reuses an existing host element.
export function showToast(text, variant) {
  const HOST_ID = '__image-collector-toast__';
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;right:16px;bottom:16px;pointer-events:none;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        .t { font: 13px/1.4 system-ui, -apple-system, sans-serif; color: #111; background: #fff;
             border-left: 4px solid #16a34a; border-radius: 6px; padding: 10px 14px; max-width: 320px;
             box-shadow: 0 4px 16px rgba(0,0,0,.18); opacity: 0; transform: translateY(8px);
             transition: opacity .15s ease, transform .15s ease; }
        .t.show { opacity: 1; transform: none; }
        .t.warn { border-left-color: #ea580c; }
        @media (prefers-color-scheme: dark) { .t { color: #f3f4f6; background: #1f2937; } }
      </style>
      <div class="t" role="status"></div>`;
    (document.body || document.documentElement).appendChild(host);
  }
  const el = host.shadowRoot.querySelector('.t');
  el.textContent = text;
  el.className = 't' + (variant === 'warn' ? ' warn' : '');
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(host.__icTimer);
  host.__icTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => host.remove(), 200);
  }, variant === 'warn' ? 4000 : 2000);
}

// Reads what the page knows about the right-clicked image. Must run immediately:
// targetElementId expires when another context menu opens.
export function probeImage(targetId) {
  const el = browser.menus.getTargetElement(targetId);
  if (!el) return null;
  const img = el instanceof HTMLImageElement ? el : el.closest?.('img');
  const rect = el.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const base = document.baseURI;
  const abs = (u) => {
    try {
      return u ? new URL(u, base).href : null;
    } catch {
      return null;
    }
  };
  const largest = (srcset) => {
    let best = null;
    let score = -1;
    for (const part of (srcset || '').split(/,\s+/)) {
      const [u, d = '1x'] = part.trim().split(/\s+/);
      const s = parseFloat(d) || 1;
      if (u && s > score) {
        score = s;
        best = u;
      }
    }
    return best;
  };
  const ds = img?.dataset ?? {};
  return {
    currentSrc: img?.currentSrc || null,
    naturalWidth: img?.naturalWidth ?? 0,
    naturalHeight: img?.naturalHeight ?? 0,
    renderedWidth: Math.round(rect.width * dpr),
    renderedHeight: Math.round(rect.height * dpr),
    lazySrc: abs(ds.src || ds.lazySrc || ds.original || largest(ds.srcset || ds.lazySrcset)),
  };
}

// Fallback when the background cannot fetch the bytes: read a blob: URL from inside
// the page, or draw the loaded element to a canvas. Cross-origin images taint the canvas.
export async function extractImage(targetId, url) {
  const toDataUrl = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  if (url && url.startsWith('blob:')) {
    try {
      const res = await fetch(url);
      return { dataUrl: await toDataUrl(await res.blob()) };
    } catch {
      // Fall through to the canvas path.
    }
  }
  const el = browser.menus.getTargetElement(targetId);
  const img = el instanceof HTMLImageElement ? el : el?.closest?.('img');
  if (!img || !img.complete || !img.naturalWidth) return { error: 'notloaded' };
  // The element still shows something else (e.g. a lazy-load placeholder).
  if (url && img.currentSrc && img.currentSrc !== url) return { error: 'notloaded' };
  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    return { dataUrl: canvas.toDataURL('image/png') };
  } catch (e) {
    return { error: e?.name === 'SecurityError' ? 'tainted' : 'draw' };
  }
}
