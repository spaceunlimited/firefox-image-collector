# Manual test checklist: v1

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

## Round 9: grouping, sorting and tag search

- [ ] `about:debugging` → **Reload** on Image Collector

### Options popup (sliders button next to search)
- [ ] Opens below the button; Escape or a click outside closes it
- [ ] **Group by: Tag** shows one group per tag; images with two tags appear in both
- [ ] In "Tag groups", drag a tag to a new position: the groups follow. Alt+↑/↓ on a row does the same
- [ ] Untick a tag: its group disappears. Untick "Show images not in a group": the Untagged/Other group disappears
- [ ] **Group by: None** shows one list without headings
- [ ] **Oldest first** reverses the order, also inside each group
- [ ] Close and reopen the sidebar: grouping, sort and tag order are remembered

### Search
- [ ] No tag row under the search bar anymore
- [ ] Type the first letters of a tag: matching tags appear below the field; ↑/↓ and Enter, or a click, picks one
- [ ] The picked tag shows as a chip in the field and filters the images; a second tag narrows further
- [ ] Backspace in the empty field removes the last chip; × on a chip removes it too
- [ ] Plain text search (site name, page title) still works, with or without chips

## Round 8 results

The sidebar now follows Firefox's Nova design (rounded search, round buttons, violet accent) and knows
the dark colors of Mozilla's 11 Nova themes, including Ash.

- [ ] `about:debugging` → **Reload** on Image Collector

### Ash (your theme)
- [ ] macOS in dark mode: the sidebar is dark and matches Firefox's own sidebar colors, not white
- [ ] Switch macOS to light mode with the sidebar open: the sidebar turns light without reopening
- [ ] Buttons and links are violet and readable in both modes
- [ ] Shapes match Firefox: rounded search field, round toolbar buttons, rounded tiles and menus

### Other themes
- [ ] Try one more Nova theme (for example Lavender or Tide) in dark and light mode
- [ ] Try one non-Mozilla theme from addons.mozilla.org. If the sidebar looks off, note the theme's name here:

### Toast
- [ ] After a capture, the toast in the page uses the sidebar's colors and has rounded corners

### Report back
- [ ] A screenshot with Ash in dark mode, plus anything that still looks off

## Round 7 results (done)

The sidebar, menus, toast and settings were restyled to look like Firefox and follow the installed theme.
I checked them in headless Chromium; this round checks real Firefox.

- [ ] `about:debugging` → **Reload** on Image Collector (needed: new `theme` permission)

### Default themes
- [ - ] about:addons → Themes → **Light**: sidebar background, search field and menus look like Firefox's own | light but i am in dark mode and it absolutely doesn't look like my version of the default theme
- [ - ] Switch to **Dark** with the sidebar open: it follows without reopening | switched dark mode to light mode and back in the mac settings, no change in the site bar
- [  X] Toolbar is one row: search, calendar (date filter), view toggle, gear
- [ X] Calendar button opens a menu; picking "Last 7 days" shows a blue "Last 7 days ×" pill; the pill clears it
- [ X] Day headings fold and unfold when clicked
- [ ] List view: "3× collected" appears in the text, not over the thumbnail | i only see today

### An add-on theme
- [ X] Install any colorful theme from addons.mozilla.org (for example one with a purple or green sidebar) | i see minimal changes, yes some colors of icons and hovers change, but the background is always white and general design lanauge isn't used, for example roudned corner radius on search bar and icons
- [ X ] The sidebar, search field, ⋯ menus and the bottom notices take the theme's colors | somehwat yes
- [ X] The on-page toast after a capture uses the theme's popup colors | i don't see an open page toast, only a copy and collected. it's also not styled after the theme
- [ X] Switch back to the default theme: the sidebar returns to the Firefox colors | default actually changes dark and night mode, just not for example if i switch to the ASH theme.

### Settings page
- [X ] Looks like Firefox Settings (about:preferences), in light and dark

### Report back
- [ X] Screenshots of the sidebar in one default theme and one add-on theme, and anything that looks off

## Round 6 results (done)

First `about:debugging` → **Reload** on Image Collector.

### Tag suggestions (now chips instead of a dropdown)
- [ X] Give one image a tag. Open **Edit tags** on another image: existing tags show as "+ tag" chips under the field
- [ X] Typing filters the chips; clicking one adds that tag

