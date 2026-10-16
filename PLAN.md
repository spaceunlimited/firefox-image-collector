# Image Collector — Firefox extension build plan

## Context

Firefox's native "Copy Image" leaves no trace of where an image came from. This extension adds its own
context menu item, **"Copy Image + Collect"**, that copies the image to the clipboard and records the
image URL, the page it was found on, the page title and a timestamp. A sidebar lets you browse, search,
tag and manage everything you collected. Extensions cannot intercept the native "Copy Image" command,
so we add a parallel item and do not attempt to hijack the built-in one.

Target: Firefox only, Manifest V3, WebExtensions API, vanilla JS ES modules, no bundler.
Project folder `/Users/gregorfinger/Documents/Private/Explorations/image-collector` is empty (greenfield).

---

## 1. Confirmed spec

**Capture**
- One top-level context menu item on images: "Copy Image + Collect". No keyboard shortcut, no "Log only".
- Copies to clipboard via `browser.clipboard.setImageData()`. PNG/JPEG bytes pass through; WebP, GIF, AVIF,
  SVG, BMP and anything else are converted to PNG via canvas.
- Feedback: toolbar badge flash + brief on-page toast.
- Copy failure (CORS, decode, unsupported): entry is still saved, marked "copy failed", warning toast.
  "Re-copy" in the sidebar doubles as retry.
- Each entry stores: image URL(s), pixel dimensions, a ~200px thumbnail (data URL), tags, and a
  **capture history** (page URL, page title, frame URL, timestamp, copied yes/no).
- **One entry per image file.** Identity = normalized image URL, plus SHA-256 of the bytes when available,
  so identical files served from different URLs merge into one entry with several known URLs.

**Sidebar**
- Grid (default) / list toggle. Newest first, grouped by day (Today, Yesterday, weekday names for the last
  week, then "12 Oct 2026" style).
- Card shows: thumbnail, pixel dimensions ("1200 × 800"), relative time ("2h ago", absolute on hover),
  a small badge if captured more than once, a warning glyph if the last copy failed.
- Click thumbnail → open most recent source page in a new tab.
- Kebab menu: Re-copy image · Open image · Open source page · Details · Edit tags · Delete.
- Delete is instant with a 6-second undo toast, no confirmation dialog.
- Search as you type over image URL, domain, page title, tags. Filters: tags (AND when several selected),
  date range (Today / 7 days / 30 days / All / custom).
- Export JSON (full backup incl. thumbnails) and CSV (one row per capture). Import JSON (merge).
- Empty state: one line, "Right-click any image and choose Copy Image + Collect."
- Multi-select / bulk actions → v1.1.

**Settings & data**
- No entry cap. Optional "auto-delete entries older than N days", off by default.
- Private windows: image is still copied, nothing is stored; toast says so.
- Follows Firefox light/dark theme. Local storage only, no sync.
- Toolbar button toggles the sidebar. Sidebar opens once after install (`open_at_install: true`).

---

## 2. Architecture and file layout

```
image-collector/
├── manifest.json
├── package.json                 # devDependency: web-ext (run / lint / build scripts)
├── icons/                       # icon-16/32/48/128.png (+ badge uses action icon)
├── background/
│   ├── background.js            # event-page entry: menu creation, onClicked, badge, message router,
│   │                            #   capture queue, auto-delete job on startup
│   ├── capture.js               # capture pipeline orchestration (probe ∥ fetch → convert → copy → thumb → store)
│   ├── image.js                 # sniffMime, decode (createImageBitmap / <img> fallback), toPng,
│   │                            #   makeThumbnail (WebP ≤200px), sha256
│   └── feedback.js              # badge flash, toast injection
├── content/
│   └── probe.js                 # functions injected on demand via scripting.executeScript:
│                                #   probeImage(targetElementId) → metadata; drawImage(targetElementId) → PNG dataURL;
│                                #   showToast(text, variant) → shadow-DOM toast
├── shared/
│   ├── store.js                 # storage.local schema, recordCapture, remove/restore, index maintenance,
│   │                            #   quota fallback, migrations, orphan self-heal
│   ├── url.js                   # normalizeUrl, domainOf, kindOf (http/data/blob), truncateDataUrl
│   ├── format.js                # relativeTime (Intl.RelativeTimeFormat), dayGroupLabel, dims, bytes
│   └── export.js                # buildJson, buildCsv, parseAndMergeJson
├── sidebar/
│   ├── sidebar.html
│   ├── sidebar.css              # CSS custom props, prefers-color-scheme, grid/list layouts
│   ├── sidebar.js               # boot, state, storage.onChanged live updates
│   ├── view.js                  # toolbar, day groups, cards, kebab, details panel, tag editor (templates + delegation)
│   └── thumbs.js                # IntersectionObserver lazy-load of thumb:<id> in batches
├── options/
│   ├── options.html
│   ├── options.js               # host-permission status + grant button, auto-delete, export/import,
│   │                            #   storage usage, clear all (with confirm)
│   └── options.css
└── test/
    └── fixtures/                # local HTML pages for manual testing (see §8)
```

