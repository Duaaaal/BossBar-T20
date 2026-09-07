import type {
  CharacterSheetInteractionState,
  CharacterSheetSummary,
} from './character-sheet';
import type { EncounterSoundEffectKind } from './battle';
import { isAttackStatusEffect } from './boss-attacks.ts';
import { resolveD20Check } from './d20-rules.ts';
import {
  historyEntriesForTurn,
  type EncounterHistoryEntry,
} from './encounter-history.ts';
import { applyPlayerDamage } from './player-survival.ts';
import {
  normalizeDamageFormula,
  parseDamageFormula,
  type ActiveBossStatus,
  type DamageFormulaRoll,
  type ParsedDamageFormula,
} from './status.ts';

export type AreaDamageSuccessRule = 'half' | 'none';
export type AttackType = 'melee' | 'ranged';
export type EncounterFaction = 'players' | 'bosses';

export type PlayerEncounterState = {
  clientId: string;
  characterName: string;
  currentHealth: number;
  maxHealth: number;
  temporaryHealth: number;
  currentMana: number;
  maxMana: number;
  defenseMelee: number;
  defenseRanged: number;
  reflex: number;
  statuses: ActiveBossStatus[];
  actionPoints: number;
  heroPoints: number;
  /** @deprecated Use actionPoints. Kept during the multiplayer protocol migration. */
  actionPointAvailable: boolean;
  /** @deprecated Use heroPoints. Kept during the multiplayer protocol migration. */
  heroPointAvailable: boolean;
  unarmedStrikeEnabled: boolean;
  temporaryDefenseBonus: number;
  protectionExpiresAtRound: number | null;
  /** Changes only when this character receives a critical combat impact. */
  criticalImpactId: number | null;
  /** Changes before a hostile critical lands, driving its warning animation. */
  criticalThreatId: number | null;
  /** True after bleeding was stopped while the character remains at 0 PV or less. */
  stabilized: boolean;
  /** Death is permanent for the encounter unless a future resurrection rule says otherwise. */
  dead: boolean;
  /** Server-authoritative lock while the sheet is being edited or reviewed. */
  sheetInteractionState?: CharacterSheetInteractionState;
  revision: number;
};

export type PlayerHudActionState = {
  free: boolean;
  movement: boolean;
  standard: boolean;
};

export type PlayerActionKind = keyof PlayerHudActionState;

export type PlayerHudState = {
  pendingResistances?: import('./resistance').ResistancePrompt[];
  disconnected?: boolean;
  controlledByMaster?: boolean;
  id: string;
  characterName: string;
  portraitUrl?: string | null;
  isSelf: boolean;
  privateMode: boolean;
  redacted: boolean;
  currentHealth: number | null;
  maxHealth: number | null;
  temporaryHealth: number | null;
  currentMana: number | null;
  maxMana: number | null;
  defenseMelee: number | null;
  defenseRanged: number | null;
  statuses: ActiveBossStatus[];
  faction: EncounterFaction;
  actionPoints: number | null;
  heroPoints: number | null;
  /** @deprecated Use actionPoints. Kept during the multiplayer protocol migration. */
  actionPointAvailable: boolean | null;
  /** @deprecated Use heroPoints. Kept during the multiplayer protocol migration. */
  heroPointAvailable: boolean | null;
  unarmedStrikeEnabled: boolean;
  temporaryDefenseBonus: number | null;
  criticalImpactId: number | null;
  criticalThreatId: number | null;
  stabilized: boolean;
  dead: boolean;
  deathThreshold: number | null;
  summary: CharacterSheetSummary | null;
  actions: PlayerHudActionState;
  pendingDamage: PendingCombatDamage | null;
  /** Only exposed for the player's own HUD. */
  sheetInteractionState?: CharacterSheetInteractionState;
  revision: number;
};

export type PendingCombatDamage = {
  id: string;
  attackerKind: 'player' | 'boss';
  attackerParticipantId: string;
  label: string;
  targetName: string;
  critical: boolean;
  createdAt: number;
};

export type EncounterActorKind = 'player' | 'boss' | 'npc';

export type EncounterTurnParticipant = {
  id: string;
  kind: EncounterActorKind;
  sourceId: string;
  name: string;
  faction?: EncounterFaction;
  initiativeModifier: number;
  initiativeRoll: number;
  initiativeTotal: number;
  initiativeRolled?: boolean;
  eligibleRound: number;
  isSelf: boolean;
  initiativeHidden?: boolean;
};

export type EncounterRollOutcome = 'success' | 'failure' | 'neutral';

export type EncounterRollVisibility =
  | 'full'
  | 'dice-only'
  | 'dice-and-total'
  | 'hidden';

export type EncounterRollResult = {
  id: string;
  participantId: string;
  label: string;
  expression: string;
  rolls: number[];
  modifier: number;
  total: number;
  outcome: EncounterRollOutcome;
  category: 'initiative' | 'test' | 'attack' | 'damage' | 'status';
  createdAt: number;
  retainedByParticipantId: string | null;
  visibility?: EncounterRollVisibility;
  resourceEffect?: 'action-point' | 'hero-point';
  rollMode?: 'sum' | 'sum-capped' | 'reroll';
  /** Monotonic order assigned by the authoritative encounter server. */
  sequence?: number;
  /** Stable identity shared by every result produced by one action. */
  actionId?: string;
  /** Links opposed or otherwise related actions without exposing hidden values. */
  correlationId?: string;
  /** Optional public target identity for presentation and encounter history. */
  targetParticipantId?: string;
  targetName?: string;
  critical?: boolean;
  criticalMultiplier?: number;
  /** Natural result of the effective d20 used by this test, when applicable. */
  natural?: 1 | 20 | null;
};

/**
 * Finds the effective natural d20 represented by a serialized roll result.
 * Dice are consumed in expression order, matching the shared formula roller.
 * Extreme Advantage (`sum-capped`) treats its two d20s as one capped die.
 */
