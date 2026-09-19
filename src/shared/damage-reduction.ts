import { DAMAGE_TYPES, normalizeDamageType } from './attack-options.ts';

export const DAMAGE_ORIGINS = [['unknown', 'Não informada'], ['mundane', 'Mundana'], ['magical', 'Mágica'], ['arcane', 'Arcana'], ['divine', 'Divina']] as const;
export type DamageOrigin = typeof DAMAGE_ORIGINS[number][0];
export const RD_TARGETS = [
  ['universal', 'Universal', 'Geral'],
  ['physical', 'Todos os físicos', 'Físicos'],
  ...(['Corte', 'Perfuração', 'Impacto'] as const).map((type) => [type, type, 'Físicos'] as const),
  ['elemental', 'Todos os elementais', 'Elementais'],
  ...(['Ácido', 'Eletricidade', 'Fogo', 'Frio'] as const).map((type) => [type, type, 'Elementais'] as const),
  ['other', 'Todos os demais tipos', 'Outros tipos'],
  ...(['Essência', 'Luz', 'Psíquico', 'Trevas'] as const).map((type) => [type, type, 'Outros tipos'] as const),
  ['magical', 'Toda origem mágica', 'Origens'], ['arcane', 'Origem arcana', 'Origens'], ['divine', 'Origem divina', 'Origens'],
  ['mundane', 'Origem mundana', 'Origens'],
] as const;
export type ReductionTarget = typeof RD_TARGETS[number][0];
export const RD_CATEGORIES = [['universal', 'Geral'], ['physical', 'Físico'], ['elemental', 'Elemental'], ['other', 'Outros tipos'], ['origins', 'Origens']] as const;
export type ReductionCategory = typeof RD_CATEGORIES[number][0];
export type DamageReductionBase = { amount: number; name: string; bypass: ReductionTarget[]; immune?: boolean };
export const reductionCategory = (target: ReductionTarget): ReductionCategory => {
  const group = RD_TARGETS.find(([id]) => id === target)![2];
  return group === 'Geral' ? 'universal' : group === 'Físicos' ? 'physical' : group === 'Elementais' ? 'elemental' : group === 'Outros tipos' ? 'other' : 'origins';
};
export const RD_SOURCES = [['ability', 'Habilidade'], ['skill', 'Perícia'], ['item', 'Item'], ['spell', 'Magia'], ['partner', 'Parceiro'], ['environment', 'Ambiente'], ['total', 'Total já revisado']] as const;
export type ReductionSource = typeof RD_SOURCES[number][0];
export type DamageReductionEntry = {
  id: string; target: ReductionTarget; amount: number;
  source: ReductionSource; name: string; bypass: ReductionTarget[];
  immune?: boolean;
};
export type DamageReductionProfile = { version: 1; entries: DamageReductionEntry[]; categories?: Partial<Record<ReductionCategory, DamageReductionBase>> };
export type DamageContext = { damageType?: string; damageOrigin?: DamageOrigin; lossOfLife?: boolean; ignoreDamageReduction?: boolean };
export const RD_FIELD = 'BossBar.RD';
const labelKey = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const isTarget = (value: unknown): value is ReductionTarget => RD_TARGETS.some(([id]) => id === value);
export const isDamageContext = (value: DamageContext) =>
  (value.damageType === undefined || (typeof value.damageType === 'string' && value.damageType.length <= 80)) &&
  (value.damageOrigin === undefined || DAMAGE_ORIGINS.some(([id]) => id === value.damageOrigin)) &&
  (value.lossOfLife === undefined || typeof value.lossOfLife === 'boolean') &&
  (value.ignoreDamageReduction === undefined || typeof value.ignoreDamageReduction === 'boolean');

