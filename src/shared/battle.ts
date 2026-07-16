import {
  getActiveStatusName,
  getStatusDefinition,
  isStatusId,
  normalizeDamageFormula,
  parseDamageFormula,
  rollDamageFormula,
  type ActiveBossStatus,
  type StatusId,
} from './status.ts';

export type BossState = {
  id: string;
  setupStatus: 'initial' | 'pending' | 'ready';
  identityPrepared: boolean;
  actionPrepared: boolean;
  bossName: string;
  controlAmount: string;
  applyDamageReduction: boolean;
  maxHealth: number;
  currentHealth: number;
  attack: number;
  rangedAttack: number;
  defense: number;
  shield: number;
  skills: number;
  damageReduction: number;
  nextAction: string;
  actionSeverity: 'normal' | 'grave';
  turnCount: number;
  activeStatuses: ActiveBossStatus[];
};

export type BattleState = {
  bosses: BossState[];
  activeBossId: string;
  battleStarted: boolean;
  hudVisible: boolean;
  backgroundName: string | null;
  revision: number;
};

export type BackgroundState = {
  url: string | null;
  name: string | null;
  mediaType: 'image' | 'video' | null;
};

export type BackgroundSelectionResult = {
  ok: boolean;
  name?: string;
  error?: string;
  canceled?: boolean;
};

export type HealthEffect = {
  id: number;
  bossId: string;
  type: 'damage' | 'heal';
  intensity: 'normal' | 'full';
  from: number;
  to: number;
  maximum: number;
  shieldFrom: number;
  shieldTo: number;
  source?: {
    kind: 'status';
    statusId: StatusId;
    name: string;
    formula: string;
  };
};

export type StatusDamageTick = {
  statusId: StatusId;
  statusName: string;
  formula: string;
  damage: number;
  from: number;
  to: number;
};

export type RandomIntGenerator = (
  minimumInclusive: number,
  maximumExclusive: number,
) => number;

export const isHeavyDamageEffect = (effect: HealthEffect) =>
  effect.type === 'damage' &&
  effect.from - effect.to > effect.maximum * 0.1;

export const isShieldBreakEffect = (effect: HealthEffect) =>
  effect.type === 'damage' && effect.shieldFrom > 0 && effect.shieldTo === 0;

export type ShieldMechanicSoundKind = 'shield-impact' | 'shield-break';
export type EncounterSoundEffectKind =
  | ShieldMechanicSoundKind
  | 'damage'
  | 'critical-damage'
  | 'heal';

export const getShieldMechanicSoundKind = (
  effect: HealthEffect,
): ShieldMechanicSoundKind | null => {
  if (effect.type !== 'damage' || effect.shieldFrom <= effect.shieldTo) {
    return null;
  }
  return effect.shieldTo === 0 ? 'shield-break' : 'shield-impact';
};

export const getEncounterSoundEffectKind = (
  effect: HealthEffect,
): EncounterSoundEffectKind | null => {
  const shieldKind = getShieldMechanicSoundKind(effect);
  if (shieldKind) return shieldKind;
  if (effect.type === 'damage' && effect.to < effect.from) {
    return isHeavyDamageEffect(effect) ? 'critical-damage' : 'damage';
  }
  if (effect.type === 'heal' && effect.to > effect.from) return 'heal';
  return null;
};

export const chooseNonRepeatingIndex = (
  itemCount: number,
  previousIndex: number | null,
  randomInteger: RandomIntGenerator,
) => {
  if (!Number.isInteger(itemCount) || itemCount <= 0) return -1;
  if (itemCount === 1) return 0;
  if (
    previousIndex === null ||
    !Number.isInteger(previousIndex) ||
    previousIndex < 0 ||
    previousIndex >= itemCount
  ) {
    return randomInteger(0, itemCount);
  }
  const candidate = randomInteger(0, itemCount - 1);
  return candidate >= previousIndex ? candidate + 1 : candidate;
};

export const encounterSoundReplayDelayMs = 1000;

