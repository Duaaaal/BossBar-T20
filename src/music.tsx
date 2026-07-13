import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type {
  BattleState,
  MusicCommand,
  MusicPlaybackState,
  MusicState,
  SoundboardSlot,
  SoundboardState,
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
  const [soundboard, setSoundboard] = useState<SoundboardState | null>(null);
  const [soundboardOpen, setSoundboardOpen] = useState(false);
  const [assigningSlot, setAssigningSlot] = useState<number | null>(null);
  const [soundName, setSoundName] = useState('');
  const [soundboardMessage, setSoundboardMessage] = useState('');
  const [soundboardPlaybackError, setSoundboardPlaybackError] = useState('');
  const [removingSound, setRemovingSound] = useState<SoundboardSlot | null>(null);
  const [clearSoundboardOpen, setClearSoundboardOpen] = useState(false);
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
    window.bossAPI.getSoundboardState().then((soundboardState) => {
      if (active) setSoundboard(soundboardState);
    });
    const unsubscribeSoundboard = window.bossAPI.subscribeSoundboard(setSoundboard);
    const unsubscribeSoundboardError = window.bossAPI.subscribeSoundboardError(
      setSoundboardPlaybackError,
    );
    return () => {
      active = false;
      unsubscribe();
      unsubscribeBattle();
      unsubscribePlayback();
      unsubscribeSoundboard();
      unsubscribeSoundboardError();
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

  useEffect(() => {
    const modalOpen = assigningSlot !== null || removingSound !== null || clearSoundboardOpen;
    if (!modalOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setAssigningSlot(null);
      setRemovingSound(null);
      setClearSoundboardOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [assigningSlot, clearSoundboardOpen, removingSound]);

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

  const toggleSoundboard = () => {
    const nextOpen = !soundboardOpen;
    setSoundboardOpen(nextOpen);
    void window.bossAPI.setSoundboardOpen(nextOpen);
  };

  const openSoundAssignment = (slot: SoundboardSlot) => {
    setSoundName(slot.name ?? '');
    setSoundboardMessage('');
    setAssigningSlot(slot.index);
  };

  const assignSound = async (keepExistingFile: boolean) => {
    if (assigningSlot === null) return;
    setSoundboardMessage('');
    const result = await window.bossAPI.assignSoundboardSlot(
      assigningSlot,
      soundName,
      keepExistingFile,
    );
    if (result.ok) {
      setSoundboardPlaybackError('');
      setAssigningSlot(null);
      setSoundName('');
    } else if (!result.canceled) {
      setSoundboardMessage(result.error ?? 'Não foi possível atribuir o som.');
    }
  };

  if (!state || !battle || !soundboard) return <main className="music-loading">Abrindo a playlist...</main>;

  const currentTrack = state.tracks.find(
    (track) => track.id === state.currentTrackId,
  );
  const disabled = state.tracks.length === 0;
  const timelineDuration = playback.duration || currentTrack?.duration || 0;
  const editingSound = assigningSlot === null
    ? null
    : soundboard.slots.find((slot) => slot.index === assigningSlot) ?? null;
  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
    const wholeSeconds = Math.floor(seconds);
    return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, '0')}`;
  };

  return (
    <main className={`music-shell ${soundboardOpen ? 'is-soundboard-open' : ''}`}>
      <header className="music-header">
        <div>
          <h1>Trilha Sonora</h1>
          <span>O áudio é reproduzido somente na apresentação.</span>
        </div>
        <button
          className={soundboardOpen ? 'is-active' : ''}
          type="button"
          aria-expanded={soundboardOpen}
          onClick={toggleSoundboard}
        >
          Soundboard
        </button>
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
        <div className="volume-control">
          <span>Volume</span>
          <input
            aria-label="Volume da música"
            className={state.volume > 0.8 ? 'is-boosted' : ''}
            type="range"
            min="0"
            max="100"
            value={Math.round(state.volume * 100)}
            onChange={(event) =>
              dispatch({ type: 'set-volume', volume: Number(event.target.value) / 100 })
            }
          />
          <strong>{Math.round(state.volume * 100)}%</strong>
          <button
            className={state.muted ? 'is-muted' : ''}
            type="button"
            title={state.muted ? 'Ativar música' : 'Mutar música'}
            aria-label={state.muted ? 'Ativar música' : 'Mutar música'}
            aria-pressed={state.muted}
            onClick={() => dispatch({ type: 'toggle-mute' })}
          >
            {state.muted ? '🔇' : '🔊'}
          </button>
        </div>
      </section>

      {soundboardOpen && (
        <section className="soundboard-panel" aria-label="Soundboard">
          <div className="soundboard-heading">
            <div>
              <h2>Soundboard</h2>
              <span>20 atalhos locais · somente MP3</span>
            </div>
            <div className="soundboard-heading-actions">
              <button
                className="stop-sounds-button"
                type="button"
                disabled={!soundboard.slots.some((slot) => slot.assigned)}
                onClick={() => window.bossAPI.dispatchSoundboard({ type: 'stop-all' })}
              >
                Parar sons
              </button>
              <button
                type="button"
                disabled={!soundboard.slots.some((slot) => slot.assigned)}
                onClick={() => setClearSoundboardOpen(true)}
              >
                Limpar tudo
              </button>
            </div>
          </div>
          <div className="soundboard-grid">
            {soundboard.slots.map((slot) => (
              <div
                className={`sound-slot ${slot.assigned ? 'is-assigned' : ''}`}
                key={slot.index}
              >
                <button
                  className="sound-trigger"
                  type="button"
                  title={slot.name ?? `Atribuir som ao botão ${slot.index}`}
                  aria-label={slot.name ? `Reproduzir ${slot.name}` : `Atribuir som ao botão ${slot.index}`}
                  onClick={() => {
                    if (slot.assigned) {
                      setSoundboardPlaybackError('');
                      window.bossAPI.dispatchSoundboard({ type: 'play', index: slot.index });
                    } else {
                      openSoundAssignment(slot);
                    }
                  }}
                >
                  <strong>{slot.index}</strong>
                  <span>{slot.assigned ? '▶' : '+'}</span>
                </button>
                {slot.assigned && (
                  <>
                    <button
                      className="edit-sound-button"
                      type="button"
                      title={`Editar ${slot.name}`}
                      aria-label={`Editar ${slot.name}`}
                      onClick={() => openSoundAssignment(slot)}
                    >
                      ✎
                    </button>
                    <button
                      className="remove-sound-button"
                      type="button"
                      title={`Remover ${slot.name}`}
                      aria-label={`Remover ${slot.name}`}
                      onClick={() => setRemovingSound(slot)}
                    >
                      ×
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          <div className="soundboard-volume-control">
            <span>Volume</span>
            <input
              aria-label="Volume do soundboard"
              className={soundboard.volume > 0.8 ? 'is-boosted' : ''}
              type="range"
              min="0"
              max="100"
              value={Math.round(soundboard.volume * 100)}
              onChange={(event) => window.bossAPI.dispatchSoundboard({
                type: 'set-volume',
                volume: Number(event.target.value) / 100,
              })}
            />
            <strong>{Math.round(soundboard.volume * 100)}%</strong>
            <button
              className={soundboard.muted ? 'is-muted' : ''}
              type="button"
              title={soundboard.muted ? 'Ativar soundboard' : 'Mutar soundboard'}
              aria-label={soundboard.muted ? 'Ativar soundboard' : 'Mutar soundboard'}
              aria-pressed={soundboard.muted}
              onClick={() => window.bossAPI.dispatchSoundboard({ type: 'toggle-mute' })}
            >
              {soundboard.muted ? '🔇' : '🔊'}
            </button>
          </div>
          {soundboardPlaybackError && (
            <p className="soundboard-playback-error">{soundboardPlaybackError}</p>
          )}
          <p className="soundboard-help">
            Clique em um espaço vazio para selecionar um MP3. Passe o mouse sobre um botão para ver o nome.
          </p>
        </section>
      )}

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

      {assigningSlot !== null && (
        <div
          className="music-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAssigningSlot(null);
          }}
        >
          <section className="music-confirmation-modal sound-assignment-modal" role="dialog" aria-modal="true" aria-labelledby="assign-sound-title">
            <p>Botão {assigningSlot}</p>
            <h2 id="assign-sound-title">
              {editingSound?.assigned ? 'Editar efeito sonoro' : 'Atribuir efeito sonoro'}
            </h2>
            <label>
              Nome exibido no tooltip (opcional)
              <input
                autoFocus
                type="text"
                maxLength={40}
                value={soundName}
                placeholder="Ex.: Rugido do dragão"
                onChange={(event) => setSoundName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') void assignSound(Boolean(editingSound?.assigned));
                }}
              />
            </label>
            {soundboardMessage && <span className="soundboard-error">{soundboardMessage}</span>}
            <div className={editingSound?.assigned ? 'sound-assignment-actions' : ''}>
              <button className="music-modal-cancel" type="button" onClick={() => setAssigningSlot(null)}>Cancelar</button>
              {editingSound?.assigned && (
                <button className="soundboard-name-confirm" type="button" onClick={() => void assignSound(true)}>Salvar nome</button>
              )}
              <button className="soundboard-assign-confirm" type="button" onClick={() => void assignSound(false)}>
                {editingSound?.assigned ? 'Trocar MP3' : 'Selecionar MP3'}
              </button>
            </div>
          </section>
        </div>
      )}

      {removingSound && (
        <div
          className="music-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setRemovingSound(null);
          }}
        >
          <section className="music-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="remove-sound-title">
            <p>Confirmação</p>
            <h2 id="remove-sound-title">Remover este efeito?</h2>
            <span>O som “{removingSound.name}” será removido do botão {removingSound.index}.</span>
            <div>
              <button className="music-modal-cancel" type="button" onClick={() => setRemovingSound(null)}>Cancelar</button>
              <button className="music-modal-confirm" type="button" onClick={() => {
                window.bossAPI.dispatchSoundboard({ type: 'remove', index: removingSound.index });
                setRemovingSound(null);
              }}>Sim, remover</button>
            </div>
          </section>
        </div>
      )}

      {clearSoundboardOpen && (
        <div
          className="music-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setClearSoundboardOpen(false);
          }}
        >
          <section className="music-confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="clear-soundboard-title">
            <p>Confirmação</p>
            <h2 id="clear-soundboard-title">Limpar todo o soundboard?</h2>
            <span>Todos os efeitos atribuídos aos 20 botões serão removidos.</span>
            <div>
              <button className="music-modal-cancel" type="button" onClick={() => setClearSoundboardOpen(false)}>Cancelar</button>
              <button className="music-modal-confirm" type="button" onClick={() => {
                window.bossAPI.dispatchSoundboard({ type: 'clear' });
                setClearSoundboardOpen(false);
              }}>Sim, limpar tudo</button>
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