export const getEncounterRollNatural = (
  expression: string,
  rolls: readonly number[],
  rollMode?: EncounterRollResult['rollMode'],
): 1 | 20 | null => {
  const d20Rolls: number[] = [];
  let rollOffset = 0;
  const dicePattern = /(\d*)d(\d+)/gi;
  let match: RegExpExecArray | null;
  while ((match = dicePattern.exec(expression)) !== null) {
    const count = Math.max(1, Math.min(100, Number(match[1] || 1)));
    const sides = Number(match[2]);
    const termRolls = rolls.slice(rollOffset, rollOffset + count);
    if (sides === 20) d20Rolls.push(...termRolls);
    rollOffset += count;
  }
  if (d20Rolls.length === 0) return null;
  if (rollMode === 'sum-capped' && d20Rolls.length >= 2) {
    return Math.min(20, d20Rolls.reduce((total, die) => total + die, 0)) === 20
      ? 20
      : null;
  }
  if (d20Rolls.some((die) => die === 20)) return 20;
  if (d20Rolls.length === 1 && d20Rolls[0] === 1) return 1;
  return null;
};

export const encounterRollSoundKind = (
  result?: EncounterRollResult,
): EncounterSoundEffectKind | null => {
  if (result?.category === 'damage') return null;
  if (
    result?.category === 'attack' &&
    result.critical === true &&
    result.participantId.startsWith('boss:')
  ) return null;
  const natural = result?.category === 'initiative'
    ? null
    : result?.natural ?? (result
      ? getEncounterRollNatural(result.expression, result.rolls, result.rollMode)
      : null);
  if (natural === 1) return 'natural-failure';
  if (natural !== 20) return 'dice-roll';
  if (!result?.participantId.startsWith('boss:')) return 'natural-success-player';
  return result.category === 'attack' ? 'natural-success-enemy' : 'dice-roll';
};

export type EncounterTurnState = {
  connectionPause?: { reason: 'restoring' | 'reconnecting'; names: string[] } | null;
  round: number;
  /** Wall-clock instant when the master started the current battle. */
  startedAt: number | null;
  activeParticipantId: string | null;
  participants: EncounterTurnParticipant[];
  rollResults: EncounterRollResult[];
  /** Authoritative, append-only combat history for the current battle. */
  history: EncounterHistoryEntry[];
  initiativeReady: boolean;
  started: boolean;
  revision: number;
};

export type EncounterTurnActionResult = {
  ok: boolean;
  state?: EncounterTurnState;
  error?: string;
};

export type EncounterFormulaRollRequest = {
  participantId: string;
  label: string;
  formula: string;
  category: EncounterRollResult['category'];
  rollMode?: 'sum' | 'sum-capped';
  /** Links this roll to an opposed or otherwise related action. */
  correlationId?: string;
  targetParticipantId?: string;
  targetName?: string;
};

export type EncounterFormulaRollResult = {
  ok: boolean;
  total?: number;
  resultId?: string;
  error?: string;
};

export type PlayerResourceUse =
  | { kind: 'action-point'; ability: 'intervention' | 'reroll' }
  | { kind: 'hero-point'; ability: 'extreme-advantage' }
  | null;

export type PlayerSkillTestRequest = {
  kind: 'skill';
  skillId: string;
  resource: PlayerResourceUse;
  actionId?: string;
  correlationId?: string;
};

export type PlayerStabilizeRequest = {
  kind: 'stabilize';
  targetPlayerId: string;
  actionId?: string;
  correlationId?: string;
};

export type PlayerAttackSource =
  | { kind: 'sheet'; attackIndex: number }
  | { kind: 'unarmed' };

export type CanonicalAttack = {
  source: PlayerAttackSource;
  name: string;
  attackBonus: number;
  damageFormula: string;
  criticalThreat: number;
  criticalMultiplier: number;
  damageType: string;
  range: string;
  nonlethal: boolean;
};

export const UNARMED_ATTACK = Object.freeze({
  source: { kind: 'unarmed' },
  name: 'Punhos',
  damageFormula: '1d3',
  criticalThreat: 20,
  criticalMultiplier: 2,
  damageType: 'Impacto',
  range: 'Adjacente',
  nonlethal: true,
} as const);

const unarmedDamageDieForSize = (size: string) => {
  const normalized = size.trim().toLocaleLowerCase('pt-BR');
  if (normalized.includes('colossal')) return '1d8';
  if (normalized.includes('enorme')) return '1d6';
  if (normalized.includes('grande')) return '1d4';
  return '1d3';
};

export const createUnarmedAttack = (
  summary: CharacterSheetSummary,
): CanonicalAttack => {
  const strength = summary.attributes.for ?? 0;
  const luta = summary.skills.find(
    ({ id, name }) =>
      id === '190' || name.trim().toLocaleLowerCase('pt-BR') === 'luta',
  )?.total ?? 0;
  const damageDie = unarmedDamageDieForSize(summary.size);
  return {
    ...UNARMED_ATTACK,
    source: { kind: 'unarmed' },
    attackBonus: luta,
    damageFormula:
      strength === 0
        ? damageDie
        : `${damageDie} ${strength > 0 ? '+' : '-'} ${Math.abs(strength)}`,
  };
};

export type PlayerAttackRequest = {
  extraAttackModifier?: number;
  extraDamageModifier?: number;
  kind: 'attack';
  /** @deprecated Prefer attackSource. */
  attackIndex?: number;
  attackSource?: PlayerAttackSource;
  attackType: AttackType;
  targetBossId: string;
  damageFormula: string;
  resource: PlayerResourceUse;
  actionId?: string;
  correlationId?: string;
};

export type PlayerStandaloneResourceRequest =
  | {
    kind: 'resource';
    resource: 'action-point';
    ability: 'protection' | 'recovery';
    actionId?: string;
    correlationId?: string;
  }
  | {
    kind: 'resource';
    resource: 'hero-point';
    ability: 'activate-power';
    actionId?: string;
    correlationId?: string;
  };

export type PlayerCombatActionRequest =
  | PlayerSkillTestRequest
  | PlayerStabilizeRequest
  | PlayerAttackRequest
  | {
    kind: 'damage';
    pendingDamageId: string;
  }
  | PlayerStandaloneResourceRequest;

export type PlayerCombatActionResult = {
  ok: boolean;
  pendingApproval?: boolean;
  pendingDamageId?: string;
  requestId?: string;
  error?: string;
};

export type PendingActionPointRequest = {
  id: string;
  playerId: string;
  playerName: string;
  label: string;
  requestedAt: number;
  actionId?: string;
  kind?: 'action-point' | 'skill-without-standard-action' | 'pre-initiative-action' | 'attack-adjustment';
};

export type PlayerResourceNotice = {
  id: string;
  tone: 'info' | 'approved' | 'rejected' | 'heroic';
  message: string;
  persistent?: boolean;
};

export type PlayerAttackAgainstBossResolution = {
  ok: boolean;
  hit: boolean;
  defense: number;
  appliedDamage: number;
  error?: string;
};

