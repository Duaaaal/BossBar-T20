export type BossState = {
  id: string;
  bossName: string;
  maxHealth: number;
  currentHealth: number;
  attack: number;
  rangedAttack: number;
  defense: number;
  skills: number;
  damageReduction: number;
  nextAction: string;
  actionSeverity: 'normal' | 'grave';
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
};

export type HealthSequenceRequest = {
  bossId: string;
  type: 'damage' | 'heal';
  total: number;
  hits: number;
};

export type HealthSequenceResult = {
  ok: boolean;
  hits?: number;
  amountPerHit?: number;
  error?: string;
};

export type MusicTrack = {
  id: string;
  name: string;
  url: string;
};

export type MusicState = {
  tracks: MusicTrack[];
  currentTrackId: string | null;
  isPlaying: boolean;
  loop: boolean;
  volume: number;
  playbackVersion: number;
  revision: number;
};

export type MusicSelectionResult = {
  ok: boolean;
  added?: number;
  error?: string;
  canceled?: boolean;
};

export type MusicCommand =
  | { type: 'toggle-play' }
  | { type: 'restart' }
  | { type: 'previous' }
  | { type: 'next' }
  | { type: 'toggle-loop' }
  | { type: 'set-volume'; volume: number }
  | { type: 'play-track'; trackId: string };

export const isMusicCommand = (value: unknown): value is MusicCommand => {
  if (!value || typeof value !== 'object' || !('type' in value)) return false;

  const command = value as Record<string, unknown>;
  if (command.type === 'play-track') return typeof command.trackId === 'string';
  if (command.type === 'set-volume') {
    return typeof command.volume === 'number' && Number.isFinite(command.volume);
  }

  return ['toggle-play', 'restart', 'previous', 'next', 'toggle-loop'].includes(
    String(command.type),
  );
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
      skills: number;
      damageReduction: number;
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
  bossName: index === 0 ? 'O Chefão Sem Nome' : `Chefão ${index + 1}`,
  maxHealth: 500,
  currentHealth: 500,
  attack: 10,
  rangedAttack: 10,
  defense: 10,
  skills: 10,
  damageReduction: 10,
  nextAction: 'A criatura observa o campo de batalha...',
  actionSeverity: 'normal',
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
        ['maxHealth', 'attack', 'rangedAttack', 'defense', 'skills', 'damageReduction'].every(
          (field) =>
            typeof command[field] === 'number' && Number.isFinite(command[field]),
        )
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
    case 'remove-boss':
    case 'reset-health':
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
          bossName: command.bossName.trim().slice(0, 100) || 'Chefão Sem Nome',
          maxHealth,
          currentHealth: wasAtFullHealth
            ? maxHealth
            : Math.min(boss.currentHealth, maxHealth),
          attack: clampInteger(command.attack, 0, 999),
          rangedAttack: clampInteger(command.rangedAttack, 0, 999),
          defense: clampInteger(command.defense, 0, 999),
          skills: clampInteger(command.skills, 0, 999),
          damageReduction: clampInteger(command.damageReduction, 0, 999),
        };
      });
    case 'damage':
      return updateBoss(state, command.bossId, (boss) => ({
        ...boss,
        currentHealth: Math.max(
          0,
          boss.currentHealth - clampInteger(Math.abs(command.amount), 0, 1_000_000),
        ),
      }));
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
        nextAction: command.text.trim().slice(0, 100),
        actionSeverity:
          command.text.trim().length === 0 ? 'normal' : command.severity,
      }));
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
      return { ...state, battleStarted: true, revision: nextRevision };
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
