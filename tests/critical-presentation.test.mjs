import assert from 'node:assert/strict';
import test from 'node:test';
import {
  criticalThreatRedKeyframes,
  escalatingCriticalShakeKeyframes,
} from '../src/critical-presentation.ts';

const horizontalOffset = (frame) => {
  const match = /translate3d\((-?[\d.]+)px/.exec(String(frame.transform));
  return match ? Number(match[1]) : 0;
};

const maximumAbsoluteOffset = (frames) => Math.max(
  ...frames.map((frame) => Math.abs(horizontalOffset(frame))),
);

const directionChanges = (frames) => frames
  .map(horizontalOffset)
  .map((value) => Math.sign(value))
  .filter((sign) => sign !== 0)
  .reduce(
    (result, sign) => ({
      previous: sign,
      count: result.previous !== 0 && result.previous !== sign
        ? result.count + 1
        : result.count,
    }),
    { previous: 0, count: 0 },
  ).count;

test('gera tremor crítico contínuo, crescente e acelerado durante três segundos', () => {
  const frames = escalatingCriticalShakeKeyframes({
    maximumX: 30,
    maximumY: 22,
    maximumRotation: 1,
    maximumScale: 0.04,
  });

  assert.equal(frames.length, 181);
  assert.equal(frames[0].offset, 0);
  assert.equal(frames.at(-1)?.offset, 1);
  assert.ok(
    maximumAbsoluteOffset(frames.slice(-60)) >
      maximumAbsoluteOffset(frames.slice(0, 60)) * 2,
  );
  assert.ok(
    directionChanges(frames.slice(-60)) > directionChanges(frames.slice(0, 60)),
  );
});

test('intensifica progressivamente a camada vermelha da ameaça crítica', () => {
  const frames = criticalThreatRedKeyframes();
  const opacity = frames.map((frame) => Number(frame.opacity));

  assert.equal(opacity[0], 0);
  assert.equal(opacity.at(-1), 0.98);
  assert.ok(opacity.every((value, index) => index === 0 || value >= opacity[index - 1]));
});
