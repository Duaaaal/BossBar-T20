import { SheetAutoValidation, sheetReadyForAutomaticValidation } from './shared/sheet-auto-validation';
import { SKILL_EFFECTS_FIELD, skillEffectIssues } from './shared/skill-mechanics';
import { characterSkillRules, craftEditorFields } from './shared/skill-definitions';
import { skillTraining, SKILL_TRAINING_FIELD } from './shared/skill-training';
import { openSkillTrainingEditor } from './skill-training-editor';
import { recalculateCharacterSkills, skillImportIssues } from './shared/character-skills';
import { RESOURCE_AUTO_FIELD, recalculateCharacterResources } from './shared/character-resources';
import { normalizeSheetNumber } from './shared/sheet-number';
import { appendRuleText, calculationTooltip as attachCalculationTooltip } from './rule-presentation';
import { sheetCalculationDescription, inventoryCalculationDescription } from './sheet-calculation-description';
import { sheetEditorPopup } from './sheet-editor-popup';
import { openMulticlassEditor } from './character-multiclass-editor';
import { parseCharacterClasses, formatCharacterClasses, abbreviateCharacterClasses } from './shared/character-classes';
import { ATTACK_RANGES, DAMAGE_TYPES, METRIC_RANGES, parseAttackRange } from './shared/attack-options';
import { armorPenaltyTotal, equipmentDefenseTotal, baseSpellManaCost, SHEET_COIN_FIELDS, sheetDefenseTotal } from './shared/character-sheet-calculations';
import { RD_FIELD, DAMAGE_ORIGINS, normalizeDamageReduction, damageReductionSummary } from './shared/damage-reduction';
import { openDamageReductionEditor } from './damage-reduction-editor';
import { openRulesCatalog } from './rules-catalog-dialog';
import { characterOptionsInput } from './character-options-input';
import { identityOptionKind } from './shared/character-options';
import { characterAttributesEditor } from './character-attributes-editor';
import { ATTRIBUTE_PLAN_FIELD } from './shared/character-attributes';
import { T20_CATALOG, findSpell, sourceCitation, spellFieldDefaults } from './shared/rules-catalog';
import { CHARACTER_SIZES, characterSize, synchronizeCharacterSize } from './shared/character-size';
import { affectsInventoryLoad, sheetInventoryLoad } from './shared/character-sheet-inventory';
import { attackSkillTotal, equipmentKeys, inferredArmorAttributeLimit, sheetAttackTestExpression } from './shared/character-sheet-loadout';
import {
  createWebPlayerApi,
  type WebPlayerConnectionState,
} from './web-player-api';
import {
  MAX_CHARACTER_SHEET_BYTES,
  MAX_CHARACTER_PORTRAIT_BYTES,
  type CharacterSheetEditorField,
  type CharacterSheetIssue,
  type PlayerCharacterSheetStatus,
  type CharacterSheetSummary,
} from './shared/character-sheet';
import {
  characterSheetDraftStorageKey,
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
  PlayerResourceNotice,
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
const sheetEditorFilters = document.getElementById('web-player-sheet-editor-filters');
const sheetEditorFields = document.getElementById('web-player-sheet-editor-fields');
// Kept as an optional hook for validation failures; the editor no longer renders
// a persistent draft/status bar.
const sheetEditorStatus = document.getElementById('web-player-sheet-editor-status');
const characterHud = document.getElementById('web-player-character-hud');
const characterPortraitButton = document.getElementById('web-player-character-portrait');
const characterPortraitImage = document.getElementById('web-player-character-portrait-image');
const characterPortraitPlaceholder = document.getElementById(
  'web-player-character-portrait-placeholder',
);
const portraitInput = document.getElementById('web-player-portrait-input');
const portraitRemoveButton = document.getElementById('web-player-portrait-remove');
const portraitEditorPreview = document.getElementById('web-player-portrait-editor-preview');
const portraitEditorPlaceholder = document.getElementById('web-player-portrait-editor-placeholder');
const portraitFileName = document.getElementById('web-player-portrait-file-name');
const portraitLightbox = document.getElementById('web-player-portrait-lightbox');
const portraitLightboxImage = document.getElementById('web-player-portrait-lightbox-image');
const portraitLightboxClose = document.getElementById('web-player-portrait-lightbox-close');
const portraitRemoveDialog = document.getElementById('web-player-portrait-remove-confirm');
const portraitRemoveClose = document.getElementById('web-player-portrait-remove-close');
const portraitRemoveCancel = document.getElementById('web-player-portrait-remove-cancel');
const portraitRemoveConfirm = document.getElementById('web-player-portrait-remove-confirm-button');
const characterStatuses = document.getElementById('web-player-character-statuses');
const characterName = document.getElementById('web-player-character-name');
const characterExpandButton = document.getElementById('web-player-character-expand');
const characterDetails = document.getElementById('web-player-character-details');
const characterClassLevel = document.getElementById('web-player-character-class-level');
const characterPrivateInput = document.getElementById('web-player-character-private');
const characterActionButtons = [
  ...document.querySelectorAll<HTMLButtonElement>('[data-player-action]'),
];
const characterActionPointSlots = [
  ...document.querySelectorAll<HTMLElement>('[data-action-point-slot]'),
];
const characterHeroPointSlots = [
  ...document.querySelectorAll<HTMLElement>('[data-hero-point-slot]'),
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
let encounterSheetSummary: CharacterSheetSummary | null = null;
let activeTurnParticipantId: string | null = null;
let currentPortraitUrl: string | null = null;
let pendingPortraitPreviewUrl: string | null = null;
let pendingPortraitFile: File | null | undefined;
let sheetEditorDocument: CharacterSheetEditorField[] = [];
let sheetEditorIssues: CharacterSheetIssue[] = [];
let sheetEditorCharacterId = '';
let sheetEditorImportPending = false;
let sheetEditorRemovedFields: CharacterSheetEditorField[] = [];
let sheetEditorBaseDocument: CharacterSheetEditorField[] = [];
let sheetEditorUsername = '';
let sheetEditorDirty = false;
let sheetEditorClosing = false;
let sheetEditorDraftTimer: ReturnType<typeof setTimeout> | null = null;
const activeSheetEditorCategories = new Set<string>();

const sheetEditorCategoryDefinitions = [
  {
    id: 'personagem',
    label: 'Personagem',
    sections: [
      'Identidade',
      'Atributos',
      'Características',
      'Descrição',
      'Habilidades',
    ],
  },
  {
    id: 'combate',
    label: 'Combate',
    sections: ['Pontos de vida e mana', 'Defesa', 'Ataques', 'Armadura e escudo', 'Proficiências'],
  },
  { id: 'pericias', label: 'Perícias', sections: ['Perícias'] },
  { id: 'magia', label: 'Magia', sections: ['Magias'] },
  { id: 'inventario', label: 'Inventário', sections: ['Itens'] },
] as const;

const sheetEditorCategoryForSection = (section: string) =>
  sheetEditorCategoryDefinitions.find(({ sections }) =>
    (sections as readonly string[]).includes(section))?.id ??
  'personagem';

const sheetEditorSectionOrder = new Map<string, number>(
  ['Identidade', 'Atributos', 'Pontos de vida e mana', 'Defesa', 'Armadura e escudo',
    'Proficiências', 'Ataques', 'Perícias', 'Características', 'Itens', 'Habilidades', 'Magias', 'Descrição']
    .map((section, index) => [section, index]),
);

const notifyPlayer = (
  message: string,
  tone: PlayerResourceNotice['tone'] = 'info',
  persistent = false,
) => document.dispatchEvent(new CustomEvent<PlayerResourceNotice>(
  'bossbar:player-notice',
  {
    detail: {
      id: `web:${crypto.randomUUID()}`,
      message,
      tone,
      persistent,
    },
  },
));

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
    ? `${characterSheetDraftStorageKey(roomCode, username)}:${sheetEditorCharacterId || 'legacy'}`
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

const syncPermanentEncounterValuesIntoSheetEditor = () => {
  if (sheetEditorImportPending) return;
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
  getCharacterSelection, selectCharacter, characterPortraitBlob, createCharacterSheet, rollCharacterAttribute, exportCharacterSheet, dismissSheetWarnings,
  uploadCharacterSheet,
  uploadCharacterPortrait,
  removeCharacterPortrait,
  removeCharacterSheet,
  discardCharacterSheetImport,
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
    void renderCharacterSlots();
    if (!sheetEditorDialog?.hasAttribute('hidden') && !sheetEditorDirty) {
      void getCharacterSheetEditor().then((result) => {
        if (!result.ok || !result.document) return;
        sheetEditorRemovedFields = [];
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
  encounterSheetSummary = self?.summary ?? null;
  // The subscription immediately emits its empty initial state while this
  // module is still initializing; render after all handlers exist.
  queueMicrotask(() => renderCharacterHud(getPlayerToolsState().sheet));
  currentPortraitUrl = self?.portraitUrl ?? null;
  if (currentPortraitUrl && pendingPortraitFile === undefined) releasePendingPortraitPreview();
  if (characterPortraitImage instanceof HTMLImageElement) {
    if (currentPortraitUrl) characterPortraitImage.src = currentPortraitUrl;
    else characterPortraitImage.removeAttribute('src');
    characterPortraitImage.toggleAttribute('hidden', !currentPortraitUrl);
  }
  characterPortraitPlaceholder?.toggleAttribute('hidden', Boolean(currentPortraitUrl));
  characterPortraitButton?.classList.toggle('has-image', Boolean(currentPortraitUrl));
  characterPortraitButton?.setAttribute(
    'aria-label',
    currentPortraitUrl ? 'Ampliar retrato do personagem' : 'Retrato não definido',
  );
  renderPortraitEditor();
  updateOwnTurnHighlight();
  if (characterPrivateInput instanceof HTMLInputElement && self) {
    characterPrivateInput.checked = self.privateMode;
  }
  if (self) {
    const actionPoints = Math.max(0, Math.min(5, Math.trunc(self.actionPoints ?? 0)));
    const heroPoints = Math.max(0, Math.min(1, Math.trunc(self.heroPoints ?? 0)));
    for (const [index, slot] of characterActionPointSlots.entries()) {
      slot.classList.toggle('is-active', index < actionPoints);
      slot.dataset.appTooltip = `Ponto de ação | ${actionPoints} de 5`;
      slot.setAttribute('aria-label', slot.dataset.appTooltip);
      slot.setAttribute('role', 'button');
      slot.setAttribute('aria-disabled', String(index >= actionPoints));
      slot.onclick = () => { if (index < actionPoints) window.dispatchEvent(new CustomEvent('bossbar:resource-action', { detail: 'action-point' })); };
      slot.onkeydown = (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); slot.click(); } };
    }
    for (const [index, slot] of characterHeroPointSlots.entries()) {
      slot.classList.toggle('is-active', index < heroPoints);
      slot.dataset.appTooltip = `Ponto heróico | ${heroPoints} de 1`;
      slot.setAttribute('aria-label', slot.dataset.appTooltip);
      slot.setAttribute('role', 'button');
      slot.setAttribute('aria-disabled', String(index >= heroPoints));
      slot.onclick = () => { if (index < heroPoints) window.dispatchEvent(new CustomEvent('bossbar:resource-action', { detail: 'hero-point' })); };
      slot.onkeydown = (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); slot.click(); } };
    }
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
    if (!sessionClosed) module.mountPlayer();
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
  calculationTooltip.replaceChildren(); appendRuleText(calculationTooltip, calculation);
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
  const summary = encounterSheetSummary ?? (sheet?.hasSheet ? sheet.validation?.summary : null);
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
      'Atributos',
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
    const baseLoad = Math.max(0, strength >= 0 ? 10 + 2 * strength : 10 + strength);
    const loadFormula = strength >= 0
      ? `10 + 2 × FOR ${strength} = ${baseLoad}`
      : `10 + FOR ${strength} = ${baseLoad}`;
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
        calculation: `Carga atual da ficha: ${summary.currentLoad ?? '—'} espaços. Limite básico: ${loadFormula} espaços.${summary.maxLoad !== null && summary.maxLoad !== baseLoad ? ` Limite informado na ficha: ${summary.maxLoad} espaços; confira a regra que justifica a diferença.` : ''}`,
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
        label: `${attack.name || 'Ataque'}${attack.primary ? ' (principal)' : ''}`,
        value: [summary ? sheetAttackTestExpression(attack, summary) : attack.attackBonus, attack.damage, attack.critical, attack.damageType, attack.range, attack.secondaryWeapon ? `Segunda arma: ${attack.secondaryWeapon.name} · ${attack.secondaryWeapon.damage}` : '']
          .filter(Boolean).join(' • ') || '—',
        calculation: `Teste ${summary ? sheetAttackTestExpression(attack, summary) : attack.attackBonus || '—'}; dano ${attack.damage || '—'}; crítico ${attack.critical || '20/x2'}; tipo ${attack.damageType || '—'}; alcance ${attack.range || '—'}.${attack.secondaryWeapon && summary ? ` Segunda arma: ${attack.secondaryWeapon.name}; teste ${sheetAttackTestExpression(attack.secondaryWeapon, summary)}; dano ${attack.secondaryWeapon.damage}.` : ''}`,
      }))
      : [{ label: 'Nenhum ataque informado', value: '—' }]));
  }
};

