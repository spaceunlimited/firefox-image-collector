export const ALL_SITES = Object.freeze({ origins: ['<all_urls>'] });

export function hasAllSites() {
  return browser.permissions.contains(ALL_SITES);
}

// Must be called from a user-gesture handler (click) in an extension page.
export function requestAllSites() {
  return browser.permissions.request(ALL_SITES);
}
