import {
  type CSSProperties,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import type {
  BackgroundState,
  BattleState,
  BossState,
  HealthEffect,
  MusicState,
} from './shared/battle';
import './player.css';

const healthPercent = (current: number, maximum: number) =>
  Math.max(0, Math.min(100, (current / maximum) * 100));

const healthMarkers = Array.from({ length: 99 }, (_, index) => index + 1);
const noHealthEffects: HealthEffect[] = [];

type AnimatedHealthBarProps = {
  current: number;
  maximum: number;
  effects: HealthEffect[];
};

const AnimatedHealthBar = ({
  current,
  maximum,
  effects,
}: AnimatedHealthBarProps) => {
  const initialPercent = healthPercent(current, maximum);
  const healthBarRef = useRef<HTMLDivElement>(null);
  const lastAnimatedEffectId = useRef(0);
  const previous = useRef({ current, maximum });
  const [displayPercent, setDisplayPercent] = useState(initialPercent);
  const [damageTrailPercent, setDamageTrailPercent] = useState(initialPercent);
  const [healingPreviewPercent, setHealingPreviewPercent] = useState(0);
  const [healingPreviewActive, setHealingPreviewActive] = useState(false);

  useEffect(() => {
    const timers: Array<ReturnType<typeof setTimeout>> = [];
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
    } else if (current < previousValue.current) {
      setHealingPreviewPercent(0);
      setHealingPreviewActive(false);
      setDamageTrailPercent(Math.max(oldPercent, nextPercent));
      setDisplayPercent(nextPercent);
      timers.push(
        setTimeout(() => setDamageTrailPercent(nextPercent), 850),
      );
    } else if (current > previousValue.current) {
      setDamageTrailPercent(oldPercent);
      setDisplayPercent(oldPercent);
      setHealingPreviewPercent(oldPercent);
      setHealingPreviewActive(true);
      timers.push(
        setTimeout(() => setHealingPreviewPercent(nextPercent), 20),
        setTimeout(() => setDisplayPercent(nextPercent), 560),
        setTimeout(() => setHealingPreviewActive(false), 1180),
        setTimeout(() => setHealingPreviewPercent(0), 1380),
      );
    }

    previous.current = { current, maximum };
    return () => timers.forEach(clearTimeout);
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

      if (effect.type === 'damage') {
        bar.animate(
          [
            { filter: 'brightness(1)', transform: 'translateX(0)' },
            {
              filter: 'brightness(1.65)',
              transform: 'translateX(-4px)',
              offset: 0.22,
            },
            { transform: 'translateX(4px)', offset: 0.44 },
            { transform: 'translateX(-3px)', offset: 0.64 },
            { filter: 'brightness(1)', transform: 'translateX(0)' },
          ],
          { delay, duration: 480, easing: 'ease-out' },
        );
      } else {
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
  }, [effects]);

  return (
    <div className="health-bar-shell">
      <div
        className="health-bar"
        ref={healthBarRef}
        role="progressbar"
        aria-label="Vida do chefão"
        aria-valuemin={0}
        aria-valuemax={maximum}
        aria-valuenow={current}
      >
        <div
          className="health-damage-trail"
          style={{ width: `${damageTrailPercent}%` }}
        />
        <div
          className={`health-healing-preview ${
            healingPreviewActive ? 'is-active' : ''
          }`}
          style={{ width: `${healingPreviewPercent}%` }}
        />
        <div
          className="health-bar-fill"
          style={{ width: `${displayPercent}%` }}
        />
        <div className="health-bar-highlight" />
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
        {effects.map((effect) => (
          <div
            className={`health-impact is-${effect.type} ${
              effect.intensity === 'full' ? 'is-full' : ''
            }`}
            key={effect.id}
          />
        ))}
      </div>
    </div>
  );
};

const MusicPlayer = ({ battle }: { battle: BattleState }) => {
  const [music, setMusic] = useState<MusicState | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
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
    const startVolume = audio.volume;
    const startedAt = Date.now();
    fadeTimer.current = setInterval(() => {
      const progress = Math.min(1, (Date.now() - startedAt) / duration);
      audio.volume = startVolume * (1 - progress);
      if (progress === 1) {
        stopFade();
        audio.pause();
        window.bossAPI.musicFadeoutComplete();
      }
    }, 30);
  }, [stopFade]);

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
    audio.volume = music?.volume ?? 0.8;
    audio.load();
    if (music?.isPlaying) void audio.play().catch((): void => {});
  }, [currentTrack?.id, music?.playbackVersion, stopFade]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (music?.isPlaying) {
      stopFade();
      audio.volume = music.volume;
      void audio.play().catch((): void => {});
    }
    else audio.pause();
  }, [music?.isPlaying, currentTrack?.id, stopFade]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio && !fading.current) audio.volume = music?.volume ?? 0.8;
  }, [music?.volume]);

  useEffect(
    () => window.bossAPI.subscribeMusicFadeOut(fadeOut),
    [fadeOut],
  );

  const allDefeated = battle.bosses.every((boss) => boss.currentHealth === 0);
  useEffect(() => {
    if (!battle.battleStarted || !allDefeated || !music?.isPlaying) return;
    const timer = setTimeout(() => fadeOut(1800), 5600);
    return () => clearTimeout(timer);
  }, [allDefeated, battle.battleStarted, fadeOut, music?.isPlaying]);

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
    audio.volume = music.volume;
    void audio.play().catch((): void => {});
  }, [allDefeated, battle.battleStarted, music?.isPlaying, music?.volume, stopFade]);

  useEffect(() => () => stopFade(), [stopFade]);

  return (
    <audio
      className="music-player"
      ref={audioRef}
      loop={music?.loop ?? false}
      onEnded={() => window.bossAPI.musicTrackEnded()}
      onError={() => {
        if (music?.isPlaying) window.bossAPI.musicFadeoutComplete();
      }}
    />
  );
};

