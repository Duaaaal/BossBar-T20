import type {
  CustomStatusAffectedTarget,
  CustomStatusInflictedStatusId,
} from './custom-status-library';

const STATUS_IDS = [
  'abalado',
  'agarrado',
  'alquebrado',
  'apavorado',
  'atordoado',
  'caido',
  'cego',
  'confuso',
  'debilitado',
  'desprevenido',
  'doente',
  'em-chamas',
  'enfeiticado',
  'enjoado',
  'enredado',
  'envenenado',
  'esmorecido',
  'exausto',
  'fascinado',
  'fatigado',
  'fraco',
  'frustrado',
  'imovel',
  'inconsciente',
  'indefeso',
  'lento',
  'ofuscado',
  'paralisado',
  'pasmo',
  'petrificado',
  'sangrando',
  'sobrecarregado',
  'surdo',
  'surpreendido',
  'vulneravel',
  'coringa',
] as const;

export type StatusId = (typeof STATUS_IDS)[number];

export type StatusDefinition = Readonly<{
  id: StatusId;
  name: string;
  description: string;
  iconFile: string;
  damageCapable: boolean;
  defaultDamageFormula: string | null;
  customizable: boolean;
}>;

export type ActiveBossStatus = Readonly<{
  statusId: StatusId;
  damageFormula: string | null;
  turnsRemaining: number;
  customName?: string;
  customDescription?: string;
  customPresetId?: string;
  customInflictedStatusId?: CustomStatusInflictedStatusId;
  customAffectedTarget?: CustomStatusAffectedTarget;
}>;

export type StatusValueKind =
  | 'damage'
  | 'roll'
  | 'mana'
  | 'modifier'
  | 'distance'
  | 'difficulty'
  | 'defense';

export type StatusTextToken = Readonly<{
  text: string;
  kind: StatusValueKind | null;
}>;

export type ParsedDamageFormula =
  | Readonly<{ kind: 'fixed'; value: number }>
  | Readonly<{
      kind: 'dice';
      diceCount: number;
      sides: number;
      modifier: number;
    }>
  | Readonly<{
      kind: 'expression';
      terms: readonly Readonly<{
        diceCount: number;
        sides: number;
        sign: 1 | -1;
      }>[];
      modifier: number;
    }>;

const statusDefinition = (
  id: StatusId,
  name: string,
  description: string,
  index: number,
  damageCapable = false,
  defaultDamageFormula: string | null = null,
  customizable = false,
): StatusDefinition => Object.freeze({
  id,
  name,
  description,
  iconFile: `status-${String(index).padStart(2, '0')}-${id}.png`,
  damageCapable,
  defaultDamageFormula,
  customizable,
});

