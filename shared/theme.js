// Applies the installed Firefox theme's colors to an extension page as CSS custom properties.
// Built-in themes report no colors; the stylesheet's light/dark defaults cover those.
import { FINGERPRINT_KEYS, NOVA_DARK } from './nova-themes.js';

const toCss = (v) => {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (Array.isArray(v) && (v.length === 3 || v.length === 4)) return `${v.length === 4 ? 'rgba' : 'rgb'}(${v.join(', ')})`;
  return null;
};

function pick(colors, keys, { opaque = false } = {}) {
  for (const k of keys) {
    const v = toCss(colors[k]);
    if (v && (!opaque || colorAlpha(v) >= 1)) return v;
  }
  return null;
}

// Alpha of rgba()/#rrggbbaa colors; 1 for everything else.
export function colorAlpha(css) {
  const s = String(css).trim().toLowerCase();
  const rgba = /^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)$/.exec(s);
  if (rgba) return Number(rgba[1]);
  const hex = /^#[0-9a-f]{8}$/.exec(s);
  if (hex) return parseInt(s.slice(7, 9), 16) / 255;
  return 1;
}

// Variables whose color is painted as a solid surface; translucent values are skipped.
const OPAQUE = new Set(['--ic-bg', '--ic-popup', '--ic-field']);

// CSS variable → theme color keys, in order of preference.
export const THEME_MAP = {
  '--ic-bg': ['sidebar', 'toolbar', 'frame'],
  '--ic-text': ['sidebar_text', 'toolbar_text', 'bookmark_text', 'tab_text', 'tab_background_text'],
  '--ic-border': ['sidebar_border', 'toolbar_bottom_separator', 'popup_border'],
  '--ic-field': ['toolbar_field'],
  '--ic-field-text': ['toolbar_field_text'],
  '--ic-field-border': ['toolbar_field_border'],
  '--ic-focus': ['toolbar_field_border_focus', 'focus_outline', 'tab_line'],
  '--ic-accent': ['tab_line', 'icons_attention', 'toolbar_field_border_focus'],
  '--ic-hover': ['button_background_hover'],
  '--ic-active': ['button_background_active'],
  '--ic-highlight': ['sidebar_highlight', 'popup_highlight'],
  '--ic-highlight-text': ['sidebar_highlight_text', 'popup_highlight_text'],
  '--ic-popup': ['popup'],
  '--ic-popup-text': ['popup_text'],
  '--ic-popup-border': ['popup_border'],
  '--ic-popup-hover': ['popup_highlight'],
  '--ic-popup-hover-text': ['popup_highlight_text'],
  '--ic-icons': ['icons', 'sidebar_text', 'toolbar_text'],
};

/** @returns {Record<string, string>} only the variables the theme defines */
export function themeVars(colors) {
  if (!colors || typeof colors !== 'object') return {};
  const out = {};
  for (const [name, keys] of Object.entries(THEME_MAP)) {
    const v = pick(colors, keys, { opaque: OPAQUE.has(name) });
    if (v) out[name] = v;
  }
  // Many themes (all of Mozilla's Nova themes) use gray for tab_line and focus colors. A gray
  // or low-contrast accent makes buttons and links unreadable, so keep the default accent then.
  for (const name of ['--ic-accent', '--ic-focus']) {
    if (out[name] && !usableAccent(out[name], out['--ic-bg'])) delete out[name];
  }
  // A field the same color as the sidebar is invisible there (e.g. white on white).
  if (out['--ic-field'] && out['--ic-bg'] && colorDistance(out['--ic-field'], out['--ic-bg']) < 12) {
    out['--ic-field'] = 'color-mix(in srgb, var(--ic-text) 7%, var(--ic-bg))';
  }
  return out;
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// WCAG contrast ratio (1–21); null if either color can't be parsed.
export function contrast(a, b) {
  const x = parseColor(a);
  const y = parseColor(b);
  if (!x || !y) return null;
  const [l1, l2] = [luminance(x), luminance(y)].sort((m, n) => n - m);
  return (l1 + 0.05) / (l2 + 0.05);
}

// HSL saturation (0–1); null if unparseable.
export function saturation(css) {
  const rgb = parseColor(css);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return 0;
  return (max - min) / (1 - Math.abs(2 * l - 1));
}

// An accent must be clearly colored and readable on the background (3:1, the WCAG UI minimum).
export function usableAccent(accent, bg) {
  const sat = saturation(accent);
  if (sat === null || sat < 0.3) return false;
  if (!bg) return true;
  const ratio = contrast(accent, bg);
  return ratio === null || ratio >= 3;
}

// Rough RGB distance (0–441); Infinity if either color can't be parsed.
export function colorDistance(a, b) {
  const x = parseColor(a);
  const y = parseColor(b);
  if (!x || !y) return Infinity;
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

// Parses #rgb, #rrggbb, #rrggbbaa, rgb() and rgba(). Returns null for anything else.
export function parseColor(css) {
  const s = String(css).trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(s);
  if (m) {
    let hex = m[1];
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join('');
    if (hex.length !== 6 && hex.length !== 8) return null;
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(s);
  if (m) return [m[1], m[2], m[3]].map(Number);
  return null;
}

// Whether a background color is dark (relative luminance below 0.4). null if unparseable.
export function isDark(css) {
  const rgb = parseColor(css);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4;
}

/**
 * Theme variables to apply, given whether Firefox currently uses a dark color scheme.
 * theme.getCurrent() only returns a theme's light colors, even when Firefox shows its
 * dark_theme variant. If the colors contradict the current scheme, use Firefox defaults.
 */
export function chooseVars(colors, prefersDark) {
  const vars = themeVars(colors);
  const bg = vars['--ic-bg'];
  if (!bg || prefersDark == null) return vars;
  const dark = isDark(bg);
  if (dark === null || dark === prefersDark) return vars;
  // Mozilla's Nova themes: we know their dark colors.
  const known = prefersDark ? NOVA_DARK[themeFingerprint(colors)] : null;
  return known ? themeVars(known) : {};
}

// Identifies a theme by a few of its light colors (see tools/gen-nova-themes.py).
export function themeFingerprint(colors) {
  return FINGERPRINT_KEYS.map((k) => toCss(colors?.[k]) ?? '').join('|');
}

export function applyVars(root, vars) {
  for (const name of Object.keys(THEME_MAP)) root.style.removeProperty(name);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  const dark = vars['--ic-bg'] ? isDark(vars['--ic-bg']) : null;
  root.style.colorScheme = dark === null ? '' : dark ? 'dark' : 'light';
  root.dataset.theme = Object.keys(vars).length ? 'custom' : 'default';
}

// Reads the theme of this page's window and keeps following theme changes.
export async function followTheme(root = document.documentElement) {
  if (!browser.theme?.getCurrent) return;
  const scheme = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
  const update = async () => {
    let info = {};
    try {
      const win = await browser.windows?.getCurrent?.();
      info = (await browser.theme.getCurrent(win?.id)) ?? {};
    } catch (e) {
      console.warn('[theme] cannot read theme', e);
    }
    applyVars(root, chooseVars(info.colors, scheme ? scheme.matches : null));
  };
  browser.theme.onUpdated?.addListener(update);
  scheme?.addEventListener?.('change', update);
  await update();
}
