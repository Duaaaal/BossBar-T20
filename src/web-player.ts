import {
  createWebPlayerApi,
  type WebPlayerConnectionState,
} from './web-player-api';
import {
  MAX_CHARACTER_SHEET_BYTES,
  type PlayerCharacterSheetStatus,
} from './shared/character-sheet';
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
const passwordConfirmInput = document.getElementById('web-player-password-confirm');
const passwordConfirmLabel = document.getElementById('web-player-password-confirm-label');
const confirmMessageElement = document.getElementById('web-player-confirm-message');
const authErrorElement = document.getElementById('web-player-auth-error');
const nameConfirmElement = document.getElementById('web-player-name-confirm');
const confirmedNameElement = document.getElementById('web-player-confirmed-name');
const nameBackButton = document.getElementById('web-player-name-back');
const nameSubmitButton = document.getElementById('web-player-name-submit');
const pendingElement = document.getElementById('web-player-pending');
const pendingTitleElement = document.getElementById('web-player-pending-title');
const pendingMessageElement = document.getElementById('web-player-pending-message');
const changeNameButton = document.getElementById('web-player-change-name');
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
const sheetRemoveConfirmButton = document.getElementById('web-player-sheet-remove-confirm-button');
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
const characterHealthValue = document.getElementById('web-player-character-health-value');
const characterManaFill = document.getElementById('web-player-character-mana-fill');
const characterManaValue = document.getElementById('web-player-character-mana-value');
const characterDefenseMelee = document.getElementById('web-player-character-defense-melee');
const characterDefenseRanged = document.getElementById('web-player-character-defense-ranged');
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
const notesClearConfirmButton = document.getElementById('web-player-notes-clear-confirm-button');
const notesStatusElement = document.getElementById('web-player-notes-status');
let hideStatusTimer: ReturnType<typeof setTimeout> | null = null;
let playerMounted = false;
let sessionReady = false;
let sessionClosed = false;
let unmountPlayer: (() => void) | null = null;
let creatingAccount = false;
let authenticating = false;
let notesDocument: PlayerNotesDocument = createPlayerNotesDocument();
let playerEncounterState: PlayerEncounterState | null = null;
let selfHudId: string | null = null;
let activeTurnParticipantId: string | null = null;

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
  leave,
  dispose,
  socket,
  uploadCharacterSheet,
  automaticallyFixCharacterSheet,
  fetchCharacterSheetBlob,
  createCharacterSheetViewUrl,
  removeCharacterSheet,
  saveNotes,
  setCharacterPrivate,
  usePlayerAction,
  getPlayerToolsState,
} = createWebPlayerApi({
  onConnectionState: showConnectionState,
  onPlayerState: (state) => {
    playerEncounterState = state;
    renderCharacterSheet(getPlayerToolsState().sheet);
  },
  onPlayerCombatImpact: (impact) => {
    playerEncounterState = impact.playerState;
    renderCharacterSheet(getPlayerToolsState().sheet);
    showReflexResult(impact);
  },
  onSessionReady: () => {
    sessionReady = true;
    mountPlayer();
    toolsElement?.removeAttribute('hidden');
    renderCharacterSheet(getPlayerToolsState().sheet);
    notesDocument = parsePlayerNotesDocument(getPlayerToolsState().notes);
    renderNotesEditor();
    queueMicrotask(() => {
      void api.getState().then((state) => {
        changeNameButton?.toggleAttribute(
          'hidden',
          !socket?.connected || state.battleStarted,
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
      button.dataset.appTooltip = ready
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
  sheetOpenButton?.toggleAttribute('disabled', !sheet?.hasSheet);
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
  const currentHealth = playerEncounterState?.currentHealth ?? summary.currentHealth;
  const maxHealth = playerEncounterState?.maxHealth ?? summary.maxHealth;
  const currentMana = playerEncounterState?.currentMana ?? summary.currentMana;
  const maxMana = playerEncounterState?.maxMana ?? summary.maxMana;
  const temporaryDefenseBonus = playerEncounterState?.temporaryDefenseBonus ?? 0;
  const statusDefenses = playerEncounterState
    ? deriveStatusAttributes({
      attack: 0,
      rangedAttack: 0,
      skills: 0,
      meleeDefense: playerEncounterState.defenseMelee,
      rangedDefense: playerEncounterState.defenseRanged,
      damageReduction: 0,
      shield: 0,
    }, playerEncounterState.statuses)
    : null;
  const defenseMelee = statusDefenses
    ? statusDefenses.values.meleeDefense + temporaryDefenseBonus
    : defenses.melee;
  const defenseRanged = statusDefenses
    ? statusDefenses.values.rangedDefense + temporaryDefenseBonus
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
    const defense = document.createElement('span');
    defense.className = 'web-player-character-detail-defense';
    const meleeIcon = document.createElement('img');
    meleeIcon.src = '/session-assets/ui/defense-melee.png';
    meleeIcon.alt = 'Corpo a corpo';
    const rangedIcon = document.createElement('img');
    rangedIcon.src = '/session-assets/ui/defense-ranged.png';
    rangedIcon.alt = 'À distância';
    const meleeValue = document.createElement('b');
    meleeValue.textContent = `${defenseMelee ?? '—'}`;
    meleeValue.className = defenseMelee !== null && defenses.melee !== null
      ? defenseMelee > defenses.melee ? 'is-bonus' : defenseMelee < defenses.melee ? 'is-penalty' : ''
      : '';
    const rangedValue = document.createElement('b');
    rangedValue.textContent = `${defenseRanged ?? '—'}`;
    rangedValue.className = defenseRanged !== null && defenses.ranged !== null
      ? defenseRanged > defenses.ranged ? 'is-bonus' : defenseRanged < defenses.ranged ? 'is-penalty' : ''
      : '';
    defense.append('Defesa: ', meleeIcon, meleeValue, ' / ', rangedIcon, rangedValue);
    vitalSummary.append(health, mana, defense);
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

sheetOpenButton?.addEventListener('click', () => {
  if (sheetOpenButton.hasAttribute('disabled')) return;
  const previewWindow = window.open('', '_blank');
  if (!previewWindow) {
    if (sheetStatusElement) {
      sheetStatusElement.textContent = 'O navegador bloqueou a abertura da ficha. Permita pop-ups para esta página.';
    }
    return;
  }
  previewWindow.opener = null;
  sheetOpenButton.setAttribute('disabled', '');
  if (sheetStatusElement) sheetStatusElement.textContent = 'Liberando acesso à ficha…';
  void createCharacterSheetViewUrl().then((url) => {
    previewWindow.location.replace(url);
    renderCharacterSheet(getPlayerToolsState().sheet);
  }).catch((error: unknown) => {
    previewWindow.close();
    if (sheetStatusElement) {
      sheetStatusElement.textContent = error instanceof Error
        ? error.message
        : 'Não foi possível liberar o acesso à ficha.';
    }
  }).finally(() => {
    sheetOpenButton.removeAttribute('disabled');
  });
  if (previewWindow.closed && sheetStatusElement) {
    sheetStatusElement.textContent = 'O navegador bloqueou a abertura da ficha. Permita pop-ups para esta página.';
  }
});

sheetRemoveButton?.addEventListener('click', () => {
  sheetRemoveDialog?.removeAttribute('hidden');
  sheetRemoveCancelButton?.focus();
});
sheetRemoveCancelButton?.addEventListener('click', () => {
  sheetRemoveDialog?.setAttribute('hidden', '');
});
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

const prepareAuthentication = (createRequested: boolean) => {
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
    if (createRequested === status.exists) {
      showConnectionState({
        state: 'error',
        message: createRequested
          ? 'Este usuário já existe. Use Entrar.'
          : 'Usuário ainda não cadastrado. Use Criar acesso.',
      });
      return;
    }
    creatingAccount = createRequested;
    if (confirmedNameElement) confirmedNameElement.textContent = status.username;
    if (confirmMessageElement) {
      confirmMessageElement.textContent = creatingAccount
        ? 'Este usuário ainda não existe. Confirme a senha para criá-lo como'
        : 'Você entrará no encontro como';
    }
    passwordConfirmLabel?.toggleAttribute('hidden', !creatingAccount);
    if (passwordConfirmInput instanceof HTMLInputElement) {
      passwordConfirmInput.value = '';
      passwordConfirmInput.required = creatingAccount;
    }
    authErrorElement?.setAttribute('hidden', '');
    joinElement?.setAttribute('hidden', '');
    nameConfirmElement?.removeAttribute('hidden');
    if (creatingAccount) passwordConfirmInput?.focus();
    else nameSubmitButton?.focus();
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
  prepareAuthentication(false);
});

createAccessButton?.addEventListener('click', () => prepareAuthentication(true));

nameBackButton?.addEventListener('click', () => {
  nameConfirmElement?.setAttribute('hidden', '');
  joinElement?.removeAttribute('hidden');
  nameInput?.focus();
  authErrorElement?.setAttribute('hidden', '');
});

nameSubmitButton?.addEventListener('click', () => {
  if (
    !(nameInput instanceof HTMLInputElement) ||
    !(passwordInput instanceof HTMLInputElement) ||
    authenticating
  ) return;
  if (
    creatingAccount &&
    (!(passwordConfirmInput instanceof HTMLInputElement) ||
      passwordConfirmInput.value !== passwordInput.value)
  ) {
    if (authErrorElement) {
      authErrorElement.textContent = 'As senhas não coincidem.';
      authErrorElement.removeAttribute('hidden');
    }
    passwordConfirmInput?.focus();
    return;
  }
  authenticating = true;
  nameSubmitButton.setAttribute('disabled', '');
  const submit = joinForm?.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submit) submit.disabled = true;
  createAccessButton?.setAttribute('disabled', '');
  authErrorElement?.setAttribute('hidden', '');
  void connect(nameInput.value, passwordInput.value, creatingAccount).then((result) => {
    if (!result.ok) {
      if (authErrorElement) {
        authErrorElement.textContent = result.error ?? 'Não foi possível entrar.';
        authErrorElement.removeAttribute('hidden');
      }
      return;
    }
    nameInput.readOnly = true;
    passwordInput.value = '';
    if (passwordConfirmInput instanceof HTMLInputElement) passwordConfirmInput.value = '';
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
  const canChangeName = sessionReady && socket?.connected && !state.battleStarted;
  changeNameButton.toggleAttribute('hidden', !canChangeName);
});

changeNameButton?.addEventListener('click', () => {
  leave();
  sessionReady = false;
  playerEncounterState = null;
  characterHud?.setAttribute('hidden', '');
  toolsElement?.setAttribute('hidden', '');
  changeNameButton.setAttribute('hidden', '');
  pendingElement?.setAttribute('hidden', '');
  nameConfirmElement?.setAttribute('hidden', '');
  joinElement?.removeAttribute('hidden');
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

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!notesClearDialog?.hasAttribute('hidden')) notesClearCancelButton?.click();
  else if (!sheetRemoveDialog?.hasAttribute('hidden')) sheetRemoveCancelButton?.click();
  else if (!sheetDialog?.hasAttribute('hidden')) sheetCloseButton?.click();
  else if (!nameConfirmElement?.hasAttribute('hidden')) nameBackButton?.click();
});

window.addEventListener('beforeunload', () => {
  if (hideStatusTimer) clearTimeout(hideStatusTimer);
  unmountPlayer?.();
  dispose();
}, { once: true });
