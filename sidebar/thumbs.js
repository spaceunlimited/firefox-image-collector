// Loads thumbnails for visible cards in small batches and caches them for re-renders.
const BATCH_DELAY_MS = 30;

export class ThumbLoader {
  constructor(fetchThumbs) {
    this.fetchThumbs = fetchThumbs;
    this.cache = new Map();
    this.waiting = new Map();
    this.timer = null;
    this.io = new IntersectionObserver((items) => this.onIntersect(items), { rootMargin: '600px 0px' });
  }

  observe(img, id) {
    const cached = this.cache.get(id);
    if (cached) {
      img.src = cached;
      return;
    }
    img.dataset.thumbId = id;
    this.io.observe(img);
  }

  onIntersect(items) {
    for (const item of items) {
      if (!item.isIntersecting) continue;
      const img = item.target;
      this.io.unobserve(img);
      const id = img.dataset.thumbId;
      if (!this.waiting.has(id)) this.waiting.set(id, new Set());
      this.waiting.get(id).add(img);
    }
    if (this.waiting.size && !this.timer) this.timer = setTimeout(() => this.flush(), BATCH_DELAY_MS);
  }

  async flush() {
    this.timer = null;
    const batch = this.waiting;
    this.waiting = new Map();
    let thumbs = {};
    try {
      thumbs = await this.fetchThumbs([...batch.keys()]);
    } catch (e) {
      console.warn('[thumbs] load failed', e);
    }
    for (const [id, imgs] of batch) {
      const url = thumbs[id];
      if (!url) continue;
      this.cache.set(id, url);
      for (const img of imgs) img.src = url;
    }
  }

  invalidate(id) {
    this.cache.delete(id);
  }

  // Stops watching elements from a previous render.
  reset() {
    this.io.disconnect();
    this.waiting.clear();
  }
}
