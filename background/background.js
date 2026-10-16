// Event page entry point. All listeners are registered synchronously at top level
// so Firefox can wake this page for them after it has been unloaded.
import { flashBadge, toast } from './feedback.js';

const MENU_ID = 'copy-and-collect';

browser.runtime.onInstalled.addListener(async () => {
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
  // Placeholder until the capture pipeline lands.
  console.log('[capture] clicked', { srcUrl: info.srcUrl, pageUrl: info.pageUrl, frameId: info.frameId });
  flashBadge(tab.id, 'ok');
  toast(tab.id, 'Image Collector: menu works', 'ok');
});

// Toolbar button toggles the sidebar. toggle() must run inside the user-action handler.
browser.action.onClicked.addListener(() => {
  browser.sidebarAction.toggle();
});
