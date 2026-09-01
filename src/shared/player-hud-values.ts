import type { PlayerHudState } from './player-combat';
import { deriveStatusAttributes } from './status-rules';

const skillTotal = (
  player: PlayerHudState,
  id: string,
  name: string,
) => player.summary?.skills.find((skill) =>
  skill.id === id || skill.name.toLocaleLowerCase('pt-BR') === name
)?.total ?? null;

export type PlayerHudCombatValues = {
  melee: number | null;
  ranged: number | null;
  defenseMelee: number | null;
  defenseRanged: number | null;
  naturalMelee: number | null;
  naturalRanged: number | null;
  naturalDefenseMelee: number | null;
  naturalDefenseRanged: number | null;
};

/**
 * Computes the three compact HUD values from the same authoritative sheet and
 * status state used by both the Electron presentation and the web client.
 */
export const playerHudCombatValues = (
  player: PlayerHudState,
): PlayerHudCombatValues => {
  if (player.redacted || !player.summary) {
    return {
      melee: null,
      ranged: null,
      defenseMelee: null,
      defenseRanged: null,
      naturalMelee: null,
      naturalRanged: null,
      naturalDefenseMelee: null,
      naturalDefenseRanged: null,
    };
  }

  const naturalMelee = skillTotal(player, '190', 'luta');
  const naturalRanged = skillTotal(player, '260', 'pontaria');
  const naturalDefenseMelee =
    player.summary.defenses.melee ?? player.summary.defense ?? null;
  const naturalDefenseRanged =
    player.summary.defenses.ranged ?? player.summary.defense ?? null;
  const derived = deriveStatusAttributes({
    attack: naturalMelee ?? 0,
    rangedAttack: naturalRanged ?? 0,
    skills: 0,
    meleeDefense: naturalDefenseMelee ?? 0,
    rangedDefense: naturalDefenseRanged ?? 0,
    damageReduction: 0,
    shield: 0,
  }, player.statuses);

  return {
    melee: naturalMelee === null ? null : derived.values.attack,
    ranged: naturalRanged === null ? null : derived.values.rangedAttack,
    defenseMelee: player.defenseMelee,
    defenseRanged: player.defenseRanged,
    naturalMelee,
    naturalRanged,
    naturalDefenseMelee,
    naturalDefenseRanged,
  };
};