**Responsibility split**
- `background/*` owns everything that needs privileged APIs at capture time: menus, clipboard, scripting,
  fetch with host permissions. It is the only writer of new captures.
- `shared/store.js` is the single storage abstraction used by background, sidebar and options.
- Sidebar and options are plain extension pages; they talk to the background only for actions that need
  the clipboard or fetch (`recopy`), and otherwise read/write storage directly through `store.js`.
- `content/probe.js` contains self-contained functions passed as `func` to `scripting.executeScript`;
  no persistent content script, no `content_scripts` manifest key.

**manifest.json (shape)**

```json
{
  "manifest_version": 3,
  "name": "Image Collector",
  "version": "0.1.0",
  "description": "Copy an image and remember where you found it.",
  "browser_specific_settings": {
    "gecko": { "id": "image-collector@gregorfinger.example", "strict_min_version": "128.0" }
  },
  "permissions": ["menus", "clipboardWrite", "storage", "unlimitedStorage", "scripting", "activeTab"],
  "host_permissions": ["<all_urls>"],
  "background": { "scripts": ["background/background.js"], "type": "module" },
  "action": { "default_title": "Image Collector", "default_icon": { "16": "icons/icon-16.png", "32": "icons/icon-32.png" } },
  "sidebar_action": {
    "default_title": "Image Collector",
    "default_panel": "sidebar/sidebar.html",
    "default_icon": "icons/icon-32.png",
    "open_at_install": true
  },
  "options_ui": { "page": "options/options.html", "open_in_tab": false },
  "icons": { "48": "icons/icon-48.png", "128": "icons/icon-128.png" }
}
```

Notes (verified on MDN):
- Firefox MV3 has **no service worker background**; `background.scripts` runs as an **event page** that
  unloads after idle. All listeners must be registered synchronously at top level. Menus created in
  `runtime.onInstalled` persist across unloads and restarts.
- `host_permissions` are **optional in Firefox MV3** (shown in the install prompt from Firefox 127, but the
  user can decline or revoke; temporary installs grant them silently). The extension must work
  degraded without them and offer a grant button (`permissions.request({ origins: ["<all_urls>"] })`,
  needs a user gesture → options page / sidebar banner).
- `browser_style` is not supported in MV3 ≥ Firefox 118; do not set it.

---

## 3. Data model

### storage.local keys

| Key               | Value                                                        | Notes |
|-------------------|--------------------------------------------------------------|-------|
| `meta`            | `{ schemaVersion: 1 }`                                       | migrations keyed on this |
| `settings`        | `{ autoDeleteDays: null, view: "grid", toast: true, badge: true }` | |
| `index`           | `{ ids: [{ id, last }], urls: { [normUrl]: id }, hashes: { [sha]: id } }` | `ids` sorted by `last` desc; ~200 B per entry |
| `entry:<id>`      | `Entry` (below)                                              | metadata only, no image data |
| `thumb:<id>`      | `"data:image/webp;base64,…"`                                 | ≤ 200px longest side, q≈0.8, ~8–20 KB |
| `full:<id>`       | `"data:image/png;base64,…"`                                  | only for `data:`/`blob:` sources ≤ 2 MB, so re-copy works |