const BossHud = memo(function BossHud({
  boss,
  bossCount,
  effects,
}: {
  boss: BossState;
  bossCount: number;
  effects: HealthEffect[];
}) {
  const hudScale = 1 - (bossCount - 1) * 0.15;
  return (
    <article
      className={`boss-hud-entry ${boss.currentHealth === 0 ? 'is-defeated' : ''}`}
      style={{ '--hud-scale': hudScale } as CSSProperties}
    >
      <h1 className="boss-name">{boss.bossName}</h1>
      <AnimatedHealthBar
        current={boss.currentHealth}
        effects={effects}
        maximum={boss.maxHealth}
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
  const [phase, setPhase] = useState<'visible' | 'leaving' | 'entering'>(
    'visible',
  );

  useEffect(() => {
    if (text === renderedText && severity === renderedSeverity) return;

    let visibleTimer: ReturnType<typeof setTimeout> | undefined;
    setPhase('leaving');
    const changeTimer = setTimeout(() => {
      setRenderedText(text);
      setRenderedSeverity(severity);
      setPhase('entering');
      visibleTimer = setTimeout(() => setPhase('visible'), 30);
    }, 260);

    return () => {
      clearTimeout(changeTimer);
      if (visibleTimer) clearTimeout(visibleTimer);
    };
  }, [text, severity]);

  if (!renderedText) return null;

  return (
    <div className={`action-warning ${renderedSeverity === 'grave' ? 'is-grave' : ''}`}>
      <span className="telegraph-label">Preparem-se</span>
      <span className="action-divider" aria-hidden="true" />
      <p className={`action-description is-${phase}`}>{renderedText}</p>
    </div>
  );
};

const PlayerApp = () => {
  const [state, setState] = useState<BattleState | null>(null);
  const [background, setBackground] = useState<BackgroundState>({
    url: null,
    name: null,
  });
  const [backgroundReady, setBackgroundReady] = useState(false);
  const [healthEffects, setHealthEffects] = useState<
    Record<string, HealthEffect[]>
  >({});
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
    const removalTimers = new Set<ReturnType<typeof setTimeout>>();
    const unsubscribe = window.bossAPI.subscribeHealthEffect((effect) => {
      setHealthEffects((currentEffects) => ({
        ...currentEffects,
        [effect.bossId]: [
          ...(currentEffects[effect.bossId] ?? noHealthEffects),
          effect,
        ].slice(-16),
      }));
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
      }, effect.intensity === 'full' ? 1600 : 1250);
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

    const prepareBackground = (nextBackground: BackgroundState) => {
      const currentRequest = ++requestId;

      if (!nextBackground.url) {
        if (active) {
          setBackground(nextBackground);
          setBackgroundReady(true);
        }
        return;
      }

      const image = new Image();
      const finish = (loaded: boolean) => {
        if (active && currentRequest === requestId) {
          setBackground(
            loaded ? nextBackground : { ...nextBackground, url: null },
          );
          setBackgroundReady(true);
        }
      };
      image.onload = () => finish(true);
      image.onerror = () => {
        window.bossAPI.reportBackgroundError(
          `A imagem "${nextBackground.name ?? 'selecionada'}" não pôde ser decodificada. Tente convertê-la para PNG, JPG ou GIF em 1920 × 1080 px.`,
        );
        finish(false);
      };
      image.src = nextBackground.url;
    };

    window.bossAPI.getBackground().then(prepareBackground);
    const unsubscribe = window.bossAPI.subscribeBackground(prepareBackground);

    return () => {
      active = false;
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

  const backgroundStyle = state.battleStarted && background.url
    ? ({
        '--battle-background': `url("${background.url}")`,
      } as CSSProperties)
    : undefined;

  return (
    <>
      <MusicPlayer battle={state} />
      <main className="player-stage" style={backgroundStyle}>
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />

        <section
          className={`waiting-screen ${state.battleStarted ? 'is-hidden' : ''}`}
          aria-hidden={state.battleStarted}
        >
          <span className="waiting-mark" aria-hidden="true" />
          <p>Aguardando todos os jogadores estarem prontos</p>
          <small>O Mestre iniciará a batalha em breve</small>
        </section>

        <section
          className={`boss-hud ${
            state.battleStarted && state.hudVisible ? 'is-active' : ''
          }`}
        >
          {state.bosses.map((boss) => (
            <BossHud
              boss={boss}
              bossCount={state.bosses.length}
              effects={healthEffects[boss.id] ?? noHealthEffects}
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
