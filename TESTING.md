# Manual test checklist: v1 steps 1–5

Covers capture, conversion, grouping, failures and the read-only sidebar.
Check items off by changing `[ ]` to `[x]`. Note failures under the item.

## Setup

- [ ] Load the extension: `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…** → `manifest.json`
- [ ] Start the fixture server in a terminal and leave it running:

  ```sh
  cd ~/Documents/Private/Explorations/image-collector
  npm run fixtures
  ```

- [ ] Open `http://localhost:8000/` (use `localhost`, not `127.0.0.1`)
- [ ] Open the sidebar with the toolbar button
- [ ] Open the add-on's **Inspect** console to watch for errors

## 1. Formats: `http://localhost:8000/formats.html`

- [X ] Every image copies; paste a few into Preview or Figma and they arrive intact
- [X ] Animated GIF pastes its first frame
- [X ] Sized SVG card shows 300 × 200
- [X ] Unsized SVG copies at a sensible size
- [X ] data: image gets a card
- [X ] blob: image gets a card
- [X ] Broken PNG either has no menu item, or produces a card marked failed | produces an error state: no preview
- [ X] PNG, its `#again` copy and the mirror copy end up as **one** card with a ×3 badge

## 2. Responsive and lazy: `http://localhost:8000/responsive.html`

The label drawn inside each image names the file that was collected.

- [ ] srcset image collects the 640w file on a Retina screen (320w otherwise) | not sure
- [X ] `<picture>` collects the AVIF, not the JPEG fallback
- [ ] Lazy placeholder collects "Lazy real image", not a 1×1 pixel | not sure what that menas
- [ ] Native `loading="lazy"` image at the bottom copies after scrolling to it | not sure waht it means or how to test

## 3. Frames and cross-origin, site access on (default): `http://localhost:8000/frames.html`

- [ ] Same-origin iframe image copies and gets a card | not sure how to test
- [ ] Cross-origin iframe image copies and gets a card  | not sure how to test
- [ ] Cross-origin image below the frames copies  | not sure how to test

## 4. Without site access

Revoke it first: about:addons → Image Collector → Permissions → turn off access to all sites. Reload `frames.html`.

- [ ] Cross-origin image gets a card with an orange "!" badge
- [ ] Toast says it was saved but couldn't be copied, and mentions allowing site access
- [ ] Cross-origin iframe image: note what happens
- [ ] Re-enable site access afterwards

## 5. Edge cases

- [ ] `http://localhost:8000/huge.html`: WebP toast says "Copied at reduced size" | i don't see a toast meny or that specfic label
- [ ] `huge.html`: PNG either copies or fails cleanly with a warning toast | i only see copied + collected
- [ ] Private window copies the image but adds no card (enable **Run in Private Windows** in about:addons first) | can't test
- [ ] Leave Firefox idle for about a minute, then capture again; it still works | doesn't work but because the temporary plugin turns off if not used. i can turn it on again and continue

## 6. Sidebar

- [ ] Empty state hint shows when nothing is collected yet (if you test before capturing) | can't test because it's full of stuff
- [ X] Grid/list toggle works
- [ X] View choice is remembered after closing and reopening the sidebar
- [X ] Cards are grouped under "Today"
- [ X] Cards show pixel size and relative time; hovering the time shows the exact date
- [X ] List view also shows domain and page title
- [ X] Search narrows as you type (try "localhost", "png", a page title)
- [X ] Date filter presets work; custom range shows the two date fields
- [ X] Clicking a thumbnail opens the source page in a new tab | works but not on the local host formats.html
- [ X] A new capture appears in the open sidebar without reopening it
- [ ] Looks right in a light theme | style needs a serious rework
- [ ] Looks right in a dark theme | style needs a serious rework

## Report back

- Numbers of failed items, with what you saw
- Any red errors from the Inspect console
- A screenshot of the sidebar
