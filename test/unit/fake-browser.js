// Minimal in-memory stand-in for the WebExtension APIs the extension uses.
export function installFakeBrowser({ failSetWhen } = {}) {
  const data = new Map();
  const listeners = new Set();
  const clone = (v) => (v === undefined ? v : structuredClone(v));
  const emit = (changes) => {
    if (!Object.keys(changes).length) return;
    queueMicrotask(() => {
      for (const fn of listeners) fn(changes, 'local');
    });
  };
  const local = {
    async get(keys) {
      const out = {};
      if (keys === null || keys === undefined) {
        for (const [k, v] of data) out[k] = clone(v);
      } else if (typeof keys === 'string') {
        if (data.has(keys)) out[keys] = clone(data.get(keys));
      } else if (Array.isArray(keys)) {
        for (const k of keys) if (data.has(k)) out[k] = clone(data.get(k));
      } else {
        for (const [k, def] of Object.entries(keys)) out[k] = data.has(k) ? clone(data.get(k)) : def;
      }
      return out;
    },
    async set(items) {
      if (failSetWhen?.(items)) throw new Error('QuotaExceededError');
      const changes = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: clone(data.get(k)), newValue: clone(v) };
        data.set(k, clone(v));
      }
      emit(changes);
    },
    async remove(keys) {
      const changes = {};
      for (const k of [].concat(keys)) {
        if (data.has(k)) changes[k] = { oldValue: clone(data.get(k)) };
        data.delete(k);
      }
      emit(changes);
    },
    async clear() {
      data.clear();
    },
  };
  const calls = { tabsCreate: [], messages: [], openOptions: 0 };
  const permListeners = { added: new Set(), removed: new Set() };
  let granted = true;
  const api = {
    permissions: {
      contains: async () => granted,
      async request() {
        granted = true;
        for (const fn of permListeners.added) fn();
        return true;
      },
      async remove() {
        granted = false;
        for (const fn of permListeners.removed) fn();
        return true;
      },
      onAdded: { addListener: (fn) => permListeners.added.add(fn) },
      onRemoved: { addListener: (fn) => permListeners.removed.add(fn) },
    },
    storage: {
      local,
      onChanged: { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn) },
    },
    tabs: {
      async create(opts) {
        calls.tabsCreate.push(opts);
        return { id: 1, ...opts };
      },
    },
    runtime: {
      messageHandler: async () => ({ ok: true }),
      async sendMessage(msg) {
        calls.messages.push(msg);
        return api.runtime.messageHandler(msg);
      },
      openOptionsPage() {
        calls.openOptions += 1;
        return Promise.resolve();
      },
      getURL: (path) => `moz-extension://test/${path}`,
    },
  };
  globalThis.browser = api;
  return { data, local, calls, api };
}
