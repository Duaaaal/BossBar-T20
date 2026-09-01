import {
  createWebPlayerApi,
  type WebPlayerConnectionState,
} from './web-player-api';
import {
  MAX_CHARACTER_SHEET_BYTES,
  type CharacterSheetEditorField,
  type PlayerCharacterSheetStatus,
} from './shared/character-sheet';
import {
  CHARACTER_SHEET_DRAFT_MAX_BYTES,
  characterSheetDraftByteLength,
  characterSheetDraftStorageKey,
  recoverCharacterSheetDraft,
  serializeCharacterSheetDraft,
} from './shared/character-sheet-draft';
import {
  createPlayerNotesDocument,
  nextPlayerNoteTab,
  parsePlayerNotesDocument,
  serializePlayerNotesDocument,
  type PlayerNotesDocument,
} from './shared/player-notes';
import { statusIconUrl } from './shared/bundled-assets';
import { installDisabledControlTooltips } from './shared/disabled-controls';
import type {
  PlayerActionKind,
  PlayerAreaDamageImpact,
  PlayerEncounterState,
} from './shared/player-combat';
import {
  getActiveStatusDescription,
  getActiveStatusName,
  getStatusDefinition,
} from './shared/status';
import { deriveStatusAttributes } from './shared/status-rules';
import {
  BOSS_CRITICAL_IMPACT_MIN_DURATION_MS,
  BOSS_CRITICAL_THREAT_DURATION_MS,
} from './shared/battle';
import { escalatingCriticalShakeKeyframes } from './critical-presentation';
import { sanitizeNotesHtml } from './notes-html';
import './web-player.css';

window.__BOSS_WEB_PLAYER__ = true;
installDisabledControlTooltips();

const statusElement = document.getElementById('web-player-status');
const joinElement = document.getElementById('web-player-join');
const closedElement = document.getElementById('web-player-closed');
const joinForm = document.getElementById('web-player-join-form');
const nameInput = document.getElementById('web-player-name');
const passwordInput = document.getElementById('web-player-password');
const createAccessButton = document.getElementById('web-player-create-access');
const confirmMessageElement = document.getElementById('web-player-confirm-message');
const authErrorElement = document.getElementById('web-player-auth-error');
const nameConfirmElement = document.getElementById('web-player-name-confirm');
const confirmedNameElement = document.getElementById('web-player-confirmed-name');
const nameBackButton = document.getElementById('web-player-name-back');
const nameConfirmCloseButton = document.getElementById('web-player-name-confirm-close');
const nameSubmitButton = document.getElementById('web-player-name-submit');
const createAccountDialog = document.getElementById('web-player-create-account');
const createAccountForm = document.getElementById('web-player-create-account-form');
const createAccountName = document.getElementById('web-player-create-name');
const createAccountPassword = document.getElementById('web-player-create-password');
const createAccountPasswordConfirm = document.getElementById('web-player-create-password-confirm');
const createAccountError = document.getElementById('web-player-create-error');
const createAccountBack = document.getElementById('web-player-create-back');
const createAccountClose = document.getElementById('web-player-create-close');
const pendingElement = document.getElementById('web-player-pending');
const pendingTitleElement = document.getElementById('web-player-pending-title');
const pendingMessageElement = document.getElementById('web-player-pending-message');
const changeNameButton = document.getElementById('web-player-change-name');
const changeNameCloseButton = document.getElementById('web-player-change-name-close');
const toolsElement = document.getElementById('web-player-tools');
const sheetButton = document.getElementById('web-player-sheet-button');
const sheetDialog = document.getElementById('web-player-sheet-dialog');
const sheetCloseButton = document.getElementById('web-player-sheet-close');
const sheetInput = document.getElementById('web-player-sheet-input');
const sheetStatusElement = document.getElementById('web-player-sheet-status');
const sheetIssuesElement = document.getElementById('web-player-sheet-issues');
const sheetOpenButton = document.getElementById('web-player-sheet-open');
const sheetFixButton = document.getElementById('web-player-sheet-fix');
const sheetRemoveButton = document.getElementById('web-player-sheet-remove');
const sheetSelectionRemoveButton = document.getElementById('web-player-sheet-selection-remove');
const sheetRemoveDialog = document.getElementById('web-player-sheet-remove-confirm');
const sheetRemoveCancelButton = document.getElementById('web-player-sheet-remove-cancel');
const sheetRemoveCloseButton = document.getElementById('web-player-sheet-remove-close');
const sheetRemoveConfirmButton = document.getElementById('web-player-sheet-remove-confirm-button');
const sheetEditorDialog = document.getElementById('web-player-sheet-editor');
const sheetEditorClose = document.getElementById('web-player-sheet-editor-close');
const sheetEditorSearch = document.getElementById('web-player-sheet-editor-search');
const sheetEditorFields = document.getElementById('web-player-sheet-editor-fields');
const sheetEditorStatus = document.getElementById('web-player-sheet-editor-status');
const characterHud = document.getElementById('web-player-character-hud');
const characterStatuses = document.getElementById('web-player-character-statuses');
const characterName = document.getElementById('web-player-character-name');
const characterExpandButton = document.getElementById('web-player-character-expand');
const characterDetails = document.getElementById('web-player-character-details');
const characterClassLevel = document.getElementById('web-player-character-class-level');
const characterPrivateInput = document.getElementById('web-player-character-private');
const characterActionButtons = [
  ...document.querySelectorAll<HTMLButtonElement>('[data-player-action]'),
];
const characterHealthFill = document.getElementById('web-player-character-health-fill');
const characterTemporaryHealthFill = document.getElementById(
  'web-player-character-temporary-health-fill',
);
const characterHealthValue = document.getElementById('web-player-character-health-value');
const characterManaFill = document.getElementById('web-player-character-mana-fill');
const characterManaValue = document.getElementById('web-player-character-mana-value');
const characterMelee = document.getElementById('web-player-character-melee');
const characterRanged = document.getElementById('web-player-character-ranged');
const characterDefenseMelee = document.getElementById('web-player-character-defense-melee');
const characterDefenseRanged = document.getElementById('web-player-character-defense-ranged');
const characterDefenseGroup = document.getElementById('web-player-character-defense-group');
const characterAttributes = document.getElementById('web-player-character-attributes');
const characterMovement = document.getElementById('web-player-character-movement');
const characterSkills = document.getElementById('web-player-character-skills');
const characterAttacks = document.getElementById('web-player-character-attacks');
const calculationTooltip = document.getElementById('web-player-calculation-tooltip');
const reflexResults = document.getElementById('web-player-reflex-results');
const notesButton = document.getElementById('web-player-notes-button');
const notesDialog = document.getElementById('web-player-notes-dialog');
const notesCloseButton = document.getElementById('web-player-notes-close');
const notesCard = notesDialog?.querySelector<HTMLElement>('.web-player-notes-card') ?? null;
const notesDragHandle = document.getElementById('web-player-notes-drag-handle');
const notesTabsElement = document.getElementById('web-player-notes-tabs');
const notesEditor = document.getElementById('web-player-notes-editor');
const notesTitleInput = document.getElementById('web-player-notes-title');
const notesFontSize = document.getElementById('web-player-notes-font-size');
const notesSaveButton = document.getElementById('web-player-notes-save');
const notesClearButton = document.getElementById('web-player-notes-clear');
const notesClearDialog = document.getElementById('web-player-notes-clear-confirm');
const notesClearCancelButton = document.getElementById('web-player-notes-clear-cancel');
const notesClearCloseButton = document.getElementById('web-player-notes-clear-close');
const notesClearConfirmButton = document.getElementById('web-player-notes-clear-confirm-button');
const notesStatusElement = document.getElementById('web-player-notes-status');
const settingsButton = document.getElementById('web-player-settings-button');
let hideStatusTimer: ReturnType<typeof setTimeout> | null = null;
let playerMounted = false;
let sessionReady = false;
let sessionClosed = false;
let unmountPlayer: (() => void) | null = null;
let authenticating = false;
let notesDocument: PlayerNotesDocument = createPlayerNotesDocument();
let playerEncounterState: PlayerEncounterState | null = null;
let selfHudId: string | null = null;
let activeTurnParticipantId: string | null = null;
let sheetEditorDocument: CharacterSheetEditorField[] = [];
let sheetEditorRemovedFields: CharacterSheetEditorField[] = [];
let sheetEditorBaseDocument: CharacterSheetEditorField[] = [];
let sheetEditorFileName = '';
let sheetEditorUsername = '';
let sheetEditorDirty = false;
let sheetEditorClosing = false;
let sheetEditorDraftTimer: ReturnType<typeof setTimeout> | null = null;

const currentRoomCode = () => {
  const parameters = new URLSearchParams(window.location.search);
  const pathMatch = window.location.pathname.match(/\/(?:join|session)\/([^/]+)/i);
  return (
    parameters.get('room') ??
    parameters.get('roomCode') ??
    (pathMatch ? decodeURIComponent(pathMatch[1]) : '')
  ).trim().toUpperCase();
};

const cloneSheetEditorFields = (fields: readonly CharacterSheetEditorField[]) =>
  fields.map((field) => ({
    ...field,
    ...(field.options ? { options: [...field.options] } : {}),
    ...(field.validation ? { validation: { ...field.validation } } : {}),
  }));

const activeSheetEditorDraftKey = () => {
  const username = sheetEditorUsername.trim();
  const roomCode = currentRoomCode();
  return username && roomCode
    ? characterSheetDraftStorageKey(roomCode, username)
    : null;
};

const clearSheetEditorDraftTimer = () => {
  if (!sheetEditorDraftTimer) return;
  clearTimeout(sheetEditorDraftTimer);
  sheetEditorDraftTimer = null;
};

const clearSheetEditorDraft = () => {
  clearSheetEditorDraftTimer();
  const key = activeSheetEditorDraftKey();
  if (!key) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // The editor still works when browser storage is unavailable.
  }
};

const persistSheetEditorDraft = () => {
  clearSheetEditorDraftTimer();
  if (!sheetEditorDirty || !sheetEditorFileName || sheetEditorBaseDocument.length === 0) return;
  const key = activeSheetEditorDraftKey();
  if (!key) return;
  try {
    const serialized = serializeCharacterSheetDraft({
      fileName: sheetEditorFileName,
      baseFields: sheetEditorBaseDocument,
      fields: sheetEditorDocument,
      removedFields: sheetEditorRemovedFields,
    });
    if (characterSheetDraftByteLength(serialized) > CHARACTER_SHEET_DRAFT_MAX_BYTES) {
      throw new Error('O rascunho ultrapassou o limite local de 512 KB.');
    }
    window.localStorage.setItem(key, serialized);
  } catch (error) {
    if (sheetEditorStatus) {
      sheetEditorStatus.textContent = error instanceof Error
        ? `${error.message} As alterações continuam abertas nesta tela.`
        : 'Não foi possível proteger este rascunho no navegador.';
    }
  }
};

const scheduleSheetEditorDraft = () => {
  clearSheetEditorDraftTimer();
  sheetEditorDraftTimer = setTimeout(persistSheetEditorDraft, 250);
};

