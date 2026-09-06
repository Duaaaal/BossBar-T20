/** Native media remains the transport/seek clock; a decoded loop removes decoder
 * restart gaps. Long files retain streaming playback to bound resident memory. */
const MAX_ENCODED = 20 * 1024 * 1024;
const MAX_DECODED = 96 * 1024 * 1024;
let residentBytes = 0;
const clocks = new WeakMap<HTMLMediaElement, () => number>();
const seekers = new WeakMap<HTMLMediaElement, (time: number) => void>();
export const mediaPlaybackTime = (audio: HTMLMediaElement) => clocks.get(audio)?.() ?? audio.currentTime;
export const seekMediaPlayback = (audio: HTMLMediaElement, time: number) => {
  const seek = seekers.get(audio);
  if (seek) seek(time); else audio.currentTime = time;
};

export const installGaplessLoop = (
  audio: HTMLAudioElement, context: AudioContext,
  mediaSource: MediaElementAudioSourceNode, output: GainNode,
) => {
  const controller = new AbortController();
  let buffer: AudioBuffer | null = null;
  let source: AudioBufferSourceNode | null = null;
  let allocated = 0;
  const nativeGain = context.createGain();
  const decodedGain = context.createGain();
  decodedGain.gain.value = 0;
  mediaSource.disconnect(output);
  mediaSource.connect(nativeGain).connect(output);
  decodedGain.connect(output);
  let active = true;
  let startTime = 0;
  let startOffset = 0;
  const stop = () => { source?.stop(); source?.disconnect(); source = null; };
  const sync = () => {
    if (!active) return;
    if (!buffer || !audio.loop || audio.paused || audio.ended) {
      stop();
      nativeGain.gain.setTargetAtTime(1, context.currentTime, 0.005);
      return;
    }
    // Once decoded, the audio clock is authoritative. Comparing it with the
    // native MP3 loop every 100 ms repeatedly restarted the audible source.
    if (source) return;
    const offset = audio.currentTime % buffer.duration;
    stop();
    source = context.createBufferSource(); source.buffer = buffer; source.loop = true;
    source.connect(decodedGain); startTime = context.currentTime; startOffset = offset;
    nativeGain.gain.cancelScheduledValues(startTime);
    nativeGain.gain.setValueAtTime(nativeGain.gain.value, startTime);
    nativeGain.gain.linearRampToValueAtTime(0, startTime + 0.02);
    decodedGain.gain.cancelScheduledValues(startTime);
    decodedGain.gain.setValueAtTime(0, startTime);
    decodedGain.gain.linearRampToValueAtTime(1, startTime + 0.02);
    source.start(startTime, offset);
  };
  clocks.set(audio, () => source && buffer
    ? (startOffset + context.currentTime - startTime) % buffer.duration : audio.currentTime);
  seekers.set(audio, (time) => { stop(); audio.currentTime = time; sync(); });
  const seeked = () => {
    if (source && buffer) {
      const delta = Math.abs(audio.currentTime - mediaPlaybackTime(audio));
      // Native loop wrapping can emit seeked too; it is not a user seek.
      if (audio.currentTime > 0.25 && audio.currentTime < buffer.duration - 0.25 &&
        Math.min(delta, Math.abs(buffer.duration - delta)) > 0.5) stop();
    }
    sync();
  };
  const load = async () => {
    // Metadata gives an upper bound before allocating a decoded PCM buffer.
    if (!audio.loop || !Number.isFinite(audio.duration) || audio.duration * context.sampleRate * 8 > MAX_DECODED - residentBytes) return;
    const response = await fetch(audio.currentSrc || audio.src, { signal: controller.signal });
    if (!response.ok || Number(response.headers.get('content-length')) > MAX_ENCODED || !response.body) return;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let length = 0;
    try {
      while (!controller.signal.aborted) {
        const next = await reader.read(); if (next.done) break;
        length += next.value.byteLength;
        if (length > MAX_ENCODED) { await reader.cancel(); return; }
        chunks.push(next.value);
      }
    } finally { reader.releaseLock(); }
    if (!active || controller.signal.aborted) return;
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const decoded = await context.decodeAudioData(bytes.buffer);
    const size = decoded.length * decoded.numberOfChannels * 4;
    if (!active || residentBytes + size > MAX_DECODED) return;
    buffer = decoded; allocated = size; residentBytes += size; sync();
  };
  let attempted = false;
  const update = () => {
    if (!attempted && audio.loop && audio.readyState >= 1) { attempted = true; void load().catch(() => undefined); }
    sync();
  };
  for (const event of ['play', 'pause', 'loadedmetadata']) audio.addEventListener(event, update);
  audio.addEventListener('seeked', seeked);
  const timer = setInterval(update, 100);
  update();
  return () => {
    active = false; controller.abort(); clearInterval(timer);
    for (const event of ['play', 'pause', 'loadedmetadata']) audio.removeEventListener(event, update);
    audio.removeEventListener('seeked', seeked); clocks.delete(audio); seekers.delete(audio);
    stop(); buffer = null; residentBytes -= allocated;
    mediaSource.disconnect(nativeGain); nativeGain.disconnect(); decodedGain.disconnect();
    mediaSource.connect(output);
  };
};
