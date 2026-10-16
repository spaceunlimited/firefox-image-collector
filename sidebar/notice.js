// Bottom notice bar with an optional action button (e.g. Undo).
export function createNotice(el) {
  const text = el.querySelector('.notice-text');
  const button = el.querySelector('.notice-action');
  let timer = null;
  let action = null;

  function hide() {
    el.hidden = true;
    clearTimeout(timer);
    action = null;
  }

  button.addEventListener('click', () => {
    const run = action;
    hide();
    run?.();
  });

  /**
   * @param {string} message
   * @param {{ ms?: number, action?: { label: string, run: () => void } }} [opts]
   */
  function show(message, { ms = 5000, action: act } = {}) {
    text.textContent = message;
    action = act?.run ?? null;
    button.hidden = !act;
    if (act) button.textContent = act.label;
    el.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(hide, ms);
  }

  return { show, hide };
}
