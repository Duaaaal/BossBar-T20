import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  BattleState,
  MusicCommand,
  MusicPlaybackState,
  MusicState,
} from './shared/battle';
import './music.css';

const MusicApp = () => {
  const [state, setState] = useState<MusicState | null>(null);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [playback, setPlayback] = useState<MusicPlaybackState>({
    trackId: null,
    currentTime: 0,
    duration: 0,
  });
  const [message, setMessage] = useState('');
  const [clearConfirmationOpen, setClearConfirmationOpen] = useState(false);
  const cancelClearButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let active = true;
    window.bossAPI.getMusicState().then((initialState) => {
      if (active) setState(initialState);
    });
    const unsubscribe = window.bossAPI.subscribeMusic(setState);
    window.bossAPI.getState().then((battleState) => {
      if (active) setBattle(battleState);
    });
    const unsubscribeBattle = window.bossAPI.subscribe(setBattle);
    window.bossAPI.getMusicPlayback().then((playbackState) => {
      if (active) setPlayback(playbackState);
    });
    const unsubscribePlayback =
      window.bossAPI.subscribeMusicPlayback(setPlayback);
    return () => {
      active = false;
      unsubscribe();
      unsubscribeBattle();
      unsubscribePlayback();
    };
  }, []);

  useEffect(() => {
    if (!clearConfirmationOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setClearConfirmationOpen(false);
    };
    cancelClearButton.current?.focus();
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearConfirmationOpen]);

  const dispatch = (command: MusicCommand) =>
    window.bossAPI.dispatchMusic(command);

  const addTracks = async () => {
    setMessage('');
    const result = await window.bossAPI.addMusicTracks();
    if (result.ok) {
      setMessage(
        `${result.added ?? 0} ${result.added === 1 ? 'faixa adicionada' : 'faixas adicionadas'}.`,
      );
    } else if (!result.canceled) {
      setMessage(result.error ?? 'Não foi possível adicionar as faixas.');
    }
  };

  if (!state || !battle) return <main className="music-loading">Abrindo a playlist...</main>;

  const currentTrack = state.tracks.find(
    (track) => track.id === state.currentTrackId,
  );
  const disabled = state.tracks.length === 0;
  const timelineDuration = playback.duration || currentTrack?.duration || 0;
  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
    const wholeSeconds = Math.floor(seconds);
    return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`;
  };

  return (
    <main className="music-shell">
      <header className="music-header">
        <h1>Trilha Sonora</h1>
        <span>O áudio é reproduzido somente na apresentação.</span>
      </header>

      <section className="playlist-panel">
        <div className="playlist-heading">
          <div>
            <h2>Playlist</h2>
            <span>{state.tracks.length} faixa(s) · somente MP3</span>
          </div>
          <div className="playlist-heading-actions">
            <button className="clear-playlist-button" type="button" disabled={state.tracks.length === 0} onClick={() => setClearConfirmationOpen(true)}>
              Limpar
            </button>
            <button type="button" onClick={() => void addTracks()}>
              + Adicionar MP3
            </button>
          </div>
        </div>

        <div className="playlist" role="listbox" aria-label="Faixas musicais">
          {state.tracks.length === 0 ? (
            <div className="empty-playlist">
              <strong>Nenhuma faixa adicionada</strong>
              <span>Use o botão acima para selecionar vários arquivos.</span>
            </div>
          ) : (
            state.tracks.map((track, index) => {
              const active = track.id === state.currentTrackId;
              return (
                <div className="track-row-wrapper" key={track.id}>
                  <button
                    className={`track-row ${active ? 'is-active' : ''}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    title="Clique duas vezes para reproduzir"
                    onDoubleClick={() =>
                      dispatch({ type: 'play-track', trackId: track.id })
                    }
                  >
                    <span className="track-number">
                      {active && state.isPlaying ? '▶' : index + 1}
                    </span>
                    <span className="track-name">{track.name}</span>
                  </button>
                  <button
                    className="remove-track-button"
                    type="button"
                    aria-label={`Remover ${track.name}`}
                    title="Remover faixa"
                    onClick={() => dispatch({ type: 'remove-track', trackId: track.id })}
                  >
                    ×
                  </button>
                </div>
              );
            })
          )}
        </div>
        {message && <p className="music-message">{message}</p>}
      </section>

      <section className="transport-panel" aria-label="Controles de reprodução">
        <p className="now-playing-label">Tocando agora</p>
        <strong className="now-playing-name">
          {currentTrack?.name ?? 'Nenhuma faixa selecionada'}
        </strong>
        {!battle.battleStarted && currentTrack && (
          <span className="queued-track">Pronta para tocar 1 segundo após o início da batalha</span>
        )}
        <label className="timeline-control">
          <span>{formatTime(playback.currentTime)}</span>
          <input
            aria-label="Posição da faixa"
            type="range"
            min="0"
            max={Math.max(0, timelineDuration)}
            step="0.1"
            value={Math.min(playback.currentTime, timelineDuration)}
            disabled={!currentTrack}
            onChange={(event) =>
              dispatch({ type: 'seek', time: Number(event.target.value) })
            }
          />
          <span>{formatTime(timelineDuration)}</span>
        </label>
        <div className="transport-controls">
          <button
            type="button"
            disabled={disabled}
            title="Voltar ao início"
            onClick={() => dispatch({ type: 'restart' })}
          >
            ↶
          </button>
          <button
            type="button"
            disabled={disabled}
            title="Faixa anterior"
            onClick={() => dispatch({ type: 'previous' })}
          >
            ◀|
          </button>
          <button
            className="play-button"
            type="button"
            disabled={disabled || !battle.battleStarted}
            title={state.isPlaying ? 'Pausar' : 'Reproduzir'}
            onClick={() => dispatch({ type: 'toggle-play' })}
          >
            {state.isPlaying ? '❚❚' : '▶'}
          </button>
          <button
            type="button"
            disabled={disabled}
            title="Próxima faixa"
            onClick={() => dispatch({ type: 'next' })}
          >
            |▶
          </button>
          <button
            className={state.loop ? 'is-enabled' : ''}
            type="button"
            title="Repetir faixa"
            aria-pressed={state.loop}
            onClick={() => dispatch({ type: 'toggle-loop' })}
          >
            ↻
          </button>
        </div>
        <label className="volume-control">
          <span>Volume</span>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(state.volume * 100)}
            onChange={(event) =>
              dispatch({ type: 'set-volume', volume: Number(event.target.value) / 100 })
            }
          />
          <strong>{Math.round(state.volume * 100)}%</strong>
        </label>
      </section>

      {clearConfirmationOpen && (
        <div className="music-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setClearConfirmationOpen(false); }}>
          <section className="music-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="clear-playlist-title">
            <p>Confirmação</p>
            <h2 id="clear-playlist-title">Limpar toda a playlist?</h2>
            <span>Todas as faixas serão removidas e a reprodução atual será interrompida.</span>
            <div>
              <button ref={cancelClearButton} className="music-modal-cancel" type="button" onClick={() => setClearConfirmationOpen(false)}>Cancelar</button>
              <button className="music-modal-confirm" type="button" onClick={() => { dispatch({ type: 'clear-tracks' }); setClearConfirmationOpen(false); }}>Sim, limpar tudo</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
};

const root = document.getElementById('root');
if (!root) throw new Error('Elemento raiz não encontrado.');
createRoot(root).render(<MusicApp />);