Why separate keys: Firefox `storage.local` has no prefix queries, but `get([...keys])` is cheap. The
sidebar loads `index` → all `entry:` keys in one call (~0.5–2 KB each), and loads `thumb:` keys lazily
for visible cards only. Writing a capture touches `entry`, `thumb`, `index` in **one `set()` call** so a
crash cannot leave the index pointing at a missing entry (orphan entries are swept on sidebar load).

### Entry

```ts
type Entry = {
  id: string;                       // 16 hex chars, random
  hash: string | null;              // "sha256:<64hex>" of original bytes; null if never obtained
  urls: string[];                   // normalized image URLs known for this file, first seen first
  kind: "http" | "data" | "blob";   // for data:/blob: the "url" stored is a short label, bytes live in full:<id>
  mime: string | null;              // sniffed original type, e.g. "image/webp"
  width: number | null;             // natural pixel dimensions (from decoded bitmap, else from <img>)
  height: number | null;
  bytes: number | null;             // original byte length when fetched
  tags: string[];                   // lowercase, trimmed, unique
  firstCapturedAt: number;          // epoch ms
  lastCapturedAt: number;
  captures: Capture[];              // oldest → newest; trimmed to the newest 200
  copyCount: number;                // successful copies incl. re-copies
  lastCopy: { status: "ok" | "failed"; reason?: CopyFailReason; at: number };
  hasThumb: boolean;
  hasFull: boolean;
};

type Capture = {
  at: number;
  imageUrl: string;                 // the URL used for this capture (may differ per capture, e.g. srcset)
  pageUrl: string;
  pageTitle: string;                // trimmed to 300 chars
  frameUrl?: string;                // present when captured inside an iframe
  copied: boolean;
};

type CopyFailReason = "cors" | "decode" | "unsupported" | "toolarge" | "clipboard" | "nobytes";
```

### Identity / grouping algorithm (in `store.recordCapture`)

1. `norm = normalizeUrl(imageUrl)` — strip `#fragment`, keep query (CDN params select the file).
   For `data:`/`blob:` URLs there is no meaningful URL; skip this step.
2. `index.urls[norm]` → existing entry? append capture, update `last*`, done.
3. Else if bytes were obtained: `sha = sha256(bytes)`; `index.hashes[sha]` → existing entry? append
   capture, add `norm` to `entry.urls` and `index.urls`, done.
4. Else create a new entry; register `norm` and `sha` (if any) in the index.
5. Captures are serialized through a promise queue in the background so two rapid clicks cannot race.

### Size budget

| Item | Typical | 1 000 entries | 5 000 entries |
|------|---------|---------------|---------------|
| entry metadata | 0.5–2 KB | ~1.5 MB | ~7 MB |
| thumbnail (WebP 200px) | 8–20 KB | ~15 MB | ~75 MB |
| index | ~200 B/entry | ~0.2 MB | ~1 MB |

Firefox applies IndexedDB quotas to `storage.local`; `unlimitedStorage` lifts the per-origin cap and
prevents eviction. On a quota error, `store` retries the write **without** `thumb`/`full`, then surfaces a
persistent sidebar warning. Storage usage shown in options via `storage.local.getBytesInUse(null)` with a
JSON-length estimate as fallback if the call is unsupported.

---

## 4. Interaction flows

### 4.1 Capture (happy path)

1. User right-clicks an `<img>`, picks "Copy Image + Collect". Firefox fires `menus.onClicked(info, tab)`
   and grants **activeTab** for that tab (verified: context-menu clicks grant activeTab). Event page wakes.
