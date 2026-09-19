// Keep resumption inside a real user gesture. A suspended context's clock
// does not advance, so scheduling gain ramps alone cannot restore its audio.
const contexts = new Set<AudioContext>();
const pending = new WeakMap<AudioContext, Promise<void>>();
const listeners = new Set<() => void>();
let listening = false;
const publish = () => listeners.forEach(listener => listener());

export const hasSuspendedPresentationAudio = () => [...contexts].some(context => context.state === 'suspended');
export const subscribePresentationAudio = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export const resumePresentationAudio = (context: AudioContext, userGesture = false) => {
  if (context.state !== 'suspended') return;
  // Do not enqueue resume promises every 25 ms while autoplay is blocked.
  // A gesture must be allowed to retry even while an earlier promise waits.
  if (!userGesture && pending.has(context)) return;
  const request = context.resume().catch(() => undefined).finally(() => {
    if (pending.get(context) === request) pending.delete(context);
    publish();
  });
  pending.set(context, request);
};

export const unlockPresentationAudio = () => {
  for (const context of contexts) resumePresentationAudio(context, true);
};

export const createPresentationAudioContext = () => {
  const context = new AudioContext();
  contexts.add(context);
  if (!listening) {
    document.addEventListener('pointerup', unlockPresentationAudio, true);
    document.addEventListener('keydown', unlockPresentationAudio, true);
    listening = true;
  }
  const changed = () => {
    if (context.state === 'closed') {
      contexts.delete(context);
      context.removeEventListener('statechange', changed);
      if (!contexts.size) {
        document.removeEventListener('pointerup', unlockPresentationAudio, true);
        document.removeEventListener('keydown', unlockPresentationAudio, true);
        listening = false;
      }
    }
    publish();
  };
  context.addEventListener('statechange', changed);
  publish();
  return context;
};
