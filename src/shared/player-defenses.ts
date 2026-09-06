import type { PlayerEncounterState } from './player-combat';
import { deriveStatusAttributes } from './status-rules.ts';

export const effectivePlayerDefenses = (state: PlayerEncounterState) => {
  const derived = deriveStatusAttributes({
    attack: 0, rangedAttack: 0, skills: 0,
    meleeDefense: state.defenseMelee, rangedDefense: state.defenseRanged,
    damageReduction: 0, shield: 0,
  }, state.statuses);
  return { melee: derived.values.meleeDefense + state.temporaryDefenseBonus,
    ranged: derived.values.rangedDefense + state.temporaryDefenseBonus };
};
