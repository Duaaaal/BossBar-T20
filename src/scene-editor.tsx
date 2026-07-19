import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createRoot } from 'react-dom/client';
import {
  createInitialBoss,
  volumeToGain,
  type BattleState,
  type BossState,
} from './shared/battle';
import { installDisabledControlTooltips } from './shared/disabled-controls';
import { isUndoEditableTarget } from './shared/undo-shortcut';
import {
  createSceneRanges,
  MAX_SCENE_PHASES,
  type SceneAudioSlot,
  type SceneBossDirective,
  type SceneBossPatch,
  type SceneMediaSlot,
  type ScenePhaseDraft,
  type ScenePlaylistCommand,
  type ScenePlaylistState,
  type ScenePlaylistSummary,
  type ScenePlan,
  type ScenePlanDraft,
  type SceneTransitionKind,
  validateSceneRanges,
} from './shared/scene';
import './scene-editor.css';
import './scrollbars.css';

installDisabledControlTooltips();

const transitionLabels: Record<SceneTransitionKind, string> = {
  fade: 'Fade',
  'fade-blackout': 'Fade blackout',
  blackout: 'Blackout',
};

const mediaLabels: Record<SceneMediaSlot, string> = {
  background: 'Fundo da fase',
  transitionSound: 'Som da transição',
  music: 'Música da fase',
};

const identityPatchFromBoss = (boss: BossState): SceneBossPatch => ({
  bossName: boss.bossName,
  maxHealth: boss.maxHealth,
  currentHealth: boss.currentHealth,
  attack: boss.attack,
  rangedAttack: boss.rangedAttack,
  skills: boss.skills,
  defense: boss.defense,
  rangedDefense: boss.rangedDefense,
  damageReduction: boss.damageReduction,
  shield: boss.shield,
});

const draftFromPlan = (
  plan: ScenePlan,
  battleState?: BattleState | null,
): ScenePlanDraft => ({
  bossSlots: plan.bossSlots.map((slot) => ({ ...slot })),
  showPhaseMarkers: plan.showPhaseMarkers,
  phases: plan.phases.map((phase, phaseIndex) => ({
    ...phase,
    background: phase.background ? { ...phase.background } : null,
    transitionSound: phase.transitionSound ? {
      ...phase.transitionSound,
      tracks: phase.transitionSound.tracks.map((track) => ({ ...track })),
    } : null,
    music: phase.music ? {
      ...phase.music,
      tracks: phase.music.tracks.map((track) => ({ ...track })),
    } : null,
    bosses: phase.bosses.map((directive) => ({
      ...directive,
      presence: phaseIndex === 0 &&
        plan.bossSlots.find((slot) => slot.bossId === directive.bossId)?.original
        ? 'present'
        : directive.presence,
      carryOverflowDamage: directive.carryOverflowDamage !== false,
      patch: phaseIndex === 0 && directive.presence !== 'absent'
        ? {
            ...identityPatchFromBoss(
              battleState?.bosses.find((boss) => boss.id === directive.bossId) ??
                createInitialBoss(
                  directive.bossId,
                  plan.bossSlots.findIndex((slot) => slot.bossId === directive.bossId),
                ),
            ),
            ...directive.patch,
          }
        : { ...directive.patch },
    })),
  })),
});

const createPhaseFromPrevious = (
  index: number,
  previous: ScenePhaseDraft,
  range: { startHealth: number; endHealth: number },
): ScenePhaseDraft => ({
  ...previous,
  id: `phase-${crypto.randomUUID()}`,
  name: `Fase ${index + 1}`,
  ...range,
  background: null,
  transitionSound: null,
  music: null,
  bosses: previous.bosses.map((directive) => ({
    ...directive,
    presence: 'inherit',
    patch: {},
  })),
});

const bossIsPresentInPhase = (
  draft: ScenePlanDraft,
  bossId: string,
  phaseIndex: number,
) => {
  const slot = draft.bossSlots.find((item) => item.bossId === bossId);
  if (!slot) return false;
  if (slot.original) return true;
  let present = false;
  for (let index = 0; index <= phaseIndex; index += 1) {
    const directive = draft.phases[index]?.bosses.find(
      (item) => item.bossId === bossId,
    );
    if (directive?.presence === 'present') present = true;
    if (directive?.presence === 'absent') present = false;
  }
  return present;
};

const bossNameInPhase = (
  draft: ScenePlanDraft,
  bossId: string,
  phaseIndex: number,
) => {
  let name = draft.bossSlots.find((slot) => slot.bossId === bossId)?.label ?? 'Chefão';
  for (let index = 0; index <= phaseIndex; index += 1) {
    const nextName = draft.phases[index]?.bosses.find(
      (directive) => directive.bossId === bossId,
    )?.patch.bossName;
    if (nextName) name = nextName;
  }
  return name;
};

const resolvedBossInPhase = (
  draft: ScenePlanDraft,
  battleState: BattleState | null,
  bossId: string,
  phaseIndex: number,
) => {
  const slotIndex = draft.bossSlots.findIndex((slot) => slot.bossId === bossId);
  const slot = draft.bossSlots[slotIndex];
  const base = battleState?.bosses.find((boss) => boss.id === bossId) ?? {
    ...createInitialBoss(bossId, Math.max(0, slotIndex)),
    bossName: slot?.label ?? 'Chefão',
  };
  let resolved = identityPatchFromBoss(base);
  for (let index = 0; index <= phaseIndex; index += 1) {
    const patch = draft.phases[index]?.bosses.find(
      (directive) => directive.bossId === bossId,
    )?.patch;
    if (patch) resolved = { ...resolved, ...patch };
  }
  return resolved;
};

const usePreviewAudioOutput = (
  audioRef: RefObject<HTMLAudioElement | null>,
  volume: number,
  muted: boolean,
) => {
  const contextRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  const ensureGraph = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!contextRef.current) {
      const context = new AudioContext();
      const source = context.createMediaElementSource(audio);
      const gain = context.createGain();
      source.connect(gain);
      gain.connect(context.destination);
      audio.volume = 1;
      audio.muted = false;
      contextRef.current = context;
      sourceRef.current = source;
      gainRef.current = gain;
    }
    const context = contextRef.current;
    const gain = gainRef.current;
    if (context && gain) {
      gain.gain.setValueAtTime(muted ? 0 : volumeToGain(volume), context.currentTime);
      if (context.state === 'suspended') await context.resume();
    }
  }, [audioRef, muted, volume]);

  useEffect(() => {
    const context = contextRef.current;
    const gain = gainRef.current;
    if (!context || !gain) return;
    gain.gain.setValueAtTime(muted ? 0 : volumeToGain(volume), context.currentTime);
  }, [muted, volume]);

  useEffect(() => () => {
    sourceRef.current?.disconnect();
    gainRef.current?.disconnect();
    if (contextRef.current) void contextRef.current.close();
  }, []);

  return ensureGraph;
};

