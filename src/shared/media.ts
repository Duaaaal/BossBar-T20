export type ByteRange = {
  start: number;
  end: number;
  partial: boolean;
};

export type BackgroundMediaType = 'image' | 'video';

export type MediaOriginPolicy = {
  allowed: boolean;
  responseOrigin: string | null;
};

export const backgroundImageExtensions = [
  '.avif',
  '.bmp',
  '.gif',
  '.jfif',
  '.jpeg',
  '.jpg',
  '.png',
  '.webp',
] as const;

export const backgroundVideoExtensions = [
  '.m4v',
  '.mkv',
  '.mov',
  '.mp4',
  '.ogv',
  '.webm',
] as const;

const backgroundVideoMimeTypes: Readonly<Record<string, string>> = {
  '.m4v': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.ogv': 'video/ogg',
  '.webm': 'video/webm',
};

const fileExtension = (fileName: string) => {
  const extensionStart = fileName.lastIndexOf('.');
  return extensionStart < 0 ? '' : fileName.slice(extensionStart).toLowerCase();
};

export const backgroundMediaTypeForFile = (
  fileName: string,
): BackgroundMediaType | null => {
  const extension = fileExtension(fileName);
  if ((backgroundImageExtensions as readonly string[]).includes(extension)) {
    return 'image';
  }
  if ((backgroundVideoExtensions as readonly string[]).includes(extension)) {
    return 'video';
  }
  return null;
};

export const backgroundVideoMimeTypeForFile = (fileName: string) =>
  backgroundVideoMimeTypes[fileExtension(fileName)] ?? null;

export const resolveMediaOriginPolicy = (
  requestOrigin: string | null,
  rendererOrigin: string,
): MediaOriginPolicy => {
  if (!requestOrigin) return { allowed: true, responseOrigin: null };
  if (requestOrigin === rendererOrigin) {
    return { allowed: true, responseOrigin: rendererOrigin };
  }
  return { allowed: false, responseOrigin: null };
};

export const resolveByteRange = (
  rangeHeader: string | null,
  fileSize: number,
): ByteRange | null => {
  if (!Number.isSafeInteger(fileSize) || fileSize <= 0) return null;

  if (!rangeHeader) {
    return { start: 0, end: fileSize - 1, partial: false };
  }

  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
  if (!match || (!match[1] && !match[2])) return null;

  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    return {
      start: Math.max(0, fileSize - suffixLength),
      end: fileSize - 1,
      partial: true,
    };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : fileSize - 1;
  const end = Math.min(requestedEnd, fileSize - 1);

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    start >= fileSize ||
    end < start
  ) return null;

  return { start, end, partial: true };
};
