// Renders the AMO listing icon: the extension glyph (dark-scheme white fill) on a
// violet tile matching the UI accent, with transparent rounded corners.
// AMO accepts only PNG/JPEG for the listing icon, and the raw icon.svg rasterizes
// near-black on transparent, which is invisible on AMO's dark theme.
// Usage: node tools/gen-listing-assets.mjs   (set CHROMIUM_PATH like for npm run preview)
// Output: references/amo/icon-{512,128,64,32}.png (references/ is git-ignored, never packaged)
import { chromium } from 'playwright-core';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const OUT = path.join(REPO, 'references/amo');
await mkdir(OUT, { recursive: true });

const svg = await readFile(path.join(REPO, 'icons/icon.svg'), 'utf8');
const pageFor = (size) => `<!doctype html><meta charset="utf-8"><style>
    html, body { margin: 0; background: transparent; }
    .tile { width: ${size}px; height: ${size}px; border-radius: ${Math.round(size * 0.2)}px;
            background: linear-gradient(145deg, #8a63e8, #6a41d4); display: grid; place-items: center; }
    svg { width: ${Math.round(size * 0.62)}px; height: ${Math.round(size * 0.62)}px; }
  </style><div class="tile">${svg}</div>`;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 600, height: 600 }, colorScheme: 'dark' });
const page = await ctx.newPage();
for (const size of [512, 128, 64, 32]) {
  await page.setContent(pageFor(size));
  await page.locator('.tile').screenshot({ path: path.join(OUT, `icon-${size}.png`), omitBackground: true });
  console.log(`icon-${size}.png`);
}
await browser.close();
console.log('written to', OUT);
