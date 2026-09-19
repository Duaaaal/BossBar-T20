export type CombatAdjustment = { expression: string; modifier: number; dice: Array<{ count: number; sides: number; sign: number }> };
/** Bounded arithmetic grammar, never evaluated as JavaScript. */
export const parseCombatAdjustment = (input: unknown): CombatAdjustment | null => {
  if (input === undefined || input === '') return { expression: '0', modifier: 0, dice: [] };
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  const expression = String(input).replace(/\s/g, '').replace(/−/g, '-').toLowerCase() || '0';
  if (!expression || expression.length > 120) return null;
  const terms = expression.match(/[+-]?\d+(?:d\d+)?/g);
  if (!terms || terms.join('') !== expression || terms.slice(1).some((term) => !/^[+-]/.test(term))) return null;
  const result: CombatAdjustment = { expression, modifier: 0, dice: [] };
  let count = 0;
  for (const term of terms) {
    const sign = term.startsWith('-') ? -1 : 1;
    const [magnitude, sides] = term.replace(/^[+-]/, '').split('d').map(Number);
    if (!Number.isSafeInteger(magnitude) || magnitude > 999) return null;
    if (sides !== undefined) {
      count += magnitude;
      if (magnitude < 1 || count > 100 || !Number.isInteger(sides) || sides < 2 || sides > 1000 || result.dice.length >= 10) return null;
      result.dice.push({ count: magnitude, sides, sign });
    } else result.modifier += sign * magnitude;
  }
  return Math.abs(result.modifier) <= 999 ? result : null;
};
export const rollCombatAdjustment = (formula: CombatAdjustment, randomInteger: (minimum: number, maximum: number) => number) => {
  const rolls: number[] = [];
  for (const term of formula.dice) for (let index = 0; index < term.count; index++) {
    const die = randomInteger(1, term.sides + 1);
    if (!Number.isInteger(die) || die < 1 || die > term.sides) throw new RangeError('Resultado de dado inválido.');
    rolls.push(die * term.sign);
  }
  return { rolls, modifier: formula.modifier, total: formula.modifier + rolls.reduce((sum, roll) => sum + roll, 0) };
};
export const appendCombatAdjustment = (base: string, formula: CombatAdjustment) => formula.expression === '0' ? base : `${base} ${/^[+-]/.test(formula.expression) ? '' : '+ '}${formula.expression}`;
