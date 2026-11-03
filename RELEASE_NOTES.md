## New: SVG capture

Firefox offers no "Copy Image" for SVGs that are embedded directly in a page. Image Collector now does:

- **Inline `<svg>` elements** get their own "Copy Image + Collect" menu item. With site access on, the item appears only when the right-click is actually on an SVG.
- **The clipboard receives the SVG source as text**, so it pastes into Figma, Sketch or a code editor as an editable vector instead of a bitmap.
- **Captures look like what you saw:** colors from page CSS (classes, `currentColor`) are baked in, sprite icons (`<use href="#…">`) and gradients defined elsewhere in the page travel with the capture, and CSS-sized SVGs get their rendered size written in.
- **`<object>` and `<embed>` SVG documents** are collected as their original file.
- **Re-copy** from the collection puts the SVG markup on the clipboard again — also for previously collected `.svg` image files.

## Improvements

- The collection opens in a full tab: use the ↗ button in the sidebar or right-click the toolbar button.
- Clicking an image opens its details instead of the source page (the page is one click further).
- "Newest first" sorts by the latest capture, so re-collecting an image moves it to the top; "Oldest first" keeps sorting by the first capture.
- The collection, settings and viewer tabs now show the extension icon as their favicon.
