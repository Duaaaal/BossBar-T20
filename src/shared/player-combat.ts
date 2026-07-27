import type { CharacterSheetSummary } from './character-sheet';
import type { ActiveBossStatus } from './status';
import {
  normalizeDamageFormula,
  parseDamageFormula,
} from './status.ts';

export type AreaDamageSuccessRule = 'half' | 'none';
export type AttackType = 'melee' | 'ranged';

export type PlayerEncounterState = {
  clientId: string;
  characterName: string;
  currentHealth: number;
  maxHealth: number;
  currentMana: number;
  maxMana: number;
  defenseMelee: number;
  defenseRanged: number;
  reflex: number;
  statuses: ActiveBossStatus[];
  actionPointAvailable: boolean;
  heroPointAvailable: boolean;
  temporaryDefenseBonus: number;
  protectionExpiresAtRound: number | null;
  revision: number;
};

export type PlayerHudActionState = {
  free: boolean;
  movement: boolean;
  standard: boolean;
};

export type PlayerActionKind = keyof PlayerHudActionState;

export type PlayerHudState = {
  id: string;
  characterName: string;
  isSelf: boolean;
  privateMode: boolean;
  redacted: boolean;
  currentHealth: number | null;
  maxHealth: number | null;
  currentMana: number | null;
  maxMana: number | null;
  defenseMelee: number | null;
  defenseRanged: number | null;
  statuses: ActiveBossStatus[];
  actionPointAvailable: boolean | null;
  heroPointAvailable: boolean | null;
  temporaryDefenseBonus: number | null;
  summary: CharacterSheetSummary | null;
  actions: PlayerHudActionState;
  revision: number;
};

export type EncounterActorKind = 'player' | 'boss' | 'npc';

export type EncounterTurnParticipant = {
  id: string;
  kind: EncounterActorKind;
  sourceId: string;
  name: string;
  initiativeModifier: number;
  initiativeRoll: number;
  initiativeTotal: number;
  initiativeRolled?: boolean;
  eligibleRound: number;
  isSelf: boolean;
  initiativeHidden?: boolean;
};

export type EncounterRollOutcome = 'success' | 'failure' | 'neutral';

export type EncounterRollVisibility = 'full' | 'dice-only' | 'hidden';

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
  rollMode?: 'sum' | 'keep-highest';
};

export type EncounterTurnState = {
  round: number;
  activeParticipantId: string | null;
  participants: EncounterTurnParticipant[];
  rollResults: EncounterRollResult[];
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
};

export type EncounterFormulaRollResult = {
  ok: boolean;
  total?: number;
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
};

export type PlayerAttackRequest = {
  kind: 'attack';
  attackIndex: number;
  attackType: AttackType;
  targetBossId: string;
  damageFormula: string;
  resource: PlayerResourceUse;
};

export type PlayerStandaloneResourceRequest =
  | {
    kind: 'resource';
    resource: 'action-point';
    ability: 'protection' | 'recovery';
  }
  | {
    kind: 'resource';
    resource: 'hero-point';
    ability: 'activate-power';
  };

export type PlayerCombatActionRequest =
  | PlayerSkillTestRequest
  | PlayerAttackRequest
  | PlayerStandaloneResourceRequest;

export type PlayerCombatActionResult = {
  ok: boolean;
  pendingApproval?: boolean;
  requestId?: string;
  error?: string;
};

export type PendingActionPointRequest = {
  id: string;
  playerId: string;
  playerName: string;
  label: string;
  requestedAt: number;
};

export type PlayerResourceNotice = {
  id: string;
  tone: 'info' | 'approved' | 'rejected' | 'heroic';
  message: string;
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
};

export type InitiativeActor = Pick<
  EncounterTurnParticipant,
  'id' | 'kind' | 'sourceId' | 'name' | 'initiativeModifier' | 'eligibleRound'
>;

export const emptyEncounterTurnState = (): EncounterTurnState => ({
  round: 0,
  activeParticipantId: null,
  participants: [],
  rollResults: [],
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
  if (state.started || !state.participants.length) return null;
  const participantIndex = state.participants.findIndex(
    ({ id }) => id === participantId,
  );
  if (
    participantIndex < 0 ||
    state.participants[participantIndex].initiativeRolled !== false
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
  if (allRolled) {
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
  return {
    ...state,
    round: 1,
    activeParticipantId: first.id,
    rollResults: (state.rollResults ?? []).filter(
      ({ category }) => category !== 'initiative',
    ),
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
    )
  ) return null;
  return {
    participantId: candidate.participantId,
    label: candidate.label.trim(),
    formula: normalizeDamageFormula(candidate.formula)!,
    category: candidate.category!,
  };
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
          ? 'dice-only'
          : 'full';
      if (visibility === 'full') return { ...result, visibility };
      return {
        ...result,
        expression: diceTermsOnly(result.expression),
        modifier: 0,
        total: 0,
        outcome: 'neutral',
        visibility,
      };
    }),
  };
};