2. Background guards `info.mediaType === "image" && info.srcUrl`, enqueues the capture.
3. In parallel:
   - **Probe** (needs activeTab, works for top frame + same-origin frames):
     ```js
     const [{ result: meta }] = await browser.scripting.executeScript({
       target: { tabId: tab.id, frameIds: [info.frameId ?? 0] },
       func: probeImage, args: [info.targetElementId],
     });
     // probeImage runs in the page:
     function probeImage(targetId) {
       const el = browser.menus.getTargetElement(targetId);
       const img = el?.closest?.("img") ?? el;
       if (!(img instanceof HTMLImageElement)) return null;
       return {
         currentSrc: img.currentSrc, naturalWidth: img.naturalWidth, naturalHeight: img.naturalHeight,
         clientWidth: img.clientWidth, clientHeight: img.clientHeight, dpr: devicePixelRatio,
         lazySrc: img.dataset.src || img.dataset.lazySrc || null, lazySrcset: img.dataset.srcset || null,
       };
     }
     ```
     `targetElementId` is only valid until the next context menu opens, so this runs immediately.
   - **Fetch** in the background (`fetch(url, { credentials: "include" })`). Succeeds for same-origin
     images, CORS-enabled hosts, `data:` URLs, and for everything when `<all_urls>` is granted.
4. Choose the effective URL: `meta.currentSrc` if present and not a placeholder, else `info.srcUrl`.
   If the effective URL differs from what was fetched, fetch again.
5. If fetch failed or returned no readable body → **fallback**: inject `drawImage(targetElementId)` which
   draws the element to a canvas and returns a PNG data URL, or `{ error: "tainted" }` for cross-origin
   images without CORS headers.
6. With bytes: `mime = sniffMime(bytes, contentType)`; `{ data, type } = await toClipboardImage(bytes, mime)`:
   ```js
   async function toClipboardImage(bytes, mime, hint) {
     if (mime === "image/png")  return { data: bytes, type: "png" };
     if (mime === "image/jpeg") return { data: bytes, type: "jpeg" };
     const bitmap = await decode(bytes, mime, hint);         // createImageBitmap; <img> fallback for SVG
     const { width, height } = fitBudget(bitmap, 40_000_000); // downscale above ~40 MP
     const canvas = new OffscreenCanvas(width, height);
     canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
     const blob = await canvas.convertToBlob({ type: "image/png" });
     return { data: await blob.arrayBuffer(), type: "png" };
   }
   await browser.clipboard.setImageData(data, type);         // "png" | "jpeg" only; Firefox re-encodes
   ```
7. Thumbnail: `createImageBitmap(blob, { resizeWidth/Height })` → OffscreenCanvas → WebP q0.8 → data URL.
   Dimensions from the bitmap; fallback to `meta.naturalWidth/Height`. Hash: `crypto.subtle.digest("SHA-256", bytes)`.
8. Unless `tab.incognito`: `store.recordCapture({ imageUrl, pageUrl: info.pageUrl ?? tab.url,
   pageTitle: tab.title, frameUrl: info.frameUrl, copied, reason, bytes-derived fields, thumb, full })`.
9. Feedback: `action.setBadgeText({ text: "✓", tabId })` + green background, cleared after 1.5 s;
   `scripting.executeScript({ target: { tabId }, func: showToast, args: ["Copied & collected", "ok"] })`.
   The toast is a shadow-DOM host, idempotent (re-uses an existing host), auto-dismisses after 2 s.
10. Sidebar, if open, picks up the change via `storage.onChanged` and inserts/updates the card.

### 4.2 Failed capture

- Steps 1–5 as above; copy fails at 5 (tainted), 6 (decode/convert) or at `setImageData` (clipboard).
- Entry is still recorded with `copied: false`, `lastCopy = { status: "failed", reason }`.
  Without bytes: no thumbnail, no hash, dimensions from the probe if available.
- Badge "!" in orange for 1.5 s. Toast variant "warn": "Saved, but couldn't copy the image."
  When `reason === "cors"` and `<all_urls>` is not granted, the toast adds
  "Allow site access in Image Collector settings to fix this."
- Sidebar: card shows a warning glyph; details show the reason in words. A dismissible banner at the top of
  the sidebar appears when ≥1 cors-failed entry exists and host permission is missing, with a
  "Allow access to all sites" button (user gesture → `permissions.request`).
- Private window: copy proceeds; nothing stored; toast "Copied (not collected in private window)".

### 4.3 Re-copy from the sidebar

