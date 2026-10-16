// Functions injected on demand with scripting.executeScript({ func }).
// Each one is serialized on its own, so it must not reference anything outside its body.

// Shows a small toast in the page, styled like a Firefox popup. Idempotent: reuses the host.
// `colors` ({ bg, text, border }) come from the installed theme; null means light/dark defaults.
export function showToast(text, variant, colors) {
  const HOST_ID = '__image-collector-toast__';
  const ICONS = {
    ok: 'M6.3 11.6 2.7 8l1.1-1.1 2.5 2.5 5.9-5.9 1.1 1.1z',
    warn: 'M8 1.5 15 14H1zm-.75 4.25v4h1.5v-4zm0 5.25v1.5h1.5V11z',
    progress: 'M8 1.5a6.5 6.5 0 1 0 6.5 6.5H13A5 5 0 1 1 8 3z',
  };
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;right:16px;bottom:16px;pointer-events:none;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        .t { --bg: #fff; --fg: #15141a; --bd: #cfcfd8;
             display: flex; align-items: center; gap: 8px; max-width: 340px; padding: 8px 12px;
             font: menu; font-size: 13px; line-height: 1.35; color: var(--fg); background: var(--bg);
             border: 1px solid var(--bd); border-radius: 8px; box-shadow: 0 2px 14px rgba(0,0,0,.2);
             opacity: 0; transform: translateY(6px); transition: opacity .15s ease, transform .15s ease; }
        @media (prefers-color-scheme: dark) { .t { --bg: #42414d; --fg: #fbfbfe; --bd: #5b5b66; } }
        .t.show { opacity: 1; transform: none; }
        svg { width: 16px; height: 16px; flex: none; }
        .ok svg { fill: #2ac3a2; }
        .warn svg { fill: #ffa436; }
        .progress svg { fill: currentColor; opacity: .7; animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      </style>
      <div class="t" role="status"><svg viewBox="0 0 16 16" aria-hidden="true"><path/></svg><span></span></div>`;
    (document.body || document.documentElement).appendChild(host);
  }
  const el = host.shadowRoot.querySelector('.t');
  const kind = ICONS[variant] ? variant : 'ok';
  el.className = `t ${kind}`;
  el.querySelector('path').setAttribute('d', ICONS[kind]);
  el.querySelector('span').textContent = text;
  for (const [prop, value] of [['--bg', colors?.bg], ['--fg', colors?.text], ['--bd', colors?.border]]) {
    if (value) el.style.setProperty(prop, value);
    else el.style.removeProperty(prop);
  }
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(host.__icTimer);
  host.__icTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => host.remove(), 200);
  }, kind === 'progress' ? 60000 : kind === 'warn' ? 5000 : 2000);
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
