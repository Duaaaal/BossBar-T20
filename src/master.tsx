import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { type BattleState, type EncounterEffectsState } from './shared/battle';
import type { BossLibraryDraft, BossLibrarySaveMode } from './shared/library';
import './master.css';
import './scrollbars.css';

const createLibraryDraft = (state: BattleState): BossLibraryDraft => ({
  activeBossId: state.activeBossId,
  bosses: state.bosses.map((boss) => ({
    bossId: boss.id,
    bossName: boss.bossName,
    amount: boss.controlAmount,
    maxHealth: boss.maxHealth,
    currentHealth: boss.currentHealth,
    attack: boss.attack,
    rangedAttack: boss.rangedAttack,
    defense: boss.defense,
    shield: boss.shield,
    skills: boss.skills,
    damageReduction: boss.damageReduction,
    description: boss.nextAction,
    actionSeverity: boss.actionSeverity,
    turnCount: boss.turnCount,
    activeStatuses: boss.activeStatuses,
  })),
});

const MasterApp = () => {
  const [state, setState] = useState<BattleState | null>(null);
  const [appVersion, setAppVersion] = useState('...');
  const [presentationOpen, setPresentationOpen] = useState(false);
  const [universalMuted, setUniversalMuted] = useState(false);
  const [encounterEffects, setEncounterEffects] = useState<EncounterEffectsState | null>(null);
  const [encounterEffectsOpen, setEncounterEffectsOpen] = useState(false);
  const [backgroundError, setBackgroundError] = useState('');
  const [pendingBackgroundName, setPendingBackgroundName] = useState<string | null>(null);
  const [pendingBackgroundRemoval, setPendingBackgroundRemoval] = useState(false);
  const [resetConfirmationOpen, setResetConfirmationOpen] = useState(false);
  const [closeConfirmationOpen, setCloseConfirmationOpen] = useState(false);
  const [overwriteConfirmationOpen, setOverwriteConfirmationOpen] = useState(false);
  const [unpreparedConfirmationOpen, setUnpreparedConfirmationOpen] = useState(false);
  const [libraryMessage, setLibraryMessage] = useState('');
  const [savingLibrary, setSavingLibrary] = useState(false);
  const [closingApp, setClosingApp] = useState(false);
  const [autosaveNoticeVisible, setAutosaveNoticeVisible] = useState(false);
  const latestLibraryDraft = useRef<BossLibraryDraft | null>(null);
  const autosaveNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    window.bossAPI.getAppVersion().then(setAppVersion);
  }, []);

  useEffect(() => {
    let active = true;
    window.bossAPI.isPresentationOpen().then((open) => {
      if (active) setPresentationOpen(open);
    });
    const unsubscribe = window.bossAPI.subscribePresentationOpen((open) => {
      if (active) setPresentationOpen(open);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (state) latestLibraryDraft.current = createLibraryDraft(state);
  }, [state]);

  useEffect(() => {
    let active = true;
    const updateMute = (musicState: { universalMuted: boolean }) => {
      if (active) setUniversalMuted(musicState.universalMuted);
    };
    window.bossAPI.getMusicState().then(updateMute);
    const unsubscribe = window.bossAPI.subscribeMusic(updateMute);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    const updateEncounterEffects = (effectsState: EncounterEffectsState) => {
      if (active) setEncounterEffects(effectsState);
    };
    window.bossAPI.getEncounterEffectsState().then(updateEncounterEffects);
    const unsubscribe = window.bossAPI.subscribeEncounterEffects(updateEncounterEffects);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(
    () => window.bossAPI.subscribeAppCloseRequested(() => setCloseConfirmationOpen(true)),
    [],
  );

  useEffect(
    () => window.bossAPI.subscribeBackgroundError(setBackgroundError),
    [],
  );

  useEffect(
    () => window.bossAPI.subscribeBossLoaded(({ bossCount }) => {
      setPendingBackgroundName(null);
      setPendingBackgroundRemoval(false);
      setBackgroundError('');
      setLibraryMessage(
        bossCount === 1
          ? 'Encontro carregado da biblioteca.'
          : `Encontro com ${bossCount} chefões carregado.`,
      );
    }),
    [],
  );

  useEffect(() => {
    const timer = setInterval(() => {
      const draft = latestLibraryDraft.current;
      if (!draft) return;
      void window.bossAPI.saveBossAutosave(draft).then((result) => {
        if (!result.ok) {
          console.error(result.error ?? 'Falha no salvamento automático.');
          return;
        }
        setAutosaveNoticeVisible(true);
        if (autosaveNoticeTimer.current) clearTimeout(autosaveNoticeTimer.current);
        autosaveNoticeTimer.current = setTimeout(() => {
          autosaveNoticeTimer.current = null;
          setAutosaveNoticeVisible(false);
        }, 4000);
      });
    }, 5 * 60 * 1000);
    return () => {
      clearInterval(timer);
      if (autosaveNoticeTimer.current) clearTimeout(autosaveNoticeTimer.current);
    };
  }, []);

  const chooseBackground = async () => {
    setBackgroundError('');
    const result = await window.bossAPI.chooseBackground();
    if (result.ok) {
      setPendingBackgroundName(result.name ?? null);
      setPendingBackgroundRemoval(false);
    } else if (!result.canceled) {
      setBackgroundError(result.error ?? 'Não foi possível carregar o arquivo.');
    }
  };

  const clearBackground = async () => {
    setBackgroundError('');
    if (await window.bossAPI.clearBackground()) {
      setPendingBackgroundName(null);
      setPendingBackgroundRemoval(true);
    }
  };

  const applyBackground = () => {
    window.bossAPI.dispatch({ type: 'commit-background' });
    setPendingBackgroundName(null);
    setPendingBackgroundRemoval(false);
  };

  const saveEncounter = async (mode: BossLibrarySaveMode = 'prompt') => {
    const draft = latestLibraryDraft.current;
    if (!draft) return;
    setSavingLibrary(true);
    setLibraryMessage('');
    const result = await window.bossAPI.saveBossToLibrary(draft, mode);
    setSavingLibrary(false);
    if (result.requiresOverwrite) {
      setOverwriteConfirmationOpen(true);
      return;
    }
    if (!result.ok) {
      setLibraryMessage(result.error ?? 'Não foi possível salvar o encontro.');
      return;
    }
    setOverwriteConfirmationOpen(false);
    setLibraryMessage(
      mode === 'overwrite'
        ? 'Encontro sobrescrito com sucesso.'
        : 'Encontro salvo na biblioteca.',
    );
  };

  const confirmAppClose = async () => {
    setClosingApp(true);
    const draft = latestLibraryDraft.current;
    if (draft) {
      const result = await window.bossAPI.saveBossAutosave(draft);
      if (!result.ok) {
        setClosingApp(false);
        setCloseConfirmationOpen(false);
        setLibraryMessage(
          result.error ?? 'Não foi possível criar o salvamento automático antes de fechar.',
        );
        return;
      }
    }
    window.bossAPI.confirmAppClose();
  };

  const startBattle = (force = false) => {
    if (!state) return;
    const hasUnpreparedFields = state.bosses.some(
      (boss) => !boss.identityPrepared || !boss.actionPrepared,
    );
    if (!force && hasUnpreparedFields) {
      setUnpreparedConfirmationOpen(true);
      return;
    }
    setUnpreparedConfirmationOpen(false);
    window.bossAPI.dispatch({ type: 'start-battle' });
  };

  const setEncounterEffectsVolume = (volume: number) => {
    setEncounterEffects((current) => current ? { ...current, volume } : current);
    window.bossAPI.setEncounterEffectsVolume(volume);
  };

  const toggleEncounterEffectsMute = () => {
    if (!encounterEffects) return;
    const muted = !encounterEffects.muted;
    setEncounterEffects({ ...encounterEffects, muted });
    window.bossAPI.setEncounterEffectsMuted(muted);
  };

  if (!state) return <main className="master-loading">Conectando ao encontro...</main>;

  const backgroundPending = Boolean(pendingBackgroundName || pendingBackgroundRemoval);
  const backgroundCanBeRemoved = Boolean(
    (state.backgroundName || pendingBackgroundName) && !pendingBackgroundRemoval,
  );
  const unpreparedBosses = state.bosses.filter(
    (boss) => !boss.identityPrepared || !boss.actionPrepared,
  );

  return (
    <main className="master-shell">
      <button
        className="encounter-effects-button"
        type="button"
        title="Volume dos efeitos sonoros"
        aria-label="Abrir controle dos efeitos sonoros"
        aria-haspopup="dialog"
        onClick={() => setEncounterEffectsOpen(true)}
      >
        FX
      </button>
      <button
        className={`universal-mute-button ${universalMuted ? 'is-muted' : ''}`}
        type="button"
        title={universalMuted ? 'Desativar mute universal' : 'Ativar mute universal'}
        aria-label={universalMuted ? 'Desativar mute universal' : 'Ativar mute universal'}
        aria-pressed={universalMuted}
        onClick={() => window.bossAPI.setUniversalMute(!universalMuted)}
      >
        {universalMuted ? '🔇' : '🔊'}
      </button>

      {autosaveNoticeVisible && (
        <button className="autosave-notification" type="button" onClick={() => setAutosaveNoticeVisible(false)}>
          Salvamento automático concluído
        </button>
      )}

      <header className="master-header">
        <p className="master-brand"><span>BossBar</span><small>para</small><strong>Tormenta 20</strong></p>
        <h1>Controle do Mestre</h1>
      </header>

      <section className="compact-panel session-panel">
        <div className="compact-panel-title"><span>01</span><h2>Sessão</h2></div>
        <div className="session-actions">
          <button
            className="presentation-button"
            type="button"
            disabled={presentationOpen}
            onClick={() => void window.bossAPI.openPresentation().then((opened) => {
              if (opened) setPresentationOpen(true);
            })}
          >
            {presentationOpen ? 'Janela já aberta' : 'Abrir Janela'}
          </button>
          <button className="reset-button" type="button" onClick={() => setResetConfirmationOpen(true)}>Resetar tudo</button>
          <button className="hud-toggle-button" type="button" onClick={() => window.bossAPI.dispatch({ type: 'set-hud-visible', visible: !state.hudVisible })}>{state.hudVisible ? 'Esconder HUD' : 'Mostrar HUD'}</button>
          <button className="music-window-button" type="button" onClick={() => void window.bossAPI.openMusicWindow()}>Trilha sonora</button>
          <button
            className={`start-battle-button ${state.battleStarted ? 'is-ending' : ''}`}
            type="button"
            onClick={() => state.battleStarted
              ? window.bossAPI.dispatch({ type: 'end-battle' })
              : startBattle()}
          >
            {state.battleStarted ? 'Encerrar batalha' : 'Iniciar batalha'}
          </button>
        </div>
      </section>

      <section className="compact-panel">
        <div className="compact-panel-title"><span>02</span><h2>Fundo da apresentação</h2></div>
        <div className="background-copy">
          <strong>Imagem, GIF ou vídeo</strong>
          <span>{pendingBackgroundRemoval ? 'Remoção pendente' : pendingBackgroundName ? `${pendingBackgroundName} — pendente` : state.backgroundName ?? 'Nenhum arquivo selecionado'}</span>
        </div>
        <div className={`background-actions ${backgroundCanBeRemoved ? 'has-remove' : ''}`}>
          <button className="background-button" type="button" onClick={() => void chooseBackground()}>Upload</button>
          <button className="background-apply-button" type="button" disabled={!backgroundPending} onClick={applyBackground}>Aplicar</button>
          {backgroundCanBeRemoved && (
            <button className="background-remove-button" type="button" onClick={() => void clearBackground()}>Remover</button>
          )}
        </div>
        <p className="background-note">1920 × 1080 · 16:9 · até 25 MB</p>
        {backgroundError && <p className="master-error">{backgroundError}</p>}
      </section>

      <section className="compact-panel library-panel" aria-label="Biblioteca de encontros">
        <div className="compact-panel-title"><span>03</span><h2>Biblioteca de Encontros</h2></div>
        <p>Salve ou recupere a luta completa, incluindo mídias e áudio.</p>
        <div className="library-actions">
          <button className="save-library-button" type="button" disabled={savingLibrary} onClick={() => void saveEncounter()}>{savingLibrary ? 'Salvando...' : 'Salvar encontro'}</button>
          <button className="load-library-button" type="button" onClick={() => void window.bossAPI.openBossLibrary()}>Carregar encontro</button>
        </div>
        {libraryMessage && <p className="library-status-message">{libraryMessage}</p>}
      </section>

      <footer className="master-footer">@Criado por: Brian Nascimento - Versão {appVersion}</footer>

      {encounterEffectsOpen && encounterEffects && (
        <div className="modal-backdrop">
          <section className="confirmation-modal effects-audio-modal" role="dialog" aria-modal="true" aria-labelledby="effects-audio-title">
            <button
              className="effects-close-button"
              type="button"
              aria-label="Fechar controle dos efeitos sonoros"
              onClick={() => setEncounterEffectsOpen(false)}
            >
              ×
            </button>
            <h2 id="effects-audio-title">Efeitos sonoros</h2>
            <div className="effects-volume-control">
              <button
                className={`effects-mute-button ${encounterEffects.muted ? 'is-muted' : ''}`}
                type="button"
                title={encounterEffects.muted ? 'Ativar efeitos' : 'Mutar efeitos'}
                aria-label={encounterEffects.muted ? 'Ativar efeitos' : 'Mutar efeitos'}
                aria-pressed={encounterEffects.muted}
                onClick={toggleEncounterEffectsMute}
              >
                {encounterEffects.muted ? '🔇' : '🔊'}
              </button>
              <input
                className="effects-volume-range"
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={encounterEffects.volume}
                aria-label="Volume dos efeitos sonoros"
                onChange={(event) => setEncounterEffectsVolume(Number(event.target.value))}
              />
            </div>
          </section>
        </div>
      )}

      {resetConfirmationOpen && (
        <div className="modal-backdrop">
          <section className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="reset-title">
            <p className="modal-eyebrow">Confirmação</p><h2 id="reset-title">Resetar todo o encontro?</h2>
            <p>Chefões, vida, atributos, fundo e ações voltarão ao padrão.</p>
            <div className="modal-actions">
              <button className="modal-cancel-button" type="button" onClick={() => setResetConfirmationOpen(false)}>Cancelar</button>
              <button className="modal-confirm-button" type="button" onClick={() => { window.bossAPI.dispatch({ type: 'reset-all' }); setResetConfirmationOpen(false); }}>Sim, resetar</button>
            </div>
          </section>
        </div>
      )}

      {unpreparedConfirmationOpen && (
        <div className="modal-backdrop">
          <section className="confirmation-modal warning-modal" role="dialog" aria-modal="true" aria-labelledby="unprepared-title">
            <p className="modal-eyebrow">Campos pendentes</p><h2 id="unprepared-title">O encontro ainda não está completamente preparado</h2>
            <p>{unpreparedBosses.length === 1 ? 'Há um chefão' : `Há ${unpreparedBosses.length} chefões`} com nome, valores ou ação ainda não confirmados.</p>
            <div className="modal-actions">
              <button className="modal-cancel-button" type="button" onClick={() => setUnpreparedConfirmationOpen(false)}>Voltar e ajustar</button>
              <button className="modal-warning-button" type="button" onClick={() => startBattle(true)}>Continuar mesmo assim</button>
            </div>
          </section>
        </div>
      )}

      {closeConfirmationOpen && (
        <div className="modal-backdrop">
          <section className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="close-title">
            <p className="modal-eyebrow">Encerrar aplicativo</p><h2 id="close-title">Deseja realmente fechar?</h2>
            <p>A apresentação, o painel privado e a trilha sonora também serão fechados.</p>
            <div className="modal-actions">
              <button className="modal-cancel-button" type="button" disabled={closingApp} onClick={() => setCloseConfirmationOpen(false)}>Cancelar</button>
              <button className="modal-confirm-button" type="button" disabled={closingApp} onClick={() => void confirmAppClose()}>{closingApp ? 'Salvando...' : 'Sim, fechar'}</button>
            </div>
          </section>
        </div>
      )}

      {overwriteConfirmationOpen && (
        <div className="modal-backdrop">
          <section className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="overwrite-title">
            <p className="modal-eyebrow">Encontro já salvo</p><h2 id="overwrite-title">Sobrescrever o encontro existente?</h2>
            <p>Você pode atualizar a linha original ou criar um novo salvamento.</p>
            <div className="modal-actions three-actions">
              <button className="modal-cancel-button" type="button" onClick={() => setOverwriteConfirmationOpen(false)}>Cancelar</button>
              <button className="modal-secondary-button" type="button" onClick={() => void saveEncounter('new')}>Salvar como novo</button>
              <button className="modal-confirm-button" type="button" onClick={() => void saveEncounter('overwrite')}>Sobrescrever</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
};

const root = document.getElementById('root');
if (!root) throw new Error('Elemento raiz não encontrado.');
createRoot(root).render(<MasterApp />);
