// Renders the extension pages in headless Chromium with a fake extension API, for visual review.
// Usage: npm run preview [-- <output dir>]   (default: test/preview/out)
// Set CHROMIUM_PATH to a Chromium or Chrome binary if Playwright's own browser isn't installed.
import { chromium } from 'playwright-core';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';

const REPO = path.resolve(new URL("../..", import.meta.url).pathname);
const OUT = path.resolve(process.argv[2] ?? path.join(REPO, "test/preview/out"));
await mkdir(OUT, { recursive: true });
const { installFakeBrowser } = await import(path.join(REPO, 'test/unit/fake-browser.js'));
const store = await import(path.join(REPO, 'shared/store.js'));

const fake = installFakeBrowser();
const img = async (name) => {
  const buf = await readFile(path.join(REPO, 'test/fixtures/img', name));
  const mime = name.endsWith('.png') ? 'image/png' : name.endsWith('.gif') ? 'image/gif' : name.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
};
const now = Date.now();
const H = 3_600_000, D = 24 * H;
const items = [
  ['photo.png', 'dribbble.com', 'Gradient shots', 640, 400, now - 5 * 60_000, ['moodboard']],
  ['photo.jpg', 'unsplash.com', 'Orange dusk – Photo by Ana', 640, 400, now - 40 * 60_000, []],
  ['photo.webp', 'figma.com', 'Community file: Icons', 640, 400, now - 2 * H, ['ui']],
  ['animated.gif', 'giphy.com', 'Loading animation', 320, 200, now - 3 * H, []],
  ['responsive-640.jpg', 'nytimes.com', 'The long read', 640, 400, now - D - 2 * H, ['moodboard', 'type']],
  ['picture.jpg', 'behance.net', 'Brand guidelines', 640, 400, now - D - 5 * H, []],
  ['lazy-real.jpg', 'pinterest.com', 'Pink interiors', 640, 400, now - 3 * D, ['moodboard']],
  [null, 'medium.com', 'Article header', 1200, 630, now - 3 * D - H, []],
  ['frame.png', 'are.na', 'Channel: references', 400, 250, now - 20 * D, ['ui']],
];
for (const [file, host, title, w, h, at, tags] of items) {
  const r = await store.recordCapture({
    at, kind: 'http', imageUrl: `https://cdn.${host}/${file ?? 'header.jpg'}`, pageUrl: `https://${host}/item`,
    pageTitle: title, copied: Boolean(file), reason: file ? undefined : 'cors', width: w, height: h,
    thumb: file ? await img(file) : null, mime: 'image/jpeg', bytes: 48_000,
  });
  if (tags.length) await store.updateEntry(r.entry.id, (e) => { e.tags = tags; });
  if (file === 'photo.png') {
    await store.recordCapture({ at: at + 60_000, kind: 'http', imageUrl: `https://cdn.${host}/${file}`, pageUrl: 'https://twitter.com/x', pageTitle: 'Post', copied: true });
    await store.recordCapture({ at: at + 120_000, kind: 'http', imageUrl: `https://cdn.${host}/${file}`, pageUrl: 'https://mastodon.social/y', pageTitle: 'Toot', copied: true });
  }
}
await store.setSettings({ view: 'grid' });
const seed = Object.fromEntries(fake.data);

