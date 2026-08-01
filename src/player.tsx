import {
  type CSSProperties,
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  BOSS_CRITICAL_IMPACT_MIN_DURATION_MS,
  BOSS_CRITICAL_THREAT_DURATION_MS,
  type BackgroundState,
  type BattleState,
  type BossState,
  type EncounterEffectsState,
  type EncounterSoundEffect,
  type EncounterSoundEffectKind,
  type EncounterVisualEffectSettings,
  type HealthEffect,
  initialEncounterEffectsState,
  isHeavyDamageEffect,
  isEncounterSoundEnabled,
  isShieldBreakEffect,
  type MusicDuckEvent,
  type MusicState,
  type SoundboardState,
  volumeToGain,
} from './shared/battle';
import {
  criticalThreatRedKeyframes,
  escalatingCriticalShakeKeyframes,
} from './critical-presentation';
import type { ScenePlan, SceneTransitionEvent } from './shared/scene';
import {
  createUnarmedAttack,
  emptyEncounterTurnState,
  formatEncounterDiceRolls,
  type AttackType,
  type EncounterRollResult,
  type EncounterTurnState,
  type PlayerCombatActionRequest,
  type PlayerHudState,
  type PlayerResourceUse,
  type PlayerResourceNotice,
} from './shared/player-combat';
import { bundledAssetUrl, statusIconUrl } from './shared/bundled-assets';
import { installDisabledControlTooltips } from './shared/disabled-controls';
import { installUndoShortcut } from './shared/undo-shortcut';
import {
  type ActiveBossStatus,
  getDamageFormulaRange,
  getActiveStatusDescription,
  getActiveStatusName,
  getStatusDefinition,
} from './shared/status';
import {
  StatusDamageValue,
  StatusRichText,
  StatusTurnValue,
} from './StatusRichText';
import { FightHistory } from './FightHistory';
import './player.css';
import './scrollbars.css';

installDisabledControlTooltips();
installUndoShortcut(() => window.bossAPI.undoLastChange());

const healthPercent = (current: number, maximum: number) =>
  Math.max(0, Math.min(100, (current / maximum) * 100));

const healthMarkers = Array.from({ length: 99 }, (_, index) => index + 1);
const shieldBreakParticles = Array.from({ length: 24 }, (_, index) => index);
const noHealthEffects: HealthEffect[] = [];
const splitStatusRows = <Item,>(items: Item[], rowSize = 10) =>
  Array.from({ length: Math.ceil(items.length / rowSize) }, (_, rowIndex) =>
    items.slice(rowIndex * rowSize, (rowIndex + 1) * rowSize),
  );

const targetedPlayerCards = (targetPlayerIds: string[] = []) => {
  const targets = new Set(targetPlayerIds);
  return [...document.querySelectorAll<HTMLElement>('.party-player-card')]
    .filter((card) => targets.has(card.dataset.playerHudId ?? ''));
};

let activePlayerCriticalThreatAnimations: Animation[] = [];
let playerCriticalThreatFallback: ReturnType<typeof setTimeout> | null = null;

const stopPlayerCriticalThreatScreen = () => {
  activePlayerCriticalThreatAnimations.forEach((animation) => animation.cancel());
  activePlayerCriticalThreatAnimations = [];
  if (playerCriticalThreatFallback) clearTimeout(playerCriticalThreatFallback);
  playerCriticalThreatFallback = null;
};

const playPlayerCriticalThreatScreen = (targetPlayerIds: string[] = []) => {
  stopPlayerCriticalThreatScreen();
  const stage = document.querySelector<HTMLElement>('.player-stage');
  const flash = document.querySelector<HTMLElement>('.critical-screen-flash');
  const timing: KeyframeAnimationOptions = {
    duration: BOSS_CRITICAL_THREAT_DURATION_MS,
    easing: 'linear',
    fill: 'forwards',
  };
  if (stage) {
    activePlayerCriticalThreatAnimations.push(stage.animate(
      escalatingCriticalShakeKeyframes({
        maximumX: 38,
        maximumY: 28,
        maximumRotation: 1.35,
        maximumScale: .08,
      }),
      timing,
    ));
  }
  if (flash) {
    activePlayerCriticalThreatAnimations.push(
      flash.animate(criticalThreatRedKeyframes(), timing),
    );
  }
  const cardFrames = escalatingCriticalShakeKeyframes({
    maximumX: 25,
    maximumY: 17,
    maximumRotation: 1.05,
    maximumScale: .045,
  }).map((frame) => {
    const progress = typeof frame.offset === 'number' ? frame.offset : 0;
    return {
      ...frame,
      filter: `saturate(${(1 + progress * 1.6).toFixed(2)}) brightness(${(1 + progress * .2).toFixed(2)})`,
      boxShadow:
        `0 0 ${(8 + progress * 48).toFixed(1)}px rgb(255 20 30 / ${(0.22 + progress * .74).toFixed(2)}), ` +
        `inset 0 0 ${(progress * 24).toFixed(1)}px rgb(154 0 10 / ${(progress * .78).toFixed(2)})`,
    } satisfies Keyframe;
  });
  targetedPlayerCards(targetPlayerIds).forEach((card) => {
    activePlayerCriticalThreatAnimations.push(card.animate(cardFrames, timing));
  });
  playerCriticalThreatFallback = setTimeout(
    stopPlayerCriticalThreatScreen,
    BOSS_CRITICAL_THREAT_DURATION_MS + 7_000,
  );
};

const playPlayerCriticalImpactScreen = (
  targetPlayerIds: string[] = [],
  requestedDuration = BOSS_CRITICAL_IMPACT_MIN_DURATION_MS,
) => {
  stopPlayerCriticalThreatScreen();
  const duration = Math.max(
    BOSS_CRITICAL_IMPACT_MIN_DURATION_MS,
    Math.min(5_000, requestedDuration),
  );
  const stage = document.querySelector<HTMLElement>('.player-stage');
  const flash = document.querySelector<HTMLElement>('.critical-screen-flash');
  stage?.animate(
    [
      { transform: 'translate3d(-18px, 11px, 0) scale(1.04) rotate(-.72deg)' },
      { transform: 'translate3d(15px, -9px, 0) scale(1.026) rotate(.54deg)', offset: .1 },
      { transform: 'translate3d(-12px, 7px, 0) scale(1.02) rotate(-.38deg)', offset: .23 },
      { transform: 'translate3d(-8px, 5px, 0) scale(1.01)', offset: .4 },
      { transform: 'translate3d(5px, -3px, 0) scale(1.006)', offset: .62 },
      { transform: 'translate3d(0, 0, 0) scale(1)' },
    ],
    {
      duration,
      easing: 'cubic-bezier(.16,.84,.24,1)',
    },
  );
  flash?.animate(
    [
      { opacity: .98 },
      { opacity: 1, offset: .08 },
      { opacity: .24, offset: .3 },
      { opacity: 0 },
    ],
    { duration, easing: 'ease-out' },
  );
  targetedPlayerCards(targetPlayerIds).forEach((card) => {
    card.animate(
      [
        { transform: 'translate3d(0, 0, 0) scale(1)', filter: 'none' },
        { transform: 'translate3d(-10px, 5px, 0) scale(1.045)', filter: 'brightness(2.1) saturate(1.9)', offset: .13 },
        { transform: 'translate3d(9px, -5px, 0) scale(1.026)', offset: .29 },
        { transform: 'translate3d(-6px, 3px, 0) scale(1.015)', offset: .48 },
        { transform: 'translate3d(3px, -2px, 0) scale(1.007)', offset: .7 },
        { transform: 'translate3d(0, 0, 0) scale(1)', filter: 'none' },
      ],
      {
        duration,
        easing: 'cubic-bezier(.16,.84,.24,1)',
      },
    );
    card.querySelector<HTMLElement>('.party-player-bar.is-health')?.animate(
      [
        { boxShadow: 'inset 0 1px 4px rgb(0 0 0 / 68%)' },
        { boxShadow: '0 0 28px rgb(255 43 37 / 98%), inset 0 0 14px rgb(255 218 144 / 90%)', offset: .16 },
        { boxShadow: 'inset 0 1px 4px rgb(0 0 0 / 68%)' },
      ],
      { duration, easing: 'ease-out' },
    );
  });
};

const playHeavyScreenImpact = (visuals: EncounterVisualEffectSettings) => {
  if (!document.querySelector('.waiting-screen.is-hidden')) return;
  const stage = document.querySelector<HTMLElement>('.player-stage');
  const hud = document.querySelector<HTMLElement>('.boss-hud.is-active');
  const flash = document.querySelector<HTMLElement>('.critical-screen-flash');
  if (visuals.screenShake) {
    stage?.animate(
      [
        { transform: 'scale(1.02) translate3d(0, 0, 0) rotate(0)' },
        { transform: 'scale(1.025) translate3d(-9px, 5px, 0) rotate(-.12deg)', offset: 0.08 },
        { transform: 'scale(1.025) translate3d(8px, -5px, 0) rotate(.11deg)', offset: 0.17 },
        { transform: 'scale(1.023) translate3d(-7px, -3px, 0) rotate(-.08deg)', offset: 0.28 },
        { transform: 'scale(1.021) translate3d(6px, 4px, 0) rotate(.07deg)', offset: 0.4 },
        { transform: 'scale(1.017) translate3d(-4px, 2px, 0) rotate(-.04deg)', offset: 0.54 },
        { transform: 'scale(1.011) translate3d(3px, -2px, 0) rotate(.02deg)', offset: 0.7 },
        { transform: 'scale(1.005) translate3d(-1px, 1px, 0) rotate(0)', offset: 0.86 },
        { transform: 'scale(1) translate3d(0, 0, 0)' },
      ],
      { duration: 1050, easing: 'cubic-bezier(.16,.82,.2,1)' },
    );
    hud?.animate(
      [
        { transform: 'translate3d(0, 0, 0) scale(1)' },
        { transform: 'translate3d(-16px, 7px, 0) scale(1.03) rotate(-.35deg)', offset: 0.07 },
        { transform: 'translate3d(14px, -8px, 0) scale(1.025) rotate(.3deg)', offset: 0.16 },
        { transform: 'translate3d(-12px, -4px, 0) scale(1.02) rotate(-.22deg)', offset: 0.27 },
        { transform: 'translate3d(10px, 5px, 0) scale(1.016) rotate(.18deg)', offset: 0.39 },
        { transform: 'translate3d(-7px, 2px, 0) scale(1.012) rotate(-.1deg)', offset: 0.54 },
        { transform: 'translate3d(5px, -2px, 0) scale(1.008) rotate(.06deg)', offset: 0.7 },
        { transform: 'translate3d(-2px, 1px, 0) scale(1.003)', offset: 0.86 },
        { transform: 'translate3d(0, 0, 0) scale(1)' },
      ],
      { duration: 1120, easing: 'cubic-bezier(.15,.8,.2,1)' },
    );
  }
  if (visuals.damageEffect) {
    hud?.animate(
      [
        { filter: 'brightness(1)' },
        { filter: 'brightness(1.4) saturate(1.28)', offset: 0.07 },
        { filter: 'brightness(1.18) saturate(1.18)', offset: 0.16 },
        { filter: 'brightness(1.12)', offset: 0.27 },
        { filter: 'brightness(1.08)', offset: 0.39 },
        { filter: 'brightness(1.04)', offset: 0.54 },
        { filter: 'brightness(1.02)', offset: 0.7 },
        { filter: 'brightness(1)', offset: 0.86 },
        { filter: 'brightness(1)' },
      ],
      { duration: 1120, easing: 'cubic-bezier(.15,.8,.2,1)' },
    );
    flash?.animate(
      [
        { opacity: 0 },
        { opacity: 0.42, offset: 0.07 },
        { opacity: 0.12, offset: 0.25 },
        { opacity: 0.3, offset: 0.39 },
        { opacity: 0.08, offset: 0.62 },
        { opacity: 0, offset: 1 },
      ],
      { duration: 980, easing: 'ease-out' },
    );
  }
};

const HealthRuler = memo(function HealthRuler() {
  return (
    <div className="health-ruler" aria-hidden="true">
      {healthMarkers.map((marker) => (
        <span
          className={
            marker % 10 === 0
              ? 'is-major'
              : marker % 5 === 0
                ? 'is-medium'
                : ''
          }
          key={marker}
          style={{ left: `${marker}%` }}
        />
      ))}
    </div>
  );
});

const PhaseHealthMarkers = memo(function PhaseHealthMarkers({
  markers,
}: {
  markers: number[];
}) {
  return markers.length > 0 ? (
    <div className="phase-health-markers" aria-hidden="true">
      {markers.map((marker) => (
        <span key={marker} style={{ left: `${marker}%` }} />
      ))}
    </div>
  ) : null;
});

type AnimatedHealthBarProps = {
  activeStatuses: BossState['activeStatuses'];
  current: number;
  maximum: number;
  phaseMarkers: number[];
  shield: number;
  effects: HealthEffect[];
  visuals: EncounterVisualEffectSettings;
};