1. Kebab → "Re-copy image" → `runtime.sendMessage({ type: "recopy", id })`.
2. Background loads the entry. `kind: "http"` → fetch `urls[0]`, then the others on failure
   (needs `<all_urls>` or a CORS-enabled host; there is no page to fall back to). `kind: data/blob` → use
   `full:<id>` if present. Nothing available → fail with "Original not reachable".
3. Convert + `setImageData` as in 4.1 step 6. On success: `copyCount++`, `lastCopy = ok` (no new capture:
   the history is about where the image was *found*). On failure: `lastCopy = failed`.
4. Sidebar shows a local toast "Copied" / "Couldn't copy: original not reachable".

### 4.4 Delete with undo

1. Kebab → Delete. The card animates out immediately (optimistic).
2. Sidebar calls `store.remove(id)` which returns the removed `{ entry, thumb, full }` and deletes the
   three keys and the index references in one `set` + `remove`.
3. Sidebar keeps the returned bundle in memory and shows a toast "Deleted · Undo" for 6 s.
4. Undo → `store.restore(bundle)` re-writes the keys and index references; the card re-appears in place.
5. Toast expires → bundle is dropped. (If the sidebar closes earlier, the undo is simply gone; the delete is
   already durable. This is deliberate: no soft-delete flag to filter everywhere.)

### 4.5 Export / import

- Toolbar "⋯" menu → Export JSON / Export CSV. Built in the sidebar (`shared/export.js`), downloaded via
  `URL.createObjectURL(blob)` + a temporary `<a download>` click. If Firefox refuses anchor downloads from
  the sidebar document in testing, switch to `downloads.download({ saveAs: true })` (adds `downloads` permission).
- **JSON**: `{ format: "image-collector", version: 1, exportedAt, entries: [ { ...entry, thumb, full? } ] }`.
- **CSV** (one row per capture, RFC 4180 quoting):
  `imageUrl,width,height,capturedAt(ISO),pageUrl,pageTitle,frameUrl,tags(;-joined),copied`.
- **Import JSON** (options page, file input): validate `format`/`version`; for each entry match by `hash`,
  then by any URL; merge = union of captures (dedupe on `at + pageUrl`), union of tags, keep larger dims,
  take thumb/full if missing. Report "Imported N new, merged M, skipped K invalid".

### 4.6 Tags

- Kebab → "Edit tags" or the tag row in Details → inline chip editor with autocomplete from all existing
  tags (derived from loaded entries, cached in sidebar state). Enter/comma adds, Backspace removes.
- Tag filter chips in the toolbar (top 12 by frequency + "more…" popover). Multiple selected → AND.
- Tags are included in search. Renaming/merging tags → v1.1.

---

## 5. Edge cases