function shim({ seed, theme, access }) {
  const data = new Map(Object.entries(seed));
  const listeners = [];
  const clone = (v) => (v === undefined ? v : structuredClone(v));
  const emit = (changes) => queueMicrotask(() => listeners.forEach((fn) => fn(changes, 'local')));
  window.browser = {
    storage: {
      local: {
        async get(keys) {
          const out = {};
          if (keys == null) for (const [k, v] of data) out[k] = clone(v);
          else for (const k of [].concat(keys)) if (data.has(k)) out[k] = clone(data.get(k));
          return out;
        },
        async set(items) { const c = {}; for (const [k, v] of Object.entries(items)) { data.set(k, clone(v)); c[k] = { newValue: v }; } emit(c); },
        async remove(keys) { const c = {}; for (const k of [].concat(keys)) { data.delete(k); c[k] = {}; } emit(c); },
        async getBytesInUse() { return 412_000; },
      },
      onChanged: { addListener: (fn) => listeners.push(fn) },
    },
    tabs: { create: async () => ({}), get: async () => ({ windowId: 1 }) },
    runtime: { sendMessage: async () => ({ ok: true }), openOptionsPage: async () => {}, getURL: (p) => `/${p}` },
    permissions: { contains: async () => access, request: async () => true, remove: async () => true, onAdded: { addListener() {} }, onRemoved: { addListener() {} } },
    theme: { getCurrent: async () => theme, onUpdated: { addListener() {} } },
    windows: { getCurrent: async () => ({ id: 1 }) },
  };
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const PURPLE = {
  colors: {
    sidebar: '#271d38', sidebar_text: '#ece4ff', sidebar_border: '#3d2f57', toolbar_field: '#3a2b54', toolbar_field_text: '#ffffff',
    toolbar_field_border_focus: '#c084fc', popup: '#33264b', popup_text: '#f4efff', popup_border: '#4c3b6b', popup_highlight: '#4a3870',
    tab_line: '#c084fc', button_background_hover: 'rgba(255,255,255,.10)', button_background_active: 'rgba(255,255,255,.18)', icons: '#d8c8ff',
  },
};

async function open(pagePath, { scheme = 'light', theme = {}, access = true, width = 360, height = 760 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: scheme });
  await ctx.route('http://ext.test/**', async (route) => {
    const rel = new URL(route.request().url()).pathname.replace(/^\//, '');
    const type = rel.endsWith('.js') ? 'text/javascript' : rel.endsWith('.css') ? 'text/css' : 'text/html';
    route.fulfill({ body: await readFile(path.join(REPO, rel)), contentType: type });
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERROR', pagePath, e.message));
  page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE', m.text()));
  await page.addInitScript(shim, { seed, theme, access });
  await page.goto(`http://ext.test/${pagePath}`);
  return { page, ctx };
}

const shots = [];
async function sidebarShot(name, opts, act) {
  const { page, ctx } = await open('sidebar/sidebar.html', opts);
  await page.waitForSelector('#list .card');
  await page.waitForTimeout(300);
  if (act) await act(page);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  shots.push(name);
  await ctx.close();
}

await sidebarShot('1-grid-light', {});
await sidebarShot('2-grid-dark', { scheme: 'dark' });
await sidebarShot('3-list-light', {}, (p) => p.click('#view-toggle'));
await sidebarShot('4-list-dark', { scheme: 'dark' }, (p) => p.click('#view-toggle'));
await sidebarShot('5-menu-light', {}, async (p) => { await p.hover('#list .card'); await p.click('#list .card .menu-btn'); });
await sidebarShot('6-details-light', {}, async (p) => { await p.hover('#list .card'); await p.click('#list .card .menu-btn'); await p.click('#card-menu [data-action=details]'); });
await sidebarShot('7-details-dark', { scheme: 'dark' }, async (p) => { await p.hover('#list .card'); await p.click('#list .card .menu-btn'); await p.click('#card-menu [data-action=tags]'); });
await sidebarShot('8-filter-menu-dark', { scheme: 'dark' }, async (p) => { await p.click('#filter-btn'); });
await sidebarShot('9-purple-theme-grid', { theme: PURPLE, scheme: 'dark' });
await sidebarShot('10-purple-theme-menu', { theme: PURPLE, scheme: 'dark' }, async (p) => { await p.hover('#list .card'); await p.click('#list .card .menu-btn'); });
await sidebarShot('11-no-access-banner', { access: false });
// Ash: getCurrent() returns its light colors even while Firefox shows the dark variant.
const ASH_LIGHT = { colors: { frame: [239, 237, 242], toolbar: [255, 255, 255, 0.4], toolbar_text: [18, 17, 20], sidebar: [255, 255, 255], sidebar_text: [18, 17, 20], toolbar_field: [255, 255, 255], toolbar_field_text: [18, 17, 20] } };
await sidebarShot('13-ash-in-dark-mode', { theme: ASH_LIGHT, scheme: 'dark' });
await sidebarShot('14-ash-in-light-mode', { theme: ASH_LIGHT, scheme: 'light' });

for (const scheme of ['light', 'dark']) {
  const { page, ctx } = await open('options/options.html', { scheme, width: 900, height: 1100 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/12-options-${scheme}.png`, fullPage: true });
  shots.push(`12-options-${scheme}`);
  await ctx.close();
}
await browser.close();
console.log('shots:', shots.join(', '));
