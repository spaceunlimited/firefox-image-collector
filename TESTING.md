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

## Round 2: retest these

First reload the add-on: `about:debugging` → **Reload** on the Image Collector card. Keep its **Inspect**
console open. Lines starting with `[background]` and `[capture]` are from the extension.

### R1. srcset image: `responsive.html`, first image

- [ X] Right-click the first image → **Copy Image + Collect**. Look at the new card's thumbnail in the
  sidebar. The image itself has text drawn on it, like "srcset 640w". Note the number here:
  Expected 640w on a Retina display, 320w otherwise. | PNG thumbnail is exactly whats written on the png : PNG 640x400

### R2. Lazy-load placeholder: `responsive.html`, third image (the empty pink box)

The page never loads this image. It only has a tiny invisible placeholder, and the real address is
hidden in the page markup. This is how many news and shop sites lazy-load images.

- [ X] Right-click inside the pink box → **Copy Image + Collect**.
  Expected: the card shows a pink image reading "Lazy real image", 640 × 400.
  Failed if the card is blank, says "No preview", or shows 1 × 1. | just shows the same error as broken link

### R3. Native lazy image: `responsive.html`, bottom of the page

- [X ] Scroll all the way down, right-click the last image → **Copy Image + Collect**.
  Expected: copies, and the card shows 1280 × 800. 

### R4. Frames: `frames.html`

The page has two framed boxes, each showing a blue "In iframe" image, and a grey "Cross-origin" image
at the bottom. Right-click each image directly and choose **Copy Image + Collect**.

- [ X] Image in the first box ("Same-origin iframe") copies and gives a toast | saved but couldnt' find... no thumbnail
- [ X] Image in the second box ("Cross-origin iframe") copies and gives a toast
- [ ] Both iframe images merge into **one** card with a ×2 badge (same file, two addresses) | the just copied images do not merge, i have the second one as thumbnail and the first one as broken thumbnail
- [X ] Grey "Cross-origin" image copies and gets its own card

### R5. Without site access (section 4 below, not yet done)

- [ ] about:addons → Image Collector → **Permissions** tab → turn off access to all websites.
  Reload `frames.html`, then capture the grey "Cross-origin" image. | don't see permissions
  Expected: an orange "!" on its card, and a toast saying it was saved but not copied.
- [ ] Turn site access back on.

### R6. Huge images: `huge.html`

Converting these takes a few seconds. A grey "Copying image…" toast should now appear while it works.

- [ X] Green 8000 × 6000 WebP (second image): final toast says "Copied at reduced size & collected" | only says copied and collected
- [ ] Its card shows 8000 × 6000 and no orange "!"
- [ X] Copy the `[capture] done` line for this image from the console here: [capture] done 
Object { ms: 887, imageUrl: "file:///Users/gregorfinger/Documents/Private/Explorations/image-collector/test/fixtures/img/huge.webp", copied: true, reason: undefined, mime: "image/png", dims: (2) […], scaled: false }
capture.js:183:11


### R7. Private window

Temporary add-ons may already be allowed in private windows.

- [ ] Open a private window (⌘⇧P) and go to `http://localhost:8000/formats.html`. | the plugin doesn't start in private mode, the context menu isn't there even though i deliberately went into the addon settings and started it.
- [ ] Does the right-click menu show **Copy Image + Collect**? If not, check about:addons →
  Image Collector → **Run in Private Windows** → Allow, and try again.
- [ ] Capture an image. Expected: toast "Copied (not collected in private windows)", no new card.

### R8. Wake-up after idle

Firefox unloads the extension's background when it is idle. That is normal: the menu click should
start it again on its own, without touching about:debugging.

- [ ] Leave Firefox alone for 2 minutes. On the about:debugging card, the background may show as stopped. | again, the extension automatically stopps running after a just a few seconds not being used.
- [ ] Without clicking anything in about:debugging, right-click an image → **Copy Image + Collect**.
- [ ] Does the menu item appear? Is there a toast? Does a card appear?
- [ ] Copy any console lines that appear here (expected: `[background] started`, then `[background] menu click`):

### R9. Thumbnail click on `formats.html` cards

- [ X] Click the thumbnail of the PNG card (the ×3 one). What happens? | nothing on local files, on online files it just opens the site i copied the image from
- [ ] Click the thumbnail of the data: or blob: card. What happens? | there is nothing else to click other that hte image

## Round 1 results (done)

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
