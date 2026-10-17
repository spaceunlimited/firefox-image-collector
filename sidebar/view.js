// DOM rendering for the sidebar. All user data goes through textContent or attributes.
import { domainOf } from '../shared/url.js';
import { formatDims, relativeTime, shortRelativeTime, absoluteTime, typeLabel, FAILURE_TEXT } from '../shared/format.js';
import { latestCapture } from './model.js';
import { createIcon } from '../shared/icons.js';

const cardTemplate = document.getElementById('card-tpl');

/** Day groups like Firefox's History sidebar; `collapsed` holds group keys that are folded. */
export function renderGroups(container, groups, { thumbs, now = Date.now(), collapsed = new Set() }) {
  thumbs.reset();
  const frag = document.createDocumentFragment();
  for (const group of groups) {
    const isCollapsed = group.label !== null && collapsed.has(group.key);
    const section = document.createElement('section');
    section.className = 'group';
    if (group.label === null) {
      // Ungrouped list: no heading, nothing to fold.
      section.classList.add('no-head');
      const cards = document.createElement('div');
      cards.className = 'cards';
      for (const entry of group.entries) cards.appendChild(renderCard(entry, { thumbs, now }));
      section.appendChild(cards);
      frag.appendChild(section);
      continue;
    }
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'group-head';
    head.dataset.key = group.key;
    head.setAttribute('aria-expanded', String(!isCollapsed));
    const label = document.createElement('span');
    label.className = 'group-label';
    label.textContent = group.label;
    const count = document.createElement('span');
    count.className = 'group-count';
    count.textContent = String(group.entries.length);
    head.append(createIcon('chevron', 'chevron'), label, count);
    section.appendChild(head);
    if (!isCollapsed) {
      const cards = document.createElement('div');
      cards.className = 'cards';
      for (const entry of group.entries) cards.appendChild(renderCard(entry, { thumbs, now }));
      section.appendChild(cards);
    }
    frag.appendChild(section);
  }
  container.replaceChildren(frag);
}

export function renderCard(entry, { thumbs, now }) {
  const card = cardTemplate.content.firstElementChild.cloneNode(true);
  const last = latestCapture(entry);
  card.dataset.id = entry.id;

  const img = card.querySelector('.thumb img');
  const thumbBtn = card.querySelector('.thumb');
  if (entry.hasThumb) {
    thumbs.observe(img, entry.id);
  } else if (entry.kind === 'http' && /^https?:/i.test(entry.urls[0] ?? '')) {
    // No stored thumbnail (copy failed): show the live image if it still loads.
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.src = entry.urls[0];
  } else {
    thumbBtn.classList.add('no-thumb');
  }
  img.addEventListener('error', () => thumbBtn.classList.add('no-thumb'), { once: true });
  const domain = last ? domainOf(last.pageUrl) : '';
  thumbBtn.title = last ? `Open ${domain || 'source page'}` : '';
  card.querySelector('.menu-btn').setAttribute('aria-label', `Actions for ${last?.pageTitle || domain || 'image'}`);
  img.alt = last?.pageTitle || domain || 'Collected image';

  if (entry.captures.length > 1) {
    const count = card.querySelector('.count-badge');
    count.hidden = false;
    count.textContent = `${entry.captures.length}×`;
    count.title = `Collected ${entry.captures.length} times`;
    const times = card.querySelector('.times');
    times.hidden = false;
    times.textContent = `${entry.captures.length}× collected`;
  }
  if (entry.lastCopy?.status === 'failed') {
    const warn = card.querySelector('.warn');
    warn.hidden = false;
    warn.title = `Copy failed: ${FAILURE_TEXT[entry.lastCopy.reason] ?? FAILURE_TEXT.unknown}`;
  }

  card.querySelector('.dims').textContent = formatDims(entry.width, entry.height);
  const type = typeLabel(entry.mime);
  const typeEl = card.querySelector('.type-label');
  typeEl.textContent = type;
  typeEl.hidden = !type;
  const time = card.querySelector('.time');
  // Cards show when the image was added, matching the sort order.
  const added = entry.firstCapturedAt;
  time.dateTime = new Date(added).toISOString();
  time.dataset.ts = String(added);
  time.textContent = relativeTime(added, now);
  time.title = `Added ${absoluteTime(added)}`;
  const short = card.querySelector('.time-short');
  short.dateTime = time.dateTime;
  short.dataset.ts = time.dataset.ts;
  short.dataset.format = 'short';
  short.textContent = shortRelativeTime(added, now);
  short.title = time.title;
  card.querySelector('.domain').textContent = domain;
  card.querySelector('.title').textContent = last?.pageTitle || '';
  const tags = card.querySelector('.tags');
  for (const t of entry.tags) {
    const chip = document.createElement('span');
    chip.className = 'tag';
    chip.textContent = t;
    tags.appendChild(chip);
  }
  return card;
}

export function refreshTimes(container, now = Date.now()) {
  for (const el of container.querySelectorAll('time[data-ts]')) {
    const ts = Number(el.dataset.ts);
    el.textContent = el.dataset.format === 'short' ? shortRelativeTime(ts, now) : relativeTime(ts, now);
  }
}
