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
import type { PlayerProfileSummary } from './shared/character-sheet';
import type {
  ConnectionQuality,
  HostedSessionState,
} from './shared/multiplayer';
import type { ScenePlan } from './shared/scene';
import {
  createPlayerNotesDocument,
  nextPlayerNoteTab,
  parsePlayerNotesDocument,
  serializePlayerNotesDocument,
  type PlayerNotesDocument,
} from './shared/player-notes';
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

const connectionQualityLabels: Record<ConnectionQuality, string> = {
  unknown: 'Medindo',
  excellent: 'Excelente',
  good: 'Boa',
  unstable: 'Instável',
  poor: 'Ruim',
};

const allowedNoteTags = new Set([
  'B', 'BR', 'DIV', 'EM', 'FONT', 'I', 'LI', 'OL', 'P', 'SPAN', 'STRONG', 'U',
]);

const sanitizeNotesHtml = (value: string) => {
  const template = document.createElement('template');
  template.innerHTML = value.slice(0, 90_000);
  const sanitizeNode = (node: Node) => {
    for (const child of [...node.childNodes]) sanitizeNode(child);
    if (!(node instanceof Element)) return;
    if (!(node instanceof HTMLElement)) {
      node.remove();
      return;
    }
    if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE') {
      node.remove();
      return;
    }
    if (!allowedNoteTags.has(node.tagName)) {
      node.replaceWith(...node.childNodes);
      return;
    }
    const fontSize = node.tagName === 'FONT' ? node.getAttribute('size') : null;
    for (const attribute of [...node.attributes]) node.removeAttribute(attribute.name);
    if (fontSize && /^[2-5]$/.test(fontSize)) node.setAttribute('size', fontSize);
  };
  sanitizeNode(template.content);
  return template.innerHTML;
};

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
  const [hostedSession, setHostedSession] = useState<HostedSessionState | null>(
    null,
  );
  const [hostedSessionFeedback, setHostedSessionFeedback] = useState('');
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
  const [returnConfirmationOpen, setReturnConfirmationOpen] = useState(false);
  const [overwriteConfirmationOpen, setOverwriteConfirmationOpen] = useState(false);
  const [unpreparedConfirmationOpen, setUnpreparedConfirmationOpen] = useState(false);
  const [libraryMessage, setLibraryMessage] = useState('');
  const [savingLibrary, setSavingLibrary] = useState(false);
  const [closingApp, setClosingApp] = useState(false);
  const [returningToLauncher, setReturningToLauncher] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [masterNotes, setMasterNotes] = useState<PlayerNotesDocument>(
    createPlayerNotesDocument,
  );
  const [masterNotesStatus, setMasterNotesStatus] = useState('');
  const [notesClearConfirmationOpen, setNotesClearConfirmationOpen] = useState(false);
  const [playerProfilesOpen, setPlayerProfilesOpen] = useState(false);
  const [playerProfiles, setPlayerProfiles] = useState<PlayerProfileSummary[]>([]);
  const [playerProfilesError, setPlayerProfilesError] = useState('');
  const [passwordResetPlayer, setPasswordResetPlayer] = useState<{
    id: string;
    name: string;
    source: 'connected' | 'profile';
  } | null>(null);
  const [passwordResetValue, setPasswordResetValue] = useState('');
  const [passwordResetConfirm, setPasswordResetConfirm] = useState('');
  const [passwordResetError, setPasswordResetError] = useState('');
  const [autosaveNoticeVisible, setAutosaveNoticeVisible] = useState(false);
  const latestLibraryDraft = useRef<BossLibraryDraft | null>(null);
  const autosaveNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundPreviewRef = useRef<HTMLAudioElement | null>(null);
  const soundCategoryTriggerRef = useRef<HTMLButtonElement | null>(null);
  const soundCategoryMenuRef = useRef<HTMLDivElement | null>(null);
  const masterNotesEditorRef = useRef<HTMLDivElement | null>(null);
  const hostedSessionFeedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

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

  useLayoutEffect(() => {
    const editor = masterNotesEditorRef.current;
    if (!notesOpen || !editor) return;
    const activeTab = masterNotes.tabs.find(
      ({ id }) => id === masterNotes.activeTabId,
    ) ?? masterNotes.tabs[0];
    const html = sanitizeNotesHtml(activeTab?.html ?? '');
    if (editor.innerHTML !== html) editor.innerHTML = html;
  }, [masterNotes.activeTabId, notesOpen]);

  useEffect(() => {
    if (!notesOpen) return;
    const closeNotesOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (notesClearConfirmationOpen) {
        setNotesClearConfirmationOpen(false);
      } else {
        setNotesOpen(false);
      }
    };
    document.addEventListener('keydown', closeNotesOnEscape);
    return () => document.removeEventListener('keydown', closeNotesOnEscape);
  }, [notesClearConfirmationOpen, notesOpen]);

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
    let active = true;
    window.bossAPI.getHostedSessionState().then((nextSession) => {
      if (active) setHostedSession(nextSession);
    }).catch(() => {
      if (active) setHostedSession(null);
    });
    const unsubscribe = window.bossAPI.subscribeHostedSession((nextSession) => {
      if (active) setHostedSession(nextSession);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => () => {
    if (hostedSessionFeedbackTimer.current) {
      clearTimeout(hostedSessionFeedbackTimer.current);
    }
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

  const confirmReturnToLauncher = async () => {
    setReturningToLauncher(true);
    try {
      const returned = await window.bossAPI.returnToLauncher();
      if (!returned) {
        setReturningToLauncher(false);
        setReturnConfirmationOpen(false);
        setLibraryMessage('Não foi possível voltar à tela inicial.');
      }
    } catch {
      setReturningToLauncher(false);
      setReturnConfirmationOpen(false);
      setLibraryMessage('Não foi possível voltar à tela inicial.');
    }
  };

  const showHostedSessionFeedback = (message: string) => {
    setHostedSessionFeedback(message);
    if (hostedSessionFeedbackTimer.current) {
      clearTimeout(hostedSessionFeedbackTimer.current);
    }
    hostedSessionFeedbackTimer.current = setTimeout(() => {
      hostedSessionFeedbackTimer.current = null;
      setHostedSessionFeedback('');
    }, 2600);
  };

  const copyHostedSessionLink = async () => {
    try {
      const copied = await window.bossAPI.copyHostedSessionLink();
      showHostedSessionFeedback(
        copied ? 'Link copiado.' : 'Não foi possível copiar o link.',
      );
    } catch {
      showHostedSessionFeedback('Não foi possível copiar o link.');
    }
  };

  const openHostedSessionAsPlayer = async () => {
    try {
      const opened = await window.bossAPI.openHostedSessionAsPlayer();
      if (!opened) {
        showHostedSessionFeedback('Não foi possível abrir o acesso local.');
      }
    } catch {
      showHostedSessionFeedback('Não foi possível abrir o acesso local.');
    }
  };

  const decideHostedPlayer = async (
    requestId: string,
    approved: boolean,
  ) => {
    try {
      const changed = approved
        ? await window.bossAPI.approveHostedPlayer(requestId)
        : await window.bossAPI.rejectHostedPlayer(requestId);
      if (!changed) {
        showHostedSessionFeedback('A solicitação não está mais disponível.');
      }
    } catch {
      showHostedSessionFeedback('Não foi possível responder à solicitação.');
    }
  };

  const captureMasterNotesEditor = (source: PlayerNotesDocument) => {
    const editor = masterNotesEditorRef.current;
    if (!editor) return source;
    const html = sanitizeNotesHtml(editor.innerHTML);
    return {
      ...source,
      tabs: source.tabs.map((tab) => tab.id === source.activeTabId
        ? { ...tab, html }
        : tab),
    };
  };

  const updateActiveMasterNote = (html: string) => {
    const sanitized = sanitizeNotesHtml(html);
    setMasterNotes((current) => ({
      ...current,
      tabs: current.tabs.map((tab) => tab.id === current.activeTabId
        ? { ...tab, html: sanitized }
        : tab),
    }));
  };

  const selectMasterNoteTab = (tabId: string) => {
    setMasterNotes((current) => ({
      ...captureMasterNotesEditor(current),
      activeTabId: tabId,
    }));
    setMasterNotesStatus('');
  };

  const addMasterNoteTab = () => {
    setMasterNotes((current) => {
      const captured = captureMasterNotesEditor(current);
      const tab = nextPlayerNoteTab(captured);
      if (!tab) {
        setMasterNotesStatus('Limite de 20 notas atingido.');
        return captured;
      }
      setMasterNotesStatus('');
      return {
        ...captured,
        activeTabId: tab.id,
        tabs: [...captured.tabs, tab],
      };
    });
  };

  const removeMasterNoteTab = (tabId: string) => {
    setMasterNotes((current) => {
      const captured = captureMasterNotesEditor(current);
      if (captured.tabs.length <= 1) return captured;
      const removedIndex = captured.tabs.findIndex(({ id }) => id === tabId);
      if (removedIndex < 0) return captured;
      const tabs = captured.tabs.filter(({ id }) => id !== tabId);
      const activeTabId = captured.activeTabId === tabId
        ? tabs[Math.max(0, removedIndex - 1)].id
        : captured.activeTabId;
      return { ...captured, activeTabId, tabs };
    });
    setMasterNotesStatus('');
  };

  const applyMasterNotesCommand = (command: string, value?: string) => {
    const editor = masterNotesEditorRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(command, false, value);
    updateActiveMasterNote(editor.innerHTML);
  };

  const openMasterNotes = async () => {
    setMasterNotesStatus('');
    try {
      setMasterNotes(parsePlayerNotesDocument(await window.bossAPI.getMasterNotes()));
      setNotesOpen(true);
    } catch {
      setMasterNotesStatus('Não foi possível carregar as notas.');
      setMasterNotes(createPlayerNotesDocument());
      setNotesOpen(true);
    }
  };

  const saveMasterNotes = async () => {
    setMasterNotesStatus('Salvando…');
    const notes = captureMasterNotesEditor(masterNotes);
    setMasterNotes(notes);
    try {
      const result = await window.bossAPI.saveMasterNotes(
        serializePlayerNotesDocument(notes),
      );
      setMasterNotesStatus(result.ok ? 'Notas salvas.' : result.error ?? 'Falha ao salvar.');
    } catch {
      setMasterNotesStatus('Não foi possível salvar as notas.');
    }
  };

  const clearActiveMasterNote = async () => {
    const notes = captureMasterNotesEditor(masterNotes);
    const cleared = {
      ...notes,
      tabs: notes.tabs.map((tab) => tab.id === notes.activeTabId
        ? { ...tab, html: '' }
        : tab),
    };
    setMasterNotes(cleared);
    if (masterNotesEditorRef.current) masterNotesEditorRef.current.innerHTML = '';
    setMasterNotesStatus('Limpando…');
    try {
      const result = await window.bossAPI.saveMasterNotes(
        serializePlayerNotesDocument(cleared),
      );
      if (result.ok) {
        setNotesClearConfirmationOpen(false);
        setMasterNotesStatus('Nota limpa.');
      } else {
        setMasterNotesStatus(result.error ?? 'Falha ao limpar a nota.');
      }
    } catch {
      setMasterNotesStatus('Não foi possível limpar a nota.');
    }
  };

  const openPlayerProfiles = async () => {
    setPlayerProfilesOpen(true);
    setPlayerProfilesError('');
    try {
      setPlayerProfiles(await window.bossAPI.getPlayerProfiles());
    } catch {
      setPlayerProfilesError('Não foi possível carregar os usuários cadastrados.');
    }
  };

  const confirmPasswordReset = async () => {
    if (!passwordResetPlayer) return;
    if (passwordResetValue.length < 3) {
      setPasswordResetError('A senha deve ter ao menos 3 caracteres.');
      return;
    }
    if (passwordResetValue !== passwordResetConfirm) {
      setPasswordResetError('As senhas não coincidem.');
      return;
    }
    const result = passwordResetPlayer.source === 'profile'
      ? await window.bossAPI.resetPlayerProfilePassword(
        passwordResetPlayer.id,
        passwordResetValue,
      )
      : await window.bossAPI.resetHostedPlayerPassword(
        passwordResetPlayer.id,
        passwordResetValue,
      );
    if (!result.ok) {
      setPasswordResetError(result.error ?? 'Não foi possível redefinir a senha.');
      return;
    }
    setPasswordResetPlayer(null);
    setPasswordResetValue('');
    setPasswordResetConfirm('');
    setPasswordResetError('');
    if (playerProfilesOpen) {
      setPlayerProfiles(await window.bossAPI.getPlayerProfiles());
    }
    showHostedSessionFeedback('Senha redefinida. O jogador precisará entrar novamente.');
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
        className="notes-button"
        type="button"
        title="Bloco de notas"
        aria-label="Abrir bloco de notas"
        aria-haspopup="dialog"
        onClick={() => void openMasterNotes()}
      >
        📝
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
          <button className="return-launcher-button" type="button" onClick={() => setReturnConfirmationOpen(true)}>Voltar ao início</button>
        </div>
      </section>

      {hostedSession?.active && (
        <section
          className="compact-panel hosted-session-panel"
          aria-labelledby="hosted-session-title"
        >
          <div className="hosted-session-heading">
            <div className="compact-panel-title">
              <h2 id="hosted-session-title">Sala hospedada</h2>
            </div>
            <div className="hosted-session-heading-actions">
              <button
                className="hosted-open-button"
                type="button"
                onClick={() => void openPlayerProfiles()}
              >Usuários</button>
              <button
                className="hosted-open-button"
                type="button"
                disabled={!hostedSession.localUrl}
                data-disabled-reason="O acesso local ainda não está disponível"
                onClick={() => void openHostedSessionAsPlayer()}
              >
                Abrir como jogador
              </button>
              <span className="hosted-player-count" aria-label={`${hostedSession.connectedPlayers} de ${hostedSession.maxPlayers} jogadores conectados`}>
                {hostedSession.connectedPlayers}/{hostedSession.maxPlayers}
              </span>
            </div>
          </div>

          <div className="hosted-session-summary">
            <div className="hosted-network-fields">
              <div className="hosted-link-row">
                <label className="hosted-link-field">
                  <span>Link HTTPS dos jogadores</span>
                  <input
                    type="text"
                    value={hostedSession.shareUrl ?? ''}
                    placeholder="O túnel seguro não está disponível"
                    readOnly
                    onFocus={(event) => event.currentTarget.select()}
                  />
                </label>
                <button
                  className="hosted-copy-button"
                  type="button"
                  disabled={!hostedSession.shareUrl}
                  data-disabled-reason="O túnel seguro não está disponível"
                  onClick={() => void copyHostedSessionLink()}
                >
                  Copiar
                </button>
              </div>
              <p className={`hosted-public-url-note ${hostedSession.tunnelStatus === 'error' ? 'is-warning' : ''}`}>
                {hostedSession.tunnelStatus === 'online'
                  ? 'Túnel HTTPS temporário ativo. O link expira ao encerrar a sala.'
                  : 'O túnel HTTPS foi interrompido. Encerre e hospede novamente.'}
              </p>
            </div>
          </div>

          {hostedSession.pendingJoinRequests.length > 0 && (
            <div className="hosted-join-requests">
              <div className="hosted-roster-heading">
                <span>Solicitações de entrada</span>
                <small>Batalha em andamento</small>
              </div>
              <ol className="hosted-request-list">
                {hostedSession.pendingJoinRequests.map((request) => (
                  <li className="hosted-request" key={request.id}>
                    <span title={request.name}>{request.name}</span>
                    <button
                      type="button"
                      onClick={() => void decideHostedPlayer(request.id, true)}
                    >Aprovar</button>
                    <button
                      className="is-reject"
                      type="button"
                      onClick={() => void decideHostedPlayer(request.id, false)}
                    >Recusar</button>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="hosted-roster-heading">
            <span>Jogadores conectados</span>
            {hostedSessionFeedback && (
              <small role="status">{hostedSessionFeedback}</small>
            )}
          </div>
          {hostedSession.players.length > 0 ? (
            <ol className="hosted-player-list">
              {hostedSession.players.map((player) => (
                <li
                  className={`hosted-player hosted-quality-${player.connectionQuality} ${player.hasConnectionIssue ? 'has-connection-issue' : ''}`}
                  key={player.id}
                >
                  <span className="hosted-quality-dot" aria-hidden="true" />
                  <span className="hosted-player-name" title={player.name}>
                    {player.name}
                  </span>
                  <em className={`hosted-master-badge ${player.isHost ? 'is-visible' : ''}`}>
                    {player.isHost ? 'Mestre' : ''}
                  </em>
                  <span className="hosted-player-ping">
                    {player.latencyMs === null
                      ? 'Medindo ping'
                      : `${Math.max(0, Math.round(player.latencyMs))} ms`}
                  </span>
                  <span className="hosted-player-quality">
                    {player.hasConnectionIssue
                      ? 'Problema de conexão'
                      : connectionQualityLabels[player.connectionQuality]}
                  </span>
                  <button
                    className="hosted-player-tool"
                    type="button"
                    disabled={!player.hasCharacterSheet}
                    data-disabled-reason="Este jogador ainda não enviou uma ficha"
                    onClick={() => void window.bossAPI.openHostedPlayerSheet(player.id)}
                  >
                    Ficha
                  </button>
                  <button
                    className="hosted-player-tool is-password"
                    type="button"
                    onClick={() => {
                      setPasswordResetPlayer({ id: player.id, name: player.name, source: 'connected' });
                      setPasswordResetValue('');
                      setPasswordResetConfirm('');
                      setPasswordResetError('');
                    }}
                  >
                    Senha
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="hosted-player-empty">
              Aguardando jogadores entrarem na sala.
            </p>
          )}
          {hostedSession.error && (
            <p className="hosted-session-error" role="alert">
              {hostedSession.error}
            </p>
          )}
        </section>
      )}

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

      {notesOpen && (
        <div className="modal-backdrop">
          <section className="confirmation-modal master-notes-modal" role="dialog" aria-modal="true" aria-labelledby="master-notes-title">
            <button
              className="settings-close-button"
              type="button"
              aria-label="Fechar"
              onClick={() => {
                setMasterNotes((current) => captureMasterNotesEditor(current));
                setNotesClearConfirmationOpen(false);
                setNotesOpen(false);
              }}
            >×</button>
            <h2 id="master-notes-title">Bloco de notas</h2>
            <div className="master-notes-tabs" role="tablist" aria-label="Notas do mestre">
              {masterNotes.tabs.map((tab) => (
                <span
                  className={`master-notes-tab-group ${tab.id === masterNotes.activeTabId ? 'is-active' : ''}`}
                  key={tab.id}
                >
                  <button
                    className="master-notes-tab"
                    type="button"
                    role="tab"
                    aria-selected={tab.id === masterNotes.activeTabId}
                    onClick={() => selectMasterNoteTab(tab.id)}
                  >
                    {tab.title}
                  </button>
                  {masterNotes.tabs.length > 1 && (
                    <button
                      className="master-notes-tab-remove"
                      type="button"
                      aria-label={`Excluir ${tab.title}`}
                      onClick={() => removeMasterNoteTab(tab.id)}
                    >×</button>
                  )}
                </span>
              ))}
              <button
                className="master-notes-tab-add"
                type="button"
                aria-label="Criar nova nota"
                onClick={addMasterNoteTab}
              >+</button>
            </div>
            <div className="master-notes-toolbar" aria-label="Formatação da nota">
              <label htmlFor="master-notes-font-size">Tamanho</label>
              <select
                id="master-notes-font-size"
                defaultValue="3"
                aria-label="Tamanho da fonte"
                onChange={(event) => applyMasterNotesCommand('fontSize', event.target.value)}
              >
                <option value="2">Pequeno</option>
                <option value="3">Normal</option>
                <option value="4">Grande</option>
                <option value="5">Muito grande</option>
              </select>
              <button
                type="button"
                aria-label="Negrito"
                title="Negrito"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyMasterNotesCommand('bold')}
              ><strong>B</strong></button>
              <button
                type="button"
                aria-label="Itálico"
                title="Itálico"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyMasterNotesCommand('italic')}
              ><em>I</em></button>
              <button
                type="button"
                aria-label="Sublinhado"
                title="Sublinhado"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyMasterNotesCommand('underline')}
              ><u>U</u></button>
              <button
                type="button"
                aria-label="Lista numerada"
                title="Lista numerada"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => applyMasterNotesCommand('insertOrderedList')}
              >1.</button>
            </div>
            <div
              ref={masterNotesEditorRef}
              className="master-notes-editor"
              role="textbox"
              aria-label="Conteúdo da nota"
              aria-multiline="true"
              contentEditable
              suppressContentEditableWarning
              data-placeholder="Escreva suas anotações…"
              onInput={(event) => updateActiveMasterNote(event.currentTarget.innerHTML)}
              onPaste={(event) => {
                event.preventDefault();
                document.execCommand(
                  'insertText',
                  false,
                  event.clipboardData.getData('text/plain'),
                );
              }}
            />
            <div className="modal-actions master-notes-actions">
              <span role="status">{masterNotesStatus}</span>
              <button
                className="master-notes-clear-button"
                type="button"
                onClick={() => setNotesClearConfirmationOpen(true)}
              >Limpar nota</button>
              <button className="modal-confirm-button" type="button" onClick={() => void saveMasterNotes()}>Salvar</button>
            </div>
          </section>
        </div>
      )}

      {notesClearConfirmationOpen && (
        <div className="modal-backdrop master-notes-confirmation-backdrop">
          <section
            className="confirmation-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="master-notes-clear-title"
            aria-describedby="master-notes-clear-description"
          >
            <p className="modal-eyebrow">Confirmação</p>
            <h2 id="master-notes-clear-title">Limpar esta nota?</h2>
            <p id="master-notes-clear-description">
              Todo o conteúdo da aba atual será apagado imediatamente.
            </p>
            <div className="modal-actions">
              <button
                className="modal-cancel-button"
                type="button"
                onClick={() => setNotesClearConfirmationOpen(false)}
              >Cancelar</button>
              <button
                className="modal-confirm-button"
                type="button"
                onClick={() => void clearActiveMasterNote()}
              >Limpar</button>
            </div>
          </section>
        </div>
      )}

      {playerProfilesOpen && (
        <div className="modal-backdrop">
          <section className="confirmation-modal player-profiles-modal" role="dialog" aria-modal="true" aria-labelledby="player-profiles-title">
            <button className="settings-close-button" type="button" aria-label="Fechar" onClick={() => setPlayerProfilesOpen(false)}>×</button>
            <h2 id="player-profiles-title">Usuários cadastrados</h2>
            <p>Consulte fichas e redefina senhas mesmo quando o jogador não estiver conectado.</p>
            {playerProfiles.length > 0 ? (
              <ol className="player-profile-list">
                {playerProfiles.map((profile) => (
                  <li key={profile.id}>
                    <span className="player-profile-name" title={profile.username}>{profile.username}</span>
                    <small>{profile.sheet.hasSheet ? profile.sheet.fileName : 'Sem ficha'}</small>
                    <button
                      type="button"
                      disabled={!profile.sheet.hasSheet}
                      data-disabled-reason="Este usuário ainda não enviou uma ficha"
                      onClick={() => void window.bossAPI.openPlayerProfileSheet(profile.id)}
                    >Ficha</button>
                    <button
                      className="is-password"
                      type="button"
                      onClick={() => {
                        setPasswordResetPlayer({
                          id: profile.id,
                          name: profile.username,
                          source: 'profile',
                        });
                        setPasswordResetValue('');
                        setPasswordResetConfirm('');
                        setPasswordResetError('');
                      }}
                    >Senha</button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="hosted-player-empty">Nenhum usuário foi cadastrado nesta instalação.</p>
            )}
            {playerProfilesError && <p className="master-error" role="alert">{playerProfilesError}</p>}
          </section>
        </div>
      )}

      {passwordResetPlayer && (
        <div className="modal-backdrop">
          <section className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="password-reset-title">
            <p className="modal-eyebrow">Jogador: {passwordResetPlayer.name}</p>
            <h2 id="password-reset-title">Redefinir senha</h2>
            <p>Ao confirmar, o jogador será desconectado e deverá entrar com a nova senha.</p>
            <label className="password-reset-field">
              <span>Nova senha</span>
              <input type="password" minLength={3} maxLength={128} value={passwordResetValue} onChange={(event) => setPasswordResetValue(event.target.value)} />
            </label>
            <label className="password-reset-field">
              <span>Confirmar senha</span>
              <input type="password" minLength={3} maxLength={128} value={passwordResetConfirm} onChange={(event) => setPasswordResetConfirm(event.target.value)} />
            </label>
            {passwordResetError && <p className="master-error" role="alert">{passwordResetError}</p>}
            <div className="modal-actions">
              <button className="modal-cancel-button" type="button" onClick={() => setPasswordResetPlayer(null)}>Cancelar</button>
              <button className="modal-confirm-button" type="button" onClick={() => void confirmPasswordReset()}>Redefinir</button>
            </div>
          </section>
        </div>
      )}

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

      {returnConfirmationOpen && (
        <div className="modal-backdrop">
          <section className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="return-title">
            <p className="modal-eyebrow">Voltar ao início</p>
            <h2 id="return-title">Encerrar o encontro atual?</h2>
            <p>A apresentação, o painel e qualquer sala hospedada serão encerrados antes de voltar à tela inicial.</p>
            <div className="modal-actions">
              <button className="modal-cancel-button" type="button" disabled={returningToLauncher} data-disabled-reason="O encontro está sendo encerrado" onClick={() => setReturnConfirmationOpen(false)}>Cancelar</button>
              <button className="modal-confirm-button" type="button" disabled={returningToLauncher} data-disabled-reason="O encontro está sendo encerrado" onClick={() => void confirmReturnToLauncher()}>{returningToLauncher ? 'Encerrando...' : 'Sim, voltar'}</button>
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