export const chooseEncounterSoundIndex = (
  itemCount: number,
  previousIndex: number | null,
  lastGroupPlayedAt: number | null,
  now: number,
  randomInteger: RandomIntGenerator,
) => {
  if (itemCount >= 3) {
    return chooseNonRepeatingIndex(itemCount, previousIndex, randomInteger);
  }
  if (!Number.isInteger(itemCount) || itemCount <= 0) return -1;
  if (
    lastGroupPlayedAt !== null &&
    now - lastGroupPlayedAt < encounterSoundReplayDelayMs
  ) return -1;
  return randomInteger(0, itemCount);
};

export type HealthSequenceRequest = {
  bossId: string;
  type: 'damage' | 'heal';
  total: number;
  hits: number;
  ignoreDamageReduction?: boolean;
};

export type HealthSequenceResult = {
  ok: boolean;
  hits?: number;
  amountPerHit?: number;
  error?: string;
};

export const calculateHealthSequence = ({
  type,
  total,
  hits,
  damageReduction = 0,
  ignoreDamageReduction = false,
}: {
  type: 'damage' | 'heal';
  total: number;
  hits: number;
  damageReduction?: number;
  ignoreDamageReduction?: boolean;
}) => {
  const amountPerHit = Math.ceil(total / hits);
  const reductionPerHit =
    type === 'damage' && !ignoreDamageReduction
      ? Math.ceil(damageReduction / hits)
      : 0;
  const effectiveAmountPerHit =
    type === 'damage'
      ? Math.max(1, amountPerHit - reductionPerHit)
      : amountPerHit;

  return {
    amountPerHit,
    reductionPerHit,
    effectiveAmountPerHit,
    effectiveTotal: effectiveAmountPerHit * hits,
  };
};

export type MusicTrack = {
  id: string;
  name: string;
  url: string;
  duration: number;
};

export type MusicState = {
  tracks: MusicTrack[];
  currentTrackId: string | null;
  isPlaying: boolean;
  loop: boolean;
  volume: number;
  muted: boolean;
  universalMuted: boolean;
  playbackVersion: number;
  revision: number;
};

export type MusicPlaybackState = {
  trackId: string | null;
  currentTime: number;
  duration: number;
};

export const volumeToGain = (volume: number) => {
  const normalizedVolume = Math.max(0, Math.min(1, volume));
  if (normalizedVolume <= 0.8) {
    return (normalizedVolume / 0.8) ** 2.2;
  }

  const boostProgress = (normalizedVolume - 0.8) / 0.2;
  const boostDecibels = boostProgress * 6;
  return 10 ** (boostDecibels / 20);
};

export type MusicSelectionResult = {
  ok: boolean;
  added?: number;
  error?: string;
  canceled?: boolean;
};

export type SoundboardSlot = {
  index: number;
  name: string | null;
  assigned: boolean;
};

export type SoundboardState = {
  slots: SoundboardSlot[];
  volume: number;
  muted: boolean;
  universalMuted: boolean;
  revision: number;
};

export type SoundboardAssignmentResult = {
  ok: boolean;
  error?: string;
  canceled?: boolean;
};

export type SoundEffect = {
  id: number;
  index: number;
  url: string;
};

export type EncounterEffectsState = {
  volume: number;
  universalMuted: boolean;
  sounds: EncounterSoundSettings;
  visuals: EncounterVisualEffectSettings;
  revision: number;
};

export type EncounterSoundSetting = 'heal' | 'damage' | 'shield';

export type EncounterSoundSettings = Record<EncounterSoundSetting, boolean>;

export type EncounterVisualEffectSetting =
  | 'screenShake'
  | 'healthBarShake'
  | 'damageEffect'
  | 'healEffect'
  | 'particles'
  | 'floatingDamageNumbers'
  | 'healthNumbers';

export type EncounterVisualEffectSettings = Record<
  EncounterVisualEffectSetting,
  boolean
>;

