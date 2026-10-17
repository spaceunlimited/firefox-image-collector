import { ALL_SITES, hasAllSites } from '../shared/permissions.js';
import * as store from '../shared/store.js';
import { buildJson, buildCsv, parseImport } from '../shared/export.js';
import { formatBytes } from '../shared/format.js';
import { hydrateIcons, createIcon } from '../shared/icons.js';

hydrateIcons(document);

const $ = (id) => document.getElementById(id);

function say(id, text, { error = false } = {}) {
  const el = $(id);
  el.textContent = text;
  el.classList.toggle('error', error);
}

// Inline confirmation: resolves true when the user confirms.
function confirmInline(id, text) {
  const box = $(id);
  box.querySelector('.confirm-text').textContent = text;
  box.hidden = false;
  box.querySelector('[data-confirm="no"]').focus();
  return new Promise((resolve) => {
    box.onclick = (e) => {
      const b = e.target.closest('[data-confirm]');
      if (!b) return;
      box.hidden = true;
      box.onclick = null;
      resolve(b.dataset.confirm === 'yes');
    };
  });
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ---------- site access ----------

async function refreshAccess() {
  const on = await hasAllSites();
  $('access-status').dataset.on = String(on);
  $('access-status').replaceChildren(createIcon(on ? 'ok-circle' : 'alert-circle'), on ? 'Allowed on all websites' : 'Not allowed');
  $('access-toggle').textContent = on ? 'Turn off' : 'Allow access to all websites';
  $('access-toggle').dataset.on = String(on);
}

// permissions.request must run directly in the click handler, before any await.
$('access-toggle').addEventListener('click', () => {
  const on = $('access-toggle').dataset.on === 'true';
  const change = on ? browser.permissions.remove(ALL_SITES) : browser.permissions.request(ALL_SITES);
  change.catch((e) => console.warn('[options] permission change failed', e)).finally(refreshAccess);
});
browser.permissions.onAdded.addListener(refreshAccess);
browser.permissions.onRemoved.addListener(refreshAccess);

// ---------- automatic cleanup ----------

let savedDays = null;

$('auto-delete').addEventListener('change', async (e) => {
  const days = e.target.value ? Number(e.target.value) : null;
  say('auto-delete-msg', '');
  if (days) {
    const n = await store.countOlderThan(days);
    if (n > 0) {
      const ok = await confirmInline('auto-delete-confirm', `${plural(n, 'image')} were last collected more than ${days} days ago and will be deleted now.`);
      if (!ok) {
        e.target.value = savedDays ?? '';
        return;
      }
    }
  }
  await store.setSettings({ autoDeleteDays: days });
  savedDays = days;
  const removed = days ? await store.purgeOlderThan(days) : 0;
  say('auto-delete-msg', days ? `On. ${removed ? `Deleted ${plural(removed, 'image')}.` : 'Nothing to delete right now.'}` : 'Off.');
});

// ---------- export ----------

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

$('export-json').addEventListener('click', async () => {
  try {
    const { entries, thumbs, fulls } = await store.exportData();
    if (!entries.length) return say('export-msg', 'Nothing to export yet.');
    download(`image-collector-${stamp()}.json`, buildJson(entries, thumbs, fulls), 'application/json');
    say('export-msg', `Exported ${plural(entries.length, 'image')}.`);
  } catch (e) {
    say('export-msg', `Export failed: ${e.message}`, { error: true });
  }
  return undefined;
});

$('export-csv').addEventListener('click', async () => {
  try {
    const entries = await store.loadAll();
    if (!entries.length) return say('export-msg', 'Nothing to export yet.');
    download(`image-collector-${stamp()}.csv`, buildCsv(entries), 'text/csv');
    const rows = entries.reduce((n, e) => n + e.captures.length, 0);
    say('export-msg', `Exported ${plural(rows, 'row')} for ${plural(entries.length, 'image')}.`);
  } catch (e) {
    say('export-msg', `Export failed: ${e.message}`, { error: true });
  }
  return undefined;
});

// ---------- import ----------

$('import-choose').addEventListener('click', () => $('import-file').click());

$('import-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  say('import-msg', 'Importing…');
  try {
    const { items, invalid } = parseImport(await file.text());
    const { added, merged } = await store.importItems(items);
    const parts = [`Added ${plural(added, 'image')}`, `merged ${merged}`];
    if (invalid) parts.push(`skipped ${invalid} invalid`);
    say('import-msg', parts.join(', ') + '.');
  } catch (err) {
    say('import-msg', `Import failed: ${err.message}`, { error: true });
  } finally {
    e.target.value = '';
  }
});

// ---------- storage ----------

async function refreshStorage() {
  const [entries, bytes] = await Promise.all([store.readIndex(), store.bytesInUse()]);
  $('storage-info').textContent = `${plural(entries.ids.length, 'image')}, using about ${formatBytes(bytes)}.`;
}

let storageTimer = null;
browser.storage.onChanged.addListener((_, areaName) => {
  if (areaName !== 'local') return;
  clearTimeout(storageTimer);
  storageTimer = setTimeout(refreshStorage, 200);
});

// ---------- delete everything ----------

$('clear-all').addEventListener('click', async () => {
  const n = (await store.readIndex()).ids.length;
  if (!n) return say('clear-msg', 'The collection is already empty.');
  const ok = await confirmInline('clear-confirm', `Delete all ${plural(n, 'image')}? This can't be undone. Export first if you want a backup.`);
  if (!ok) return undefined;
  await store.clearAll();
  say('clear-msg', `Deleted ${plural(n, 'image')}.`);
  return undefined;
});

// ---------- boot ----------

(async () => {
  const settings = await store.getSettings();
  savedDays = settings.autoDeleteDays;
  $('auto-delete').value = savedDays ? String(savedDays) : '';
  await Promise.all([refreshAccess(), refreshStorage()]);
})().catch((e) => console.error('[options] boot failed', e));
