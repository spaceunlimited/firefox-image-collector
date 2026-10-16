import { ALL_SITES, hasAllSites } from '../shared/permissions.js';

const status = document.getElementById('access-status');
const toggle = document.getElementById('access-toggle');

async function refresh() {
  const on = await hasAllSites();
  status.dataset.on = String(on);
  status.textContent = on ? 'Allowed on all websites' : 'Not allowed';
  toggle.textContent = on ? 'Turn off' : 'Allow access to all websites';
  toggle.dataset.on = String(on);
}

// permissions.request must run directly in the click handler, before any await.
toggle.addEventListener('click', () => {
  const change = toggle.dataset.on === 'true' ? browser.permissions.remove(ALL_SITES) : browser.permissions.request(ALL_SITES);
  change.catch((e) => console.warn('[options] permission change failed', e)).finally(refresh);
});

browser.permissions.onAdded.addListener(refresh);
browser.permissions.onRemoved.addListener(refresh);
refresh();