export const STATUS_DEFINITIONS: readonly StatusDefinition[] = Object.freeze([
  statusDefinition(
    'abalado',
    'Abalado',
    'Sofre –2 em testes de perícia. Se receber esta condição novamente, fica apavorado.',
    1,
  ),
  statusDefinition(
    'agarrado',
    'Agarrado',
    'Fica desprevenido e imóvel, sofre –2 em ataques e só pode atacar com armas leves. Ataques à distância envolvendo o agarrão podem atingir o alvo errado.',
    2,
  ),
  statusDefinition(
    'alquebrado',
    'Alquebrado',
    'O custo em pontos de mana de suas habilidades aumenta em +1 PM.',
    3,
  ),
  statusDefinition(
    'apavorado',
    'Apavorado',
    'Sofre –5 em testes de perícia e não pode se aproximar voluntariamente da fonte do medo.',
    4,
  ),
  statusDefinition(
    'atordoado',
    'Atordoado',
    'Fica desprevenido e não pode realizar ações.',
    5,
  ),
  statusDefinition(
    'caido',
    'Caído',
    'Sofre –5 na Defesa contra ataques corpo a corpo e recebe +5 na Defesa contra ataques à distância. Sofre –5 em ataques corpo a corpo e só pode se deslocar 1,5m.',
    6,
  ),
  statusDefinition(
    'cego',
    'Cego',
    'Fica desprevenido e lento, não pode observar com Percepção, sofre –5 em perícias baseadas em Força ou Destreza e seus alvos recebem camuflagem total.',
    7,
  ),
  statusDefinition(
    'confuso',
    'Confuso',
    'No início do turno, rola 1d6 para determinar se anda aleatoriamente, não age, ataca a criatura mais próxima ou encerra a condição.',
    8,
  ),
  statusDefinition(
    'debilitado',
    'Debilitado',
    'Sofre –5 em testes de Força, Destreza e Constituição e nas perícias baseadas nesses atributos. Se ficar debilitado novamente, fica inconsciente.',
    9,
  ),
  statusDefinition(
    'desprevenido',
    'Desprevenido',
    'Sofre –5 na Defesa e em Reflexos. Também fica desprevenido contra inimigos que não consegue perceber.',
    10,
  ),
  statusDefinition(
    'doente',
    'Doente',
    'Está sob o efeito de uma doença. As consequências dependem da doença específica.',
    11,
  ),
  statusDefinition(
    'em-chamas',
    'Em chamas',
    'Sofre 1d6 de dano de fogo no início de cada turno. Pode gastar uma ação padrão ou mergulhar em água para apagar as chamas.',
    12,
    true,
    '1d6',
  ),
  statusDefinition(
    'enfeiticado',
    'Enfeitiçado',
    'Torna-se prestativo em relação à fonte. A fonte recebe +10 em Diplomacia, mas não controla diretamente o personagem.',
    13,
  ),
  statusDefinition(
    'enjoado',
    'Enjoado',
    'Só pode realizar uma ação padrão ou uma ação de movimento por rodada, não ambas.',
    14,
  ),
  statusDefinition(
    'enredado',
    'Enredado',
    'Fica lento e vulnerável e sofre –2 em testes de ataque.',
    15,
  ),
  statusDefinition(
    'envenenado',
    'Envenenado',
    'Sofre o efeito definido pelo veneno, como perda recorrente de PV ou outra condição. Perdas recorrentes causadas por venenos acumulam-se.',
    16,
    true,
  ),
  statusDefinition(
    'esmorecido',
    'Esmorecido',
    'Sofre –5 em testes de Inteligência, Sabedoria e Carisma e nas perícias baseadas nesses atributos.',
    17,
  ),
  statusDefinition(
    'exausto',
    'Exausto',
    'Fica debilitado, lento e vulnerável. Se ficar exausto novamente, fica inconsciente.',
    18,
  ),
  statusDefinition(
    'fascinado',
    'Fascinado',
    'Sofre –5 em Percepção e só pode observar aquilo que o fascinou. Ações hostis ou perder a fonte de vista encerram a condição.',
    19,
  ),
  statusDefinition(
    'fatigado',
    'Fatigado',
    'Fica fraco e vulnerável. Se ficar fatigado novamente, fica exausto.',
    20,
  ),
  statusDefinition(
    'fraco',
    'Fraco',
    'Sofre –2 em testes de Força, Destreza e Constituição e nas perícias baseadas nesses atributos. Se ficar fraco novamente, fica debilitado.',
    21,
  ),
  statusDefinition(
    'frustrado',
    'Frustrado',
    'Sofre –2 em testes de Inteligência, Sabedoria e Carisma e nas perícias baseadas nesses atributos. Se receber novamente, fica esmorecido.',
    22,
  ),
  statusDefinition(
    'imovel',
    'Imóvel',
    'Todas as suas formas de deslocamento são reduzidas para 0m.',
    23,
  ),
  statusDefinition(
    'inconsciente',
    'Inconsciente',
    'Fica indefeso e não pode realizar ações, incluindo reações. Ainda pode fazer testes naturalmente realizados inconsciente, como estabilizar sangramento.',
    24,
  ),
  statusDefinition(
    'indefeso',
    'Indefeso',
    'Fica desprevenido, sofre –10 na Defesa, falha automaticamente em Reflexos e pode sofrer golpe de misericórdia.',
    25,
  ),
  statusDefinition(
    'lento',
    'Lento',
    'Seus deslocamentos são reduzidos à metade e não pode correr nem realizar investidas.',
    26,
  ),
  statusDefinition(
    'ofuscado',
    'Ofuscado',
    'Sofre –2 em testes de ataque e de Percepção.',
    27,
  ),
  statusDefinition(
    'paralisado',
    'Paralisado',
    'Fica imóvel e indefeso e só pode realizar ações puramente mentais.',
    28,
  ),
  statusDefinition(
    'pasmo',
    'Pasmo',
    'Não pode realizar ações.',
    29,
  ),
  statusDefinition(
    'petrificado',
    'Petrificado',
    'Fica inconsciente e recebe redução de dano 8.',
    30,
  ),
  statusDefinition(
    'sangrando',
    'Sangrando',
    'No início do turno, faz Constituição CD 15. Se falhar, perde 1d6 PV e continua sangrando; se passar, remove a condição.',
    31,
    true,
    '1d6',
  ),
  statusDefinition(
    'sobrecarregado',
    'Sobrecarregado',
    'Sofre –5 de penalidade de armadura e tem seu deslocamento reduzido em 3m.',
    32,
  ),
  statusDefinition(
    'surdo',
    'Surdo',
    'Não pode usar Percepção para ouvir, sofre –5 em Iniciativa e está em condição ruim para lançar magias.',
    33,
  ),
  statusDefinition(
    'surpreendido',
    'Surpreendido',
    'Fica desprevenido e não pode realizar ações.',
    34,
  ),
  statusDefinition(
    'vulneravel',
    'Vulnerável',
    'Sofre –2 na Defesa.',
    35,
  ),
  statusDefinition(
    'coringa',
    'Status personalizado',
    'Condição criada pelo mestre. Clique para abrir a biblioteca de status personalizados.',
    36,
    true,
    null,
    true,
  ),
]);