export type ResolvedPlayerAttackAgainstBoss = {
  playerId: string;
  participantId: string;
  targetBossId: string;
  attackType: AttackType;
  attackDie: number;
  attackBonus: number;
  attackTotal: number;
  damage: number;
  damageFormula: string;
  damageRolls: number[];
  critical: boolean;
  criticalMultiplier: number;
};

export type InitiativeActor = Pick<
  EncounterTurnParticipant,
  'id' | 'kind' | 'sourceId' | 'name' | 'initiativeModifier' | 'eligibleRound'
>;

export const emptyEncounterTurnState = (): EncounterTurnState => ({
  round: 0,
  startedAt: null,
  activeParticipantId: null,
  participants: [],
  rollResults: [],
  history: [],
  initiativeReady: true,
  started: false,
  revision: 0,
});

const compareInitiative = (
  left: EncounterTurnParticipant,
  right: EncounterTurnParticipant,
) =>
  right.initiativeTotal - left.initiativeTotal ||
  right.initiativeModifier - left.initiativeModifier ||
  left.id.localeCompare(right.id);

export const rollInitiativeOrder = (
  actors: InitiativeActor[],
  rollD20: () => number,
): EncounterTurnParticipant[] => {
  const participants = actors.map((actor) => {
    const initiativeRoll = Math.max(1, Math.min(20, Math.trunc(rollD20())));
    return {
      ...actor,
      initiativeRoll,
      initiativeTotal: initiativeRoll + actor.initiativeModifier,
      initiativeRolled: true,
      isSelf: false,
    };
  });

  // Tormenta20 desempata primeiro pelo maior valor de Iniciativa. Persistindo
  // o empate, somente os empatados rolam novamente.
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const groups = new Map<string, EncounterTurnParticipant[]>();
    for (const participant of participants) {
      const key = `${participant.initiativeTotal}:${participant.initiativeModifier}`;
      const group = groups.get(key) ?? [];
      group.push(participant);
      groups.set(key, group);
    }
    const tiedGroups = [...groups.values()].filter((group) => group.length > 1);
    if (tiedGroups.length === 0) break;
    for (const group of tiedGroups) {
      for (const participant of group) {
        participant.initiativeRoll = Math.max(
          1,
          Math.min(20, Math.trunc(rollD20())),
        );
        participant.initiativeTotal =
          participant.initiativeRoll + participant.initiativeModifier;
      }
    }
  }
  return participants.sort(compareInitiative);
};

const sortInitiativeParticipants = (
  participants: EncounterTurnParticipant[],
) => participants.sort((left, right) => {
  const leftRolled = left.initiativeRolled !== false;
  const rightRolled = right.initiativeRolled !== false;
  if (leftRolled !== rightRolled) {
    return leftRolled ? -1 : 1;
  }
  return leftRolled
    ? compareInitiative(left, right)
    : left.id.localeCompare(right.id);
});

export const prepareManualInitiative = (
  actors: InitiativeActor[],
  existingParticipants: EncounterTurnParticipant[] = [],
): EncounterTurnParticipant[] => {
  const existingById = new Map(
    existingParticipants.map((participant) => [participant.id, participant]),
  );
  return sortInitiativeParticipants(actors.map((actor) => {
    const existing = existingById.get(actor.id);
    const initiativeRolled = existing?.initiativeRolled ??
      Boolean(existing && existing.initiativeRoll > 0);
    const initiativeRoll = initiativeRolled ? existing?.initiativeRoll ?? 0 : 0;
    return {
      ...actor,
      initiativeRoll,
      initiativeTotal: initiativeRolled
        ? initiativeRoll + actor.initiativeModifier
        : 0,
      initiativeRolled,
      isSelf: existing?.isSelf ?? false,
    };
  }));
};

export type ManualInitiativeRoll = {
  state: EncounterTurnState;
  participant: EncounterTurnParticipant;
  tiedParticipantIds: string[];
};

export const rollManualInitiative = (
  state: EncounterTurnState,
  participantId: string,
  rollD20: () => number,
): ManualInitiativeRoll | null => {
  if (!state.participants.length) return null;
  const participantIndex = state.participants.findIndex(
    ({ id }) => id === participantId,
  );
  if (
    participantIndex < 0 ||
    state.participants[participantIndex].initiativeRolled !== false ||
    (
      state.started &&
      state.participants[participantIndex].eligibleRound <= state.round
    )
  ) {
    return null;
  }
  const initiativeRoll = Math.max(1, Math.min(20, Math.trunc(rollD20())));
  const rolledParticipant = {
    ...state.participants[participantIndex],
    initiativeRoll,
    initiativeTotal:
      initiativeRoll + state.participants[participantIndex].initiativeModifier,
    initiativeRolled: true,
  };
  const participants = state.participants.map((participant, index) =>
    index === participantIndex ? rolledParticipant : participant);
  const allRolled = participants.every(
    ({ initiativeRolled }) => initiativeRolled !== false,
  );
  const tiedParticipantIds: string[] = [];
  // The opening initiative resolves ties exactly as the manual describes.
  // A late entrant is inserted for the next round without invalidating rolls
  // that the rest of the table already completed.
  if (allRolled && !state.started) {
    const groups = new Map<string, EncounterTurnParticipant[]>();
    for (const participant of participants) {
      const key = `${participant.initiativeTotal}:${participant.initiativeModifier}`;
      const group = groups.get(key) ?? [];
      group.push(participant);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      if (group.length > 1) {
        tiedParticipantIds.push(...group.map(({ id }) => id));
      }
    }
  }
  const tiedIds = new Set(tiedParticipantIds);
  const nextParticipants = participants.map((participant) =>
    tiedIds.has(participant.id)
      ? {
        ...participant,
        initiativeRoll: 0,
        initiativeTotal: 0,
        initiativeRolled: false,
      }
      : participant);
  return {
    participant: rolledParticipant,
    tiedParticipantIds,
    state: {
      ...state,
      participants: sortInitiativeParticipants(nextParticipants),
      initiativeReady:
        tiedParticipantIds.length === 0 &&
        nextParticipants.every(({ initiativeRolled }) => initiativeRolled !== false),
      revision: state.revision + 1,
    },
  };
};

