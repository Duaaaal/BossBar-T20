import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ScenePlaylistCommand, ScenePlaylistState } from './shared/scene';
import './scene-playlist.css';
import './scrollbars.css';

const formatTime = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

const ScenePlaylistApp = () => {
  const [state, setState] = useState<ScenePlaylistState | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [message, setMessage] = useState('');
  const [clearOpen, setClearOpen] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const playAfterSelection = useRef(false);

  useEffect(() => {
    let active = true;
    window.bossAPI.getScenePhasePlaylist().then((initial) => {
      if (active) setState(initial);
    });
    const unsubscribe = window.bossAPI.subscribeScenePhasePlaylist(setState);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const currentTrack = state?.tracks.find(
    (track) => track.id === state.currentTrackId,
  ) ?? null;

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !state) return;
    audio.volume = Math.max(0, Math.min(1, state.volume));
    audio.muted = state.muted;
    audio.loop = state.loop;
  }, [state?.loop, state?.muted, state?.volume]);

  useEffect(() => {
    setTime(0);
    setPlaying(false);
    if (!playAfterSelection.current || !audioRef.current || !currentTrack) return;
    playAfterSelection.current = false;
    void audioRef.current.play().then(() => setPlaying(true)).catch(() => {
      setMessage('Não foi possível reproduzir esta faixa.');
    });
  }, [currentTrack?.id]);

  if (!state) return <main className="scene-playlist-loading">Abrindo playlist...</main>;

  const dispatch = (command: ScenePlaylistCommand) =>
    window.bossAPI.dispatchScenePhasePlaylist(state.phaseId, state.slot, command);
  const canNavigate = state.tracks.length > 1;
  const duration = audioRef.current?.duration || currentTrack?.duration || 0;

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (!audio.paused) {
      audio.pause();
      setPlaying(false);
      return;
    }
    try {
      await audio.play();
      setPlaying(true);
    } catch {
      setMessage('Não foi possível reproduzir esta faixa.');
    }
  };

  const selectAndPlay = (trackId: string) => {
    playAfterSelection.current = true;
    if (trackId === state.currentTrackId) {
      void togglePlayback();
      playAfterSelection.current = false;
      return;
    }
    dispatch({ type: 'select-track', trackId });
  };

  const addTracks = async () => {
    setMessage('');
    const result = await window.bossAPI.addScenePhasePlaylistTracks();
    if (result.ok) {
      setMessage(`${result.added ?? 0} faixa(s) adicionada(s). Salve a cena para aplicar.`);
    } else if (!result.canceled) {
      setMessage(result.error ?? 'Não foi possível adicionar as faixas.');
    }
  };

  return (
    <main className="scene-playlist-shell">
      <header>
        <div>
          <p>{state.slot === 'music' ? 'Música da fase' : 'Som da transição'}</p>
          <h1>{state.phaseName}</h1>
        </div>
        <button type="button" onClick={() => void addTracks()}>+ Adicionar MP3</button>
      </header>

      <section className="scene-track-list" role="listbox" aria-label="Faixas da fase">
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
            <button
              className="scene-track-remove"
              type="button"
              title="Remover faixa"
              aria-label={`Remover ${track.name}`}
              onClick={() => dispatch({ type: 'remove-track', trackId: track.id })}
            >&times;</button>
          </div>
        ))}
      </section>

      <section className="scene-transport">
        <span>Tocando agora</span>
        <strong title={currentTrack?.name}>{currentTrack?.name ?? 'Nenhuma faixa selecionada'}</strong>
        <label className="scene-timeline">
          <span>{formatTime(time)}</span>
          <input
            type="range"
            aria-label="Posição da faixa"
            min="0"
            max={Math.max(0, duration)}
            step="0.1"
            value={Math.min(time, duration)}
            disabled={!currentTrack}
            onChange={(event) => {
              if (!audioRef.current) return;
              const nextTime = Number(event.target.value);
              audioRef.current.currentTime = nextTime;
              setTime(nextTime);
            }}
          />
          <span>{formatTime(duration)}</span>
        </label>
        <div className="scene-transport-buttons">
          <button type="button" disabled={!canNavigate} onClick={() => dispatch({ type: 'previous' })}>&#9198;</button>
          <button className="scene-play-button" type="button" disabled={!currentTrack} onClick={() => void togglePlayback()}>{playing ? '\u23F8' : '\u25B6'}</button>
          <button type="button" disabled={!canNavigate} onClick={() => dispatch({ type: 'next' })}>&#9197;</button>
          <button className={state.loop ? 'is-active' : ''} type="button" disabled={!currentTrack} onClick={() => dispatch({ type: 'set-loop', loop: !state.loop })}>Loop</button>
        </div>
        <div className="scene-volume-row">
          <button type="button" aria-label={state.muted ? 'Ativar som' : 'Mutar'} onClick={() => dispatch({ type: 'set-muted', muted: !state.muted })}>{state.muted ? '\uD83D\uDD07' : '\uD83D\uDD0A'}</button>
          <input type="range" aria-label="Volume" min="0" max="1" step="0.01" value={state.volume} onChange={(event) => dispatch({ type: 'set-volume', volume: Number(event.target.value) })} />
          <span>{Math.round(state.volume * 100)}%</span>
        </div>
      </section>

      <footer>
        <span>{message}</span>
        <button type="button" disabled={state.tracks.length === 0} onClick={() => setClearOpen(true)}>Limpar playlist</button>
      </footer>

      <audio
        ref={audioRef}
        src={currentTrack?.url}
        preload="metadata"
        muted={state.muted}
        loop={state.loop}
        onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        style={{ display: 'none' }}
      />

      {clearOpen && (
        <div className="scene-playlist-modal-backdrop">
          <section role="dialog" aria-modal="true" aria-labelledby="clear-scene-playlist-title">
            <h2 id="clear-scene-playlist-title">Limpar playlist?</h2>
            <p>Todas as faixas desta fase serão removidas do rascunho.</p>
            <div>
              <button type="button" onClick={() => setClearOpen(false)}>Cancelar</button>
              <button className="is-destructive" type="button" onClick={() => { dispatch({ type: 'clear' }); setClearOpen(false); }}>Limpar</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
};

const root = document.getElementById('root');
if (!root) throw new Error('Elemento raiz não encontrado.');
createRoot(root).render(<ScenePlaylistApp />);
