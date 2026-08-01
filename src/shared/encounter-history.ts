import type {
  EncounterRollOutcome,
  EncounterRollResult,
  EncounterRollVisibility,
  EncounterTurnParticipant,
} from './player-combat.ts';

export type EncounterHistoryEntry = Readonly<{
  id: string;
  kind: 'round' | 'turn' | 'roll' | 'damage' | 'heal' | 'status' | 'system';
  round: number;
  turnParticipantId: string | null;
  actorParticipantId: string | null;
  targetParticipantId?: string | null;
  actorName: string;
  label: string;
  detail: string;
  createdAt: number;
  expression?: string;
  rolls?: number[];
  modifier?: number;
  total?: number;
  outcome?: EncounterRollOutcome;
  visibility?: EncounterRollVisibility;
  rollCategory?: EncounterRollResult['category'];
}>;

const participantName = (
  participants: readonly EncounterTurnParticipant[],
  participantId: string | null,
) => participants.find(({ id }) => id === participantId)?.name ?? 'Sistema';

export const historyEntriesForTurn = (
  round: number,
  activeParticipantId: string | null,
  participants: readonly EncounterTurnParticipant[],
  previousRound: number,
): EncounterHistoryEntry[] => {
  if (!activeParticipantId || round < 1) return [];
  const now = Date.now();
  const entries: EncounterHistoryEntry[] = [];
  if (round !== previousRound) {
    entries.push({
      id: `round:${round}:${now}`,
      kind: 'round',
      round,
      turnParticipantId: activeParticipantId,
      actorParticipantId: null,
      actorName: 'Sistema',
      label: `Turno completo ${round}`,
      detail: '',
      createdAt: now,
    });
  }
  const actorName = participantName(participants, activeParticipantId);
  entries.push({
    id: `turn:${round}:${activeParticipantId}:${now}`,
    kind: 'turn',
    round,
    turnParticipantId: activeParticipantId,
    actorParticipantId: activeParticipantId,
    actorName,
    label: `Rodada de ${actorName}`,
    detail: '',
    createdAt: now,
  });
  return entries;
};

export const historyEntriesForRolls = (
  rolls: readonly EncounterRollResult[],
  round: number,
  activeParticipantId: string | null,
  participants: readonly EncounterTurnParticipant[],
): EncounterHistoryEntry[] => rolls.map((roll) => ({
  id: `history:${roll.id}`,
  kind: roll.category === 'status' ? 'status' : 'roll',
  round,
  turnParticipantId: activeParticipantId,
  actorParticipantId: roll.participantId,
  actorName: participantName(participants, roll.participantId),
  label: roll.label,
  detail: '',
  createdAt: roll.createdAt,
  expression: roll.expression,
  rolls: [...roll.rolls],
  modifier: roll.modifier,
  total: roll.total,
  outcome: roll.outcome,
  visibility: roll.visibility,
  rollCategory: roll.category,
}));

export const historyEntryForVitalChange = (options: {
  id: string;
  kind: 'damage' | 'heal';
  round: number;
  activeParticipantId: string | null;
  actorParticipantId?: string | null;
  actorName?: string;
  targetParticipantId?: string | null;
  targetName: string;
  amount: number;
  detail?: string;
}): EncounterHistoryEntry => ({
  id: options.id,
  kind: options.kind,
  round: options.round,
  turnParticipantId: options.activeParticipantId,
  actorParticipantId: options.actorParticipantId ?? options.activeParticipantId,
  actorName: options.actorName ?? 'Mestre',
  targetParticipantId: options.targetParticipantId ?? null,
  label: options.kind === 'damage' ? 'Dano' : 'Cura',
  detail:
    `${options.targetName}: ${options.kind === 'damage' ? '−' : '+'}${Math.max(0, Math.trunc(options.amount))} PV` +
    (options.detail ? ` · ${options.detail}` : ''),
  createdAt: Date.now(),
});
