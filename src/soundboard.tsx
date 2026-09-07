import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { BattleState, SoundboardSlot, SoundboardState } from './shared/battle';
import { installDisabledControlTooltips } from './shared/disabled-controls';
import { installUndoShortcut } from './shared/undo-shortcut';
import './soundboard.css';
import './scrollbars.css';

installDisabledControlTooltips();
installUndoShortcut(() => window.bossAPI.undoLastChange());

const SoundboardApp = () => {
  const [state, setState] = useState<SoundboardState | null>(null);
  const [battle, setBattle] = useState<BattleState | null>(null);
  const [assigningSlot, setAssigningSlot] = useState<number | null>(null);
  const [soundName, setSoundName] = useState('');
  const [message, setMessage] = useState('');
  const [playbackError, setPlaybackError] = useState('');
  const [removingSound, setRemovingSound] = useState<SoundboardSlot | null>(null);
  const [clearOpen, setClearOpen] = useState(false);

  useEffect(() => {
    let active = true;
    window.bossAPI.getSoundboardState().then((next) => {
      if (active) setState(next);
    });
    window.bossAPI.getState().then((next) => {
      if (active) setBattle(next);
    });
    const unsubscribeState = window.bossAPI.subscribeSoundboard(setState);
    const unsubscribeBattle = window.bossAPI.subscribe(setBattle);
    const unsubscribeError = window.bossAPI.subscribeSoundboardError(setPlaybackError);
    return () => {
      active = false;
      unsubscribeState();
      unsubscribeBattle();
      unsubscribeError();
    };
  }, []);

  useEffect(() => {
    if (assigningSlot === null && !removingSound && !clearOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setAssigningSlot(null);
      setRemovingSound(null);
      setClearOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [assigningSlot, clearOpen, removingSound]);

  if (!state || !battle) return <main className="soundboard-loading">Abrindo soundboard...</main>;
  const editingSound = assigningSlot === null
    ? null
    : state.slots.find((slot) => slot.index === assigningSlot) ?? null;

  const openAssignment = (slot: SoundboardSlot) => {
    setSoundName(slot.name ?? '');
    setMessage('');
    setAssigningSlot(slot.index);
  };

  const assignSound = async (keepExistingFile: boolean) => {
    if (assigningSlot === null) return;
    setMessage('');
    const result = await window.bossAPI.assignSoundboardSlot(
      assigningSlot,
      soundName,
      keepExistingFile,
    );
    if (result.ok) {
      setAssigningSlot(null);
      setSoundName('');
      setPlaybackError('');
    } else if (!result.canceled) {
      setMessage(result.error ?? 'Não foi possível atribuir o som.');
    }
  };

  return (
    <main className="soundboard-shell">
      <header>
        <div>
          <p>Controle privado</p>
          <h1>Soundboard</h1>
        </div>
        <div className="soundboard-header-actions">
          <button type="button" disabled={!state.slots.some((slot) => slot.assigned)} data-disabled-reason="Nenhum atalho possui som" onClick={() => window.bossAPI.dispatchSoundboard({ type: 'stop-all' })}>Parar sons</button>
          <button type="button" disabled={!state.slots.some((slot) => slot.assigned)} data-disabled-reason="Nenhum atalho possui som" onClick={() => setClearOpen(true)}>Limpar tudo</button>
        </div>
      </header>

      {state.universalMuted && (
        <aside className="soundboard-mute-warning" role="status">
          <strong>Mute universal ativo</strong>
          <span>Nenhum som será emitido, embora os atalhos continuem respondendo.</span>
        </aside>
      )}

      <section className="soundboard-grid" aria-label="Atalhos do soundboard">
        {state.slots.map((slot) => (
          <div className={`sound-slot ${slot.assigned ? 'is-assigned' : ''}`} key={slot.index}>
            <button
              className="sound-trigger"
              type="button"
              title={slot.name ?? `Atribuir som ao botão ${slot.index}`}
              aria-label={slot.assigned ? `Reproduzir ${slot.name}` : `Atribuir som ao botão ${slot.index}`}
              onClick={() => {
                if (slot.assigned) {
                  setPlaybackError('');
                  window.bossAPI.dispatchSoundboard({ type: 'play', index: slot.index });
                } else openAssignment(slot);
              }}
            >
              <strong>{slot.index}</strong>
              <span>{slot.assigned ? '▶' : '+'}</span>
            </button>
            {slot.assigned && (
              <>
                <button className="edit-sound" type="button" title={`Editar ${slot.name}`} aria-label={`Editar ${slot.name}`} onClick={() => openAssignment(slot)}>✎</button>
                <button className="remove-sound" type="button" title={`Remover ${slot.name}`} aria-label={`Remover ${slot.name}`} onClick={() => setRemovingSound(slot)}>&times;</button>
              </>
            )}
          </div>
        ))}
      </section>

      <section className="soundboard-controls">
        <span>Volume</span>
        <input type="range" aria-label="Volume do soundboard" min="0" max="100" value={Math.round(state.volume * 100)} onChange={(event) => window.bossAPI.dispatchSoundboard({ type: 'set-volume', volume: Number(event.target.value) / 100 })} />
        <strong>{Math.round(state.volume * 100)}%</strong>
        <button className={state.muted ? 'is-active' : ''} type="button" title={state.muted ? 'Ativar som' : 'Mutar'} onClick={() => window.bossAPI.dispatchSoundboard({ type: 'toggle-mute' })}>{state.muted ? '🔇' : '🔊'}</button>
        <button className={state.loop ? 'is-active' : ''} type="button" title="Repetir sons" aria-pressed={state.loop} onClick={() => window.bossAPI.dispatchSoundboard({ type: 'toggle-loop' })}>↻</button>
      </section>
      <p className="soundboard-size-warning">Até 100 MB por arquivo. Muitos sons grandes podem deixar o aplicativo lento.</p>

      {playbackError && <p className="soundboard-error" role="alert">{playbackError}</p>}

      {assigningSlot !== null && (
        <div className="soundboard-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAssigningSlot(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="assign-sound-title">
            <button className="soundboard-modal-close" type="button" aria-label="Fechar" onClick={() => setAssigningSlot(null)}>×</button>
            <p>Botão {assigningSlot}</p>
            <h2 id="assign-sound-title">{editingSound?.assigned ? 'Editar efeito sonoro' : 'Atribuir efeito sonoro'}</h2>
            <label>Nome exibido no tooltip (opcional)<input autoFocus type="text" maxLength={40} value={soundName} placeholder="Ex.: Rugido do dragão" onChange={(event) => setSoundName(event.target.value)} /></label>
            {message && <span className="soundboard-error">{message}</span>}
            <div>
              <button type="button" onClick={() => setAssigningSlot(null)}>Cancelar</button>
              {editingSound?.assigned && <button type="button" onClick={() => void assignSound(true)}>Salvar nome</button>}
              <button className="is-primary" type="button" onClick={() => void assignSound(false)}>{editingSound?.assigned ? 'Trocar MP3' : 'Selecionar MP3'}</button>
            </div>
          </section>
        </div>
      )}

      {removingSound && (
        <div className="soundboard-modal-backdrop">
          <section role="alertdialog" aria-modal="true" aria-labelledby="remove-sound-title">
            <button className="soundboard-modal-close" type="button" aria-label="Fechar" onClick={() => setRemovingSound(null)}>×</button>
            <h2 id="remove-sound-title">Remover este efeito?</h2>
            <p>O som “{removingSound.name}” deixará de tocar e será removido do atalho {removingSound.index}.</p>
            <div>
              <button type="button" onClick={() => setRemovingSound(null)}>Cancelar</button>
              <button className="is-destructive" type="button" onClick={() => { window.bossAPI.dispatchSoundboard({ type: 'remove', index: removingSound.index }); setRemovingSound(null); }}>Remover</button>
            </div>
          </section>
        </div>
      )}

      {clearOpen && (
        <div className="soundboard-modal-backdrop">
          <section role="alertdialog" aria-modal="true" aria-labelledby="clear-soundboard-title">
            <button className="soundboard-modal-close" type="button" aria-label="Fechar" onClick={() => setClearOpen(false)}>×</button>
            <h2 id="clear-soundboard-title">Limpar todo o soundboard?</h2>
            <p>Todos os sons atribuídos aos 20 atalhos serão interrompidos e removidos.</p>
            <div>
              <button type="button" onClick={() => setClearOpen(false)}>Cancelar</button>
              <button className="is-destructive" type="button" onClick={() => { window.bossAPI.dispatchSoundboard({ type: 'clear' }); setClearOpen(false); }}>Limpar tudo</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
};

const root = document.getElementById('root');
if (!root) throw new Error('Elemento raiz não encontrado.');
createRoot(root).render(<SoundboardApp />);