export const initialEncounterEffectsState: EncounterEffectsState = {
  volume: 0.8,
  universalMuted: false,
  sounds: {
    heal: true,
    damage: true,
    shield: true,
  },
  visuals: {
    screenShake: true,
    healthBarShake: true,
    damageEffect: true,
    healEffect: true,
    particles: true,
    floatingDamageNumbers: true,
    healthNumbers: false,
  },
  revision: 0,
};

export const getEncounterSoundSetting = (
  kind: EncounterSoundEffectKind,
): EncounterSoundSetting => {
  if (kind === 'heal') return 'heal';
  if (kind === 'shield-impact' || kind === 'shield-break') return 'shield';
  return 'damage';
};

export const isEncounterSoundEnabled = (
  settings: Pick<EncounterEffectsState, 'sounds'>,
  kind: EncounterSoundEffectKind,
) => settings.sounds[getEncounterSoundSetting(kind)];

export type EncounterSoundEffect = {
  id: number;
  kind: EncounterSoundEffectKind;
  url: string;
};

export type SoundboardStop = {
  index?: number;
};

export type SoundboardCommand =
  | { type: 'play'; index: number }
  | { type: 'remove'; index: number }
  | { type: 'clear' }
  | { type: 'stop-all' }
  | { type: 'toggle-mute' }
  | { type: 'set-volume'; volume: number };

export const isSoundboardCommand = (
  value: unknown,
): value is SoundboardCommand => {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  const command = value as Record<string, unknown>;
  if (
    command.type === 'clear' ||
    command.type === 'stop-all' ||
    command.type === 'toggle-mute'
  ) return true;
  if (command.type === 'set-volume') {
    return typeof command.volume === 'number' && Number.isFinite(command.volume);
  }
  return (
    (command.type === 'play' || command.type === 'remove') &&
    typeof command.index === 'number' &&
    Number.isInteger(command.index) &&
    command.index >= 1 &&
    command.index <= 20
  );
};

export type MusicCommand =
  | { type: 'toggle-play' }
  | { type: 'restart' }
  | { type: 'previous' }
  | { type: 'next' }
  | { type: 'toggle-loop' }
  | { type: 'toggle-mute' }
  | { type: 'set-volume'; volume: number }
  | { type: 'seek'; time: number }
  | { type: 'remove-track'; trackId: string }
  | { type: 'clear-tracks' }
  | { type: 'play-track'; trackId: string };

export const isMusicCommand = (value: unknown): value is MusicCommand => {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;

  const command = value as Record<string, unknown>;
  if (command.type === 'play-track' || command.type === 'remove-track') {
    return typeof command.trackId === 'string';
  }
  if (command.type === 'set-volume') {
    return typeof command.volume === 'number' && Number.isFinite(command.volume);
  }
  if (command.type === 'seek') {
    return typeof command.time === 'number' && Number.isFinite(command.time);
  }

  return [
    'toggle-play',
    'restart',
    'previous',
    'next',
    'toggle-loop',
    'toggle-mute',
    'clear-tracks',
  ].includes(String(command.type));
};

export type BattleCommand =
  | {
      type: 'configure';
      bossId: string;
      bossName: string;
      maxHealth: number;
      attack: number;
      rangedAttack: number;
      defense: number;
      shield: number;
      skills: number;
      damageReduction: number;
      controlAmount?: string;
      applyDamageReduction?: boolean;
    }
  | { type: 'damage'; bossId: string; amount: number }
  | { type: 'heal'; bossId: string; amount: number }
  | {
      type: 'publish-action';
      bossId: string;
      text: string;
      severity: 'normal' | 'grave';
    }
  | { type: 'select-boss'; bossId: string }
  | { type: 'mark-identity-unprepared'; bossId: string }
  | { type: 'mark-action-unprepared'; bossId: string }
  | {
      type: 'apply-status';
      bossId: string;
      statusId: StatusId;
      damageFormula: string | null;
      turns: number;
      customName?: string;
      customDescription?: string;
    }
  | { type: 'remove-status'; bossId: string; statusId: StatusId }
  | { type: 'start-turn'; bossId: string }
  | { type: 'add-boss' }
  | { type: 'remove-boss'; bossId: string }
  | { type: 'start-battle' }
  | { type: 'end-battle' }
  | { type: 'set-hud-visible'; visible: boolean }
  | { type: 'reset-health'; bossId: string }
  | { type: 'commit-background' }
  | { type: 'reset-all' };

