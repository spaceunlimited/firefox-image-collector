// "View options" popover: grouping, sort, date range, and which tags form groups in what order.
import { createIcon } from '../shared/icons.js';

export class ViewOptions {
  /**
   * @param {HTMLElement} el popover element
   * @param {HTMLElement} button toggle button
   * @param {(patch: object) => void} onChange receives { groupBy } | { sort } | { range }
   *   | { tagOrder } | { hiddenTags } | { showRest }
   */
  constructor(el, button, onChange) {
    Object.assign(this, { el, button, onChange });
    this.model = null;
    this.dragTag = null;

    button.addEventListener('click', () => (this.isOpen ? this.close() : this.open()));
    el.addEventListener('click', (e) => this.onClick(e));
    el.addEventListener('change', (e) => this.onToggle(e));
    el.addEventListener('keydown', (e) => this.onKey(e));
    el.addEventListener('dragstart', (e) => this.onDragStart(e));
    el.addEventListener('dragover', (e) => this.onDragOver(e));
    el.addEventListener('drop', (e) => this.onDrop(e));
    el.addEventListener('dragend', () => this.clearDrag());
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (this.isOpen && !el.contains(e.target) && !button.contains(e.target)) this.close(false);
      },
      true,
    );
    window.addEventListener('resize', () => this.isOpen && this.position());
  }

  get isOpen() {
    return !this.el.hidden;
  }

  open() {
    this.el.hidden = false;
    this.button.setAttribute('aria-expanded', 'true');
    this.position();
    this.el.querySelector('[aria-checked=true]')?.focus();
  }

  close(restoreFocus = true) {
    if (!this.isOpen) return;
    this.el.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
    if (restoreFocus) this.button.focus();
  }

  position() {
    const r = this.button.getBoundingClientRect();
    const top = r.bottom + 6;
    this.el.style.top = `${top}px`;
    this.el.style.maxHeight = `${Math.max(160, innerHeight - top - 8)}px`;
  }

  /**
   * @param {{ groupBy: string, sort: string, range: string,
   *           tags: { tag: string, count: number, visible: boolean }[], showRest: boolean }} model
   */
  render(model) {
    this.model = model;
    for (const [attr, value] of [['group', model.groupBy], ['sort', model.sort], ['range', model.range]]) {
      for (const b of this.el.querySelectorAll(`[data-${attr}]`)) {
        b.setAttribute('aria-checked', String(b.dataset[attr] === value));
        b.tabIndex = b.dataset[attr] === value ? 0 : -1;
      }
    }
    const section = this.el.querySelector('.tag-groups');
    section.hidden = model.groupBy !== 'tag';
    const list = section.querySelector('.tag-order');
    const focused = document.activeElement?.closest?.('.tag-row')?.dataset.tag;
    const focusedPart = document.activeElement?.dataset?.move ?? (document.activeElement?.type === 'checkbox' ? 'check' : null);
    list.replaceChildren(...model.tags.map((t, i) => this.row(t, i, model.tags.length)));
    section.querySelector('.tag-empty').hidden = model.tags.length > 0;
    section.querySelector('.rest-toggle input').checked = model.showRest;
    // Keep keyboard focus on the row that just moved.
    if (focused) {
      const row = list.querySelector(`.tag-row[data-tag="${CSS.escape(focused)}"]`);
      const target = focusedPart === 'check' ? row?.querySelector('input') : row?.querySelector(`[data-move="${focusedPart}"]:not(:disabled)`) ?? row?.querySelector('input');
      target?.focus();
    }
  }

  row({ tag, count, visible }, i, n) {
    const li = document.createElement('li');
    li.className = 'tag-row';
    li.dataset.tag = tag;
    li.draggable = true;
    const grip = document.createElement('span');
    grip.className = 'grip';
    grip.appendChild(createIcon('grip'));
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = visible;
    box.dataset.tag = tag;
    label.append(box, ` ${tag}`);
    const num = document.createElement('span');
    num.className = 'tag-count';
    num.textContent = String(count);
    const moves = document.createElement('span');
    moves.className = 'moves';
    for (const [dir, disabled] of [['up', i === 0], ['down', i === n - 1]]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'move-btn';
      b.dataset.move = dir;
      b.disabled = disabled;
      b.setAttribute('aria-label', `Move ${tag} ${dir}`);
      b.title = `Move ${dir} (Alt+${dir === 'up' ? '↑' : '↓'})`;
      b.appendChild(createIcon(dir));
      moves.appendChild(b);
    }
    li.append(grip, label, num, moves);
    return li;
  }

  order() {
    return this.model.tags.map((t) => t.tag);
  }

  move(tag, delta) {
    const order = this.order();
    const i = order.indexOf(tag);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    this.onChange({ tagOrder: order });
  }

  onClick(e) {
    const seg = e.target.closest('[data-group], [data-sort], [data-range]');
    if (seg) {
      if (seg.dataset.group) this.onChange({ groupBy: seg.dataset.group });
      else if (seg.dataset.sort) this.onChange({ sort: seg.dataset.sort });
      else {
        this.onChange({ range: seg.dataset.range });
        if (seg.dataset.range === 'custom') this.close(false);
      }
      return;
    }
    const mv = e.target.closest('[data-move]');
    if (mv && !mv.disabled) this.move(mv.closest('.tag-row').dataset.tag, mv.dataset.move === 'up' ? -1 : 1);
  }

  onToggle(e) {
    const t = e.target;
    if (t.closest('.rest-toggle')) {
      this.onChange({ showRest: t.checked });
    } else if (t.dataset.tag) {
      const hidden = this.model.tags.filter((x) => (x.tag === t.dataset.tag ? !t.checked : !x.visible)).map((x) => x.tag);
      this.onChange({ hiddenTags: hidden });
    }
  }

  onKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close();
      return;
    }
    // Alt+↑/↓ reorders the focused tag row.
    const row = e.target.closest?.('.tag-row');
    if (row && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      this.move(row.dataset.tag, e.key === 'ArrowUp' ? -1 : 1);
      return;
    }
    // Arrow keys move between options of a segmented control (radio group behavior).
    const seg = e.target.closest?.('[role=radio]');
    if (seg && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      const items = [...seg.parentElement.querySelectorAll('[role=radio]')];
      const k = items.indexOf(seg) + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1);
      const next = items[(k + items.length) % items.length];
      next.focus();
      next.click();
    }
  }

  onDragStart(e) {
    const row = e.target.closest?.('.tag-row');
    if (!row) return;
    this.dragTag = row.dataset.tag;
    row.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.dragTag);
  }

  onDragOver(e) {
    const row = e.target.closest?.('.tag-row');
    if (!row || !this.dragTag) return;
    e.preventDefault();
    const r = row.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    for (const x of this.el.querySelectorAll('.drop-before, .drop-after')) x.classList.remove('drop-before', 'drop-after');
    if (row.dataset.tag !== this.dragTag) row.classList.add(after ? 'drop-after' : 'drop-before');
  }

  onDrop(e) {
    const row = e.target.closest?.('.tag-row');
    if (!row || !this.dragTag) return;
    e.preventDefault();
    const after = row.classList.contains('drop-after');
    const order = this.order().filter((t) => t !== this.dragTag);
    let at = order.indexOf(row.dataset.tag);
    if (at < 0) at = order.length;
    order.splice(after ? at + 1 : at, 0, this.dragTag);
    this.clearDrag();
    this.onChange({ tagOrder: order });
  }

  clearDrag() {
    this.dragTag = null;
    for (const x of this.el.querySelectorAll('.dragging, .drop-before, .drop-after')) {
      x.classList.remove('dragging', 'drop-before', 'drop-after');
    }
  }
}