export const beginEncounterTurns = (
  state: EncounterTurnState,
): EncounterTurnState => {
  if (
    state.started ||
    state.participants.length === 0 ||
    state.initiativeReady === false ||
    state.participants.some(({ initiativeRolled }) => initiativeRolled === false)
  ) return state;
  const first = state.participants.find(({ eligibleRound }) => eligibleRound <= 1);
  if (!first) return state;
  const round = 1;
  return {
    ...state,
    round,
    activeParticipantId: first.id,
    rollResults: (state.rollResults ?? []).filter(
      ({ category }) => category !== 'initiative',
    ),
    history: [
      ...(state.history ?? []),
      ...historyEntriesForTurn(
        round,
        first.id,
        state.participants,
        state.round,
      ),
    ],
    started: true,
    revision: state.revision + 1,
  };
};

const DICE_TERM_PATTERN = /([+-]?)\s*(\d+)d(\d+)/gi;

export const diceTermsOnly = (expression: string) => {
  const terms = [...expression.matchAll(DICE_TERM_PATTERN)];
  return terms.map((match, index) => {
    const sign = match[1] === '-'
      ? '-'
      : index === 0 ? '' : '+';
    return `${sign}${match[2]}d${match[3]}`;
  }).join(' ');
};

export const formatEncounterDiceRolls = (
  expression: string,
  rolls: number[],
) => {
  const terms = [...expression.matchAll(DICE_TERM_PATTERN)];
  if (terms.length === 0) {
    return rolls.length > 0
      ? `D(${rolls.map((roll) => Math.abs(roll)).join(', ')})`
      : 'D(—)';
  }
  let rollIndex = 0;
  return terms.map((match, index) => {
    const count = Number(match[2]);
    const termRolls = rolls
      .slice(rollIndex, rollIndex + count)
      .map((roll) => Math.abs(roll));
    rollIndex += count;
    const sign = match[1] === '-'
      ? '− '
      : index === 0 ? '' : '+ ';
    return `${sign}${count}d${match[3]}(${termRolls.join(', ') || '—'})`;
  }).join(' ');
};

export const normalizeEncounterFormulaRequest = (
  value: unknown,
): EncounterFormulaRollRequest | null => {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<EncounterFormulaRollRequest>;
  if (
    typeof candidate.participantId !== 'string' ||
    candidate.participantId.length < 1 ||
    candidate.participantId.length > 160 ||
    typeof candidate.label !== 'string' ||
    candidate.label.trim().length < 1 ||
    candidate.label.trim().length > 60 ||
    typeof candidate.formula !== 'string' ||
    !parseDamageFormula(candidate.formula) ||
    !['initiative', 'test', 'attack', 'damage', 'status'].includes(
      candidate.category ?? '',
    ) ||
    (candidate.rollMode !== undefined &&
      candidate.rollMode !== 'sum' &&
      candidate.rollMode !== 'sum-capped') ||
    !isSafeActionIdentity(candidate.correlationId) ||
    !isSafeActionIdentity(candidate.targetParticipantId) ||
    (candidate.targetName !== undefined && (
      typeof candidate.targetName !== 'string' ||
      candidate.targetName.trim().length < 1 ||
      candidate.targetName.trim().length > 80
    ))
  ) return null;
  return {
    participantId: candidate.participantId,
    label: candidate.label.trim(),
    formula: normalizeDamageFormula(candidate.formula)!,
    category: candidate.category!,
    ...(candidate.rollMode === 'sum-capped'
      ? { rollMode: 'sum-capped' as const }
      : {}),
    ...(candidate.correlationId === undefined
      ? {}
      : { correlationId: candidate.correlationId }),
    ...(candidate.targetParticipantId === undefined
      ? {}
      : { targetParticipantId: candidate.targetParticipantId }),
    ...(candidate.targetName === undefined
      ? {}
      : { targetName: candidate.targetName.trim() }),
  };
};

export const linkEncounterRollCorrelation = (
  results: EncounterRollResult[],
  correlationId: string | undefined,
): EncounterRollResult[] => {
  if (correlationId === undefined) return results;
  let changed = false;
  const linkedResults = results.map((result) => {
    if (result.correlationId === correlationId) return result;
    if (result.actionId !== correlationId && result.id !== correlationId) {
      return result;
    }
    changed = true;
    return { ...result, correlationId };
  });
  return changed ? linkedResults : results;
};

export const advanceEncounterTurns = (
  state: EncounterTurnState,
): EncounterTurnState => {
  if (!state.started) return beginEncounterTurns(state);
  if (state.participants.length === 0) {
    return state.activeParticipantId === null
      ? state
      : {
        ...state,
        activeParticipantId: null,
        revision: state.revision + 1,
      };
  }
  const activeIndex = state.participants.findIndex(
    ({ id }) => id === state.activeParticipantId,
  );
  const remainingRollResults = (state.rollResults ?? []).filter(
    ({ retainedByParticipantId }) =>
      retainedByParticipantId !== state.activeParticipantId,
  );
  if (activeIndex < 0) {
    const currentRoundParticipant = state.participants.find(
      ({ eligibleRound }) => eligibleRound <= state.round,
    );
    const nextParticipant = currentRoundParticipant ?? state.participants[0];
    return {
      ...state,
      round: Math.max(state.round, nextParticipant.eligibleRound),
      activeParticipantId: nextParticipant.id,
      rollResults: remainingRollResults,
      history: [
        ...(state.history ?? []),
        ...historyEntriesForTurn(
          Math.max(state.round, nextParticipant.eligibleRound),
          nextParticipant.id,
          state.participants,
          state.round,
        ),
      ],
      revision: state.revision + 1,
    };
  }
  for (let offset = 1; offset <= state.participants.length; offset += 1) {
    const index = (activeIndex + offset) % state.participants.length;
    const wrapped = index <= activeIndex;
    const candidateRound = state.round + (wrapped ? 1 : 0);
    const candidate = state.participants[index];
    if (candidate.eligibleRound <= candidateRound) {
      return {
        ...state,
        round: candidateRound,
        activeParticipantId: candidate.id,
        rollResults: remainingRollResults,
        history: [
          ...(state.history ?? []),
          ...historyEntriesForTurn(
            candidateRound,
            candidate.id,
            state.participants,
            state.round,
          ),
        ],
        revision: state.revision + 1,
      };
    }
  }
  return state;
};

