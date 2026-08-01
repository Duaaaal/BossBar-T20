import { applyStatusRules } from './status-rules.ts';
import type { ActiveBossStatus, StatusId } from './status.ts';

export const BLEEDING_CONSTITUTION_DC = 15;
export const FIRST_AID_CURE_DC = 15;

type PlayerVitalState = Readonly<{
  currentHealth: number;
  maxHealth: number;
  statuses: ActiveBossStatus[];
  stabilized: boolean;
  dead: boolean;
  revision: number;
}>;

const persistentStatus = (statusId: StatusId): ActiveBossStatus => ({
  statusId,
  damageFormula: statusId === 'sangrando' ? '1d6' : null,
  turnsRemaining: 999,
});

const withoutStatuses = (
  statuses: readonly ActiveBossStatus[],
  removed: ReadonlySet<StatusId>,
) => statuses.filter(({ statusId }) => !removed.has(statusId));

export const playerDeathThreshold = (maxHealth: number) =>
  Math.min(-10, -Math.ceil(Math.max(1, maxHealth) / 2));

export const isPlayerIncapacitated = (
  state: Pick<PlayerVitalState, 'currentHealth' | 'dead'>,
) => state.dead || state.currentHealth <= 0;

const withUnconsciousConditions = (statuses: ActiveBossStatus[]) =>
  applyStatusRules(
    applyStatusRules(statuses, persistentStatus('inconsciente')),
    persistentStatus('sangrando'),
  );

export type PlayerVitalTransition<T extends PlayerVitalState> = Readonly<{
  state: T;
  becameUnconscious: boolean;
  becameStable: boolean;
  died: boolean;
}>;

export const applyPlayerDamage = <T extends PlayerVitalState>(
  state: T,
  damage: number,
): PlayerVitalTransition<T> => {
  if (state.dead) {
    return {
      state,
      becameUnconscious: false,
      becameStable: false,
      died: false,
    };
  }
  const applied = Math.max(0, Math.ceil(damage));
  const currentHealth = state.currentHealth - applied;
  const becameUnconscious = state.currentHealth > 0 && currentHealth <= 0;
  const dead = currentHealth <= playerDeathThreshold(state.maxHealth);
  const statuses = currentHealth <= 0
    ? withUnconsciousConditions(state.statuses)
    : state.statuses;
  const nextState = {
    ...state,
    currentHealth,
    statuses: dead
      ? withoutStatuses(statuses, new Set<StatusId>(['sangrando']))
      : statuses,
    stabilized: false,
    dead,
    revision: state.revision + 1,
  } as T;
  return {
    state: nextState,
    becameUnconscious,
    becameStable: false,
    died: !state.dead && dead,
  };
};

export const applyPlayerHealing = <T extends PlayerVitalState>(
  state: T,
  healing: number,
): PlayerVitalTransition<T> => {
  if (state.dead) {
    return {
      state,
      becameUnconscious: false,
      becameStable: false,
      died: false,
    };
  }
  const applied = Math.max(0, Math.ceil(healing));
  if (applied < 1) {
    return {
      state,
      becameUnconscious: false,
      becameStable: false,
      died: false,
    };
  }
  const currentHealth = Math.min(state.maxHealth, state.currentHealth + applied);
  const wasBleeding = state.statuses.some(({ statusId }) => statusId === 'sangrando');
  const removed = currentHealth > 0
    ? new Set<StatusId>(['sangrando', 'inconsciente', 'indefeso'])
    : new Set<StatusId>(['sangrando']);
  const nextState = {
    ...state,
    currentHealth,
    statuses: withoutStatuses(state.statuses, removed),
    stabilized: currentHealth <= 0,
    revision: state.revision + 1,
  } as T;
  return {
    state: nextState,
    becameUnconscious: false,
    becameStable: wasBleeding,
    died: false,
  };
};

export const stabilizePlayer = <T extends PlayerVitalState>(
  state: T,
): PlayerVitalTransition<T> => {
  if (state.dead || state.currentHealth > 0) {
    return {
      state,
      becameUnconscious: false,
      becameStable: false,
      died: false,
    };
  }
  const wasBleeding = state.statuses.some(({ statusId }) => statusId === 'sangrando');
  const nextState = {
    ...state,
    statuses: withoutStatuses(state.statuses, new Set<StatusId>(['sangrando'])),
    stabilized: true,
    revision: state.revision + 1,
  } as T;
  return {
    state: nextState,
    becameUnconscious: false,
    becameStable: wasBleeding,
    died: false,
  };
};
