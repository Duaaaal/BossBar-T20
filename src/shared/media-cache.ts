export const MEDIA_CACHE_ITEM_LIMIT_BYTES = 20 * 1024 * 1024;
export const MEDIA_CACHE_GLOBAL_LIMIT_BYTES = 1024 * 1024 * 1024;

export type MediaCacheUsage = Readonly<{
  usedBytes: number;
  itemLimitBytes: number;
  globalLimitBytes: number;
}>;

export const emptyMediaCacheUsage = (): MediaCacheUsage => ({
  usedBytes: 0,
  itemLimitBytes: MEDIA_CACHE_ITEM_LIMIT_BYTES,
  globalLimitBytes: MEDIA_CACHE_GLOBAL_LIMIT_BYTES,
});

export const formatMemoryBytes = (bytes: number) => {
  const safe = Math.max(0, Number.isFinite(bytes) ? bytes : 0);
  if (safe >= 1024 ** 3) return `${(safe / 1024 ** 3).toFixed(2)} GB`;
  if (safe >= 1024 ** 2) return `${(safe / 1024 ** 2).toFixed(1)} MB`;
  if (safe >= 1024) return `${(safe / 1024).toFixed(1)} KB`;
  return `${Math.trunc(safe)} B`;
};
