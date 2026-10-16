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
