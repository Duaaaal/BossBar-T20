export type D20CheckResolution = Readonly<{
  die: number;
  modifier: number;
  difficulty: number;
  total: number;
  success: boolean;
  natural: 1 | 20 | null;
}>;

/**
 * Resolves the universal Tormenta20 d20 rule. Natural 20 always succeeds and
 * natural 1 always fails, regardless of modifiers or the target difficulty.
 */
export const resolveD20Check = (
  die: number,
  modifier: number,
  difficulty: number,
): D20CheckResolution => {
  const normalizedDie = Math.max(1, Math.min(20, Math.trunc(die)));
  const normalizedModifier = Math.max(-999, Math.min(999, Math.trunc(modifier)));
  const normalizedDifficulty = Math.max(0, Math.min(999, Math.trunc(difficulty)));
  const total = normalizedDie + normalizedModifier;
  return {
    die: normalizedDie,
    modifier: normalizedModifier,
    difficulty: normalizedDifficulty,
    total,
    success:
      normalizedDie === 20 ||
      (normalizedDie !== 1 && total >= normalizedDifficulty),
    natural: normalizedDie === 1 || normalizedDie === 20
      ? normalizedDie
      : null,
  };
};
