// Per-card action menu: one shared element, positioned next to the clicked ⋯ button.
export class CardMenu {
  constructor(el, onAction) {
    this.el = el;
    this.onAction = onAction;
    this.anchor = null;
    this.entryId = null;
    this.buttons = [...el.querySelectorAll('button[data-action]')];

    el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-action]');
      if (!b || b.disabled) return;
      const id = this.entryId;
      this.close(false);
      onAction(b.dataset.action, id);
    });
    el.addEventListener('keydown', (e) => this.onKey(e));
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (this.isOpen && !el.contains(e.target) && !this.anchor?.contains(e.target)) this.close(false);
      },
      true,
    );
    window.addEventListener('blur', () => this.close(false));
    window.addEventListener('resize', () => this.close(false));
    document.addEventListener('scroll', () => this.close(false), true);
  }

  get isOpen() {
    return !this.el.hidden;
  }

  /** @param {Record<string, boolean>} enabled actions explicitly set to false are disabled */
  toggle(anchor, entryId, enabled = {}) {
    if (this.isOpen && this.anchor === anchor) {
      this.close();
      return;
    }
    this.close(false);
    this.anchor = anchor;
    this.entryId = entryId;
    for (const b of this.buttons) b.disabled = enabled[b.dataset.action] === false;
    this.el.hidden = false;
    anchor.setAttribute('aria-expanded', 'true');

    const r = anchor.getBoundingClientRect();
    const { offsetWidth: w, offsetHeight: h } = this.el;
    let top = r.bottom + 4;
    if (top + h > innerHeight - 4) top = Math.max(4, r.top - h - 4);
    const left = Math.min(Math.max(4, r.right - w), innerWidth - w - 4);
    this.el.style.top = `${top}px`;
    this.el.style.left = `${left}px`;
    this.enabledButtons()[0]?.focus();
  }

  close(restoreFocus = true) {
    if (!this.isOpen) return;
    this.el.hidden = true;
    const anchor = this.anchor;
    this.anchor = null;
    anchor?.setAttribute('aria-expanded', 'false');
    if (restoreFocus && anchor?.isConnected) anchor.focus();
  }

  enabledButtons() {
    return this.buttons.filter((b) => !b.disabled);
  }

  onKey(e) {
    const items = this.enabledButtons();
    const i = items.indexOf(document.activeElement);
    const move = (to) => {
      e.preventDefault();
      items[(to + items.length) % items.length]?.focus();
    };
    if (e.key === 'ArrowDown') move(i + 1);
    else if (e.key === 'ArrowUp') move(i - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(items.length - 1);
    else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    } else if (e.key === 'Tab') this.close(false);
  }
}
