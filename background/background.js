// Event page entry point. All listeners are registered synchronously at top level
// so Firefox can wake this page for them after it has been unloaded.
import { flashBadge, toast } from './feedback.js';
import { captureFromMenu } from './capture.js';
import { recopy } from './recopy.js';
import { ensureSchema, getSettings, purgeOlderThan } from '../shared/store.js';

const MENU_ID = 'copy-and-collect';

console.log('[background] started', new Date().toLocaleTimeString());

// Applies the optional "delete entries older than N days" setting.
async function applyRetention() {
  const { autoDeleteDays } = await getSettings();
  if (autoDeleteDays) {
    const removed = await purgeOlderThan(autoDeleteDays);
    if (removed) console.log(`[retention] removed ${removed} old entries`);
  }
}

// Creates the menu item. Safe to call repeatedly: a duplicate id is reported and ignored.
function ensureMenu() {
  browser.menus.create({ id: MENU_ID, title: 'Copy Image + Collect', contexts: ['image'] }, () => {
    const err = browser.runtime.lastError;
    if (err && !/already exists/i.test(err.message)) console.warn('[background] menu create failed', err.message);
  });
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