let characterSlotsRevision = 0;
let characterSelectionBusy = false;
const slotPortraitUrls = new Map<string, { revision: number | null; url: string }>();
let requestedCharacterId: string | null = null;
const renderCharacterSlots = async () => {
  const container = document.getElementById('web-player-character-slots');
  if (!container || sheetDialog?.hasAttribute('hidden')) return;
  const revision = ++characterSlotsRevision;
  try {
    const selection = await getCharacterSelection();
    if (revision !== characterSlotsRevision) return;

    container.replaceChildren();
    for (const [index, slot] of selection.characters.entries()) {
      const tab = document.createElement('div'); tab.className = 'sheet-slot'; tab.setAttribute('role', 'presentation');
      const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(slot.id === selection.activeCharacterId));
      button.dataset.characterId = slot.id;
      button.classList.toggle('is-selecting', slot.id === requestedCharacterId);
      const picture = document.createElement('span'); picture.className = 'sheet-slot-portrait'; picture.textContent = String(index + 1);
      const name = document.createElement('span'); name.textContent = slot.sheet.hasSheet ? slot.sheet.validation?.summary.characterName || 'Sem nome' : `Ficha ${index + 1} · Vazia`;
      name.title = name.textContent;
      button.append(picture, name); tab.append(button); container.append(tab);
      if (slot.id === selection.activeCharacterId && slot.sheet.hasSheet && sheetRemoveButton) {
        tab.append(sheetRemoveButton); sheetRemoveButton.removeAttribute('hidden');
      }
      const cachedPortrait = slotPortraitUrls.get(slot.id);
      const showPortrait = (url: string) => { const image = document.createElement('img'); image.src = url; image.alt = ''; picture.replaceChildren(image); };
      if (cachedPortrait && cachedPortrait.revision === slot.portrait.uploadedAt && slot.portrait.hasPortrait) showPortrait(cachedPortrait.url);
      else {
        if (cachedPortrait) { URL.revokeObjectURL(cachedPortrait.url); slotPortraitUrls.delete(slot.id); }
        if (slot.portrait.hasPortrait) void characterPortraitBlob(slot.id).then((blob) => {
          if (!blob || revision !== characterSlotsRevision) return;
          const url = URL.createObjectURL(blob); slotPortraitUrls.set(slot.id, { revision: slot.portrait.uploadedAt, url }); showPortrait(url);
        });
      }
      button.addEventListener('click', async () => {
        if (!characterSelectionBusy && slot.id === selection.activeCharacterId) return;
        requestedCharacterId = slot.id;
        container.querySelectorAll<HTMLElement>('[role=tab]').forEach((item) => item.classList.toggle('is-selecting', item.dataset.characterId === requestedCharacterId));
        if (characterSelectionBusy) return;
        characterSelectionBusy = true;
        try {
          while (requestedCharacterId) {
            const target = requestedCharacterId; requestedCharacterId = null;
            const result = await selectCharacter(target);
            renderCharacterSheet(getPlayerToolsState().sheet);
            if (!result.ok || result.pendingApproval) {
              requestedCharacterId = null;
              await renderCharacterSlots();
              if (sheetStatusElement) sheetStatusElement.textContent = result.pendingApproval ? 'Troca de personagem aguardando aprovação do mestre.' : result.error || 'Não foi possível trocar a ficha.';
              return;
            }
            releasePendingPortraitPreview(); if (sheetInput instanceof HTMLInputElement) sheetInput.value = ''; renderPortraitEditor();
            await renderCharacterSlots();
          }
        } catch (error) { if (sheetStatusElement) sheetStatusElement.textContent = error instanceof Error ? error.message : 'Erro inesperado ao trocar a ficha.'; }
        finally { characterSelectionBusy = false; requestedCharacterId = null; container.querySelectorAll('.is-selecting').forEach((item) => item.classList.remove('is-selecting')); }
      });
    }
    renderCharacterSheet(getPlayerToolsState().sheet);
  } catch (error) { if (sheetStatusElement) sheetStatusElement.textContent = error instanceof Error ? error.message : 'Erro inesperado ao carregar as fichas.'; }
};

const clearSheetWarnings = async (issues: CharacterSheetIssue[], editing: boolean) => {
  const ids = issues.filter(({ dismissible }) => dismissible).map(({ id }) => id);
  if (!ids.length) return;
  try {
    const result = await dismissSheetWarnings(ids, editing ? sheetEditorDocument : undefined);
    if (!result.ok) throw new Error(result.error || 'Não foi possível limpar os avisos.');
    if (editing) { sheetEditorIssues = result.issues ?? []; renderSheetEditorFields(); }
    else { await getCharacterSelection(true); renderCharacterSheet(getPlayerToolsState().sheet); }
  } catch (error) {
    const target = editing ? sheetEditorStatus : sheetStatusElement;
    if (target) target.textContent = error instanceof Error ? error.message : 'Erro inesperado ao limpar os avisos.';
  }
};
const appendClearWarningButton = (item: HTMLElement, issue: CharacterSheetIssue, editing: boolean) => {
  if (!issue.dismissible) return;
  const button = document.createElement('button'); button.type = 'button'; button.className = 'sheet-warning-clear'; button.textContent = 'Limpar';
  button.addEventListener('click', () => void clearSheetWarnings([issue], editing)); item.append(button);
};

const renderCharacterSheet = (sheet: PlayerCharacterSheetStatus | null) => {
  if (sheetStatusElement) {
    sheetStatusElement.textContent = '';
  }
  if (sheetIssuesElement) {
    sheetIssuesElement.replaceChildren();
    sheetIssuesElement.hidden = !(sheet?.validation?.issues.length);
    for (const issue of sheet?.validation?.issues ?? []) {
      const item = document.createElement('li');
      item.dataset.severity = issue.severity;
      const details = issue.expected === undefined
        ? ''
        : ` Esperado: ${issue.expected}; encontrado: ${issue.actual ?? 'vazio'}.`;
      appendRuleText(item, `${issue.location ? `${issue.location}: ` : ''}${issue.reason || issue.message}${details}${issue.correction ? ` ${issue.correction}` : ''}${issue.source ? ' ' + issue.source : ''}`);
      const actions = document.createElement('div'); actions.className = 'sheet-issue-actions';
      if (issue.field) {
        const review = document.createElement('button');
        review.type = 'button';
        review.textContent = 'Revisar campo';
        review.addEventListener('click', () => void openSheetEditor(issue.field ?? undefined));
        actions.append(review);
      }
      appendClearWarningButton(actions, issue, false);
      item.append(actions);
      sheetIssuesElement.append(item);
    }
  }
  const hasSheet = Boolean(sheet?.hasSheet);
  document.getElementById('web-player-sheet-upload')?.toggleAttribute('hidden', hasSheet);
  document.getElementById('web-player-sheet-create')?.toggleAttribute('hidden', hasSheet);
  sheetOpenButton?.toggleAttribute('hidden', !hasSheet);
  document.getElementById('web-player-sheet-export')?.toggleAttribute('hidden', !hasSheet || Boolean(sheet?.importPending));
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
  queueMicrotask(() => void renderCharacterSlots());
  renderCharacterSheet(getPlayerToolsState().sheet);
  sheetDialog?.removeAttribute('hidden');
});
sheetCloseButton?.addEventListener('click', () => sheetDialog?.setAttribute('hidden', ''));

portraitInput?.addEventListener('change', () => {
  if (!(portraitInput instanceof HTMLInputElement)) return;
  const file = portraitInput.files?.[0];
  if (!file) return;
  if (file.size > MAX_CHARACTER_PORTRAIT_BYTES) {
    notifyPlayer('O retrato deve ter no máximo 5 MB.', 'rejected');
    portraitInput.value = '';
    return;
  }
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    notifyPlayer('Use uma imagem PNG, JPEG ou WebP.', 'rejected');
    portraitInput.value = '';
    return;
  }
  releasePendingPortraitPreview();
  pendingPortraitFile = file;
  pendingPortraitPreviewUrl = URL.createObjectURL(file);
  renderPortraitEditor();
  if (portraitFileName) {
    portraitFileName.textContent = file.name;
    portraitFileName.setAttribute('title', file.name);
  }
  portraitInput.value = '';
  markSheetEditorDirty();
});

portraitRemoveButton?.addEventListener('click', () => {
  portraitRemoveDialog?.removeAttribute('hidden');
  portraitRemoveCancel?.focus();
});
portraitRemoveCancel?.addEventListener('click', () => portraitRemoveDialog?.setAttribute('hidden', ''));
portraitRemoveClose?.addEventListener('click', () => portraitRemoveCancel?.click());
portraitRemoveConfirm?.addEventListener('click', () => {
  pendingPortraitFile = null; releasePendingPortraitPreview();
  portraitRemoveDialog?.setAttribute('hidden', ''); renderPortraitEditor(); markSheetEditorDirty();
});

characterPortraitButton?.addEventListener('click', () => {
  if (!currentPortraitUrl || !(portraitLightboxImage instanceof HTMLImageElement)) return;
  portraitLightboxImage.src = currentPortraitUrl;
  portraitLightbox?.removeAttribute('hidden');
  portraitLightboxClose?.focus();
});
portraitLightboxClose?.addEventListener('click', () => {
  portraitLightbox?.setAttribute('hidden', '');
});