| Case | Behaviour |
|------|-----------|
| **CORS-blocked image, no host permission** | Background fetch rejects → canvas fallback; cross-origin taint → `copy failed / cors`, URL + probe dimensions logged; banner offers `<all_urls>` grant; "Re-copy" retries after grant. |
| **CORS-blocked image, host permission granted** | Background fetch bypasses CORS; full pipeline works. |
| **Unsupported / corrupt format** (JXL, broken file) | `createImageBitmap` rejects → `failed / decode`; entry logged URL-only; thumb absent. |
| **WebP / AVIF / BMP / ICO** | Decode → PNG conversion (clipboard accepts only png/jpeg). |
| **Animated GIF / WebP / AVIF** | First frame only (clipboard limitation). Original mime stored so the details view can say "animated source, first frame copied" (detection of animation itself → v1.1). |
| **SVG** | `createImageBitmap` does not accept SVG in Firefox → event page has a DOM: `new Image()` + blob URL + `await img.decode()` → canvas. Size: intrinsic size, else rendered size × DPR from the probe, else 1024 px wide keeping the viewBox aspect. External resources in the SVG do not load (expected). |
| **Very large images** | Fetch cap 50 MB (above: URL-only, `failed / toolarge`). Conversion pixel budget ~40 MP: larger non-PNG/JPEG sources are downscaled for the clipboard and the toast says "copied at reduced size". PNG/JPEG pass through untouched; if Firefox's re-encode fails → `failed / toolarge`. Thumbnail always made with `createImageBitmap` resize options to avoid a full-size canvas. |
| **`data:` URLs** | `fetch(dataUrl)` works in the background; no probe needed. `urls` stores a label `data:image/png (34 KB)`; grouping by hash only; `full:<id>` stored if ≤ 2 MB so re-copy works; "Open image" opens the stored copy in a tab. |
| **`blob:` URLs** | Background cannot resolve page blob URLs. Probe path only: `fetch(blobUrl)` inside the page (same document) then canvas draw (blob is same-origin, not tainted). `full:<id>` stored if ≤ 2 MB. "Open image" disabled when no stored copy. |
| **Image inside same-origin iframe** | `info.frameId/frameUrl` present; activeTab covers same-origin frames → probe + fallback work. `frameUrl` saved on the capture. Toast always injected into frame 0. |
| **Image inside cross-origin iframe** | Probe injection needs host permission (activeTab excludes cross-origin frames in MV3). Without it: no probe, background fetch of `info.srcUrl` still attempted; on failure → URL-only entry. |
| **Lazy-loaded images** | Prefer `currentSrc` from the probe. If `naturalWidth ≤ 1` or `currentSrc` is a tiny `data:` placeholder and `data-src` / `data-srcset` exist, use `data-src` or the largest `data-srcset` candidate instead, and store that URL. |
| **`srcset` / `<picture>`** | `currentSrc` reflects the chosen candidate; MDN does not specify what `info.srcUrl` holds for `srcset`, so the probe value wins (verify in spike). Different resolutions have different bytes → separate entries, by design. |
| **CSS background images, `<canvas>`, `<video>` posters** | Not an "image" menu context → the item does not appear. Documented limitation. |
| **Storage quota error** | Catch on `set` → retry without `thumb`/`full` → if still failing, keep the capture in memory, badge "!" and toast "Storage full, not saved"; options page shows usage. Index/entry mismatch on load → self-heal (drop dangling ids, re-index orphan entries). |
| **Event page unloaded** | Listeners are top-level; the whole capture is one awaited chain, which keeps the page alive. `targetElementId` is used within milliseconds. |
| **Two captures in quick succession** | Promise queue in the background serializes `recordCapture` so identity lookups never race. |
| **Extension reload during dev** | `menus.removeAll()` before `menus.create` in `onInstalled` avoids duplicate-id errors. |
| **Private window** | Extension must be allowed in private windows (about:addons) or the menu never appears there. If `tab.incognito`: copy only, no storage, explicit toast. |
| **Page title / URL access** | `tab.title` and `tab.url` are readable thanks to activeTab at click time; `info.pageUrl` is used first. Title trimmed to 300 chars. |
| **Auto-delete** | Runs at `runtime.onStartup`, after each capture, and on sidebar open; deletes entries whose `lastCapturedAt` is older than N days (no `alarms` permission needed). |

---

## 6. Permissions

| Permission | Why |
|-----------|-----|
| `menus` | Create the "Copy Image + Collect" item on images and receive `onClicked`; also enables `menus.getTargetElement` in injected code. |
| `clipboardWrite` | Required by `browser.clipboard.setImageData()`. |
| `storage` | `storage.local` for entries, thumbnails, index and settings. |
| `unlimitedStorage` | Thumbnails can exceed the default IndexedDB quota; also marks storage persistent so it is not evicted. |
| `scripting` | Inject the probe, the canvas fallback and the toast into the clicked tab on demand (no persistent content script). |
| `activeTab` | Granted by the menu click itself; allows the injections above and reading the tab's URL/title without broad host permissions. |
| `host_permissions: <all_urls>` *(optional at runtime)* | Fetch original image bytes from any image host (CDNs) without CORS, and reach images in cross-origin iframes. Extension works degraded without it; the options page / sidebar banner can request it. |

Deliberately **not** requested: `tabs` (activeTab suffices; `tabs.create` needs no permission),
`notifications`, `alarms`, `downloads` (only if anchor download fails in testing), `clipboardRead`.

---

## 7. Milestones

