export type ByteRange = {
  start: number;
  end: number;
  partial: boolean;
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