const syncPermanentEncounterValuesIntoSheetEditor = () => {
  if (!playerEncounterState || sheetEditorDialog?.hasAttribute('hidden')) return;
  const values = new Map<string, string>([
    ['PVs Totais', String(playerEncounterState.maxHealth)],
    ['PVs Atuais', String(playerEncounterState.currentHealth)],
    ['BossBar.PVs Temporarios', String(playerEncounterState.temporaryHealth)],
    ['PMs Totais', String(playerEncounterState.maxMana)],
    ['PMs Atuais', String(playerEncounterState.currentMana)],
  ]);
  for (const field of sheetEditorDocument) {
    const value = values.get(field.name);
    if (value === undefined) continue;
    field.value = value;
    const fieldElement = [...(sheetEditorFields?.querySelectorAll<HTMLElement>('[data-field-name]') ?? [])]
      .find((element) => element.dataset.fieldName === field.name);
    const input = fieldElement?.querySelector<HTMLInputElement>('input');
    if (input && document.activeElement !== input) input.value = value;
  }
};

const updateOwnTurnHighlight = () => {
  characterHud?.classList.toggle(
    'is-turn-active',
    Boolean(selfHudId && activeTurnParticipantId === `player:${selfHudId}`),
  );
};

let activeCharacterCriticalThreatAnimations: Animation[] = [];
let characterCriticalThreatFallback: ReturnType<typeof setTimeout> | null = null;

const stopCharacterCriticalThreat = () => {
  activeCharacterCriticalThreatAnimations.forEach((animation) => animation.cancel());
  activeCharacterCriticalThreatAnimations = [];
  if (characterCriticalThreatFallback) clearTimeout(characterCriticalThreatFallback);
  characterCriticalThreatFallback = null;
};

const playCharacterCriticalImpact = (
  requestedDuration = BOSS_CRITICAL_IMPACT_MIN_DURATION_MS,
) => {
  stopCharacterCriticalThreat();
  const duration = Math.max(
    BOSS_CRITICAL_IMPACT_MIN_DURATION_MS,
    Math.min(5_000, requestedDuration),
  );
  characterHud?.animate(
    [
      {
        transform: 'translate3d(-18px, 9px, 0) scale(1.055) rotate(-.72deg)',
        filter: 'brightness(2.35) saturate(2.2)',
        boxShadow: '0 0 58px rgb(255 20 30 / 98%), inset 0 0 28px rgb(154 0 10 / 88%)',
      },
      {
        transform: 'translate3d(14px, -7px, 0) scale(1.038) rotate(.54deg)',
        filter: 'brightness(1.85) saturate(1.85)',
        offset: .14,
      },
      { transform: 'translate3d(-10px, 5px, 0) scale(1.024)', offset: .3 },
      { transform: 'translate3d(7px, -3px, 0) scale(1.014)', offset: .48 },
      { transform: 'translate3d(3px, -1px, 0) scale(1.006)', offset: .68 },
      {
        transform: 'translate3d(0, 0, 0) scale(1)',
        filter: 'none',
        boxShadow: '0 6px 24px rgb(0 0 0 / 28%)',
      },
    ],
    {
      duration,
      easing: 'cubic-bezier(.16,.84,.24,1)',
    },
  );
  characterHealthFill?.parentElement?.animate(
    [
      { boxShadow: 'inset 0 1px 4px rgb(0 0 0 / 68%)' },
      {
        boxShadow:
          '0 0 24px rgb(255 43 37 / 96%), inset 0 0 12px rgb(255 218 144 / 84%)',
        offset: .18,
      },
      { boxShadow: 'inset 0 1px 4px rgb(0 0 0 / 68%)' },
    ],
    { duration, easing: 'ease-out' },
  );
};

const playCharacterCriticalThreat = () => {
  stopCharacterCriticalThreat();
  if (!characterHud) return;
  const frames = escalatingCriticalShakeKeyframes({
    maximumX: 25,
    maximumY: 17,
    maximumRotation: 1.05,
    maximumScale: .045,
  }).map((frame) => {
    const progress = typeof frame.offset === 'number' ? frame.offset : 0;
    return {
      ...frame,
      filter: `saturate(${(1 + progress * 1.7).toFixed(2)}) brightness(${(1 + progress * .22).toFixed(2)})`,
      boxShadow:
        `0 0 ${(8 + progress * 50).toFixed(1)}px rgb(255 20 30 / ${(0.2 + progress * .76).toFixed(2)}), ` +
        `inset 0 0 ${(progress * 26).toFixed(1)}px rgb(154 0 10 / ${(progress * .82).toFixed(2)})`,
    } satisfies Keyframe;
  });
  activeCharacterCriticalThreatAnimations.push(characterHud.animate(frames, {
    duration: BOSS_CRITICAL_THREAT_DURATION_MS,
    easing: 'linear',
    fill: 'forwards',
  }));
  characterCriticalThreatFallback = setTimeout(
    stopCharacterCriticalThreat,
    BOSS_CRITICAL_THREAT_DURATION_MS + 7_000,
  );
};

const showConnectionState = ({
  state,
  message,
}: WebPlayerConnectionState) => {
  if (!statusElement) return;
  if (hideStatusTimer) clearTimeout(hideStatusTimer);
  hideStatusTimer = null;
  statusElement.dataset.state = state;
  statusElement.dataset.visible = 'true';
  statusElement.textContent = message;
  if (state === 'closed') {
    sessionClosed = true;
    unmountPlayer?.();
    unmountPlayer = null;
    playerMounted = false;
    joinElement?.setAttribute('hidden', '');
    nameConfirmElement?.setAttribute('hidden', '');
    pendingElement?.setAttribute('hidden', '');
    changeNameButton?.setAttribute('hidden', '');
    toolsElement?.setAttribute('hidden', '');
    playerEncounterState = null;
    characterHud?.setAttribute('hidden', '');
    closedElement?.removeAttribute('hidden');
    statusElement.dataset.visible = 'false';
    return;
  }
  closedElement?.setAttribute('hidden', '');
  if (state === 'awaiting-approval' || state === 'preloading' || state === 'connecting') {
    joinElement?.setAttribute('hidden', '');
    nameConfirmElement?.setAttribute('hidden', '');
    pendingElement?.removeAttribute('hidden');
    if (pendingTitleElement) {
      pendingTitleElement.textContent = state === 'awaiting-approval'
        ? 'Aguardando o mestre'
        : 'Preparando encontro';
    }
    if (pendingMessageElement) pendingMessageElement.textContent = message;
    statusElement.dataset.visible = 'false';
    return;
  }
  pendingElement?.setAttribute('hidden', '');
  if (state === 'connected') {
    joinElement?.setAttribute('hidden', '');
    hideStatusTimer = setTimeout(() => {
      statusElement.dataset.visible = 'false';
      hideStatusTimer = null;
    }, 2_200);
  } else if (state === 'error' && sessionReady) {
    hideStatusTimer = setTimeout(() => {
      statusElement.dataset.visible = 'false';
      hideStatusTimer = null;
    }, 5_000);
  } else if (state === 'error' && !sessionReady) {
    joinElement?.removeAttribute('hidden');
    nameConfirmElement?.setAttribute('hidden', '');
    if (nameInput instanceof HTMLInputElement) nameInput.readOnly = false;
    const submit = joinForm?.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    );
    if (submit) submit.disabled = false;
    nameSubmitButton?.removeAttribute('disabled');
  }
};

const {
  api,
  canConnect,
  getAccountStatus,
  connect,
  dispose,
  uploadCharacterSheet,
  automaticallyFixCharacterSheet,
  fetchCharacterSheetBlob,
  removeCharacterSheet,
  getCharacterSheetEditor,
  saveCharacterSheetEditor,
  setCharacterSheetEditorOpen,
  saveNotes,
  setCharacterPrivate,
  usePlayerAction,
  getPlayerToolsState,
} = createWebPlayerApi({
  onConnectionState: showConnectionState,
  onPlayerState: (state) => {
    playerEncounterState = state;
    renderCharacterSheet(getPlayerToolsState().sheet);
    syncPermanentEncounterValuesIntoSheetEditor();
  },
  onCharacterSheetChanged: (sheet) => {
    renderCharacterSheet(sheet);
    if (!sheetEditorDialog?.hasAttribute('hidden') && !sheetEditorDirty) {
      void getCharacterSheetEditor().then((result) => {
        if (!result.ok || !result.document) return;
        sheetEditorRemovedFields = [];
        sheetEditorFileName = result.document.fileName;
        sheetEditorBaseDocument = cloneSheetEditorFields(result.document.fields);
        sheetEditorDocument = cloneSheetEditorFields(result.document.fields);
        syncPermanentEncounterValuesIntoSheetEditor();
        renderSheetEditorFields();
        if (sheetEditorStatus) {
          sheetEditorStatus.textContent = result.document.pendingApproval
            ? 'Alterações salvas. Aguardando aprovação do mestre.'
            : 'Ficha atualizada com a decisão do mestre.';
        }
      });
    }
  },
  onPlayerCombatImpact: (impact) => {
    playerEncounterState = impact.playerState;
    renderCharacterSheet(getPlayerToolsState().sheet);
    syncPermanentEncounterValuesIntoSheetEditor();
    showReflexResult(impact);
  },
  onSessionReady: () => {
    sessionReady = true;
    sheetEditorUsername = getPlayerToolsState().username ?? '';
    changeNameCloseButton?.setAttribute('hidden', '');
    mountPlayer();
    toolsElement?.removeAttribute('hidden');
    changeNameButton?.removeAttribute('hidden');
    renderCharacterSheet(getPlayerToolsState().sheet);
    notesDocument = parsePlayerNotesDocument(getPlayerToolsState().notes);
    renderNotesEditor();
    queueMicrotask(() => {
      void api.getState().then((state) => {
        changeNameButton?.toggleAttribute(
          'hidden',
          state.battleStarted,
        );
      });
    });
  },
});
window.bossAPI = api;

api.subscribeMusicDuck((event) => {
  if (!selfHudId || !event.targetPlayerIds?.includes(selfHudId)) return;
  if (event.phase === 'duck') playCharacterCriticalThreat();
  if (event.phase === 'impact') playCharacterCriticalImpact(event.duration);
  if (event.phase === 'restore') stopCharacterCriticalThreat();
});

api.subscribePlayerHuds((players) => {
  const self = players.find(({ isSelf }) => isSelf);
  selfHudId = self?.id ?? null;
  updateOwnTurnHighlight();
  if (characterPrivateInput instanceof HTMLInputElement && self) {
    characterPrivateInput.checked = self.privateMode;
  }
  if (self) {
    const sheetLocked = self.sheetInteractionState &&
      self.sheetInteractionState !== 'idle';
    for (const button of characterActionButtons) {
      const action = button.dataset.playerAction as PlayerActionKind;
      const ready = self.actions[action];
      const label = action === 'free'
        ? 'Ação livre'
        : action === 'movement'
          ? 'Ação de movimento'
          : 'Ação padrão';
      button.classList.toggle('is-ready', ready);
      button.disabled = !ready;
      button.dataset.appTooltip = sheetLocked
        ? self.sheetInteractionState === 'editing'
          ? 'Feche a ficha para liberar as ações'
          : 'Aguardando a decisão do mestre sobre a ficha'
        : ready
        ? `${label} disponível`
        : `${label} não disponível`;
      delete button.dataset.tooltip;
    }
  }
});
api.subscribeEncounterTurn((turn) => {
  activeTurnParticipantId = turn.activeParticipantId;
  updateOwnTurnHighlight();
});