export const personalizeEncounterTurnState = (
  state: EncounterTurnState,
  viewerSourceId: string | null,
  hiddenParticipantIds: ReadonlySet<string> = new Set(),
  revealAll = false,
): EncounterTurnState => {
  const participantKindById = new Map(
    state.participants.map(({ id, kind }) => [id, kind]),
  );
  return {
    ...state,
    participants: state.participants.map((participant) => {
      const concealed = !revealAll && (
        participant.kind === 'boss' ||
        hiddenParticipantIds.has(participant.id)
      );
      return {
        ...participant,
        initiativeModifier: concealed ? 0 : participant.initiativeModifier,
        initiativeTotal: concealed ? 0 : participant.initiativeTotal,
        initiativeHidden: concealed,
        isSelf:
          participant.kind === 'player' &&
          participant.sourceId === viewerSourceId,
      };
    }),
    rollResults: state.rollResults.map((result) => {
      const visibility: EncounterRollVisibility = revealAll
        ? 'full'
        : hiddenParticipantIds.has(result.participantId) ||
            participantKindById.get(result.participantId) === 'boss'
          ? result.category === 'damage' ? 'dice-and-total' : 'dice-only'
          : 'full';
      if (visibility === 'full') return { ...result, visibility };
      return {
        ...result,
        expression: diceTermsOnly(result.expression),
        modifier: 0,
        total: visibility === 'dice-and-total' ? result.total : 0,
        outcome: 'neutral',
        visibility,
      };
    }),
    history: (state.history ?? []).map((entry) => {
      if (entry.kind === 'damage') return entry;
      if (entry.kind === 'heal') {
        const targetHidden = Boolean(
          entry.targetParticipantId && hiddenParticipantIds.has(entry.targetParticipantId),
        );
        if (!revealAll && targetHidden) {
          return {
            ...entry,
            detail: entry.detail.replace(/[-+−]?\d+\s*PV/u, '??? PV'),
          };
        }
        return entry;
      }
      if (entry.kind !== 'roll' && entry.kind !== 'status') return entry;
      const visibility: EncounterRollVisibility = revealAll
        ? 'full'
        : entry.actorParticipantId && (
          hiddenParticipantIds.has(entry.actorParticipantId) ||
          participantKindById.get(entry.actorParticipantId) === 'boss'
        )
          ? entry.rollCategory === 'damage' ? 'dice-and-total' : 'dice-only'
          : 'full';
      if (visibility === 'full') return { ...entry, visibility };
      return {
        ...entry,
        expression: diceTermsOnly(entry.expression ?? ''),
        modifier: 0,
        total: visibility === 'dice-and-total' ? entry.total ?? 0 : 0,
        outcome: 'neutral' as const,
        visibility,
      };
    }),
  };
};

export type AreaDamageRequest = {
  damage: number;
  damageFormula?: string;
  /** Splits the resolved total into this many consecutive impacts. */
  hits?: number;
  reflexDc: number;
  /**
   * Compatibility fallback until class powers are represented explicitly.
   * New callers must not choose this per attack; the affected character's
   * abilities will own this rule.
   */
  successRule?: AreaDamageSuccessRule;
  playerIds?: string[];
  attackerParticipantId?: string;
  actionId?: string;
  correlationId?: string;
};

export type AreaDamageResult = {
  ok: boolean;
  appliedPlayers: number;
  skippedPlayers: string[];
  rolledDamage?: number;
  error?: string;
};

export type DirectPlayerDamageRequest = {
  independentHits?: boolean;
  statusEffects?: import('./boss-attacks').AttackStatusEffect[];
  bossTargetIds?: string[];
  playerIds: string[];
  damage: number;
  damageFormula?: string;
  /** Splits the resolved total into this many consecutive impacts. */
  hits?: number;
  attackType?: AttackType;
  attackBonus?: number;
  attackName?: string;
  criticalThreat?: number;
  criticalMultiplier?: number;
  extremeAdvantage?: boolean;
  attackerParticipantId?: string;
  actionId?: string;
  correlationId?: string;
  /** Runs the attack check now and waits for an explicit damage command. */
  deferDamage?: boolean;
};

export type PlayerStatusRequest = {
  playerIds: string[];
  status: ActiveBossStatus;
};

export type PlayerTargetActionResult = {
  ok: boolean;
  appliedPlayers: number;
  skippedPlayers: string[];
  missedPlayers?: string[];
  rolledDamage?: number;
  pendingDamageId?: string;
  impacts?: Array<{
    playerId: string;
    hit: boolean;
    appliedDamage: number;
    healthBefore: number;
    healthAfter: number;
    critical: boolean;
  }>;
  error?: string;
};

export type PlayerAreaDamageImpact = {
  id: number;
  playerState: PlayerEncounterState;
  check: {
    die: number;
    reflex: number;
    total: number;
    dc: number;
    success: boolean;
    natural: 1 | 20 | null;
  };
  damage: {
    requested: number;
    applied: number;
    healthBefore: number;
    healthAfter: number;
    successRule: AreaDamageSuccessRule;
  };
};

export const isAreaDamageRequest = (value: unknown): value is AreaDamageRequest => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AreaDamageRequest>;
  const formula = candidate.damageFormula === undefined
    ? null
    : typeof candidate.damageFormula === 'string'
      ? normalizeDamageFormula(candidate.damageFormula)
      : null;
  return Number.isInteger(candidate.damage) && (candidate.damage ?? 0) >= 0 &&
    (candidate.damage ?? 0) <= 999_999 &&
    (
      (candidate.damage ?? 0) > 0 ||
      Boolean(formula)
    ) &&
    (
      candidate.damageFormula === undefined ||
      formula !== null
    ) &&
    (
      candidate.hits === undefined ||
      (
        Number.isInteger(candidate.hits) &&
        (candidate.hits ?? 0) >= 1 &&
        (candidate.hits ?? 0) <= 1_000
      )
    ) &&
    Number.isInteger(candidate.reflexDc) && (candidate.reflexDc ?? 0) >= 0 &&
    (candidate.reflexDc ?? 0) <= 999 &&
    (
      candidate.successRule === undefined ||
      candidate.successRule === 'half' ||
      candidate.successRule === 'none'
    ) &&
    (
      candidate.playerIds === undefined ||
      (
        Array.isArray(candidate.playerIds) &&
        candidate.playerIds.length <= 10 &&
        candidate.playerIds.every(
          (id) => typeof id === 'string' && id.length > 0 && id.length <= 128,
        )
      )
    ) &&
    (
      candidate.attackerParticipantId === undefined ||
      (
        typeof candidate.attackerParticipantId === 'string' &&
        candidate.attackerParticipantId.length > 0 &&
        candidate.attackerParticipantId.length <= 160
      )
    ) &&
    isSafeActionIdentity(candidate.actionId) &&
    isSafeActionIdentity(candidate.correlationId);
};

