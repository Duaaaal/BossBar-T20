import {
  type CSSProperties,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createRoot } from 'react-dom/client';
import type {
  BackgroundState,
  BattleState,
  HealthEffect,
} from './shared/battle';
import './player.css';

const healthPercent = (current: number, maximum: number) =>
  Math.max(0, Math.min(100, (current / maximum) * 100));

const healthMarkers = Array.from({ length: 99 }, (_, index) => index + 1);

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
    } else if (current < previousValue.current) {
      setHealingPreviewPercent(0);
      setDamageTrailPercent(Math.max(oldPercent, nextPercent));
      setDisplayPercent(nextPercent);
      timers.push(
        setTimeout(() => setDamageTrailPercent(nextPercent), 850),
      );
    } else if (current > previousValue.current) {
      setDamageTrailPercent(oldPercent);
      setDisplayPercent(oldPercent);
      setHealingPreviewPercent(nextPercent);
      timers.push(
        setTimeout(() => setDisplayPercent(nextPercent), 430),
        setTimeout(() => setHealingPreviewPercent(0), 1050),
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
        className="health-healing-preview"
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
  );
};

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
  const [healthEffects, setHealthEffects] = useState<HealthEffect[]>([]);
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
      setHealthEffects((currentEffects) => [...currentEffects, effect].slice(-16));
      const timer = setTimeout(() => {
        setHealthEffects((currentEffects) =>
          currentEffects.filter((item) => item.id !== effect.id),
        );
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

  const defeated = state.currentHealth === 0;
  const backgroundStyle = background.url
    ? ({
        '--battle-background': `url("${background.url}")`,
      } as CSSProperties)
    : undefined;

  return (
    <main
      className={`player-stage ${defeated ? 'is-defeated' : ''}`}
      style={backgroundStyle}
    >
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

      <section className={`boss-hud ${state.battleStarted ? 'is-active' : ''}`}>
        <h1 className="boss-name">{state.bossName}</h1>
        <AnimatedHealthBar
          current={state.currentHealth}
          effects={healthEffects}
          maximum={state.maxHealth}
        />
        <div className="action-slot">
          <AnimatedAction
            text={state.nextAction}
            severity={state.actionSeverity}
          />
        </div>
      </section>
    </main>
  );
};

const root = document.getElementById('root');
if (!root) throw new Error('Elemento raiz não encontrado.');
createRoot(root).render(<PlayerApp />);
