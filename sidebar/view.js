// DOM rendering for the sidebar. All user data goes through textContent or attributes.
import { domainOf } from '../shared/url.js';
import { formatDims, relativeTime, absoluteTime, FAILURE_TEXT } from '../shared/format.js';
import { latestCapture } from './model.js';

const cardTemplate = document.getElementById('card-tpl');

export function renderGroups(container, groups, { thumbs, now = Date.now() }) {
  thumbs.reset();
  const frag = document.createDocumentFragment();
  for (const group of groups) {
    const section = document.createElement('section');
    section.className = 'group';
    const h = document.createElement('h2');
    h.className = 'group-label';
    h.textContent = group.label;
    const cards = document.createElement('div');
    cards.className = 'cards';
    for (const entry of group.entries) cards.appendChild(renderCard(entry, { thumbs, now }));
    section.append(h, cards);
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
  } else if (entry.kind === 'http' && entry.urls[0]) {
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
  img.alt = last?.pageTitle || domain || 'Collected image';

  if (entry.captures.length > 1) {
    const count = card.querySelector('.count');
    count.hidden = false;
    count.textContent = `×${entry.captures.length}`;
    count.title = `Collected ${entry.captures.length} times`;
  }
  if (entry.lastCopy?.status === 'failed') {
    const warn = card.querySelector('.warn');
    warn.hidden = false;
    warn.title = `Copy failed: ${FAILURE_TEXT[entry.lastCopy.reason] ?? FAILURE_TEXT.unknown}`;
  }

  card.querySelector('.dims').textContent = formatDims(entry.width, entry.height);
  const time = card.querySelector('.time');
  time.dateTime = new Date(entry.lastCapturedAt).toISOString();
  time.dataset.ts = String(entry.lastCapturedAt);
  time.textContent = relativeTime(entry.lastCapturedAt, now);
  time.title = absoluteTime(entry.lastCapturedAt);
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
    el.textContent = relativeTime(Number(el.dataset.ts), now);
  }
}

export function renderTagFilters(container, counts, selected) {
  container.hidden = counts.length === 0;
  container.replaceChildren(
    ...counts.map(([tag, n]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.dataset.tag = tag;
      b.setAttribute('aria-pressed', String(selected.has(tag)));
      b.textContent = tag;
      const c = document.createElement('span');
      c.className = 'chip-count';
      c.textContent = String(n);
      b.append(' ', c);
      return b;
    }),
  );
}