const statusIds = new Set<string>(STATUS_IDS);
const definitionsById = new Map(
  STATUS_DEFINITIONS.map((definition) => [definition.id, definition]),
);

const MAX_FORMULA_LENGTH = 128;
const MAX_DAMAGE = 1_000_000;
const MAX_DICE_COUNT = 100;
const MAX_DICE_TERMS = 20;
const MAX_DIE_SIDES = 1000;
const MAX_TURNS = 999;

export const isStatusId = (value: unknown): value is StatusId =>
  typeof value === 'string' && statusIds.has(value);

export const getStatusDefinition = (
  statusId: StatusId,
): StatusDefinition => definitionsById.get(statusId) as StatusDefinition;

export const getActiveStatusName = (status: ActiveBossStatus): string =>
  status.statusId === 'coringa' && status.customName
    ? status.customName
    : getStatusDefinition(status.statusId).name;

export const getActiveStatusDescription = (status: ActiveBossStatus): string =>
  status.statusId === 'coringa' && status.customDescription
    ? status.customDescription
    : getStatusDefinition(status.statusId).description;

const STATUS_VALUE_PATTERN = /(?:\b\d+d\d+(?:\s*[+-]\s*(?:\d+d\d+|\d+))*\b|\bCD\s*\d+\b|[+\-−–]\s*\d+(?:[.,]\d+)?(?:\s*(?:PM|PV|m))?\b|\b\d+(?:[.,]\d+)?\s*(?:PM|PV|m)\b|\b\d+\b)/giu;

const statusValueKind = (
  value: string,
  source: string,
  index: number,
): StatusValueKind => {
  const normalized = value.replace(/\s+/g, '').toLocaleLowerCase('pt-BR');
  const context = source
    .slice(Math.max(0, index - 32), index + value.length + 32)
    .toLocaleLowerCase('pt-BR');

  if (normalized.startsWith('cd')) return 'difficulty';
  if (normalized.endsWith('pm')) return 'mana';
  if (normalized.endsWith('m') && !normalized.endsWith('pm')) return 'distance';
  if (/\d+d\d+/.test(normalized)) {
    return /dano|perde|pv|veneno|chamas|sangrando/.test(context)
      ? 'damage'
      : 'roll';
  }
  if (/redução de dano|\brd\b|\bdefesa\b/.test(context)) return 'defense';
  if (normalized.endsWith('pv')) return 'damage';
  return 'modifier';
};

export const tokenizeStatusDescription = (source: string): StatusTextToken[] => {
  const tokens: StatusTextToken[] = [];
  let cursor = 0;
  for (const match of source.matchAll(STATUS_VALUE_PATTERN)) {
    const index = match.index ?? 0;
    if (index > cursor) tokens.push({ text: source.slice(cursor, index), kind: null });
    tokens.push({
      text: match[0],
      kind: statusValueKind(match[0], source, index),
    });
    cursor = index + match[0].length;
  }
  if (cursor < source.length) tokens.push({ text: source.slice(cursor), kind: null });
  return tokens;
};

