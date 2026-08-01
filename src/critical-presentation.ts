type CriticalShakeProfile = {
  maximumX: number;
  maximumY: number;
  maximumRotation: number;
  maximumScale: number;
};

/**
 * Builds a continuous, accelerating shake instead of a handful of discrete
 * jolts. The instantaneous frequency rises from roughly 3 Hz to 18 Hz while
 * its amplitude follows a progressively steeper envelope.
 */
export const escalatingCriticalShakeKeyframes = ({
  maximumX,
  maximumY,
  maximumRotation,
  maximumScale,
}: CriticalShakeProfile): Keyframe[] => {
  const frameCount = 180;
  return Array.from({ length: frameCount + 1 }, (_, index): Keyframe => {
    const progress = index / frameCount;
    const envelope = progress ** 1.35;
    const cycles = 9 * progress + 22.5 * progress * progress;
    const phase = cycles * Math.PI * 2;
    const x = Math.sin(phase) * maximumX * envelope;
    const y = Math.cos(phase * 1.31 + 0.65) * maximumY * envelope;
    const rotation = Math.sin(phase * 0.83 + 0.2) * maximumRotation * envelope;
    const scale = 1 + maximumScale * envelope;
    return {
      offset: progress,
      transform: `scale(${scale.toFixed(4)}) translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${rotation.toFixed(3)}deg)`,
    };
  });
};

export const criticalThreatRedKeyframes = (): Keyframe[] => [
  { offset: 0, opacity: 0, filter: 'saturate(1)' },
  { offset: .12, opacity: .08, filter: 'saturate(1.12)' },
  { offset: .3, opacity: .2, filter: 'saturate(1.3)' },
  { offset: .5, opacity: .4, filter: 'saturate(1.58)' },
  { offset: .7, opacity: .64, filter: 'saturate(1.9)' },
  { offset: .86, opacity: .84, filter: 'saturate(2.25)' },
  { offset: 1, opacity: .98, filter: 'saturate(2.65) brightness(.92)' },
];