const AnimatedHealthBar = ({
  activeStatuses,
  current,
  maximum,
  shield,
  effects,
  visuals,
  phaseMarkers,
}: AnimatedHealthBarProps) => {
  const initialPercent = healthPercent(current, maximum);
  const statusTooltipPrefix = useId();
  const healthBarRef = useRef<HTMLDivElement>(null);
  const shieldBadgeRef = useRef<HTMLDivElement>(null);
  const lastAnimatedEffectId = useRef(0);
  const previous = useRef({ current, maximum });
  const [displayPercent, setDisplayPercent] = useState(initialPercent);
  const [damageTrailPercent, setDamageTrailPercent] = useState(initialPercent);
  const [damageTrailPrimed, setDamageTrailPrimed] = useState(false);
  const [healingPreviewPercent, setHealingPreviewPercent] = useState(0);
  const [healingPreviewActive, setHealingPreviewActive] = useState(false);
  const [healingPreviewPrimed, setHealingPreviewPrimed] = useState(false);
  const [statusTooltipTarget, setStatusTooltipTarget] = useState<{
    status: ActiveBossStatus;
    anchor: HTMLElement;
  } | null>(null);
  const [statusTooltipPosition, setStatusTooltipPosition] = useState({
    left: 0,
    top: 0,
    ready: false,
  });
  const richStatusTooltipRef = useRef<HTMLSpanElement>(null);
  const {
    damageEffects,
    shieldBreakEffects,
    shieldDamageEffects,
  } = useMemo(() => {
    const nextDamageEffects: HealthEffect[] = [];
    const nextShieldBreakEffects: HealthEffect[] = [];
    const nextShieldDamageEffects: HealthEffect[] = [];
    for (const effect of effects) {
      if (effect.type === 'damage' && effect.from > effect.to) {
        nextDamageEffects.push(effect);
      }
      if (
        effect.type === 'damage' &&
        effect.shieldFrom > effect.shieldTo
      ) {
        nextShieldDamageEffects.push(effect);
      }
      if (isShieldBreakEffect(effect)) nextShieldBreakEffects.push(effect);
    }
    return {
      damageEffects: nextDamageEffects,
      shieldBreakEffects: nextShieldBreakEffects,
      shieldDamageEffects: nextShieldDamageEffects,
    };
  }, [effects]);
  const statusRows = useMemo(() => splitStatusRows(activeStatuses), [activeStatuses]);
  const showShieldBadge = shield > 0;

  useEffect(() => {
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    const animationFrames: number[] = [];
    const previousValue = previous.current;
    const nextPercent = healthPercent(current, maximum);
    const oldPercent = healthPercent(
      previousValue.current,
      previousValue.maximum,
    );

    if (previousValue.maximum !== maximum) {
      setDisplayPercent(nextPercent);
      setDamageTrailPercent(nextPercent);
      setHealingPreviewPercent(0);
      setHealingPreviewActive(false);
      setDamageTrailPrimed(false);
      setHealingPreviewPrimed(false);
    } else if (current < previousValue.current) {
      setHealingPreviewPercent(0);
      setHealingPreviewActive(false);
      setHealingPreviewPrimed(false);
      setDisplayPercent(oldPercent);
      setDamageTrailPercent((trailPercent) =>
        Math.max(trailPercent, oldPercent),
      );
      setDamageTrailPrimed(true);
      animationFrames.push(requestAnimationFrame(() => {
        setDamageTrailPrimed(false);
        setDisplayPercent(nextPercent);
      }));
      timers.push(
        setTimeout(() => setDamageTrailPercent(nextPercent), 850),
      );
    } else if (current > previousValue.current) {
      setDamageTrailPercent(oldPercent);
      setDamageTrailPrimed(false);
      setDisplayPercent(oldPercent);
      setHealingPreviewPercent(oldPercent);
      setHealingPreviewActive(true);
      setHealingPreviewPrimed(true);
      animationFrames.push(requestAnimationFrame(() => {
        setHealingPreviewPrimed(false);
        setHealingPreviewPercent(nextPercent);
      }));
      timers.push(
        setTimeout(() => setDisplayPercent(nextPercent), 560),
        setTimeout(() => setHealingPreviewActive(false), 1180),
        setTimeout(() => setHealingPreviewPercent(0), 1380),
      );
    }

    previous.current = { current, maximum };
    return () => {
      timers.forEach(clearTimeout);
      animationFrames.forEach(cancelAnimationFrame);
    };
  }, [current, maximum]);

  useEffect(() => {
    const bar = healthBarRef.current;
    if (!bar) return;

    const newEffects = effects.filter(
      (effect) => effect.id > lastAnimatedEffectId.current,
    );
    if (newEffects.length === 0) return;

    lastAnimatedEffectId.current = newEffects[newEffects.length - 1].id;
    newEffects.forEach((effect, index) => {
      const delay = index * 70;

      if (
        visuals.damageEffect &&
        effect.type === 'damage' &&
        effect.shieldFrom > effect.shieldTo
      ) {
        shieldBadgeRef.current?.animate(
          [
            { filter: 'brightness(1) drop-shadow(0 3px 4px rgba(0,0,0,.82))', transform: 'translate(0, 0) scale(1)' },
            { filter: 'brightness(1.9) drop-shadow(0 0 12px rgba(255,224,172,.95))', transform: 'translate(-3px, -2px) scale(1.12) rotate(-4deg)', offset: .2 },
            { transform: 'translate(3px, 1px) scale(.96) rotate(3deg)', offset: .42 },
            { transform: 'translate(-2px, 0) scale(1.04) rotate(-2deg)', offset: .65 },
            { filter: 'brightness(1) drop-shadow(0 3px 4px rgba(0,0,0,.82))', transform: 'translate(0, 0) scale(1)' },
          ],
          { delay, duration: 620, easing: 'cubic-bezier(.2,.75,.25,1)' },
        );
      }

      if (effect.type === 'damage') {
        const heavyDamage = isHeavyDamageEffect(effect);
        const animationOptions: KeyframeAnimationOptions = {
          delay,
          duration: heavyDamage ? 2000 : 480,
          easing: heavyDamage
            ? 'cubic-bezier(.16,.84,.24,1)'
            : 'ease-out',
        };
        if (visuals.healthBarShake) {
          bar.animate(
            heavyDamage
              ? [
                  { transform: 'translateX(0) scaleY(1)' },
                  { transform: 'translateX(-12px) scaleY(1.18) rotate(-0.35deg)', offset: 0.12 },
                  { transform: 'translateX(11px) scaleY(.9) rotate(.3deg)', offset: 0.24 },
                  { transform: 'translateX(-9px) scaleY(1.1)', offset: 0.37 },
                  { transform: 'translateX(8px) scaleY(.94)', offset: 0.5 },
                  { transform: 'translateX(-6px) scaleY(1.06)', offset: 0.63 },
                  { transform: 'translateX(4px) scaleY(.98)', offset: 0.76 },
                  { transform: 'translateX(0) scaleY(1)' },
                ]
              : [
                  { transform: 'translateX(0)' },
                  { transform: 'translateX(-4px)', offset: 0.22 },
                  { transform: 'translateX(4px)', offset: 0.44 },
                  { transform: 'translateX(-3px)', offset: 0.64 },
                  { transform: 'translateX(0)' },
                ],
            animationOptions,
          );
        }
        if (visuals.damageEffect) {
          bar.animate(
            heavyDamage
              ? [
                  { filter: 'brightness(1) saturate(1)' },
                  { filter: 'brightness(2.4) saturate(1.8)', offset: 0.12 },
                  { filter: 'brightness(1.45) saturate(1.3)', offset: 0.5 },
                  { filter: 'brightness(1) saturate(1)' },
                ]
              : [
                  { filter: 'brightness(1)' },
                  { filter: 'brightness(1.65)', offset: 0.22 },
                  { filter: 'brightness(1)' },
                ],
            animationOptions,
          );
        }
      } else if (visuals.healEffect) {
        const fullHeal = effect.intensity === 'full';
        const glowColor = fullHeal
          ? 'rgba(91,255,143,1)'
          : 'rgba(87,255,139,.9)';
        const outerGlow = fullHeal ? '34px' : '24px';
        const innerGlow = fullHeal ? '15px' : '10px';
        bar.animate(
          [
            {
              boxShadow:
                `0 0 8px ${glowColor}, 0 0 ${outerGlow} rgba(52,239,111,.78), inset 0 0 ${innerGlow} rgba(113,255,158,.62)`,
              filter: fullHeal ? 'brightness(1.32)' : 'brightness(1.18)',
            },
            {
              boxShadow:
                `0 0 10px ${glowColor}, 0 0 ${outerGlow} rgba(52,239,111,.92), inset 0 0 ${innerGlow} rgba(113,255,158,.75)`,
              filter: fullHeal ? 'brightness(1.45)' : 'brightness(1.28)',
              offset: 0.18,
            },
            {
              boxShadow:
                `0 0 8px ${glowColor}, 0 0 ${outerGlow} rgba(52,239,111,.82), inset 0 0 ${innerGlow} rgba(113,255,158,.66)`,
              filter: fullHeal ? 'brightness(1.35)' : 'brightness(1.2)',
              offset: 0.84,
            },
            {
              boxShadow:
                '0 0 0 1px rgba(0,0,0,.75), inset 0 1px 4px rgba(0,0,0,.95), 0 5px 14px rgba(0,0,0,.62)',
              filter: 'brightness(1)',
            },
          ],
          {
            delay,
            duration: fullHeal ? 1450 : 1120,
            easing: 'ease-in-out',
          },
        );
      }
    });
  }, [effects, visuals]);

  const statusTooltipStatus = statusTooltipTarget
    ? activeStatuses.find(
      ({ statusId }) => statusId === statusTooltipTarget.status.statusId,
    ) ?? null
    : null;

  const positionStatusTooltip = useCallback(() => {
    const anchor = statusTooltipTarget?.anchor;
    const tooltip = richStatusTooltipRef.current;
    if (!anchor?.isConnected || !tooltip) return;

    const viewportMargin = 8;
    const anchorGap = 8;
    const anchorRect = anchor.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const maximumLeft = Math.max(
      viewportMargin,
      window.innerWidth - tooltipRect.width - viewportMargin,
    );
    const maximumTop = Math.max(
      viewportMargin,
      window.innerHeight - tooltipRect.height - viewportMargin,
    );
    const left = Math.min(
      maximumLeft,
      Math.max(
        viewportMargin,
        anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2,
      ),
    );
    const preferredTop = anchorRect.top - tooltipRect.height - anchorGap;
    const fallbackTop = anchorRect.bottom + anchorGap;
    const top = Math.min(
      maximumTop,
      Math.max(
        viewportMargin,
        preferredTop >= viewportMargin ? preferredTop : fallbackTop,
      ),
    );

    setStatusTooltipPosition({ left, top, ready: true });
  }, [statusTooltipTarget]);

  useLayoutEffect(() => {
    if (!statusTooltipTarget) return;
    positionStatusTooltip();
  }, [positionStatusTooltip, statusTooltipStatus, statusTooltipTarget]);

  useEffect(() => {
    if (!statusTooltipTarget) return;
    const reposition = () => positionStatusTooltip();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [positionStatusTooltip, statusTooltipTarget]);

  useEffect(() => {
    if (statusTooltipTarget && !statusTooltipStatus) {
      setStatusTooltipTarget(null);
    }
  }, [statusTooltipStatus, statusTooltipTarget]);

  const showStatusTooltip = (
    status: ActiveBossStatus,
    anchor: HTMLElement,
  ) => {
    setStatusTooltipPosition((current) => ({ ...current, ready: false }));
    setStatusTooltipTarget({ status, anchor });
  };
  const hideHoveredStatusTooltip = (anchor: HTMLElement) => {
    if (document.activeElement !== anchor) setStatusTooltipTarget(null);
  };
  const hideFocusedStatusTooltip = (anchor: HTMLElement) => {
    if (!anchor.matches(':hover')) setStatusTooltipTarget(null);
  };

  const richStatusTooltip = statusTooltipTarget && statusTooltipStatus
    ? (() => {
      const definition = getStatusDefinition(statusTooltipStatus.statusId);
      if (!definition) return null;
      const statusName = getActiveStatusName(statusTooltipStatus);
      const statusDescription = getActiveStatusDescription(statusTooltipStatus);
      const damageFormula = (statusTooltipStatus.damageFormula ?? '').trim();
      const damageRange = damageFormula
        ? getDamageFormulaRange(damageFormula)
        : null;
      const turnLabel = statusTooltipStatus.turnsRemaining === 1
        ? '1 turno restante'
        : `${statusTooltipStatus.turnsRemaining} turnos restantes`;
      const tooltipId =
        `${statusTooltipPrefix}-${statusTooltipStatus.statusId}`;

      return createPortal(
        <span
          className={`boss-status-tooltip is-portal ${
            statusTooltipPosition.ready ? 'is-visible' : ''
          }`}
          id={tooltipId}
          ref={richStatusTooltipRef}
          role="tooltip"
          style={{
            left: statusTooltipPosition.left,
            top: statusTooltipPosition.top,
          }}
        >
          <span className="boss-status-tooltip-header">
            <img
              alt=""
              draggable={false}
              src={statusIconUrl(definition.iconFile)}
            />
            <strong>{statusName}</strong>
          </span>
          <span><StatusRichText text={statusDescription} /></span>
          {damageFormula && (
            <span className="boss-status-tooltip-detail">
              <span>
                Dano: <StatusDamageValue>{damageFormula}</StatusDamageValue>
              </span>
              {damageRange && (
                <span className="boss-status-damage-range">
                  (Min = <StatusDamageValue>
                    {String(damageRange.minimum)}
                  </StatusDamageValue>, Max = <StatusDamageValue>
                    {String(damageRange.maximum)}
                  </StatusDamageValue>)
                </span>
              )}
            </span>
          )}
          <span className="boss-status-tooltip-detail">
            Duração: <StatusTurnValue>{turnLabel}</StatusTurnValue>
          </span>
        </span>,
        document.body,
      );
    })()
    : null;

  return (
    <div className="health-bar-shell">
      <div
        className={`health-bar ${shield > 0 ? 'is-shielded' : ''}`}
        ref={healthBarRef}
        role="progressbar"
        aria-label="Vida do chefão"
        aria-valuemin={0}
        aria-valuemax={maximum}
        aria-valuenow={current}
      >
        <div
          className={`health-damage-trail ${damageTrailPrimed ? 'is-primed' : ''}`}
          style={{ width: `${damageTrailPercent}%` }}
        />
        <div
          className={`health-healing-preview ${
            healingPreviewActive ? 'is-active' : ''
          } ${healingPreviewPrimed ? 'is-primed' : ''}`}
          style={{ width: `${healingPreviewPercent}%` }}
        />
        <div
          className="health-bar-fill"
          style={{ width: `${displayPercent}%` }}
        />
        <div className="health-bar-highlight" />
        <HealthRuler />
        <PhaseHealthMarkers markers={phaseMarkers} />
        {effects.filter((effect) =>
          effect.type === 'damage'
            ? visuals.damageEffect
            : visuals.healEffect,
        ).map((effect) => (
          <div
            className={`health-impact is-${effect.type} ${
              effect.intensity === 'full' ? 'is-full' : ''
            } ${isHeavyDamageEffect(effect) ? 'is-heavy' : ''}`}
            key={effect.id}
          />
        ))}
      </div>
      {showShieldBadge && (
        <div className="shield-badge" ref={shieldBadgeRef} role="status" aria-label={`Escudo ${shield}`}>
          <span>{shield}</span>
        </div>
      )}
      {visuals.floatingDamageNumbers && shieldDamageEffects.map((effect, index) => (
        <b
          className="shield-damage-number"
          key={`shield-damage-${effect.id}`}
          style={{ '--shield-damage-stack': `${index * 5}px` } as CSSProperties}
        >
          −{effect.shieldFrom - effect.shieldTo}
        </b>
      ))}
      {activeStatuses.length > 0 && (
        <div
          className={`boss-status-tray ${showShieldBadge ? 'has-shield' : ''}`}
          aria-label="Condições ativas"
          role="list"
        >
          {statusRows.map((statusRow, rowIndex) => (
            <div className="boss-status-row" key={`status-row-${rowIndex}`}>
              {statusRow.map((activeStatus, statusIndex) => {
                const definition = getStatusDefinition(activeStatus.statusId);
                if (!definition) return null;

                const statusName = getActiveStatusName(activeStatus);
                const statusDescription = getActiveStatusDescription(activeStatus);
                const damageFormula = (activeStatus.damageFormula ?? '').trim();
                const turnLabel = activeStatus.turnsRemaining === 1
                  ? '1 turno restante'
                  : `${activeStatus.turnsRemaining} turnos restantes`;
                const tooltipId = `${statusTooltipPrefix}-${activeStatus.statusId}`;
                const damageLabel = damageFormula
                  ? `. Dano por turno: ${damageFormula}`
                  : '';

                return (
                  <span
                    className="boss-status-icon"
                    key={`${activeStatus.statusId}-${statusIndex}`}
                    role="listitem"
                    tabIndex={0}
                    aria-describedby={tooltipId}
                    aria-label={`${statusName}: ${statusDescription}${damageLabel}. ${turnLabel}`}
                    onBlur={(event) =>
                      hideFocusedStatusTooltip(event.currentTarget)}
                    onFocus={(event) =>
                      showStatusTooltip(activeStatus, event.currentTarget)}
                    onMouseEnter={(event) =>
                      showStatusTooltip(activeStatus, event.currentTarget)}
                    onMouseLeave={(event) =>
                      hideHoveredStatusTooltip(event.currentTarget)}
                  >
                    <img
                      alt=""
                      draggable={false}
                      src={statusIconUrl(definition.iconFile)}
                    />
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      )}
      {visuals.particles && shieldBreakEffects.map((effect) => (
        <div className="shield-break-effect" key={`shield-break-${effect.id}`} aria-hidden="true">
          {shieldBreakParticles.map((index) => <span key={index} />)}
        </div>
      ))}
      {visuals.floatingDamageNumbers && damageEffects.map((effect, index) => {
        const damage = Math.round(effect.from - effect.to);
        const impactPosition = Math.max(
          3,
          Math.min(97, healthPercent(effect.to, effect.maximum)),
        );
        return (
          <span
            className={`damage-number ${isHeavyDamageEffect(effect) ? 'is-heavy' : ''} ${effect.source?.kind === 'status' ? 'is-status' : ''}`}
            key={`damage-${effect.id}`}
            style={{
              '--damage-position': `${impactPosition}%`,
              '--damage-stack': `${index * 5}px`,
            } as CSSProperties}
          >
            {effect.source?.kind === 'status'
              ? `${effect.source.name} −${damage}`
              : `−${damage}`}
          </span>
        );
      })}
      {visuals.healthNumbers && (
        <span
          className="health-number-display"
          aria-label={`Vida atual: ${current} de ${maximum}`}
        >
          <strong>{current}</strong>
          <span aria-hidden="true">/</span>
          <span>{maximum}</span>
        </span>
      )}
      {richStatusTooltip}
    </div>
  );

};

const MusicPlayer = ({ battle }: { battle: BattleState }) => {
  const [music, setMusic] = useState<MusicState | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const muteGainNodeRef = useRef<GainNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const fadeTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fading = useRef(false);
  const duckCompleteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ducking = useRef(false);
  const activeDuckId = useRef<number | null>(null);
  const musicVolumeRef = useRef(0.8);

  useEffect(() => {
    let active = true;
    window.bossAPI.getMusicState().then((state) => {
      if (active) setMusic(state);
    });
    const unsubscribe = window.bossAPI.subscribeMusic(setMusic);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const currentTrack = music?.tracks.find(
    (track) => track.id === music.currentTrackId,
  );
  const outputMuted = Boolean(music?.muted || music?.universalMuted);

  const ensureAudioGraph = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return null;

    if (!audioContextRef.current) {
      const context = new AudioContext();
      const source = context.createMediaElementSource(audio);
      const gain = context.createGain();
      const muteGain = context.createGain();
      source.connect(gain);
      gain.connect(muteGain);
      muteGain.connect(context.destination);
      audio.volume = 1;
      audioContextRef.current = context;
      sourceNodeRef.current = source;
      gainNodeRef.current = gain;
      muteGainNodeRef.current = muteGain;
    }

    if (audioContextRef.current.state === 'suspended') {
      void audioContextRef.current.resume();
    }
    return gainNodeRef.current;
  }, []);

  const setOutputGain = useCallback((volume: number) => {
    const gain = ensureAudioGraph();
    const context = audioContextRef.current;
    if (!gain || !context) return;
    gain.gain.cancelScheduledValues(context.currentTime);
    gain.gain.setValueAtTime(volumeToGain(volume), context.currentTime);
  }, [ensureAudioGraph]);

  const setOutputMuted = useCallback((muted: boolean) => {
    ensureAudioGraph();
    const context = audioContextRef.current;
    const muteGain = muteGainNodeRef.current;
    if (!context || !muteGain) return;
    muteGain.gain.setValueAtTime(muted ? 0 : 1, context.currentTime);
  }, [ensureAudioGraph]);

  const reportProgress = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    window.bossAPI.reportMusicProgress({
      trackId: currentTrack?.id ?? null,
      currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
      duration:
        currentTrack?.duration ||
        (Number.isFinite(audio.duration) ? audio.duration : 0),
    });
  }, [currentTrack?.duration, currentTrack?.id]);

  const stopFade = useCallback(() => {
    if (fadeTimer.current) clearInterval(fadeTimer.current);
    fadeTimer.current = null;
    fading.current = false;
  }, []);

  const stopDuck = useCallback((restore = true) => {
    if (duckCompleteTimer.current) clearTimeout(duckCompleteTimer.current);
    duckCompleteTimer.current = null;
    ducking.current = false;
    activeDuckId.current = null;
    const context = audioContextRef.current;
    const gain = gainNodeRef.current;
    if (!context || !gain) return;
    gain.gain.cancelScheduledValues(context.currentTime);
    if (restore) {
      gain.gain.setValueAtTime(
        volumeToGain(musicVolumeRef.current),
        context.currentTime,
      );
    }
  }, []);

  const duckMusic = useCallback((event: MusicDuckEvent) => {
    const audio = audioRef.current;
    if (!audio || audio.paused) return;
    const gain = ensureAudioGraph();
    const context = audioContextRef.current;
    if (!gain || !context) return;
    if (event.phase === 'impact') return;
    if (event.phase === 'restore') {
      if (activeDuckId.current !== event.id) return;
      if (duckCompleteTimer.current) clearTimeout(duckCompleteTimer.current);
      const duration = Math.max(0, Math.min(5_000, event.duration));
      const now = context.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(
        volumeToGain(musicVolumeRef.current),
        now + duration / 1_000,
      );
      duckCompleteTimer.current = setTimeout(() => {
        ducking.current = false;
        activeDuckId.current = null;
        const completedAt = context.currentTime;
        gain.gain.cancelScheduledValues(completedAt);
        gain.gain.setValueAtTime(
          volumeToGain(musicVolumeRef.current),
          completedAt,
        );
      }, duration);
      return;
    }
    stopDuck(false);
    const duration = Math.max(0, Math.min(10_000, event.duration));
    const targetVolume = Math.max(0, Math.min(1, event.targetVolume ?? 0.2));
    const baseGain = volumeToGain(musicVolumeRef.current);
    const duckedGain = Math.min(baseGain, volumeToGain(targetVolume));
    const now = context.currentTime;
    ducking.current = true;
    activeDuckId.current = event.id;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(gain.gain.value, now);
    gain.gain.linearRampToValueAtTime(duckedGain, now + duration / 1_000);
  }, [ensureAudioGraph, stopDuck]);

  const fadeOut = useCallback((duration: number) => {
    const audio = audioRef.current;
    if (!audio || fading.current) return;
    if (audio.paused) {
      window.bossAPI.musicFadeoutComplete();
      return;
    }
    stopFade();
    stopDuck();
    fading.current = true;
    const gain = ensureAudioGraph();
    if (!gain) {
      fading.current = false;
      return;
    }
    const startGain = gain.gain.value;
    const startedAt = Date.now();
    fadeTimer.current = setInterval(() => {
      const progress = Math.min(1, (Date.now() - startedAt) / duration);
      gain.gain.value = startGain * (1 - progress);
      if (progress === 1) {
        stopFade();
        audio.pause();
        window.bossAPI.musicFadeoutComplete();
      }
    }, 30);
  }, [ensureAudioGraph, stopDuck, stopFade]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!currentTrack) {
      audio.removeAttribute('src');
      audio.load();
      return;
    }

    stopFade();
    stopDuck();
    audio.src = currentTrack.url;
    setOutputMuted(outputMuted);
    if (music?.isPlaying || gainNodeRef.current) {
      setOutputGain(music?.volume ?? 0.8);
    }
    audio.load();
    if (music?.isPlaying) void audio.play().catch((): void => {});
  }, [currentTrack?.id, music?.playbackVersion, setOutputGain, setOutputMuted, stopDuck, stopFade]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (music?.isPlaying) {
      stopFade();
      if (!ducking.current) setOutputGain(music.volume);
      void audio.play().catch((): void => {});
    }
    else audio.pause();
  }, [music?.isPlaying, currentTrack?.id, setOutputGain, stopFade]);

  useEffect(() => {
    setOutputMuted(outputMuted);
  }, [outputMuted, setOutputMuted]);

  useEffect(() => {
    musicVolumeRef.current = music?.volume ?? 0.8;
    const audio = audioRef.current;
    if (audio && gainNodeRef.current && !fading.current && !ducking.current) {
      setOutputGain(music?.volume ?? 0.8);
    }
  }, [music?.volume, setOutputGain]);

  useEffect(
    () => window.bossAPI.subscribeMusicFadeOut(fadeOut),
    [fadeOut],
  );

  useEffect(
    () => window.bossAPI.subscribeMusicDuck(duckMusic),
    [duckMusic],
  );

  useEffect(
    () => window.bossAPI.subscribeMusicSeek((time) => {
      const audio = audioRef.current;
      if (!audio || !Number.isFinite(time)) return;
      const maximum = currentTrack?.duration || audio.duration;
      audio.currentTime = Math.max(
        0,
        Number.isFinite(maximum) && maximum > 0
          ? Math.min(time, maximum)
          : time,
      );
      reportProgress();
    }),
    [reportProgress],
  );

  const preparedBosses = battle.bosses.filter(
    (boss) => boss.setupStatus === 'ready',
  );
  const allDefeated =
    preparedBosses.length > 0 &&
    preparedBosses.every((boss) => boss.currentHealth === 0);
  const defeatSequenceDuration = preparedBosses.some(
    (boss) => boss.currentHealth === 0 && Boolean(boss.nextAction),
  ) ? 5600 : 1800;
  useEffect(() => {
    if (!battle.battleStarted || !allDefeated || !music?.isPlaying) return;
    const timer = setTimeout(() => fadeOut(1800), defeatSequenceDuration);
    return () => clearTimeout(timer);
  }, [allDefeated, battle.battleStarted, defeatSequenceDuration, fadeOut, music?.isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (
      !audio ||
      !battle.battleStarted ||
      allDefeated ||
      !music?.isPlaying ||
      !fading.current
    ) return;

    stopFade();
    setOutputGain(music.volume);
    void audio.play().catch((): void => {});
  }, [allDefeated, battle.battleStarted, music?.isPlaying, music?.volume, setOutputGain, stopFade]);

  useEffect(() => () => {
    stopFade();
    stopDuck(false);
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    gainNodeRef.current = null;
    muteGainNodeRef.current = null;
    sourceNodeRef.current = null;
  }, [stopDuck, stopFade]);

  return (
    <audio
      className="music-player"
      crossOrigin="anonymous"
      ref={audioRef}
      loop={music?.loop ?? false}
      onEnded={() => window.bossAPI.musicTrackEnded()}
      onLoadedMetadata={reportProgress}
      onDurationChange={reportProgress}
      onTimeUpdate={reportProgress}
      onSeeked={reportProgress}
      onError={() => {
        if (music?.isPlaying) window.bossAPI.musicFadeoutComplete();
      }}
    />
  );
};

const SoundboardPlayer = () => {
  const [soundboard, setSoundboard] = useState<SoundboardState | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const audioSettingsRef = useRef({
    volume: 0.8,
    muted: false,
    loop: false,
    universalMuted: false,
  });
  const activeSounds = useRef(new Map<
    number,
    {
      index: number;
      audio: HTMLAudioElement;
      source: MediaElementAudioSourceNode;
      release: (playbackError?: boolean) => void;
    }
  >());

  const ensureAudioGraph = useCallback(() => {
    if (!audioContextRef.current) {
      const context = new AudioContext();
      const gain = context.createGain();
      gain.connect(context.destination);
      audioContextRef.current = context;
      masterGainRef.current = gain;
    }
    if (audioContextRef.current.state === 'suspended') {
      void audioContextRef.current.resume();
    }
    return {
      context: audioContextRef.current,
      gain: masterGainRef.current,
    };
  }, []);

  useEffect(() => {
    let active = true;
    const updateSoundboard = (state: SoundboardState) => {
      audioSettingsRef.current = {
        volume: state.volume,
        muted: state.muted,
        loop: state.loop,
        universalMuted: state.universalMuted,
      };
      if (active) setSoundboard(state);
    };
    window.bossAPI.getSoundboardState().then(updateSoundboard);
    const unsubscribe = window.bossAPI.subscribeSoundboard(updateSoundboard);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!soundboard) return;
    audioSettingsRef.current = {
      volume: soundboard.volume,
      muted: soundboard.muted,
      loop: soundboard.loop,
      universalMuted: soundboard.universalMuted,
    };
    const context = audioContextRef.current;
    const gain = masterGainRef.current;
    activeSounds.current.forEach(({ audio }) => {
      audio.loop = soundboard.loop;
    });
    if (!context || !gain) return;
    gain.gain.setValueAtTime(
      soundboard.muted || soundboard.universalMuted
        ? 0
        : volumeToGain(soundboard.volume),
      context.currentTime,
    );
  }, [soundboard?.loop, soundboard?.muted, soundboard?.universalMuted, soundboard?.volume]);

  useEffect(() => {
    const unsubscribe = window.bossAPI.subscribeSoundEffect((effect) => {
      const graph = ensureAudioGraph();
      if (!graph.gain) return;
      const audioSettings = audioSettingsRef.current;
      graph.gain.gain.setValueAtTime(
        audioSettings.muted || audioSettings.universalMuted
          ? 0
          : volumeToGain(audioSettings.volume),
        graph.context.currentTime,
      );
      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';
      audio.src = effect.url;
      audio.loop = audioSettings.loop;
      const source = graph.context.createMediaElementSource(audio);
      source.connect(graph.gain);

      const release = (playbackError = false) => {
        if (!activeSounds.current.has(effect.id)) return;
        activeSounds.current.delete(effect.id);
        audio.removeEventListener('ended', handleEnded);
        audio.removeEventListener('error', handleError);
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        source.disconnect();
        if (playbackError) {
          window.bossAPI.reportSoundEffectError(effect.id, effect.index);
        } else {
          window.bossAPI.soundEffectFinished(effect.id);
        }
      };
      const handleEnded = () => release(false);
      const handleError = () => release(true);
      activeSounds.current.set(effect.id, {
        index: effect.index,
        audio,
        source,
        release,
      });
      audio.addEventListener('ended', handleEnded);
      audio.addEventListener('error', handleError);
      audio.load();
      void audio.play().catch(() => release(true));
    });

    const unsubscribeStop = window.bossAPI.subscribeSoundboardStop((stop) => {
      for (const activeSound of [...activeSounds.current.values()]) {
        if (stop.index === undefined || activeSound.index === stop.index) {
          activeSound.release(false);
        }
      }
    });

    return () => {
      unsubscribe();
      unsubscribeStop();
      for (const activeSound of [...activeSounds.current.values()]) {
        activeSound.release(false);
      }
      activeSounds.current.clear();
      void audioContextRef.current?.close();
      audioContextRef.current = null;
      masterGainRef.current = null;
    };
  }, [ensureAudioGraph]);

  return null;
};

const EncounterEffectsPlayer = () => {
  const [settings, setSettings] = useState<EncounterEffectsState | null>(null);
  const settingsRef = useRef<EncounterEffectsState>(
    initialEncounterEffectsState,
  );
  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const activeSounds = useRef(new Map<
    number,
    {
      audio: HTMLAudioElement;
      kind: EncounterSoundEffectKind;
      source: MediaElementAudioSourceNode;
      release: () => void;
    }
  >());

  const ensureAudioGraph = useCallback(() => {
    if (!audioContextRef.current) {
      const context = new AudioContext();
      const gain = context.createGain();
      gain.connect(context.destination);
      audioContextRef.current = context;
      masterGainRef.current = gain;
    }
    if (audioContextRef.current.state === 'suspended') {
      void audioContextRef.current.resume();
    }
    return {
      context: audioContextRef.current,
      gain: masterGainRef.current,
    };
  }, []);

  useEffect(() => {
    let active = true;
    const updateSettings = (state: EncounterEffectsState) => {
      settingsRef.current = state;
      for (const activeSound of [...activeSounds.current.values()]) {
        if (!isEncounterSoundEnabled(state, activeSound.kind)) {
          activeSound.release();
        }
      }
      if (active) setSettings(state);
    };
    window.bossAPI.getEncounterEffectsState().then(updateSettings);
    const unsubscribe = window.bossAPI.subscribeEncounterEffects(updateSettings);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const context = audioContextRef.current;
    const gain = masterGainRef.current;
    if (!settings || !context || !gain) return;
    gain.gain.setValueAtTime(
      settings.universalMuted ? 0 : volumeToGain(settings.volume),
      context.currentTime,
    );
  }, [settings?.universalMuted, settings?.volume]);

  useEffect(() => {
    const playEffect = (effect: EncounterSoundEffect) => {
      if (!isEncounterSoundEnabled(settingsRef.current, effect.kind)) {
        window.bossAPI.encounterEffectStarted(effect.id);
        window.bossAPI.encounterEffectFinished(effect.id);
        return;
      }
      const graph = ensureAudioGraph();
      if (!graph.gain) {
        window.bossAPI.encounterEffectStarted(effect.id);
        window.bossAPI.encounterEffectFinished(effect.id);
        return;
      }
      const currentSettings = settingsRef.current;
      graph.gain.gain.setValueAtTime(
        currentSettings.universalMuted
          ? 0
          : volumeToGain(currentSettings.volume),
        graph.context.currentTime,
      );

      const audio = new Audio();
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';
      audio.src = effect.url;
      const source = graph.context.createMediaElementSource(audio);
      source.connect(graph.gain);
      let playbackStarted = false;
      const markPlaybackStarted = () => {
        if (playbackStarted) return;
        playbackStarted = true;
        window.bossAPI.encounterEffectStarted(effect.id);
      };

      const release = () => {
        markPlaybackStarted();
        if (!activeSounds.current.has(effect.id)) return;
        activeSounds.current.delete(effect.id);
        audio.removeEventListener('playing', markPlaybackStarted);
        audio.removeEventListener('ended', release);
        audio.removeEventListener('error', release);
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        source.disconnect();
        window.bossAPI.encounterEffectFinished(effect.id);
      };
      activeSounds.current.set(effect.id, {
        audio,
        kind: effect.kind,
        source,
        release,
      });
      audio.addEventListener('playing', markPlaybackStarted, { once: true });
      audio.addEventListener('ended', release);
      audio.addEventListener('error', release);
      audio.load();
      void audio.play().catch(release);
    };
    const unsubscribe = window.bossAPI.subscribeEncounterEffect(playEffect);
    const unsubscribeCriticalCue = window.bossAPI.subscribeMusicDuck((event) => {
      if (event.phase !== 'restore' && event.soundEffect) {
        playEffect(event.soundEffect);
      }
    });

    return () => {
      unsubscribe();
      unsubscribeCriticalCue();
      for (const activeSound of [...activeSounds.current.values()]) {
        activeSound.release();
      }
      activeSounds.current.clear();
      void audioContextRef.current?.close();
      audioContextRef.current = null;
      masterGainRef.current = null;
    };
  }, [ensureAudioGraph]);

  return null;
};

const formatRollResultDice = (result: EncounterRollResult) => {
  const rollMode = (result as { rollMode?: string }).rollMode;
  if (rollMode === 'reroll' && result.rolls.length >= 2) {
    const originalRoll = Math.abs(result.rolls[0]);
    const replacementRoll = Math.abs(result.rolls[1]);
    return `1d20(${originalRoll} → ${replacementRoll})`;
  }
  return formatEncounterDiceRolls(result.expression, result.rolls);
};

const RollResultStack = ({
  results,
  placement,
}: {
  results: EncounterRollResult[];
  placement: 'player' | 'boss' | 'self';
}) => {
  type ExtendedRollResult = EncounterRollResult & {
    sequence?: number;
    correlationId?: string;
    relationId?: string;
    linkedRollGroupId?: string;
  };
  type PresentedRollResult = {
    result: ExtendedRollResult;
    leaving: boolean;
  };
  const initialResults = results as ExtendedRollResult[];
  const [presentedResults, setPresentedResults] = useState<
    PresentedRollResult[]
  >(() => initialResults.map((result) => ({ result, leaving: false })));
  const visibleIds = useRef(new Set(initialResults.map(({ id }) => id)));
  const removalTimers = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );

  useEffect(() => {
    const nextResults = results as ExtendedRollResult[];
    const nextIds = new Set(nextResults.map(({ id }) => id));

    for (const result of nextResults) {
      const pendingRemoval = removalTimers.current.get(result.id);
      if (pendingRemoval) {
        clearTimeout(pendingRemoval);
        removalTimers.current.delete(result.id);
      }
    }
    for (const previousId of visibleIds.current) {
      if (nextIds.has(previousId) || removalTimers.current.has(previousId)) {
        continue;
      }
      const timer = setTimeout(() => {
        removalTimers.current.delete(previousId);
        setPresentedResults((current) =>
          current.filter(({ result }) => result.id !== previousId));
      }, 280);
      removalTimers.current.set(previousId, timer);
    }

    setPresentedResults((current) => {
      const nextById = new Map(nextResults.map((result) => [result.id, result]));
      const leaving = current
        .filter(({ result }) => !nextById.has(result.id))
        .map((entry) => ({ ...entry, leaving: true }));
      return [
        ...leaving,
        ...nextResults.map((result) => ({ result, leaving: false })),
      ];
    });
    visibleIds.current = nextIds;
  }, [results]);

  useEffect(() => () => {
    removalTimers.current.forEach(clearTimeout);
    removalTimers.current.clear();
  }, []);

  const relatedActionIds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { result } of presentedResults) {
      if (!result.actionId) continue;
      counts.set(result.actionId, (counts.get(result.actionId) ?? 0) + 1);
    }
    return new Set(
      [...counts]
        .filter(([, count]) => count > 1)
        .map(([actionId]) => actionId),
    );
  }, [presentedResults]);

  if (presentedResults.length === 0) return null;
  return (
    <div
      className={`encounter-roll-results is-${placement}`}
      aria-live="polite"
    >
      {presentedResults.map(({ result, leaving }) => {
        const explicitRelationId =
          result.correlationId ??
          result.relationId ??
          result.linkedRollGroupId;
        const relationId = explicitRelationId ??
          (result.actionId && relatedActionIds.has(result.actionId)
            ? result.actionId
            : undefined);
        return (
          <div
            className={`encounter-roll-result is-${
              result.visibility === 'hidden' || result.visibility === 'dice-only' ||
                result.visibility === 'dice-and-total'
                ? 'neutral'
                : result.outcome
            } ${result.resourceEffect ? `is-${result.resourceEffect}` : ''} ${
              leaving ? 'is-leaving' : ''
            } ${result.natural === 1 ? 'is-natural-failure' : ''} ${
              result.natural === 20 ? 'is-natural-success' : ''
            }`}
            data-relation-id={relationId}
            data-roll-id={result.id}
            key={result.id}
          >
            {Number.isInteger(result.sequence) && (
              <span
                className="encounter-roll-sequence"
                aria-label={`Resultado ${result.sequence}`}
              >
                #{result.sequence}
              </span>
            )}
            {relationId && (
              <span
                className="encounter-roll-relation"
                aria-label="Teste relacionado"
                data-app-tooltip="Teste relacionado"
              >
                ↔
              </span>
            )}
            <strong>
              {result.label}
              {result.critical && result.category === 'damage' && result.criticalMultiplier
                ? ` x${result.criticalMultiplier}`
                : ''}
              :
            </strong>
            {result.visibility === 'hidden' || result.visibility === 'dice-only' ? (
              <span className="encounter-roll-dice-only">
                <b>{formatRollResultDice(result)}</b>
                {' + ??? = ???'}
              </span>
            ) : result.visibility === 'dice-and-total' ? (
              <span className="encounter-roll-dice-only">
                <b>{formatRollResultDice(result)}</b>
                {' + ??? = '}
                <b>{result.total}</b>
              </span>
            ) : (
              <span>
                {formatRollResultDice(result)}
                {' '}{result.modifier >= 0 ? '+' : '−'} {Math.abs(result.modifier)}
                {' = '}
                <b>{result.total}</b>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};

const BossHud = memo(function BossHud({
  boss,
  bossCount,
  effects,
  phaseMarkers,
  visuals,
  turnActive,
  rollResults,
}: {
  boss: BossState;
  bossCount: number;
  effects: HealthEffect[];
  phaseMarkers: number[];
  visuals: EncounterVisualEffectSettings;
  turnActive: boolean;
  rollResults: EncounterRollResult[];
}) {
  const hudScale = 1 - (bossCount - 1) * 0.15;
  return (
    <article
      className={`boss-hud-entry ${boss.currentHealth === 0 ? 'is-defeated' : ''} ${!boss.nextAction ? 'is-actionless' : ''} ${turnActive ? 'is-turn-active' : ''}`}
      style={{ '--hud-scale': hudScale } as CSSProperties}
    >
      <div className="boss-name-anchor">
        <RollResultStack results={rollResults} placement="boss" />
        <h1 className="boss-name">{boss.bossName}</h1>
      </div>
      <AnimatedHealthBar
        activeStatuses={boss.activeStatuses}
        current={boss.currentHealth}
        effects={effects}
        maximum={boss.maxHealth}
        phaseMarkers={phaseMarkers}
        shield={boss.shield}
        visuals={visuals}
      />
      <div className="action-slot">
        <AnimatedAction text={boss.nextAction} severity={boss.actionSeverity} />
      </div>
    </article>
  );
});

const playerBarPercent = (current: number | null, maximum: number | null) =>
  current === null || maximum === null || maximum <= 0
    ? 0
    : Math.max(0, Math.min(100, (current / maximum) * 100));

const actionPointTooltip = (uses: number, unavailableThisTurn = false) =>
  `Ponto de Ação — melhora ou repete uma jogada com aprovação · ${uses}/5 usos restantes${
    unavailableThisTurn ? ' · disponível no seu turno' : ''
  }`;

const heroPointTooltip = (uses: number, unavailableThisTurn = false) =>
  `Ponto Heróico — concede vantagem extrema ou ativa um poder · ${uses}/1 uso restante${
    unavailableThisTurn ? ' · disponível no seu turno' : ''
  }`;

const PlayerHudCard = ({
  player,
  active,
  rollResults,
}: {
  player: PlayerHudState;
  active: boolean;
  rollResults: EncounterRollResult[];
}) => {
  const [expanded, setExpanded] = useState(false);
  const summary = player.summary;

  const naturalMeleeDefense = summary?.defenses.melee ?? summary?.defense ?? null;
  const naturalRangedDefense = summary?.defenses.ranged ?? summary?.defense ?? null;
  const defenseTone = (current: number | null, natural: number | null) =>
    current === null || natural === null || current === natural
      ? ''
      : current > natural ? 'is-bonus' : 'is-penalty';

  return (
    <article
      className={`party-player-card ${active ? 'is-turn-active' : ''} ${
        player.redacted ? 'is-private' : ''
      } ${player.dead ? 'is-dead' : player.stabilized ? 'is-stable' : ''}`}
      data-player-hud-id={player.id}
    >
      <RollResultStack results={rollResults} placement="player" />
      <div className="party-player-statuses">
        {player.statuses.map((status, index) => {
          const definition = getStatusDefinition(status.statusId);
          if (!definition) return null;
          return (
            <img
              src={statusIconUrl(definition.iconFile)}
              alt=""
              title={`${getActiveStatusName(status)}: ${getActiveStatusDescription(status)}`}
              key={`${status.statusId}:${index}`}
            />
          );
        })}
      </div>
      <header>
        <strong title={player.characterName}>{player.characterName}</strong>
        <button
          type="button"
          disabled={player.redacted}
          data-disabled-reason="A ficha deste jogador está privada"
          aria-expanded={expanded}
          aria-label={expanded ? 'Ocultar detalhes' : 'Mostrar detalhes'}
          onClick={() => setExpanded((visible) => !visible)}
        >
          ☰
        </button>
      </header>
      <div className="party-player-bars">
        <div className="party-player-bar is-health">
          <span
            style={{
              width: player.redacted
                ? '100%'
                : `${playerBarPercent(player.currentHealth, player.maxHealth)}%`,
            }}
          />
          <output>
            {player.redacted
              ? '???'
              : `${player.currentHealth ?? '—'}/${player.maxHealth ?? '—'}`}
          </output>
        </div>
        <div className="party-player-bar is-mana">
          <span
            style={{
              width: player.redacted
                ? '100%'
                : `${playerBarPercent(player.currentMana, player.maxMana)}%`,
            }}
          />
          <output>
            {player.redacted
              ? '???'
              : `${player.currentMana ?? '—'}/${player.maxMana ?? '—'}`}
          </output>
        </div>
      </div>
      <div className="party-player-defense">
        <strong>Defesa:</strong>
        <span className={defenseTone(player.defenseMelee, naturalMeleeDefense)}>
          <img src={bundledAssetUrl('ui/defense-melee.png')} alt="Corpo a corpo" />
          {player.redacted ? '???' : player.defenseMelee ?? '—'}
        </span>
        <span className="party-player-defense-divider" aria-hidden="true">/</span>
        <span className={defenseTone(player.defenseRanged, naturalRangedDefense)}>
          <img src={bundledAssetUrl('ui/defense-ranged.png')} alt="À distância" />
          {player.redacted ? '???' : player.defenseRanged ?? '—'}
        </span>
      </div>
      {(player.dead || (player.currentHealth !== null && player.currentHealth <= 0)) && (
        <small className={`party-player-survival-state ${player.dead ? 'is-dead' : ''}`}>
          {player.dead
            ? 'Morto'
            : player.stabilized ? 'Inconsciente · estável' : 'Inconsciente · sangrando'}
        </small>
      )}
      <div className="party-player-actions" aria-label="Ações disponíveis">
        <span
          className={player.actions.free ? 'is-ready' : ''}
          data-app-tooltip={`Ação livre ${player.actions.free ? 'disponível' : 'não disponível'}`}
          aria-label={`Ação livre ${player.actions.free ? 'disponível' : 'não disponível'}`}
          role="img"
          tabIndex={0}
        />
        <span
          className={player.actions.movement ? 'is-ready' : ''}
          data-app-tooltip={`Ação de movimento ${player.actions.movement ? 'disponível' : 'não disponível'}`}
          aria-label={`Ação de movimento ${player.actions.movement ? 'disponível' : 'não disponível'}`}
          role="img"
          tabIndex={0}
        />
        <span
          className={player.actions.standard ? 'is-ready' : ''}
          data-app-tooltip={`Ação padrão ${player.actions.standard ? 'disponível' : 'não disponível'}`}
          aria-label={`Ação padrão ${player.actions.standard ? 'disponível' : 'não disponível'}`}
          role="img"
          tabIndex={0}
        />
      </div>
      {expanded && summary && !player.redacted && (
        <section className="party-player-details">
          <p className="party-player-details-summary">
            <span>{summary.characterClass || 'Classe não informada'} · Nível {summary.level ?? '—'}</span>
            <span>PV <b>{player.currentHealth ?? '—'}/{player.maxHealth ?? '—'}</b></span>
            <span>PM <b>{player.currentMana ?? '—'}/{player.maxMana ?? '—'}</b></span>
            <span className="is-defense-summary">
              Defesa
              <img src={bundledAssetUrl('ui/defense-melee.png')} alt="Corpo a corpo" />
              <b className={defenseTone(player.defenseMelee, naturalMeleeDefense)}>
                {player.defenseMelee ?? '—'}
              </b>/
              <img src={bundledAssetUrl('ui/defense-ranged.png')} alt="À distância" />
              <b className={defenseTone(player.defenseRanged, naturalRangedDefense)}>
                {player.defenseRanged ?? '—'}
              </b>
            </span>
          </p>
          <strong>Atributos</strong>
          <div>
            {Object.entries(summary.attributes).map(([attribute, value]) => (
              <span key={attribute}>
                {attribute.toUpperCase()} <b>{value === null ? '—' : `${value >= 0 ? '+' : ''}${value}`}</b>
              </span>
            ))}
          </div>
          <strong>Movimento e carga</strong>
          <div>
            <span>Deslocamento <b>{summary.movement || '—'}</b></span>
            <span>Tamanho <b>{summary.size || '—'}</b></span>
            <span>
              Carga <b>{summary.currentLoad ?? '—'}/{summary.maxLoad ?? '—'}</b>
            </span>
          </div>
          <strong>Perícias</strong>
          <div>
            {summary.skills.map((skill) => (
              <span key={skill.id}>
                {skill.name} <b>{skill.total ?? '—'}</b>
              </span>
            ))}
          </div>
          <strong>Ataques</strong>
          <div>
            {summary.attacks.length > 0
              ? summary.attacks.map((attack, index) => (
                <span key={`${attack.name}:${index}`}>
                  {attack.name || 'Ataque'}{' '}
                  <b>
                    {[attack.attackBonus, attack.damage, attack.critical]
                      .filter(Boolean).join(' · ') || '—'}
                  </b>
                </span>
              ))
              : <span>Nenhum ataque informado</span>}
          </div>
        </section>
      )}
    </article>
  );
};

const PartyHud = ({
  players,
  turn,
}: {
  players: PlayerHudState[];
  turn: EncounterTurnState;
}) => {
  const webClient = Boolean(window.__BOSS_WEB_PLAYER__);
  const visiblePlayers = webClient
    ? players.filter(({ isSelf, summary }) => !isSelf || !summary)
    : players;
  if (visiblePlayers.length === 0) return null;
  return (
    <aside className={`party-hud ${webClient ? 'is-web-client' : ''}`}>
      {visiblePlayers.map((player) => (
        <PlayerHudCard
          player={player}
          active={turn.activeParticipantId === `player:${player.id}`}
          rollResults={(turn.rollResults ?? []).filter(
            ({ participantId }) => participantId === `player:${player.id}`,
          )}
          key={player.id}
        />
      ))}
    </aside>
  );
};

const EncounterTurnHud = ({ turn }: { turn: EncounterTurnState }) => {
  const active = turn.participants.find(
    ({ id }) => id === turn.activeParticipantId,
  );
  const canEndOwnTurn = Boolean(
    window.__BOSS_WEB_PLAYER__ && active?.kind === 'player' && active.isSelf,
  );
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showOrder, setShowOrder] = useState(false);
  const [initiativeBusyId, setInitiativeBusyId] = useState<string | null>(null);
  const pendingNpcs = !window.__BOSS_WEB_PLAYER__
    ? turn.participants.filter(
      ({ kind, initiativeRolled }) =>
        kind === 'npc' && initiativeRolled === false,
    )
    : [];
  const rollNpcInitiative = async (participantId: string) => {
    setInitiativeBusyId(participantId);
    await window.bossAPI.rollEncounterInitiative(participantId);
    setInitiativeBusyId(null);
  };
  const endTurn = async () => {
    if (!canEndOwnTurn || busy) return;
    setBusy(true);
    await window.bossAPI.advanceEncounterTurn(active?.id ?? null);
    setBusy(false);
    setConfirming(false);
  };
  return (
    <>
      <aside
        className="encounter-turn-hud"
        aria-live="polite"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setShowOrder(false);
        }}
        onFocus={() => setShowOrder(true)}
        onMouseEnter={() => setShowOrder(true)}
        onMouseLeave={() => setShowOrder(false)}
        tabIndex={0}
      >
        <span>Turno</span>
        <strong>{turn.round}</strong>
        {active && <small>{active.name}</small>}
        {showOrder && (
          <section className="encounter-turn-order-tooltip" role="tooltip">
            <b>Ordem de turnos</b>
            {turn.participants.length > 0 && (
              <ol>
                {turn.participants.map((participant) => (
                  <li key={participant.id}>
                    <span>{participant.name}</span>
                    <strong>
                      {participant.initiativeHidden
                        ? '???'
                        : participant.initiativeRolled === false
                          ? '—'
                        : participant.initiativeTotal}
                    </strong>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
        {canEndOwnTurn && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setConfirming(true)}
          >
            {busy ? 'Encerrando…' : 'Encerrar turno'}
          </button>
        )}
        {pendingNpcs.length > 0 && (
          <div className="encounter-npc-initiative">
            {pendingNpcs.map((participant) => (
              <button
                type="button"
                disabled={initiativeBusyId !== null}
                key={participant.id}
                onClick={() => void rollNpcInitiative(participant.id)}
              >
                {initiativeBusyId === participant.id
                  ? 'Rolando…'
                  : `Iniciativa: ${participant.name}`}
              </button>
            ))}
          </div>
        )}
      </aside>
      {confirming && (
        <div className="player-confirm-overlay" role="presentation">
          <section
            className="player-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="end-turn-confirm-title"
          >
            <h2 id="end-turn-confirm-title">Encerrar seu turno?</h2>
            <p>Confirme apenas depois de concluir todas as suas ações.</p>
            <div>
              <button type="button" onClick={() => setConfirming(false)}>
                Voltar
              </button>
              <button
                className="is-confirm"
                type="button"
                disabled={busy}
                onClick={() => void endTurn()}
              >
                Encerrar turno
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
};

const SelfRollResults = ({
  players,
  turn,
}: {
  players: PlayerHudState[];
  turn: EncounterTurnState;
}) => {
  if (!window.__BOSS_WEB_PLAYER__) return null;
  const self = players.find(({ isSelf }) => isSelf);
  if (!self?.summary) return null;
  const results = (
    <RollResultStack
      results={(turn.rollResults ?? []).filter(
        ({ participantId }) => participantId === `player:${self.id}`,
      )}
      placement="self"
    />
  );
  const selfHud = document.getElementById('web-player-character-hud');
  return selfHud ? createPortal(results, selfHud) : results;
};

type SelfCombatModal = 'skill' | 'attack' | 'action-point' | 'hero-point';
type TestResourceChoice =
  | 'none'
  | 'action-intervention'
  | 'action-reroll'
  | 'hero-advantage';
type CombatActionAttempt = {
  kind: 'skill' | 'attack';
  id: string;
};

const nextBrowserPaint = () => new Promise<void>((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
});

const SelfCombatControls = ({
  players,
  turn,
  bosses,
}: {
  players: PlayerHudState[];
  turn: EncounterTurnState;
  bosses: BossState[];
}) => {
  const self = players.find(({ isSelf }) => isSelf);
  const summary = self?.summary;
  const unarmedAttack = useMemo(
    () => summary ? createUnarmedAttack(summary) : null,
    [summary],
  );
  const unarmedStrikeEnabled = self?.unarmedStrikeEnabled !== false;
  const incapacitated = Boolean(self && (self.dead || (self.currentHealth ?? 1) <= 0));
  const bleedingAllies = players.filter((player) =>
    !player.isSelf &&
    player.faction === 'players' &&
    !player.dead &&
    player.statuses.some(({ statusId }) => statusId === 'sangrando')
  );
  const cureSkillId = summary?.skills.find(
    ({ id, name }) => id === '070' || name.toLocaleLowerCase('pt-BR') === 'cura',
  )?.id ?? '';
  const active = Boolean(
    self &&
    turn.started &&
    turn.activeParticipantId === `player:${self.id}`,
  );
  const selfParticipant = self
    ? turn.participants.find(({ id }) => id === `player:${self.id}`)
    : null;
  const initiativePending = Boolean(
    selfParticipant?.initiativeRolled === false,
  );
  const initiativeSkillId = summary?.skills.find((skill) =>
    `${skill.id} ${skill.name}`.toLocaleLowerCase('pt-BR').includes('iniciativa')
  )?.id ?? '';
  const [modal, setModal] = useState<SelfCombatModal | null>(null);
  const [skillId, setSkillId] = useState('');
  const [attackIndex, setAttackIndex] = useState(0);
  const [targetBossId, setTargetBossId] = useState('');
  const [damageFormula, setDamageFormula] = useState('');
  const [resource, setResource] = useState<TestResourceChoice>('none');
  const [attackType, setAttackType] = useState<AttackType>(() =>
    window.localStorage.getItem('bossbar.player.attack-type') === 'ranged'
      ? 'ranged'
      : 'melee',
  );
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [linkToPreviousRoll, setLinkToPreviousRoll] = useState(false);
  const [stabilizeTargetId, setStabilizeTargetId] = useState('');
  const actionAttemptRef = useRef<CombatActionAttempt | null>(null);
  const previousRollResult = turn.rollResults.at(-1);
  const previousRollCorrelationId = previousRollResult
    ? previousRollResult.correlationId ??
      previousRollResult.actionId ??
      previousRollResult.id
    : undefined;

  useEffect(() => {
    window.localStorage.setItem('bossbar.player.attack-type', attackType);
  }, [attackType]);

  useEffect(() => {
    if (!summary) return;
    setSkillId((current) =>
      initiativePending && initiativeSkillId
        ? initiativeSkillId
        : current || summary.skills[0]?.id || '');
    setAttackIndex((current) => {
      if (current === -1 && unarmedStrikeEnabled) return -1;
      if (summary.attacks.length === 0) {
        return unarmedStrikeEnabled ? -1 : 0;
      }
      return Math.min(Math.max(0, current), summary.attacks.length - 1);
    });
  }, [
    initiativePending,
    initiativeSkillId,
    summary,
    unarmedStrikeEnabled,
  ]);

  useEffect(() => {
    if (attackIndex === -1 && unarmedAttack) {
      setDamageFormula(unarmedAttack.damageFormula);
      setAttackType('melee');
      return;
    }
    const attack = summary?.attacks[attackIndex];
    if (attack?.damage) setDamageFormula(attack.damage);
  }, [attackIndex, summary, unarmedAttack]);

  useEffect(() => {
    if (
      targetBossId &&
      bosses.some(({ id, currentHealth }) =>
        id === targetBossId && currentHealth > 0)
    ) return;
    setTargetBossId(
      bosses.find(({ currentHealth }) => currentHealth > 0)?.id ?? '',
    );
  }, [bosses, targetBossId]);

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(''), 5_000);
    return () => clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    const attempt = actionAttemptRef.current;
    if (
      attempt &&
      turn.rollResults.some(({ actionId }) => actionId === attempt.id)
    ) {
      actionAttemptRef.current = null;
    }
  }, [turn.rollResults]);

  if (!window.__BOSS_WEB_PLAYER__ || !self || !summary) return null;

  const resourceCounts = self as PlayerHudState & {
    actionPoints?: number | null;
    heroPoints?: number | null;
  };
  const actionPoints = typeof resourceCounts.actionPoints === 'number'
    ? Math.max(0, Math.min(5, Math.trunc(resourceCounts.actionPoints)))
    : self.actionPointAvailable ? 1 : 0;
  const heroPoints = typeof resourceCounts.heroPoints === 'number'
    ? Math.max(0, Math.min(1, Math.trunc(resourceCounts.heroPoints)))
    : self.heroPointAvailable ? 1 : 0;

  const combatResource = (): PlayerResourceUse => {
    if (resource === 'action-intervention') {
      return { kind: 'action-point', ability: 'intervention' };
    }
    if (resource === 'action-reroll') {
      return { kind: 'action-point', ability: 'reroll' };
    }
    if (resource === 'hero-advantage') {
      return { kind: 'hero-point', ability: 'extreme-advantage' };
    }
    return null;
  };

  const submit = async () => {
    if (busy) return;
    const rollingInitiative =
      modal === 'skill' &&
      initiativePending &&
      Boolean(initiativeSkillId) &&
      skillId === initiativeSkillId;
    if (!active && !rollingInitiative) return;
    if (rollingInitiative) {
      setBusy(true);
      setModal(null);
      actionAttemptRef.current = null;
      await nextBrowserPaint();
      const result = await window.bossAPI.rollEncounterInitiative(
        undefined,
        resource === 'hero-advantage',
      );
      setFeedback(
        result.ok
          ? ''
          : result.error ?? 'Não foi possível rolar a iniciativa.',
      );
      setBusy(false);
      return;
    }
    let request: PlayerCombatActionRequest | null = null;
    if (modal === 'skill' && skillId) {
      const attempt = actionAttemptRef.current?.kind === 'skill'
        ? actionAttemptRef.current
        : { kind: 'skill' as const, id: crypto.randomUUID() };
      actionAttemptRef.current = attempt;
      request = skillId === cureSkillId && stabilizeTargetId
        ? {
          kind: 'stabilize',
          targetPlayerId: stabilizeTargetId,
          actionId: attempt.id,
          ...(linkToPreviousRoll && previousRollCorrelationId
            ? { correlationId: previousRollCorrelationId }
            : {}),
        }
        : {
          kind: 'skill',
          skillId,
          resource: combatResource(),
          actionId: attempt.id,
          ...(linkToPreviousRoll && previousRollCorrelationId
            ? { correlationId: previousRollCorrelationId }
            : {}),
        };
    } else if (modal === 'attack' && targetBossId) {
      const attempt = actionAttemptRef.current?.kind === 'attack'
        ? actionAttemptRef.current
        : { kind: 'attack' as const, id: crypto.randomUUID() };
      actionAttemptRef.current = attempt;
      request = {
        kind: 'attack',
        attackIndex: attackIndex >= 0 ? attackIndex : undefined,
        attackSource: attackIndex === -1
          ? { kind: 'unarmed' }
          : { kind: 'sheet', attackIndex },
        attackType: attackIndex === -1 ? 'melee' : attackType,
        targetBossId,
        damageFormula,
        resource: combatResource(),
        actionId: attempt.id,
        ...(linkToPreviousRoll && previousRollCorrelationId
          ? { correlationId: previousRollCorrelationId }
          : {}),
      };
    } else if (modal === 'action-point') {
      const ability = resource === 'action-intervention'
        ? 'protection'
        : 'recovery';
      request = { kind: 'resource', resource: 'action-point', ability };
    } else if (modal === 'hero-point') {
      request = {
        kind: 'resource',
        resource: 'hero-point',
        ability: 'activate-power',
      };
    }
    if (!request) return;
    setBusy(true);
    setModal(null);
    await nextBrowserPaint();
    const result = await window.bossAPI.requestPlayerCombatAction(request);
    if (result.ok && !result.pendingApproval) {
      actionAttemptRef.current = null;
    }
    if (result.ok) setLinkToPreviousRoll(false);
    const isTestAction = request.kind === 'skill' || request.kind === 'attack';
    setFeedback(
      result.pendingApproval
        ? ''
        : result.ok
          ? isTestAction ? '' : 'Ação concluída.'
          : result.error ?? 'Não foi possível realizar a ação.',
    );
    setBusy(false);
  };

  const openTestModal = (next: 'skill' | 'attack') => {
    if (!active && !(next === 'skill' && initiativePending)) {
      setFeedback('Aguarde o seu turno para realizar testes.');
      return;
    }
    setResource('none');
    setStabilizeTargetId('');
    setLinkToPreviousRoll(false);
    if (next === 'skill' && initiativePending && initiativeSkillId) {
      setSkillId(initiativeSkillId);
    }
    if (actionAttemptRef.current?.kind !== next) {
      actionAttemptRef.current = {
        kind: next,
        id: crypto.randomUUID(),
      };
    }
    setModal(next);
  };

  const cancelModal = () => {
    if (modal === 'skill' || modal === 'attack') {
      actionAttemptRef.current = null;
    }
    setLinkToPreviousRoll(false);
    setModal(null);
  };

  const hudControls = (
    <div className="self-combat-shortcuts" aria-label="Ações e recursos">
      <button
        className={initiativePending ? 'is-initiative-pending' : undefined}
        type="button"
        data-app-tooltip={
          initiativePending
            ? 'Rodar iniciativa'
            : active ? 'Teste de perícia' : 'Disponível no seu turno'
        }
        aria-label="Teste de perícia"
        onClick={() => openTestModal('skill')}
      >
        🎲
      </button>
      <button
        type="button"
        data-app-tooltip={
          !active
            ? 'Disponível no seu turno'
            : self.actions.standard ? 'Combate' : 'Consultar ataques disponíveis'
        }
        aria-label="Combate"
        onClick={() => openTestModal('attack')}
      >
        ⚔
      </button>
      <button
        className={`is-resource is-action-point ${
          active && actionPoints > 0 ? 'is-turn-available' : ''
        }`}
        type="button"
        style={{
          '--player-resource-image':
            `url("${bundledAssetUrl('player-resource-points.png')}")`,
        } as CSSProperties}
        disabled={actionPoints <= 0 || !active || incapacitated}
        data-app-tooltip={actionPointTooltip(
          actionPoints,
          !active && actionPoints > 0,
        )}
        aria-label={`Ponto de Ação, ${actionPoints} de 5 usos restantes`}
        onClick={() => {
          actionAttemptRef.current = null;
          setResource('action-intervention');
          setModal('action-point');
        }}
      />
      <button
        className={`is-resource is-hero-point ${
          active && heroPoints > 0 ? 'is-turn-available' : ''
        }`}
        type="button"
        style={{
          '--player-resource-image':
            `url("${bundledAssetUrl('player-resource-points.png')}")`,
        } as CSSProperties}
        disabled={heroPoints <= 0 || !active || incapacitated}
        data-app-tooltip={heroPointTooltip(
          heroPoints,
          !active && heroPoints > 0,
        )}
        aria-label={`Ponto Heróico, ${heroPoints} de 1 uso restante`}
        onClick={() => {
          actionAttemptRef.current = null;
          setModal('hero-point');
        }}
      />
    </div>
  );

  const feedbackNotice = feedback ? (
    <button
      className="self-combat-feedback"
      type="button"
      role="status"
      aria-live="polite"
      onClick={() => setFeedback('')}
    >
      {feedback}
    </button>
  ) : null;

  const modalLayer = modal ? (
    <div className="player-combat-modal-layer" role="presentation">
      <section
        className={`player-combat-modal ${modal === 'skill' ? 'is-skill-table' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="player-combat-modal-title"
      >
        <header>
          <h2 id="player-combat-modal-title">
            {modal === 'skill'
              ? 'Teste de perícia'
              : modal === 'attack'
                ? 'Realizar ataque'
                : modal === 'action-point'
                  ? 'Ponto de Ação'
                  : 'Ponto Heróico'}
          </h2>
          <button type="button" aria-label="Fechar" onClick={cancelModal}>
            ×
          </button>
        </header>
        {modal === 'skill' && (
          <div
            className={`player-skill-table ${
              initiativePending ? 'is-initiative-pending' : ''
            }`}
            aria-label="Perícias disponíveis"
          >
            {summary.skills.map((skill) => {
              const unavailable =
                initiativePending && skill.id !== initiativeSkillId;
              const canStabilize =
                skill.id === cureSkillId &&
                bleedingAllies.length > 0 &&
                self.actions.standard &&
                !incapacitated;
              return (
                <button
                  className={`${skillId === skill.id ? 'is-selected' : ''} ${
                    skill.id === initiativeSkillId ? 'is-initiative' : ''
                  } ${canStabilize ? 'is-stabilize-available' : ''}`}
                  type="button"
                  disabled={unavailable}
                  data-disabled-reason="Role Iniciativa antes de começar o encontro"
                  aria-pressed={skillId === skill.id}
                  onClick={() => {
                    setSkillId(skill.id);
                    setStabilizeTargetId(
                      canStabilize ? bleedingAllies[0]?.id ?? '' : '',
                    );
                  }}
                  key={skill.id}
                >
                  <span>{skill.name}</span>
                  <strong>
                    {(skill.total ?? 0) >= 0 ? '+' : ''}{skill.total ?? 0}
                  </strong>
                </button>
              );
            })}
          </div>
        )}
        {modal === 'skill' && skillId === cureSkillId && bleedingAllies.length > 0 && (
          <fieldset className="player-stabilize-choice">
            <legend>Primeiros socorros</legend>
            <p>Usar uma ação padrão e fazer Cura CD 15 para estabilizar?</p>
            <select
              value={stabilizeTargetId}
              onChange={(event) => setStabilizeTargetId(event.currentTarget.value)}
            >
              <option value="">Apenas testar Cura</option>
              {bleedingAllies.map((player) => (
                <option value={player.id} key={player.id}>
                  Estabilizar {player.characterName}
                </option>
              ))}
            </select>
          </fieldset>
        )}
        {modal === 'attack' && (
          <>
            {!self.actions.standard && (
              <p className="player-combat-unavailable-notice">
                Sua ação padrão já foi usada. Você pode consultar o arsenal,
                mas não atacar neste turno.
              </p>
            )}
            <label>
              <span>Arma ou ataque</span>
              <select
                value={attackIndex}
                onChange={(event) => setAttackIndex(Number(event.currentTarget.value))}
              >
                {unarmedStrikeEnabled && (
                  <option value={-1}>Punhos</option>
                )}
                {summary.attacks.map((attack, index) => (
                  <option value={index} key={`${attack.name}:${index}`}>
                    {attack.name || `Ataque ${index + 1}`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Alvo</span>
              <select
                value={targetBossId}
                onChange={(event) => setTargetBossId(event.currentTarget.value)}
              >
                {bosses
                  .filter(({ currentHealth }) => currentHealth > 0)
                  .map((boss) => (
                    <option value={boss.id} key={boss.id}>{boss.bossName}</option>
                  ))}
              </select>
            </label>
            <label>
              <span>Dados de dano</span>
              <input
                type="text"
                value={damageFormula}
                maxLength={80}
                disabled={attackIndex === -1}
                data-disabled-reason="Os dados de Punhos seguem a ficha e as regras do sistema"
                placeholder="Ex.: 1d8 + 4"
                onChange={(event) => setDamageFormula(event.currentTarget.value)}
              />
            </label>
            <fieldset className="player-combat-attack-type">
              <legend>Tipo do ataque</legend>
              <label>
                <input
                  type="radio"
                  name="player-attack-type"
                  checked={attackType === 'melee'}
                  onChange={() => setAttackType('melee')}
                />
                Corpo a corpo
              </label>
              <label>
                <input
                  type="radio"
                  name="player-attack-type"
                  checked={attackType === 'ranged'}
                  disabled={attackIndex === -1}
                  data-disabled-reason="Punhos são um ataque corpo a corpo"
                  onChange={() => setAttackType('ranged')}
                />
                À distância
              </label>
            </fieldset>
          </>
        )}
        {(modal === 'attack' || modal === 'skill') && (
          <label>
            <span>Recurso opcional</span>
            <select
              value={resource}
              onChange={(event) =>
                setResource(event.currentTarget.value as TestResourceChoice)}
            >
              <option value="none">Nenhum</option>
              <option
                value="action-intervention"
                disabled={initiativePending || actionPoints <= 0}
              >
                Ponto de Ação · Intervenção (+1d6)
              </option>
              <option
                value="action-reroll"
                disabled={initiativePending || actionPoints <= 0}
              >
                Ponto de Ação · Rolar novamente
              </option>
              <option
                value="hero-advantage"
                disabled={heroPoints <= 0}
              >
                Ponto Heróico · Extrema vantagem
              </option>
            </select>
          </label>
        )}
        {(modal === 'skill' || modal === 'attack') &&
          turn.started &&
          previousRollResult && (
            <label className="player-combat-correlation">
              <input
                type="checkbox"
                checked={linkToPreviousRoll}
                onChange={(event) =>
                  setLinkToPreviousRoll(event.currentTarget.checked)}
              />
              <span>
                Vincular ao último teste
                <small>
                  {Number.isInteger(previousRollResult.sequence)
                    ? `#${previousRollResult.sequence} · `
                    : ''}
                  {previousRollResult.label}
                </small>
              </span>
            </label>
          )}
        {modal === 'action-point' && (
          <fieldset className="player-resource-options">
            <legend>Escolha o benefício</legend>
            <label>
              <input
                type="radio"
                name="action-point-ability"
                checked={resource === 'action-intervention'}
                onChange={() => setResource('action-intervention')}
              />
              Proteção · +1d6 na Defesa até seu próximo turno
            </label>
            <label>
              <input
                type="radio"
                name="action-point-ability"
                checked={resource === 'action-reroll'}
                onChange={() => setResource('action-reroll')}
              />
              Recuperação · recupera PV e PM conforme o patamar
            </label>
          </fieldset>
        )}
        {modal === 'hero-point' && (
          <p className="player-resource-narrative">
            Consuma o Ponto Heróico para ativar narrativamente um poder ou
            habilidade. Nenhuma rolagem será feita.
          </p>
        )}
        <footer>
          <button type="button" onClick={cancelModal}>Cancelar</button>
          <button
            className="is-confirm"
            type="button"
            disabled={
              busy ||
              (modal === 'skill' && !skillId) ||
              (modal === 'attack' && (
                !self.actions.standard ||
                (summary.attacks.length === 0 && !unarmedStrikeEnabled) ||
                !targetBossId ||
                !damageFormula.trim()
              ))
            }
            onClick={() => void submit()}
          >
            {modal === 'action-point'
              ? 'Solicitar ao mestre'
              : modal === 'hero-point'
                ? 'Consumir ponto'
                : 'Rolar'}
          </button>
        </footer>
      </section>
    </div>
  ) : null;

  const selfHud = document.getElementById('web-player-character-hud');
  return (
    <>
      {selfHud ? createPortal(hudControls, selfHud) : hudControls}
      {feedbackNotice && createPortal(feedbackNotice, document.body)}
      {modalLayer && createPortal(modalLayer, document.body)}
    </>
  );
};

type AnimatedActionProps = {
  text: string;
  severity: 'normal' | 'grave';
};

const AnimatedAction = ({ text, severity }: AnimatedActionProps) => {
  const [renderedText, setRenderedText] = useState(text);
  const [renderedSeverity, setRenderedSeverity] = useState(severity);
  const [phase, setPhase] = useState<
    'visible' | 'leaving' | 'entering' | 'hidden'
  >(text ? 'visible' : 'hidden');
  const [containerPhase, setContainerPhase] = useState<
    'visible' | 'leaving' | 'entering' | 'hidden'
  >(
    text ? 'visible' : 'hidden',
  );

  useEffect(() => {
    if (text === renderedText && severity === renderedSeverity) return;

    let changeTimer: ReturnType<typeof setTimeout> | undefined;
    let visibleTimer: ReturnType<typeof setTimeout> | undefined;

    if (!text) {
      setPhase('leaving');
      setContainerPhase('leaving');
      changeTimer = setTimeout(() => {
        setRenderedText('');
        setRenderedSeverity('normal');
        setPhase('hidden');
        setContainerPhase('hidden');
      }, 300);
      return () => {
        if (changeTimer) clearTimeout(changeTimer);
      };
    }

    if (!renderedText) {
      setRenderedText(text);
      setRenderedSeverity(severity);
      setPhase('entering');
      setContainerPhase('entering');
      visibleTimer = setTimeout(() => {
        setPhase('visible');
        setContainerPhase('visible');
      }, 30);
      return () => {
        if (visibleTimer) clearTimeout(visibleTimer);
      };
    }

    setPhase('leaving');
    setContainerPhase('visible');
    changeTimer = setTimeout(() => {
      setRenderedText(text);
      setRenderedSeverity(severity);
      setPhase('entering');
      visibleTimer = setTimeout(() => setPhase('visible'), 30);
    }, 260);

    return () => {
      if (changeTimer) clearTimeout(changeTimer);
      if (visibleTimer) clearTimeout(visibleTimer);
    };
  }, [text, severity]);

  return (
    <div className={`action-warning action-${containerPhase} ${renderedSeverity === 'grave' ? 'is-grave' : ''}`}>
      <span className="telegraph-label">Preparem-se</span>
      <span className="action-divider" aria-hidden="true" />
      <p className={`action-description is-${phase}`}>{renderedText}</p>
    </div>
  );
};

const SceneTransitionPlayer = () => {
  const [effect, setEffect] = useState<SceneTransitionEvent | null>(null);
  const universalMuted = useRef(false);

  useEffect(() => {
    let active = true;
    const audioContext = new AudioContext();
    window.bossAPI.getMusicState().then((state) => {
      if (active) universalMuted.current = state.universalMuted;
    });
    const unsubscribeMusic = window.bossAPI.subscribeMusic((state) => {
      universalMuted.current = state.universalMuted;
    });
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const audios = new Set<HTMLAudioElement>();
    const audioNodes = new Map<HTMLAudioElement, {
      source: MediaElementAudioSourceNode;
      gain: GainNode;
    }>();
    let transitionSequence = 0;

    const releaseAudio = (audio: HTMLAudioElement) => {
      const nodes = audioNodes.get(audio);
      audios.delete(audio);
      audioNodes.delete(audio);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      nodes?.source.disconnect();
      nodes?.gain.disconnect();
    };
    const clearActiveTransitionMedia = () => {
      timers.forEach(clearTimeout);
      timers.clear();
      audios.forEach((audio) => {
        releaseAudio(audio);
      });
      audios.clear();
      audioNodes.clear();
    };
    const showTransition = (
      nextEffect: SceneTransitionEvent,
      sequence: number,
      preparedAudio: HTMLAudioElement | null,
    ) => {
      if (!active || sequence !== transitionSequence) {
        if (preparedAudio) releaseAudio(preparedAudio);
        return;
      }
      setEffect(nextEffect.visual ? nextEffect : null);
      if (preparedAudio) {
        const soundTimer = setTimeout(() => {
          timers.delete(soundTimer);
          if (!active || sequence !== transitionSequence) {
            releaseAudio(preparedAudio);
            return;
          }
          if (audioContext.state === 'suspended') void audioContext.resume();
          void preparedAudio.play().catch(() => releaseAudio(preparedAudio));
        }, nextEffect.soundDelayMs);
        timers.add(soundTimer);
      }
      if (nextEffect.kind === 'fade' || nextEffect.stage === 'release') {
        const timer = setTimeout(() => {
          timers.delete(timer);
          setEffect((current) => current?.id === nextEffect.id ? null : current);
        }, nextEffect.durationMs + 80);
        timers.add(timer);
      }
    };
    const unsubscribeTransition = window.bossAPI.subscribeSceneTransition((nextEffect) => {
      transitionSequence += 1;
      const sequence = transitionSequence;
      clearActiveTransitionMedia();
      const requiresSound = nextEffect.stage === 'enter' &&
        Boolean(nextEffect.soundUrl) &&
        !nextEffect.soundMuted &&
        !universalMuted.current;
      if (!requiresSound || !nextEffect.soundUrl) {
        showTransition(nextEffect, sequence, null);
        return;
      }

      const audio = new Audio();
      audios.add(audio);
      audio.crossOrigin = 'anonymous';
      audio.preload = 'auto';
      audio.volume = 1;
      audio.loop = nextEffect.soundLoop;
      const source = audioContext.createMediaElementSource(audio);
      const gain = audioContext.createGain();
      gain.gain.setValueAtTime(
        volumeToGain(nextEffect.soundVolume),
        audioContext.currentTime,
      );
      source.connect(gain);
      gain.connect(audioContext.destination);
      audioNodes.set(audio, { source, gain });
      const loadTimer = setTimeout(() => {
        timers.delete(loadTimer);
        handleError();
      }, 12_000);
      timers.add(loadTimer);
      const handleReady = () => {
        clearTimeout(loadTimer);
        timers.delete(loadTimer);
        audio.removeEventListener('loadeddata', handleReady);
        audio.removeEventListener('error', handleError);
        const release = () => releaseAudio(audio);
        audio.addEventListener('ended', release, { once: true });
        audio.addEventListener('error', release, { once: true });
        showTransition(nextEffect, sequence, audio);
      };
      const handleError = () => {
        clearTimeout(loadTimer);
        timers.delete(loadTimer);
        audio.removeEventListener('loadeddata', handleReady);
        audio.removeEventListener('error', handleError);
        releaseAudio(audio);
        if (sequence === transitionSequence) {
          console.warn('A transição foi retida porque seu áudio não pôde ser carregado.');
        }
      };
      audio.addEventListener('loadeddata', handleReady, { once: true });
      audio.addEventListener('error', handleError, { once: true });
      audio.src = nextEffect.soundUrl;
      audio.load();
    });
    return () => {
      active = false;
      transitionSequence += 1;
      unsubscribeMusic();
      unsubscribeTransition();
      clearActiveTransitionMedia();
      void audioContext.close();
    };
  }, []);

  return effect ? (
    <div
      className={`scene-transition scene-transition-${effect.kind}`}
      data-stage={effect.stage}
      key={effect.id}
      style={{ '--scene-transition-duration': `${effect.durationMs}ms` } as CSSProperties}
      aria-hidden="true"
    >
    </div>
  ) : null;
};

const PlayerApp = () => {
  const [state, setState] = useState<BattleState | null>(null);
  const [playerHuds, setPlayerHuds] = useState<PlayerHudState[]>([]);
  const [turnState, setTurnState] = useState<EncounterTurnState>(
    emptyEncounterTurnState,
  );
  const [resourceNotices, setResourceNotices] = useState<PlayerResourceNotice[]>(
    [],
  );
  const [encounterEffects, setEncounterEffects] = useState(
    initialEncounterEffectsState,
  );
  const [scenePlan, setScenePlan] = useState<ScenePlan | null>(null);
  const encounterEffectsRef = useRef(initialEncounterEffectsState);
  const [background, setBackground] = useState<BackgroundState>({
    url: null,
    name: null,
    mediaType: null,
  });
  const [backgroundReady, setBackgroundReady] = useState(false);
  const [healthEffects, setHealthEffects] = useState<
    Record<string, HealthEffect[]>
  >({});
  const [hiddenDefeatedBosses, setHiddenDefeatedBosses] = useState<Set<string>>(
    () => new Set(),
  );
  const defeatedRemovalTimers = useRef(
    new Map<string, ReturnType<typeof setTimeout>>(),
  );
  const readySent = useRef(false);
  useEffect(() => {
    let active = true;
    window.bossAPI.getState().then((initialState) => {
      if (active) setState(initialState);
    });

    const unsubscribe = window.bossAPI.subscribe(setState);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    return window.bossAPI.subscribeMusicDuck((event) => {
      if (event.phase === 'duck') {
        playPlayerCriticalThreatScreen(event.targetPlayerIds);
      } else if (event.phase === 'impact') {
        playPlayerCriticalImpactScreen(event.targetPlayerIds, event.duration);
      } else {
        stopPlayerCriticalThreatScreen();
      }
    });
  }, []);

  useEffect(() => {
    if (!window.bossAPI.subscribePlayerResourceNotice) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const unsubscribe = window.bossAPI.subscribePlayerResourceNotice((notice) => {
      setResourceNotices((current) => [
        ...current.filter(({ id }) => id !== notice.id),
        notice,
      ].slice(-4));
      if (notice.persistent) return;
      const timer = setTimeout(() => {
        setResourceNotices((current) =>
          current.filter(({ id }) => id !== notice.id));
        timers.delete(timer);
      }, 5_000);
      timers.add(timer);
    });
    return () => {
      unsubscribe();
      timers.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let receivedSubscriptionUpdate = false;
    const unsubscribe = window.bossAPI.subscribePlayerHuds((nextState) => {
      receivedSubscriptionUpdate = true;
      if (active) setPlayerHuds(nextState);
    });
    window.bossAPI.getPlayerHuds().then((nextState) => {
      if (active && !receivedSubscriptionUpdate) setPlayerHuds(nextState);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    let receivedSubscriptionUpdate = false;
    const unsubscribe = window.bossAPI.subscribeEncounterTurn((nextState) => {
      receivedSubscriptionUpdate = true;
      if (active) setTurnState(nextState);
    });
    window.bossAPI.getEncounterTurnState().then((nextState) => {
      if (active && !receivedSubscriptionUpdate) setTurnState(nextState);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    window.bossAPI.getScenePlan().then((nextPlan) => {
      if (active) setScenePlan(nextPlan);
    });
    const unsubscribe = window.bossAPI.subscribeScenePlan((nextPlan) => {
      if (active) setScenePlan(nextPlan);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    const updateEncounterEffects = (nextState: EncounterEffectsState) => {
      encounterEffectsRef.current = nextState;
      if (active) setEncounterEffects(nextState);
    };
    window.bossAPI.getEncounterEffectsState().then(updateEncounterEffects);
    const unsubscribe = window.bossAPI.subscribeEncounterEffects(
      updateEncounterEffects,
    );
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!state) return;
    const preparedBosses = state.bosses.filter(
      (boss) => boss.setupStatus === 'ready',
    );
    const hasLivingBoss = preparedBosses.some((boss) => boss.currentHealth > 0);

    setHiddenDefeatedBosses((hidden) => {
      const next = new Set(
        [...hidden].filter((id) =>
          preparedBosses.some((boss) => boss.id === id && boss.currentHealth === 0),
        ),
      );
      return next.size === hidden.size && [...next].every((id) => hidden.has(id))
        ? hidden
        : next;
    });

    for (const [bossId, timer] of defeatedRemovalTimers.current) {
      const boss = preparedBosses.find((item) => item.id === bossId);
      if (!boss || boss.currentHealth > 0 || !hasLivingBoss) {
        clearTimeout(timer);
        defeatedRemovalTimers.current.delete(bossId);
      }
    }

    if (!hasLivingBoss) return;
    for (const boss of preparedBosses) {
      if (
        boss.currentHealth > 0 ||
        hiddenDefeatedBosses.has(boss.id) ||
        defeatedRemovalTimers.current.has(boss.id)
      ) continue;

      const timer = setTimeout(() => {
        defeatedRemovalTimers.current.delete(boss.id);
        setHiddenDefeatedBosses((hidden) => new Set(hidden).add(boss.id));
      }, boss.nextAction ? 5600 : 1800);
      defeatedRemovalTimers.current.set(boss.id, timer);
    }
  }, [hiddenDefeatedBosses, state]);

  useEffect(() => () => {
    defeatedRemovalTimers.current.forEach(clearTimeout);
    defeatedRemovalTimers.current.clear();
  }, []);

  useEffect(() => {
    const removalTimers = new Set<ReturnType<typeof setTimeout>>();
    const unsubscribe = window.bossAPI.subscribeHealthEffect((effect) => {
      if (isHeavyDamageEffect(effect)) {
        playHeavyScreenImpact(encounterEffectsRef.current.visuals);
      }
      setHealthEffects((currentEffects) => ({
        ...currentEffects,
        [effect.bossId]: [
          ...(currentEffects[effect.bossId] ?? noHealthEffects),
          effect,
        ].slice(-16),
      }));
      const effectDuration = isHeavyDamageEffect(effect)
        ? 2100
        : isShieldBreakEffect(effect)
          ? 1750
          : effect.intensity === 'full'
            ? 1600
            : 1250;
      const timer = setTimeout(() => {
        setHealthEffects((currentEffects) => {
          const nextBossEffects = (currentEffects[effect.bossId] ?? noHealthEffects)
            .filter((item) => item.id !== effect.id);
          if (nextBossEffects.length === 0) {
            const remainingEffects = { ...currentEffects };
            delete remainingEffects[effect.bossId];
            return remainingEffects;
          }
          return { ...currentEffects, [effect.bossId]: nextBossEffects };
        });
        removalTimers.delete(timer);
      }, effectDuration);
      removalTimers.add(timer);
    });

    return () => {
      unsubscribe();
      removalTimers.forEach(clearTimeout);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let requestId = 0;
    let pendingImage: HTMLImageElement | null = null;
    let pendingVideo: HTMLVideoElement | null = null;

    const cancelPendingMedia = () => {
      if (pendingImage) {
        pendingImage.onload = null;
        pendingImage.onerror = null;
        pendingImage.removeAttribute('src');
        pendingImage = null;
      }
      if (pendingVideo) {
        pendingVideo.onloadeddata = null;
        pendingVideo.onerror = null;
        pendingVideo.pause();
        pendingVideo.removeAttribute('src');
        pendingVideo.load();
        pendingVideo = null;
      }
    };

    const prepareBackground = (nextBackground: BackgroundState) => {
      const currentRequest = ++requestId;
      cancelPendingMedia();

      if (!nextBackground.url) {
        if (active) {
          setBackground(nextBackground);
          setBackgroundReady(true);
        }
        return;
      }

      const finish = (loaded: boolean) => {
        if (active && currentRequest === requestId) {
          setBackground(
            loaded
              ? nextBackground
              : { ...nextBackground, url: null, mediaType: null },
          );
          setBackgroundReady(true);
        }
      };

      if (nextBackground.mediaType === 'video') {
        const video = document.createElement('video');
        pendingVideo = video;
        video.muted = true;
        video.loop = true;
        video.preload = 'auto';
        video.onloadeddata = () => {
          video.onloadeddata = null;
          video.onerror = null;
          if (pendingVideo === video) pendingVideo = null;
          finish(true);
        };
        video.onerror = () => {
          video.onloadeddata = null;
          video.onerror = null;
          if (pendingVideo === video) pendingVideo = null;
          window.bossAPI.reportBackgroundError(
            `O vídeo "${nextBackground.name ?? 'selecionado'}" não pôde ser decodificado. Tente convertê-lo para MP4 ou WebM em 1920 × 1080 px.`,
          );
          finish(false);
        };
        video.src = nextBackground.url;
        video.load();
        return;
      }

      const image = new Image();
      pendingImage = image;
      const finishImage = (loaded: boolean) => {
        image.onload = null;
        image.onerror = null;
        if (pendingImage === image) pendingImage = null;
        finish(loaded);
      };
      image.onload = () => finishImage(true);
      image.onerror = () => {
        window.bossAPI.reportBackgroundError(
          `A imagem "${nextBackground.name ?? 'selecionada'}" não pôde ser decodificada. Tente convertê-la para PNG, JPG ou GIF em 1920 × 1080 px.`,
        );
        finishImage(false);
      };
      image.src = nextBackground.url;
    };

    window.bossAPI.getBackground().then(prepareBackground);
    const unsubscribe = window.bossAPI.subscribeBackground(prepareBackground);

    return () => {
      active = false;
      cancelPendingMedia();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (state && backgroundReady && !readySent.current) {
      readySent.current = true;
      window.bossAPI.presentationReady();
    }
  }, [state, backgroundReady]);

  if (!state) {
    return <main className="player-loading">Preparando o encontro...</main>;
  }

  const backgroundStyle = {
    '--shield-icon': `url("${bundledAssetUrl('shield-icon.png')}")`,
    '--waiting-background': `url("${bundledAssetUrl('waiting-background.png')}")`,
    ...(state.battleStarted && background.url && background.mediaType === 'image'
      ? { '--battle-background': `url("${background.url}")` }
      : {}),
  } as CSSProperties;
  const activeVideoUrl = state.battleStarted &&
    background.mediaType === 'video'
    ? background.url
    : null;
  const visibleBosses = state.bosses.filter(
    (boss) =>
      boss.setupStatus === 'ready' && !hiddenDefeatedBosses.has(boss.id),
  );

  return (
    <>
      <MusicPlayer battle={state} />
      <SoundboardPlayer />
      <EncounterEffectsPlayer />
      <SceneTransitionPlayer />
      <main className="player-stage" style={backgroundStyle}>
        {activeVideoUrl && (
          <video
            key={activeVideoUrl}
            className="battle-background-video"
            src={activeVideoUrl}
            autoPlay
            disablePictureInPicture
            loop
            muted
            playsInline
            preload="auto"
            aria-hidden="true"
          />
        )}
        <div className="critical-screen-flash" aria-hidden="true" />
        <PartyHud players={playerHuds} turn={turnState} />
        <SelfRollResults players={playerHuds} turn={turnState} />
        <SelfCombatControls
          players={playerHuds}
          turn={turnState}
          bosses={visibleBosses}
        />
        {resourceNotices.length > 0 && (
          <aside
            className="player-resource-notices"
            role="status"
            aria-live="polite"
          >
            {resourceNotices.map((notice) => (
              <button
                className={`is-${notice.tone} ${notice.persistent ? 'is-persistent' : ''}`}
                type="button"
                key={notice.id}
                aria-disabled={notice.persistent}
                onClick={() => {
                  if (notice.persistent) return;
                  setResourceNotices((current) =>
                    current.filter(({ id }) => id !== notice.id));
                }}
              >
                {notice.message}
              </button>
            ))}
          </aside>
        )}
        <EncounterTurnHud turn={turnState} />
        <FightHistory turn={turnState} />
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />

        <section
          className={`waiting-screen ${state.battleStarted ? 'is-hidden' : ''}`}
          aria-hidden={state.battleStarted}
        >
          <div className="waiting-content">
            <span className="waiting-mark" aria-hidden="true" />
            <p>Aguardando todos os jogadores estarem prontos</p>
            <small>O Mestre iniciará a batalha em breve</small>
          </div>
        </section>

        <section
          className={`boss-hud ${
            state.battleStarted && state.hudVisible ? 'is-active' : ''
          }`}
        >
          {visibleBosses.map((boss) => (
            <BossHud
              boss={boss}
              bossCount={visibleBosses.length}
              effects={healthEffects[boss.id] ?? noHealthEffects}
              phaseMarkers={encounterEffects.general.phaseMarkers &&
                scenePlan &&
                scenePlan.phases[0]?.triggerBossId === boss.id
                ? [...new Set(scenePlan.phases
                    .slice(1)
                    .map((phase) => Math.max(
                      0,
                      Math.min(100, (phase.startHealth / boss.maxHealth) * 100),
                    ))
                    .filter((percent) => percent > 0 && percent < 100))]
                : []}
              visuals={encounterEffects.visuals}
              turnActive={
                turnState.activeParticipantId === `boss:${boss.id}`
              }
              rollResults={(turnState.rollResults ?? []).filter(
                ({ participantId }) => participantId === `boss:${boss.id}`,
              )}
              key={boss.id}
            />
          ))}
        </section>
      </main>
    </>
  );
};

const root = document.getElementById('root');
if (!root) throw new Error('Elemento raiz não encontrado.');
const playerRoot = createRoot(root);
playerRoot.render(<PlayerApp />);

export const unmountPlayer = () => playerRoot.unmount();