export const parseDamageFormula = (
  value: string,
): ParsedDamageFormula | null => {
  if (typeof value !== 'string' || value.length > MAX_FORMULA_LENGTH) return null;

  const formula = value.trim();
  if (/^\d+$/.test(formula)) {
    const fixedValue = Number(formula);
    return Number.isSafeInteger(fixedValue) && fixedValue <= MAX_DAMAGE
      ? { kind: 'fixed', value: fixedValue }
      : null;
  }

  const compactFormula = formula.replace(/\s+/g, '');
  const termPattern = /([+-]?)(\d+)(?:d(\d+))?/iy;
  const terms: Array<{
    diceCount: number;
    sides: number;
    sign: 1 | -1;
  }> = [];
  let modifier = 0;
  let totalDice = 0;
  let cursor = 0;

  while (cursor < compactFormula.length) {
    termPattern.lastIndex = cursor;
    const match = termPattern.exec(compactFormula);
    if (!match || match.index !== cursor) return null;
    const operator = match[1];
    if (cursor === 0 && operator === '-') return null;
    if (cursor > 0 && operator === '') return null;
    const sign: 1 | -1 = operator === '-' ? -1 : 1;
    const magnitude = Number(match[2]);
    const sidesText = match[3];

    if (!Number.isSafeInteger(magnitude)) return null;
    if (sidesText !== undefined) {
      const sides = Number(sidesText);
      if (
        magnitude < 1 ||
        magnitude > MAX_DICE_COUNT ||
        !Number.isSafeInteger(sides) ||
        sides < 2 ||
        sides > MAX_DIE_SIDES ||
        terms.length >= MAX_DICE_TERMS ||
        totalDice + magnitude > MAX_DICE_COUNT
      ) return null;
      terms.push({ diceCount: magnitude, sides, sign });
      totalDice += magnitude;
    } else {
      const nextModifier = modifier + sign * magnitude;
      if (
        magnitude > MAX_DAMAGE ||
        !Number.isSafeInteger(nextModifier) ||
        Math.abs(nextModifier) > MAX_DAMAGE
      ) return null;
      modifier = nextModifier;
    }
    cursor = termPattern.lastIndex;
  }

  if (terms.length === 0 || terms[0].sign !== 1) return null;
  if (terms.length === 1) {
    return {
      kind: 'dice',
      diceCount: terms[0].diceCount,
      sides: terms[0].sides,
      modifier,
    };
  }
  return { kind: 'expression', terms, modifier };
};

export const normalizeDamageFormula = (value: string): string | null => {
  const parsed = parseDamageFormula(value);
  if (!parsed) return null;
  if (parsed.kind === 'fixed') return String(parsed.value);
  const diceExpression = parsed.kind === 'dice'
    ? `${parsed.diceCount}d${parsed.sides}`
    : parsed.terms.map((term, index) => {
        const operator = index === 0
          ? ''
          : term.sign > 0 ? ' + ' : ' - ';
        return `${operator}${term.diceCount}d${term.sides}`;
      }).join('');
  if (parsed.modifier === 0) return diceExpression;

  const operator = parsed.modifier > 0 ? '+' : '-';
  return `${diceExpression} ${operator} ${Math.abs(parsed.modifier)}`;
};

export type DamageFormulaRange = Readonly<{
  minimum: number;
  maximum: number;
}>;

const damageFormulaRanges = new Map<string, DamageFormulaRange | null>();

const cacheDamageFormulaRange = (
  value: string,
  range: DamageFormulaRange | null,
) => {
  if (damageFormulaRanges.size >= 128) damageFormulaRanges.clear();
  damageFormulaRanges.set(value, range);
  return range;
};

export const getDamageFormulaRange = (
  value: string,
): DamageFormulaRange | null => {
  if (damageFormulaRanges.has(value)) {
    return damageFormulaRanges.get(value) ?? null;
  }
  const formula = parseDamageFormula(value);
  if (!formula) return cacheDamageFormulaRange(value, null);
  if (formula.kind === 'fixed') {
    return cacheDamageFormulaRange(value, {
      minimum: formula.value,
      maximum: formula.value,
    });
  }

  const terms = formula.kind === 'dice'
    ? [{ diceCount: formula.diceCount, sides: formula.sides, sign: 1 as const }]
    : formula.terms;
  let minimum = formula.modifier;
  let maximum = formula.modifier;
  for (const term of terms) {
    if (term.sign > 0) {
      minimum += term.diceCount;
      maximum += term.diceCount * term.sides;
    } else {
      minimum -= term.diceCount * term.sides;
      maximum -= term.diceCount;
    }
  }

  return cacheDamageFormulaRange(value, {
    minimum: Math.max(0, Math.min(MAX_DAMAGE, minimum)),
    maximum: Math.max(0, Math.min(MAX_DAMAGE, maximum)),
  });
};

