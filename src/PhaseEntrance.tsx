import { useLayoutEffect, useState } from 'react';
import { phaseHudOpacity, type ScenePlan } from './shared/scene';

export const PhaseHudEntrance = ({ entrance }: { entrance: ScenePlan['phaseEntrance'] }) => {
  useLayoutEffect(() => {
    const root = document.documentElement;
    let frame = 0;
    const tick = () => {
      const opacity = phaseHudOpacity(entrance, window.bossAPI.getPresentationTime());
      root.style.setProperty('--phase-hud-opacity', String(opacity));
      root.classList.toggle('phase-hud-entering', opacity < 1);
      root.classList.toggle('phase-hud-hidden', opacity === 0);
      if (opacity < 1) frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame); root.style.removeProperty('--phase-hud-opacity');
      root.classList.remove('phase-hud-entering', 'phase-hud-hidden');
    };
  }, [entrance?.phaseId, entrance?.startedAt, entrance?.visualStartedAt, entrance?.hudDelaySeconds, entrance?.hudFadeInSeconds]);
  return null;
};

export const PhaseEntrance = ({ entrance }: { entrance: ScenePlan['phaseEntrance'] }) => {
  const [opacity, setOpacity] = useState(0);
  useLayoutEffect(() => {
    if (!entrance?.visualSeconds) { setOpacity(0); return; }
    let frame = 0;
    const tick = () => {
      const remaining = Math.max(0, Math.min(1, 1 - (window.bossAPI.getPresentationTime() - (entrance.visualStartedAt ?? entrance.startedAt)) / (entrance.visualSeconds * 1000)));
      setOpacity(remaining);
      if (remaining > 0) frame = requestAnimationFrame(tick);
    };
    tick(); return () => cancelAnimationFrame(frame);
  }, [entrance?.phaseId, entrance?.startedAt, entrance?.visualStartedAt, entrance?.visualSeconds]);
  return opacity > 0 ? <div className="phase-entrance" aria-hidden="true" style={{ position: 'absolute', inset: 0, zIndex: 1, background: '#000', opacity, pointerEvents: 'none' }} /> : null;
};