### v1 — minimum usable
Scope: manifest + icons; event page with menu, capture pipeline (probe ∥ fetch → convert → copy → thumb →
store), badge + toast, private-window skip, host-permission handling; `store.js` with schema v1;
sidebar (grid/list, day groups, cards, click→source, kebab actions, details panel with history, tag editor,
search, tag + date filters, delete with undo, empty state, light/dark); options (host permission status +
grant, auto-delete, export JSON/CSV, import JSON, storage usage, clear all with confirm).

Suggested build order (each step testable on its own):
1. Scaffold + manifest + menu item + badge flash (smoke test the event page).
2. Capture pipeline for PNG/JPEG with background fetch + `setImageData`; store entry; log in console.
3. Conversion (WebP/GIF/AVIF/SVG), thumbnail, hash, identity merge.
4. Probe + canvas fallback + toast + failed-copy marking + incognito skip.
5. Sidebar read-only grid/list with lazy thumbs, groups, search, filters.
6. Sidebar actions: kebab, details, tags, delete/undo, re-copy message.
7. Options page: permission grant, auto-delete, export/import, usage, clear all.

Acceptance criteria:
- Right-clicking a PNG, JPEG, WebP, GIF, AVIF and SVG on a page with `<all_urls>` granted copies a
  pasteable image (verified by pasting into Preview or Figma) and creates one card each in the sidebar.
- Capturing the same URL twice yields one card with two history rows; the same bytes under two URLs
  yield one card with two URLs listed in details.
- Without host permission, a cross-origin image on a non-CORS host produces a "copy failed" card with the
  correct URL and dimensions, and a working "Re-copy" once permission is granted.
- Capture in a private window copies but adds nothing to the sidebar.
- Toast appears on the page and disappears; badge flashes and clears.
- Sidebar: grid/list toggle persists; day groups correct around midnight; search narrows as you type;
  tag and date filters combine; thumbnail click opens the latest source page; delete → undo restores the
  card in place.
- Export JSON → clear all → import JSON restores every card, thumbnail and tag. CSV opens in Numbers/Excel
  with one row per capture.
- Sidebar and options render correctly in light and dark Firefox themes.
- No errors in the background console after 30 s idle followed by a new capture (event page wake-up).

### v1.1 — polish
- Multi-select (checkboxes, shift-click) with bulk delete (undo) and bulk export.
- "Copy image URL" action; keyboard navigation in the sidebar; virtualized rendering above ~2 000 entries.
- Orphan sweep and hash-collision merge (URL-only entry later matched by hash).
- Animated-source detection flag; "copied at reduced size" indicator in details.
- Storage tools: strip thumbnails older than N days; usage breakdown.
- Tag rename/merge; `_locales` for strings.
- Acceptance: bulk-delete 50 entries and undo restores all; 3 000 synthetic entries scroll smoothly.

### v2 — bigger bets
- Keyboard shortcut acting on the hovered image (requires a persistent content script to track hover).
- Quick-tag from the toast.
- Perceptual-hash near-duplicate grouping (same image at different resolutions).
- Optional metadata-only sync via `storage.sync` (no thumbnails; ~100 KB cap).
- Chrome port: service-worker background, `navigator.clipboard.write` from an offscreen document, `sidePanel`.

---

## 8. Testing plan

### Loading the extension
1. `about:debugging#/runtime/this-firefox` → "Load Temporary Add-on…" → pick `manifest.json`.
   Or, with `npm i -D web-ext`: `npx web-ext run --source-dir .` for auto-reload on file changes;
   `npx web-ext lint` before each milestone.
2. "Inspect" next to the add-on opens the background console; the sidebar document can be inspected from
   the same toolbox (frame picker) or via the Browser Toolbox.
3. Temporary installs (about:debugging and `web-ext run`) grant install-time permissions silently, so
   `<all_urls>` starts out granted. To test the "no site access" state, revoke it under about:addons →
   Image Collector → Permissions. To see the real install prompt, install the `.zip` via "Install Add-on
   From File" in Nightly or Developer Edition with `xpinstall.signatures.required` set to false.
4. Allow the extension in private windows (about:addons → Details → "Run in Private Windows") for the
   incognito test.

