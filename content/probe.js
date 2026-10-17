// Functions injected on demand with scripting.executeScript({ func }).
// Each one is serialized on its own, so it must not reference anything outside its body.

// Shows a small toast in the page, styled like a Firefox popup. Idempotent: reuses the host.
// `colors` ({ bg, text, border }) come from the installed theme; null means light/dark defaults.
export function showToast(text, variant, colors) {
  const HOST_ID = '__image-collector-toast__';
  const ICONS = {
    /* icons:start */
    ok: "M19.793 5.29305C20.1835 4.90252 20.8165 4.90252 21.207 5.29305C21.5975 5.68358 21.5975 6.31661 21.207 6.70711L9.70703 18.2071C9.31653 18.5976 8.6835 18.5976 8.29297 18.2071L2.79297 12.7071C2.40244 12.3166 2.40244 11.6836 2.79297 11.293C3.18349 10.9025 3.81651 10.9025 4.20703 11.293L9 16.086L19.793 5.29305Z",
    warn: "M8.53564 4.00024C10.0753 1.33371 13.9238 1.33371 15.4634 4.00024L22.3921 16.0002C23.9316 18.6669 22.0064 22.0002 18.9272 22.0002H5.07178C1.99298 22 0.0678837 18.6667 1.60693 16.0002L8.53564 4.00024ZM13.7319 5.00024C12.9621 3.66691 11.0369 3.66691 10.2671 5.00024L3.33936 17.0002C2.56998 18.3334 3.53254 20 5.07178 20.0002H18.9272C20.4668 20.0002 21.4295 18.3336 20.6597 17.0002L13.7319 5.00024ZM11.9995 14.5002C12.8279 14.5002 13.4995 15.1718 13.4995 16.0002C13.4994 16.8286 12.8279 17.5002 11.9995 17.5002C11.1713 17.5 10.4996 16.8284 10.4995 16.0002C10.4995 15.1719 11.1713 14.5005 11.9995 14.5002ZM11.9995 8.00024C12.5518 8.00024 12.9995 8.44796 12.9995 9.00024V11.5002C12.9994 12.0524 12.5517 12.5002 11.9995 12.5002C11.4475 12.5 10.9996 12.0523 10.9995 11.5002V9.00024C10.9995 8.44809 11.4474 8.00045 11.9995 8.00024Z",
    progress: "M21.5527 11.9375C22.1021 11.9919 22.5034 12.4818 22.4492 13.0312C22.218 15.374 21.2061 17.5709 19.5762 19.2695C17.9462 20.9682 15.7922 22.0698 13.4609 22.3975C11.1298 22.725 8.75661 22.2596 6.72168 21.0762C5.4481 20.3355 4.35373 19.3403 3.5 18.1631V22C3.5 22.5523 3.05228 23 2.5 23C1.94772 23 1.5 22.5523 1.5 22V15.5C1.5 14.9477 1.94772 14.5 2.5 14.5H9C9.55228 14.5 10 14.9477 10 15.5C10 16.0523 9.55228 16.5 9 16.5H4.79102C5.51979 17.6673 6.52395 18.6482 7.72656 19.3477C9.37388 20.3057 11.2955 20.6821 13.1826 20.417C15.0698 20.1517 16.8133 19.2599 18.1328 17.8848C19.4523 16.5097 20.2718 14.7315 20.459 12.835C20.5132 12.2853 21.0031 11.8833 21.5527 11.9375ZM21.5 1C22.0523 1 22.5 1.44772 22.5 2V8.5C22.5 9.05228 22.0523 9.5 21.5 9.5H15C14.4477 9.5 14 9.05228 14 8.5C14 7.94772 14.4477 7.5 15 7.5H19.21C18.4637 6.30416 17.4281 5.30548 16.1885 4.60352C14.5303 3.66451 12.6046 3.30988 10.7207 3.59668C8.83673 3.88359 7.10339 4.79547 5.7998 6.18555C4.4962 7.57572 3.6976 9.36411 3.53223 11.2627C3.48419 11.8127 2.99927 12.2197 2.44922 12.1719C1.89902 12.124 1.49212 11.6391 1.54004 11.0889C1.74433 8.74358 2.73049 6.53464 4.34082 4.81738C5.95107 3.10029 8.09178 1.97459 10.4189 1.62012C12.7463 1.26569 15.1253 1.70328 17.1738 2.86328C18.4915 3.60947 19.6224 4.62736 20.5 5.83789V2C20.5 1.44772 20.9477 1 21.5 1Z",
    /* icons:end */
  };
  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;right:16px;bottom:16px;pointer-events:none;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        .t { --bg: #ffffff; --fg: rgb(21, 20, 26); --bd: rgba(21, 20, 26, .18);
             display: flex; align-items: center; gap: 8px; max-width: 340px; padding: 10px 16px 10px 12px;
             font: menu; font-size: 13px; line-height: 1.35; color: var(--fg); background: var(--bg);
             border: 1px solid var(--bd); border-radius: 16px;
             box-shadow: 0 0 1px rgba(0,0,0,.15), 0 4px 16px rgba(0,0,0,.12);
             opacity: 0; transform: translateY(6px); transition: opacity .15s ease, transform .15s ease; }
        @media (prefers-color-scheme: dark) { .t { --bg: #171519; --fg: rgb(249, 249, 250); --bd: rgba(249, 249, 250, .18); } }
        .t.show { opacity: 1; transform: none; }
        svg { width: 16px; height: 16px; flex: none; }
        .ok svg { fill: #11ae84; }
        .warn svg { fill: #e08a1e; }
        .progress svg { fill: currentColor; opacity: .7; animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      </style>
      <div class="t" role="status"><svg viewBox="0 0 24 24" aria-hidden="true"><path/></svg><span></span></div>`;
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
