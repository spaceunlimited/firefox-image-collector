// Event page entry point. All listeners are registered synchronously at top level
// so Firefox can wake this page for them after it has been unloaded.
import { flashBadge, toast } from './feedback.js';
import { captureFromMenu } from './capture.js';
import { recopy } from './recopy.js';
import { ensureSchema, getSettings, purgeOlderThan } from '../shared/store.js';
import { openCollectionTab } from '../shared/open-tab.js';

const MENU_ID = 'copy-and-collect';
const OPEN_TAB_ID = 'open-tab';

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
  browser.menus.create({ id: OPEN_TAB_ID, title: 'Open in a Tab', contexts: ['action'] }, done);
}

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
  if (info.menuItemId !== MENU_ID || !tab) return;
  if (info.mediaType !== 'image' || !info.srcUrl) return;
  captureFromMenu(info, tab)
    .then(() => applyRetention().catch((e) => console.warn('[retention] failed', e)))
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
