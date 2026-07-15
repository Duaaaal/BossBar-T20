const encodeAssetPath = (relativePath: string) => relativePath
  .split('/')
  .filter(Boolean)
  .map(encodeURIComponent)
  .join('/');

export const bundledAssetUrl = (relativePath: string) =>
  `boss-asset://local/${encodeAssetPath(relativePath)}`;

const statusIconUrls = new Map<string, string>();

export const statusIconUrl = (iconFile: string) => {
  const cachedUrl = statusIconUrls.get(iconFile);
  if (cachedUrl) return cachedUrl;
  const url = bundledAssetUrl(`status-icons/${iconFile}`);
  statusIconUrls.set(iconFile, url);
  return url;
};