export const isDirectPlayerDamageRequest = (
  value: unknown,
): value is DirectPlayerDamageRequest => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DirectPlayerDamageRequest>;
  if (candidate.independentHits !== undefined && typeof candidate.independentHits !== 'boolean') return false;
  if (candidate.independentHits && (candidate.hits ?? 1) > 20) return false;
  if (candidate.statusEffects !== undefined && (!Array.isArray(candidate.statusEffects) || candidate.statusEffects.length > 10 || !candidate.statusEffects.every(isAttackStatusEffect))) return false;
  if (candidate.bossTargetIds !== undefined && (!Array.isArray(candidate.bossTargetIds) || candidate.bossTargetIds.length > 3 || !candidate.bossTargetIds.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 128))) return false;
  const hasAttackCheck =
    candidate.attackType !== undefined ||
    candidate.attackBonus !== undefined ||
    candidate.attackerParticipantId !== undefined;
  return Array.isArray(candidate.playerIds) &&
    candidate.playerIds.length > 0 &&
    candidate.playerIds.length <= 10 &&
    candidate.playerIds.every(
      (id) => typeof id === 'string' && id.length > 0 && id.length <= 128,
    ) &&
    Number.isInteger(candidate.damage) &&
    (candidate.damage ?? 0) >= 0 &&
    (candidate.damage ?? 0) <= 999_999 &&
    (
      (candidate.damage ?? 0) > 0 ||
      (
        typeof candidate.damageFormula === 'string' &&
        Boolean(normalizeDamageFormula(candidate.damageFormula))
      )
    ) &&
    (
      candidate.damageFormula === undefined ||
      (
        typeof candidate.damageFormula === 'string' &&
        Boolean(normalizeDamageFormula(candidate.damageFormula))
      )
    ) &&
    (
      candidate.hits === undefined ||
      (
        Number.isInteger(candidate.hits) &&
        (candidate.hits ?? 0) >= 1 &&
        (candidate.hits ?? 0) <= 1_000
      )
    ) &&
    (!hasAttackCheck || (
      (candidate.attackType === 'melee' || candidate.attackType === 'ranged') &&
      Number.isInteger(candidate.attackBonus) &&
      (candidate.attackBonus ?? 0) >= -999 &&
      (candidate.attackBonus ?? 0) <= 999 &&
      typeof candidate.attackerParticipantId === 'string' &&
      candidate.attackerParticipantId.length > 0 &&
      candidate.attackerParticipantId.length <= 160 &&
      (candidate.attackName === undefined ||
        (typeof candidate.attackName === 'string' && candidate.attackName.length <= 60)) &&
      (candidate.criticalThreat === undefined ||
        (Number.isInteger(candidate.criticalThreat) &&
          (candidate.criticalThreat ?? 0) >= 2 &&
          (candidate.criticalThreat ?? 0) <= 20)) &&
      (candidate.criticalMultiplier === undefined ||
        (Number.isInteger(candidate.criticalMultiplier) &&
          (candidate.criticalMultiplier ?? 0) >= 2 &&
          (candidate.criticalMultiplier ?? 0) <= 10)) &&
      (candidate.extremeAdvantage === undefined ||
        typeof candidate.extremeAdvantage === 'boolean')
    )) &&
    (candidate.deferDamage === undefined || typeof candidate.deferDamage === 'boolean') &&
    isSafeActionIdentity(candidate.actionId) &&
    isSafeActionIdentity(candidate.correlationId);
};

export const resolveAttackCheck = (
  attackBonus: number,
  defense: number,
  die: number,
) => {
  const check = resolveD20Check(die, attackBonus, defense);
  return {
    die: check.die,
    attackBonus: check.modifier,
    defense: check.difficulty,
    total: check.total,
    success: check.success,
    natural: check.natural,
  };
};

/** A threat-range result is critical only after the attack itself succeeds. */
export const isCriticalAttack = (
  attackSucceeded: boolean,
  effectiveDie: number,
  criticalThreat: number,
) => attackSucceeded &&
  Math.max(1, Math.min(20, Math.trunc(effectiveDie))) >=
    Math.max(2, Math.min(20, Math.trunc(criticalThreat)));

/**
 * Extrema Vantagem treats two d20 results as one effective natural result.
 * Their sum is capped at 20, so it can threaten a critical without ever
 * producing a natural 1.
 */
export const resolveExtremeAdvantage = (
  firstDie: number,
  secondDie: number,
) => {
  const rolls = [firstDie, secondDie].map((die) =>
    Math.max(1, Math.min(20, Math.trunc(die))));
  return {
    rolls,
    chosenDie: Math.min(20, rolls[0] + rolls[1]),
  };
};

export const normalizeActionPointCount = (
  points: unknown,
  legacyAvailable: unknown = true,
) => Number.isInteger(points)
  ? Math.max(0, Math.min(5, Number(points)))
  : legacyAvailable === false ? 0 : 1;

export const normalizeHeroPointCount = (
  points: unknown,
  legacyAvailable: unknown = false,
) => Number.isInteger(points)
  ? Math.max(0, Math.min(1, Number(points)))
  : legacyAvailable === true ? 1 : 0;

/**
 * Splits an authoritative total into a stable number of consecutive impacts.
 * Remainders are assigned to the earliest impacts, so the sum is always
 * exactly the requested total instead of being inflated by per-hit rounding.
 */
export const splitDamageIntoHits = (
  total: number,
  hits: number,
): number[] => {
  const normalizedTotal = Math.max(0, Math.min(999_999, Math.trunc(total)));
  const normalizedHits = Math.max(1, Math.min(1_000, Math.trunc(hits)));
  const base = Math.floor(normalizedTotal / normalizedHits);
  const remainder = normalizedTotal % normalizedHits;
  return Array.from(
    { length: normalizedHits },
    (_, index) => base + (index < remainder ? 1 : 0),
  );
};

export const parseCriticalProfile = (
  value: string | null | undefined,
): { threat: number; multiplier: number } => {
  const normalized = String(value ?? '').trim().toLocaleLowerCase('pt-BR');
  const multiplierMatch = normalized.match(/x\s*(\d+)/i);
  const threatMatch = normalized.match(/(?:^|[^\d])(1\d|20)(?:\s*-\s*20)?/);
  return {
    threat: threatMatch
      ? Math.max(2, Math.min(20, Number(threatMatch[1])))
      : 20,
    multiplier: multiplierMatch
      ? Math.max(2, Math.min(10, Number(multiplierMatch[1])))
      : 2,
  };
};

