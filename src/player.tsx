import {
  type CSSProperties,
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import {
  type BackgroundState,
  type BattleState,
  type BossState,
  type EncounterEffectsState,
  type EncounterSoundEffectKind,
  type EncounterVisualEffectSettings,
  type HealthEffect,
  initialEncounterEffectsState,
  isHeavyDamageEffect,
  isEncounterSoundEnabled,
  isShieldBreakEffect,
  type MusicState,
  type SoundboardState,
  volumeToGain,
} from './shared/battle';
import type { ScenePlan, SceneTransitionEvent } from './shared/scene';
import { bundledAssetUrl, statusIconUrl } from './shared/bundled-assets';
import {
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
import './player.css';
import './scrollbars.css';

const healthPercent = (current: number, maximum: number) =>
  Math.max(0, Math.min(100, (current / maximum) * 100));

const healthMarkers = Array.from({ length: 99 }, (_, index) => index + 1);
const shieldBreakParticles = Array.from({ length: 24 }, (_, index) => index);
const noHealthEffects: HealthEffect[] = [];
const splitStatusRows = <Item,>(items: Item[], rowSize = 10) =>
  Array.from({ length: Math.ceil(items.length / rowSize) }, (_, rowIndex) =>
    items.slice(rowIndex * rowSize, (rowIndex + 1) * rowSize),
  );

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
                const damageRange = damageFormula
                  ? getDamageFormulaRange(damageFormula)
                  : null;
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
                  >
                    <img
                      alt=""
                      draggable={false}
                      src={statusIconUrl(definition.iconFile)}
                    />
                    <span className="boss-status-tooltip" id={tooltipId} role="tooltip">
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
                    </span>
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

  const fadeOut = useCallback((duration: number) => {
    const audio = audioRef.current;
    if (!audio || fading.current) return;
    if (audio.paused) {
      window.bossAPI.musicFadeoutComplete();
      return;
    }
    stopFade();
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
  }, [ensureAudioGraph, stopFade]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!currentTrack) {
      audio.removeAttribute('src');
      audio.load();
      return;
    }

    stopFade();
    audio.src = currentTrack.url;
    setOutputMuted(outputMuted);
    if (music?.isPlaying || gainNodeRef.current) {
      setOutputGain(music?.volume ?? 0.8);
    }
    audio.load();
    if (music?.isPlaying) void audio.play().catch((): void => {});
  }, [currentTrack?.id, music?.playbackVersion, setOutputGain, setOutputMuted, stopFade]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (music?.isPlaying) {
      stopFade();
      setOutputGain(music.volume);
      void audio.play().catch((): void => {});
    }
    else audio.pause();
  }, [music?.isPlaying, currentTrack?.id, setOutputGain, stopFade]);

  useEffect(() => {
    setOutputMuted(outputMuted);
  }, [outputMuted, setOutputMuted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio && gainNodeRef.current && !fading.current) {
      setOutputGain(music?.volume ?? 0.8);
    }
  }, [music?.volume, setOutputGain]);

  useEffect(
    () => window.bossAPI.subscribeMusicFadeOut(fadeOut),
    [fadeOut],
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
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    gainNodeRef.current = null;
    muteGainNodeRef.current = null;
    sourceNodeRef.current = null;
  }, [stopFade]);

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
      universalMuted: soundboard.universalMuted,
    };
    const context = audioContextRef.current;
    const gain = masterGainRef.current;
    if (!context || !gain) return;
    gain.gain.setValueAtTime(
      soundboard.muted || soundboard.universalMuted
        ? 0
        : volumeToGain(soundboard.volume),
      context.currentTime,
    );
  }, [soundboard?.muted, soundboard?.universalMuted, soundboard?.volume]);

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
    const unsubscribe = window.bossAPI.subscribeEncounterEffect((effect) => {
      if (!isEncounterSoundEnabled(settingsRef.current, effect.kind)) {
        window.bossAPI.encounterEffectFinished(effect.id);
        return;
      }
      const graph = ensureAudioGraph();
      if (!graph.gain) return;
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

      const release = () => {
        if (!activeSounds.current.has(effect.id)) return;
        activeSounds.current.delete(effect.id);
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
      audio.addEventListener('ended', release);
      audio.addEventListener('error', release);
      audio.load();
      void audio.play().catch(release);
    });

    return () => {
      unsubscribe();
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

const BossHud = memo(function BossHud({
  boss,
  bossCount,
  effects,
  phaseMarkers,
  visuals,
}: {
  boss: BossState;
  bossCount: number;
  effects: HealthEffect[];
  phaseMarkers: number[];
  visuals: EncounterVisualEffectSettings;
}) {
  const hudScale = 1 - (bossCount - 1) * 0.15;
  return (
    <article
      className={`boss-hud-entry ${boss.currentHealth === 0 ? 'is-defeated' : ''} ${!boss.nextAction ? 'is-actionless' : ''}`}
      style={{ '--hud-scale': hudScale } as CSSProperties}
    >
      <h1 className="boss-name">{boss.bossName}</h1>
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
    window.bossAPI.getMusicState().then((state) => {
      if (active) universalMuted.current = state.universalMuted;
    });
    const unsubscribeMusic = window.bossAPI.subscribeMusic((state) => {
      universalMuted.current = state.universalMuted;
    });
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const audios = new Set<HTMLAudioElement>();
    const unsubscribeTransition = window.bossAPI.subscribeSceneTransition((nextEffect) => {
      setEffect(nextEffect);
      let transitionAudio: HTMLAudioElement | null = null;
      let releaseTransitionAudio: (() => void) | null = null;
      if (
        nextEffect.soundUrl &&
        !nextEffect.soundMuted &&
        !universalMuted.current
      ) {
        const audio = new Audio(nextEffect.soundUrl);
        transitionAudio = audio;
        audios.add(audio);
        audio.preload = 'auto';
        audio.volume = Math.max(0, Math.min(1, nextEffect.soundVolume));
        audio.loop = nextEffect.soundLoop;
        const release = () => {
          audios.delete(audio);
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
        };
        releaseTransitionAudio = release;
        audio.addEventListener('ended', release, { once: true });
        audio.addEventListener('error', release, { once: true });
        void audio.play().catch(release);
      }
      const timer = setTimeout(() => {
        timers.delete(timer);
        if (transitionAudio && releaseTransitionAudio) releaseTransitionAudio();
        setEffect((current) => current?.id === nextEffect.id ? null : current);
      }, nextEffect.durationMs + 80);
      timers.add(timer);
    });
    return () => {
      active = false;
      unsubscribeMusic();
      unsubscribeTransition();
      timers.forEach(clearTimeout);
      audios.forEach((audio) => {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      });
    };
  }, []);

  return effect ? (
    <div
      className={`scene-transition scene-transition-${effect.kind}`}
      key={effect.id}
      style={{ '--scene-transition-duration': `${effect.durationMs}ms` } as CSSProperties}
      aria-hidden="true"
    >
      <div className="scene-transition-burst" />
    </div>
  ) : null;
};

const PlayerApp = () => {
  const [state, setState] = useState<BattleState | null>(null);
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
              phaseMarkers={scenePlan?.showPhaseMarkers
                ? [...new Set(scenePlan.phases
                    .slice(1)
                    .filter((phase) => phase.triggerBossId === boss.id)
                    .map((phase) => phase.startPercent)
                    .filter((percent) => percent > 0 && percent < 100))]
                : []}
              visuals={encounterEffects.visuals}
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
createRoot(root).render(<PlayerApp />);
