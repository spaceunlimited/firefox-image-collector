// Event page entry point. All listeners are registered synchronously at top level
// so Firefox can wake this page for them after it has been unloaded.
import { flashBadge, toast } from './feedback.js';
import { captureFromMenu } from './capture.js';
import { ensureSchema, getSettings, purgeOlderThan } from '../shared/store.js';

const MENU_ID = 'copy-and-collect';

// Applies the optional "delete entries older than N days" setting.
async function applyRetention() {
  const { autoDeleteDays } = await getSettings();
  if (autoDeleteDays) {
    const removed = await purgeOlderThan(autoDeleteDays);
    if (removed) console.log(`[retention] removed ${removed} old entries`);
  }
}

browser.runtime.onInstalled.addListener(async () => {
  await ensureSchema();
  await browser.menus.removeAll();
  browser.menus.create({
    id: MENU_ID,
    title: 'Copy Image + Collect',
    contexts: ['image'],
  });
});

browser.menus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !tab) return;
  if (info.mediaType !== 'image' || !info.srcUrl) return;
  captureFromMenu(info, tab)
    .then(() => applyRetention().catch((e) => console.warn('[retention] failed', e)))
    .catch((e) => {
      console.error('[capture] failed', e);
      flashBadge(tab.id, 'warn');
      toast(tab.id, 'Image Collector hit an unexpected error. See the extension console.', 'warn');
    });
});

browser.runtime.onStartup.addListener(() => {
  applyRetention().catch((e) => console.warn('[retention] failed', e));
});

// Toolbar button toggles the sidebar. toggle() must run inside the user-action handler.
browser.action.onClicked.addListener(() => {
  browser.sidebarAction.toggle();
});