export const damageReductionError = (value: unknown): string | null => {
  if (!value || typeof value !== 'object') return 'A configuração de RD é inválida.';
  const profile = value as DamageReductionProfile;
  if (profile.version !== 1 || !Array.isArray(profile.entries) || profile.entries.length > 100) return 'A RD deve conter até 100 proteções no formato atual.';
  if (profile.categories !== undefined) {
    if (!profile.categories || typeof profile.categories !== 'object' || Array.isArray(profile.categories) || Object.keys(profile.categories).some((id) => !RD_CATEGORIES.some(([category]) => id === category))) return 'Revise as cinco categorias de RD.';
    for (const base of Object.values(profile.categories)) {
      if (base?.immune !== undefined && typeof base.immune !== 'boolean') return 'A opção de imunidade deve estar marcada ou desmarcada.';
      if (!base || !Number.isInteger(base.amount) || base.amount < 0 || base.amount > 999) return 'Cada RD de categoria deve ser um inteiro entre 0 e 999.';
      if (typeof base.name !== 'string' || base.name.length > 120 || ((base.amount > 0 || base.immune) && !base.name.trim())) return 'Informe o nome da fonte nas categorias com RD ou imunidade.';
      if (!Array.isArray(base.bypass) || base.bypass.length > RD_TARGETS.length || base.bypass.some((type) => !isTarget(type))) return 'Revise as exceções das categorias de RD.';
    }
  }
  const ids = new Set<string>();
  for (const row of profile.entries) {
    if (row?.immune !== undefined && typeof row.immune !== 'boolean') return 'A opção de imunidade deve estar marcada ou desmarcada.';
    if (!row || typeof row.id !== 'string' || !/^[\w:-]{1,128}$/.test(row.id) || ids.has(row.id)) return 'Há uma identificação inválida ou repetida na RD.';
    ids.add(row.id);
    if (!isTarget(row.target) || !RD_SOURCES.some(([id]) => id === row.source)) return 'Selecione um tipo de dano e uma fonte válidos na RD.';
    if (!Number.isInteger(row.amount) || row.amount < 0 || row.amount > 999) return 'Cada RD deve ser um inteiro entre 0 e 999.';
    if (typeof row.name !== 'string' || row.name.length > 120 || ((row.amount > 0 || row.immune) && !row.name.trim())) return 'Informe o nome de cada fonte com RD ou imunidade, para calcular as proteções.';
    if (!Array.isArray(row.bypass) || row.bypass.length > RD_TARGETS.length || row.bypass.some((type) => !isTarget(type))) return 'Revise as exceções da RD: elas indicam o dano que ignora essa proteção.';
  }
  return null;
};
export const normalizeDamageReduction = (value: unknown, legacy = 0): DamageReductionProfile => {
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { value = undefined; } }
  if (!damageReductionError(value)) {
    const profile = value as DamageReductionProfile;
    return { version: 1, entries: profile.entries.map((row) => ({ ...row, name: row.name.trim(), bypass: [...new Set(row.bypass)] })),
      ...(profile.categories ? { categories: Object.fromEntries(RD_CATEGORIES.map(([id]) => {
        const base = profile.categories?.[id];
        return [id, base ? { amount: base.amount, name: base.name.trim(), bypass: [...new Set(base.bypass)], ...(base.immune ? { immune: true } : {}) } : { amount: 0, name: '', bypass: [] }];
      })) } : {}),
    };
  }
  const amount = Number.isFinite(legacy) ? Math.max(0, Math.min(999, Math.trunc(legacy))) : 0;
  return { version: 1, entries: amount ? [{ id: 'legacy-rd', target: 'universal', amount, source: 'total', name: 'RD anterior — total revisado', bypass: [] }] : [] };
};
const matches = (target: ReductionTarget | ReductionCategory, context: DamageContext) => {
  const type = normalizeDamageType(context.damageType ?? '');
  if (target === 'universal') return true;
  if (target === 'origins') return ['mundane', 'magical', 'arcane', 'divine'].includes(context.damageOrigin ?? '');
  if (target === 'physical') return ['Corte', 'Perfuração', 'Impacto'].includes(type ?? '');
  if (target === 'elemental') return ['Ácido', 'Eletricidade', 'Fogo', 'Frio'].includes(type ?? '');
  if (target === 'other') return ['Essência', 'Luz', 'Psíquico', 'Trevas'].includes(type ?? '');
  if (target === 'magical') return ['magical', 'arcane', 'divine'].includes(context.damageOrigin ?? '');
  if (['mundane', 'arcane', 'divine'].includes(target)) return target === context.damageOrigin;
  return target === type;
};

/** Livro Básico JdA pp. 226, 228–230. Same ability/skill never stacks with itself;
 * items, spells, partners and environment each contribute their greatest effect.
 * A migrated/reviewed total is a floor, never another bonus added twice. */
