# Image Collector

Firefox extension that adds **Copy Image + Collect** to the image context menu. It copies the image to the
clipboard and records where it was found. A sidebar lists everything collected. See `PLAN.md` for the spec.

## Run during development

There are two documented ways. Both install the extension temporarily: it is removed when Firefox closes.

**Option A: `web-ext run`** (`npm start`). Launches a *separate* Firefox instance with a fresh, throwaway
profile, installs the extension and reloads it when files change. Your normal Firefox profile, bookmarks and
extensions are not used, and anything you collect is lost when that window closes. Run it from a regular
Terminal window, not from inside a sandboxed tool.

```sh
npm install
npm start
```

**Option B: `about:debugging`** in your everyday Firefox.

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…** and pick `manifest.json` in this folder.
3. After editing code, click **Reload** on the add-on's card. Click **Inspect** for the background console.

The add-on stays until you remove it or restart Firefox. Collected data in `storage.local` survives removal.

**Permissions during testing.** Temporary installs grant install-time permissions silently, so "access to
all sites" starts out granted. To test without it, revoke it under about:addons → Image Collector →
Permissions. To use the menu in private windows, enable **Run in Private Windows** on the same page.

## Checks

```sh
npm test            # unit tests (node:test)
npm run lint        # web-ext lint
```

## Manual test fixtures

```sh
python3 test/make-fixtures.py --huge   # regenerate images (huge.* are git-ignored)
npm run fixtures                       # serves test/fixtures on port 8000
```

Open `http://localhost:8000/`. Images loaded from `127.0.0.1:8000` count as cross-origin.