const mountPlayer = () => {
  if (playerMounted) return;
  playerMounted = true;
  void import('./player').then((module) => {
    unmountPlayer = module.unmountPlayer;
    if (sessionClosed) {
      unmountPlayer();
      unmountPlayer = null;
      playerMounted = false;
    }
  }).catch((error: unknown) => {
    console.error('Falha ao carregar a apresentação web.', error);
    showConnectionState({
      state: 'error',
      message: 'A apresentação não pôde ser carregada. Atualize a página.',
    });
  });
};

const prepareSheetPreview = (sheet: PlayerCharacterSheetStatus | null) => {
  const interactionState = playerEncounterState?.sheetInteractionState ?? 'idle';
  const disabled = !sheet?.hasSheet || interactionState !== 'idle';
  sheetOpenButton?.toggleAttribute('disabled', disabled);
  if (sheetOpenButton) {
    sheetOpenButton.dataset.disabledReason = interactionState === 'pending-approval'
      ? 'Aguardando a decisão do mestre'
      : interactionState === 'editing'
        ? 'A ficha já está aberta para edição'
        : 'Vincule uma ficha antes de ajustar';
  }
};

const boundedPercent = (current: number | null, maximum: number | null) => {
  if (current === null || maximum === null || maximum <= 0) return 0;
  return Math.max(0, Math.min(100, (current / maximum) * 100));
};

const detailSection = (
  title: string,
  rows: Array<{
    label: string;
    value: string;
    calculation?: string;
    highlighted?: boolean;
  }>,
) => {
  const section = document.createElement('section');
  section.className = 'web-player-character-detail-section';
  const heading = document.createElement('strong');
  heading.textContent = title;
  section.append(heading);
  for (const row of rows) {
    const element = document.createElement('div');
    element.className = `web-player-character-detail-row${row.highlighted ? ' is-trained' : ''}`;
    element.tabIndex = row.calculation ? 0 : -1;
    if (row.calculation) element.dataset.calculation = row.calculation;
    const label = document.createElement('span');
    label.textContent = row.label;
    const value = document.createElement('small');
    value.textContent = row.value;
    element.append(label, value);
    section.append(element);
  }
  return section;
};

const hideCalculationTooltip = () => {
  calculationTooltip?.setAttribute('hidden', '');
};

const showCalculationTooltip = (target: HTMLElement) => {
  const calculation = target.dataset.calculation;
  if (!calculation || !calculationTooltip) return;
  calculationTooltip.textContent = calculation;
  calculationTooltip.removeAttribute('hidden');
  const targetBounds = target.getBoundingClientRect();
  const tooltipBounds = calculationTooltip.getBoundingClientRect();
  const gap = 8;
  const preferredLeft = targetBounds.left - tooltipBounds.width - gap;
  const left = preferredLeft >= gap
    ? preferredLeft
    : Math.min(
      window.innerWidth - tooltipBounds.width - gap,
      targetBounds.right + gap,
    );
  const top = Math.min(
    window.innerHeight - tooltipBounds.height - gap,
    Math.max(gap, targetBounds.top),
  );
  calculationTooltip.style.left = `${Math.max(gap, left)}px`;
  calculationTooltip.style.top = `${Math.max(gap, top)}px`;
};

const calculationTargetFromEvent = (event: Event) => {
  const target = event.target;
  return target instanceof Element
    ? target.closest<HTMLElement>('[data-calculation]')
    : null;
};

const renderCharacterStatuses = (state: PlayerEncounterState | null) => {
  if (!characterStatuses) return;
  characterStatuses.replaceChildren();
  for (const activeStatus of state?.statuses ?? []) {
    const definition = getStatusDefinition(activeStatus.statusId);
    if (!definition) continue;
    const item = document.createElement('span');
    item.className = 'web-player-character-status';
    item.tabIndex = 0;
    const damage = activeStatus.damageFormula
      ? ` Dano: ${activeStatus.damageFormula}.`
      : '';
    const duration = activeStatus.turnsRemaining === 1
      ? '1 turno restante'
      : `${activeStatus.turnsRemaining} turnos restantes`;
    item.dataset.calculation = `${getActiveStatusName(activeStatus)}: ${getActiveStatusDescription(activeStatus)}${damage} ${duration}.`;
    item.setAttribute('aria-label', item.dataset.calculation);
    const icon = document.createElement('img');
    icon.alt = '';
    icon.draggable = false;
    icon.src = statusIconUrl(definition.iconFile);
    item.append(icon);
    characterStatuses.append(item);
  }
};

function showReflexResult(impact: PlayerAreaDamageImpact) {
  if (!reflexResults) return;
  const result = document.createElement('output');
  result.className = `web-player-reflex-result ${impact.check.success ? 'is-success' : 'is-failure'}`;
  result.textContent =
    `Reflexos: 1d20(${impact.check.die}) ` +
    `${impact.check.reflex >= 0 ? '+' : '−'} ${Math.abs(impact.check.reflex)} ` +
    `= ${impact.check.total}`;
  const consequence = document.createElement('small');
  consequence.textContent = impact.damage.applied > 0
    ? ` −${impact.damage.applied} PV`
    : ' sem dano';
  result.append(consequence);
  reflexResults.append(result);
  window.setTimeout(() => result.remove(), 4_200);
}