export const createInitialBoss = (id: string, index = 0): BossState => ({
  id,
  setupStatus: index === 0 ? 'initial' : 'pending',
  identityPrepared: false,
  actionPrepared: false,
  bossName: index === 0 ? 'O Chefão Sem Nome' : `Chefão ${index + 1}`,
  controlAmount: '50',
  applyDamageReduction: true,
  maxHealth: 500,
  currentHealth: 500,
  attack: 10,
  rangedAttack: 10,
  defense: 10,
  shield: 0,
  skills: 10,
  damageReduction: 10,
  nextAction: '',
  actionSeverity: 'normal',
  turnCount: 0,
  activeStatuses: [],
});

export const initialBattleState: BattleState = {
  bosses: [createInitialBoss('boss-1')],
  activeBossId: 'boss-1',
  battleStarted: false,
  hudVisible: true,
  backgroundName: null,
  revision: 0,
};

const clampInteger = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, Math.round(value)));

const hasBossId = (command: Record<string, unknown>) =>
  typeof command.bossId === 'string';

export const isBattleCommand = (value: unknown): value is BattleCommand => {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  const command = value as Record<string, unknown>;

  switch (command.type) {
    case 'configure':
      return (
        hasBossId(command) &&
        typeof command.bossName === 'string' &&
        ['maxHealth', 'attack', 'rangedAttack', 'defense', 'shield', 'skills', 'damageReduction'].every(
          (field) =>
            typeof command[field] === 'number' && Number.isFinite(command[field]),
        ) &&
        (command.controlAmount === undefined ||
          typeof command.controlAmount === 'string') &&
        (command.applyDamageReduction === undefined ||
          typeof command.applyDamageReduction === 'boolean')
      );
    case 'damage':
    case 'heal':
      return (
        hasBossId(command) &&
        typeof command.amount === 'number' &&
        Number.isFinite(command.amount)
      );
    case 'publish-action':
      return (
        hasBossId(command) &&
        typeof command.text === 'string' &&
        (command.severity === 'normal' || command.severity === 'grave')
      );
    case 'select-boss':
    case 'mark-identity-unprepared':
    case 'mark-action-unprepared':
    case 'remove-boss':
    case 'reset-health':
      return hasBossId(command);
    case 'apply-status': {
      if (
        !hasBossId(command) ||
        !isStatusId(command.statusId) ||
        !Number.isInteger(command.turns) ||
        (command.turns as number) < 1 ||
        (command.turns as number) > 999
      ) return false;
      const definition = getStatusDefinition(command.statusId);
      if (!definition) return false;
      if (definition.customizable) {
        const customName = typeof command.customName === 'string'
          ? command.customName.trim()
          : '';
        const customDescription = typeof command.customDescription === 'string'
          ? command.customDescription.trim()
          : '';
        return (
          customName.length >= 1 &&
          customName.length <= 60 &&
          customDescription.length >= 1 &&
          customDescription.length <= 300 &&
          (
            command.damageFormula === null ||
            (
              typeof command.damageFormula === 'string' &&
              normalizeDamageFormula(command.damageFormula) !== null
            )
          )
        );
      }
      if (!definition.damageCapable) return command.damageFormula === null;
      if (command.damageFormula === null) {
        return definition.defaultDamageFormula !== null;
      }
      return (
        typeof command.damageFormula === 'string' &&
        normalizeDamageFormula(command.damageFormula) !== null
      );
    }
    case 'remove-status':
      return hasBossId(command) && isStatusId(command.statusId);
    case 'start-turn':
      return hasBossId(command);
    case 'set-hud-visible':
      return typeof command.visible === 'boolean';
    case 'add-boss':
    case 'start-battle':
    case 'end-battle':
    case 'commit-background':
    case 'reset-all':
      return true;
    default:
      return false;
  }
};