const standardAttackTestFormula = () => parseDamageFormula('1d20') as ParsedDamageFormula;

/**
 * Reads the weapon's "Teste de ataque" field. A legacy standalone modifier is
 * kept compatible as 1d20 + modifier; empty, malformed or non-d20 formulas
 * safely fall back to the standard 1d20 test.
 */
export const parseAttackTestFormula = (
  value: string | null | undefined,
): ParsedDamageFormula => {
  const source = String(value ?? '').trim();
  if (!source) return standardAttackTestFormula();
  const parsed = parseDamageFormula(source);
  if (!parsed) return standardAttackTestFormula();
  if (parsed.kind === 'fixed') {
    return parseDamageFormula(
      `1d20 ${parsed.value >= 0 ? '+' : '-'} ${Math.abs(parsed.value)}`,
    ) ?? standardAttackTestFormula();
  }
  const terms = parsed.kind === 'dice'
    ? [{ diceCount: parsed.diceCount, sides: parsed.sides, sign: 1 as const }]
    : parsed.terms;
  return terms.some(({ sides, sign }) => sides === 20 && sign > 0)
    ? parsed
    : standardAttackTestFormula();
};

export const attackTestFormulaExpression = (
  formula: ParsedDamageFormula,
  skillValue: number,
  primaryD20Count = 1,
  includeIntervention = false,
) => {
  const normalized = formula.kind === 'fixed'
    ? '1d20'
    : normalizeDamageFormula(
      formula.kind === 'dice'
        ? `${formula.diceCount}d${formula.sides}${
          formula.modifier === 0
            ? ''
            : ` ${formula.modifier > 0 ? '+' : '-'} ${Math.abs(formula.modifier)}`
        }`
        : `${formula.terms.map((term, index) => `${
          index === 0 ? (term.sign < 0 ? '-' : '') : term.sign > 0 ? ' + ' : ' - '
        }${term.diceCount}d${term.sides}`).join('')}${
          formula.modifier === 0
            ? ''
            : ` ${formula.modifier > 0 ? '+' : '-'} ${Math.abs(formula.modifier)}`
        }`,
    ) ?? '1d20';
  const withPrimaryDice = normalized.replace(
    /\b(\d+)d20\b/i,
    (_, originalCount: string) => `${Math.max(
      1,
      Number(originalCount) - 1 + primaryD20Count,
    )}d20`,
  );
  return `${withPrimaryDice} ${skillValue >= 0 ? '+' : '-'} ${Math.abs(skillValue)}${
    includeIntervention ? ' + 1d6' : ''
  }`;
};

/** Rolls every die in an attack-test expression except its first positive d20. */
export const rollAttackTestExtraDice = (
  formula: ParsedDamageFormula,
  randomInteger: (minimum: number, maximumExclusive: number) => number,
) => {
  if (formula.kind === 'fixed') return { total: formula.value, rolls: [] as number[] };
  const terms = formula.kind === 'dice'
    ? [{ diceCount: formula.diceCount, sides: formula.sides, sign: 1 as const }]
    : formula.terms;
  const rolls: number[] = [];
  let total = formula.modifier;
  let primaryD20Skipped = false;
  for (const term of terms) {
    for (let index = 0; index < term.diceCount; index += 1) {
      if (!primaryD20Skipped && term.sign > 0 && term.sides === 20) {
        primaryD20Skipped = true;
        continue;
      }
      const roll = randomInteger(1, term.sides + 1);
      if (!Number.isInteger(roll) || roll < 1 || roll > term.sides) {
        throw new RangeError('A fonte aleatória retornou um resultado inválido.');
      }
      const signedRoll = roll * term.sign;
      rolls.push(signedRoll);
      total += signedRoll;
    }
  }
  return { total, rolls };
};

/**
 * Tormenta20 critical damage repeats only the weapon dice. Static modifiers
 * are added once after every repeated die has been rolled.
 */
export const rollCriticalDamageFormulaDetailed = (
  formula: ParsedDamageFormula,
  multiplier: number,
  randomInteger: (minimum: number, maximumExclusive: number) => number,
): DamageFormulaRoll => {
  const normalizedMultiplier = Math.max(1, Math.min(10, Math.trunc(multiplier)));
  if (formula.kind === 'fixed') {
    return { total: formula.value, rolls: [], modifier: formula.value };
  }
  const terms = formula.kind === 'dice'
    ? [{ diceCount: formula.diceCount, sides: formula.sides, sign: 1 as const }]
    : formula.terms;
  const rolls: number[] = [];
  let total = formula.modifier;
  let weaponDiceRepeated = false;
  for (const term of terms) {
    const repeats = !weaponDiceRepeated && term.sign > 0
      ? normalizedMultiplier
      : 1;
    if (!weaponDiceRepeated && term.sign > 0) weaponDiceRepeated = true;
    for (
      let die = 0;
      die < term.diceCount * repeats;
      die += 1
    ) {
      const result = randomInteger(1, term.sides + 1);
      if (!Number.isInteger(result) || result < 1 || result > term.sides) {
        throw new RangeError('A fonte aleatória retornou um resultado inválido.');
      }
      const signed = result * term.sign;
      rolls.push(signed);
      total += signed;
    }
  }
  return {
    total: Math.max(0, Math.min(999_999, total)),
    rolls,
    modifier: formula.modifier,
  };
};

/**
 * Expands the first positive dice term so the critical calculation can show
 * every extra weapon die that was actually rolled. Other dice and the static
 * modifier remain unchanged, matching Tormenta20 critical damage.
 */
export const criticalDamageExpression = (
  formula: ParsedDamageFormula,
  multiplier: number,
) => {
  if (formula.kind === 'fixed') return String(formula.value);
  const normalizedMultiplier = Math.max(1, Math.min(10, Math.trunc(multiplier)));
  const terms = formula.kind === 'dice'
    ? [{ diceCount: formula.diceCount, sides: formula.sides, sign: 1 as const }]
    : formula.terms;
  let weaponDiceExpanded = false;
  const diceExpression = terms.map((term, index) => {
    const isWeaponDice = !weaponDiceExpanded && term.sign > 0;
    if (isWeaponDice) weaponDiceExpanded = true;
    const count = term.diceCount * (isWeaponDice ? normalizedMultiplier : 1);
    const operator = index === 0
      ? ''
      : term.sign > 0 ? ' + ' : ' - ';
    return `${operator}${count}d${term.sides}`;
  }).join('');
  if (formula.modifier === 0) return diceExpression;
  return `${diceExpression} ${formula.modifier > 0 ? '+' : '-'} ${Math.abs(formula.modifier)}`;
};

