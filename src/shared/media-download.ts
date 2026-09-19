/** Deadline for inactivity, not total duration: large progressing files remain valid. */
export const createMediaDownloadWatchdog = (controller: AbortController, idleMs = 15_000) => {
  let timer: ReturnType<typeof setTimeout>;
  const progress = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(), idleMs);
  };
  progress();
  return { progress, dispose: () => clearTimeout(timer) };
};

export const consumeMediaDownload = async (response: Response, progress: () => void, keepResident: boolean) => {
  const reader = response.body?.getReader();
  if (!reader) return new Blob([], { type: response.headers.get('content-type') ?? '' });
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      progress();
      if (keepResident) chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return new Blob(chunks, { type: response.headers.get('content-type') ?? '' });
};
