import { MEDIA_CACHE_GLOBAL_LIMIT_BYTES, MEDIA_CACHE_ITEM_LIMIT_BYTES } from './shared/media-cache';

// Renderer-owned cache: no personal media survives this presentation's lifetime.
const entries = new Map<string, { promise: Promise<void>; blobUrl?: string; bytes: number }>();
let residentBytes = 0;
let generation = 0;
const controllers = new Set<AbortController>();
const mediaKey = (url: string) => url.replace(/([?&])warm=\d+$/, '');
export const presentationMediaUrl = (url: string) => entries.get(mediaKey(url))?.blobUrl ?? url;

export const warmPresentationMedia = async (urls: string[]) => {
  const queue = [...new Set(urls.filter((url) => url.startsWith('boss-media://')))];
  const currentGeneration = generation;
  await Promise.all(Array.from({ length: Math.min(3, queue.length) }, async () => {
    while (queue.length && currentGeneration === generation) {
      const url = queue.shift()!;
      const key = mediaKey(url);
      const existing = entries.get(key);
      if (existing) { await existing.promise; continue; }
      const controller = new AbortController();
      controllers.add(controller);
      const timeout = setTimeout(() => controller.abort(), 120_000);
      const entry = { promise: Promise.resolve(), bytes: 0, blobUrl: undefined as string | undefined };
      entries.set(key, entry);
      entry.promise = (async () => {
        const response = await fetch(url, { cache: 'force-cache', signal: controller.signal });
        if (!response.ok) throw new Error(`Media HTTP ${response.status}`);
        const size = Number(response.headers.get('content-length'));
        if (size > 0 && size <= MEDIA_CACHE_ITEM_LIMIT_BYTES && residentBytes + size <= MEDIA_CACHE_GLOBAL_LIMIT_BYTES) {
          residentBytes += size; entry.bytes = size;
          const blob = await response.blob();
          if (currentGeneration === generation) entry.blobUrl = URL.createObjectURL(blob);
        } else {
          // Drain in chunks to warm the disk/OS cache without retaining a large file in JS memory.
          const reader = response.body?.getReader();
          if (reader) { try { while (!(await reader.read()).done) { /* bounded streaming */ } } finally { reader.releaseLock(); } }
        }
      })().catch(() => {
        if (entries.get(key) === entry) { entries.delete(key); residentBytes -= entry.bytes; }
      }).finally(() => { clearTimeout(timeout); controllers.delete(controller); });
      await entry.promise;
    }
  }));
};

export const clearPresentationMedia = () => {
  generation += 1;
  controllers.forEach((controller) => controller.abort()); controllers.clear();
  for (const entry of entries.values()) if (entry.blobUrl) URL.revokeObjectURL(entry.blobUrl);
  entries.clear(); residentBytes = 0;
};