### Fixtures (`test/fixtures/`, served with `python3 -m http.server 8000`)
- `formats.html`: one `<img>` each of PNG, JPEG, WebP, GIF (animated), AVIF, SVG (with and without
  intrinsic size), BMP; a `data:` image; a `blob:` image created from a canvas at load.
- `responsive.html`: `srcset` + `sizes`, a `<picture>` with AVIF/WebP/JPEG sources, lazy-loaded images
  using `loading="lazy"` and a `data-src` pattern with a 1×1 placeholder.
- `frames.html`: a same-origin iframe and a cross-origin iframe (serve the second copy on
  `127.0.0.1:8001` vs `localhost:8000` to get two origins without CORS headers).
- `huge.html`: a 9 000 × 9 000 PNG and a 60 MB JPEG link (generated locally).

### Manual checklist
Capture
- [ ] Menu item appears on `<img>` only, not on links/text/video.
- [ ] PNG and JPEG: paste into Preview, Pages, Slack and Figma works; dimensions in the card match.
- [ ] WebP, GIF, AVIF, BMP convert and paste correctly; GIF pastes its first frame.
- [ ] SVG with intrinsic size pastes at that size; SVG without size pastes at rendered size.
- [ ] `data:` image: card shows label, re-copy works from stored copy.
- [ ] `blob:` image: capture works while the page is open; re-copy works from stored copy.
- [ ] `srcset` image: stored URL equals `currentSrc` at the current viewport width.
- [ ] Lazy image before and after scrolling into view: real URL stored, not the placeholder.
- [ ] Same-origin iframe image: capture + toast; cross-origin iframe image with and without `<all_urls>`.
- [ ] Cross-origin image on non-CORS host, no host permission: "copy failed" card, banner shown,
      grant → Re-copy succeeds, banner disappears.
- [ ] Huge PNG passes through or fails gracefully with `toolarge`; huge WebP copies downscaled.
- [ ] Private window: image copied, no card added, toast wording correct.
- [ ] Wait 60 s (event page unloads), capture again: works, no console errors.
- [ ] Restart Firefox: menu item still present; captures still listed.

Sidebar
- [ ] Empty state text on first open; sidebar opened automatically after install; toolbar button toggles it.
- [ ] Grid/list toggle, persists across reopen. Day groups: Today / Yesterday / weekday / date.
- [ ] Relative times update (e.g. "just now" → "2 min ago") without reload; absolute time on hover.
- [ ] Click thumbnail opens the most recent source page. Kebab: open image, open source page, details.
- [ ] Details: all captures listed newest first with page title, domain, time; all known URLs listed.
- [ ] Tags: add, autocomplete, remove; filter chips AND-combine; tags searchable.
- [ ] Search matches URL, domain, title, tag; clearing search restores the list.
- [ ] Date filter presets and custom range; combining with tags and search.
- [ ] Delete → card gone → Undo within 6 s restores it in the same group; after 6 s it stays deleted.
- [ ] Re-copy from a card: toast, paste works; failure message when the URL is dead.
- [ ] Live update: capture in a tab while the sidebar is open inserts the card without reload.
- [ ] Light/dark theme switch (about:addons → Themes) restyles sidebar and options instantly.

Options / data
- [ ] Permission status reflects reality; grant button prompts and updates status.
- [ ] Auto-delete 30 days removes an entry with a backdated `lastCapturedAt` on next startup.
- [ ] Export JSON and CSV download; CSV opens with one row per capture and correct quoting.
- [ ] Clear all (confirm) → import JSON → identical cards, thumbs and tags; import again → "0 new, N merged".
- [ ] Storage usage figure changes after capturing ~20 images.

### Spike items to verify early (unknowns from MDN)
1. What `info.srcUrl` contains for `srcset` images (vs `currentSrc`).
2. `createImageBitmap` behaviour with SVG and AVIF blobs in the event page; `<img>` fallback for SVG.
3. Anchor-download from the sidebar document (else `downloads` permission).
4. `storage.local.getBytesInUse(null)` support in current Firefox.
5. `fetch(blobUrl)` from an injected function vs canvas draw for `blob:` images.
6. Resolved: temporary installs grant `host_permissions` silently (Extension Workshop, test permission requests).