document.getElementById('web-player-sheet-upload')?.addEventListener('click', () => sheetInput?.click());
sheetInput?.addEventListener('change', () => {
  if (!(sheetInput instanceof HTMLInputElement)) return;
  const file = sheetInput.files?.[0];
  sheetSelectionRemoveButton?.setAttribute('hidden', '');
  if (!file) return;
  renderCharacterSheet(getPlayerToolsState().sheet);
  if (file.size > MAX_CHARACTER_SHEET_BYTES) {
    if (sheetStatusElement) sheetStatusElement.textContent = 'A ficha deve ter no máximo 25 MB.';
    return;
  }
  sheetInput.disabled = true;
  sheetSelectionRemoveButton?.setAttribute('disabled', '');
  if (sheetStatusElement) sheetStatusElement.textContent = 'Lendo e validando a ficha…';
  void uploadCharacterSheet(file).then((result) => {
    if (result.ok) clearSheetEditorDraft();
    renderCharacterSheet(result.ok ? result.sheet ?? null : getPlayerToolsState().sheet);
    if (result.ok && !result.sheet?.importPending) void renderCharacterSlots();
    const hasErrors = result.sheet?.validation?.issues.some(
      ({ severity }) => severity === 'error',
    ) ?? !result.ok;
    if (hasErrors && result.sheet?.importPending) {
      notifyPlayer('A ficha contém campos que precisam de correção. Ela só será aplicada após a validação final.', 'rejected');
      sheetOpenButton?.click();
    }
    if (!result.ok && sheetStatusElement) {
      sheetStatusElement.textContent = result.error ?? 'A ficha precisa de ajustes.';
    }
  }).catch((error: unknown) => {
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
  ['Circulo', 'Círculo', 1],
  ['Escola', 'Escola', 160],
  ['Execucao', 'Execução', 160],
  ['Alcance', 'Alcance', 160],
  ['Area', 'Área / Alvo', 160],
  ['Duracao', 'Duração', 160],
  ['Resistencia', 'Resistência', 160],
  ['Custo', 'Custo (PM)', 3],
  ['Efeito', 'Efeito', 100_000],
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

const attackEditorFields = (index: number): CharacterSheetEditorField[] => {
  const group = `Ataque ${index}`;
  const prefix = `BossBar.Ataque.${index}`;
  return [
    { ...editorField(`${prefix}.Principal`, 'Principal', 'Ataques', group), kind: 'checkbox', value: 'Off' },
    { ...editorField(`${prefix}.DuasArmas`, 'Duas armas', 'Ataques', group), kind: 'checkbox', value: 'Off' },
    editorField(`Ataque ${index}`, 'Arma', 'Ataques', group),
    { ...editorField(`${prefix}.Pericia`, 'Perícia', 'Ataques', group), kind: 'choice', options: ['Luta', 'Pontaria'], value: 'Luta' },
    editorField(`${prefix}.Base`, 'Teste de ataque: base', 'Ataques', group),
    { ...editorField(`${prefix}.Ajuste`, 'Ajuste de ataque', 'Ataques', group, { kind: 'formula' }), value: '0' },
    editorField(`Dano ${index}`, 'Dano', 'Ataques', group, { kind: 'formula' }),
    editorField(`BossBar.Ataque.${index}.MargemCritico`, 'Margem de crítico', 'Ataques', group, {
      kind: 'integer', min: 2, max: 20,
    }),
    {
      ...editorField(`BossBar.Ataque.${index}.MultiplicadorCritico`, 'Multiplicador', 'Ataques', group, {
        kind: 'integer', min: 1, max: 20,
      }),
      value: '2',
    },
    editorField(`Tipo ${index}`, 'Tipo', 'Ataques', group),
    editorField(`${prefix}.Origem`, 'Origem', 'Ataques', group),
    editorField(`${prefix}.Segunda.Origem`, 'Origem', 'Ataques', group),
    editorField(`Alcance ${index}`, 'Alcance', 'Ataques', group),
    ...['Nome', 'Pericia', 'Base', 'Ajuste', 'Dano', 'MargemCritico', 'MultiplicadorCritico', 'Tipo', 'Alcance'].map((key): CharacterSheetEditorField => ({
      ...editorField(`${prefix}.Segunda.${key}`, ({ Nome: 'Arma', Pericia: 'Perícia', Base: 'Teste de ataque', Ajuste: 'Ajuste de ataque', Dano: 'Dano', MargemCritico: 'Margem de crítico', MultiplicadorCritico: 'Multiplicador', Tipo: 'Tipo', Alcance: 'Alcance' } as Record<string, string>)[key], 'Ataques', group),
      ...(key === 'Pericia' ? { kind: 'choice', options: ['Luta', 'Pontaria'], value: 'Luta' } : {}),
      ...(['Ajuste', 'Dano'].includes(key) ? { validation: { kind: 'formula' } } : {}),
      ...(key === 'MargemCritico' ? { value: '20', validation: { kind: 'integer', min: 2, max: 20 } } : {}),
      ...(key === 'MultiplicadorCritico' ? { value: '2', validation: { kind: 'integer', min: 1, max: 20 } } : {}),
    })),
    editorField(`BossBar.Ataque.${index}.Informacoes`, 'Informações adicionais', 'Ataques', group, { kind: 'text', maxLength: 100_000 }),
  ];
};

const itemEditorFields = (index: number) => [
  editorField(index <= 15 ? `Item${index}` : `BossBar.Item.${index}.Nome`, 'Item', 'Itens', `Item ${index}`),
  {
    ...editorField(`BossBar.Item.${index}.Quantidade`, 'Quantidade', 'Itens', `Item ${index}`, {
      kind: 'integer', min: 0, max: 9_999,
    }),
    value: '0',
  },
  editorField(index <= 15 ? `PesoItem${index}` : `BossBar.Item.${index}.Peso`, 'Espaços', 'Itens', `Item ${index}`, {
    kind: 'decimal', min: 0, max: 1_000_000,
  }),
];

const equipmentEditorFields = (kind: 'Armadura' | 'Escudo', index: number) => {
  const section = 'Armadura e escudo';
  const group = `${kind} ${index}`;
  const prefix = `BossBar.${kind}.${index}`;
  return [
    { ...editorField(`${prefix}.Equipado`, 'Equipado', section, group), kind: 'checkbox' as const, value: 'Off' },
    editorField(`${prefix}.Nome`, 'Nome', section, group),
    editorField(`${prefix}.Informacoes`, 'Informações adicionais', section, group, { kind: 'text', maxLength: 100_000 }),
    ...(kind === 'Armadura' ? [editorField(`${prefix}.LimiteAtributo`, 'Limite do atributo na Defesa', section, group, { kind: 'integer', min: 0, max: 99 }), editorField(`${prefix}.LimiteManual`, 'Limite manual', section, group)] : []),
    editorField(`${prefix}.Defesa`, 'Defesa', section, group, {
      kind: 'integer', min: 0, max: 999,
    }),
    editorField(`${prefix}.Penalidade`, 'Penalidade', section, group, {
      kind: 'integer', min: -99, max: 99,
    }),
    editorField(`${prefix}.OutrosDefesa`, 'Outros: Defesa', section, group, { kind: 'integer', min: -999, max: 999 }),
    editorField(`${prefix}.OutrosPenalidade`, 'Outros: Penalidade', section, group, { kind: 'integer', min: -99, max: 99 }),
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

const addAttackEditorRow = () => {
  const index = nextEditorGroupIndex(/^Ataque (\d+)$/, 20);
  if (!index) return;
  sheetEditorRemovedFields = sheetEditorRemovedFields.filter(
    ({ group }) => group !== `Ataque ${index}`,
  );
  sheetEditorDocument.push(...attackEditorFields(index));
  renderSheetEditorFields();
  markSheetEditorDirty();
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

const inventoryFromEditor = () => {
  const values = Object.fromEntries(sheetEditorDocument.map(({ name, value }) => [name, value]));
  if (sheetEditorIssues.some(({ id }) => id === 'migration:load-units')) values['BossBar.Migration.LoadUnits'] = 'review';
  const overflow = sheetEditorIssues.find(({ id }) => id === 'review:inventory');
  if (overflow) values['BossBar.Import.InventarioRevisar'] = overflow.message;
  return sheetInventoryLoad(values);
};
const refreshEquipmentLoadBadges = () => {
  const load = inventoryFromEditor();
  for (const input of sheetEditorFields?.querySelectorAll<HTMLInputElement>('[data-item-total]') ?? []) {
    const item = load.items.find(({ index }) => index === Number(input.dataset.itemTotal));
    input.value = !item ? '0' : Number.isFinite(item.quantity * item.spaces) ? String(Number((item.quantity * item.spaces).toFixed(3))) : '—';
  }
  for (const part of ['gross', 'equipped', 'total'] as const) {
    const input = sheetEditorFields?.querySelector<HTMLInputElement>(`[data-load-part="${part}"]`); if (input) input.value = String(load[part] ?? '—');
  }
  for (const badge of sheetEditorFields?.querySelectorAll<HTMLElement>('.sheet-item-equipped') ?? []) {
    const item = load.items.find(({ index }) => index === Number(badge.dataset.itemIndex));
    badge.hidden = !item?.exempt;
    badge.textContent = item?.exempt ? ' (Equipado)' : '';
  }
};
const recalculateSheetLoad = () => {
  const result = inventoryFromEditor();
  refreshEquipmentLoadBadges();
  if (result.total === null) {
    if (sheetEditorStatus) sheetEditorStatus.textContent = `Carga preservada: ${result.reasons.join(' ')}`;
    return;
  }
  const formatted = String(result.total);
  const loadField = sheetEditorDocument.find(({ name }) => name === 'CargaTotal');
  if (loadField) loadField.value = formatted;
  const loadInput = [...(sheetEditorFields?.querySelectorAll<HTMLElement>('[data-field-name]') ?? [])]
    .find(({ dataset }) => dataset.fieldName === 'CargaTotal')
    ?.querySelector<HTMLInputElement>('[data-load-part="total"]');
  if (loadInput) loadInput.value = formatted;
};

const refreshSkillTrainingReview = () => {
  const values=Object.fromEntries(sheetEditorDocument.map(({ name, value }) => [name, value]));const training = skillTraining(values);
  sheetEditorIssues = [...sheetEditorIssues.filter(({ id }) => !/^(training:|benefit:|skill-effect:|skill-import:|skills:imported-bonuses)/.test(id)), ...training.issues, ...skillEffectIssues(values), ...skillImportIssues(values)];
  for (const group of sheetEditorFields?.querySelectorAll<HTMLElement>('[data-training-field]') ?? []) {
    const trained = training.selected.some(skill => skill.trainedField === group.dataset.trainingField);
    group.classList.toggle('is-trained-skill', trained);
    const badge = group.querySelector<HTMLElement>('.sheet-skill-training-badge'); if (badge) badge.hidden = !trained;
  }
  const summary = sheetEditorFields?.querySelector('.skill-training-summary');
  if (summary) summary.textContent = `${training.selected.length} / ${training.maximum} treinadas${training.sources.some(({ confirmed }) => !confirmed) ? ' · fontes a confirmar' : ''}`;
};

const clearRecalculatedSkillIssues = (names: string[]) => {
  const solved = new Set(names);
  const previousReviewFields=sheetEditorIssues.flatMap(issue=>issue.id.startsWith('skill-import:')&&issue.field?[issue.field]:[]);
  sheetEditorIssues = sheetEditorIssues.filter((issue) => !(issue.id.startsWith('formula:') && issue.field && solved.has(issue.field)));
  refreshSkillTrainingReview();
  for (const name of new Set([...names,...previousReviewFields])) {
    if (sheetEditorIssues.some((issue) => issue.field === name)) continue;
    const wrapper = sheetEditorFields?.querySelector<HTMLElement>(`[data-field-name="${CSS.escape(name)}"]`);
    wrapper?.classList.remove('has-import-error', 'has-import-warning'); wrapper?.querySelector('.sheet-field-error')?.remove();
    const input = wrapper?.querySelector('input'); input?.removeAttribute('aria-invalid'); input?.setCustomValidity('');
  }
  renderSheetEditorReview();
};

const refreshAttributeDerivedValues = () => {
  const values = Object.fromEntries(sheetEditorDocument.map(({ name, value }) => [name, value]));
  const set = (key: string, value: string) => {
    const field = sheetEditorDocument.find(({ name }) => name === key); if (field) field.value = value;
    const input = sheetEditorFields?.querySelector<HTMLInputElement>(`[data-field-name="${CSS.escape(key)}"] input`);
    if (input?.type === 'checkbox') input.checked = value === 'Yes';
    else if (input) input.value = /^BossBar\.Ataque\.\d+\.(Segunda\.)?Base$/.test(key) && value !== '' && Number(value) >= 0 ? `+${Number(value)}` : value;
    const select=sheetEditorFields?.querySelector<HTMLSelectElement>(`[data-field-name="${CSS.escape(key)}"] select`);if(select)select.value=value;
    values[key] = value;
  };
  for (const field of sheetEditorDocument.filter(({ name }) => /^ModAtrib/.test(name))) {
    const code = values[field.name.replace('ModAtrib', 'SeleAtrib')] || '';
    const total = values['Mod' + code.slice(0, 1).toUpperCase() + code.slice(1).toLowerCase()];
    if (total !== undefined && total.trim()) set(field.name, total);
  }
  const skillUpdates = recalculateCharacterSkills(values);
  let addedCraft = false;
  for (const rule of characterSkillRules(values).filter((r) => r.nameField && !sheetEditorDocument.some((f) => f.name === r.nameField))) { sheetEditorDocument.push(...craftEditorFields(rule, values)); addedCraft = true; }
  for (const [key, value] of Object.entries(skillUpdates)) set(key, value);
  if (addedCraft) renderSheetEditorFields();
  clearRecalculatedSkillIssues(Object.keys(skillUpdates));
  for (const field of sheetEditorDocument.filter(({ name }) => /^BossBar\.Ataque\.\d+\.(Segunda\.)?Base$/.test(name))) {
    const match = /^BossBar\.Ataque\.(\d+)\.(Segunda\.)?Base$/.exec(field.name)!;
    set(field.name, String(attackSkillTotal(values, Number(match[1]), Boolean(match[2])) ?? ''));
  }
  recalculateCharacterResources(values);
  for (const key of [RESOURCE_AUTO_FIELD, 'PVs Totais', 'PVs Atuais', 'PMs Totais', 'PMs Atuais']) if (values[key] !== undefined) set(key, values[key]);
  const defense = sheetDefenseTotal(values); if (Number.isFinite(defense)) set('CA', String(defense));
  const dc = 10 + Number(values.ModAtribMagia || 0) + Math.floor(Number(values.Lv || 1) / 2) + Number(values['BossBar.CdOutros'] || 0);
  if (Number.isFinite(dc)) set('TesteResist', String(dc));
  markSheetEditorDirty();
};

const markSheetEditorDirty = () => {
  sheetEditorDirty = true;
  scheduleAutomaticSheetValidation();
  document.getElementById('web-player-sheet-import-autofix')?.removeAttribute('disabled');

  if (sheetEditorStatus) {
    sheetEditorStatus.textContent = 'Alterações não salvas. Fechar descarta este rascunho.';
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
    kind: fieldName === 'Circulo' ? 'choice' as const : 'text' as const,
    value: '',
    ...(fieldName === 'Circulo' ? { options: ['', '1', '2', '3', '4', '5'] } : {}),
    validation: fieldName === 'Circulo' ? { kind: 'integer' as const, min: 1, max: 5 }
      : fieldName === 'Custo' ? { kind: 'integer' as const, min: 0, max: 999 } : { kind: 'text' as const, maxLength },
  })));
  renderSheetEditorFields();
  markSheetEditorDirty();
};

function releasePendingPortraitPreview() {
  if (!pendingPortraitPreviewUrl) return;
  URL.revokeObjectURL(pendingPortraitPreviewUrl);
  pendingPortraitPreviewUrl = null;
}

function renderPortraitEditor() {
  const portrait = getPlayerToolsState().portrait;
  const previewUrl = pendingPortraitFile === null ? null : pendingPortraitPreviewUrl ?? currentPortraitUrl;
  if (portraitEditorPreview instanceof HTMLImageElement) {
    if (previewUrl) portraitEditorPreview.src = previewUrl;
    else portraitEditorPreview.removeAttribute('src');
    portraitEditorPreview.toggleAttribute('hidden', !previewUrl);
  }
  portraitEditorPlaceholder?.toggleAttribute('hidden', Boolean(previewUrl));
  portraitRemoveButton?.toggleAttribute('hidden', pendingPortraitFile === null || !(pendingPortraitFile || portrait?.hasPortrait));
  if (portraitFileName) {
    const label = pendingPortraitFile === null ? 'Nenhum retrato' : pendingPortraitFile?.name ?? portrait?.fileName ?? 'Nenhum retrato';
    portraitFileName.textContent = label;
    portraitFileName.setAttribute('title', label);
  }
}

const renderSheetEditorFilters = () => {
  if (!sheetEditorFilters) return;
  sheetEditorFilters.replaceChildren();
  for (const category of sheetEditorCategoryDefinitions) {
    const button = document.createElement('button');
    const selected = activeSheetEditorCategories.has(category.id);
    button.type = 'button';
    button.className = `is-${category.id}`;
    button.textContent = category.label;
    button.setAttribute('aria-pressed', String(selected));
    button.addEventListener('click', () => {
      if (selected) activeSheetEditorCategories.delete(category.id);
      else activeSheetEditorCategories.add(category.id);
      renderSheetEditorFilters();
      renderSheetEditorFields();
    });
    sheetEditorFilters.append(button);
  }
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'is-all';
  clear.textContent = 'Mostrar tudo';
  clear.disabled = activeSheetEditorCategories.size === 0;
  clear.addEventListener('click', () => {
    activeSheetEditorCategories.clear();
    renderSheetEditorFilters();
    renderSheetEditorFields();
  });
  sheetEditorFilters.append(clear);
};

const focusSheetEditorField = (fieldName: string) => {
  if([SKILL_EFFECTS_FIELD,SKILL_TRAINING_FIELD].includes(fieldName)||fieldName.startsWith('Mar Trei ')||/^BossBar\.Oficio\.\d+\.Treinada$/.test(fieldName)){openSkillTrainingEditor(sheetEditorDocument,applyTrainingDraft);return;}
  activeSheetEditorCategories.clear();
  if (sheetEditorSearch instanceof HTMLInputElement) sheetEditorSearch.value = '';
  renderSheetEditorFilters();
  renderSheetEditorFields();
  const label = document.getElementById('web-player-sheet-editor')?.querySelector<HTMLElement>(`[data-field-name="${CSS.escape(fieldName)}"]`)
    ?? sheetEditorFields?.querySelector<HTMLElement>(`[data-field-name="${CSS.escape(fieldName)}"]`);
  scrollSheetFieldIntoView(label);
  label?.querySelector<HTMLElement>('input:not([hidden]), select, textarea, button')?.focus({ preventScroll: true });
};

const scrollSheetFieldIntoView = (field: HTMLElement | null | undefined) => {
  if (!field || !sheetEditorFields?.contains(field)) return;
  const parent = sheetEditorFields.getBoundingClientRect(); const target = field.getBoundingClientRect();
  sheetEditorFields.scrollTo({ top: sheetEditorFields.scrollTop + target.top - parent.top - Math.max(0, (parent.height - target.height) / 2), behavior: 'smooth' });
};
const appendReferenceComparison = (container: HTMLElement, issue: CharacterSheetIssue) => {
  if (!issue.comparison) return;
  const details = document.createElement('details'); details.className = 'sheet-reference-comparison';
  const summary = document.createElement('summary'); summary.textContent = 'Comparar trechos da diferença'; details.append(summary);
  for (const [caption, text] of [['Na ficha', issue.comparison.sheetExcerpt], [issue.source || 'Na referência', issue.comparison.referenceExcerpt]]) {
    const quote = document.createElement('blockquote');
    const label = document.createElement('span'); label.className = 'comparison-caption'; appendRuleText(label, caption);
    quote.append(label, document.createTextNode(text)); details.append(quote);
  }
  const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Consultar texto completo do livro';
  button.addEventListener('click', () => openRulesCatalog({ referenceId: issue.comparison!.referenceId }));
  details.append(button); container.append(details);
};
const separateRowWarnings = (row: HTMLElement, target: HTMLElement, description: string) => {
  const notices = [...row.querySelectorAll<HTMLElement>('.sheet-field-error')];
  if (!notices.length) return;
  const review = document.createElement('details'); review.className = 'sheet-spell-review sheet-row-review';
  const summary = document.createElement('summary'); summary.textContent = `${notices.length} campo(s) para revisar ${description}`;
  review.append(summary);
  for (const notice of notices) {
    const wrapper = notice.closest('.sheet-field-review'); if (wrapper && row.contains(wrapper)) wrapper.remove();
    review.append(notice);
  }
  target.append(review);
};

const renderSheetEditorReview = () => {
  const review = document.getElementById('web-player-sheet-editor-review');
  if (!review) return;
  review.replaceChildren();
  review.hidden = sheetEditorIssues.length === 0;
  if (review.hidden) return;
  const summary = document.createElement('summary');
  const errors = sheetEditorIssues.filter(({ severity }) => severity === 'error').length;
  summary.textContent = `${errors} erro(s) e ${sheetEditorIssues.length - errors} aviso(s) para revisar`;
  if (sheetEditorIssues.some(({ dismissible }) => dismissible)) {
    const clearAll = document.createElement('button'); clearAll.type = 'button'; clearAll.className = 'sheet-warning-clear-all'; clearAll.textContent = 'Limpar todos';
    clearAll.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); void clearSheetWarnings(sheetEditorIssues, true); });
    summary.append(clearAll);
  }
  const list = document.createElement('ul');
  for (const issue of sheetEditorIssues) {
    const item = document.createElement('li');
    item.dataset.severity = issue.severity;
    const text = document.createElement('p');
    appendRuleText(text, `${issue.location ? `${issue.location}: ` : ''}${issue.reason || issue.message || 'Houve um erro inesperado.'}${issue.expected === undefined ? '' : ` Esperado: ${issue.expected}; encontrado: ${issue.actual ?? 'vazio'}.`}${issue.correction ? ` ${issue.correction}` : ''}${issue.source ? ' ' + issue.source : ''}`);
    item.append(text);
    appendReferenceComparison(item, issue);
    const actions = document.createElement('div'); actions.className = 'sheet-issue-actions';
    if (issue.id === 'migration:load-units') {
      const confirmation = sheetEditorDocument.find(({ name }) => name === 'BossBar.CargaRevisada');
      if (confirmation) {
        const label = document.createElement('label');
        label.dataset.fieldName = confirmation.name;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox'; checkbox.checked = confirmation.value === 'Yes';
        checkbox.addEventListener('change', () => {
          confirmation.value = checkbox.checked ? 'Yes' : 'Off';
          markSheetEditorDirty();
        });
        label.append(checkbox, document.createTextNode('Revisei o equipamento e confirmei a carga em espaços'));
        item.append(label);
      }
    } else if (issue.field && sheetEditorDocument.some(({ name }) => name === issue.field)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Ir ao campo';
      button.addEventListener('click', () => focusSheetEditorField(issue.field!));
      actions.append(button);
    }
    appendClearWarningButton(actions, issue, true);
    item.append(actions);
    list.append(item);
  }
  review.append(summary, list);
};

const applyTrainingDraft = (updates: CharacterSheetEditorField[]) => {
  // An automatic preview may have replaced the sheet array while the nested draft was open.
  for(const update of updates){const field=sheetEditorDocument.find(f=>f.name===update.name);if(field)field.value=update.value;else sheetEditorDocument.push({...update});}
  markSheetEditorDirty();renderSheetEditorFields();refreshAttributeDerivedValues();
};

const renderSheetEditorFields = () => {
  if (!sheetEditorFields) return;
  refreshSkillTrainingReview();
  const automaticRepair = document.getElementById('web-player-sheet-import-autofix');
  automaticRepair?.removeAttribute('hidden');
  automaticRepair?.toggleAttribute('disabled', sheetEditorClosing);
  renderSheetEditorReview();
  const issuesByField = new Map<string, typeof sheetEditorIssues>();
  for (const issue of sheetEditorIssues) {
    if (issue.field) issuesByField.set(issue.field, [...(issuesByField.get(issue.field) ?? []), issue]);
  }
  const query = sheetEditorSearch instanceof HTMLInputElement
    ? sheetEditorSearch.value.trim().toLocaleLowerCase('pt-BR')
    : '';
  sheetEditorFields.replaceChildren();
  const spellNames = document.createElement('datalist'); spellNames.id = 'sheet-spell-catalog-names';
  for (const spell of T20_CATALOG.spells) spellNames.append(new Option(spell.name));
  sheetEditorFields.append(spellNames);
  const filteredFields = sheetEditorDocument.filter((field) => {
    if (field.name === RD_FIELD || field.name === SKILL_TRAINING_FIELD || field.name === SKILL_EFFECTS_FIELD) return false;
    if (['BossBar.CdJustificativa', 'BossBar.Nimb.Equipamento', 'BossBar.Nimb.Equipamento2', 'BossBar.CargaRevisada'].includes(field.name)) return false;
    if (['arm pesa', 'BossBar.LimiteAtributoDefesa'].includes(field.name) || /\.LimiteManual$|^Bônus Atq \d+$|\.(TesteTotal|DanoAlternativo)$/.test(field.name)) return false;
    const secondary = /^(BossBar\.Ataque\.\d+)\.Segunda\./.exec(field.name);
    if (secondary && sheetEditorDocument.find(({ name }) => name === `${secondary[1]}.DuasArmas`)?.value !== 'Yes') return false;
    const categoryMatches = activeSheetEditorCategories.size === 0 ||
      activeSheetEditorCategories.has(sheetEditorCategoryForSection(field.section));
    if (!categoryMatches) return false;
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
    if ((field.name.startsWith('Mar Trei ') || /^BossBar\.Oficio\.\d+\.Treinada$/.test(field.name)) && input instanceof HTMLInputElement && input.checked) {
      const values = Object.fromEntries(sheetEditorDocument.map(({ name, value }) => [name, value]));
      const before = skillTraining(values); const after = skillTraining({ ...values, [field.name]: 'Yes' });
      if (after.unmatched.length > before.unmatched.length || after.unmatched.some(({ trainedField }) => trainedField === field.name)) {
        input.checked = false;
        openSkillTrainingEditor(sheetEditorDocument, applyTrainingDraft, field.group);
        return;
      }
    }
    sheetEditorIssues = sheetEditorIssues.filter((issue) => issue.field !== field.name);
    input.setCustomValidity('');
    input.removeAttribute('aria-invalid');
    const wrapper = input.closest<HTMLElement>('[data-field-name]');
    wrapper?.classList.remove('has-import-error', 'has-import-warning');
    wrapper?.querySelector('.sheet-field-error')?.remove();
    const previousValue = field.value;
    field.value = field.kind === 'checkbox'
      ? (input as HTMLInputElement).checked ? 'Yes' : 'Off'
      : input.value;
    markSheetEditorDirty();
    renderSheetEditorReview();
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
    const setDerived = (name: string, value: string) => {
      const target = sheetEditorDocument.find((entry) => entry.name === name);
      if (target) target.value = value;
      const element = sheetEditorFields?.querySelector<HTMLInputElement | HTMLOutputElement | HTMLSelectElement>(`[data-field-name="${CSS.escape(name)}"] input, [data-field-name="${CSS.escape(name)}"] output, [data-field-name="${CSS.escape(name)}"] select`);
      if (element instanceof HTMLInputElement || element instanceof HTMLSelectElement) element.value = /\.Base$/.test(name) && value !== '' && Number(value) >= 0 ? `+${Number(value)}` : value;
      else if (element) element.value = Number(value) ? `−${value}` : '0';
    };
    const exclusive = /^BossBar\.(Armadura|Escudo|Ataque)\.\d+\.(Equipado|Principal)$/.exec(field.name);
    if (exclusive && field.value === 'Yes') {
      for (const other of sheetEditorDocument) if (other !== field && new RegExp(`^BossBar\\.${exclusive[1]}\\.\\d+\\.${exclusive[2]}$`).test(other.name)) other.value = 'Off';
    }
    const armorRow = /^Armadura (\d+)$/.exec(field.group || '');
    if (affectsInventoryLoad(field.name)) recalculateSheetLoad();
    if (armorRow) {
      const index = Number(armorRow[1]); const keys = equipmentKeys('Armadura', index);
      if (field.name === keys.name) {
        const inferred = inferredArmorAttributeLimit(field.value);
        if (inferred !== null) setDerived(keys.limit, inferred);
        setDerived(`BossBar.Armadura.${index}.LimiteManual`, 'Off');
      } else if (field.name === keys.limit) setDerived(`BossBar.Armadura.${index}.LimiteManual`, 'Yes');
    }
    if (['Pa', 'Pe', 'B.Arm1', 'B.Esc2'].includes(field.name) || /^BossBar\.(Armadura|Escudo)\./.test(field.name)) {
      const values = Object.fromEntries(sheetEditorDocument.map(({ name, value }) => [name, value]));
      const penalty = armorPenaltyTotal(values);
      if (Number.isFinite(penalty)) setDerived('BossBar.PenalidadeArmadura', String(penalty));
      for (const [kind, total] of [['Armadura', 'B.Arm'], ['Escudo', 'B.Esc']] as const) setDerived(total, String(equipmentDefenseTotal(values, kind)));
    }
    const values = Object.fromEntries(sheetEditorDocument.map(({ name, value }) => [name, value]));
    if ((field.name === 'RAÇA' || field.name === 'SeleTamanho') && previousValue !== field.value) {
      synchronizeCharacterSize(values,field.name==='RAÇA');
      for(const key of ['SeleTamanho','ModFurtTam','BossBar.ManobrasTamanho'])if(values[key]!==undefined)setDerived(key,values[key]);
    }
    const skillUpdates = recalculateCharacterSkills(values);
    for (const [name, value] of Object.entries(skillUpdates)) setDerived(name, value);
    clearRecalculatedSkillIssues(Object.keys(skillUpdates));
    const selectedDefenseAttribute = values[`Mod${values.SeleAtribDefe?.slice(0, 1).toUpperCase()}${values.SeleAtribDefe?.slice(1).toLowerCase()}`];
    if (selectedDefenseAttribute !== undefined) { values.ModAtribDefe = selectedDefenseAttribute; setDerived('ModAtribDefe', selectedDefenseAttribute); }
    const totalDefense = sheetDefenseTotal(values);
    if (Number.isFinite(totalDefense)) setDerived('CA', String(totalDefense));
    for (const base of sheetEditorDocument) {
      const match = /^BossBar\.Ataque\.(\d+)\.(Segunda\.)?Base$/.exec(base.name);
      if (match) setDerived(base.name, attackSkillTotal(values, Number(match[1]), Boolean(match[2])));
    }
    if (exclusive || /\.DuasArmas$/.test(field.name)) renderSheetEditorFields();
    const circle = /^(BossBar\.Magia\.\d+)\.Circulo$/.exec(field.name);
    if (circle) {
      const cost = baseSpellManaCost(field.value);
      setDerived(`${circle[1]}.Custo`, cost === null ? '' : String(cost));
    }
    if (field.name === 'arm pesa') renderSheetEditorFields();
  };

  const createFieldInput = (field: CharacterSheetEditorField) => {
    let input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    if (/^BossBar\.Ataque\.\d+\.(Segunda\.)?Origem$/.test(field.name)) {
      const select = document.createElement('select');
      for (const [id, label] of DAMAGE_ORIGINS) select.add(new Option(label, id, false, id === (field.value || 'unknown')));
      input = select;
    } else if (field.name === 'SeleTamanho') {
      const select = document.createElement('select');
      const normalized = characterSize(field.value)?.name ?? field.value;
      select.add(new Option(field.value && !characterSize(field.value) ? `${field.value} — revisar` : 'Selecione', !characterSize(field.value)?field.value:''));
      for (const size of CHARACTER_SIZES) select.add(new Option(size.name, size.name, false, size.name === normalized));
      input = select;
    } else if (/^Tipo \d+$|\.Segunda\.Tipo$/.test(field.name)) {
      const select = document.createElement('select');
      for (const value of [...new Set([field.value, ...DAMAGE_TYPES])]) {
        const option = new Option(value || 'Selecione', value, false, value === field.value);
        select.append(option);
      }
      input = select;
    } else if (field.name === 'Ofício 1' || field.name === 'Ofício_2' || /^BossBar\.Oficio\.\d+\.Nome$/.test(field.name)) {
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
      ].includes(field.name) || /^BossBar\.(?:Nimb|Habilidades)\.|\.(?:Efeito|Informacoes)$|^BossBar\.(?:Defesa|Cd)Justificativa$/.test(field.name);
      if (isLongText) {
        const textArea = document.createElement('textarea');
        textArea.rows = field.value ? 6 : 3;
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
    if (input instanceof HTMLInputElement && field.name === 'BossBar.MoedaPersonalizada.Nome') input.placeholder = 'Moeda personalizada';
    if (input instanceof HTMLInputElement && /\.LimiteAtributo$/.test(field.name)) input.placeholder = 'Sem limite';
    if (input instanceof HTMLInputElement && (/^BossBar\.Ataque\.\d+\.(Segunda\.)?Base$/.test(field.name) || ['CA', 'B.Arm', 'B.Esc', 'ModFurtTam', 'BossBar.ManobrasTamanho', 'CargaTotal', 'TesteResist'].includes(field.name))) {
      input.readOnly = true; input.setAttribute('aria-readonly', 'true');
      input.title = 'Calculado a partir da perícia ou do equipamento selecionado.';
      if (/\.Base$/.test(field.name) && field.value !== '' && Number(field.value) >= 0) input.value = `+${Number(field.value)}`;
    }
    if (input instanceof HTMLTextAreaElement && field.name === 'BossBar.Nimb.PaginasAdicionais') {
      input.readOnly = true;
      input.title = 'Informações adicionais. Registre alterações em Anotações da ficha.';
    }
    if (input instanceof HTMLInputElement && /^BossBar\.Magia\.\d+\.Custo$/.test(field.name)) {
      input.readOnly = true; input.setAttribute('aria-readonly', 'true');
      input.title = 'Custo-base em PM pelo círculo (Livro Básico, p. 170). Registre reduções e ajustes em Anotações para Magias.';
    }
    if (input instanceof HTMLInputElement && /^BossBar\.Magia\.\d+\.Nome$/.test(field.name)) {
      input.setAttribute('list', 'sheet-spell-catalog-names');
      input.addEventListener('change', () => {
        const reference = findSpell(input.value); if (!reference) return;
        const prefix = field.name.replace(/\.Nome$/, '');
        for (const [suffix, value] of Object.entries(spellFieldDefaults(reference))) {
          const target = sheetEditorDocument.find(({ name }) => name === `${prefix}.${suffix}`);
          if (target && !target.value.trim()) target.value = value;
        }
        const circle = sheetEditorDocument.find(({ name }) => name === `${prefix}.Circulo`)?.value ?? '';
        const cost = sheetEditorDocument.find(({ name }) => name === `${prefix}.Custo`);
        if (cost) cost.value = String(baseSpellManaCost(circle) ?? '');
        markSheetEditorDirty(); renderSheetEditorFields();
      });
    }
    if (input instanceof HTMLInputElement && /^ModAtrib/.test(field.name) &&
      sheetEditorDocument.some(({ name, value }) => name === field.name.replace('ModAtrib', 'SeleAtrib') && /^(FOR|DES|CON|INT|SAB|CAR)$/.test(value))) {
      input.readOnly = true;
      input.setAttribute('aria-readonly', 'true');
      input.title = 'Derivado do atributo selecionado. Altere o atributo ou sua seleção e use Validar e corrigir cálculos.';
    }
    const skillDerived = field.section === 'Perícias' && ['Total', 'Atributo', 'Treino', '1/2 do nível'].includes(field.label);
    if (input instanceof HTMLInputElement && (skillDerived || field.name === 'ModAtribMagia')) { input.readOnly = true; input.setAttribute('aria-readonly', 'true'); }
    const noTooltip = ['ModFurtTam', 'BossBar.ManobrasTamanho', 'ModAtribMagia'].includes(field.name) || (skillDerived && field.label !== 'Total');
    if (noTooltip) { input.removeAttribute('title'); input.classList.add('no-calculation-tooltip'); }
    else if ((input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) && (input.readOnly || ['PVs Totais', 'PMs Totais', 'CargaMax', 'Levantar'].includes(field.name))) attachCalculationTooltip(input, () => sheetCalculationDescription(field.name, sheetEditorDocument));
    const errors = (issuesByField.get(field.name) ?? []).filter((issue) => issue.severity === 'error');
    if (errors.length) {
      input.setAttribute('aria-invalid', 'true');
      input.setCustomValidity(errors.map(({ message }) => message).join(' '));
    }
    input.addEventListener('input', () => scheduleFieldSave(field, input));
    if (['integer', 'decimal', 'formula'].includes(field.validation?.kind ?? '')) input.addEventListener('blur', () => {
      const normalized = normalizeSheetNumber(input.value);
      if (normalized !== input.value) { input.value = normalized; scheduleFieldSave(field, input); }
    });
    return input;
  };

  const appendField = (container: HTMLElement, field: CharacterSheetEditorField) => {
    const label = document.createElement('label');
    label.dataset.fieldName = field.name;
    const name = document.createElement('span');
    name.textContent = field.section === 'Perícias' ? ({ 'Atributo-chave': 'Chave', '1/2 do nível': '½ nível' } as Record<string,string>)[field.label] || field.label : field.label;
    name.title = field.label;
    const input = createFieldInput(field);
    if (input instanceof HTMLTextAreaElement) label.classList.add('is-long-text');
    if (field.kind === 'checkbox') label.classList.add('is-checkbox');
    const identityKind = identityOptionKind[field.name];
    label.append(name, identityKind && input instanceof HTMLInputElement ? characterOptionsInput(input, identityKind, field.label, (name) => field.name === 'CLASSE' ? name + ' ' + (sheetEditorDocument.find(({ name }) => name === 'Lv')?.value || '1') : name) : input);
    if (field.name === 'CLASSE') {
      const header = document.createElement('span'); header.className = 'identity-class-title';
      const multi = document.createElement('button'); multi.type = 'button'; multi.className = 'sheet-secondary-action'; multi.textContent = 'Multiclasse';
      multi.setAttribute('aria-label', 'Multiclasse');
      multi.addEventListener('click', (event) => { event.preventDefault(); openMulticlassEditor(sheetEditorDocument, () => { markSheetEditorDirty(); renderSheetEditorFields(); refreshAttributeDerivedValues(); }); });
      name.replaceWith(header); header.append(name, multi);
      const abbreviate = () => { input.value = abbreviateCharacterClasses(field.value); input.title = field.value; };
      abbreviate(); input.addEventListener('focus', () => { input.value = field.value; });
      input.addEventListener('blur', abbreviate);
      input.addEventListener('change', () => {
        const level = sheetEditorDocument.find(({ name }) => name === 'Lv')?.value || '1';
        if (input.value && !input.value.includes('/') && !/\d+$/.test(input.value)) { input.value = formatCharacterClasses(parseCharacterClasses(input.value, Number(level))); scheduleFieldSave(field, input); }
      });
    }
    if (['RAÇA', 'ORIGEM', 'CLASSE', 'Lv', 'SeleTamanho'].includes(field.name) || field.name.startsWith('BossBar.Habilidades.') || /^(?:Item\d+|BossBar\.(?:Item\.\d+\.(?:Nome|Quantidade)|Magia\.\d+\.Nome))$/.test(field.name)) input.addEventListener('input', () => {
      queueMicrotask(() => {
        const attributes = sheetEditorFields?.querySelector('.character-attributes-editor');
        if (attributes) {
          const editor = characterAttributesEditor(sheetEditorDocument, refreshAttributeDerivedValues, rollCharacterAttribute);
          attributes.closest('.is-attributes')?.querySelector('.attribute-add-point')?.replaceWith(editor.querySelector('.attribute-add-point')!);
          attributes.closest('.is-attributes')?.querySelector('.attribute-allocation-toolbar')?.replaceWith(editor.querySelector('.attribute-allocation-toolbar')!);
          attributes.replaceWith(editor);
        }
        refreshAttributeDerivedValues();
      });
    });
    if (field.name === 'SeleAtribMagia') input.addEventListener('input', refreshAttributeDerivedValues);
    if (field.name === 'Lv') input.addEventListener('input', () => {
      const classField = sheetEditorDocument.find(({ name }) => name === 'CLASSE');
      if (!classField?.value || classField.value.includes('/')) return;
      classField.value = formatCharacterClasses([{ name: parseCharacterClasses(classField.value)[0].name, level: Number(input.value) || 1 }]);
      const classInput = sheetEditorFields?.querySelector<HTMLInputElement>('[data-field-name="CLASSE"] input'); if (classInput) classInput.value = classField.value;
      refreshAttributeDerivedValues();
    });
    const help = field.name === 'arm pesa'
      ? 'Marcado: soma todo o atributo à Defesa. Desmarcado: aplica o limite informado para armadura pesada.'
      : field.name === 'BossBar.LimiteAtributoDefesa'
        ? 'Máximo do atributo que entra na Defesa quando Atributo completo está desmarcado.'
        : /^BossBar\.Ataque\.\d+\.TesteTotal$/.test(field.name)
          ? 'O teste informado já inclui Luta ou Pontaria. Evita somar a perícia novamente.'
          : /^BossBar\.Ataque\.\d+\.DanoAlternativo$/.test(field.name)
            ? 'Dano da segunda extremidade de uma arma dupla. Deixe vazio para outras armas.'
            : field.name === 'BossBar.Nimb.MagiasAdicionais'
              ? 'Bônus de CD e suas origens, ajustes, referências e outras informações sobre suas magias.'
              : '';
    if (help) {
      const explanation = document.createElement('small');
      explanation.className = 'sheet-field-help';
      explanation.textContent = help;
      label.append(explanation);
      input.title = help;
    }
    const fieldIssues = issuesByField.get(field.name) ?? [];
    if (fieldIssues.length) {
      label.classList.add(fieldIssues.some(({ severity }) => severity === 'error') ? 'has-import-error' : 'has-import-warning');
      const explanation = document.createElement('div');
      explanation.className = 'sheet-field-error';
      explanation.dataset.severity = fieldIssues.some(({ severity }) => severity === 'error') ? 'error' : 'warning';
      for (const issue of fieldIssues) {
        const text = document.createElement('p'); appendRuleText(text, `${issue.reason || issue.message}${issue.expected === undefined ? '' : ` Esperado: ${issue.expected}.`}${issue.autoFixable ? ' Use Validar e corrigir cálculos para recalcular.' : ''}${issue.source ? ' ' + issue.source : ''}`);
        explanation.append(text); appendReferenceComparison(explanation, issue);
      }
      {
        const review = document.createElement('details'); review.className = 'sheet-field-review';
        const summary = document.createElement('summary'); summary.textContent = `Revisar (${fieldIssues.length})`;
        review.append(summary, explanation); label.append(review);
      }
    }
    if (/^Alcance \d+$|\.Segunda\.Alcance$/.test(field.name)) {
      input.hidden = true;
      const select = document.createElement('select');
      select.setAttribute('aria-label', field.label);
      const parsed = parseAttackRange(field.value);
      for (const value of [...new Set([parsed.kind, ...ATTACK_RANGES])]) select.append(new Option(value || 'Selecione', value, false, value === parsed.kind));
      const meters = document.createElement('input');
      meters.type = 'text'; meters.inputMode = 'numeric'; meters.maxLength = 4;
      meters.setAttribute('aria-label', 'Alcance em metros'); meters.value = String(parsed.meters);
      const synchronize = () => {
        meters.hidden = !METRIC_RANGES.includes(select.value);
        if (!meters.hidden && !/^\d{1,4}$/.test(meters.value)) return;
        input.value = meters.hidden ? select.value : `${select.value} ${Math.max(1, Number(meters.value))}m`;
        scheduleFieldSave(field, input);
      };
      meters.hidden = !METRIC_RANGES.includes(parsed.kind);
      select.addEventListener('change', synchronize); meters.addEventListener('input', synchronize);
      const wrapper = document.createElement('span'); wrapper.className = 'attack-range-fields'; wrapper.append(select, meters); label.append(wrapper);
    }
    container.append(label);
  };

  const appendFields = (container: HTMLElement, fields: CharacterSheetEditorField[]) => {
    const paired = new Set<string>();
    for (const field of fields) {
      if (paired.has(field.name)) continue;
      if (field.name === 'CA') {
        const pair = document.createElement('div'); pair.className = 'sheet-field-pair'; appendField(pair, field);
        const control = document.createElement('div'); control.className = 'sheet-rd-control'; control.dataset.fieldName = RD_FIELD;
        const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Redução de dano';
        const rd = sheetEditorDocument.find(({ name }) => name === RD_FIELD);
        button.addEventListener('click', async () => {
          const updated = await openDamageReductionEditor(normalizeDamageReduction(rd?.value));
          if (!updated || !rd) return;
          rd.value = JSON.stringify(updated); sheetEditorIssues = sheetEditorIssues.filter(({ field }) => field !== RD_FIELD);
          markSheetEditorDirty(); renderSheetEditorReview();
          const summary = container.closest('.is-defense')?.querySelector('.sheet-rd-summary');
          if (summary) summary.textContent = damageReductionSummary(updated);
        });
        control.append(button); pair.append(control); container.append(pair); continue;
      }
      const partnerName = field.name === 'SeleAtribMagia' ? 'ModAtribMagia' : field.name === 'SeleTamanho' ? 'ModFurtTam' : field.name === 'Desloc' ? 'BossBar.ManobrasTamanho'
        : field.name === 'BossBar.CdOutros' ? 'TesteResist'
          : /^BossBar\.Ataque\.\d+\.(Segunda\.)?Base$/.test(field.name) ? field.name.replace(/Base$/, 'Ajuste')
          : /\.MargemCritico$/.test(field.name) ? field.name.replace(/MargemCritico$/, 'MultiplicadorCritico')
          : /^BossBar\.Magia\.\d+\.Circulo$/.test(field.name) ? field.name.replace(/Circulo$/, 'Custo') : null;
      const partner = fields.find(({ name }) => name === partnerName);
      if (partner) {
        if (field.name === 'SeleAtribMagia' || /\.(Base|MargemCritico|Circulo)$/.test(field.name)) {
          const magicAttribute = field.name === 'SeleAtribMagia';
          const critical = /\.MargemCritico$/.test(field.name);
          const circle = /\.Circulo$/.test(field.name);
          const captionText = magicAttribute ? 'Atributo-chave' : circle ? 'Círculo' : critical ? 'Crítico' : 'Teste de ataque';
          const composite = document.createElement('div'); composite.className = 'sheet-attack-test';
          if (critical) composite.classList.add('is-critical');
          if (circle) composite.classList.add('is-spell-circle');
          if (magicAttribute) composite.classList.add('is-magic-attribute');
          composite.setAttribute('role', 'group'); composite.setAttribute('aria-label', captionText);
          const caption = document.createElement('span'); caption.className = 'sheet-attack-test-caption'; caption.textContent = captionText;
          const inputs = document.createElement('div'); inputs.className = 'sheet-attack-test-inputs';
          appendField(inputs, field); appendField(inputs, partner);
          if (magicAttribute) {
            inputs.querySelector('select')?.setAttribute('aria-label', 'Atributo-chave de magia');
            inputs.querySelector('input')?.setAttribute('aria-label', 'Valor do atributo-chave de magia, somente leitura');
          } else if (circle) {
            inputs.querySelector('select')?.setAttribute('aria-label', 'Círculo');
            inputs.querySelector('input')?.setAttribute('aria-label', 'Custo-base (PM), somente leitura');
          } else if (critical) {
            const [margin, multiplier] = inputs.querySelectorAll('input');
            margin?.setAttribute('aria-label', 'Margem de crítico');
            multiplier?.setAttribute('aria-label', 'Multiplicador de crítico');
            if (margin) margin.title = 'Margem de crítico (ex.: 19)';
            if (multiplier) multiplier.title = 'Multiplicador de crítico (ex.: ×2)';
          } else {
            inputs.querySelector('input')?.setAttribute('aria-label', 'Base da perícia (somente leitura)');
            const adjustment = inputs.querySelectorAll('input')[1];
            adjustment?.setAttribute('aria-label', 'Ajuste do teste de ataque');
            if (adjustment) adjustment.placeholder = '+1d6 + 3 + 2d2';
          }
          composite.append(caption, inputs); container.append(composite);
        } else {
          const pair = document.createElement('div'); pair.className = 'sheet-field-pair';
          appendField(pair, field); appendField(pair, partner); container.append(pair);
        }
        paired.add(partner.name);
      } else appendField(container, field);
    }
  };
  const orderedSections = [...sections].sort(([left], [right]) =>
    (sheetEditorSectionOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
    (sheetEditorSectionOrder.get(right) ?? Number.MAX_SAFE_INTEGER),
  );
  for (const [sectionName, fields] of orderedSections) {
    const headerFields = new Set<string>();
    const section = document.createElement('section');
    section.className = 'web-player-sheet-editor-section';
    section.dataset.category = sheetEditorCategoryForSection(sectionName);
    const sectionClass = new Map([
      ['Identidade', 'is-identity'],
      ['Atributos', 'is-attributes'],
      ['Perícias', 'is-skills'],
      ['Defesa', 'is-defense'],
      ['Armadura e escudo', 'is-equipment'],
      ['Itens', 'is-items'],
    ]).get(sectionName);
    if (sectionClass) section.classList.add(sectionClass);
    const heading = document.createElement('h2');
    heading.textContent = sectionName;
    if (['Ataques', 'Magias', 'Habilidades', 'Itens', 'Armadura e escudo'].includes(sectionName)) {
      const headingRow = document.createElement('div');
      headingRow.className = 'web-player-sheet-editor-section-heading';
      const controls = document.createElement('div');
      controls.className = 'web-player-sheet-editor-section-actions';
      if (sectionName === 'Magias' || sectionName === 'Habilidades') {
        const catalog = document.createElement('button'); catalog.type = 'button'; catalog.textContent = 'Consultar catálogo';
        catalog.addEventListener('click', () => openRulesCatalog({ kind: sectionName === 'Magias' ? 'spell' : 'ability' })); controls.append(catalog);
      }
      if (sectionName === 'Ataques') {
        const addAttack = document.createElement('button');
        addAttack.type = 'button';
        addAttack.textContent = '+ Adicionar ataque';
        addAttack.disabled = nextEditorGroupIndex(/^Ataque (\d+)$/, 20) === null;
        if (addAttack.disabled) addAttack.dataset.disabledReason = 'Limite de 20 ataques atingido';
        addAttack.addEventListener('click', addAttackEditorRow);
        controls.append(addAttack);
      } else if (sectionName === 'Magias') {
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
      } else if (sectionName === 'Armadura e escudo') {
        for (const kind of ['Armadura', 'Escudo'] as const) {
          const addEquipment = document.createElement('button');
          addEquipment.type = 'button';
          addEquipment.textContent = `+ ${kind}`;
          addEquipment.addEventListener('click', () => addEquipmentEditorRow(kind));
          controls.append(addEquipment);
        }
      }
      const headingContent = document.createElement('div');
      headingContent.className = 'sheet-section-heading-content';
      headingContent.append(heading);
      if (sectionName === 'Armadura e escudo') {
        const penalty = fields.find(({ name }) => name === 'BossBar.PenalidadeArmadura');
        if (penalty) {
          headerFields.add(penalty.name);
          const display = document.createElement('div');
          display.className = 'sheet-heading-values sheet-armor-penalty';
          display.dataset.fieldName = penalty.name;
          const caption = document.createElement('span'); caption.textContent = 'Penalidade total';
          const value = document.createElement('output');
          value.setAttribute('aria-label', 'Penalidade total');
          value.value = Number(penalty.value) ? `−${penalty.value}` : '0';
          display.title = 'Calculada com a armadura e o escudo equipados e seus ajustes.';
          display.tabIndex = 0; attachCalculationTooltip(display, () => sheetCalculationDescription(penalty.name, sheetEditorDocument));
          display.append(caption, value); headingContent.append(display);
        }
      }
      if (sectionName === 'Itens') {
        const currencies = document.createElement('div');
        currencies.className = 'sheet-heading-values sheet-currencies';
        for (const coin of SHEET_COIN_FIELDS) {
          const field = fields.find(({ name }) => name === coin);
          const customName = coin === 'BossBar.MoedaPersonalizada.Quantidade' ? fields.find(({ name }) => name === 'BossBar.MoedaPersonalizada.Nome') : undefined;
          if (!field && !customName) continue;
          const container = document.createElement('div'); container.className = 'sheet-currency';
          if (customName) { container.classList.add('is-custom'); headerFields.add(customName.name); appendField(container, customName); }
          if (field) { headerFields.add(field.name); appendField(container, field); }
          currencies.append(container);
        }
        if (currencies.childElementCount) headingContent.append(currencies);
        const loads = document.createElement('div'); loads.className = 'sheet-heading-values sheet-load-values';
        for (const key of ['CargaTotal', 'CargaMax', 'Levantar']) {
          const field = fields.find(({ name }) => name === key); if (!field) continue; headerFields.add(key);
          if (key !== 'CargaTotal') { appendField(loads, field); continue; }
          const group = document.createElement('div'); group.className = 'sheet-load-composite'; group.dataset.fieldName = key;
          const caption = document.createElement('span'); caption.textContent = 'Carga atual';
          const parts = document.createElement('div'); parts.className = 'sheet-load-parts';
          for (const [part, text] of [['gross', 'Bruta'], ['equipped', 'Equipada'], ['total', 'Real']]) {
            const label = document.createElement('label');
            const input = document.createElement('input'); input.readOnly = true; input.dataset.loadPart = part;
            input.setAttribute('aria-label', `Carga ${text.toLowerCase()}, somente leitura`);
            attachCalculationTooltip(input, () => inventoryCalculationDescription(inventoryFromEditor())); label.append(input); parts.append(label);
          }
          group.append(caption, parts); loads.append(group);
        }
        headingContent.append(loads);
      }
      headingRow.append(headingContent, controls);
      section.append(headingRow);
    } else {
      section.append(heading);
    }

    if (sectionName === 'Perícias') {
      const training = skillTraining(Object.fromEntries(sheetEditorDocument.map(({ name, value }) => [name, value])));
      const row = document.createElement('div'); row.className = 'sheet-skills-heading'; row.dataset.fieldName = SKILL_TRAINING_FIELD;
      heading.replaceWith(row); row.append(heading);
      const summary = document.createElement('span'); summary.className = 'skill-training-summary'; summary.textContent = `${training.selected.length} / ${training.maximum} treinadas${training.sources.some(({ confirmed }) => !confirmed) ? ' · fontes a confirmar' : ''}`;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'sheet-training-button'; button.textContent = 'Fontes de treinamento'; button.setAttribute('aria-label', 'Fontes de treinamento');
      button.addEventListener('click', () => openSkillTrainingEditor(sheetEditorDocument, applyTrainingDraft));
      row.append(summary, button);
    }
    if (sectionName === 'Atributos') {
      const editor = characterAttributesEditor(sheetEditorDocument, refreshAttributeDerivedValues, rollCharacterAttribute);
      const titleRow = document.createElement('div'); titleRow.className = 'sheet-attributes-heading';
      heading.replaceWith(titleRow); titleRow.append(heading, editor.querySelector('.attribute-allocation-toolbar')!, editor.querySelector('.attribute-add-point')!);
      section.append(editor);
      sheetEditorFields.append(section); continue;
    }
    const body = document.createElement('div');
    body.className = 'web-player-sheet-editor-section-body';
    const groups = new Map<string, CharacterSheetEditorField[]>();
    for (const field of fields) {
      if (headerFields.has(field.name)) continue;
      const groupName = field.group ?? '';
      const groupFields = groups.get(groupName) ?? [];
      groupFields.push(field);
      groups.set(groupName, groupFields);
    }
    const orderedGroups = sectionName === 'Ataques'
      ? [...groups].sort(([left], [right]) =>
        Number(left.replace('Ataque ', '')) - Number(right.replace('Ataque ', '')))
      : groups;
    for (const [groupName, groupFields] of orderedGroups) {
      if (!groupName) {
        if (sectionName === 'Defesa') {
          const scroll = document.createElement('div'); scroll.className = 'sheet-defense-scroll';
          scroll.tabIndex = 0; scroll.setAttribute('aria-label', 'Valores de Defesa');
          const row = document.createElement('div'); row.className = 'sheet-defense-row';
          appendFields(row, groupFields.filter(({ name }) => name !== 'BossBar.DefesaJustificativa'));
          scroll.append(row); body.append(scroll);
          separateRowWarnings(row, body, 'na Defesa');
          appendFields(body, groupFields.filter(({ name }) => name === 'BossBar.DefesaJustificativa'));
          const summary = document.createElement('small'); summary.className = 'sheet-rd-summary';
          summary.setAttribute('aria-live', 'polite');
          summary.textContent = damageReductionSummary(normalizeDamageReduction(sheetEditorDocument.find(({ name }) => name === RD_FIELD)?.value));
          body.append(summary);
        } else appendFields(body, groupFields);
        continue;
      }
      const group = document.createElement('article');
      group.className = 'web-player-sheet-editor-group';
      if (sectionName === 'Magias' && /^Magia \d+$/.test(groupName)) {
        group.classList.add('is-spell-row');
      }
      if (/^Item \d+$/.test(groupName)) group.classList.add('is-item-row');
      if (/^Ataque \d+$/.test(groupName)) group.classList.add('is-attack-row');
      if (/^Armadura \d+$/.test(groupName)) group.classList.add('is-armor-row');
      if (/^Escudo \d+$/.test(groupName)) group.classList.add('is-shield-row');
      if (groupName === 'Carga') group.classList.add('is-load-row');
      const groupHeader = document.createElement('header');
      groupHeader.className = 'web-player-sheet-editor-group-heading';
      const groupHeading = document.createElement('h3');
      groupHeading.textContent = groupName;
      groupHeader.append(groupHeading);
      const groupIndex = Number(/(\d+)$/.exec(groupName)?.[1] ?? 0);
      const selectionFields = groupFields.filter(({ name }) => /\.(Equipado|Principal|DuasArmas)$/.test(name));
      for (const selection of selectionFields) appendField(groupHeader, selection);
      if (
        groupIndex > 0 &&
        (group.classList.contains('is-armor-row') || group.classList.contains('is-shield-row'))
      ) {
        group.style.gridRow = String(groupIndex);
      }
      const removable = group.classList.contains('is-spell-row') ||
        (group.classList.contains('is-attack-row') && groupIndex > 2) ||
        (group.classList.contains('is-item-row') && groupIndex > 2) ||
        ((group.classList.contains('is-armor-row') || group.classList.contains('is-shield-row')) && groupIndex > 1);
      if (removable) {
        const removeRow = document.createElement('button');
        removeRow.className = 'web-player-sheet-editor-remove-spell';
        removeRow.type = 'button';
        removeRow.setAttribute('aria-label', `Remover ${groupName}`);
        removeRow.textContent = '×';
        removeRow.addEventListener('click', () => {
          const removedNames = new Set(groupFields.map(({ name }) => name));
          sheetEditorIssues = sheetEditorIssues.filter(({ field }) => !field || !removedNames.has(field));
          sheetEditorRemovedFields.push(...groupFields.map((field) => ({
            ...field,
            value: '',
          })));
          sheetEditorDocument = sheetEditorDocument.filter(
            (field) => field.group !== groupName || field.section !== sectionName,
          );
          if (groupFields.some(({ name }) => affectsInventoryLoad(name))) recalculateSheetLoad();
          renderSheetEditorFields();
          markSheetEditorDirty();
        });
        groupHeader.append(removeRow);
      }
      const trainedField = sectionName === 'Perícias'
        ? groupFields.find(({ kind }) => kind === 'checkbox')
        : undefined;
      const officeField = sectionName === 'Perícias'
        ? groupFields.find(({ name }) => name === 'Ofício 1' || name === 'Ofício_2' || /^BossBar\.Oficio\.\d+\.Nome$/.test(name))
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
        const trained = /^(Yes|Sim|On|true|1)$/i.test(trainedField.value);
        group.classList.toggle('is-trained-skill', trained);
        group.dataset.trainingField = trainedField.name;
        const badge = document.createElement('span'); badge.className = 'sheet-skill-training-badge';
        badge.textContent = 'Treinada'; badge.hidden = !trained;
        groupHeaderControls.append(badge);
      }
      if (groupHeaderControls.childElementCount > 0) groupHeader.append(groupHeaderControls);
      const groupFieldsContainer = document.createElement('div');
      groupFieldsContainer.className = 'web-player-sheet-editor-group-fields';
      const visibleFields = groupFields.filter((field) => field !== trainedField && field !== officeField && !selectionFields.includes(field));
      if (group.classList.contains('is-attack-row')) {
        const scroll = document.createElement('div'); scroll.className = 'sheet-weapon-scroll';
        scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', `Armas do ${groupName}`); scroll.tabIndex = 0;
        const primary = document.createElement('div'); primary.className = 'sheet-weapon-row';
        primary.setAttribute('role', 'group'); primary.setAttribute('aria-label', 'Primeira arma');
        const orderWeaponFields = (fields: CharacterSheetEditorField[]) => {
          const origin = fields.find(({ name }) => /\.Origem$/.test(name));
          const ordered = fields.filter((field) => field !== origin);
          if (origin) { origin.label = 'Origem'; ordered.splice(ordered.findIndex(({ name }) => /^Dano \d+$|\.Dano$/.test(name)) + 1, 0, origin); }
          return ordered;
        };
        appendFields(primary, orderWeaponFields(visibleFields.filter(({ name }) => !/\.Segunda\.|\.Informacoes$/.test(name))));
        scroll.append(primary);
        const secondary = orderWeaponFields(visibleFields.filter(({ name }) => /\.Segunda\./.test(name)));
        if (secondary.length) {
          const row = document.createElement('div'); row.className = 'sheet-weapon-row is-secondary-weapon';
          row.setAttribute('role', 'group'); row.setAttribute('aria-label', 'Segunda arma');
          appendFields(row, secondary); scroll.append(row);
        }
        groupFieldsContainer.append(scroll);
        separateRowWarnings(scroll, groupFieldsContainer, 'neste ataque');
        appendFields(groupFieldsContainer, visibleFields.filter(({ name }) => /\.Informacoes$/.test(name)));
      } else if (group.classList.contains('is-spell-row')) {
        const scroll = document.createElement('div'); scroll.className = 'sheet-spell-scroll'; scroll.tabIndex = 0;
        scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', `Dados da ${groupName}`);
        const row = document.createElement('div'); row.className = 'sheet-spell-row';
        appendFields(row, visibleFields.filter(({ name }) => !/\.Efeito$/.test(name)));
        scroll.append(row); groupFieldsContainer.append(scroll);
        separateRowWarnings(row, groupFieldsContainer, 'nesta magia');
        appendFields(groupFieldsContainer, visibleFields.filter(({ name }) => /\.Efeito$/.test(name)));
        const currentName = groupFields.find(({ name }) => /\.Nome$/.test(name))?.value ?? '';
        const reference = findSpell(currentName);
        const referenceButton = document.createElement('button'); referenceButton.type = 'button'; referenceButton.className = 'sheet-catalog-reference';
        referenceButton.textContent = 'Consultar magia';
        if (reference) { const citation = document.createElement('span'); citation.className = 'sheet-catalog-reference'; appendRuleText(citation, sourceCitation(reference)); groupHeader.append(citation); }
        referenceButton.addEventListener('click', () => openRulesCatalog({ kind: 'spell', query: currentName, referenceId: reference?.id }));
        groupHeader.insertBefore(referenceButton, groupHeader.querySelector('.web-player-sheet-editor-remove-spell'));
      } else if (group.classList.contains('is-armor-row') || group.classList.contains('is-shield-row')) {
        const stats = visibleFields.filter(({ name }) => ['B.Arm1', 'B.Esc2', 'Pa', 'Pe'].includes(name) || /\.(LimiteAtributo|Defesa|Penalidade|OutrosDefesa|OutrosPenalidade)$/.test(name));
        appendFields(groupFieldsContainer, visibleFields.filter((field) => !stats.includes(field)));
        const scroll = document.createElement('div'); scroll.className = 'sheet-equipment-stats-scroll'; scroll.tabIndex = 0;
        scroll.setAttribute('role', 'region'); scroll.setAttribute('aria-label', `Valores de ${groupName}`);
        const row = document.createElement('div'); row.className = 'sheet-equipment-stats';
        appendFields(row, stats); scroll.append(row); groupFieldsContainer.append(scroll);
        separateRowWarnings(row, groupFieldsContainer, 'neste equipamento');
      } else {
        appendFields(groupFieldsContainer, visibleFields);
        if (group.classList.contains('is-item-row')) {
          const label = document.createElement('label'); const title = document.createElement('span'); title.textContent = 'Carga Total';
          const total = document.createElement('input'); total.readOnly = true; total.dataset.itemTotal = String(groupIndex); total.setAttribute('aria-label', `Carga Total do Item ${groupIndex}`);
          attachCalculationTooltip(total, () => {
            const item = inventoryFromEditor().items.find(({ index }) => index === groupIndex);
            return item ? `${item.name}: ${item.quantity} unidade(s) × ${Number.isFinite(item.spaces) ? item.spaces : '?'} espaço(s) = ${total.value}.\n${item.exempt} unidade(s) equipada(s); ${item.carried} unidade(s) contam na carga real.` : 'Item vazio: carga 0.';
          }); label.append(title, total); groupFieldsContainer.append(label);
        }
      }
      group.append(groupHeader, groupFieldsContainer);
      if (group.classList.contains('is-item-row')) {
        const badge = document.createElement('small'); badge.className = 'sheet-item-equipped'; badge.dataset.itemIndex = String(groupIndex); badge.hidden = true; groupHeading.append(badge);
      }
      body.append(group);
    }
    section.append(body);
    sheetEditorFields.append(section);
  }
  refreshEquipmentLoadBadges();
};

sheetEditorSearch?.addEventListener('input', renderSheetEditorFields);
renderSheetEditorFilters();
const saveAndCloseSheetEditor = async () => {
  automaticSheetValidation.cancel();
  if (sheetEditorClosing) return;
  if(automaticSheetProposals.size){
    const selected=await confirmExpectedSheetValues([...automaticSheetProposals.values()]);
    for(const issue of selected){const field=sheetEditorDocument.find(f=>f.name===issue.field);if(field)field.value=issue.expected!;}
    const selectedIds=new Set(selected.map(i=>i.id));sheetEditorIssues=sheetEditorIssues.filter(i=>!selectedIds.has(i.id));automaticSheetProposals.clear();
  }
  const invalidInput = sheetEditorFields?.querySelector<
    HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  >(':invalid');
  if (invalidInput) {
    invalidInput.reportValidity();
    invalidInput.focus();
    if (sheetEditorStatus) sheetEditorStatus.textContent = invalidInput.validationMessage;
    return;
  }
  if (sheetEditorIssues.some(({ severity }) => severity === 'error')) {
    activeSheetEditorCategories.clear();
    if (sheetEditorSearch instanceof HTMLInputElement) sheetEditorSearch.value = '';
    renderSheetEditorFields();
    scrollSheetFieldIntoView(sheetEditorFields?.querySelector<HTMLElement>('.has-import-error'));
    notifyPlayer('Corrija os campos destacados em vermelho antes de salvar.', 'rejected');
    return;
  }
  sheetEditorClosing = true;
  sheetEditorClose?.setAttribute('disabled', '');
  document.getElementById('web-player-sheet-editor-save')?.setAttribute('disabled', '');
  if (sheetEditorStatus) {
    sheetEditorStatus.textContent = sheetEditorDirty
      ? 'Salvando ajustes…'
      : 'Fechando ficha…';
  }
  try {
    await automaticSheetValidation.cancelAndWait();
    if (sheetEditorDirty || sheetEditorImportPending) {
      const result = await saveCharacterSheetEditor([
        ...sheetEditorDocument,
        ...sheetEditorRemovedFields,
      ]);
      if (!result.ok) {
        if (result.issues) {
          sheetEditorIssues = result.issues;
          activeSheetEditorCategories.clear();
          if (sheetEditorSearch instanceof HTMLInputElement) sheetEditorSearch.value = '';
          renderSheetEditorFields();
          scrollSheetFieldIntoView(sheetEditorFields?.querySelector<HTMLElement>('.has-import-error'));
        }
        throw new Error(result.error ?? 'Não foi possível enviar as alterações da ficha.');
      }
      if (result.document) {
        sheetEditorImportPending = false;
        sheetEditorIssues = result.document.issues ?? [];
        sheetEditorBaseDocument = cloneSheetEditorFields(result.document.fields);
        sheetEditorDocument = cloneSheetEditorFields(result.document.fields);
      }
    } else {
      const result = await setCharacterSheetEditorOpen(false);
      if (!result.ok) {
        throw new Error(result.error ?? 'Não foi possível fechar a edição da ficha.');
      }
    }
    if (pendingPortraitFile !== undefined) {
      const portraitResult = pendingPortraitFile ? await uploadCharacterPortrait(pendingPortraitFile) : await removeCharacterPortrait();
      if (!portraitResult.ok) throw new Error(portraitResult.error || 'A ficha foi enviada, mas não foi possível salvar o retrato. Tente salvar novamente.');
      pendingPortraitFile = undefined; releasePendingPortraitPreview();
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
    notifyPlayer(error instanceof Error ? error.message : 'Não foi possível concluir a edição da ficha.', 'rejected');
  } finally {
    sheetEditorClosing = false;
    sheetEditorClose?.removeAttribute('disabled');
    document.getElementById('web-player-sheet-editor-save')?.removeAttribute('disabled');
  }
};
const discardAndCloseSheetEditor = async () => {
  if (sheetEditorClosing) return;
  automaticSheetValidation.cancel();
  sheetEditorClosing = true;
  try {
    await automaticSheetValidation.cancelAndWait();
    const result = sheetEditorImportPending ? await discardCharacterSheetImport() : await setCharacterSheetEditorOpen(false);
    if (!result.ok) throw new Error(result.error || 'Não foi possível encerrar a edição.');
    sheetEditorDocument = cloneSheetEditorFields(sheetEditorBaseDocument);
    sheetEditorRemovedFields = []; sheetEditorIssues = []; sheetEditorDirty = false; sheetEditorImportPending = false;
    pendingPortraitFile = undefined; releasePendingPortraitPreview(); renderPortraitEditor();
    clearSheetEditorDraft(); sheetEditorDialog?.setAttribute('hidden', '');
    renderCharacterSheet(getPlayerToolsState().sheet);
  } catch (error) { if (sheetEditorStatus) sheetEditorStatus.textContent = error instanceof Error ? error.message : 'Erro inesperado ao fechar a ficha.'; }
  finally { sheetEditorClosing = false; }
};
sheetEditorClose?.addEventListener('click', () => void discardAndCloseSheetEditor());
document.getElementById('web-player-sheet-editor-discard')?.addEventListener('click', () => void discardAndCloseSheetEditor());
document.getElementById('web-player-sheet-editor-save')?.addEventListener('click', () => void saveAndCloseSheetEditor());
const confirmExpectedSheetValues = (issues: CharacterSheetIssue[]) => new Promise<CharacterSheetIssue[]>((resolve) => {
  const popup = sheetEditorPopup('Revisar valores esperados');
  const help = document.createElement('p'); help.textContent = 'Estes valores vêm da referência do livro. PV e PM consideram apenas a progressão básica; poderes, raça e exceções podem justificar a ficha. Magias podem usar aprimoramentos ou ajustes da mesa. Selecione apenas as substituições que deseja aplicar ao rascunho.'; popup.body.append(help);
  const chosen = new Set(issues);
  for (const issue of issues) {
    const row = document.createElement('label'); row.className = 'sheet-expected-proposal';
    const check = document.createElement('input'); check.type = 'checkbox'; check.checked = true;
    check.addEventListener('change', () => { if (check.checked) chosen.add(issue); else chosen.delete(issue); });
    const text = document.createElement('span'); const title = document.createElement('strong'); title.textContent = `${issue.location}: ${issue.actual || 'vazio'} → ${issue.expected}`;
    const reason = document.createElement('small'); appendRuleText(reason, `${issue.reason || issue.message}${issue.source ? ' ' + issue.source : ''}`); text.append(title, reason); row.append(check, text); popup.body.append(row);
  }
  let accepted = false;
  const keep = popup.actions.querySelector('button')!; keep.textContent = 'Manter valores atuais';
  const apply = document.createElement('button'); apply.type = 'button'; apply.textContent = 'Aplicar valores selecionados'; apply.addEventListener('click', () => { accepted = true; popup.close(); }); popup.actions.append(apply);
  popup.dialog.addEventListener('close', () => resolve(accepted ? [...chosen] : []), { once: true });
});
const automaticSheetProposals = new Map<string, CharacterSheetIssue>();
const automaticSheetValidation = new SheetAutoValidation<CharacterSheetEditorField[]>({
  validate: async (snapshot) => {
    const result = await saveCharacterSheetEditor(snapshot, true);
    if (!result.ok || !result.document) throw new Error(result.error || 'Erro inesperado na validação automática.');
    return () => {
      if (sheetEditorClosing || !sheetEditorImportPending || sheetEditorDialog?.hasAttribute('hidden')) return;
      const blank = snapshot.some((f) => f.name === RESOURCE_AUTO_FIELD && f.value);
      const original = new Map(snapshot.map((f) => [f.name, f]));
      const corrected = cloneSheetEditorFields(result.document!.fields);
      automaticSheetProposals.clear();
      for (const field of corrected) {
        const old = original.get(field.name);
        const calculated=field.section==='Perícias'&&['Total','Atributo','Treino','1/2 do nível'].includes(field.label)||/^ModAtrib|^BossBar\.Ataque\.\d+\.(Segunda\.)?Base$|^BossBar\.Magia\.\d+\.Custo$/.test(field.name)||['CA','B.Arm','B.Esc','ModFurtTam','BossBar.ManobrasTamanho','CargaTotal','TesteResist'].includes(field.name);
        if (!blank && !calculated && old?.value.trim() && old.value !== field.value && ![ATTRIBUTE_PLAN_FIELD, SKILL_TRAINING_FIELD, SKILL_EFFECTS_FIELD].includes(field.name) && !field.name.startsWith('Mar Trei ') && !/\.Treinada$/.test(field.name)) {
          const issue: CharacterSheetIssue = { id: 'automatic-review:' + field.name, severity: 'warning', field: field.name, autoFixable: false, dismissible: false, actual: old.value, expected: field.value, message: `${field.label}: o cálculo propõe ${field.value}; o valor ${old.value} foi preservado. Revise a substituição em Validar e corrigir cálculos.` };
          automaticSheetProposals.set(field.name, issue); field.value = old.value;
        }
      }
      const active = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>('[data-field-name]')?.dataset.fieldName : undefined;
      const selection = document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'text' ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : undefined;
      sheetEditorDocument = corrected;
      sheetEditorIssues = [...(result.document!.issues ?? []), ...automaticSheetProposals.values()];
      sheetEditorDirty = true;
      renderSheetEditorFields();
      if (active) { const input = sheetEditorFields?.querySelector<HTMLInputElement>(`[data-field-name="${CSS.escape(active)}"] input, [data-field-name="${CSS.escape(active)}"] select`); input?.focus({ preventScroll: true }); if (input instanceof HTMLInputElement && input.type === 'text' && selection) input.setSelectionRange(selection[0], selection[1]); }
      if (sheetEditorStatus) sheetEditorStatus.textContent = automaticSheetProposals.size ? 'Cálculos conferidos. Revise as substituições propostas antes de salvar.' : 'Cálculos atualizados automaticamente no rascunho. Salve quando terminar.';
    };
  },
  error: (error) => { if (sheetEditorStatus) sheetEditorStatus.textContent = `${error instanceof Error ? error.message : 'Erro inesperado na validação automática.'} Use Validar e corrigir cálculos para tentar novamente.`; },
});
const scheduleAutomaticSheetValidation = () => {
  if (!sheetEditorImportPending || sheetEditorClosing || sheetEditorDialog?.hasAttribute('hidden')) { automaticSheetValidation.cancel(); return; }
  const snapshot = cloneSheetEditorFields([...sheetEditorDocument, ...sheetEditorRemovedFields]);
  if (!sheetReadyForAutomaticValidation(Object.fromEntries(snapshot.map((f) => [f.name, f.value])))) { automaticSheetValidation.cancel(); return; }
  automaticSheetValidation.schedule(snapshot, sheetEditorCharacterId + JSON.stringify(snapshot.map((f) => [f.name, f.value])));
};
document.getElementById('web-player-sheet-import-autofix')?.addEventListener('click', async () => {
  if (sheetEditorClosing) return;
  automaticSheetValidation.cancel();
  sheetEditorClosing = true;
  sheetEditorClose?.setAttribute('disabled', '');
  document.getElementById('web-player-sheet-import-autofix')?.setAttribute('disabled', '');
  document.getElementById('web-player-sheet-editor-save')?.setAttribute('disabled', '');
  if (sheetEditorFields) sheetEditorFields.inert = true;
  try {
    await automaticSheetValidation.cancelAndWait();
    let result = await saveCharacterSheetEditor([...sheetEditorDocument, ...sheetEditorRemovedFields], true);
    if (!result.ok || !result.document) throw new Error(result.error ?? 'Houve um erro inesperado ao validar a ficha.');
    for (const issue of automaticSheetProposals.values()) { const field = result.document.fields.find((f) => f.name === issue.field); if (field) field.value = issue.actual ?? field.value; }
    const proposals = [...automaticSheetProposals.values(), ...(result.document.issues ?? [])].filter((issue) => issue.severity === 'warning' && !issue.autoFixable && issue.field && issue.expected !== undefined && result.document!.fields.some((field) => field.name === issue.field));
    if (proposals.length) {
      const selected = await confirmExpectedSheetValues(proposals);
      const declined=proposals.filter(issue=>!selected.includes(issue));
      if (selected.length) {
        const updated = cloneSheetEditorFields(result.document.fields);
        for (const issue of selected) updated.find(({ name }) => name === issue.field)!.value = issue.expected!;
        result = await saveCharacterSheetEditor([...updated, ...sheetEditorRemovedFields], true);
        if (!result.ok || !result.document) throw new Error(result.error ?? 'Não foi possível validar os valores escolhidos.');
      }
      for(const issue of declined){const field=result.document!.fields.find(f=>f.name===issue.field);if(field&&issue.actual!==undefined)field.value=issue.actual;}
    }
    const kept = [...automaticSheetProposals.values()].filter((issue) => result.document!.fields.some((f) => f.name === issue.field && f.value === issue.actual));
    automaticSheetProposals.clear();
    sheetEditorIssues = [...(result.document!.issues ?? []), ...kept];
    sheetEditorDocument = cloneSheetEditorFields(result.document!.fields);
    markSheetEditorDirty();
    const remainingErrors = sheetEditorIssues.some(({ severity }) => severity === 'error');
    const message = remainingErrors
      ? 'Os cálculos identificados foram corrigidos no rascunho. Revise os erros destacados; faltam dados ou há valores que exigem sua decisão. Se não conseguir resolvê-los, recrie a ficha usando a ficha vazia de Nimb.'
      : 'Validação concluída. Revise as alterações e os avisos antes de salvar.';
    if (sheetEditorStatus) sheetEditorStatus.textContent = message;
    notifyPlayer(message, remainingErrors ? 'rejected' : 'info');
  } catch (error) {
    const message = `${error instanceof Error ? error.message : 'Houve um erro inesperado ao corrigir a ficha.'} Revise os campos informados. Se o problema persistir, recrie a ficha usando a ficha vazia de Nimb.`;
    if (sheetEditorStatus) sheetEditorStatus.textContent = message;
    notifyPlayer(message, 'rejected');
  } finally {
    sheetEditorClosing = false;
    sheetEditorClose?.removeAttribute('disabled');
    if (sheetEditorFields) sheetEditorFields.inert = false;
    document.getElementById('web-player-sheet-editor-save')?.removeAttribute('disabled');
    renderSheetEditorFields();
  }
});
document.getElementById('web-player-sheet-import-discard')?.addEventListener('click', () => {
  if (!sheetEditorImportPending || sheetEditorClosing) return;
  sheetEditorClosing = true;
  void automaticSheetValidation.cancelAndWait().then(() => discardCharacterSheetImport()).then((result) => {
    if (!result.ok) { notifyPlayer(result.error ?? 'Não foi possível descartar a importação.', 'rejected'); return; }
    sheetEditorImportPending = false; sheetEditorIssues = []; sheetEditorDirty = false;
    clearSheetEditorDraft(); sheetEditorDialog?.setAttribute('hidden', '');
    renderCharacterSheet(result.sheet ?? null);
  }).catch(() => notifyPlayer('Não foi possível descartar a importação.', 'rejected')).finally(() => { sheetEditorClosing = false; });
});

const openSheetEditor = async (focusField?: string) => {
  automaticSheetValidation.cancel(); automaticSheetProposals.clear();
  if (sheetOpenButton?.hasAttribute('disabled')) return;
  sheetOpenButton?.setAttribute('disabled', '');
  if (sheetStatusElement) sheetStatusElement.textContent = 'Abrindo editor da ficha…';
  await automaticSheetValidation.cancelAndWait();
  await getCharacterSheetEditor().then(async (result) => {
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
    sheetEditorImportPending = result.document.importPending === true;
    sheetEditorIssues = result.document.issues ?? [];
    document.getElementById('web-player-sheet-import-discard')?.toggleAttribute('hidden', !sheetEditorImportPending);
    if (sheetEditorIssues.some(({ severity }) => severity === 'error')) activeSheetEditorCategories.clear();
    sheetEditorBaseDocument = cloneSheetEditorFields(result.document.fields);
    sheetEditorCharacterId = result.document.characterId ?? '';
    clearSheetEditorDraft();
    sheetEditorRemovedFields = [];
    sheetEditorDocument = cloneSheetEditorFields(result.document.fields);
    sheetEditorDirty = false;
    pendingPortraitFile = undefined; releasePendingPortraitPreview();
    if (sheetEditorSearch instanceof HTMLInputElement) sheetEditorSearch.value = '';
    sheetEditorDialog?.removeAttribute('hidden');
    syncPermanentEncounterValuesIntoSheetEditor();
    renderSheetEditorFields();
    renderPortraitEditor();
    if (sheetEditorStatus) {
      sheetEditorStatus.textContent = 'Alterações só são enviadas ao clicar em Salvar e fechar.';
    }
    sheetDialog?.setAttribute('hidden', '');
    scheduleAutomaticSheetValidation();
    if (focusField) focusSheetEditorField(focusField);
  }).catch((error: unknown) => {
    if (sheetStatusElement) {
      sheetStatusElement.textContent = error instanceof Error
        ? error.message
        : 'Houve um erro inesperado ao abrir o editor da ficha.';
    }
  }).finally(() => {
    sheetOpenButton?.removeAttribute('disabled');
    renderCharacterSheet(getPlayerToolsState().sheet);
  });
};
sheetOpenButton?.addEventListener('click', () => void openSheetEditor());
document.getElementById('web-player-sheet-create')?.addEventListener('click', async (event) => {
  const button = event.currentTarget as HTMLButtonElement; button.disabled = true;
  try {
    const result = await createCharacterSheet();
    if (!result.ok) throw new Error(result.error || 'Não foi possível criar a ficha.');
    renderCharacterSheet(result.sheet ?? null); await openSheetEditor();
  } catch (error) { if (sheetStatusElement) sheetStatusElement.textContent = error instanceof Error ? error.message : 'Erro inesperado ao criar a ficha.'; }
  finally { button.disabled = false; }
});
document.getElementById('web-player-sheet-export')?.addEventListener('click', async (event) => {
  const button = event.currentTarget as HTMLButtonElement; button.disabled = true;
  try {
    const blob = await exportCharacterSheet(); const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url;
    link.download = `${getPlayerToolsState().sheet?.validation?.summary.characterName || 'Sem nome'}.pdf`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) { if (sheetStatusElement) sheetStatusElement.textContent = error instanceof Error ? error.message : 'Erro inesperado ao exportar a ficha.'; }
  finally { button.disabled = false; }
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
    if (sheetInput instanceof HTMLInputElement) sheetInput.value = '';
    void renderCharacterSlots();
    if (sheetStatusElement) sheetStatusElement.textContent = 'Ficha removida desta aba.';
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
  void openSheetEditor();
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

  if (hideStatusTimer) clearTimeout(hideStatusTimer);
  unmountPlayer?.();
  dispose();
}, { once: true });