export const rollDamageFormula = (
  formula: ParsedDamageFormula,
  randomInteger: (minimum: number, maximumExclusive: number) => number,
): number => {
  if (formula.kind === 'fixed') return formula.value;

  let total = formula.modifier;
  const terms = formula.kind === 'dice'
    ? [{ diceCount: formula.diceCount, sides: formula.sides, sign: 1 as const }]
    : formula.terms;
  for (const term of terms) {
    for (let die = 0; die < term.diceCount; die += 1) {
      const result = randomInteger(1, term.sides + 1);
      if (!Number.isInteger(result) || result < 1 || result > term.sides) {
        throw new RangeError('A fonte aleatória retornou um resultado inválido.');
      }
      total += result * term.sign;
    }
  }

  return Math.max(0, Math.min(MAX_DAMAGE, total));
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object');

export const normalizeActiveStatuses = (value: unknown): ActiveBossStatus[] => {
  if (!Array.isArray(value)) return [];

  const statuses = new Map<StatusId, ActiveBossStatus>();
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      !isStatusId(candidate.statusId) ||
      !Number.isInteger(candidate.turnsRemaining) ||
      (candidate.turnsRemaining as number) < 1 ||
      (candidate.turnsRemaining as number) > MAX_TURNS
    ) continue;

    const definition = getStatusDefinition(candidate.statusId);
    let damageFormula: string | null = null;
    let customName: string | undefined;
    let customDescription: string | undefined;
    let customPresetId: string | undefined;
    let customInflictedStatusId: CustomStatusInflictedStatusId | undefined;
    let customAffectedTarget: CustomStatusAffectedTarget | undefined;
    if (definition.customizable) {
      if (
        typeof candidate.customName !== 'string' ||
        typeof candidate.customDescription !== 'string'
      ) continue;
      customName = candidate.customName.trim().slice(0, 60);
      customDescription = candidate.customDescription.trim().slice(0, 300);
      if (!customName || !customDescription) continue;
      if (
        typeof candidate.customPresetId === 'string' &&
        /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(candidate.customPresetId)
      ) customPresetId = candidate.customPresetId;
      if (
        isStatusId(candidate.customInflictedStatusId) &&
        candidate.customInflictedStatusId !== 'coringa'
      ) customInflictedStatusId = candidate.customInflictedStatusId;
      if (
        typeof candidate.customAffectedTarget === 'string' &&
        [
          'none',
          'currentHealth',
          'maxHealth',
          'attack',
          'rangedAttack',
          'skills',
          'meleeDefense',
          'rangedDefense',
          'damageReduction',
          'shield',
        ].includes(candidate.customAffectedTarget)
      ) {
        customAffectedTarget = candidate.customAffectedTarget as CustomStatusAffectedTarget;
      }
      if (
        candidate.damageFormula !== null &&
        candidate.damageFormula !== undefined &&
        candidate.damageFormula !== ''
      ) {
        if (typeof candidate.damageFormula !== 'string') continue;
        damageFormula = normalizeDamageFormula(candidate.damageFormula);
        if (damageFormula === null) continue;
      }
    } else if (definition.damageCapable) {
      if (
        candidate.damageFormula === null ||
        candidate.damageFormula === undefined ||
        candidate.damageFormula === ''
      ) {
        damageFormula = definition.defaultDamageFormula;
        if (damageFormula === null) continue;
      } else if (typeof candidate.damageFormula === 'string') {
        damageFormula = normalizeDamageFormula(candidate.damageFormula);
        if (damageFormula === null) continue;
      } else {
        continue;
      }
    }

    statuses.set(candidate.statusId, {
      statusId: candidate.statusId,
      damageFormula,
      turnsRemaining: candidate.turnsRemaining as number,
      ...(customName ? { customName } : {}),
      ...(customDescription ? { customDescription } : {}),
      ...(customPresetId ? { customPresetId } : {}),
      ...(customInflictedStatusId ? { customInflictedStatusId } : {}),
      ...(customAffectedTarget ? { customAffectedTarget } : {}),
    });
  }

  return [...statuses.values()];
};
