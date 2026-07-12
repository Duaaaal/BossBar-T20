export type BattleState = {
  bossName: string;
  maxHealth: number;
  currentHealth: number;
  attack: number;
  rangedAttack: number;
  defense: number;
  skills: number;
  damageReduction: number;
  battleStarted: boolean;
  backgroundName: string | null;
  nextAction: string;
  actionSeverity: 'normal' | 'grave';
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
  type: 'damage' | 'heal';
  intensity: 'normal' | 'full';
  from: number;
  to: number;
  maximum: number;
};

export type BattleCommand =
  | {
      type: 'configure';
      bossName: string;
      maxHealth: number;
      attack: number;
      rangedAttack: number;
      defense: number;
      skills: number;
      damageReduction: number;
    }
  | { type: 'damage'; amount: number }
  | { type: 'heal'; amount: number }
  | {
      type: 'publish-action';
      text: string;
      severity: 'normal' | 'grave';
    }
  | { type: 'start-battle' }
  | { type: 'reset-health' }
  | { type: 'reset-all' };

export const initialBattleState: BattleState = {
  bossName: 'O Chefão Sem Nome',
  maxHealth: 500,
  currentHealth: 500,
  attack: 10,
  rangedAttack: 10,
  defense: 10,
  skills: 10,
  damageReduction: 10,
  battleStarted: false,
  backgroundName: null,
  nextAction: 'A criatura observa o campo de batalha...',
  actionSeverity: 'normal',
  revision: 0,
};

const clampInteger = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, Math.round(value)));

export const isBattleCommand = (value: unknown): value is BattleCommand => {
  if (!value || typeof value !== 'object' || !('type' in value)) {
    return false;
  }

  const command = value as Record<string, unknown>;

  switch (command.type) {
    case 'configure':
      return (
        typeof command.bossName === 'string' &&
        typeof command.maxHealth === 'number' &&
        Number.isFinite(command.maxHealth) &&
        typeof command.attack === 'number' &&
        Number.isFinite(command.attack) &&
        typeof command.rangedAttack === 'number' &&
        Number.isFinite(command.rangedAttack) &&
        typeof command.defense === 'number' &&
        Number.isFinite(command.defense) &&
        typeof command.skills === 'number' &&
        Number.isFinite(command.skills) &&
        typeof command.damageReduction === 'number' &&
        Number.isFinite(command.damageReduction)
      );
    case 'damage':
    case 'heal':
      return typeof command.amount === 'number' && Number.isFinite(command.amount);
    case 'publish-action':
      return (
        typeof command.text === 'string' &&
        (command.severity === 'normal' || command.severity === 'grave')
      );
    case 'start-battle':
    case 'reset-health':
    case 'reset-all':
      return true;
    default:
      return false;
  }
};

export const applyBattleCommand = (
  state: BattleState,
  command: BattleCommand,
): BattleState => {
  const nextRevision = state.revision + 1;

  switch (command.type) {
    case 'configure': {
      const maxHealth = clampInteger(command.maxHealth, 1, 1_000_000);
      const wasAtFullHealth = state.currentHealth === state.maxHealth;

      return {
        ...state,
        bossName: command.bossName.trim().slice(0, 100) || 'Chefão Sem Nome',
        maxHealth,
        currentHealth: wasAtFullHealth
          ? maxHealth
          : Math.min(state.currentHealth, maxHealth),
        attack: clampInteger(command.attack, 0, 999),
        rangedAttack: clampInteger(command.rangedAttack, 0, 999),
        defense: clampInteger(command.defense, 0, 999),
        skills: clampInteger(command.skills, 0, 999),
        damageReduction: clampInteger(command.damageReduction, 0, 999),
        revision: nextRevision,
      };
    }
    case 'damage': {
      const amount = clampInteger(Math.abs(command.amount), 0, 1_000_000);
      return {
        ...state,
        currentHealth: Math.max(0, state.currentHealth - amount),
        revision: nextRevision,
      };
    }
    case 'heal': {
      const amount = clampInteger(Math.abs(command.amount), 0, 1_000_000);
      return {
        ...state,
        currentHealth: Math.min(state.maxHealth, state.currentHealth + amount),
        revision: nextRevision,
      };
    }
    case 'publish-action':
      return {
        ...state,
        nextAction: command.text.trim().slice(0, 100),
        actionSeverity:
          command.text.trim().length === 0 ? 'normal' : command.severity,
        revision: nextRevision,
      };
    case 'start-battle':
      return {
        ...state,
        battleStarted: true,
        revision: nextRevision,
      };
    case 'reset-health':
      return {
        ...state,
        currentHealth: state.maxHealth,
        revision: nextRevision,
      };
    case 'reset-all':
      return {
        ...initialBattleState,
        revision: nextRevision,
      };
  }
};
