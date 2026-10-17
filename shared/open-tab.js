// Opens the collection as a full tab, or switches to it when one is already open.
export const TAB_PATH = 'sidebar/sidebar.html?mode=tab';

export async function openCollectionTab() {
  const url = browser.runtime.getURL(TAB_PATH);
  const contexts = await browser.runtime.getContexts({ contextTypes: ['TAB'] }).catch(() => []);
  const open = contexts.find((c) => c.documentUrl === url && c.tabId >= 0);
  if (!open) return browser.tabs.create({ url });
  await browser.windows.update(open.windowId, { focused: true });
  return browser.tabs.update(open.tabId, { active: true });
}