const updateBoss = (
  state: BattleState,
  bossId: string,
  updater: (boss: BossState) => BossState,
) => ({
  ...state,
  bosses: state.bosses.map((boss) => (boss.id === bossId ? updater(boss) : boss)),
  revision: state.revision + 1,
});

export const applyBattleCommand = (
  state: BattleState,
  command: BattleCommand,
): BattleState => {
  const nextRevision = state.revision + 1;

  switch (command.type) {
    case 'configure':
      return updateBoss(state, command.bossId, (boss) => {
        const maxHealth = clampInteger(command.maxHealth, 1, 1_000_000);
        const wasAtFullHealth = boss.currentHealth === boss.maxHealth;
        return {
          ...boss,
          setupStatus: 'ready',
          identityPrepared: true,
          bossName: command.bossName.trim().slice(0, 100) || 'Chefão Sem Nome',
          controlAmount:
            command.controlAmount && /^[0-9.,/]{1,24}$/.test(command.controlAmount)
              ? command.controlAmount
              : boss.controlAmount,
          applyDamageReduction:
            command.applyDamageReduction ?? boss.applyDamageReduction,
          maxHealth,
          currentHealth: wasAtFullHealth
            ? maxHealth
            : Math.min(boss.currentHealth, maxHealth),
          attack: clampInteger(command.attack, 0, 999),
          rangedAttack: clampInteger(command.rangedAttack, 0, 999),
          defense: clampInteger(command.defense, 0, 999),
          shield: clampInteger(command.shield, 0, 999),
          skills: clampInteger(command.skills, 0, 999),
          damageReduction: clampInteger(command.damageReduction, 0, 999),
        };
      });
    case 'damage':
      return updateBoss(state, command.bossId, (boss) =>
        boss.shield > 0
          ? { ...boss, shield: boss.shield - 1 }
          : {
              ...boss,
              currentHealth: Math.max(
                0,
                boss.currentHealth - clampInteger(
                  Math.abs(command.amount),
                  0,
                  1_000_000,
                ),
              ),
            },
      );
    case 'heal':
      return updateBoss(state, command.bossId, (boss) => ({
        ...boss,
        currentHealth: Math.min(
          boss.maxHealth,
          boss.currentHealth + clampInteger(Math.abs(command.amount), 0, 1_000_000),
        ),
      }));
    case 'publish-action':
      return updateBoss(state, command.bossId, (boss) => ({
        ...boss,
        actionPrepared: command.text.trim().length > 0,
        nextAction: command.text.trim().slice(0, 100),
        actionSeverity:
          command.text.trim().length === 0 ? 'normal' : command.severity,
      }));
    case 'mark-identity-unprepared':
      return updateBoss(state, command.bossId, (boss) => ({
        ...boss,
        identityPrepared: false,
      }));
    case 'mark-action-unprepared':
      return updateBoss(state, command.bossId, (boss) => ({
        ...boss,
        actionPrepared: false,
      }));
    case 'apply-status':
      return updateBoss(state, command.bossId, (boss) => {
        const definition = getStatusDefinition(command.statusId);
        if (!definition) return boss;
        const customName = definition.customizable
          ? command.customName?.trim().slice(0, 60)
          : undefined;
        const customDescription = definition.customizable
          ? command.customDescription?.trim().slice(0, 300)
          : undefined;
        if (definition.customizable && (!customName || !customDescription)) return boss;
        const normalizedDamage = definition?.damageCapable
          ? command.damageFormula
            ? normalizeDamageFormula(command.damageFormula)
            : definition.defaultDamageFormula
          : null;
        if (definition.damageCapable && !definition.customizable && normalizedDamage === null) return boss;
        const status: ActiveBossStatus = {
          statusId: command.statusId,
          damageFormula: normalizedDamage,
          turnsRemaining: clampInteger(command.turns, 1, 999),
          ...(customName ? { customName } : {}),
          ...(customDescription ? { customDescription } : {}),
        };
        return {
          ...boss,
          activeStatuses: [
            ...boss.activeStatuses.filter(
              (activeStatus) => activeStatus.statusId !== command.statusId,
            ),
            status,
          ],
        };
      });
    case 'remove-status':
      return updateBoss(state, command.bossId, (boss) => ({
        ...boss,
        activeStatuses: boss.activeStatuses.filter(
          (status) => status.statusId !== command.statusId,
        ),
      }));
    case 'start-turn':
      // O processo principal usa advanceBossTurn para aplicar aleatoriedade
      // autoritativa e emitir os efeitos visuais de cada dano recorrente.
      return state;
    case 'select-boss':
      return state.bosses.some((boss) => boss.id === command.bossId)
        ? { ...state, activeBossId: command.bossId, revision: nextRevision }
        : state;
    case 'add-boss': {
      if (state.bosses.length >= 3) return state;
      const nextNumber =
        Math.max(
          0,
          ...state.bosses.map((boss) => Number(boss.id.split('-')[1]) || 0),
        ) + 1;
      const boss = createInitialBoss(`boss-${nextNumber}`, state.bosses.length);
      return {
        ...state,
        bosses: [...state.bosses, boss],
        activeBossId: boss.id,
        revision: nextRevision,
      };
    }
    case 'remove-boss': {
      if (state.bosses.length === 1) return state;
      const bosses = state.bosses.filter((boss) => boss.id !== command.bossId);
      return {
        ...state,
        bosses,
        activeBossId:
          state.activeBossId === command.bossId
            ? bosses[0].id
            : state.activeBossId,
        revision: nextRevision,
      };
    }
    case 'start-battle':
      return {
        ...state,
        bosses: state.bosses.map((boss) =>
          boss.setupStatus === 'initial'
            ? { ...boss, setupStatus: 'ready' }
            : boss,
        ),
        battleStarted: true,
        revision: nextRevision,
      };
    case 'end-battle':
      return { ...state, battleStarted: false, revision: nextRevision };
    case 'set-hud-visible':
      return { ...state, hudVisible: command.visible, revision: nextRevision };
    case 'reset-health':
      return updateBoss(state, command.bossId, (boss) => ({
        ...boss,
        currentHealth: boss.maxHealth,
      }));
    case 'commit-background':
      return { ...state, revision: nextRevision };
    case 'reset-all':
      return { ...initialBattleState, bosses: [createInitialBoss('boss-1')], revision: nextRevision };
  }
};

