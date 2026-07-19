import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  type BattleState,
  type EncounterEffectsState,
  type EncounterGeneralSetting,
  type EncounterSoundCustomizationState,
  type EncounterSoundEffectKind,
  type EncounterSoundOption,
  type EncounterSoundSetting,
  type EncounterVisualEffectSetting,
  type MusicState,
} from './shared/battle';
import { bundledAssetUrl } from './shared/bundled-assets';
import { installDisabledControlTooltips } from './shared/disabled-controls';
import { installUndoShortcut } from './shared/undo-shortcut';
import type { BossLibraryDraft, BossLibrarySaveMode } from './shared/library';
import type { ScenePlan } from './shared/scene';
import './master.css';
import './scrollbars.css';

installDisabledControlTooltips();
installUndoShortcut(() => window.bossAPI.undoLastChange());

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
    rangedDefense: boss.rangedDefense,
    shield: boss.shield,
    skills: boss.skills,
    damageReduction: boss.damageReduction,
    description: boss.nextAction,
    actionSeverity: boss.actionSeverity,
    turnCount: boss.turnCount,
    activeStatuses: boss.activeStatuses,
  })),
});

const SettingsCheckbox = ({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) => (
  <label className="settings-checkbox">
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
    <span className="settings-checkmark" aria-hidden="true" />
    <span>{label}</span>
  </label>
);

const encounterSoundCategories: Array<{
  kind: EncounterSoundEffectKind;
  label: string;
}> = [
  { kind: 'damage', label: 'Dano' },
  { kind: 'critical-damage', label: 'Crit' },
  { kind: 'heal', label: 'Cura' },
  { kind: 'shield-impact', label: 'Dano do escudo' },
  { kind: 'shield-break', label: 'Escudo quebrando' },
];

type SoundCategoryMenuPosition = {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
};

const MasterApp = () => {
  const [state, setState] = useState<BattleState | null>(null);
  const [scenePlan, setScenePlan] = useState<ScenePlan | null>(null);
  const [appVersion, setAppVersion] = useState('...');
  const [presentationOpen, setPresentationOpen] = useState(false);
  const [universalMuted, setUniversalMuted] = useState(false);
  const [musicState, setMusicState] = useState<MusicState | null>(null);
  const [encounterEffects, setEncounterEffects] = useState<EncounterEffectsState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [soundCustomizationOpen, setSoundCustomizationOpen] = useState(false);
  const [soundCustomization, setSoundCustomization] = useState<EncounterSoundCustomizationState | null>(null);
  const [soundCustomizationBusy, setSoundCustomizationBusy] = useState<string | null>(null);
  const [soundCustomizationError, setSoundCustomizationError] = useState('');
  const [pendingSoundRemoval, setPendingSoundRemoval] = useState<EncounterSoundOption | null>(null);
  const [selectedSoundCategory, setSelectedSoundCategory] = useState<EncounterSoundEffectKind>('damage');
  const [soundCategoryMenuOpen, setSoundCategoryMenuOpen] = useState(false);
  const [soundCategoryMenuPosition, setSoundCategoryMenuPosition] = useState<SoundCategoryMenuPosition | null>(null);
  const [previewingSoundId, setPreviewingSoundId] = useState<string | null>(null);
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
  const soundPreviewRef = useRef<HTMLAudioElement | null>(null);
  const soundCategoryTriggerRef = useRef<HTMLButtonElement | null>(null);
  const soundCategoryMenuRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (!soundCategoryMenuOpen) {
      setSoundCategoryMenuPosition(null);
      return;
    }

    const updateMenuPosition = () => {
      const trigger = soundCategoryTriggerRef.current;
      if (!trigger) return;
      const bounds = trigger.getBoundingClientRect();
      const desiredHeight = Math.min(
        Math.max(encounterSoundCategories.length, 1),
        8,
      ) * 31 + 10;
      const spaceBelow = Math.max(0, window.innerHeight - bounds.bottom - 8);
      const spaceAbove = Math.max(0, bounds.top - 8);
      const openAbove = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
      const availableHeight = openAbove ? spaceAbove : spaceBelow;
      const width = Math.min(bounds.width, window.innerWidth - 16);
      const left = Math.min(
        Math.max(8, bounds.left),
        Math.max(8, window.innerWidth - width - 8),
      );
      setSoundCategoryMenuPosition({
        left,
        width,
        maxHeight: Math.max(64, Math.min(desiredHeight, availableHeight)),
        ...(openAbove
          ? { bottom: window.innerHeight - bounds.top + 5 }
          : { top: bounds.bottom + 5 }),
      });
    };

    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    document.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      document.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [soundCategoryMenuOpen]);

  useEffect(() => {
    if (!soundCategoryMenuOpen) return;
    const closeOnOutsideInteraction = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        soundCategoryTriggerRef.current?.contains(target) ||
        soundCategoryMenuRef.current?.contains(target)
      ) return;
      setSoundCategoryMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSoundCategoryMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideInteraction);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideInteraction);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [soundCategoryMenuOpen]);

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
    const updateMusic = (nextMusicState: MusicState) => {
      if (active) {
        setMusicState(nextMusicState);
        setUniversalMuted(nextMusicState.universalMuted);
      }
    };
    window.bossAPI.getMusicState().then(updateMusic);
    const unsubscribe = window.bossAPI.subscribeMusic(updateMusic);
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
    () => window.bossAPI.subscribeBossLoaded(({ bossCount }) => {
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

  const setEncounterGeneralEnabled = (
    setting: EncounterGeneralSetting,
    enabled: boolean,
  ) => {
    setEncounterEffects((current) => current
      ? { ...current, general: { ...current.general, [setting]: enabled } }
      : current);
    window.bossAPI.setEncounterGeneralEnabled(setting, enabled);
  };

  const setEncounterSoundEnabled = (
    setting: EncounterSoundSetting,
    enabled: boolean,
  ) => {
    setEncounterEffects((current) => current
      ? { ...current, sounds: { ...current.sounds, [setting]: enabled } }
      : current);
    window.bossAPI.setEncounterSoundEnabled(setting, enabled);
  };

  const setEncounterVisualEffectEnabled = (
    setting: EncounterVisualEffectSetting,
    enabled: boolean,
  ) => {
    setEncounterEffects((current) => current
      ? { ...current, visuals: { ...current.visuals, [setting]: enabled } }
      : current);
    window.bossAPI.setEncounterVisualEffectEnabled(setting, enabled);
  };

  const openSoundCustomization = async () => {
    setSoundCustomizationOpen(true);
    setSoundCustomizationError('');
    setSoundCustomizationBusy('loading');
    try {
      setSoundCustomization(await window.bossAPI.getEncounterSoundCustomization());
    } catch {
      setSoundCustomizationError('Não foi possível carregar os efeitos sonoros.');
    } finally {
      setSoundCustomizationBusy(null);
    }
  };

  const stopSoundPreview = () => {
    setPreviewingSoundId(null);
    const audio = soundPreviewRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
  };

  const playSoundPreview = async (option: EncounterSoundOption) => {
    const audio = soundPreviewRef.current;
    if (!audio) return;
    if (previewingSoundId === option.id && !audio.paused) {
      stopSoundPreview();
      return;
    }
    if (universalMuted) {
      setSoundCustomizationError(
        'Desative o mute universal para ouvir a amostra.',
      );
      return;
    }
    setSoundCustomizationError('');
    audio.pause();
    audio.src = option.previewUrl;
    audio.volume = Math.max(0, Math.min(1, encounterEffects?.volume ?? 0.8));
    audio.load();
    try {
      await audio.play();
      setPreviewingSoundId(option.id);
    } catch {
      setPreviewingSoundId(null);
      setSoundCustomizationError('Não foi possível reproduzir esta amostra.');
    }
  };

  const addEncounterSound = async (kind: EncounterSoundEffectKind) => {
    setSoundCustomizationBusy(`add:${kind}`);
    setSoundCustomizationError('');
    try {
      const result = await window.bossAPI.addEncounterSound(kind);
      if (result.ok && result.state) {
        setSoundCustomization(result.state);
      } else if (!result.canceled) {
        setSoundCustomizationError(
          result.error ?? 'Não foi possível adicionar o efeito sonoro.',
        );
      }
    } catch {
      setSoundCustomizationError('Não foi possível adicionar o efeito sonoro.');
    } finally {
      setSoundCustomizationBusy(null);
    }
  };

  const setSoundOptionEnabled = async (optionId: string, enabled: boolean) => {
    setSoundCustomizationBusy(optionId);
    setSoundCustomizationError('');
    try {
      const result = await window.bossAPI.setEncounterSoundOptionEnabled(
        optionId,
        enabled,
      );
      if (result.ok && result.state) {
        setSoundCustomization(result.state);
      } else {
        setSoundCustomizationError(
          result.error ?? 'Não foi possível atualizar o efeito sonoro.',
        );
      }
    } catch {
      setSoundCustomizationError('Não foi possível atualizar o efeito sonoro.');
    } finally {
      setSoundCustomizationBusy(null);
    }
  };

  const removeEncounterSound = async () => {
    if (!pendingSoundRemoval) return;
    setSoundCustomizationBusy(pendingSoundRemoval.id);
    setSoundCustomizationError('');
    try {
      const result = await window.bossAPI.removeEncounterSound(
        pendingSoundRemoval.id,
      );
      if (result.ok && result.state) {
        setSoundCustomization(result.state);
        setPendingSoundRemoval(null);
      } else {
        setSoundCustomizationError(
          result.error ?? 'Não foi possível remover o efeito sonoro.',
        );
        setPendingSoundRemoval(null);
      }
    } catch {
      setSoundCustomizationError('Não foi possível remover o efeito sonoro.');
      setPendingSoundRemoval(null);
    } finally {
      setSoundCustomizationBusy(null);
    }
  };

  if (!state) return <main className="master-loading">Conectando ao encontro...</main>;

  const unpreparedBosses = state.bosses.filter(
    (boss) => !boss.identityPrepared || !boss.actionPrepared,
  );
  const selectedSoundCategoryLabel = encounterSoundCategories.find(
    (category) => category.kind === selectedSoundCategory,
  )?.label ?? 'Dano';
  const selectedSoundOptions = soundCustomization?.options.filter(
    (option) => option.kind === selectedSoundCategory,
  ) ?? [];

  return (
    <main className="master-shell">
      <button
        className="settings-button"
        type="button"
        title="Configurações"
        aria-label="Abrir configurações"
        aria-haspopup="dialog"
        onClick={() => setSettingsOpen(true)}
      >
        <img src={bundledAssetUrl('cog.png')} alt="" />
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
        <div className="compact-panel-title"><h2>Sessão</h2></div>
        <div className="session-actions">
          <button
            className="presentation-button"
            type="button"
            disabled={presentationOpen}
            data-disabled-reason="A janela dos jogadores já está aberta"
            onClick={() => void window.bossAPI.openPresentation().then((opened) => {
              if (opened) setPresentationOpen(true);
            })}
          >
            {presentationOpen ? 'Janela já aberta' : 'Abrir Janela'}
          </button>
          <button className="hud-toggle-button" type="button" onClick={() => window.bossAPI.dispatch({ type: 'set-hud-visible', visible: !state.hudVisible })}>{state.hudVisible ? 'Esconder HUD' : 'Mostrar HUD'}</button>
          {scenePlan?.blackoutActive ? (
            <button
              className="release-blackout-button"
              type="button"
              onClick={() => void window.bossAPI.releaseSceneBlackout()}
            >Liberar blackout</button>
          ) : (
            <button
              className="blackout-button"
              type="button"
              onClick={() => void window.bossAPI.activateSceneBlackout()}
            >Blackout</button>
          )}
          <button
            className={`start-battle-button ${state.battleStarted ? 'is-ending' : ''}`}
            type="button"
            onClick={() => state.battleStarted
              ? window.bossAPI.dispatch({ type: 'end-battle' })
              : startBattle()}
          >
            {state.battleStarted ? 'Encerrar batalha' : 'Iniciar batalha'}
          </button>
          <button className="reset-button" type="button" onClick={() => setResetConfirmationOpen(true)}>Resetar tudo</button>
        </div>
      </section>

      <section className="compact-panel">
        <div className="compact-panel-title"><h2>Personalização de Cena</h2></div>
        <div className="scene-customization-actions">
          <button
            className="sound-customization-button"
            type="button"
            aria-haspopup="dialog"
            onClick={() => void openSoundCustomization()}
          >
            Efeitos sonoros
          </button>
          <button
            className="boss-phases-button"
            type="button"
            onClick={() => void window.bossAPI.openSceneEditor()}
          >
            Editar cena
          </button>
        </div>
      </section>

      <section className="compact-panel library-panel" aria-label="Biblioteca de encontros">
        <div className="compact-panel-title"><h2>Biblioteca de Encontros</h2></div>
        <p>Salve ou recupere a luta completa, incluindo mídias e áudio.</p>
        <div className="library-actions">
          <button className="save-library-button" type="button" disabled={savingLibrary} data-disabled-reason="Aguarde o salvamento atual" onClick={() => void saveEncounter()}>{savingLibrary ? 'Salvando...' : 'Salvar encontro'}</button>
          <button className="load-library-button" type="button" onClick={() => void window.bossAPI.openBossLibrary()}>Carregar encontro</button>
        </div>
        {libraryMessage && <p className="library-status-message">{libraryMessage}</p>}
      </section>

      <footer className="master-footer">@Criado por: Brian Nascimento - Versão {appVersion}</footer>

      {settingsOpen && encounterEffects && (
        <div className="modal-backdrop">
          <section className="confirmation-modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <button
              className="settings-close-button"
              type="button"
              aria-label="Fechar configurações"
              onClick={() => setSettingsOpen(false)}
            >
              ×
            </button>
            <h2 id="settings-title">Configurações</h2>
            <section className="settings-category" aria-labelledby="general-settings-title">
              <h3 id="general-settings-title">Geral</h3>
              <div className="settings-options">
                <SettingsCheckbox
                  checked={encounterEffects.general.automaticStatusEffects}
                  label="Cálculos automáticos de condições"
                  onChange={(checked) => setEncounterGeneralEnabled('automaticStatusEffects', checked)}
                />
                <SettingsCheckbox
                  checked={encounterEffects.general.phaseMarkers}
                  label="Marcadores de mudança na barra de vida"
                  onChange={(checked) => setEncounterGeneralEnabled('phaseMarkers', checked)}
                />
              </div>
            </section>
            <section className="settings-category" aria-labelledby="sound-settings-title">
              <h3 id="sound-settings-title">Som</h3>
              <div className="settings-options settings-sound-options">
                <SettingsCheckbox checked={encounterEffects.sounds.heal} label="Cura" onChange={(checked) => setEncounterSoundEnabled('heal', checked)} />
                <SettingsCheckbox checked={encounterEffects.sounds.damage} label="Dano" onChange={(checked) => setEncounterSoundEnabled('damage', checked)} />
                <SettingsCheckbox checked={encounterEffects.sounds.shield} label="Escudo" onChange={(checked) => setEncounterSoundEnabled('shield', checked)} />
              </div>
              <label className="settings-volume-control">
                <span>Efeitos sonoros <strong>{Math.round(encounterEffects.volume * 100)}%</strong></span>
                <input
                  className="settings-volume-range"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={encounterEffects.volume}
                  aria-label="Volume dos efeitos sonoros"
                  onChange={(event) => setEncounterEffectsVolume(Number(event.target.value))}
                />
              </label>
              <label className="settings-volume-control">
                <span>Música <strong>{Math.round((musicState?.volume ?? 0.8) * 100)}%</strong></span>
                <input
                  className="settings-volume-range"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={musicState?.volume ?? 0.8}
                  aria-label="Volume das músicas"
                  onChange={(event) => window.bossAPI.dispatchMusicControl({
                    type: 'set-volume',
                    volume: Number(event.target.value),
                  })}
                />
              </label>
            </section>
            <section className="settings-category" aria-labelledby="visual-settings-title">
              <h3 id="visual-settings-title">Efeitos</h3>
              <div className="settings-options settings-visual-options">
                <SettingsCheckbox checked={encounterEffects.visuals.screenShake} label="Tremor na tela" onChange={(checked) => setEncounterVisualEffectEnabled('screenShake', checked)} />
                <SettingsCheckbox checked={encounterEffects.visuals.healthBarShake} label="Tremor na barra de vida" onChange={(checked) => setEncounterVisualEffectEnabled('healthBarShake', checked)} />
                <SettingsCheckbox checked={encounterEffects.visuals.damageEffect} label="Efeito de dano" onChange={(checked) => setEncounterVisualEffectEnabled('damageEffect', checked)} />
                <SettingsCheckbox checked={encounterEffects.visuals.healEffect} label="Efeito de cura" onChange={(checked) => setEncounterVisualEffectEnabled('healEffect', checked)} />
                <SettingsCheckbox checked={encounterEffects.visuals.particles} label="Partículas" onChange={(checked) => setEncounterVisualEffectEnabled('particles', checked)} />
                <SettingsCheckbox checked={encounterEffects.visuals.floatingDamageNumbers} label="Números flutuantes de dano" onChange={(checked) => setEncounterVisualEffectEnabled('floatingDamageNumbers', checked)} />
                <SettingsCheckbox checked={encounterEffects.visuals.healthNumbers} label="Visor numérico de vida" onChange={(checked) => setEncounterVisualEffectEnabled('healthNumbers', checked)} />
              </div>
            </section>
          </section>
        </div>
      )}

      {soundCustomizationOpen && (
        <div className="modal-backdrop">
          <section
            className="confirmation-modal sound-customization-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sound-customization-title"
          >
            <button
              className="settings-close-button"
              type="button"
              aria-label="Fechar personalização de efeitos sonoros"
              onClick={() => {
                stopSoundPreview();
                setSoundCategoryMenuOpen(false);
                setSoundCustomizationOpen(false);
                setSoundCustomizationError('');
              }}
            >
              ×
            </button>
            <h2 id="sound-customization-title">Efeitos sonoros da cena</h2>
            <audio
              ref={soundPreviewRef}
              aria-hidden="true"
              onEnded={() => setPreviewingSoundId(null)}
              onError={() => {
                if (
                  !previewingSoundId ||
                  !soundPreviewRef.current?.getAttribute('src')
                ) return;
                setPreviewingSoundId(null);
                setSoundCustomizationError(
                  'Não foi possível reproduzir esta amostra.',
                );
              }}
            />
            {soundCustomizationBusy === 'loading' && !soundCustomization ? (
              <p className="sound-customization-loading">Carregando efeitos...</p>
            ) : (
              <section className="sound-category">
                <div className="sound-category-toolbar">
                  <div className="sound-category-dropdown">
                    <button
                      className="sound-category-trigger"
                      ref={soundCategoryTriggerRef}
                      type="button"
                      aria-haspopup="listbox"
                      aria-expanded={soundCategoryMenuOpen}
                      onClick={() => setSoundCategoryMenuOpen((open) => !open)}
                    >
                      <span>{selectedSoundCategoryLabel}</span>
                      <span className="sound-category-chevron" aria-hidden="true">⌄</span>
                    </button>
                    {soundCategoryMenuOpen && soundCategoryMenuPosition && createPortal(
                      <div
                        className="sound-category-menu"
                        ref={soundCategoryMenuRef}
                        role="listbox"
                        aria-label="Categoria do efeito sonoro"
                        style={soundCategoryMenuPosition}
                      >
                        {encounterSoundCategories.map(({ kind, label }) => (
                          <button
                            className={kind === selectedSoundCategory ? 'is-selected' : ''}
                            type="button"
                            role="option"
                            aria-selected={kind === selectedSoundCategory}
                            key={kind}
                            onClick={() => {
                              stopSoundPreview();
                              setSelectedSoundCategory(kind);
                              setSoundCategoryMenuOpen(false);
                              setSoundCustomizationError('');
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>,
                      document.body,
                    )}
                  </div>
                  <button
                    className="add-category-sound-button"
                    type="button"
                    disabled={soundCustomizationBusy !== null}
                    data-disabled-reason="Aguarde a personalização atual"
                    onClick={() => void addEncounterSound(selectedSoundCategory)}
                  >
                    {soundCustomizationBusy === `add:${selectedSoundCategory}`
                      ? 'Adicionando...'
                      : 'Adicionar MP3'}
                  </button>
                </div>
                {selectedSoundOptions.length > 0 ? (
                  <div className="scene-sound-options">
                    {selectedSoundOptions.map((option) => (
                      <div className="scene-sound-row" key={option.id}>
                        <label className="scene-sound-option">
                          <input
                            type="checkbox"
                            checked={option.enabled}
                            disabled={soundCustomizationBusy !== null}
                            data-disabled-reason="Aguarde a personalização atual"
                            onChange={(event) => void setSoundOptionEnabled(
                              option.id,
                              event.target.checked,
                            )}
                          />
                          <span className="settings-checkmark" aria-hidden="true" />
                          <span className="scene-sound-copy">
                            <strong title={option.name}>{option.name}</strong>
                            <small>{option.isDefault ? 'Padrão' : 'Personalizado'}</small>
                          </span>
                        </label>
                        <button
                          className={`preview-sound-button ${previewingSoundId === option.id ? 'is-playing' : ''}`}
                          type="button"
                          disabled={soundCustomizationBusy !== null}
                          data-disabled-reason="Aguarde a personalização atual"
                          aria-label={previewingSoundId === option.id
                            ? `Parar amostra de ${option.name}`
                            : `Ouvir amostra de ${option.name}`}
                          title={previewingSoundId === option.id
                            ? 'Parar amostra'
                            : 'Ouvir amostra'}
                          onClick={() => void playSoundPreview(option)}
                        >
                          {previewingSoundId === option.id ? '■' : '▶'}
                        </button>
                        {!option.isDefault && (
                          <button
                            className="remove-custom-sound-button"
                            type="button"
                            disabled={soundCustomizationBusy !== null}
                            data-disabled-reason="Aguarde a personalização atual"
                            aria-label={`Remover ${option.name}`}
                            title="Remover efeito personalizado"
                            onClick={() => {
                              stopSoundPreview();
                              setPendingSoundRemoval(option);
                            }}
                          >
                            Remover
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="sound-category-empty">Nenhum som disponível.</p>
                )}
              </section>
            )}
            {soundCustomizationError && (
              <p className="sound-customization-error" role="alert">
                {soundCustomizationError}
              </p>
            )}
          </section>
        </div>
      )}

      {pendingSoundRemoval && (
        <div className="modal-backdrop sound-removal-backdrop">
          <section
            className="confirmation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-sound-title"
          >
            <p className="modal-eyebrow">Efeito personalizado</p>
            <h2 id="remove-sound-title">Remover “{pendingSoundRemoval.name}”?</h2>
            <p>O arquivo copiado para o BossBar também será excluído.</p>
            <div className="modal-actions">
              <button
                className="modal-cancel-button"
                type="button"
                disabled={soundCustomizationBusy !== null}
                data-disabled-reason="Aguarde a personalização atual"
                onClick={() => setPendingSoundRemoval(null)}
              >
                Cancelar
              </button>
              <button
                className="modal-confirm-button"
                type="button"
                disabled={soundCustomizationBusy !== null}
                data-disabled-reason="Aguarde a personalização atual"
                onClick={() => void removeEncounterSound()}
              >
                {soundCustomizationBusy === pendingSoundRemoval.id
                  ? 'Removendo...'
                  : 'Sim, remover'}
              </button>
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
              <button className="modal-cancel-button" type="button" disabled={closingApp} data-disabled-reason="O aplicativo está sendo encerrado" onClick={() => setCloseConfirmationOpen(false)}>Cancelar</button>
              <button className="modal-confirm-button" type="button" disabled={closingApp} data-disabled-reason="O aplicativo está sendo encerrado" onClick={() => void confirmAppClose()}>{closingApp ? 'Salvando...' : 'Sim, fechar'}</button>
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
