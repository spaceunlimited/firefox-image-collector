// Details panel: preview, facts, tag editor, image addresses and capture history.
import { domainOf } from '../shared/url.js';
import { formatDims, formatBytes, relativeTime, absoluteTime, typeLabel, FAILURE_TEXT } from '../shared/format.js';
import { normalizeTag, canOpenImage, suggestTags } from './model.js';

const template = document.getElementById('details-tpl');

export class DetailsPanel {
  /**
   * @param {HTMLElement} el
   * @param {{ loadPreview: (entry, img) => void, onAction: (action, id) => void,
   *           onOpenUrl: (url) => void, onTagsChange: (id, tags) => void, onClose: (id) => void }} hooks
   */
  constructor(el, hooks) {
    this.el = el;
    this.hooks = hooks;
    this.entry = null;

    el.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('.details-close')) return this.close();
      const action = t.closest('[data-action]');
      if (action && !action.disabled) return hooks.onAction(action.dataset.action, this.entry.id);
      const link = t.closest('.open-url');
      if (link) return hooks.onOpenUrl(link.dataset.url);
      const suggestion = t.closest('.tag-suggestion');
      if (suggestion) {
        this.addTag(suggestion.dataset.tag);
        const input = this.el.querySelector('.tag-input');
        input.value = '';
        input.focus();
        return undefined;
      }
      const remove = t.closest('.tag-remove');
      if (remove) {
        this.entry = { ...this.entry, tags: this.entry.tags.filter((x) => x !== remove.dataset.tag) };
        hooks.onTagsChange(this.entry.id, this.entry.tags);
        this.el.querySelector('.tag-input')?.focus();
      }
      return undefined;
    });
    el.addEventListener('keydown', (e) => {
      if (e.target.classList?.contains('tag-input')) this.onTagKey(e);
      else if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
      }
    });
    // Keep focus in the tag field when a suggestion is pressed, so focusout doesn't
    // commit the half-typed text as its own tag.
    el.addEventListener('mousedown', (e) => {
      if (e.target.closest('.tag-suggestion')) e.preventDefault();
    });
    el.addEventListener('input', (e) => {
      if (e.target.classList?.contains('tag-input')) this.renderSuggestions(e.target.value);
    });
    el.addEventListener('focusin', (e) => {
      if (e.target.classList?.contains('tag-input')) this.renderSuggestions(e.target.value);
    });
    el.addEventListener('focusout', (e) => {
      if (!e.target.classList?.contains('tag-input')) return;
      if (e.relatedTarget?.closest?.('.tag-suggest')) return;
      this.commitTag(e.target);
      this.renderSuggestions(null);
    });
  }

  get openId() {
    return this.el.hidden ? null : this.entry?.id ?? null;
  }

  open(entry, allTags, { focusTags = false } = {}) {
    this.entry = entry;
    this.render(allTags);
    this.el.hidden = false;
    document.body.classList.add('details-open');
    const target = focusTags ? this.el.querySelector('.tag-input') : this.el.querySelector('.details-close');
    target?.focus();
  }

  // Re-renders after a storage change, keeping a half-typed tag and its focus.
  update(entry, allTags) {
    if (this.openId !== entry.id) return;
    const active = document.activeElement;
    const typing = active?.classList?.contains('tag-input') ? active.value : null;
    this.entry = entry;
    this.render(allTags);
    if (typing !== null) {
      const input = this.el.querySelector('.tag-input');
      input.value = typing;
      input.focus();
      this.renderSuggestions(typing);
    }
  }

  close() {
    if (this.el.hidden) return;
    const id = this.entry?.id;
    this.el.hidden = true;
    document.body.classList.remove('details-open');
    this.entry = null;
    this.hooks.onClose(id);
  }

  addTag(raw) {
    const tag = normalizeTag(raw);
    if (!tag || !this.entry || this.entry.tags.includes(tag)) return;
    this.entry = { ...this.entry, tags: [...this.entry.tags, tag] };
    this.hooks.onTagsChange(this.entry.id, this.entry.tags);
  }

  commitTag(input) {
    const value = input.value;
    input.value = '';
    this.addTag(value);
  }

  // Shows matching existing tags under the field; null hides them.
  renderSuggestions(query) {
    const box = this.el.querySelector('.tag-suggest');
    if (!box) return;
    const tags = query === null || !this.entry ? [] : suggestTags(this.allTags, this.entry.tags, query);
    box.replaceChildren(
      ...tags.map((tag) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'tag-suggestion';
        b.dataset.tag = tag;
        b.textContent = tag;
        return b;
      }),
    );
    box.hidden = tags.length === 0;
  }

  onTagKey(e) {
    const input = e.target;
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      this.commitTag(input);
    } else if (e.key === 'Backspace' && input.value === '' && this.entry.tags.length) {
      e.preventDefault();
      this.entry = { ...this.entry, tags: this.entry.tags.slice(0, -1) };
      this.hooks.onTagsChange(this.entry.id, this.entry.tags);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (input.value) input.value = '';
      else this.close();
    }
  }

  render(allTags) {
    const entry = this.entry;
    this.allTags = allTags;
    const node = template.content.firstElementChild.cloneNode(true);
    const $ = (sel) => node.querySelector(sel);

    this.hooks.loadPreview(entry, $('.details-preview img'));
    $('.f-dims').textContent = formatDims(entry.width, entry.height) || 'Unknown';
    $('.f-mime').textContent = typeLabel(entry.mime) || 'Unknown';
    $('.f-bytes').textContent = formatBytes(entry.bytes) || 'Unknown';
    $('.f-first').textContent = absoluteTime(entry.firstCapturedAt);
    $('.f-last').textContent = absoluteTime(entry.lastCapturedAt);
    const copy = $('.f-copy');
    copy.textContent = `${entry.copyCount} ${entry.copyCount === 1 ? 'time' : 'times'}`;
    if (entry.lastCopy?.status === 'failed') {
      const warn = document.createElement('div');
      warn.className = 'copy-failed';
      warn.textContent = `Last attempt failed. ${FAILURE_TEXT[entry.lastCopy.reason] ?? FAILURE_TEXT.unknown}`;
      copy.appendChild(warn);
    }

    const chips = $('.tag-chips');
    for (const tag of entry.tags) {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.append(tag);
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'tag-remove';
      x.dataset.tag = tag;
      x.setAttribute('aria-label', `Remove tag ${tag}`);
      x.textContent = '×';
      chip.appendChild(x);
      chips.appendChild(chip);
    }

    const urls = $('.url-list');
    for (const u of entry.urls) {
      const li = document.createElement('li');
      if (entry.kind === 'http') li.appendChild(linkButton(u, u));
      else li.textContent = u;
      urls.appendChild(li);
    }

    const captures = $('.capture-list');
    for (const c of [...entry.captures].reverse()) {
      const li = document.createElement('li');
      li.appendChild(linkButton(c.pageTitle || c.pageUrl || 'Unknown page', c.pageUrl));
      const meta = document.createElement('div');
      meta.className = 'capture-meta';
      const time = document.createElement('time');
      time.dataset.ts = String(c.at);
      time.dateTime = new Date(c.at).toISOString();
      time.title = absoluteTime(c.at);
      time.textContent = relativeTime(c.at);
      const bits = [domainOf(c.pageUrl) || c.pageUrl, time, c.frameUrl ? 'in a frame' : null, c.copied ? 'copied' : 'not copied'];
      bits.filter(Boolean).forEach((b, i) => {
        if (i) meta.append(' · ');
        meta.append(b);
      });
      li.appendChild(meta);
      captures.appendChild(li);
    }
    $('.capture-count').textContent = String(entry.captures.length);

    $('[data-action="open-image"]').disabled = !canOpenImage(entry);
    this.el.replaceChildren(node);
  }
}

function linkButton(text, url) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'open-url';
  b.dataset.url = url ?? '';
  b.title = url ?? '';
  b.textContent = text;
  return b;
}
