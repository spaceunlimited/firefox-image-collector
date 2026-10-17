# Image Collector

Firefox extension that adds **Copy Image + Collect** to the image context menu. It copies the image to the
clipboard and records where it was found. A sidebar lists everything collected. See `PLAN.md` for the spec.

## Install

1. Download the latest `image-collector-x.y.z.xpi` from
   [Releases](https://github.com/spaceunlimited/firefox-image-collector/releases).
2. Open the file in Firefox (or drag it onto a Firefox window) and confirm **Add**.
3. Optional: about:addons → Image Collector → **Permissions** → allow access to all websites, so images from
   sites that block other origins can be copied.

The add-on is signed by Mozilla for self-distribution and updates itself: Firefox checks
[`updates.json`](updates.json) in this repository. Requires Firefox 142 or later.

## Release a new version

One-time setup: create API credentials at <https://addons.mozilla.org/developers/addon/api/key/>.

```sh
# 1. Bump "version" in manifest.json and package.json, commit.
# 2. Sign with Mozilla (unlisted = self-distribution). Keys stay in your shell, never in the repo.
WEB_EXT_API_KEY=user:… WEB_EXT_API_SECRET=… npm run sign
# 3. Add the version to updates.json, push, and create the GitHub release with the signed .xpi.
npm run release            # npm run release -- --dry-run shows what it would do
```

## Run during development

There are two documented ways. Both install the extension temporarily: it is removed when Firefox closes.

**Option A: `web-ext run`** (`npm start`). Launches a *separate* Firefox instance with a fresh, throwaway
profile, installs the extension and reloads it when files change. Your normal Firefox profile, bookmarks and
extensions are not used, and anything you collect is lost when that window closes. Optional: on some macOS
setups Firefox shows "Profile Missing" when started from Terminal with a separate profile, and then web-ext
fails with `ECONNREFUSED`. Use option B in that case.

```sh
npm install
npm start
```

**Option B: `about:debugging`** in your everyday Firefox. This is the default workflow for this project.

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and pick `manifest.json` in this folder.
3. After editing code, click **Reload** on the add-on's card. Click **Inspect** for the background console.

The add-on stays until you remove it or restart Firefox; after a restart, load it again. Collected data in
`storage.local` is kept across reloads and re-adds because the add-on ID in `manifest.json` stays the same.

**Permissions during testing.** Temporary installs grant install-time permissions silently, so "access to
all sites" starts out granted. To test without it, revoke it under about:addons → Image Collector →
Permissions. To use the menu in private windows, enable **Run in Private Windows** on the same page.

## Checks

```sh
npm test            # unit tests plus jsdom smoke tests of the sidebar and settings pages
npm run lint        # web-ext lint (self-hosted: allows update_url)
```

Manual test rounds are tracked in `TESTING.md`.

Visual check without Firefox: `npm run preview` renders the sidebar and settings pages in headless
Chromium with sample data (light, dark and a custom theme) into `test/preview/out/`. Set `CHROMIUM_PATH`
if Playwright's browser isn't installed.

## Where things are

- Right-click an image → **Copy Image + Collect**.
- Toolbar button: toggles the sidebar. Each card has a ⋯ menu: re-copy, open image, open source page,
  details, edit tags, delete (with Undo).
- Gear button in the sidebar: settings tab with site access, automatic cleanup, export (JSON, CSV),
  import (JSON), storage usage and delete everything.

## Manual test fixtures

```sh
python3 test/make-fixtures.py --huge   # regenerate images (huge.* are git-ignored)
npm run fixtures                       # serves test/fixtures on port 8000
```

Open `http://localhost:8000/`. Images loaded from `127.0.0.1:8000` count as cross-origin.