export const advanceBossTurn = (
  state: BattleState,
  bossId: string,
  randomInt: RandomIntGenerator,
): { state: BattleState; ticks: StatusDamageTick[] } => {
  const boss = state.bosses.find((item) => item.id === bossId);
  if (!boss) return { state, ticks: [] };

  let currentHealth = boss.currentHealth;
  const ticks: StatusDamageTick[] = [];
  const activeStatuses = boss.activeStatuses.flatMap(
    (status): ActiveBossStatus[] => {
      const definition = getStatusDefinition(status.statusId);
      const parsedFormula = status.damageFormula
        ? parseDamageFormula(status.damageFormula)
        : null;

      if (definition && parsedFormula) {
        const damage = rollDamageFormula(parsedFormula, randomInt);
        const from = currentHealth;
        currentHealth = Math.max(0, currentHealth - damage);
        if (damage > 0 && from > currentHealth) {
          ticks.push({
            statusId: status.statusId,
            statusName: getActiveStatusName(status),
            formula: status.damageFormula ?? '',
            damage: from - currentHealth,
            from,
            to: currentHealth,
          });
        }
      }

      const turnsRemaining = status.turnsRemaining - 1;
      return turnsRemaining > 0
        ? [{ ...status, turnsRemaining }]
        : [];
    },
  );

  const nextBoss: BossState = {
    ...boss,
    currentHealth,
    turnCount: boss.turnCount + 1,
    activeStatuses,
  };
  return {
    state: {
      ...state,
      bosses: state.bosses.map((item) => item.id === bossId ? nextBoss : item),
      revision: state.revision + 1,
    },
    ticks,
  };
};