const renderCharacterHud = (sheet: PlayerCharacterSheetStatus | null) => {
  const summary = sheet?.hasSheet ? sheet.validation?.summary : null;
  if (!summary) {
    characterHud?.setAttribute('hidden', '');
    return;
  }
  const defenses = summary.defenses ?? {
    melee: summary.defense,
    ranged: summary.defense,
    calculation: 'Defesa informada na ficha.',
  };
  const skills = Array.isArray(summary.skills) ? summary.skills : [];
  const attacks = Array.isArray(summary.attacks) ? summary.attacks : [];
  const naturalMelee = skills.find(({ id, name }) =>
    id === '190' || name.toLocaleLowerCase('pt-BR') === 'luta'
  )?.total ?? null;
  const naturalRanged = skills.find(({ id, name }) =>
    id === '260' || name.toLocaleLowerCase('pt-BR') === 'pontaria'
  )?.total ?? null;
  const currentHealth = playerEncounterState?.currentHealth ?? summary.currentHealth;
  const maxHealth = playerEncounterState?.maxHealth ?? summary.maxHealth;
  const temporaryHealth = playerEncounterState?.temporaryHealth ?? summary.temporaryHealth ?? 0;
  const currentMana = playerEncounterState?.currentMana ?? summary.currentMana;
  const maxMana = playerEncounterState?.maxMana ?? summary.maxMana;
  const temporaryDefenseBonus = playerEncounterState?.temporaryDefenseBonus ?? 0;
  const statusValues = playerEncounterState
    ? deriveStatusAttributes({
      attack: naturalMelee ?? 0,
      rangedAttack: naturalRanged ?? 0,
      skills: 0,
      meleeDefense: playerEncounterState.defenseMelee,
      rangedDefense: playerEncounterState.defenseRanged,
      damageReduction: 0,
      shield: 0,
    }, playerEncounterState.statuses)
    : null;
  const melee = naturalMelee === null ? null : statusValues?.values.attack ?? naturalMelee;
  const ranged = naturalRanged === null ? null : statusValues?.values.rangedAttack ?? naturalRanged;
  const defenseMelee = statusValues
    ? statusValues.values.meleeDefense + temporaryDefenseBonus
    : defenses.melee;
  const defenseRanged = statusValues
    ? statusValues.values.rangedDefense + temporaryDefenseBonus
    : defenses.ranged;
  characterHud?.removeAttribute('hidden');
  characterHud?.classList.toggle('is-dead', Boolean(playerEncounterState?.dead));
  renderCharacterStatuses(playerEncounterState);
  if (characterName) {
    characterName.textContent = playerEncounterState?.characterName || summary.characterName || 'Personagem';
  }
  if (characterClassLevel) {
    const classLevel = document.createElement('span');
    classLevel.textContent = `${summary.characterClass || 'Classe não informada'} • Nível ${summary.level ?? '—'}`;
    const vitalSummary = document.createElement('span');
    vitalSummary.className = 'web-player-character-detail-vitals';
    const health = document.createElement('b');
    health.textContent = `PV ${currentHealth ?? '—'}/${maxHealth ?? '—'}`;
    const mana = document.createElement('b');
    mana.textContent = `PM ${currentMana ?? '—'}/${maxMana ?? '—'}`;
    vitalSummary.append(health, mana);
    characterClassLevel.replaceChildren(classLevel, vitalSummary);
    characterClassLevel.tabIndex = -1;
    delete characterClassLevel.dataset.calculation;
  }
  if (characterHealthFill instanceof HTMLElement) {
    characterHealthFill.style.width = `${boundedPercent(currentHealth, maxHealth)}%`;
    const healthBar = characterHealthFill.parentElement;
    const healthChanged = currentHealth !== summary.currentHealth || maxHealth !== summary.maxHealth;
    healthBar?.setAttribute(
      'data-calculation',
      healthChanged
        ? `PV da ficha: ${summary.currentHealth ?? '—'}/${summary.maxHealth ?? '—'}. PV atuais: ${currentHealth ?? '—'}/${maxHealth ?? '—'}.`
        : `PV da ficha: ${currentHealth ?? '—'}/${maxHealth ?? '—'}.`,
    );
  }
  if (characterTemporaryHealthFill instanceof HTMLElement) {
    const excess = Math.max(
      0,
      (currentHealth ?? 0) + temporaryHealth - Math.max(0, maxHealth ?? 0),
    );
    characterTemporaryHealthFill.style.width = `${boundedPercent(excess, maxHealth)}%`;
    characterTemporaryHealthFill.toggleAttribute('hidden', excess <= 0);
    characterTemporaryHealthFill.dataset.calculation =
      `PV temporários excedentes: ${excess} de ${temporaryHealth}.`;
  }
  if (characterHealthValue) characterHealthValue.textContent = `${currentHealth ?? '—'}/${maxHealth ?? '—'}`;
  if (characterManaFill instanceof HTMLElement) {
    characterManaFill.style.width = `${boundedPercent(currentMana, maxMana)}%`;
    const manaBar = characterManaFill.parentElement;
    const manaChanged = currentMana !== summary.currentMana || maxMana !== summary.maxMana;
    manaBar?.setAttribute(
      'data-calculation',
      manaChanged
        ? `PM da ficha: ${summary.currentMana ?? '—'}/${summary.maxMana ?? '—'}. PM atuais: ${currentMana ?? '—'}/${maxMana ?? '—'}.`
        : `PM da ficha: ${currentMana ?? '—'}/${maxMana ?? '—'}.`,
    );
  }
  if (characterManaValue) characterManaValue.textContent = `${currentMana ?? '—'}/${maxMana ?? '—'}`;
  const updateCombatValue = (
    element: HTMLElement | null,
    value: number | null,
    natural: number | null,
    label: string,
  ) => {
    if (!element) return;
    element.textContent = `${value ?? '—'}`;
    element.classList.toggle('is-penalty', value !== null && natural !== null && value < natural);
    element.classList.toggle('is-bonus', value !== null && natural !== null && value > natural);
    element.dataset.calculation = value === natural || value === null || natural === null
      ? `${label}: ${value ?? '—'}.`
      : `${label}: ${natural} ${value > natural ? '+' : '−'} ${Math.abs(value - natural)} = ${value}.`;
  };
  updateCombatValue(characterMelee, melee, naturalMelee, 'Luta');
  updateCombatValue(characterRanged, ranged, naturalRanged, 'Pontaria');
  if (characterDefenseMelee) {
    characterDefenseMelee.textContent = `${defenseMelee ?? '—'}`;
    const modifier = defenseMelee !== null && defenses.melee !== null
      ? defenseMelee - defenses.melee
      : 0;
    characterDefenseMelee.dataset.calculation = modifier === 0
      ? `Defesa CaC: ${defenses.calculation}.`
      : `Defesa CaC: ${defenses.calculation}; ${modifier > 0 ? '+' : '−'} ${Math.abs(modifier)} temporário = ${defenseMelee}.`;
    characterDefenseMelee.tabIndex = 0;
    characterDefenseMelee.classList.toggle(
      'is-penalty',
      defenseMelee !== null && defenses.melee !== null && defenseMelee < defenses.melee,
    );
    characterDefenseMelee.classList.toggle(
      'is-bonus',
      defenseMelee !== null && defenses.melee !== null && defenseMelee > defenses.melee,
    );
  }
  if (characterDefenseRanged) {
    characterDefenseRanged.textContent = `${defenseRanged ?? '—'}`;
    const modifier = defenseRanged !== null && defenses.ranged !== null
      ? defenseRanged - defenses.ranged
      : 0;
    characterDefenseRanged.dataset.calculation = modifier === 0
      ? `Defesa AaD: ${defenses.calculation}.`
      : `Defesa AaD: ${defenses.calculation}; ${modifier > 0 ? '+' : '−'} ${Math.abs(modifier)} temporário = ${defenseRanged}.`;
    characterDefenseRanged.tabIndex = 0;
    characterDefenseRanged.classList.toggle(
      'is-penalty',
      defenseRanged !== null && defenses.ranged !== null && defenseRanged < defenses.ranged,
    );
    characterDefenseRanged.classList.toggle(
      'is-bonus',
      defenseRanged !== null && defenses.ranged !== null && defenseRanged > defenses.ranged,
    );
  }
  if (characterDefenseGroup) {
    characterDefenseGroup.dataset.appTooltip =
      `Defesa corpo a corpo ${defenseMelee ?? '—'} / à distância ${defenseRanged ?? '—'}`;
  }
  if (characterAttributes) {
    const attributes = summary.attributes ?? {
      for: null,
      des: null,
      con: null,
      int: null,
      sab: null,
      car: null,
    };
    const attributeLabels = {
      for: 'FOR',
      des: 'DES',
      con: 'CON',
      int: 'INT',
      sab: 'SAB',
      car: 'CAR',
    } as const;
    characterAttributes.replaceChildren(detailSection(
      'Modificadores de atributo',
      (Object.keys(attributeLabels) as Array<keyof typeof attributeLabels>).map((attribute) => {
        const value = attributes[attribute];
        const displayed = value === null ? '—' : `${value >= 0 ? '+' : ''}${value}`;
        return {
          label: attributeLabels[attribute],
          value: displayed,
        };
      }),
    ));
  }
  if (characterMovement) {
    const strength = summary.attributes.for ?? 0;
    const loadFormula = strength >= 0
      ? `10 + 2 × FOR ${strength} = ${summary.maxLoad ?? '—'}`
      : `10 + FOR ${strength} = ${summary.maxLoad ?? '—'}`;
    characterMovement.replaceChildren(detailSection('Movimento e carga', [
      {
        label: 'Deslocamento',
        value: summary.movement || '—',
        calculation: `Deslocamento da ficha: ${summary.movement || '—'}.`,
      },
      {
        label: 'Tamanho',
        value: summary.size || '—',
        calculation: `Tamanho da ficha: ${summary.size || '—'}.`,
      },
      {
        label: 'Carga',
        value: `${summary.currentLoad ?? '—'}/${summary.maxLoad ?? '—'} espaços`,
        calculation: `Carga atual da ficha: ${summary.currentLoad ?? '—'} espaços. Limite: ${loadFormula} espaços.`,
      },
    ]));
  }
  if (characterSkills) {
    characterSkills.replaceChildren(detailSection('Perícias', skills.map((skill) => {
      const encounterTotal = skill.id === '270' || skill.name === 'Reflexos'
        ? playerEncounterState?.reflex ?? skill.total
        : skill.total;
      const changed = encounterTotal !== skill.total;
      return {
        label: skill.name,
        value: encounterTotal === null ? '—' : `${encounterTotal >= 0 ? '+' : ''}${encounterTotal}`,
        highlighted: skill.trained,
        calculation: changed
          ? `Reflexos ${skill.total ?? '—'} ${encounterTotal !== null && skill.total !== null && encounterTotal >= skill.total ? '+' : '−'} ${skill.total === null || encounterTotal === null ? '—' : Math.abs(encounterTotal - skill.total)} = ${encounterTotal ?? '—'}.`
          : skill.calculation,
      };
    })));
  }
  if (characterAttacks) {
    characterAttacks.replaceChildren(detailSection('Ataques', attacks.length
      ? attacks.map((attack) => ({
        label: attack.name || 'Ataque',
        value: [attack.attackBonus, attack.damage, attack.critical, attack.damageType, attack.range]
          .filter(Boolean).join(' • ') || '—',
        calculation: `Teste ${attack.attackBonus || '—'}; dano ${attack.damage || '—'}; crítico ${attack.critical || '20/x2'}; tipo ${attack.damageType || '—'}; alcance ${attack.range || '—'}.`,
      }))
      : [{ label: 'Nenhum ataque informado', value: '—' }]));
  }
};

const renderCharacterSheet = (sheet: PlayerCharacterSheetStatus | null) => {
  if (sheetStatusElement) {
    sheetStatusElement.textContent = sheet?.hasSheet
      ? `Ficha vinculada: ${sheet.fileName ?? 'ficha-t20.pdf'}`
      : 'Nenhuma ficha vinculada a este usuário.';
  }
  if (sheetIssuesElement) {
    sheetIssuesElement.replaceChildren();
    for (const issue of sheet?.validation?.issues ?? []) {
      const item = document.createElement('li');
      item.dataset.severity = issue.severity;
      const details = issue.expected === undefined
        ? ''
        : ` Esperado: ${issue.expected}; encontrado: ${issue.actual ?? 'vazio'}.`;
      item.textContent = `${issue.message}${details}`;
      sheetIssuesElement.append(item);
    }
  }
  const hasSheet = Boolean(sheet?.hasSheet);
  renderCharacterHud(sheet);
  prepareSheetPreview(sheet);
  sheetRemoveButton?.toggleAttribute('hidden', !hasSheet);
  sheetFixButton?.toggleAttribute(
    'hidden',
    !hasSheet || !(sheet?.validation?.issues.some(({ autoFixable }) => autoFixable) ?? false),
  );
};

const activeNoteTab = () => notesDocument.tabs.find(
  ({ id }) => id === notesDocument.activeTabId,
) ?? notesDocument.tabs[0];

const flushActiveNote = () => {
  const tab = activeNoteTab();
  if (tab && notesEditor instanceof HTMLElement) tab.html = sanitizeNotesHtml(notesEditor.innerHTML);
};

