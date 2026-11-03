// Event page entry point. All listeners are registered synchronously at top level
// so Firefox can wake this page for them after it has been unloaded.
import { flashBadge, toast } from './feedback.js';
import { captureFromMenu, captureSvgFromMenu, inject } from './capture.js';
import { probeSvgPresence } from '../content/probe.js';
import { recopy } from './recopy.js';
import { ensureSchema, getSettings, purgeOlderThan } from '../shared/store.js';
import { hasAllSites } from '../shared/permissions.js';
import { openCollectionTab } from '../shared/open-tab.js';

const MENU_ID = 'copy-and-collect';
const SVG_MENU_ID = 'copy-and-collect-svg';
const OPEN_TAB_ID = 'open-tab';
// Inline SVGs and <object>/<embed> SVG documents never produce the 'image' context,
// so the SVG item listens on these and is shown only when a probe finds an SVG.
const SVG_CONTEXTS = ['page', 'frame', 'link'];

console.log('[background] started', new Date().toLocaleTimeString());

// Applies the optional "delete entries older than N days" setting.
async function applyRetention() {
  const { autoDeleteDays } = await getSettings();
  if (autoDeleteDays) {
    const removed = await purgeOlderThan(autoDeleteDays);
    if (removed) console.log(`[retention] removed ${removed} old entries`);
  }
}

// Creates the menu items: the image context menu entry and "Open in a tab" on the toolbar button.
// Safe to call repeatedly: a duplicate id is reported and ignored.
function ensureMenu() {
  const done = () => {
    const err = browser.runtime.lastError;
    if (err && !/already exists/i.test(err.message)) console.warn('[background] menu create failed', err.message);
  };
  browser.menus.create({ id: MENU_ID, title: 'Copy Image + Collect', contexts: ['image'] }, done);
  browser.menus.create({ id: SVG_MENU_ID, title: 'Copy Image + Collect', contexts: SVG_CONTEXTS, visible: false }, done);
  browser.menus.create({ id: OPEN_TAB_ID, title: 'Open in a Tab', contexts: ['action'] }, done);
  // Menus persist across event-page unloads; never leave a stale "visible" behind.
  browser.menus.update(SVG_MENU_ID, { visible: false }).catch(() => {});
}

// Decides per menu whether the SVG item appears. With site access a quick probe checks
// the actual target; without it the page cannot be probed before the click (activeTab
// is granted only then), so the item shows on page/frame menus and the click checks.
let menuTicket = 0;
async function updateSvgMenu(info, tab) {
  const ticket = ++menuTicket;
  const applicable = SVG_CONTEXTS.some((c) => info.contexts?.includes(c)) && !info.contexts.includes('image');
  let visible = false;
  if (applicable && tab?.id != null && tab.id >= 0) {
    if (await hasAllSites()) {
      visible = Boolean(await inject(tab.id, info.frameId ?? 0, probeSvgPresence, [info.targetElementId ?? null]));
    } else {
      visible = info.contexts.includes('page') || info.contexts.includes('frame');
    }
  }
  if (ticket !== menuTicket) return; // another menu opened or this one closed meanwhile
  await browser.menus.update(SVG_MENU_ID, { visible });
  if (ticket !== menuTicket) return;
  browser.menus.refresh();
}

browser.menus.onShown.addListener((info, tab) => {
  updateSvgMenu(info, tab).catch((e) => console.warn('[background] svg menu update failed', e));
});

browser.menus.onHidden.addListener(() => {
  menuTicket += 1;
  browser.menus.update(SVG_MENU_ID, { visible: false }).catch(() => {});
});

browser.runtime.onInstalled.addListener(async () => {
  await ensureSchema();
  await browser.menus.removeAll();
  ensureMenu();
});

// Event-page menus normally persist, but recreating them on every start also covers
// restarts that skip onInstalled (permission changes such as private-window access).
ensureMenu();

browser.menus.onClicked.addListener((info, tab) => {
  console.log('[background] menu click', info.menuItemId, info.srcUrl?.slice(0, 120));
  if (info.menuItemId === OPEN_TAB_ID) {
    openCollectionTab().catch((e) => console.error('[background] cannot open tab', e));
    return;
  }
  if (!tab) return;
  let capturing = null;
  if (info.menuItemId === MENU_ID && info.mediaType === 'image' && info.srcUrl) {
    capturing = captureFromMenu(info, tab);
  } else if (info.menuItemId === SVG_MENU_ID) {
    capturing = captureSvgFromMenu(info, tab);
  }
  capturing
    ?.then(() => applyRetention().catch((e) => console.warn('[retention] failed', e)))
    .catch((e) => {
      console.error('[capture] failed', e);
      flashBadge(tab.id, 'warn');
      toast(tab.id, 'Something went wrong. See the add-on console.', 'warn');
    });
});

// Requests from the sidebar for work that needs the clipboard or privileged fetches.
browser.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'recopy') {
    return recopy(msg.id).catch((e) => {
      console.error('[recopy] failed', e);
      return { ok: false, reason: 'unknown' };
    });
  }
  return undefined;
});

browser.runtime.onStartup.addListener(() => {
  applyRetention().catch((e) => console.warn('[retention] failed', e));
});

// Toolbar button toggles the sidebar. toggle() must run inside the user-action handler.
browser.action.onClicked.addListener(() => {
  browser.sidebarAction.toggle();
});