const isSafeActionIdentity = (value: unknown) =>
  value === undefined ||
  (
    typeof value === 'string' &&
    value.length >= 8 &&
    value.length <= 128 &&
    /^[A-Za-z0-9:_-]+$/.test(value)
  );

export const isPlayerCombatActionRequest = (
  value: unknown,
): value is PlayerCombatActionRequest => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PlayerCombatActionRequest> & {
    resource?: PlayerResourceUse;
    ability?: string;
  };
  if (candidate.kind === 'skill') {
    const skill = candidate as Partial<PlayerSkillTestRequest>;
    return typeof skill.skillId === 'string' &&
      skill.skillId.length > 0 &&
      skill.skillId.length <= 80 &&
      isPlayerResourceUse(skill.resource) &&
      isSafeActionIdentity(skill.actionId) &&
      isSafeActionIdentity(skill.correlationId);
  }
  if (candidate.kind === 'stabilize') {
    const stabilize = candidate as Partial<PlayerStabilizeRequest>;
    return typeof stabilize.targetPlayerId === 'string' &&
      stabilize.targetPlayerId.length > 0 &&
      stabilize.targetPlayerId.length <= 128 &&
      isSafeActionIdentity(stabilize.actionId) &&
      isSafeActionIdentity(stabilize.correlationId);
  }
  if (candidate.kind === 'attack') {
    const attack = candidate as Partial<PlayerAttackRequest>;
    if ([attack.extraAttackModifier, attack.extraDamageModifier].some((value) => value !== undefined && (!Number.isInteger(value) || Math.abs(value) > 999))) return false;
    const source = attack.attackSource ??
      (
        Number.isInteger(attack.attackIndex)
          ? { kind: 'sheet' as const, attackIndex: attack.attackIndex! }
          : null
      );
    const sourceIsValid = source?.kind === 'unarmed' ||
      (
        source?.kind === 'sheet' &&
        Number.isInteger(source.attackIndex) &&
        source.attackIndex >= 0 &&
        source.attackIndex < 5
      );
    return sourceIsValid &&
      (attack.attackType === 'melee' || attack.attackType === 'ranged') &&
      typeof attack.targetBossId === 'string' &&
      attack.targetBossId.length > 0 &&
      attack.targetBossId.length <= 128 &&
      typeof attack.damageFormula === 'string' &&
      Boolean(normalizeDamageFormula(attack.damageFormula)) &&
      isPlayerResourceUse(attack.resource) &&
      isSafeActionIdentity(attack.actionId) &&
      isSafeActionIdentity(attack.correlationId);
  }
  if (candidate.kind === 'damage') {
    const damage = candidate as { pendingDamageId?: unknown };
    return typeof damage.pendingDamageId === 'string' &&
      damage.pendingDamageId.length >= 8 &&
      damage.pendingDamageId.length <= 128 &&
      /^[A-Za-z0-9:_-]+$/.test(damage.pendingDamageId);
  }
  if (candidate.kind === 'resource') {
    return isSafeActionIdentity(
      (candidate as { actionId?: unknown }).actionId,
    ) && isSafeActionIdentity(
      (candidate as { correlationId?: unknown }).correlationId,
    ) && (
      (
        candidate.resource === 'action-point' &&
        (candidate.ability === 'protection' || candidate.ability === 'recovery')
      ) || (
        candidate.resource === 'hero-point' &&
        candidate.ability === 'activate-power'
      )
    );
  }
  return false;
};

const isPlayerResourceUse = (value: unknown): value is PlayerResourceUse =>
  value === null ||
  (
    Boolean(value) &&
    typeof value === 'object' &&
    (
      (
        (value as { kind?: unknown }).kind === 'action-point' &&
        (
          (value as { ability?: unknown }).ability === 'intervention' ||
          (value as { ability?: unknown }).ability === 'reroll'
        )
      ) ||
      (
        (value as { kind?: unknown }).kind === 'hero-point' &&
        (value as { ability?: unknown }).ability === 'extreme-advantage'
      )
    )
  );

export const actionPointRecoveryFormulas = (level: number | null) => {
  const normalizedLevel = Math.max(1, Math.min(20, Math.trunc(level ?? 1)));
  if (normalizedLevel >= 17) return { tier: 'Lenda', health: '8d8 + 8', mana: '4d4 + 4' };
  if (normalizedLevel >= 11) return { tier: 'Campeão', health: '6d8 + 6', mana: '3d4 + 3' };
  if (normalizedLevel >= 5) return { tier: 'Veterano', health: '4d8 + 4', mana: '2d4 + 2' };
  return { tier: 'Iniciante', health: '2d8 + 2', mana: '1d4 + 1' };
};

export const resolveAreaDamage = (
  state: PlayerEncounterState,
  request: AreaDamageRequest,
  die: number,
  id: number,
): PlayerAreaDamageImpact => {
  if (!isAreaDamageRequest(request)) throw new Error('O dano em área é inválido.');
  if (!Number.isInteger(die) || die < 1 || die > 20) throw new Error('A rolagem de Reflexos é inválida.');
  const helpless = state.dead || state.currentHealth <= 0 ||
    state.statuses.some(({ statusId }) => statusId === 'indefeso');
  const check = resolveD20Check(die, state.reflex, request.reflexDc);
  const total = check.total;
  const success = helpless ? false : check.success;
  // Until class powers are modeled, Reflexos uses the system fallback. The
  // attack itself no longer decides between half and zero damage.
  const successRule = request.successRule ?? 'half';
  const applied = success
    ? successRule === 'none' ? 0 : Math.ceil(request.damage / 2)
    : request.damage;
  const healthBefore = Math.min(state.maxHealth, state.currentHealth);
  const transition = applyPlayerDamage(
    { ...state, currentHealth: healthBefore },
    applied,
  );
  const playerState = transition.state;
  const healthAfter = playerState.currentHealth;
  return {
    id,
    playerState,
    check: {
      die,
      reflex: state.reflex,
      total,
      dc: request.reflexDc,
      success,
      natural: die === 1 || die === 20 ? die : null,
    },
    damage: {
      requested: request.damage,
      applied,
      healthBefore,
      healthAfter,
      successRule,
    },
  };
};
