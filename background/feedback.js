// Toolbar badge flash and on-page toast.
import { showToast } from '../content/probe.js';

const BADGE = {
  ok: { text: '✓', color: '#16a34a' },
  warn: { text: '!', color: '#ea580c' },
};
const BADGE_MS = 1500;

export async function flashBadge(tabId, variant = 'ok') {
  const { text, color } = BADGE[variant] ?? BADGE.ok;
  try {
    await browser.action.setBadgeBackgroundColor({ color, tabId });
    await browser.action.setBadgeText({ text, tabId });
    setTimeout(() => {
      browser.action.setBadgeText({ text: '', tabId }).catch(() => {});
    }, BADGE_MS);
  } catch (e) {
    console.warn('[feedback] badge failed', e);
  }
}

// Injects a self-contained toast into the top frame of the tab. Fails quietly on
// pages where injection is not allowed (about:, addons.mozilla.org, reader view, PDFs).
export async function toast(tabId, text, variant = 'ok') {
  try {
    await browser.scripting.executeScript({
      target: { tabId, frameIds: [0] },
      func: showToast,
      args: [text, variant],
    });
  } catch (e) {
    console.debug('[feedback] toast not shown', e?.message);
  }
}