export const damageReductionBreakdown = (profile: DamageReductionProfile | undefined, context: DamageContext = {}, statusReduction = 0) => {
  if (context.lossOfLife || context.ignoreDamageReduction) return { total: 0, description: 'RD ignorada: perda de vida ou efeito que ignora a proteção.' };
  const groups = new Map<string, number>();
  const normalized = normalizeDamageReduction(profile);
  const lines: string[] = [];
  const describe = (base: DamageReductionBase, scope: string) => `${scope}${base.name ? ' · ' + base.name : ''}: ${base.amount}${base.immune ? ' · Imune (dano positivo = 1)' : ''}`;
  const categoryTotal = RD_CATEGORIES.reduce((sum, [id, name]) => {
    const base = normalized.categories?.[id];
    if (!base || (!base.amount && !base.immune)) return sum;
    const applicable = matches(id, context) && !base.bypass.some((target) => matches(target, context));
    lines.push(describe(base, name) + (applicable ? ' (base somada)' : ' (não se aplica a este tipo/origem ou foi ignorada)'));
    return sum + (applicable ? base.amount : 0);
  }, 0);
  let reviewedTotal = 0;
  for (const row of normalized.entries) {
    if (!row.amount && !row.immune) continue;
    const applicable = matches(row.target, context) && !row.bypass.some((type) => matches(type, context));
    lines.push(describe(row, RD_TARGETS.find(([id]) => id === row.target)![1]) + ` · ${RD_SOURCES.find(([id]) => id === row.source)![1]}` + (applicable ? '' : ' (não se aplica ou foi ignorada)'));
    if (!applicable) continue;
    if (row.source === 'total') { reviewedTotal = Math.max(reviewedTotal, row.amount); continue; }
    const key = ['ability', 'skill'].includes(row.source) ? `${row.source}:${labelKey(row.name)}` : row.source;
    groups.set(key, Math.max(groups.get(key) ?? 0, row.amount));
  }
  const sourcesTotal = [...groups.values()].reduce((sum, amount) => sum + amount, 0);
  const total = categoryTotal + Math.max(reviewedTotal, sourcesTotal) + Math.max(0, statusReduction);
  return { total, description: [`Fontes de RD · ${context.damageType || 'tipo não informado'}`, ...lines,
    `Bases: ${categoryTotal}. Fontes acumuladas: ${sourcesTotal}. Piso revisado: ${reviewedTotal}. Efeitos do combate: ${Math.max(0, statusReduction)}.`,
    `RD = ${categoryTotal} + maior(${sourcesTotal}, ${reviewedTotal}) + ${Math.max(0, statusReduction)} = ${total}.`,
    'Habilidades/perícias distintas somam; repetidas, itens, magias, parceiros e ambiente usam o maior valor de cada grupo. Livro Básico, p. 226 e 228–230.',
    ...(!context.damageOrigin || context.damageOrigin === 'unknown' ? ['Origem não informada: proteções contra origens só entram após identificar a origem do dano.'] : [])].join('\n') };
};
export const resolveDamageReduction = (profile: DamageReductionProfile | undefined, context: DamageContext = {}, statusReduction = 0) => damageReductionBreakdown(profile, context, statusReduction).total;
export const hasDamageImmunity = (profile: DamageReductionProfile | undefined, context: DamageContext = {}) => {
  if (context.lossOfLife || context.ignoreDamageReduction) return false;
  const normalized = normalizeDamageReduction(profile);
  return RD_CATEGORIES.some(([id]) => { const base = normalized.categories?.[id]; return base?.immune && matches(id, context) && !base.bypass.some((target) => matches(target, context)); }) || normalized.entries.some((row) => row.immune && matches(row.target, context) && !row.bypass.some((target) => matches(target, context)));
};
export const reduceDamage = (damage: number, profile: DamageReductionProfile | undefined, context: DamageContext = {}, statusReduction = 0) => {
  const incoming = Math.max(0, Math.floor(damage));
  // Table rule: immunity changes a positive matching hit to exactly one point.
  if (incoming > 0 && hasDamageImmunity(profile, context)) return 1;
  return Math.max(0, incoming - resolveDamageReduction(profile, context, statusReduction));
};
export const damageContextError = (profile: DamageReductionProfile | undefined, context: DamageContext = {}) => {
  if (context.ignoreDamageReduction || context.lossOfLife) return null;
  const normalized = normalizeDamageReduction(profile);
  const targets: Array<ReductionTarget | ReductionCategory> = normalized.entries.filter(({ amount, immune }) => amount > 0 || immune).flatMap((row) => [row.target, ...row.bypass]);
  for (const [id] of RD_CATEGORIES) { const base = normalized.categories?.[id]; if (base?.amount || base?.immune) targets.push(id, ...base.bypass); }
  if (targets.some((target) => !['universal', 'origins', 'magical', 'arcane', 'divine', 'mundane'].includes(target)) && !normalizeDamageType(context.damageType ?? '')) return 'A RD do alvo depende do tipo de dano. Selecione o Tipo na arma ou ao lado de Valor no painel do mestre. Danos de tipos diferentes devem ser aplicados separadamente.';
  if (targets.some((target) => ['origins', 'magical', 'arcane', 'divine', 'mundane'].includes(target)) && (!context.damageOrigin || context.damageOrigin === 'unknown')) return 'A RD do alvo depende da origem do dano. Selecione Origem do dano na arma (mundana, mágica, arcana ou divina) ou no dano manual.';
  return null;
};
export const damageReductionSummary = (profile: DamageReductionProfile | undefined) => {
  const normalized = normalizeDamageReduction(profile);
  const label = (target: ReductionTarget) => RD_TARGETS.find(([id]) => id === target)![1];
  const describe = (name: string, base: DamageReductionBase) => `${name} ${base.immune ? 'imune (dano 1)' : base.amount}${base.name ? ` (${base.name})` : ''}${base.bypass.length ? `, ignorada por ${base.bypass.map(label).join(', ')}` : ''}`;
  const values = RD_CATEGORIES.flatMap(([id, name]) => { const base = normalized.categories?.[id]; return base?.amount || base?.immune ? [describe(name, base)] : []; });
  values.push(...normalized.entries.filter(({ amount, immune }) => amount > 0 || immune).map((row) => describe(label(row.target), row)));
  return values.length ? `RD: ${values.join(' · ')}` : 'RD: 0';
};
export const reductionTypeTotals = (profile: DamageReductionProfile) => DAMAGE_TYPES.map((type) => ({ type, total: resolveDamageReduction(profile, { damageType: type }) }));