export type AreaDamageRequest = {
  damage: number;
  reflexDc: number;
  successRule: AreaDamageSuccessRule;
  playerIds?: string[];
};

export type AreaDamageResult = {
  ok: boolean;
  appliedPlayers: number;
  skippedPlayers: string[];
  error?: string;
};

export type DirectPlayerDamageRequest = {
  playerIds: string[];
  damage: number;
  attackType?: AttackType;
  attackBonus?: number;
  attackerParticipantId?: string;
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
  return Number.isInteger(candidate.damage) && (candidate.damage ?? 0) >= 0 &&
    (candidate.damage ?? 0) <= 999_999 &&
    Number.isInteger(candidate.reflexDc) && (candidate.reflexDc ?? 0) >= 0 &&
    (candidate.reflexDc ?? 0) <= 999 &&
    (candidate.successRule === 'half' || candidate.successRule === 'none') &&
    (
      candidate.playerIds === undefined ||
      (
        Array.isArray(candidate.playerIds) &&
        candidate.playerIds.length <= 10 &&
        candidate.playerIds.every(
          (id) => typeof id === 'string' && id.length > 0 && id.length <= 128,
        )
      )
    );
};

export const isDirectPlayerDamageRequest = (
  value: unknown,
): value is DirectPlayerDamageRequest => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DirectPlayerDamageRequest>;
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
    (candidate.damage ?? 0) > 0 &&
    (candidate.damage ?? 0) <= 999_999 &&
    (!hasAttackCheck || (
      (candidate.attackType === 'melee' || candidate.attackType === 'ranged') &&
      Number.isInteger(candidate.attackBonus) &&
      (candidate.attackBonus ?? 0) >= -999 &&
      (candidate.attackBonus ?? 0) <= 999 &&
      typeof candidate.attackerParticipantId === 'string' &&
      candidate.attackerParticipantId.length > 0 &&
      candidate.attackerParticipantId.length <= 160
    ));
};

export const resolveAttackCheck = (
  attackBonus: number,
  defense: number,
  die: number,
) => {
  const normalizedDie = Math.max(1, Math.min(20, Math.trunc(die)));
  const normalizedBonus = Math.max(-999, Math.min(999, Math.trunc(attackBonus)));
  const normalizedDefense = Math.max(0, Math.min(999, Math.trunc(defense)));
  const total = normalizedDie + normalizedBonus;
  return {
    die: normalizedDie,
    attackBonus: normalizedBonus,
    defense: normalizedDefense,
    total,
    success:
      normalizedDie === 20 ||
      (normalizedDie !== 1 && total >= normalizedDefense),
    natural: normalizedDie === 1 || normalizedDie === 20
      ? normalizedDie
      : null,
  };
};

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
      isPlayerResourceUse(skill.resource);
  }
  if (candidate.kind === 'attack') {
    const attack = candidate as Partial<PlayerAttackRequest>;
    return Number.isInteger(attack.attackIndex) &&
      (attack.attackIndex ?? -1) >= 0 &&
      (attack.attackIndex ?? -1) < 5 &&
      (attack.attackType === 'melee' || attack.attackType === 'ranged') &&
      typeof attack.targetBossId === 'string' &&
      attack.targetBossId.length > 0 &&
      attack.targetBossId.length <= 128 &&
      typeof attack.damageFormula === 'string' &&
      Boolean(normalizeDamageFormula(attack.damageFormula)) &&
      isPlayerResourceUse(attack.resource);
  }
  if (candidate.kind === 'resource') {
    return (
      candidate.resource === 'action-point' &&
      (candidate.ability === 'protection' || candidate.ability === 'recovery')
    ) || (
      candidate.resource === 'hero-point' &&
      candidate.ability === 'activate-power'
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
  const total = die + state.reflex;
  const success = die === 20 || (die !== 1 && total >= request.reflexDc);
  const applied = success
    ? request.successRule === 'none' ? 0 : Math.ceil(request.damage / 2)
    : request.damage;
  const healthBefore = Math.max(0, Math.min(state.maxHealth, state.currentHealth));
  const healthAfter = Math.max(0, healthBefore - applied);
  const playerState: PlayerEncounterState = {
    ...state,
    currentHealth: healthAfter,
    revision: state.revision + 1,
  };
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
      successRule: request.successRule,
    },
  };
};
