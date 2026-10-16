// Minimal in-memory stand-in for browser.storage.local with the same call shapes.
export function installFakeBrowser({ failSetWhen } = {}) {
  const data = new Map();
  const clone = (v) => structuredClone(v);
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
      for (const [k, v] of Object.entries(items)) data.set(k, clone(v));
    },
    async remove(keys) {
      for (const k of [].concat(keys)) data.delete(k);
    },
    async clear() {
      data.clear();
    },
  };
  globalThis.browser = { storage: { local } };
  return { data, local };
}