const renderNotesTabs = () => {
  if (!notesTabsElement) return;
  notesTabsElement.replaceChildren();
  for (const tab of notesDocument.tabs) {
    const group = document.createElement('span');
    group.className = `web-player-notes-tab-group${tab.id === notesDocument.activeTabId ? ' is-active' : ''}`;
    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'web-player-notes-tab';
    select.setAttribute('role', 'tab');
    select.setAttribute('aria-selected', String(tab.id === notesDocument.activeTabId));
    select.textContent = tab.title;
    select.addEventListener('click', () => {
      flushActiveNote();
      notesDocument.activeTabId = tab.id;
      renderNotesEditor();
      notesEditor?.focus();
    });
    group.append(select);
    if (notesDocument.tabs.length > 1) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'web-player-notes-tab-remove';
      remove.setAttribute('aria-label', `Excluir ${tab.title}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        flushActiveNote();
        const index = notesDocument.tabs.findIndex(({ id }) => id === tab.id);
        notesDocument.tabs.splice(index, 1);
        if (notesDocument.activeTabId === tab.id) {
          notesDocument.activeTabId = notesDocument.tabs[Math.max(0, index - 1)].id;
        }
        renderNotesEditor();
      });
      group.append(remove);
    }
    notesTabsElement.append(group);
  }
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'web-player-notes-tab-add';
  add.setAttribute('aria-label', 'Criar nova nota');
  add.textContent = '+';
  add.addEventListener('click', () => {
    flushActiveNote();
    const tab = nextPlayerNoteTab(notesDocument);
    if (!tab) {
      if (notesStatusElement) notesStatusElement.textContent = 'Limite de 20 notas atingido.';
      return;
    }
    notesDocument.tabs.push(tab);
    notesDocument.activeTabId = tab.id;
    renderNotesEditor();
    notesEditor?.focus();
  });
  notesTabsElement.append(add);
};

const renderNotesEditor = () => {
  renderNotesTabs();
  if (notesTitleInput instanceof HTMLInputElement) {
    notesTitleInput.value = activeNoteTab()?.title ?? '';
  }
  if (notesEditor instanceof HTMLElement) {
    notesEditor.innerHTML = sanitizeNotesHtml(activeNoteTab()?.html ?? '');
  }
};

sheetButton?.addEventListener('click', () => {
  renderCharacterSheet(getPlayerToolsState().sheet);
  sheetDialog?.removeAttribute('hidden');
});
sheetCloseButton?.addEventListener('click', () => sheetDialog?.setAttribute('hidden', ''));

sheetInput?.addEventListener('change', () => {
  if (!(sheetInput instanceof HTMLInputElement)) return;
  const file = sheetInput.files?.[0];
  sheetSelectionRemoveButton?.toggleAttribute('hidden', !file);
  if (!file) return;
  renderCharacterSheet(getPlayerToolsState().sheet);
  if (file.size > MAX_CHARACTER_SHEET_BYTES) {
    if (sheetStatusElement) sheetStatusElement.textContent = 'A ficha deve ter no máximo 25 MB.';
    return;
  }
  const adjustmentWindow = window.open('', '_blank');
  if (adjustmentWindow) adjustmentWindow.opener = null;
  sheetInput.disabled = true;
  sheetSelectionRemoveButton?.setAttribute('disabled', '');
  if (sheetStatusElement) sheetStatusElement.textContent = 'Lendo e validando a ficha…';
  void uploadCharacterSheet(file).then((result) => {
    if (result.ok) clearSheetEditorDraft();
    renderCharacterSheet(result.sheet ?? null);
    const hasErrors = result.sheet?.validation?.issues.some(
      ({ severity }) => severity === 'error',
    ) ?? !result.ok;
    if (hasErrors && adjustmentWindow) {
      const source = result.sheet?.hasSheet
        ? fetchCharacterSheetBlob()
        : Promise.resolve(file as Blob);
      void source.then((blob) => {
        const url = URL.createObjectURL(blob);
        adjustmentWindow.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }).catch(() => adjustmentWindow.close());
    } else {
      adjustmentWindow?.close();
    }
    if (!result.ok && sheetStatusElement) {
      sheetStatusElement.textContent = result.error ?? 'A ficha precisa de ajustes.';
    }
  }).catch((error: unknown) => {
    adjustmentWindow?.close();
    if (sheetStatusElement) {
      sheetStatusElement.textContent = error instanceof Error
        ? error.message
        : 'Não foi possível enviar a ficha.';
    }
  }).finally(() => {
    sheetInput.disabled = false;
    sheetSelectionRemoveButton?.removeAttribute('disabled');
  });
});

sheetSelectionRemoveButton?.addEventListener('click', () => {
  if (!(sheetInput instanceof HTMLInputElement) || sheetInput.disabled) return;
  sheetInput.value = '';
  sheetSelectionRemoveButton.setAttribute('hidden', '');
  renderCharacterSheet(getPlayerToolsState().sheet);
});

const spellEditorFields = [
  ['Nome', 'Nome', 160],
  ['Escola', 'Escola', 160],
  ['Execucao', 'Execução', 160],
  ['Alcance', 'Alcance', 160],
  ['Area', 'Área', 160],
  ['Duracao', 'Duração', 160],
  ['Resistencia', 'Resistência', 160],
  ['Efeito', 'Efeito', 1_000],
] as const;

const officeOptions = [
  'Armeiro',
  'Artesão',
  'Alquimista',
  'Cozinheiro',
  'Alfaiate',
  'Carpinteiro',
  'Pedreiro',
  'Ourives',
  'Fazendeiro',
  'Pescador',
  'Estalajadeiro',
  'Escriba',
  'Escultor',
  'Pintor',
] as const;

const editorField = (
  name: string,
  label: string,
  section: string,
  group: string,
  validation?: CharacterSheetEditorField['validation'],
): CharacterSheetEditorField => ({
  name,
  label,
  section,
  group,
  kind: 'text',
  value: '',
  ...(validation ? { validation } : {}),
});

const itemEditorFields = (index: number) => [
  editorField(index <= 15 ? `Item${index}` : `BossBar.Item.${index}.Nome`, 'Item', 'Itens', `Item ${index}`),
  {
    ...editorField(`BossBar.Item.${index}.Quantidade`, 'Quantidade', 'Itens', `Item ${index}`, {
      kind: 'integer', min: 0, max: 9_999,
    }),
    value: '0',
  },
  editorField(index <= 15 ? `PesoItem${index}` : `BossBar.Item.${index}.Peso`, 'Peso', 'Itens', `Item ${index}`, {
    kind: 'decimal', min: 0, max: 1_000_000,
  }),
];

const equipmentEditorFields = (kind: 'Armadura' | 'Escudo', index: number) => {
  const section = 'Armadura e escudo';
  const group = `${kind} ${index}`;
  const prefix = `BossBar.${kind}.${index}`;
  return [
    editorField(`${prefix}.Nome`, 'Nome', section, group),
    editorField(`${prefix}.Defesa`, 'Defesa', section, group, {
      kind: 'integer', min: 0, max: 999,
    }),
    editorField(`${prefix}.Penalidade`, 'Penalidade', section, group, {
      kind: 'integer', min: -99, max: 99,
    }),
  ];
};

const nextEditorGroupIndex = (pattern: RegExp, maximum: number) => {
  const used = new Set(sheetEditorDocument.flatMap(({ group }) => {
    const match = pattern.exec(group ?? '');
    return match ? [Number(match[1])] : [];
  }));
  return Array.from({ length: maximum }, (_, offset) => offset + 1)
    .find((candidate) => !used.has(candidate)) ?? null;
};

const addItemEditorRow = () => {
  const index = nextEditorGroupIndex(/^Item (\d+)$/, 100);
  if (!index) {
    if (sheetEditorStatus) sheetEditorStatus.textContent = 'O limite de 100 itens foi atingido.';
    return;
  }
  sheetEditorRemovedFields = sheetEditorRemovedFields.filter(
    ({ group }) => group !== `Item ${index}`,
  );
  sheetEditorDocument.push(...itemEditorFields(index));
  renderSheetEditorFields();
  markSheetEditorDirty();
};

const addEquipmentEditorRow = (kind: 'Armadura' | 'Escudo') => {
  const index = nextEditorGroupIndex(new RegExp(`^${kind} (\\d+)$`), 20);
  if (!index) {
    if (sheetEditorStatus) sheetEditorStatus.textContent = `O limite de 20 ${kind === 'Armadura' ? 'armaduras' : 'escudos'} foi atingido.`;
    return;
  }
  sheetEditorRemovedFields = sheetEditorRemovedFields.filter(
    ({ group }) => group !== `${kind} ${index}`,
  );
  sheetEditorDocument.push(...equipmentEditorFields(kind, index));
  renderSheetEditorFields();
  markSheetEditorDirty();
};

const parseEditorDecimal = (value: string) => {
  const parsed = Number(value.trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const recalculateSheetLoad = () => {
  const groups = new Map<string, CharacterSheetEditorField[]>();
  for (const field of sheetEditorDocument) {
    if (!/^Item \d+$/.test(field.group ?? '')) continue;
    const fields = groups.get(field.group ?? '') ?? [];
    fields.push(field);
    groups.set(field.group ?? '', fields);
  }
  const total = [...groups.values()].reduce((sum, fields) => {
    const quantity = parseEditorDecimal(
      fields.find(({ label }) => label === 'Quantidade')?.value ?? '0',
    );
    const weight = parseEditorDecimal(
      fields.find(({ label }) => label === 'Peso')?.value ?? '0',
    );
    return sum + Math.max(0, quantity) * Math.max(0, weight);
  }, 0);
  const formatted = String(Number(total.toFixed(3)));
  const loadField = sheetEditorDocument.find(({ name }) => name === 'CargaTotal');
  if (loadField) loadField.value = formatted;
  const loadInput = [...(sheetEditorFields?.querySelectorAll<HTMLElement>('[data-field-name]') ?? [])]
    .find(({ dataset }) => dataset.fieldName === 'CargaTotal')
    ?.querySelector<HTMLInputElement>('input');
  if (loadInput) loadInput.value = formatted;
};

const markSheetEditorDirty = () => {
  sheetEditorDirty = true;
  scheduleSheetEditorDraft();
  if (sheetEditorStatus) {
    sheetEditorStatus.textContent =
      'Rascunho local. Uma única solicitação será enviada ao fechar a ficha.';
  }
};

const addSpellEditorRow = () => {
  const usedRows = new Set(sheetEditorDocument.flatMap(({ name }) => {
    const match = /^BossBar\.Magia\.(\d+)\./.exec(name);
    return match ? [Number(match[1])] : [];
  }));
  const index = Array.from({ length: 100 }, (_, offset) => offset + 1)
    .find((candidate) => !usedRows.has(candidate));
  if (!index) {
    if (sheetEditorStatus) sheetEditorStatus.textContent = 'O limite de 100 magias foi atingido.';
    return;
  }
  sheetEditorDocument.push(...spellEditorFields.map(([fieldName, label, maxLength]) => ({
    name: `BossBar.Magia.${index}.${fieldName}`,
    label,
    section: 'Magias',
    group: `Magia ${index}`,
    kind: 'text' as const,
    value: '',
    validation: { kind: 'text' as const, maxLength },
  })));
  renderSheetEditorFields();
  markSheetEditorDirty();
};

const renderSheetEditorFields = () => {
  if (!sheetEditorFields) return;
  const query = sheetEditorSearch instanceof HTMLInputElement
    ? sheetEditorSearch.value.trim().toLocaleLowerCase('pt-BR')
    : '';
  sheetEditorFields.replaceChildren();
  const filteredFields = sheetEditorDocument.filter((field) => {
    if (!query) return true;
    return [field.label, field.section, field.group, field.name]
      .some((value) => value?.toLocaleLowerCase('pt-BR').includes(query));
  });
  const sections = new Map<string, CharacterSheetEditorField[]>();
  for (const field of filteredFields) {
    const sectionFields = sections.get(field.section) ?? [];
    sectionFields.push(field);
    sections.set(field.section, sectionFields);
  }

  const scheduleFieldSave = (
    field: CharacterSheetEditorField,
    input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  ) => {
    field.value = field.kind === 'checkbox'
      ? (input as HTMLInputElement).checked ? 'Yes' : 'Off'
      : input.value;
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
      input.setCustomValidity('');
      const value = input.value.trim();
      const validation = field.validation;
      if (value && validation?.kind === 'integer' && !/^[+-]?\d+$/.test(value)) {
        input.setCustomValidity('Informe um número inteiro.');
      } else if (
        value &&
        validation?.kind === 'integer' &&
        validation.min !== undefined &&
        Number(value) < validation.min
      ) {
        input.setCustomValidity(`O valor mínimo é ${validation.min}.`);
      } else if (
        value &&
        validation?.kind === 'integer' &&
        validation.max !== undefined &&
        Number(value) > validation.max
      ) {
        input.setCustomValidity(`O valor máximo é ${validation.max}.`);
      } else if (
        value &&
        validation?.kind === 'formula' &&
        !/^[+-]?\s*(?:\d+d\d+|\d+)(?:\s*[+-]\s*(?:\d+d\d+|\d+))*$/i.test(value)
      ) {
        input.setCustomValidity('Use apenas números, dados, + e - (ex.: 2d6 + 3).');
      } else if (value && validation?.kind === 'decimal') {
        const normalized = value.replace(',', '.');
        const parsed = Number(normalized);
        if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) {
          input.setCustomValidity('Informe um número válido.');
        } else if (validation.min !== undefined && parsed < validation.min) {
          input.setCustomValidity(`O valor mínimo é ${validation.min}.`);
        } else if (validation.max !== undefined && parsed > validation.max) {
          input.setCustomValidity(`O valor máximo é ${validation.max}.`);
        }
      }
      if (!input.checkValidity()) {
        if (sheetEditorStatus) sheetEditorStatus.textContent = input.validationMessage;
        return;
      }
    }
    if (/^Item \d+$/.test(field.group ?? '')) recalculateSheetLoad();
    markSheetEditorDirty();
  };

  const createFieldInput = (field: CharacterSheetEditorField) => {
    let input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (field.name === 'Ofício 1' || field.name === 'Ofício_2') {
      const select = document.createElement('select');
      const options: string[] = ['', ...officeOptions];
      if (field.value && !options.includes(field.value)) options.push(field.value);
      for (const optionValue of options) {
        const option = document.createElement('option');
        option.value = optionValue;
        option.textContent = optionValue || 'Escolher Ofício';
        option.selected = optionValue === field.value;
        select.append(option);
      }
      input = select;
    } else if (field.kind === 'choice') {
      const select = document.createElement('select');
      for (const optionValue of field.options ?? []) {
        const option = document.createElement('option');
        option.value = optionValue;
        option.textContent = optionValue || '—';
        option.selected = optionValue === field.value;
        select.append(option);
      }
      input = select;
    } else {
      const isLongText = [
        'Proficiências',
        'Descrição',
        'HabRaçasOrigem',
        'HabClassePoderes',
      ].includes(field.name);
      if (isLongText) {
        const textArea = document.createElement('textarea');
        textArea.rows = 3;
        textArea.value = field.value;
        input = textArea;
      } else {
        const fieldInput = document.createElement('input');
        fieldInput.type = field.kind === 'checkbox' ? 'checkbox' : 'text';
        if (field.kind === 'checkbox') fieldInput.checked = field.value === 'Yes';
        else fieldInput.value = field.value;
        input = fieldInput;
      }
    }
    if (
      (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) &&
      field.validation?.maxLength !== undefined
    ) {
      input.maxLength = field.validation.maxLength;
    }
    if (input instanceof HTMLInputElement && field.validation?.kind === 'integer') {
      input.inputMode = 'numeric';
      if (field.validation.min !== undefined && field.validation.min < 0) {
        input.maxLength = Math.max(
          String(Math.abs(field.validation.min)).length + 1,
          String(Math.abs(field.validation.max ?? 0)).length,
        );
      } else if (field.validation.max !== undefined) {
        input.maxLength = String(Math.abs(field.validation.max)).length;
      }
    }
    if (input instanceof HTMLInputElement && field.validation?.kind === 'decimal') {
      input.inputMode = 'decimal';
    }
    if (input instanceof HTMLInputElement && field.name === 'CargaTotal') {
      input.readOnly = true;
      input.setAttribute('aria-readonly', 'true');
    }
    input.addEventListener('input', () => scheduleFieldSave(field, input));
    return input;
  };

  const appendField = (container: HTMLElement, field: CharacterSheetEditorField) => {
    const label = document.createElement('label');
    label.dataset.fieldName = field.name;
    const name = document.createElement('span');
    name.textContent = field.label;
    const input = createFieldInput(field);
    label.append(name, input);
    container.append(label);
  };

  for (const [sectionName, fields] of sections) {
    const section = document.createElement('section');
    section.className = 'web-player-sheet-editor-section';
    const sectionClass = new Map([
      ['Identidade', 'is-identity'],
      ['Atributos e modificadores', 'is-attributes'],
      ['Perícias', 'is-skills'],
      ['Defesa', 'is-defense'],
      ['Armadura e escudo', 'is-equipment'],
      ['Itens', 'is-items'],
    ]).get(sectionName);
    if (sectionClass) section.classList.add(sectionClass);
    const heading = document.createElement('h2');
    heading.textContent = sectionName;
    if (['Magias', 'Itens', 'Armadura e escudo'].includes(sectionName)) {
      const headingRow = document.createElement('div');
      headingRow.className = 'web-player-sheet-editor-section-heading';
      const controls = document.createElement('div');
      controls.className = 'web-player-sheet-editor-section-actions';
      if (sectionName === 'Magias') {
        const addSpell = document.createElement('button');
        addSpell.type = 'button';
        addSpell.textContent = '+ Adicionar magia';
        addSpell.addEventListener('click', addSpellEditorRow);
        controls.append(addSpell);
      } else if (sectionName === 'Itens') {
        const addItem = document.createElement('button');
        addItem.type = 'button';
        addItem.textContent = '+ Adicionar item';
        addItem.addEventListener('click', addItemEditorRow);
        controls.append(addItem);
      } else {
        for (const kind of ['Armadura', 'Escudo'] as const) {
          const addEquipment = document.createElement('button');
          addEquipment.type = 'button';
          addEquipment.textContent = `+ ${kind}`;
          addEquipment.addEventListener('click', () => addEquipmentEditorRow(kind));
          controls.append(addEquipment);
        }
      }
      headingRow.append(heading, controls);
      section.append(headingRow);
    } else {
      section.append(heading);
    }

    const body = document.createElement('div');
    body.className = 'web-player-sheet-editor-section-body';
    const groups = new Map<string, CharacterSheetEditorField[]>();
    for (const field of fields) {
      const groupName = field.group ?? '';
      const groupFields = groups.get(groupName) ?? [];
      groupFields.push(field);
      groups.set(groupName, groupFields);
    }
    for (const [groupName, groupFields] of groups) {
      if (!groupName) {
        groupFields.forEach((field) => appendField(body, field));
        continue;
      }
      const group = document.createElement('article');
      group.className = 'web-player-sheet-editor-group';
      if (sectionName === 'Magias' && /^Magia \d+$/.test(groupName)) {
        group.classList.add('is-spell-row');
      }
      if (/^Item \d+$/.test(groupName)) group.classList.add('is-item-row');
      if (/^Armadura \d+$/.test(groupName)) group.classList.add('is-armor-row');
      if (/^Escudo \d+$/.test(groupName)) group.classList.add('is-shield-row');
      if (groupName === 'Carga') group.classList.add('is-load-row');
      const groupHeader = document.createElement('header');
      groupHeader.className = 'web-player-sheet-editor-group-heading';
      const groupHeading = document.createElement('h3');
      groupHeading.textContent = groupName;
      groupHeader.append(groupHeading);
      const groupIndex = Number(/(\d+)$/.exec(groupName)?.[1] ?? 0);
      if (
        groupIndex > 0 &&
        (group.classList.contains('is-armor-row') || group.classList.contains('is-shield-row'))
      ) {
        group.style.gridRow = String(groupIndex);
      }
      const removable = group.classList.contains('is-spell-row') ||
        (group.classList.contains('is-item-row') && groupIndex > 3) ||
        ((group.classList.contains('is-armor-row') || group.classList.contains('is-shield-row')) && groupIndex > 1);
      if (removable) {
        const removeRow = document.createElement('button');
        removeRow.className = 'web-player-sheet-editor-remove-spell';
        removeRow.type = 'button';
        removeRow.setAttribute('aria-label', `Remover ${groupName}`);
        removeRow.textContent = '×';
        removeRow.addEventListener('click', () => {
          sheetEditorRemovedFields.push(...groupFields.map((field) => ({
            ...field,
            value: '',
          })));
          sheetEditorDocument = sheetEditorDocument.filter(
            (field) => field.group !== groupName || field.section !== sectionName,
          );
          renderSheetEditorFields();
          markSheetEditorDirty();
        });
        groupHeader.append(removeRow);
      }
      const trainedField = sectionName === 'Perícias'
        ? groupFields.find(({ kind }) => kind === 'checkbox')
        : undefined;
      const officeField = sectionName === 'Perícias'
        ? groupFields.find(({ name }) => name === 'Ofício 1' || name === 'Ofício_2')
        : undefined;
      const groupHeaderControls = document.createElement('div');
      groupHeaderControls.className = 'web-player-sheet-editor-group-controls';
      if (officeField) {
        const officeLabel = document.createElement('label');
        officeLabel.className = 'web-player-sheet-editor-office';
        officeLabel.dataset.fieldName = officeField.name;
        officeLabel.append(createFieldInput(officeField));
        groupHeaderControls.append(officeLabel);
      }
      if (trainedField) {
        const trainedLabel = document.createElement('label');
        trainedLabel.className = 'web-player-sheet-editor-trained';
        trainedLabel.dataset.fieldName = trainedField.name;
        const trainedInput = createFieldInput(trainedField);
        const trainedText = document.createElement('span');
        trainedText.textContent = 'Treinada';
        trainedLabel.append(trainedInput, trainedText);
        groupHeaderControls.append(trainedLabel);
      }
      if (groupHeaderControls.childElementCount > 0) groupHeader.append(groupHeaderControls);
      const groupFieldsContainer = document.createElement('div');
      groupFieldsContainer.className = 'web-player-sheet-editor-group-fields';
      groupFields
        .filter((field) => field !== trainedField && field !== officeField)
        .forEach((field) => appendField(groupFieldsContainer, field));
      group.append(groupHeader, groupFieldsContainer);
      body.append(group);
    }
    section.append(body);
    sheetEditorFields.append(section);
  }
  recalculateSheetLoad();
};

sheetEditorSearch?.addEventListener('input', renderSheetEditorFields);
const closeSheetEditor = async () => {
  if (sheetEditorClosing) return;
  const invalidInput = sheetEditorFields?.querySelector<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >(':invalid');
  if (invalidInput) {
    invalidInput.reportValidity();
    invalidInput.focus();
    if (sheetEditorStatus) sheetEditorStatus.textContent = invalidInput.validationMessage;
    return;
  }
  sheetEditorClosing = true;
  sheetEditorClose?.setAttribute('disabled', '');
  if (sheetEditorStatus) {
    sheetEditorStatus.textContent = sheetEditorDirty
      ? 'Enviando uma única solicitação ao mestre…'
      : 'Fechando ficha…';
  }
  try {
    if (sheetEditorDirty) {
      const result = await saveCharacterSheetEditor([
        ...sheetEditorDocument,
        ...sheetEditorRemovedFields,
      ]);
      if (!result.ok) {
        throw new Error(result.error ?? 'Não foi possível enviar as alterações da ficha.');
      }
      if (result.document) {
        sheetEditorFileName = result.document.fileName;
        sheetEditorBaseDocument = cloneSheetEditorFields(result.document.fields);
        sheetEditorDocument = cloneSheetEditorFields(result.document.fields);
      }
    } else {
      const result = await setCharacterSheetEditorOpen(false);
      if (!result.ok) {
        throw new Error(result.error ?? 'Não foi possível fechar a edição da ficha.');
      }
    }
    sheetEditorRemovedFields = [];
    sheetEditorDirty = false;
    clearSheetEditorDraft();
    sheetEditorDialog?.setAttribute('hidden', '');
  } catch (error) {
    if (sheetEditorStatus) {
      sheetEditorStatus.textContent = error instanceof Error
        ? error.message
        : 'Não foi possível concluir a edição da ficha.';
    }
  } finally {
    sheetEditorClosing = false;
    sheetEditorClose?.removeAttribute('disabled');
  }
};
sheetEditorClose?.addEventListener('click', () => void closeSheetEditor());

sheetOpenButton?.addEventListener('click', () => {
  if (sheetOpenButton.hasAttribute('disabled')) return;
  sheetOpenButton.setAttribute('disabled', '');
  if (sheetStatusElement) sheetStatusElement.textContent = 'Abrindo editor da ficha…';
  void getCharacterSheetEditor().then(async (result) => {
    if (!result.ok || !result.document) {
      throw new Error(result.error ?? 'Não foi possível abrir o editor da ficha.');
    }
    if (result.document.pendingApproval) {
      throw new Error('Aguarde o mestre avaliar as alterações já enviadas.');
    }
    const editorLock = await setCharacterSheetEditorOpen(true);
    if (!editorLock.ok) {
      throw new Error(editorLock.error ?? 'Não foi possível bloquear a ficha para edição.');
    }
    sheetEditorUsername = getPlayerToolsState().username ?? '';
    sheetEditorFileName = result.document.fileName;
    sheetEditorBaseDocument = cloneSheetEditorFields(result.document.fields);
    const draftKey = activeSheetEditorDraftKey();
    let recoveredDraft = null;
    if (draftKey) {
      try {
        const serialized = window.localStorage.getItem(draftKey);
        recoveredDraft = recoverCharacterSheetDraft({
          serialized,
          fileName: sheetEditorFileName,
          baseFields: sheetEditorBaseDocument,
        });
        if (serialized && !recoveredDraft) window.localStorage.removeItem(draftKey);
      } catch {
        recoveredDraft = null;
      }
    }
    sheetEditorRemovedFields = recoveredDraft
      ? cloneSheetEditorFields(recoveredDraft.removedFields)
      : [];
    sheetEditorDocument = recoveredDraft
      ? cloneSheetEditorFields(recoveredDraft.fields)
      : cloneSheetEditorFields(result.document.fields);
    sheetEditorDirty = Boolean(recoveredDraft);
    if (sheetEditorSearch instanceof HTMLInputElement) sheetEditorSearch.value = '';
    sheetEditorDialog?.removeAttribute('hidden');
    syncPermanentEncounterValuesIntoSheetEditor();
    renderSheetEditorFields();
    if (sheetEditorStatus) {
      sheetEditorStatus.textContent = recoveredDraft
        ? `Rascunho local recuperado de ${new Date(recoveredDraft.savedAt).toLocaleString('pt-BR')}.`
        : 'Edite livremente. Uma única solicitação será enviada ao fechar a ficha.';
    }
    sheetDialog?.setAttribute('hidden', '');
  }).catch((error: unknown) => {
    if (sheetStatusElement) {
      sheetStatusElement.textContent = error instanceof Error
        ? error.message
        : 'Não foi possível abrir o editor da ficha.';
    }
  }).finally(() => renderCharacterSheet(getPlayerToolsState().sheet));
});

sheetRemoveButton?.addEventListener('click', () => {
  sheetRemoveDialog?.removeAttribute('hidden');
  sheetRemoveCancelButton?.focus();
});
sheetRemoveCancelButton?.addEventListener('click', () => {
  sheetRemoveDialog?.setAttribute('hidden', '');
});
sheetRemoveCloseButton?.addEventListener('click', () => sheetRemoveCancelButton?.click());
sheetRemoveConfirmButton?.addEventListener('click', () => {
  sheetRemoveConfirmButton.setAttribute('disabled', '');
  void removeCharacterSheet().then((result) => {
    if (!result.ok) {
      if (sheetStatusElement) {
        sheetStatusElement.textContent = result.error ?? 'Não foi possível remover a ficha.';
      }
      return;
    }
    renderCharacterSheet(result.sheet ?? null);
    clearSheetEditorDraft();
    sheetRemoveDialog?.setAttribute('hidden', '');
    if (sheetStatusElement) sheetStatusElement.textContent = 'Ficha removida deste usuário.';
  }).finally(() => sheetRemoveConfirmButton.removeAttribute('disabled'));
});

characterExpandButton?.addEventListener('click', () => {
  const expanded = characterExpandButton.getAttribute('aria-expanded') !== 'true';
  characterExpandButton.setAttribute('aria-expanded', String(expanded));
  characterExpandButton.setAttribute('aria-label', expanded
    ? 'Ocultar detalhes da ficha'
    : 'Mostrar detalhes da ficha');
  characterDetails?.toggleAttribute('hidden', !expanded);
});

characterPrivateInput?.addEventListener('change', () => {
  if (!(characterPrivateInput instanceof HTMLInputElement)) return;
  const desired = characterPrivateInput.checked;
  characterPrivateInput.disabled = true;
  void setCharacterPrivate(desired).then((result) => {
    if (!result.ok) {
      characterPrivateInput.checked = !desired;
      showConnectionState({
        state: 'error',
        message: result.error ?? 'Não foi possível alterar a privacidade da ficha.',
      });
    }
  }).finally(() => {
    characterPrivateInput.disabled = false;
  });
});

for (const button of characterActionButtons) {
  button.addEventListener('click', () => {
    const action = button.dataset.playerAction as PlayerActionKind;
    button.disabled = true;
    void usePlayerAction(action).then((result) => {
      if (!result.ok) {
        button.disabled = false;
        showConnectionState({
          state: 'error',
          message: result.error ?? 'Não foi possível usar esta ação.',
        });
      }
    });
  });
}

statusElement?.addEventListener('click', () => {
  if (statusElement.dataset.visible !== 'true' || statusElement.dataset.state !== 'error') return;
  if (hideStatusTimer) clearTimeout(hideStatusTimer);
  hideStatusTimer = null;
  statusElement.dataset.visible = 'false';
});

characterHud?.addEventListener('mouseover', (event) => {
  const target = calculationTargetFromEvent(event);
  if (target) showCalculationTooltip(target);
});
characterHud?.addEventListener('mouseout', (event) => {
  const target = calculationTargetFromEvent(event);
  const related = event.relatedTarget;
  if (
    target &&
    related instanceof Node &&
    target.contains(related)
  ) return;
  hideCalculationTooltip();
});
characterHud?.addEventListener('focusin', (event) => {
  const target = calculationTargetFromEvent(event);
  if (target) showCalculationTooltip(target);
});
characterHud?.addEventListener('focusout', hideCalculationTooltip);
characterDetails?.addEventListener('scroll', hideCalculationTooltip, { passive: true });
window.addEventListener('resize', hideCalculationTooltip);

sheetFixButton?.addEventListener('click', () => {
  sheetFixButton.setAttribute('disabled', '');
  void automaticallyFixCharacterSheet().then((result) => {
    renderCharacterSheet(result.sheet ?? null);
    if (sheetStatusElement) {
      sheetStatusElement.textContent = result.ok
        ? 'Os campos objetivamente corrigíveis foram atualizados.'
        : result.error ?? 'Não foi possível corrigir a ficha.';
    }
  }).finally(() => sheetFixButton.removeAttribute('disabled'));
});

notesButton?.addEventListener('click', () => {
  notesDocument = parsePlayerNotesDocument(getPlayerToolsState().notes);
  renderNotesEditor();
  notesDialog?.removeAttribute('hidden');
  requestAnimationFrame(() => keepNotesCardInsideViewport());
  notesEditor?.focus();
});
notesCloseButton?.addEventListener('click', () => notesDialog?.setAttribute('hidden', ''));

type NotesDragState = {
  pointerId: number;
  offsetX: number;
  offsetY: number;
};

type NotesResizeDirection = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
type NotesResizeState = {
  pointerId: number;
  direction: NotesResizeDirection;
  startX: number;
  startY: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

let notesDragState: NotesDragState | null = null;
let notesResizeState: NotesResizeState | null = null;

function keepNotesCardInsideViewport() {
  if (!notesCard || notesDialog?.hasAttribute('hidden')) return;
  const bounds = notesCard.getBoundingClientRect();
  const gap = 8;
  notesCard.style.width = `${Math.min(bounds.width, window.innerWidth - gap * 2)}px`;
  notesCard.style.height = `${Math.min(bounds.height, window.innerHeight - gap * 2)}px`;
  notesCard.style.transform = 'none';
  notesCard.style.left = `${Math.min(
    Math.max(gap, bounds.left),
    Math.max(gap, window.innerWidth - Math.min(bounds.width, window.innerWidth - gap * 2) - gap),
  )}px`;
  notesCard.style.top = `${Math.min(
    Math.max(gap, bounds.top),
    Math.max(gap, window.innerHeight - Math.min(bounds.height, window.innerHeight - gap * 2) - gap),
  )}px`;
}

notesDragHandle?.addEventListener('pointerdown', (event) => {
  if (!notesCard || event.button !== 0) return;
  const bounds = notesCard.getBoundingClientRect();
  notesCard.style.width = `${bounds.width}px`;
  notesCard.style.height = `${bounds.height}px`;
  notesCard.style.transform = 'none';
  notesCard.style.left = `${bounds.left}px`;
  notesCard.style.top = `${bounds.top}px`;
  notesDragState = {
    pointerId: event.pointerId,
    offsetX: event.clientX - bounds.left,
    offsetY: event.clientY - bounds.top,
  };
  notesDragHandle.setPointerCapture(event.pointerId);
  event.preventDefault();
});

notesDragHandle?.addEventListener('pointermove', (event) => {
  if (!notesCard || notesDragState?.pointerId !== event.pointerId) return;
  const gap = 8;
  const bounds = notesCard.getBoundingClientRect();
  notesCard.style.left = `${Math.min(
    Math.max(gap, event.clientX - notesDragState.offsetX),
    Math.max(gap, window.innerWidth - bounds.width - gap),
  )}px`;
  notesCard.style.top = `${Math.min(
    Math.max(gap, event.clientY - notesDragState.offsetY),
    Math.max(gap, window.innerHeight - bounds.height - gap),
  )}px`;
});

const finishNotesDrag = (event: PointerEvent) => {
  if (notesDragState?.pointerId !== event.pointerId) return;
  notesDragState = null;
  if (notesDragHandle?.hasPointerCapture(event.pointerId)) {
    notesDragHandle.releasePointerCapture(event.pointerId);
  }
};

notesDragHandle?.addEventListener('pointerup', finishNotesDrag);
notesDragHandle?.addEventListener('pointercancel', finishNotesDrag);

for (const handle of document.querySelectorAll<HTMLElement>('[data-notes-resize]')) {
  handle.addEventListener('pointerdown', (event) => {
    if (!notesCard || event.button !== 0) return;
    const direction = handle.dataset.notesResize as NotesResizeDirection | undefined;
    if (!direction) return;
    const bounds = notesCard.getBoundingClientRect();
    notesCard.style.width = `${bounds.width}px`;
    notesCard.style.height = `${bounds.height}px`;
    notesCard.style.transform = 'none';
    notesCard.style.left = `${bounds.left}px`;
    notesCard.style.top = `${bounds.top}px`;
    notesResizeState = {
      pointerId: event.pointerId,
      direction,
      startX: event.clientX,
      startY: event.clientY,
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
    };
    handle.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  });
  handle.addEventListener('pointermove', (event) => {
    if (!notesCard || notesResizeState?.pointerId !== event.pointerId) return;
    const state = notesResizeState;
    const gap = 8;
    const minWidth = Math.min(440, window.innerWidth - gap * 2);
    const minHeight = Math.min(380, window.innerHeight - gap * 2);
    const deltaX = event.clientX - state.startX;
    const deltaY = event.clientY - state.startY;
    const west = state.direction.includes('w');
    const east = state.direction.includes('e');
    const north = state.direction.includes('n');
    const south = state.direction.includes('s');
    const widthLimit = west
      ? state.left + state.width - gap
      : window.innerWidth - state.left - gap;
    const heightLimit = north
      ? state.top + state.height - gap
      : window.innerHeight - state.top - gap;
    const requestedWidth = west
      ? state.width - deltaX
      : east ? state.width + deltaX : state.width;
    const requestedHeight = north
      ? state.height - deltaY
      : south ? state.height + deltaY : state.height;
    const width = Math.max(minWidth, Math.min(widthLimit, requestedWidth));
    const height = Math.max(minHeight, Math.min(heightLimit, requestedHeight));
    notesCard.style.width = `${width}px`;
    notesCard.style.height = `${height}px`;
    notesCard.style.left = `${west ? state.left + state.width - width : state.left}px`;
    notesCard.style.top = `${north ? state.top + state.height - height : state.top}px`;
  });
  const finishResize = (event: PointerEvent) => {
    if (notesResizeState?.pointerId !== event.pointerId) return;
    notesResizeState = null;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  };
  handle.addEventListener('pointerup', finishResize);
  handle.addEventListener('pointercancel', finishResize);
}

window.addEventListener('resize', keepNotesCardInsideViewport);

notesEditor?.addEventListener('input', flushActiveNote);
notesTitleInput?.addEventListener('input', () => {
  if (!(notesTitleInput instanceof HTMLInputElement)) return;
  const tab = activeNoteTab();
  if (!tab) return;
  tab.title = notesTitleInput.value.slice(0, 40);
  renderNotesTabs();
});
notesEditor?.addEventListener('paste', (event) => {
  event.preventDefault();
  document.execCommand('insertText', false, event.clipboardData?.getData('text/plain') ?? '');
});
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-notes-command]')) {
  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('click', () => {
    notesEditor?.focus();
    document.execCommand(button.dataset.notesCommand ?? '', false);
    flushActiveNote();
  });
}
notesFontSize?.addEventListener('change', () => {
  if (!(notesFontSize instanceof HTMLSelectElement)) return;
  notesEditor?.focus();
  document.execCommand('fontSize', false, notesFontSize.value);
  flushActiveNote();
});
notesSaveButton?.addEventListener('click', () => {
  flushActiveNote();
  notesSaveButton.setAttribute('disabled', '');
  if (notesStatusElement) notesStatusElement.textContent = 'Salvando…';
  void saveNotes(serializePlayerNotesDocument(notesDocument)).then((result) => {
    if (notesStatusElement) {
      notesStatusElement.textContent = result.ok
        ? 'Notas salvas'
        : result.error ?? 'Não foi possível salvar.';
    }
  }).finally(() => notesSaveButton.removeAttribute('disabled'));
});
notesClearButton?.addEventListener('click', () => {
  notesClearDialog?.removeAttribute('hidden');
  notesClearCancelButton?.focus();
});
notesClearCancelButton?.addEventListener('click', () => notesClearDialog?.setAttribute('hidden', ''));
notesClearCloseButton?.addEventListener('click', () => notesClearCancelButton?.click());
notesClearConfirmButton?.addEventListener('click', () => {
  const tab = activeNoteTab();
  if (!tab) return;
  tab.html = '';
  renderNotesEditor();
  notesClearConfirmButton.setAttribute('disabled', '');
  void saveNotes(serializePlayerNotesDocument(notesDocument)).then((result) => {
    if (result.ok) {
      notesClearDialog?.setAttribute('hidden', '');
      if (notesStatusElement) notesStatusElement.textContent = 'Nota limpa.';
    } else if (notesStatusElement) {
      notesStatusElement.textContent = result.error ?? 'Não foi possível limpar a nota.';
    }
  }).finally(() => notesClearConfirmButton.removeAttribute('disabled'));
});

if (nameInput instanceof HTMLInputElement) {
  nameInput.value = window.localStorage.getItem('bossbar.multiplayer.player-name') ?? '';
  nameInput.addEventListener('blur', () => {
    const username = nameInput.value.trim().slice(0, 40);
    if (username) void getAccountStatus(username).catch(() => undefined);
  });
  nameInput.focus();
}

if (!canConnect && joinForm instanceof HTMLFormElement) {
  const submit = joinForm?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submit) submit.disabled = true;
  createAccessButton?.setAttribute('disabled', '');
}

const prepareAuthentication = () => {
  if (
    !(nameInput instanceof HTMLInputElement) ||
    !(passwordInput instanceof HTMLInputElement) ||
    authenticating
  ) return;
  const requestedName = nameInput.value.trim().slice(0, 40);
  if (!requestedName || passwordInput.value.length < 3) return;
  authenticating = true;
  const submit = joinForm?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submit) submit.disabled = true;
  createAccessButton?.setAttribute('disabled', '');
  void getAccountStatus(requestedName).then((status) => {
    if (!status.exists) {
      showConnectionState({
        state: 'error',
        message: 'Usuário ainda não cadastrado. Use Criar acesso.',
      });
      return;
    }
    if (confirmedNameElement) confirmedNameElement.textContent = status.username;
    if (confirmMessageElement) {
      confirmMessageElement.textContent = 'Você entrará no encontro como';
    }
    authErrorElement?.setAttribute('hidden', '');
    joinElement?.setAttribute('hidden', '');
    nameConfirmElement?.removeAttribute('hidden');
    nameSubmitButton?.focus();
  }).catch((error: unknown) => {
    showConnectionState({
      state: 'error',
      message: error instanceof Error ? error.message : 'Não foi possível verificar o usuário.',
    });
  }).finally(() => {
    authenticating = false;
    if (submit) submit.disabled = false;
    createAccessButton?.removeAttribute('disabled');
  });
};

joinForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  prepareAuthentication();
});

createAccessButton?.addEventListener('click', () => {
  createAccountError?.setAttribute('hidden', '');
  if (createAccountName instanceof HTMLInputElement && nameInput instanceof HTMLInputElement) {
    createAccountName.value = nameInput.value.trim().slice(0, 40);
  }
  if (createAccountPassword instanceof HTMLInputElement) createAccountPassword.value = '';
  if (createAccountPasswordConfirm instanceof HTMLInputElement) createAccountPasswordConfirm.value = '';
  joinElement?.setAttribute('hidden', '');
  createAccountDialog?.removeAttribute('hidden');
  createAccountName?.focus();
});

createAccountBack?.addEventListener('click', () => {
  createAccountDialog?.setAttribute('hidden', '');
  joinElement?.removeAttribute('hidden');
  nameInput?.focus();
});
createAccountClose?.addEventListener('click', () => createAccountBack?.click());

createAccountForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (
    authenticating ||
    !(createAccountName instanceof HTMLInputElement) ||
    !(createAccountPassword instanceof HTMLInputElement) ||
    !(createAccountPasswordConfirm instanceof HTMLInputElement)
  ) return;
  const username = createAccountName.value.trim().slice(0, 40);
  const password = createAccountPassword.value;
  if (!username || password.length < 3) return;
  if (password !== createAccountPasswordConfirm.value) {
    if (createAccountError) {
      createAccountError.textContent = 'As senhas não coincidem.';
      createAccountError.removeAttribute('hidden');
    }
    createAccountPasswordConfirm.focus();
    return;
  }
  authenticating = true;
  const submit = createAccountForm.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submit) submit.disabled = true;
  createAccountError?.setAttribute('hidden', '');
  void getAccountStatus(username).then(async (status) => {
    if (status.exists) throw new Error('Este usuário já existe. Use Entrar.');
    return connect(username, password, true);
  }).then((result) => {
    if (!result.ok) throw new Error(result.error ?? 'Não foi possível criar o acesso.');
    if (nameInput instanceof HTMLInputElement) {
      nameInput.value = username;
      nameInput.readOnly = true;
    }
    createAccountDialog?.setAttribute('hidden', '');
  }).catch((error: unknown) => {
    if (createAccountError) {
      createAccountError.textContent = error instanceof Error
        ? error.message
        : 'Não foi possível criar o acesso.';
      createAccountError.removeAttribute('hidden');
    }
  }).finally(() => {
    authenticating = false;
    if (submit) submit.disabled = false;
  });
});

nameBackButton?.addEventListener('click', () => {
  nameConfirmElement?.setAttribute('hidden', '');
  joinElement?.removeAttribute('hidden');
  nameInput?.focus();
  authErrorElement?.setAttribute('hidden', '');
});
nameConfirmCloseButton?.addEventListener('click', () => nameBackButton?.click());

nameSubmitButton?.addEventListener('click', () => {
  if (
    !(nameInput instanceof HTMLInputElement) ||
    !(passwordInput instanceof HTMLInputElement) ||
    authenticating
  ) return;
  authenticating = true;
  nameSubmitButton.setAttribute('disabled', '');
  const submit = joinForm?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submit) submit.disabled = true;
  createAccessButton?.setAttribute('disabled', '');
  authErrorElement?.setAttribute('hidden', '');
  void connect(nameInput.value, passwordInput.value, false).then((result) => {
    if (!result.ok) {
      if (authErrorElement) {
        authErrorElement.textContent = result.error ?? 'Não foi possível entrar.';
        authErrorElement.removeAttribute('hidden');
      }
      return;
    }
    nameInput.readOnly = true;
    passwordInput.value = '';
    nameConfirmElement?.setAttribute('hidden', '');
  }).finally(() => {
    authenticating = false;
    nameSubmitButton.removeAttribute('disabled');
    if (submit) submit.disabled = false;
    createAccessButton?.removeAttribute('disabled');
  });
});

api.subscribe((state) => {
  if (!changeNameButton) return;
  const canChangeName = sessionReady && !state.battleStarted;
  changeNameButton.toggleAttribute('hidden', !canChangeName);
});

settingsButton?.addEventListener('click', () => {
  document.dispatchEvent(new Event('bossbar:open-player-settings'));
});

changeNameButton?.addEventListener('click', () => {
  toolsElement?.setAttribute('hidden', '');
  changeNameButton.setAttribute('hidden', '');
  pendingElement?.setAttribute('hidden', '');
  nameConfirmElement?.setAttribute('hidden', '');
  joinElement?.removeAttribute('hidden');
  changeNameCloseButton?.removeAttribute('hidden');
  if (nameInput instanceof HTMLInputElement) {
    nameInput.readOnly = false;
    nameInput.select();
  }
  if (passwordInput instanceof HTMLInputElement) {
    passwordInput.value = '';
    passwordInput.focus();
  }
  const submit = joinForm?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submit) submit.disabled = false;
  createAccessButton?.removeAttribute('disabled');
  nameSubmitButton?.removeAttribute('disabled');
  if (statusElement) statusElement.dataset.visible = 'false';
});

changeNameCloseButton?.addEventListener('click', () => {
  joinElement?.setAttribute('hidden', '');
  nameConfirmElement?.setAttribute('hidden', '');
  changeNameCloseButton.setAttribute('hidden', '');
  toolsElement?.removeAttribute('hidden');
  changeNameButton?.removeAttribute('hidden');
  if (nameInput instanceof HTMLInputElement) {
    nameInput.value = getPlayerToolsState().username ?? '';
    nameInput.readOnly = true;
  }
  if (passwordInput instanceof HTMLInputElement) passwordInput.value = '';
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!notesClearDialog?.hasAttribute('hidden')) notesClearCancelButton?.click();
  else if (!sheetRemoveDialog?.hasAttribute('hidden')) sheetRemoveCancelButton?.click();
  else if (!sheetEditorDialog?.hasAttribute('hidden')) sheetEditorClose?.click();
  else if (!sheetDialog?.hasAttribute('hidden')) sheetCloseButton?.click();
  else if (!createAccountDialog?.hasAttribute('hidden')) createAccountBack?.click();
  else if (!nameConfirmElement?.hasAttribute('hidden')) nameBackButton?.click();
});

window.addEventListener('beforeunload', () => {
  if (sheetEditorDirty) persistSheetEditorDraft();
  if (hideStatusTimer) clearTimeout(hideStatusTimer);
  unmountPlayer?.();
  dispose();
}, { once: true });