const PhasePlaylistCard = ({
  busy,
  label,
  phaseId,
  playlist,
  slot,
  onOpen,
  extraControl,
  disabled = false,
}: {
  busy: boolean;
  label: string;
  phaseId: string;
  playlist: ScenePlaylistSummary | null;
  slot: SceneAudioSlot;
  onOpen: () => void;
  extraControl?: ReactNode;
  disabled?: boolean;
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const currentTrack = playlist?.tracks.find(
    (track) => track.id === playlist.currentTrackId,
  ) ?? playlist?.tracks[0] ?? null;
  const canNavigate = (playlist?.tracks.length ?? 0) > 1;
  const phaseDisabledReason = disabled
    ? 'A última fase não possui transição'
    : busy ? 'Aguarde a operação atual' : undefined;
  const prepareAudio = usePreviewAudioOutput(
    audioRef,
    playlist?.volume ?? 0.8,
    playlist?.muted ?? false,
  );
  const dispatch = (command: Parameters<typeof window.bossAPI.dispatchScenePhasePlaylist>[2]) =>
    window.bossAPI.dispatchScenePhasePlaylist(phaseId, slot, command);

  useEffect(() => {
    if (!audioRef.current || !playlist) return;
    audioRef.current.loop = playlist.loop;
  }, [playlist?.loop, playlist?.muted, playlist?.volume]);

  useEffect(() => {
    audioRef.current?.pause();
    setPlaying(false);
  }, [currentTrack?.id]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    await prepareAudio();
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch {
      setPlaying(false);
    }
  };

  return (
    <article className={`phase-media phase-playlist-card ${extraControl ? 'has-extra-control' : ''}`}>
      <span>{label}</span>
      <strong title={currentTrack?.name ?? ''}>
        {currentTrack?.name ?? 'Nenhuma faixa selecionada'}
      </strong>
      <small>{playlist?.tracks.length ?? 0} faixa(s) nesta fase</small>
      <div className="phase-audio-source-actions">
        <button type="button" disabled={busy || disabled} data-disabled-reason={phaseDisabledReason} onClick={onOpen}>Montar playlist</button>
      </div>
      <div className="phase-audio-controls">
        <button type="button" title="Faixa anterior" disabled={disabled || !canNavigate} data-disabled-reason={phaseDisabledReason ?? 'Adicione ao menos duas faixas'} onClick={() => dispatch({ type: 'previous' })}>&#9198;</button>
        <button type="button" title={playing ? 'Pausar' : 'Reproduzir'} disabled={disabled || !currentTrack} data-disabled-reason={phaseDisabledReason ?? 'Adicione uma faixa primeiro'} onClick={() => void togglePlayback()}>{playing ? '\u23F8' : '\u25B6'}</button>
        <button type="button" title="Próxima faixa" disabled={disabled || !canNavigate} data-disabled-reason={phaseDisabledReason ?? 'Adicione ao menos duas faixas'} onClick={() => dispatch({ type: 'next' })}>&#9197;</button>
        <button type="button" className={playlist?.loop ? 'is-active' : ''} title="Loop" disabled={disabled || !currentTrack} data-disabled-reason={phaseDisabledReason ?? 'Adicione uma faixa primeiro'} onClick={() => dispatch({ type: 'set-loop', loop: !playlist?.loop })}>&#8635;</button>
        <button type="button" title={playlist?.muted ? 'Ativar som' : 'Mutar'} disabled={disabled || !playlist} data-disabled-reason={phaseDisabledReason ?? 'Monte a playlist primeiro'} onClick={() => dispatch({ type: 'set-muted', muted: !playlist?.muted })}>{playlist?.muted ? '\uD83D\uDD07' : '\uD83D\uDD0A'}</button>
        <input
          type="range"
          aria-label={`Volume de ${label}`}
          min="0"
          max="1"
          step="0.01"
          value={playlist?.volume ?? 0.8}
          disabled={disabled || !playlist}
          data-disabled-reason={phaseDisabledReason ?? 'Monte a playlist primeiro'}
          onChange={(event) => dispatch({ type: 'set-volume', volume: Number(event.target.value) })}
        />
      </div>
      {extraControl}
      <audio
        ref={audioRef}
        src={currentTrack?.url}
        crossOrigin="anonymous"
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        style={{ display: 'none' }}
      />
    </article>
  );
};

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

const ScenePlaylistModal = ({
  state,
  onClose,
}: {
  state: ScenePlaylistState;
  onClose: () => void;
}) => {
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [message, setMessage] = useState('');
  const [clearOpen, setClearOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const playAfterSelection = useRef(false);
  const prepareAudio = usePreviewAudioOutput(audioRef, state.volume, state.muted);
  const currentTrack = state.tracks.find(
    (track) => track.id === state.currentTrackId,
  ) ?? state.tracks[0] ?? null;
  const duration = audioRef.current?.duration || currentTrack?.duration || 0;
  const canNavigate = state.tracks.length > 1;
  const dispatch = (command: ScenePlaylistCommand) =>
    window.bossAPI.dispatchScenePhasePlaylist(state.phaseId, state.slot, command);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.loop = state.loop;
  }, [state.loop]);

  useEffect(() => {
    setTime(0);
    setPlaying(false);
    if (!playAfterSelection.current || !audioRef.current || !currentTrack) return;
    playAfterSelection.current = false;
    void prepareAudio().then(() => audioRef.current?.play()).catch(() => {
      setMessage('Não foi possível reproduzir esta faixa.');
    });
  }, [currentTrack?.id]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    await prepareAudio();
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch {
      setMessage('Não foi possível reproduzir esta faixa.');
    }
  };

  const selectAndPlay = (trackId: string) => {
    if (trackId === state.currentTrackId) {
      void togglePlayback();
      return;
    }
    playAfterSelection.current = true;
    dispatch({ type: 'select-track', trackId });
  };

  const addTracks = async () => {
    setMessage('');
    const result = await window.bossAPI.addScenePhasePlaylistTracks(
      state.phaseId,
      state.slot,
    );
    if (!result.ok && !result.canceled) {
      setMessage(result.error ?? 'Não foi possível adicionar as faixas.');
    }
  };

  return (
    <div className="scene-modal-backdrop scene-playlist-backdrop">
      <section className="scene-playlist-modal" role="dialog" aria-modal="true" aria-labelledby="scene-playlist-title">
        <header>
          <div>
            <p>{state.slot === 'music' ? 'Música da fase' : 'Som da transição'}</p>
            <h2 id="scene-playlist-title">{state.phaseName}</h2>
          </div>
          <div className="scene-playlist-heading-actions">
            <button type="button" onClick={() => void addTracks()}>+ Adicionar MP3</button>
            <button type="button" disabled={state.tracks.length === 0} data-disabled-reason="A playlist já está vazia" onClick={() => setClearOpen(true)}>Limpar playlist</button>
            <button className="scene-playlist-close" type="button" aria-label="Fechar playlist" onClick={onClose}>&times;</button>
          </div>
        </header>

        <div className="scene-track-list" role="listbox" aria-label="Faixas da fase">
          {state.tracks.length === 0 ? (
            <div className="scene-playlist-empty">
              <strong>Nenhuma faixa adicionada</strong>
              <span>Adicione um ou mais arquivos MP3 para montar esta playlist.</span>
            </div>
          ) : state.tracks.map((track, index) => (
            <div className={`scene-track-row ${track.id === state.currentTrackId ? 'is-current' : ''}`} key={track.id}>
              <button
                type="button"
                role="option"
                aria-selected={track.id === state.currentTrackId}
                title="Clique duas vezes para ouvir"
                onDoubleClick={() => selectAndPlay(track.id)}
              >
                <span>{track.id === state.currentTrackId && playing ? '\u25B6' : index + 1}</span>
                <strong>{track.name}</strong>
                <small>{formatTime(track.duration)}</small>
              </button>
              <button className="scene-track-remove" type="button" title="Remover faixa" aria-label={`Remover ${track.name}`} onClick={() => dispatch({ type: 'remove-track', trackId: track.id })}>&times;</button>
            </div>
          ))}
        </div>

        <section className="scene-playlist-transport">
          <span>Tocando agora</span>
          <strong title={currentTrack?.name}>{currentTrack?.name ?? 'Nenhuma faixa selecionada'}</strong>
          <label className="scene-playlist-timeline">
            <span>{formatTime(time)}</span>
            <input type="range" aria-label="Posição da faixa" min="0" max={Math.max(0, duration)} step="0.1" value={Math.min(time, duration)} disabled={!currentTrack} data-disabled-reason="Adicione uma faixa primeiro" onChange={(event) => {
              if (!audioRef.current) return;
              const nextTime = Number(event.target.value);
              audioRef.current.currentTime = nextTime;
              setTime(nextTime);
            }} />
            <span>{formatTime(duration)}</span>
          </label>
          <div className="scene-playlist-controls">
            <button type="button" disabled={!canNavigate} data-disabled-reason="Adicione ao menos duas faixas" title="Faixa anterior" onClick={() => dispatch({ type: 'previous' })}>&#9198;</button>
            <button className="scene-playlist-play" type="button" disabled={!currentTrack} data-disabled-reason="Adicione uma faixa primeiro" onClick={() => void togglePlayback()}>{playing ? '\u23F8' : '\u25B6'}</button>
            <button type="button" disabled={!canNavigate} data-disabled-reason="Adicione ao menos duas faixas" title="Próxima faixa" onClick={() => dispatch({ type: 'next' })}>&#9197;</button>
            <button className={state.loop ? 'is-active' : ''} type="button" title="Repetir playlist" aria-label="Repetir playlist" disabled={!currentTrack} data-disabled-reason="Adicione uma faixa primeiro" onClick={() => dispatch({ type: 'set-loop', loop: !state.loop })}>&#8635;</button>
            <button type="button" title={state.muted ? 'Ativar som' : 'Mutar'} aria-label={state.muted ? 'Ativar som' : 'Mutar'} disabled={!currentTrack} data-disabled-reason="Adicione uma faixa primeiro" onClick={() => dispatch({ type: 'set-muted', muted: !state.muted })}>{state.muted ? '\uD83D\uDD07' : '\uD83D\uDD0A'}</button>
          </div>
          {message && <p className="scene-playlist-message" role="alert">{message}</p>}
        </section>

        <audio ref={audioRef} src={currentTrack?.url} crossOrigin="anonymous" preload="metadata" muted={state.muted} loop={state.loop} onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} />

        {clearOpen && (
          <div className="scene-playlist-confirm-backdrop">
            <section role="alertdialog" aria-modal="true" aria-labelledby="clear-scene-playlist-title">
              <h3 id="clear-scene-playlist-title">Limpar playlist?</h3>
              <p>Todas as faixas desta fase serão removidas do rascunho.</p>
              <div>
                <button type="button" onClick={() => setClearOpen(false)}>Cancelar</button>
                <button className="is-destructive" type="button" onClick={() => { dispatch({ type: 'clear' }); setClearOpen(false); }}>Limpar</button>
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
};

const SceneEditorApp = () => {
  const [plan, setPlan] = useState<ScenePlan | null>(null);
  const [draft, setDraft] = useState<ScenePlanDraft | null>(null);
  const [savedDraft, setSavedDraft] = useState<ScenePlanDraft | null>(null);
  const [selectedBossId, setSelectedBossId] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [battleState, setBattleState] = useState<Awaited<ReturnType<typeof window.bossAPI.getState>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [playlistModal, setPlaylistModal] = useState<ScenePlaylistState | null>(null);
  const [requestedPlaylistPhaseId, setRequestedPlaylistPhaseId] = useState<string | null>(null);
  const [phaseToDelete, setPhaseToDelete] = useState<number | null>(null);
  const [bossToDelete, setBossToDelete] = useState<string | null>(null);
  const [resetConfirmationOpen, setResetConfirmationOpen] = useState(false);
  const [closeConfirmationOpen, setCloseConfirmationOpen] = useState(false);
  const dirtyRef = useRef(false);
  const battleStateRef = useRef<BattleState | null>(null);
  const draftHistoryRef = useRef<Array<{
    draft: ScenePlanDraft;
    key: string;
    recordedAt: number;
  }>>([]);
  const skipNextHistoryRef = useRef(false);

  const mutateDraft = (
    updater: (current: ScenePlanDraft) => ScenePlanDraft,
    historyKey: string,
  ) => {
    setDraft((current) => {
      if (!current) return current;
      const next = updater(current);
      if (JSON.stringify(next) === JSON.stringify(current)) return current;
      if (skipNextHistoryRef.current) {
        skipNextHistoryRef.current = false;
        return next;
      }
      const recordedAt = Date.now();
      const last = draftHistoryRef.current.at(-1);
      if (!last || last.key !== historyKey || recordedAt - last.recordedAt > 600) {
        draftHistoryRef.current.push({
          draft: structuredClone(current),
          key: historyKey,
          recordedAt,
        });
        if (draftHistoryRef.current.length > 5) draftHistoryRef.current.shift();
      }
      return next;
    });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.shiftKey ||
        event.altKey ||
        (!event.ctrlKey && !event.metaKey) ||
        event.key.toLowerCase() !== 'z'
      ) return;
      if (isUndoEditableTarget(event.target)) {
        skipNextHistoryRef.current = true;
        window.setTimeout(() => {
          skipNextHistoryRef.current = false;
        }, 0);
        return;
      }
      event.preventDefault();
      const previous = draftHistoryRef.current.pop();
      if (!previous) {
        void window.bossAPI.undoLastChange();
        return;
      }
      setDraft(previous.draft);
      setSelectedIndex((index) => Math.min(index, previous.draft.phases.length - 1));
      setPlaylistModal(null);
      setPhaseToDelete(null);
      setBossToDelete(null);
      setMessage('');
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([
      window.bossAPI.getScenePlan(),
      window.bossAPI.getState(),
    ]).then(([state, initialBattleState]) => {
      if (!active) return;
      battleStateRef.current = initialBattleState;
      setBattleState(initialBattleState);
      setPlan(state);
      const hydratedDraft = draftFromPlan(state, initialBattleState);
      setDraft(hydratedDraft);
      setSavedDraft(hydratedDraft);
      draftHistoryRef.current = [];
      setSelectedBossId((current) => state.bossSlots.some((slot) => slot.bossId === current)
        ? current
        : state.bossSlots[0]?.bossId ?? '');
    });
    const unsubscribe = window.bossAPI.subscribeScenePlan((state) => {
      if (!active) return;
      setPlan(state);
      if (!dirtyRef.current) {
        const hydratedDraft = draftFromPlan(state, battleStateRef.current);
        setDraft(hydratedDraft);
        setSavedDraft(hydratedDraft);
        draftHistoryRef.current = [];
        setSelectedBossId((current) => state.bossSlots.some((slot) => slot.bossId === current)
          ? current
          : state.bossSlots[0]?.bossId ?? '');
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    const unsubscribe = window.bossAPI.subscribe((state) => {
      if (active) {
        battleStateRef.current = state;
        setBattleState(state);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(
    () => window.bossAPI.subscribeSceneEditorCloseRequested(() => {
      if (dirtyRef.current) setCloseConfirmationOpen(true);
      else window.bossAPI.confirmSceneEditorClose();
    }),
    [],
  );

  useEffect(
    () => window.bossAPI.subscribeBackgroundError(setMessage),
    [],
  );

  useEffect(
    () => window.bossAPI.subscribeActivePhasePlaylistRequested(
      setRequestedPlaylistPhaseId,
    ),
    [],
  );

  useEffect(
    () => window.bossAPI.subscribeScenePhasePlaylist((state) => {
      setPlaylistModal((current) => current &&
        current.phaseId === state.phaseId &&
        current.slot === state.slot
        ? { ...state, phaseName: current.phaseName }
        : current);
      setDraft((current) => current ? {
        ...current,
        phases: current.phases.map((phase) => phase.id === state.phaseId
          ? {
              ...phase,
              [state.slot]: state.tracks.length > 0
                ? {
                    tracks: state.tracks.map((track) => ({ ...track })),
                    currentTrackId: state.currentTrackId,
                    volume: state.volume,
                    muted: state.muted,
                    loop: state.loop,
                    revision: state.revision,
                  }
                : null,
            }
          : phase),
      } : current);
    }),
    [],
  );

  const currentPhase = draft?.phases[selectedIndex] ?? null;

  useEffect(() => {
    if (!draft || !requestedPlaylistPhaseId) return;
    const phaseIndex = draft.phases.findIndex(
      (phase) => phase.id === requestedPlaylistPhaseId,
    );
    const phase = draft.phases[phaseIndex];
    if (!phase?.music) {
      setRequestedPlaylistPhaseId(null);
      return;
    }
    setRequestedPlaylistPhaseId(null);
    setSelectedIndex(phaseIndex);
    void window.bossAPI.openScenePhasePlaylist(
      phase.id,
      'music',
      phase.name,
      phase.music,
    ).then((state) => {
      if (state) setPlaylistModal(state);
    });
  }, [draft, requestedPlaylistPhaseId]);
  const rangeError = draft ? validateSceneRanges(draft.phases) : null;
  const dirty = useMemo(
    () => Boolean(draft && savedDraft && JSON.stringify(draft) !== JSON.stringify(savedDraft)),
    [draft, savedDraft],
  );

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const updatePhase = (
    updater: (phase: ScenePhaseDraft) => ScenePhaseDraft,
    historyKey = `phase:${currentPhase?.id ?? selectedIndex}`,
  ) => {
    mutateDraft((current) => ({
      ...current,
      phases: current.phases.map((phase) =>
        phase.id === currentPhase?.id ? updater(phase) : phase),
    }), historyKey);
    setMessage('');
  };

  const setPhaseStartHealth = (value: number) => {
    mutateDraft((current) => ({
      ...current,
      phases: current.phases.map((phase) => {
        if (phase.id === current?.phases[selectedIndex]?.id) return { ...phase, startHealth: value };
        if (phase.id === current?.phases[selectedIndex - 1]?.id) return { ...phase, endHealth: value };
        return phase;
      }),
    }), `phase:${currentPhase?.id}:start-health`);
    setMessage('');
  };

  const setPhaseEndHealth = (value: number) => {
    mutateDraft((current) => ({
      ...current,
      phases: current.phases.map((phase) => {
        if (phase.id === current?.phases[selectedIndex]?.id) return { ...phase, endHealth: value };
        if (phase.id === current?.phases[selectedIndex + 1]?.id) return { ...phase, startHealth: value };
        return phase;
      }),
    }), `phase:${currentPhase?.id}:end-health`);
    setMessage('');
  };

  const updateDirective = (
    bossId: string,
    updater: (directive: SceneBossDirective) => SceneBossDirective,
    historyKey = `phase:${currentPhase?.id}:boss:${bossId}`,
  ) => updatePhase((phase) => ({
    ...phase,
    bosses: phase.bosses.map((directive) =>
      directive.bossId === bossId ? updater(directive) : directive),
  }), historyKey);

  const setPatchValue = (
    bossId: string,
    key: keyof SceneBossPatch,
    value: string,
  ) => updateDirective(bossId, (directive) => {
    const patch = { ...directive.patch };
    if (!value.trim()) {
      delete patch[key];
      if (key === 'nextAction') delete patch.actionSeverity;
    } else if (key === 'bossName') {
      patch.bossName = value;
    } else if (key === 'nextAction') {
      patch.nextAction = value.slice(0, 100);
      patch.actionSeverity ??= 'normal';
    } else if (key === 'actionSeverity') {
      patch.actionSeverity = value === 'grave' ? 'grave' : 'normal';
    } else {
      (patch as Record<string, string | number>)[key] = Number(value);
      if (
        key === 'maxHealth' &&
        selectedIndex === 0 &&
        bossId === draft?.bossSlots[0]?.bossId
      ) {
        patch.currentHealth = Math.max(1, Number(value));
      }
    }
    return { ...directive, patch };
  }, `phase:${currentPhase?.id}:boss:${bossId}:${String(key)}`);

  const persistDraft = async () => {
    if (!draft) return null;
    setBusy(true);
    setMessage('');
    const result = await window.bossAPI.saveScenePlan(draft);
    setBusy(false);
    if (!result.ok || !result.state) {
      setMessage(result.error ?? 'Não foi possível salvar a cena.');
      return null;
    }
    setPlan(result.state);
    const hydratedDraft = draftFromPlan(result.state, battleStateRef.current);
    setDraft(hydratedDraft);
    setSavedDraft(hydratedDraft);
    draftHistoryRef.current = [];
    setMessage('');
    return result.state;
  };

  const addPhase = () => {
    if (!draft || draft.phases.length >= MAX_SCENE_PHASES) return;
    const ranges = createSceneRanges(
      draft.phases.length + 1,
      draft.phases[0]?.startHealth ?? 100,
    );
    const lastPhase = draft.phases[draft.phases.length - 1];
    const phases = [
      ...draft.phases.map((phase, index) => ({ ...phase, ...ranges[index] })),
      createPhaseFromPrevious(
        draft.phases.length,
        lastPhase,
        ranges[ranges.length - 1],
      ),
    ];
    mutateDraft(() => ({ ...draft, phases }), 'add-phase');
    setSelectedIndex(phases.length - 1);
    setMessage('');
  };

  const deletePhaseAt = (phaseIndex: number) => {
    if (!draft || phaseIndex === 0) return;
    const removedPhase = draft.phases[phaseIndex];
    const remaining = draft.phases
      .filter((_, index) => index !== phaseIndex)
      .map((phase) => ({
        ...phase,
        bosses: phase.bosses.map((directive) => ({
          ...directive,
          patch: { ...directive.patch },
        })),
      }));
    const removedBossIds = new Set<string>();
    for (const slot of draft.bossSlots.filter((item) => !item.original)) {
      const removedDirective = removedPhase?.bosses.find(
        (directive) => directive.bossId === slot.bossId,
      );
      if (removedDirective?.presence !== 'present') continue;
      const introducedEarlier = draft.phases.slice(0, phaseIndex).some(
        (phase) => phase.bosses.some(
          (directive) => directive.bossId === slot.bossId &&
            directive.presence === 'present',
        ),
      );
      if (!introducedEarlier) {
        removedBossIds.add(slot.bossId);
      }
    }
    const bossSlots = draft.bossSlots.filter(
      (slot) => !removedBossIds.has(slot.bossId),
    );
    const phasesWithoutOrphans = remaining.map((phase) => ({
      ...phase,
      bosses: phase.bosses.filter(
        (directive) => !removedBossIds.has(directive.bossId),
      ),
    }));
    const ranges = createSceneRanges(
      phasesWithoutOrphans.length,
      phasesWithoutOrphans[0]?.startHealth ?? 100,
    );
    const phases = phasesWithoutOrphans.map((phase, index) => ({ ...phase, ...ranges[index] }));
    mutateDraft(() => ({ ...draft, bossSlots, phases }), `delete-phase:${removedPhase?.id ?? phaseIndex}`);
    if (removedBossIds.has(selectedBossId)) {
      setSelectedBossId(bossSlots[0]?.bossId ?? '');
    }
    setSelectedIndex((index) => Math.min(
      index > phaseIndex ? index - 1 : index,
      phases.length - 1,
    ));
    setPhaseToDelete(null);
    setMessage('');
  };

  const phaseHasCustomContent = (phase: ScenePhaseDraft, phaseIndex: number) => {
    const previous = draft?.phases[phaseIndex - 1];
    const expectedRange = draft
      ? createSceneRanges(draft.phases.length, draft.phases[0]?.startHealth ?? 100)[phaseIndex]
      : null;
    return phase.name.trim() !== `Fase ${phaseIndex + 1}` ||
      Boolean(phase.background || phase.transitionSound || phase.music) ||
      phase.transition !== previous?.transition ||
      phase.transitionDurationSeconds !== previous?.transitionDurationSeconds ||
      phase.transitionSoundDelaySeconds !== previous?.transitionSoundDelaySeconds ||
      phase.startHealth !== expectedRange?.startHealth ||
      phase.endHealth !== expectedRange?.endHealth ||
      phase.bosses.some((directive) => {
        const inherited = previous?.bosses.some(
          (item) => item.bossId === directive.bossId,
        );
        return !inherited ||
          directive.presence !== 'inherit' ||
          Object.keys(directive.patch).length > 0;
      });
  };

  const requestPhaseDeletion = (phaseIndex: number) => {
    const phase = draft?.phases[phaseIndex];
    if (!phase || phaseIndex === 0) return;
    if (!phaseHasCustomContent(phase, phaseIndex)) {
      deletePhaseAt(phaseIndex);
      return;
    }
    setPhaseToDelete(phaseIndex);
  };

  const chooseMedia = async (slot: SceneMediaSlot) => {
    if (!currentPhase) return;
    setBusy(true);
    const result = await window.bossAPI.chooseScenePhaseMedia(currentPhase.id, slot);
    setBusy(false);
    if (result.ok && (result.media || result.playlist)) {
      updatePhase((phase) => ({
        ...phase,
        [slot]: slot === 'background' ? result.media : result.playlist,
      }));
      setMessage('');
    } else if (!result.canceled) {
      setMessage(result.error ?? 'Não foi possível selecionar a mídia.');
    }
  };

  const openPlaylist = async (slot: SceneAudioSlot) => {
    if (!currentPhase) return;
    const state = await window.bossAPI.openScenePhasePlaylist(
      currentPhase.id,
      slot,
      currentPhase.name,
      currentPhase[slot],
    );
    if (state) setPlaylistModal(state);
    else setMessage('Não foi possível abrir a playlist desta fase.');
  };

  const clearMedia = async (slot: SceneMediaSlot) => {
    if (!currentPhase) return;
    setBusy(true);
    const result = await window.bossAPI.clearScenePhaseMedia(currentPhase.id, slot);
    setBusy(false);
    if (result.ok) {
      updatePhase((phase) => ({ ...phase, [slot]: null }));
      setMessage('');
    } else {
      setMessage(result.error ?? 'Não foi possível remover a mídia.');
    }
  };

  const addBossSlot = () => {
    if (!draft || draft.bossSlots.length >= 3) return;
    const bossId = `scene-boss-${crypto.randomUUID()}`;
    const slot = {
      bossId,
      label: `Novo Chefão ${draft.bossSlots.length + 1}`,
      original: false,
    };
    const bossSlots = [...draft.bossSlots, slot];
    const appearanceIndex = selectedIndex;
    const defaults = identityPatchFromBoss({
      ...createInitialBoss(bossId, draft.bossSlots.length),
      bossName: slot.label,
    });
    const phases = draft.phases.map((phase, index) => ({
      ...phase,
      bosses: [...phase.bosses, {
        bossId,
        presence: index < appearanceIndex
          ? 'absent' as const
          : index === appearanceIndex ? 'present' as const : 'inherit' as const,
        carryOverflowDamage: true,
        patch: index === appearanceIndex ? defaults : {},
      }],
    }));
    mutateDraft(() => ({
      ...draft,
      bossSlots,
      phases,
    }), `add-boss:${bossId}`);
    setSelectedBossId(bossId);
    setMessage('Novo chefão adicionado ao rascunho da cena.');
  };

  const removeBossSlot = () => {
    if (!draft || !bossToDelete) return;
    const slot = draft.bossSlots.find((item) => item.bossId === bossToDelete);
    if (!slot || slot.original) return;
    const bossSlots = draft.bossSlots.filter((item) => item.bossId !== bossToDelete);
    mutateDraft(() => ({
      ...draft,
      bossSlots,
      phases: draft.phases.map((phase) => ({
        ...phase,
        bosses: phase.bosses.filter((directive) => directive.bossId !== bossToDelete),
      })),
    }), `remove-boss:${bossToDelete}`);
    if (selectedBossId === bossToDelete) {
      setSelectedBossId(bossSlots[0]?.bossId ?? '');
    }
    setBossToDelete(null);
    setMessage('Chefão removido do rascunho da cena.');
  };

  const resolvedMedia = useMemo(() => {
    if (!draft || !currentPhase) return {} as Partial<Record<SceneMediaSlot, string>>;
    const values: Partial<Record<SceneMediaSlot, string>> = {};
    for (let index = 0; index <= selectedIndex; index += 1) {
      const phase = draft.phases[index];
      if (phase.background) values.background = phase.background.name;
    }
    return values;
  }, [currentPhase, draft, selectedIndex]);

  const selectedPhaseVitals = useMemo(() => {
    const primaryBossId = draft?.bossSlots[0]?.bossId;
    const base = battleState?.bosses.find((boss) => boss.id === primaryBossId);
    let maximum = base?.maxHealth ?? 500;
    let current = base?.currentHealth ?? maximum;
    return draft?.phases.map((phase) => {
      const patch = phase.bosses.find(
        (directive) => directive.bossId === primaryBossId,
      )?.patch ?? {};
      maximum = Math.max(1, patch.maxHealth ?? maximum);
      current = Math.max(0, Math.min(maximum, patch.currentHealth ?? current));
      return { maximum, current };
    }) ?? [];
  }, [battleState, draft]);

  const currentTriggerVitals = selectedPhaseVitals[selectedIndex] ?? {
    maximum: 500,
    current: 500,
  };
  const firstPhaseExpectedStart = selectedPhaseVitals[0]?.current ?? 500;
  const phaseBossSlots = useMemo(() => draft?.bossSlots.filter((slot) =>
    bossIsPresentInPhase(draft, slot.bossId, selectedIndex)) ?? [], [draft, selectedIndex]);

  useEffect(() => {
    if (
      phaseBossSlots.length > 0 &&
      !phaseBossSlots.some((slot) => slot.bossId === selectedBossId)
    ) {
      setSelectedBossId(phaseBossSlots[0].bossId);
    }
  }, [phaseBossSlots, selectedBossId]);

  useEffect(() => {
    setDraft((current) => {
      if (!current || current.phases[0]?.startHealth === firstPhaseExpectedStart) {
        return current;
      }
      const ranges = createSceneRanges(current.phases.length, firstPhaseExpectedStart);
      return {
        ...current,
        phases: current.phases.map((phase, index) => ({
          ...phase,
          ...ranges[index],
        })),
      };
    });
  }, [firstPhaseExpectedStart]);

  const resetDraft = async () => {
    setBusy(true);
    const nextDraft = await window.bossAPI.resetSceneDraft();
    setBusy(false);
    setResetConfirmationOpen(false);
    if (!nextDraft) {
      setMessage('Não foi possível preparar a cena padrão.');
      return;
    }
    mutateDraft(() => nextDraft, 'reset-scene');
    setSelectedBossId(nextDraft.bossSlots[0]?.bossId ?? '');
    setSelectedIndex(0);
    setPlaylistModal(null);
    setMessage('');
  };

  if (!plan || !draft || !currentPhase) {
    return <main className="scene-loading">Preparando o editor de cena...</main>;
  }
  const selectedSlot = draft.bossSlots.find((slot) => slot.bossId === selectedBossId) ??
    draft.bossSlots[0];
  const currentDirective = currentPhase.bosses.find(
    (directive) => directive.bossId === selectedBossId,
  ) ?? {
    bossId: selectedBossId,
    presence: 'inherit' as const,
    carryOverflowDamage: true,
    patch: {},
  };
  const resolvedCurrentBoss = resolvedBossInPhase(
    draft,
    battleState,
    selectedBossId,
    selectedIndex,
  );

  return (
    <main className="scene-shell">
      <header className="scene-header">
        <div>
          <p>Direção do encontro</p>
          <h1>Editar cena</h1>
        </div>
        <button
          className="scene-reset-button"
          type="button"
          disabled={busy}
          data-disabled-reason="Aguarde a operação atual"
          onClick={() => setResetConfirmationOpen(true)}
        >Resetar</button>
        {(rangeError || message) && (
          <p className="scene-header-error" role="alert">{rangeError ?? message}</p>
        )}
      </header>

      <div className="scene-workspace">
        <aside className="phase-timeline">
          <div className="timeline-title">
            <span>Progressão</span>
            <button
              type="button"
              title="Adicionar fase"
              aria-label="Adicionar fase"
              disabled={draft.phases.length >= MAX_SCENE_PHASES}
              data-disabled-reason="Limite de oito fases atingido"
              onClick={addPhase}
            >+</button>
          </div>
          {draft.phases.map((phase, index) => (
            <div
              className={index === selectedIndex ? 'is-selected' : ''}
              key={phase.id}
            >
              <button
                className="phase-select-button"
                type="button"
                onClick={() => setSelectedIndex(index)}
              >
                <span>{index + 1}</span>
                <strong>{phase.name}</strong>
                <small>
                  <span>{phase.startHealth} → {phase.endHealth} PV</span>
                  <span>{Math.round((phase.startHealth / (
                    selectedPhaseVitals[index]?.maximum ?? 500
                  )) * 100)}% → {Math.round((phase.endHealth / (
                    selectedPhaseVitals[index]?.maximum ?? 500
                  )) * 100)}%</span>
                </small>
              </button>
              <button
                className="phase-delete-button"
                type="button"
                title="Excluir fase"
                aria-label={`Excluir ${phase.name}`}
                disabled={index === 0}
                data-disabled-reason="A primeira fase é obrigatória"
                onClick={() => requestPhaseDeletion(index)}
              >×</button>
            </div>
          ))}
          <div className="timeline-active">
            {plan.activePhaseIndex >= 0
              ? `Em execução: Fase ${plan.activePhaseIndex + 1}`
              : 'Aguardando início da batalha'}
          </div>
        </aside>

        <section className="phase-editor">
          <section className="scene-card phase-identity-card">
            <div className="scene-card-heading">
              <label>
                <span>Nome da fase</span>
                <input maxLength={60} value={currentPhase.name} onChange={(event) => updatePhase((phase) => ({ ...phase, name: event.target.value }), `phase:${currentPhase.id}:name`)} />
              </label>
              <label className="phase-overflow-toggle" title="Define se o dano excedente atravessa a mudança de fase">
                <input
                  type="checkbox"
                  checked={currentDirective.carryOverflowDamage}
                  onChange={(event) => updateDirective(selectedBossId, (directive) => ({
                    ...directive,
                    carryOverflowDamage: event.target.checked,
                  }), `phase:${currentPhase.id}:boss:${selectedBossId}:overflow`)}
                />
                <span>Dano excedente avança de fase</span>
              </label>
            </div>
            <div className="trigger-grid">
              <label><span>Começa em</span><div className="health-input"><input type="number" min="1" max={selectedIndex === 0 ? currentTriggerVitals.current : currentTriggerVitals.maximum} disabled={selectedIndex === 0} data-disabled-reason="A Fase 1 começa na vida atual" value={currentPhase.startHealth} onChange={(event) => setPhaseStartHealth(Number(event.target.value))} /><b>PV</b></div></label>
              <label><span>Encerra em</span><div className="health-input"><input type="number" min="0" max={Math.max(0, currentPhase.startHealth - 1)} value={currentPhase.endHealth} onChange={(event) => setPhaseEndHealth(Number(event.target.value))} /><b>PV</b></div></label>
              <label><span>Transição</span><select disabled={selectedIndex === draft.phases.length - 1} data-disabled-reason="A última fase não possui transição" value={currentPhase.transition} onChange={(event) => updatePhase((phase) => ({ ...phase, transition: event.target.value as SceneTransitionKind, transitionDurationSeconds: event.target.value === 'blackout' ? 0 : Math.max(0.01, phase.transitionDurationSeconds || 2), transitionSoundDelaySeconds: event.target.value === 'blackout' ? 0 : phase.transitionSoundDelaySeconds }), `phase:${currentPhase.id}:transition`)}>{Object.entries(transitionLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label><span>Duração</span><div className="seconds-input"><input type="number" inputMode="decimal" min="0.01" max="10" step="0.01" disabled={selectedIndex === draft.phases.length - 1 || currentPhase.transition === 'blackout'} data-disabled-reason={selectedIndex === draft.phases.length - 1 ? 'A última fase não possui transição' : 'Blackout é imediato'} value={currentPhase.transition === 'blackout' ? 0 : currentPhase.transitionDurationSeconds} onChange={(event) => updatePhase((phase) => ({ ...phase, transitionDurationSeconds: Math.max(0.01, Math.min(10, Number(event.target.value))), transitionSoundDelaySeconds: Math.min(phase.transitionSoundDelaySeconds, Number(event.target.value)) }), `phase:${currentPhase.id}:duration`)} /><b>s</b></div></label>
            </div>
          </section>

          <section className="scene-card">
            <div className="phase-media-grid">
              <article className="phase-media">
                <span>{mediaLabels.background}</span>
                <strong title={currentPhase.background?.name ?? resolvedMedia.background ?? ''}>{currentPhase.background?.name ?? resolvedMedia.background ?? 'Não definido'}</strong>
                <small>{currentPhase.background ? 'Definido nesta fase' : resolvedMedia.background ? 'Herdado de fase anterior' : 'Sem fundo definido'}</small>
                <div>
                  <button type="button" disabled={busy} data-disabled-reason="Aguarde a operação atual" onClick={() => void chooseMedia('background')}>Upload</button>
                  {currentPhase.background && <button className="media-clear" type="button" disabled={busy} data-disabled-reason="Aguarde a operação atual" onClick={() => void clearMedia('background')}>Remover</button>}
                </div>
              </article>
              <PhasePlaylistCard
                busy={busy}
                label={mediaLabels.transitionSound}
                phaseId={currentPhase.id}
                playlist={currentPhase.transitionSound}
                slot="transitionSound"
                onOpen={() => void openPlaylist('transitionSound')}
                disabled={selectedIndex === draft.phases.length - 1}
                extraControl={<label className="transition-sound-delay">
                  <span>Início</span>
                  <div className="seconds-input">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max={currentPhase.transitionDurationSeconds}
                      step="0.01"
                      disabled={selectedIndex === draft.phases.length - 1 || currentPhase.transition === 'blackout'}
                      data-disabled-reason={selectedIndex === draft.phases.length - 1 ? 'A última fase não possui transição' : 'Blackout é imediato'}
                      value={currentPhase.transitionSoundDelaySeconds}
                      onChange={(event) => updatePhase((phase) => ({
                        ...phase,
                        transitionSoundDelaySeconds: Math.max(
                          0,
                          Math.min(phase.transitionDurationSeconds, Number(event.target.value)),
                        ),
                      }))}
                    />
                    <b>s</b>
                  </div>
                </label>}
              />
              <PhasePlaylistCard
                busy={busy}
                label={mediaLabels.music}
                phaseId={currentPhase.id}
                playlist={currentPhase.music}
                slot="music"
                onOpen={() => void openPlaylist('music')}
              />
            </div>
            <p className="large-media-warning">
              Limite de 100 MB por arquivo. Muitos arquivos grandes acumulados podem deixar o programa lento ou travar durante a reprodução.
            </p>
          </section>

          <section className="scene-card phase-boss-card">
            <nav className="phase-boss-tabs" aria-label={`Chefões de ${currentPhase.name}`}>
              {phaseBossSlots.map((slot, index) => (
                <button
                  className={slot.bossId === selectedBossId ? 'is-selected' : ''}
                  type="button"
                  key={slot.bossId}
                  onClick={() => {
                    setSelectedBossId(slot.bossId);
                    setMessage('');
                  }}
                >
                  <span>{index + 1}</span>
                  <strong>{bossNameInPhase(draft, slot.bossId, selectedIndex)}</strong>
                </button>
              ))}
              <button
                className="scene-add-boss-tab"
                type="button"
                aria-label="Adicionar chefão nesta fase"
                data-disabled-reason={busy
                  ? 'Aguarde a operação atual'
                  : 'Limite de três chefões atingido'}
                disabled={busy || draft.bossSlots.length >= 3}
                onClick={addBossSlot}
              >+</button>
            </nav>
            <article className={`phase-boss ${currentDirective.presence === 'absent' ? 'is-absent' : ''}`}>
              <header>
                <strong>{bossNameInPhase(draft, selectedSlot.bossId, selectedIndex)}</strong>
                <div>
                  {!selectedSlot.original && <button className="remove-scene-boss" type="button" title="Remover chefão da cena" aria-label={`Remover ${selectedSlot.label}`} onClick={() => setBossToDelete(selectedBossId)}>×</button>}
                </div>
              </header>
              <div className="boss-values">
                <label className="boss-name-override"><span>Nome</span><input maxLength={100} placeholder="Nome do chefão" value={resolvedCurrentBoss.bossName ?? ''} onChange={(event) => setPatchValue(selectedBossId, 'bossName', event.target.value)} /></label>
                {([
                  ['maxHealth', 'Vida máx.'], ['currentHealth', 'Vida atual'], ['attack', 'Ataque'], ['rangedAttack', 'Tiro'], ['skills', 'Perícias'],
                  ['defense', 'Def. CaC'], ['rangedDefense', 'Def. AaD'], ['damageReduction', 'RD'], ['shield', 'Escudo'],
                ] as const).map(([key, label]) => <label key={key}><span>{label}</span><input type="number" placeholder="—" value={resolvedCurrentBoss[key] ?? ''} onChange={(event) => setPatchValue(selectedBossId, key, event.target.value)} /></label>)}
              </div>
              <div className="boss-action-values">
                <label>
                  <span>Descrição da ação <small>(opcional)</small></span>
                  <textarea
                    maxLength={100}
                    rows={2}
                    placeholder="Descrever a próxima ação para preparar os jogadores"
                    value={currentDirective.patch.nextAction ?? ''}
                    onChange={(event) => setPatchValue(selectedBossId, 'nextAction', event.target.value)}
                  />
                </label>
                <label>
                  <span>Tipo da ação</span>
                  <select
                    value={currentDirective.patch.actionSeverity ?? 'normal'}
                    disabled={!currentDirective.patch.nextAction}
                    data-disabled-reason="Preencha a descrição primeiro"
                    onChange={(event) => setPatchValue(selectedBossId, 'actionSeverity', event.target.value)}
                  >
                    <option value="normal">Ação padrão</option>
                    <option value="grave">Ação grave</option>
                  </select>
                </label>
              </div>
            </article>
          </section>
        </section>
      </div>

      <footer className="scene-footer">
        <button type="button" disabled={busy || Boolean(rangeError) || !dirty} data-disabled-reason={busy ? 'Aguarde o salvamento atual' : rangeError ? 'Corrija as margens das fases' : 'Nenhuma alteração para salvar'} onClick={() => void persistDraft()}>{busy ? 'Salvando...' : 'Salvar cena'}</button>
      </footer>

      {playlistModal && (
        <ScenePlaylistModal
          state={playlistModal}
          onClose={() => setPlaylistModal(null)}
        />
      )}

      {phaseToDelete !== null && (
        <div className="scene-modal-backdrop">
          <section className="scene-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="delete-phase-title">
            <h2 id="delete-phase-title">Excluir fase?</h2>
            <p>
              A {draft.phases[phaseToDelete]?.name ?? 'fase selecionada'} e suas
              configurações serão removidas quando a cena for salva.
            </p>
            <div>
              <button type="button" onClick={() => setPhaseToDelete(null)}>Cancelar</button>
              <button className="is-destructive" type="button" onClick={() => deletePhaseAt(phaseToDelete)}>Excluir fase</button>
            </div>
          </section>
        </div>
      )}

      {bossToDelete && (
        <div className="scene-modal-backdrop">
          <section className="scene-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="delete-scene-boss-title">
            <h2 id="delete-scene-boss-title">Remover chefão da cena?</h2>
            <p>
              O chefão adicionado e todas as configurações dele nas fases serão
              removidos quando a cena for salva.
            </p>
            <div>
              <button type="button" onClick={() => setBossToDelete(null)}>Cancelar</button>
              <button className="is-destructive" type="button" onClick={removeBossSlot}>Remover chefão</button>
            </div>
          </section>
        </div>
      )}

      {resetConfirmationOpen && (
        <div className="scene-modal-backdrop">
          <section className="scene-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="reset-scene-title">
            <h2 id="reset-scene-title">Resetar toda a cena?</h2>
            <p>
              Todas as fases, chefões adicionais, mídias e playlists do rascunho
              serão removidos. A alteração só entrará em vigor após salvar a cena.
            </p>
            <div>
              <button type="button" onClick={() => setResetConfirmationOpen(false)}>Cancelar</button>
              <button className="is-destructive" type="button" onClick={() => void resetDraft()}>Resetar cena</button>
            </div>
          </section>
        </div>
      )}

      {closeConfirmationOpen && (
        <div className="scene-modal-backdrop">
          <section className="scene-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="close-scene-title">
            <h2 id="close-scene-title">Descartar alterações?</h2>
            <p>Há mudanças ainda não salvas no editor de cena.</p>
            <div>
              <button type="button" onClick={() => setCloseConfirmationOpen(false)}>Continuar editando</button>
              <button className="is-destructive" type="button" onClick={() => window.bossAPI.confirmSceneEditorClose()}>Descartar e fechar</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
};

const root = document.getElementById('root');
if (!root) throw new Error('Elemento raiz não encontrado.');
createRoot(root).render(<SceneEditorApp />);
