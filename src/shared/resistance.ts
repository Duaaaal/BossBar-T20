import type { AttackStatusEffect } from './boss-attacks';
import type { AreaDamageRequest } from './player-combat';
export type PendingResistance = {
  id: string;
  profileId: string;
  playerId: string;
  label: string;
  skill: string;
  dc: number;
  area?: AreaDamageRequest;
  effect?: AttackStatusEffect;
  attackerParticipantId?: string;
  correlationId?: string;
};
export type ResistancePrompt = Pick<PendingResistance, 'id' | 'label' | 'skill' | 'dc'>;
