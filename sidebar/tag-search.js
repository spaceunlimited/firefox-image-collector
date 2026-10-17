// Search field with tag suggestions: typing shows matching tags; picking one turns it into a
// filter chip inside the field. Implements the ARIA combobox pattern on the input.
import { matchTags } from './model.js';

export class TagSearch {
  /**
   * @param {{ field: HTMLElement, input: HTMLInputElement, tokens: HTMLElement, list: HTMLElement,
   *           getCounts: () => [string, number][], onChange: () => void }} opts
   */
  constructor({ field, input, tokens, list, getCounts, onChange }) {
    Object.assign(this, { field, input, tokens, list, getCounts, onChange });
    this.tags = new Set();
    this.options = [];
    this.active = -1;

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', list.id);
    input.setAttribute('aria-expanded', 'false');

    field.addEventListener('click', (e) => {
      if (!e.target.closest('button')) input.focus();
    });
    input.addEventListener('input', () => {
      this.suggest();
      this.onChange();
    });
    input.addEventListener('keydown', (e) => this.onKey(e));
    input.addEventListener('blur', () => setTimeout(() => this.close(), 0));
    // Keep focus in the input while picking with the mouse.
    list.addEventListener('mousedown', (e) => e.preventDefault());
    list.addEventListener('click', (e) => {
      const opt = e.target.closest('[role=option]');
      if (opt) this.select(opt.dataset.tag);
    });
    tokens.addEventListener('click', (e) => {
      const b = e.target.closest('[data-remove]');
      if (!b) return;
      this.remove(b.dataset.remove);
      input.focus();
    });
  }

  get query() {
    return this.input.value;
  }

  get isOpen() {
    return !this.list.hidden;
  }

  suggest() {
    this.options = matchTags(this.getCounts(), this.input.value, this.tags);
    this.active = this.options.length ? 0 : -1;
    this.renderList();
  }

  renderList() {
    const open = this.options.length > 0;
    this.list.hidden = !open;
    this.input.setAttribute('aria-expanded', String(open));
    this.list.replaceChildren(
      ...this.options.map(([tag, n], i) => {
        const li = document.createElement('li');
        li.id = `tag-option-${i}`;
        li.setAttribute('role', 'option');
        li.dataset.tag = tag;
        li.setAttribute('aria-selected', String(i === this.active));
        const name = document.createElement('span');
        name.className = 'suggest-name';
        name.textContent = tag;
        const count = document.createElement('span');
        count.className = 'suggest-count';
        count.textContent = String(n);
        li.append(name, count);
        return li;
      }),
    );
    if (this.active >= 0) this.input.setAttribute('aria-activedescendant', `tag-option-${this.active}`);
    else this.input.removeAttribute('aria-activedescendant');
  }

  close() {
    if (!this.isOpen) return;
    this.options = [];
    this.active = -1;
    this.renderList();
  }

  select(tag) {
    this.tags.add(tag);
    this.input.value = '';
    this.close();
    this.renderTokens();
    this.onChange();
  }

  remove(tag) {
    this.tags.delete(tag);
    this.renderTokens();
    this.onChange();
  }

  // Drops chips for tags that no longer exist.
  prune(existing) {
    let changed = false;
    for (const t of this.tags) {
      if (!existing.has(t)) {
        this.tags.delete(t);
        changed = true;
      }
    }
    if (changed) this.renderTokens();
  }

  renderTokens() {
    this.tokens.replaceChildren(
      ...[...this.tags].map((tag) => {
        const chip = document.createElement('span');
        chip.className = 'token';
        chip.append(tag);
        const x = document.createElement('button');
        x.type = 'button';
        x.className = 'token-remove';
        x.dataset.remove = tag;
        x.setAttribute('aria-label', `Remove tag filter ${tag}`);
        x.textContent = '×';
        chip.appendChild(x);
        return chip;
      }),
    );
    this.input.placeholder = this.tags.size ? '' : 'Search images or tags';
  }

  onKey(e) {
    const n = this.options.length;
    if (e.key === 'ArrowDown' && n) {
      e.preventDefault();
      this.active = (this.active + 1) % n;
      this.renderList();
    } else if (e.key === 'ArrowUp' && n) {
      e.preventDefault();
      this.active = (this.active - 1 + n) % n;
      this.renderList();
    } else if ((e.key === 'Enter' || e.key === 'Tab') && this.isOpen && this.active >= 0) {
      e.preventDefault();
      this.select(this.options[this.active][0]);
    } else if (e.key === 'Escape') {
      if (this.isOpen) {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      } else if (this.input.value) {
        e.preventDefault();
        this.input.value = '';
        this.onChange();
      }
    } else if (e.key === 'Backspace' && !this.input.value && this.tags.size) {
      e.preventDefault();
      this.remove([...this.tags].at(-1));
    }
  }
}