### Settings (gear button)
- [ X] No confirmation box is visible until you click a button that needs one
- [X ] **Export JSON** first, as a backup
- [ X] **Delete all images…** shows a confirmation; **Delete all** empties the sidebar and the empty-state hint shows
- [X ] **Import** that JSON file: all cards come back with thumbnails and tags
- [X ] Import the same file again: "Added 0 images, merged N", no duplicates
- [ X] Automatic cleanup: choosing a period either says "Nothing to delete right now" or asks first how many it will delete
- [ X] Storage shows the number of images and space used

## Round 5 results (done)

New since round 4: a ⋯ menu on every card, a details view, tags, delete with Undo, re-copy, and a full
settings page. Any page works for these tests, including real websites.

**Before you start**
- [ X] `about:debugging` → **Reload** on Image Collector (needed: the manifest changed)
- [ X] Open the sidebar

### Card menu
- [X ] Hover a card: a ⋯ button appears top right (in list view it is always visible)
- [ X] Click ⋯: a menu opens with Re-copy image, Open image, Open source page, Details, Edit tags, Delete
- [ X] Arrow keys move through the menu; Escape closes it
- [ X] **Re-copy image** on a card from a real website: "Copied" at the bottom, and pasting works
- [ X] **Open image** opens the image itself in a new tab
- [ X] **Open source page** opens the page it was collected from

### Details
- [ X] **Details** opens a panel with a larger preview, size, format, file size, dates and copy count
- [ X] "Found on" lists every page the image was collected from, newest first
- [ X] Clicking a page title or image address opens it in a new tab
- [ X] On a card with the orange "!", details explain why the copy failed | Last attempt failed. The site blocks access to the image file.
- [ X] The ✕ button and Escape close the panel

### Tags
- [X ] **Edit tags** opens details with the cursor in the tag field
- [X ] Type a tag and press Enter: it appears as a chip. A comma also adds it
- [ -] Add the same tag to a second image: the field suggests it as you type | does not suggest but also doesn't recreate a duplicate
- [X ] Tag chips appear under the toolbar; clicking one filters the cards; two selected = both tags required
- [ X] × on a chip removes the tag; Backspace in an empty field removes the last tag
- [X ] Tags are found by search

### Delete with Undo
- [ X] **Delete** removes the card right away and shows "Image deleted · Undo"
- [X ] **Undo** within 6 seconds brings the card back with its tags
- [X] Without Undo, the card stays deleted after reopening the sidebar

### Settings (gear button in the sidebar, opens in a tab)
- [X ] Site access shows its status; turning it off and on works
- [ X] With site access off, capture an image from another site that fails to copy: an orange banner in the
  sidebar offers **Allow**. Allow turns access back on and the banner disappears | i can copy a page froom another site not sure what should be happening
- [X ] **Export JSON** downloads a file. **Export CSV** downloads a file that opens in Numbers or Excel 
- [X ] **Delete all images…** asks for confirmation, then empties the sidebar. The empty-state hint shows | there is soemthing weird, i can see the delete all button and the popup static underneight, the popup gets populated when i press the delete all button, the buttons in the pop up can not be clicked, no execution
- [ X] **Import** the JSON you just exported: all cards come back with thumbnails and tags
- [X ] Import the same file again: "Added 0 images, merged N", no duplicates
- [X ] Automatic cleanup: choosing a period shows how many images would be deleted before doing it
- [ X] Storage shows the number of images and space used

### Optional: why localhost images failed in round 4
- [ ] On `http://localhost:8000/responsive.html`, capture the pink box, then copy all lines starting with
  `[capture]` from the add-on's Inspect console here:

## Round 4 results (done)

Round 3 confirmed that wake-up after idle works. Private-window testing is dropped for now.

These four tests only work when the page comes from the test server. In round 3 the pages were still
local files: the console showed `file:///…` addresses.

**Before each test, look at the address bar.** It must start with `http://localhost:8000/`.
If it starts with `file:///`, or the page shows a red banner, click the link in the banner.

- [ ] Terminal: `npm run fixtures` is running (it prints "Serving HTTP on … port 8000")
- [ ] `about:debugging` → **Reload** on Image Collector

### T1. Lazy image: `http://localhost:8000/responsive.html`
- [ X] Right-click the pink box → **Copy Image + Collect**. Card shows pink "Lazy real image", 640 × 400 | does not show pink image, just orange label - toast: save+not copied

### T2. srcset: same page, first image
- [ X] Capture it. The newest card shows "srcset 640w" or "srcset 320w". Which one? this shows srcset 640w but thumbnail is broken, zoomed in

### T3. Frames: `http://localhost:8000/frames.html`
- [ X] Capture the image in the first box: copies, card has a thumbnail | no thumbnail, copy failed
- [ X] Capture the image in the second box: copies, and merges with the first into one card showing ×2 | does not merge, shows it's own 

