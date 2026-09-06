/** Independent of the music volume/mute controls and of the boss threat envelope. */
export class SfxMusicDucking {
  private readonly active = new Set<number>();
  private readonly listeners = new Set<(gain: number, seconds: number) => void>();
  get gain() { return this.active.size ? 0.35 : 1; }
  start(id: number) {
    if (this.active.has(id)) return;
    this.active.add(id);
    this.emit();
  }
  end(id: number) {
    if (this.active.delete(id)) this.emit();
  }
  private emit() {
    for (const listener of this.listeners) listener(this.gain, this.active.size ? 0.12 : 0.25);
  }
  subscribe(listener: (gain: number, seconds: number) => void) {
    this.listeners.add(listener);
    listener(this.gain, 0);
    return () => { this.listeners.delete(listener); };
  }
}

export const sfxMusicDucking = new SfxMusicDucking();

export const connectSfxMusicDucking = (context: AudioContext, input: AudioNode, output: AudioNode) => {
  const gain = context.createGain();
  input.connect(gain).connect(output);
  const unsubscribe = sfxMusicDucking.subscribe((value, seconds) => {
    if (context.state === 'closed') return;
    const now = context.currentTime;
    if (typeof gain.gain.cancelAndHoldAtTime === 'function') gain.gain.cancelAndHoldAtTime(now);
    else {
      const current = gain.gain.value;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(current, now);
    }
    gain.gain.linearRampToValueAtTime(value, now + seconds);
  });
  return () => { unsubscribe(); gain.disconnect(); };
};
