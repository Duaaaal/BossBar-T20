import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
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

const draftFromPlan = (plan: ScenePlan): ScenePlanDraft => ({
  bossSlots: plan.bossSlots.map((slot) => ({ ...slot })),
  showPhaseMarkers: plan.showPhaseMarkers,
  phases: plan.phases.map((phase) => ({
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
      presence: plan.bossSlots.length === 1 && directive.presence === 'present'
        ? 'inherit'
        : directive.presence,
      patch: { ...directive.patch },
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
    patch: { ...directive.patch },
  })),
});

const PhasePlaylistCard = ({
  busy,
  label,
  phaseId,
  playlist,
  slot,
  onOpen,
  disabled = false,
}: {
  busy: boolean;
  label: string;
  phaseId: string;
  playlist: ScenePlaylistSummary | null;
  slot: SceneAudioSlot;
  onOpen: () => void;
  disabled?: boolean;
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const currentTrack = playlist?.tracks.find(
    (track) => track.id === playlist.currentTrackId,
  ) ?? playlist?.tracks[0] ?? null;
  const canNavigate = (playlist?.tracks.length ?? 0) > 1;
  const dispatch = (command: Parameters<typeof window.bossAPI.dispatchScenePhasePlaylist>[2]) =>
    window.bossAPI.dispatchScenePhasePlaylist(phaseId, slot, command);

  useEffect(() => {
    if (!audioRef.current || !playlist) return;
    audioRef.current.volume = Math.max(0, Math.min(1, playlist.volume));
    audioRef.current.muted = playlist.muted;
    audioRef.current.loop = playlist.loop;
  }, [playlist?.loop, playlist?.muted, playlist?.volume]);

  useEffect(() => {
    audioRef.current?.pause();
    setPlaying(false);
  }, [currentTrack?.id]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
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
    <article className="phase-media phase-playlist-card">
      <span>{label}</span>
      <strong title={currentTrack?.name ?? ''}>
        {currentTrack?.name ?? 'Nenhuma faixa selecionada'}
      </strong>
      <small>{playlist?.tracks.length ?? 0} faixa(s) nesta fase</small>
      <div className="phase-audio-source-actions">
        <button type="button" disabled={busy || disabled} onClick={onOpen}>Montar playlist</button>
      </div>
      <div className="phase-audio-controls">
        <button type="button" title="Faixa anterior" disabled={disabled || !canNavigate} onClick={() => dispatch({ type: 'previous' })}>&#9198;</button>
        <button type="button" title={playing ? 'Pausar' : 'Reproduzir'} disabled={disabled || !currentTrack} onClick={() => void togglePlayback()}>{playing ? '\u23F8' : '\u25B6'}</button>
        <button type="button" title="Próxima faixa" disabled={disabled || !canNavigate} onClick={() => dispatch({ type: 'next' })}>&#9197;</button>
        <button type="button" className={playlist?.loop ? 'is-active' : ''} title="Loop" disabled={disabled || !currentTrack} onClick={() => dispatch({ type: 'set-loop', loop: !playlist?.loop })}>&#8635;</button>
        <button type="button" title={playlist?.muted ? 'Ativar som' : 'Mutar'} disabled={disabled || !playlist} onClick={() => dispatch({ type: 'set-muted', muted: !playlist?.muted })}>{playlist?.muted ? '\uD83D\uDD07' : '\uD83D\uDD0A'}</button>
        <input
          type="range"
          aria-label={`Volume de ${label}`}
          min="0"
          max="1"
          step="0.01"
          value={playlist?.volume ?? 0.8}
          disabled={disabled || !playlist}
          onChange={(event) => dispatch({ type: 'set-volume', volume: Number(event.target.value) })}
        />
      </div>
      <audio
        ref={audioRef}
        src={currentTrack?.url}
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
    audio.volume = Math.max(0, Math.min(1, state.volume));
    audio.muted = state.muted;
    audio.loop = state.loop;
  }, [state.loop, state.muted, state.volume]);

  useEffect(() => {
    setTime(0);
    setPlaying(false);
    if (!playAfterSelection.current || !audioRef.current || !currentTrack) return;
    playAfterSelection.current = false;
    void audioRef.current.play().catch(() => {
      setMessage('Não foi possível reproduzir esta faixa.');
    });
  }, [currentTrack?.id]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
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
            <button type="button" disabled={state.tracks.length === 0} onClick={() => setClearOpen(true)}>Limpar playlist</button>
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
            <input type="range" aria-label="Posição da faixa" min="0" max={Math.max(0, duration)} step="0.1" value={Math.min(time, duration)} disabled={!currentTrack} onChange={(event) => {
              if (!audioRef.current) return;
              const nextTime = Number(event.target.value);
              audioRef.current.currentTime = nextTime;
              setTime(nextTime);
            }} />
            <span>{formatTime(duration)}</span>
          </label>
          <div className="scene-playlist-controls">
            <button type="button" disabled={!canNavigate} title="Faixa anterior" onClick={() => dispatch({ type: 'previous' })}>&#9198;</button>
            <button className="scene-playlist-play" type="button" disabled={!currentTrack} onClick={() => void togglePlayback()}>{playing ? '\u23F8' : '\u25B6'}</button>
            <button type="button" disabled={!canNavigate} title="Próxima faixa" onClick={() => dispatch({ type: 'next' })}>&#9197;</button>
            <button className={state.loop ? 'is-active' : ''} type="button" disabled={!currentTrack} onClick={() => dispatch({ type: 'set-loop', loop: !state.loop })}>Loop</button>
          </div>
          <div className="scene-playlist-volume">
            <button type="button" aria-label={state.muted ? 'Ativar som' : 'Mutar'} onClick={() => dispatch({ type: 'set-muted', muted: !state.muted })}>{state.muted ? '\uD83D\uDD07' : '\uD83D\uDD0A'}</button>
            <input type="range" aria-label="Volume" min="0" max="1" step="0.01" value={state.volume} onChange={(event) => dispatch({ type: 'set-volume', volume: Number(event.target.value) })} />
            <span>{Math.round(state.volume * 100)}%</span>
          </div>
          {message && <p className="scene-playlist-message" role="alert">{message}</p>}
        </section>

        <audio ref={audioRef} src={currentTrack?.url} preload="metadata" muted={state.muted} loop={state.loop} onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} />

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
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [battleState, setBattleState] = useState<Awaited<ReturnType<typeof window.bossAPI.getState>> | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [playlistModal, setPlaylistModal] = useState<ScenePlaylistState | null>(null);
  const [phaseToDelete, setPhaseToDelete] = useState<number | null>(null);
  const [bossToDelete, setBossToDelete] = useState<string | null>(null);
  const [closeConfirmationOpen, setCloseConfirmationOpen] = useState(false);
  const dirtyRef = useRef(false);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    let active = true;
    window.bossAPI.getScenePlan().then((state) => {
      if (!active) return;
      setPlan(state);
      setDraft(draftFromPlan(state));
    });
    const unsubscribe = window.bossAPI.subscribeScenePlan((state) => {
      if (!active) return;
      setPlan(state);
      if (!dirtyRef.current) setDraft(draftFromPlan(state));
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    window.bossAPI.getState().then((state) => {
      if (active) setBattleState(state);
    });
    const unsubscribe = window.bossAPI.subscribe((state) => {
      if (active) setBattleState(state);
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
      dirtyRef.current = true;
      setDirty(true);
    }),
    [],
  );

  const currentPhase = draft?.phases[selectedIndex] ?? null;
  const rangeError = draft ? validateSceneRanges(draft.phases) : null;
  const markDirty = () => {
    dirtyRef.current = true;
    setDirty(true);
  };

  const updatePhase = (updater: (phase: ScenePhaseDraft) => ScenePhaseDraft) => {
    setDraft((current) => current ? {
      ...current,
      phases: current.phases.map((phase, index) =>
        index === selectedIndex ? updater(phase) : phase),
    } : current);
    markDirty();
    setMessage('');
  };

  const setPhaseStartHealth = (value: number) => {
    setDraft((current) => current ? {
      ...current,
      phases: current.phases.map((phase, index) => {
        if (index === selectedIndex) return { ...phase, startHealth: value };
        if (index === selectedIndex - 1) return { ...phase, endHealth: value };
        return phase;
      }),
    } : current);
    markDirty();
    setMessage('');
  };

  const setPhaseEndHealth = (value: number) => {
    setDraft((current) => current ? {
      ...current,
      phases: current.phases.map((phase, index) => {
        if (index === selectedIndex) return { ...phase, endHealth: value };
        if (index === selectedIndex + 1) return { ...phase, startHealth: value };
        return phase;
      }),
    } : current);
    markDirty();
    setMessage('');
  };

  const updateDirective = (
    bossId: string,
    updater: (directive: SceneBossDirective) => SceneBossDirective,
  ) => updatePhase((phase) => ({
    ...phase,
    bosses: phase.bosses.map((directive) =>
      directive.bossId === bossId ? updater(directive) : directive),
  }));

  const setPatchValue = (
    bossId: string,
    key: keyof SceneBossPatch,
    value: string,
  ) => updateDirective(bossId, (directive) => {
    const patch = { ...directive.patch };
    if (!value.trim()) {
      delete patch[key];
    } else if (key === 'bossName') {
      patch.bossName = value;
    } else {
      (patch as Record<string, string | number>)[key] = Number(value);
    }
    return { ...directive, patch };
  });

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
    setDraft(draftFromPlan(result.state));
    dirtyRef.current = false;
    setDirty(false);
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
    setDraft({ ...draft, phases });
    setSelectedIndex(phases.length - 1);
    markDirty();
    setMessage('');
  };

  const deletePhase = () => {
    if (!draft || phaseToDelete === null || draft.phases.length === 1) return;
    const remaining = draft.phases.filter((_, index) => index !== phaseToDelete);
    const ranges = createSceneRanges(
      remaining.length,
      remaining[0]?.startHealth ?? 100,
    );
    const phases = remaining.map((phase, index) => ({ ...phase, ...ranges[index] }));
    setDraft({ ...draft, phases });
    setSelectedIndex((index) => Math.min(
      index > phaseToDelete ? index - 1 : index,
      phases.length - 1,
    ));
    setPhaseToDelete(null);
    markDirty();
    setMessage('');
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
    setDraft({
      ...draft,
      bossSlots: [...draft.bossSlots, slot],
      phases: draft.phases.map((phase) => ({
        ...phase,
        bosses: [...phase.bosses, {
          bossId,
          presence: 'inherit' as const,
          patch: {},
        }],
      })),
    });
    markDirty();
    setMessage('Novo chefão adicionado ao rascunho da cena.');
  };

  const removeBossSlot = () => {
    if (!draft || !bossToDelete) return;
    const slot = draft.bossSlots.find((item) => item.bossId === bossToDelete);
    if (!slot || slot.original) return;
    const bossSlots = draft.bossSlots.filter((item) => item.bossId !== bossToDelete);
    setDraft({
      ...draft,
      bossSlots,
      phases: draft.phases.map((phase) => ({
        ...phase,
        triggerBossId: phase.triggerBossId === bossToDelete
          ? bossSlots[0]?.bossId ?? phase.triggerBossId
          : phase.triggerBossId,
        bosses: phase.bosses.filter((directive) => directive.bossId !== bossToDelete),
      })),
    });
    setBossToDelete(null);
    markDirty();
    setMessage('Chefão removido do rascunho da cena.');
  };

  const resolvedMedia = useMemo(() => {
    if (!draft || !currentPhase) return {} as Partial<Record<SceneMediaSlot, string>>;
    const values: Partial<Record<SceneMediaSlot, string>> = {};
    const targetIndex = draft.phases.findIndex((phase) => phase.id === currentPhase.id);
    for (let index = 0; index <= targetIndex; index += 1) {
      const phase = draft.phases[index];
      if (phase.background) values.background = phase.background.name;
    }
    return values;
  }, [currentPhase, draft]);

  const phaseVitals = useMemo(() => {
    if (!draft) return [];
    const vitals = new Map(
      battleState?.bosses.map((boss) => [boss.id, {
        maximum: boss.maxHealth,
        current: boss.currentHealth,
      }]) ?? [],
    );
    draft.bossSlots.forEach((slot) => {
      if (!vitals.has(slot.bossId)) vitals.set(slot.bossId, { maximum: 500, current: 500 });
    });
    return draft.phases.map((phase) => {
      phase.bosses.forEach((directive) => {
        const previous = vitals.get(directive.bossId) ?? { maximum: 500, current: 500 };
        const maximum = Math.max(1, directive.patch.maxHealth ?? previous.maximum);
        const current = Math.max(
          0,
          Math.min(maximum, directive.patch.currentHealth ?? previous.current),
        );
        vitals.set(directive.bossId, { maximum, current });
      });
      return new Map(vitals);
    });
  }, [battleState, draft]);

  const currentTriggerVitals = phaseVitals[selectedIndex]?.get(
    currentPhase?.triggerBossId ?? '',
  ) ?? { maximum: 500, current: 500 };
  const firstPhaseExpectedStart = draft
    ? phaseVitals[0]?.get(draft.phases[0].triggerBossId)?.current ?? 500
    : 500;

  useEffect(() => {
    setDraft((current) => {
      if (!current || current.phases[0].startHealth === firstPhaseExpectedStart) {
        return current;
      }
      dirtyRef.current = true;
      setDirty(true);
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

  if (!plan || !draft || !currentPhase) {
    return <main className="scene-loading">Preparando o editor de cena...</main>;
  }

  return (
    <main className="scene-shell">
      <header className="scene-header">
        <div>
          <p>Direção do encontro</p>
          <h1>Editar cena</h1>
        </div>
        <label className="phase-markers-toggle">
          <input
            type="checkbox"
            checked={draft.showPhaseMarkers}
            onChange={(event) => {
              setDraft({ ...draft, showPhaseMarkers: event.target.checked });
              markDirty();
              setMessage('');
            }}
          />
          <span>Marcadores de mudança na barra de vida</span>
        </label>
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
                  {phase.startHealth} → {phase.endHealth} PV{' '}
                  ({Math.round((phase.startHealth / (
                    phaseVitals[index]?.get(phase.triggerBossId)?.maximum ?? 500
                  )) * 100)}% → {Math.round((phase.endHealth / (
                    phaseVitals[index]?.get(phase.triggerBossId)?.maximum ?? 500
                  )) * 100)}%)
                </small>
              </button>
              <button
                className="phase-delete-button"
                type="button"
                title="Excluir fase"
                aria-label={`Excluir ${phase.name}`}
                disabled={draft.phases.length === 1}
                onClick={() => setPhaseToDelete(index)}
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
                <input maxLength={60} value={currentPhase.name} onChange={(event) => updatePhase((phase) => ({ ...phase, name: event.target.value }))} />
              </label>
            </div>
            <div className="trigger-grid">
              <label>
                <span>Chefão gatilho</span>
                <select value={currentPhase.triggerBossId} onChange={(event) => updatePhase((phase) => ({ ...phase, triggerBossId: event.target.value }))}>
                  {draft.bossSlots.map((slot) => <option value={slot.bossId} key={slot.bossId}>{slot.label}</option>)}
                </select>
              </label>
              <label><span>Começa em</span><div className="health-input"><input type="number" min="1" max={selectedIndex === 0 ? currentTriggerVitals.current : currentTriggerVitals.maximum} disabled={selectedIndex === 0} value={currentPhase.startHealth} onChange={(event) => setPhaseStartHealth(Number(event.target.value))} /><b>PV</b></div></label>
              <label><span>Encerra em</span><div className="health-input"><input type="number" min="0" max={Math.max(0, currentPhase.startHealth - 1)} value={currentPhase.endHealth} onChange={(event) => setPhaseEndHealth(Number(event.target.value))} /><b>PV</b></div></label>
              <label><span>Transição</span><select disabled={selectedIndex === draft.phases.length - 1} value={currentPhase.transition} onChange={(event) => updatePhase((phase) => ({ ...phase, transition: event.target.value as SceneTransitionKind, transitionDurationSeconds: event.target.value === 'blackout' ? 0 : Math.max(0.01, phase.transitionDurationSeconds || 2), transitionSoundDelaySeconds: event.target.value === 'blackout' ? 0 : phase.transitionSoundDelaySeconds }))}>{Object.entries(transitionLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label><span>Duração</span><div className="seconds-input"><input type="number" inputMode="decimal" min="0.01" max="10" step="0.01" disabled={selectedIndex === draft.phases.length - 1 || currentPhase.transition === 'blackout'} value={currentPhase.transition === 'blackout' ? 0 : currentPhase.transitionDurationSeconds} onChange={(event) => updatePhase((phase) => ({ ...phase, transitionDurationSeconds: Math.max(0.01, Math.min(10, Number(event.target.value))), transitionSoundDelaySeconds: Math.min(phase.transitionSoundDelaySeconds, Number(event.target.value)) }))} /><b>s</b></div></label>
            </div>
          </section>

          <section className="scene-card">
            <div className="phase-media-grid">
              <article className="phase-media">
                <span>{mediaLabels.background}</span>
                <strong title={currentPhase.background?.name ?? resolvedMedia.background ?? ''}>{currentPhase.background?.name ?? resolvedMedia.background ?? 'Não definido'}</strong>
                <small>{currentPhase.background ? 'Definido nesta fase' : resolvedMedia.background ? 'Herdado de fase anterior' : 'Sem fundo definido'}</small>
                <div>
                  <button type="button" disabled={busy} onClick={() => void chooseMedia('background')}>Upload</button>
                  {currentPhase.background && <button className="media-clear" type="button" disabled={busy} onClick={() => void clearMedia('background')}>Remover</button>}
                </div>
              </article>
              <div className={`phase-audio-stack ${selectedIndex === draft.phases.length - 1 ? 'is-disabled' : ''}`}>
                <PhasePlaylistCard
                  busy={busy}
                  label={mediaLabels.transitionSound}
                  phaseId={currentPhase.id}
                  playlist={currentPhase.transitionSound}
                  slot="transitionSound"
                  onOpen={() => void openPlaylist('transitionSound')}
                  disabled={selectedIndex === draft.phases.length - 1}
                />
                <label className="transition-sound-delay">
                  <span>Início do som</span>
                  <div className="seconds-input">
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      max={currentPhase.transitionDurationSeconds}
                      step="0.01"
                      disabled={selectedIndex === draft.phases.length - 1 || currentPhase.transition === 'blackout'}
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
                </label>
              </div>
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

          <section className="scene-card">
            <div className="scene-card-heading roster-heading">
              <button className="add-scene-boss" type="button" disabled={busy || draft.bossSlots.length >= 3} onClick={addBossSlot}>+ Novo chefão</button>
            </div>
            <div className="phase-boss-list">
              {draft.bossSlots.map((slot) => {
                const directive = currentPhase.bosses.find((item) => item.bossId === slot.bossId) ?? { bossId: slot.bossId, presence: 'inherit' as const, patch: {} };
                return (
                  <article className={`phase-boss ${directive.presence === 'absent' ? 'is-absent' : ''}`} key={slot.bossId}>
                    <header><strong>{directive.patch.bossName || slot.label}</strong><div><select value={directive.presence} onChange={(event) => updateDirective(slot.bossId, (item) => ({ ...item, presence: event.target.value as SceneBossDirective['presence'] }))}><option value="inherit">Manter estado</option>{draft.bossSlots.length > 1 && <option value="present">Incluir na fase</option>}<option value="absent">Eliminar da fase</option></select>{!slot.original && <button className="remove-scene-boss" type="button" title="Remover chefão da cena" aria-label={`Remover ${slot.label}`} onClick={() => setBossToDelete(slot.bossId)}>×</button>}</div></header>
                    <div className="boss-values">
                      <label className="boss-name-override"><span>Nome</span><input maxLength={100} placeholder="Herdar" value={directive.patch.bossName ?? ''} onChange={(event) => setPatchValue(slot.bossId, 'bossName', event.target.value)} /></label>
                      {([
                        ['maxHealth', 'Vida máx.'], ['currentHealth', 'Vida atual'], ['attack', 'Ataque'], ['rangedAttack', 'Tiro'], ['skills', 'Perícias'],
                        ['defense', 'Def. CaC'], ['rangedDefense', 'Def. AaD'], ['damageReduction', 'RD'], ['shield', 'Escudo'],
                      ] as const).map(([key, label]) => <label key={key}><span>{label}</span><input type="number" placeholder="—" value={directive.patch[key] ?? ''} onChange={(event) => setPatchValue(slot.bossId, key, event.target.value)} /></label>)}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </section>
      </div>

      <footer className="scene-footer">
        <button type="button" disabled={busy || Boolean(rangeError) || !dirty} onClick={() => void persistDraft()}>{busy ? 'Salvando...' : 'Salvar cena'}</button>
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
              <button className="is-destructive" type="button" onClick={deletePhase}>Excluir fase</button>
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