### T4. Huge WebP: `http://localhost:8000/huge.html`, second (green) image
- [X ] Toast ends with "Copied (reduced size) & saved" | never says anything about reduced, also doesn't matter, lets move oin.
- [ ] Paste the `[capture] done` line: it should start with `imageUrl: "http://localhost:8000/`

## Round 3 results (done)

Round 2 ran on pages opened as local files (`file:///…`). Firefox gives extensions much less access
there, so several results were misleading. This round reruns those through the server.

**Before you start**
- [ X] In a terminal: `cd ~/Documents/Private/Explorations/image-collector && npm run fixtures`, leave it running
- [ X] In Firefox, type `http://localhost:8000/` into the address bar. Don't double-click the HTML files.
  If a page shows a red banner, it was opened as a file. | no red banner
- [ X] `about:debugging` → **Reload** on Image Collector, and open its **Inspect** console
- [ X] Ignore the cards from earlier rounds; deleting cards arrives in the next step

### S1. Lazy placeholder: `http://localhost:8000/responsive.html`, the pink box
- [X] Card shows a pink "Lazy real image", 640 × 400 | this page shows a red banner

### S2. srcset: same page, first image
- [ -] The **newest** card (top left under "Today") shows text "srcset 640w" or "srcset 320w". Which one? none

### S3. Frames: `http://localhost:8000/frames.html`
- [ -] First box image copies, with a thumbnail | no thumbnail
- [ X] Second box image copies
- [ -] Both merge into one card with ×2 | does not merge

### S4. Huge WebP: `http://localhost:8000/huge.html`, second image
- [ - ] Grey "Copying image…" toast, then "Copied at reduced size & collected" | no grey copying image, and success message is just copied and collected
- [ X] Paste the `[capture] done` line here: [capture] done 
Object { ms: 951, imageUrl: "file:///Users/gregorfinger/Documents/Private/Explorations/image-collector/test/fixtures/img/huge.webp", copied: true, reason: undefined, mime: "image/png", dims: (2) […], scaled: false }

### S5. Without site access (uses the new settings switch)
- [ X] Sidebar → gear button → **Turn off** under Site access. Status should say "Not allowed".
- [ ] Reload `frames.html`, capture the grey "Cross-origin" image. Expected: orange "!" on the card and a
  toast saying it was saved but not copied, with a hint about site access.
- [ X] Back in settings, **Allow access to all websites**. Firefox asks to confirm. Status says "Allowed". | give orange mssage, too long to read but saves image

### S6. Private window
THIS CAN NOT BE TESTED!!!!!!!!!!!!!!

- [ ] about:addons → Image Collector → set **Run in Private Windows** to Allow
- [ ] Open a private window (⌘⇧P), go to `http://localhost:8000/formats.html`, right-click an image.
  Is **Copy Image + Collect** in the menu?
- [ ] If yes, capture: toast "Copied (not collected in private windows)", and no new card

### S7. Wake-up after idle


"Stopped" on the about:debugging card after a few seconds is **expected**. Firefox pauses the
background to save memory, and the menu click should restart it. This test checks exactly that.

- [ ] Wait until the about:debugging card shows the background as stopped
- [ ] Don't click anything in about:debugging. Right-click an image on a localhost page → **Copy Image + Collect**
- [ ] Did you get a toast and a new card?
- [ ] Paste the console lines that appeared:

### S8. Thumbnail clicks
- [ ] Click a card captured from a localhost page: opens that page in a new tab
- [ ] Click a card captured from a local file in round 2: a message at the bottom of the sidebar
  explains Firefox doesn't allow it

## Round 2 results (done)

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
- [ X] Its card shows 8000 × 6000 and no orange "!"
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

- [ X] Leave Firefox alone for 2 minutes. On the about:debugging card, the background may show as stopped. | again, the extension automatically stopps running after a just a few seconds not being used.
- [ X] Without clicking anything in about:debugging, right-click an image → **Copy Image + Collect**.
- [ X] Does the menu item appear? Is there a toast? Does a card appear? | still seems to work but image gets an orange label
- [ ] Copy any console lines that appear here (expected: `[background] started`, then `[background] menu click`): [capture] done 
Object { ms: 16, imageUrl: "file:///Users/gregorfinger/Documents/Private/Explorations/image-collector/test/fixtures/img/photo.png", copied: false, reason: "cors", mime: undefined, dims: (2) […], scaled: undefined }

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
