# Image Collector

Firefox extension that adds **Copy Image + Collect** to the image context menu. It copies the image to the
clipboard and records where it was found. A sidebar lists everything collected. See `PLAN.md` for the spec.

## Develop

```sh
npm install
npm test            # unit tests (node:test)
npm run lint        # web-ext lint
npm start           # launches Firefox with the extension, reloads on file changes
```

Or load it manually: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → `manifest.json`.
Click **Inspect** next to the add-on for the background console.

## Manual test fixtures

```sh
python3 test/make-fixtures.py --huge   # regenerate images (huge.* are git-ignored)
npm run fixtures                       # serves test/fixtures on port 8000
```

Open `http://localhost:8000/`. Images loaded from `127.0.0.1:8000` count as cross-origin.
