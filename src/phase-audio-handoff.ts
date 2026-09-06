// Transfer the actual decoder and graph instead of reopening the same URL.
export type PhaseAudioHandoff = {
  audio: HTMLAudioElement;
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  release: () => void;
};
let handoff: (PhaseAudioHandoff & { trackId: string; timer: ReturnType<typeof setTimeout> }) | null = null;

export const finishPhaseAudioHandoff = () => {
  const previous = handoff;
  if (!previous) return;
  handoff = null;
  clearTimeout(previous.timer);
  previous.release();
};

export const retainPhaseAudio = (trackId: string, owner: PhaseAudioHandoff) => {
  finishPhaseAudioHandoff();
  handoff = { ...owner, trackId, timer: setTimeout(finishPhaseAudioHandoff, 10_000) };
};

export const takePhaseAudioHandoff = (trackId: string): PhaseAudioHandoff | null => {
  if (handoff?.trackId !== trackId) return null;
  const owner = handoff;
  handoff = null;
  clearTimeout(owner.timer);
  return owner;
};
