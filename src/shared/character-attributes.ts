import type { CharacterSheetIssue } from './character-sheet';
import { ATTRIBUTE_SOURCES, attributeSourceCitation, inferAttributeSources, type InferredAttributeSources } from './attribute-sources.ts';

export const ATTRIBUTE_PLAN_FIELD = 'BossBar.Atributos.Distribuicao';
export const ATTRIBUTES = [['For', 'Força'], ['Des', 'Destreza'], ['Con', 'Constituição'], ['Int', 'Inteligência'], ['Sab', 'Sabedoria'], ['Car', 'Carisma']] as const;
export type AttributeCode = typeof ATTRIBUTES[number][0];
export type AttributeIncrease = { id: string; attribute: AttributeCode; level: number; amount?: number; sourceId?: string; note?: string; duration?: 'permanent' | 'temporary'; active?: boolean };
export type AttributeRoll = { dice: number[]; value: number; attempts: number[][] };
export type AttributeRolls = { generation: string; results: Partial<Record<AttributeCode, AttributeRoll>> };
export type AttributePlan = { version: 1 | 2; method: 'unreviewed' | 'points' | 'rolled' | 'manual'; base: Record<string, string>; adjustments: Record<string, string>; increases: AttributeIncrease[];
  inferred?: InferredAttributeSources; importedTotals?: Record<string, number | null>; identity?: string; rolls?: AttributeRolls };
export const emptyAttributePlan = (method: AttributePlan['method'] = 'unreviewed'): AttributePlan => ({ version: 1, method,
  base: Object.fromEntries(ATTRIBUTES.map(([key]) => [key, ['points', 'manual'].includes(method) ? '0' : ''])), adjustments: Object.fromEntries(ATTRIBUTES.map(([key]) => [key, '0'])), increases: [] });
export const parseAttributePlan = (raw?: string): AttributePlan | null => {
  if (!raw) return emptyAttributePlan();
  try {
    const value = JSON.parse(raw);
    if (![1, 2].includes(value?.version) || !['unreviewed', 'points', 'rolled', 'manual'].includes(value.method) || !value.base || !value.adjustments || !Array.isArray(value.increases) || value.increases.length > 100) return null;
    if (ATTRIBUTES.some(([key]) => typeof value.base[key] !== 'string' || value.base[key].length > 20 || typeof value.adjustments[key] !== 'string' || value.adjustments[key].length > 20)) return null;
    if (value.importedTotals && ATTRIBUTES.some(([key]) => value.importedTotals[key] !== null && (!Number.isInteger(value.importedTotals[key]) || Math.abs(value.importedTotals[key]) > 1000))) return null;
    if (value.rolls) {
      if (typeof value.rolls.generation !== 'string' || value.rolls.generation.length > 100 || !value.rolls.results || typeof value.rolls.results !== 'object') return null;
      const validDice = (dice: unknown): dice is number[] => Array.isArray(dice) && dice.length === 4 && dice.every((die) => Number.isInteger(die) && die >= 1 && die <= 6);
      for (const [code, result] of Object.entries(value.rolls.results) as [string, AttributeRoll][]) {
        if (!ATTRIBUTES.some(([key]) => code === key) || !result || !validDice(result.dice) || result.value !== rolledAttributeValue(result.dice) || !Array.isArray(result.attempts) || !result.attempts.length || result.attempts.length > 1001 || !result.attempts.every(validDice) || JSON.stringify(result.attempts.at(-1)) !== JSON.stringify(result.dice)) return null;
      }
    }
    if (value.increases.some((entry: AttributeIncrease) => !entry || typeof entry.id !== 'string' || !ATTRIBUTES.some(([key]) => key === entry.attribute) || !Number.isInteger(entry.level) || (entry.amount !== undefined && (!Number.isInteger(entry.amount) || Math.abs(entry.amount) > 100)) || (entry.sourceId !== undefined && !ATTRIBUTE_SOURCES.some(({ id }) => id === entry.sourceId)) || (entry.duration !== undefined && !['permanent', 'temporary'].includes(entry.duration)) || (entry.note !== undefined && (typeof entry.note !== 'string' || entry.note.length > 1000)))) return null;
    if (value.inferred && (!Array.isArray(value.inferred.choices) || value.inferred.choices.length > 100 || !Array.isArray(value.inferred.labels) || !Array.isArray(value.inferred.unresolved) || !value.inferred.fixed || Object.values(value.inferred.fixed).some((v) => !Number.isInteger(v)) || value.inferred.choices.some((c: InferredAttributeSources['choices'][number]) => !c || typeof c.id !== 'string' || typeof c.label !== 'string' || typeof c.source !== 'string' || !Number.isInteger(c.count) || c.count < 1 || c.count > 6 || !Number.isInteger(c.amount) || !Array.isArray(c.selected) || !Array.isArray(c.allowed) || c.allowed.some((a) => !ATTRIBUTES.some(([code]) => a === code)) || c.selected.some((a) => a && !ATTRIBUTES.some(([code]) => a === code))))) return null;
    return value;
  } catch { return null; }
};
export const attributeTier = (level: number) => level <= 4 ? 0 : level <= 10 ? 1 : level <= 16 ? 2 : 3;
export const attributePlanDescription = (raw: string) => {
  const plan = parseAttributePlan(raw); if (!plan) return 'Distribuição inválida';
  const method = { unreviewed: 'Valores importados', points: 'Compra por pontos', rolled: 'Rolagens', manual: 'Definidos pelo mestre' }[plan.method];
  return [method, 'Base: ' + ATTRIBUTES.map(([code]) => code + ' ' + (plan.base[code] || 'pendente')).join(', '),
    ...(plan.inferred?.labels || []), ...(plan.inferred?.choices || []).map((choice) => choice.label + ': ' + (choice.selected.filter(Boolean).join(', ') || 'a confirmar')),
    ...plan.increases.map((entry) => { const source = ATTRIBUTE_SOURCES.find(({ id }) => id === entry.sourceId) ?? ATTRIBUTE_SOURCES[0]; return `${source.name}: ${entry.attribute} ${entry.amount ?? 1}; nível ${entry.level}; ${(entry.duration ?? source.duration) === 'temporary' ? 'temporário' : 'permanente'}; ${attributeSourceCitation(source)}${entry.note ? '; ' + entry.note : ''}`; }),
  ].join('\n');
};
export const ATTRIBUTE_COST: Record<number, number> = { [-1]: -1, 0: 0, 1: 1, 2: 2, 3: 4, 4: 7 };
const integer = (value: string | undefined) => value?.trim() && /^[+-]?\d+$/.test(value.trim()) ? Number(value) : null;
export const attributeSourceTotals = (plan: AttributePlan, code: AttributeCode) => {
  const race = (plan.inferred?.fixed[code] || 0) + (plan.inferred?.choices.reduce((sum, choice) => sum + choice.selected.filter((selected) => selected === code).length * choice.amount, 0) || 0);
  const groups = new Map<string, number>(); let permanent = Number(plan.adjustments[code]) || 0;
  for (const entry of plan.increases.filter((e) => e.attribute === code && e.active !== false)) {
    const source = ATTRIBUTE_SOURCES.find(({ id }) => id === entry.sourceId); const amount = entry.amount ?? 1;
    const temporary = (entry.duration ?? source?.duration) === 'temporary';
    if (!temporary) { permanent += amount; continue; }
    const group = source?.kind === 'spell' || source?.kind === 'item' ? `${source.kind}:${amount >= 0 ? 'bonus' : 'penalty'}` : entry.sourceId || entry.id;
    const previous = groups.get(group) || 0; groups.set(group, amount >= 0 ? Math.max(previous, amount) : Math.min(previous, amount));
  }
  return { race, permanent, temporary: [...groups.values()].reduce((a, b) => a + b, 0) };
};
export const deduceImportedAttributeBase = (plan: AttributePlan) => {
  if (plan.method !== 'unreviewed' || !plan.importedTotals) return;
  for (const [code] of ATTRIBUTES) {
    const { race, permanent, temporary } = attributeSourceTotals(plan, code);
    const total = plan.importedTotals[code];
    plan.base[code] = total === null ? '' : String(total - race - permanent - temporary);
  }
};
export const attributeIdentityKey = (values: Record<string, string>) => JSON.stringify([values['RAÇA'], values.ORIGEM, values.CLASSE, values.SeleTamanho, ...Object.entries(values).filter(([name]) => name.startsWith('BossBar.Habilidades.'))]);
export const inferAttributePlan = (values: Record<string, string>, plan = emptyAttributePlan()): AttributePlan => {
  const inferred = inferAttributeSources(values);
  for (const choice of inferred.choices) {
    const previous = plan.inferred?.choices.find(({ id, count, allowed }) => id === choice.id && count === choice.count && JSON.stringify(allowed) === JSON.stringify(choice.allowed));
    if (previous) choice.selected = [...previous.selected];
  }
  plan = { ...plan, version: 2, inferred };
  delete plan.identity;
  if (plan.method === 'unreviewed') plan.importedTotals ??= Object.fromEntries(ATTRIBUTES.map(([code]) => [code, integer(values[`Mod${code}`])]));
  deduceImportedAttributeBase(plan);
  return plan;
};
export const rolledAttributeValue = (dice: number[]) => {
  const sum = dice.reduce((a, b) => a + b, 0) - Math.min(...dice);
  return Math.max(-2, Math.floor((sum - 10) / 2));
};
export const rollAttribute = (state: AttributeRolls, code: AttributeCode, d6: () => number) => {
  if (state.results[code]) return state;
  const roll = (key: AttributeCode) => { const dice = Array.from({ length: 4 }, d6); const previous = state.results[key]; state.results[key] = { dice, value: rolledAttributeValue(dice), attempts: [...(previous?.attempts || []), dice] }; };
  roll(code);
  if (ATTRIBUTES.every(([key]) => state.results[key])) {
    let attempts = 0;
    while (ATTRIBUTES.reduce((sum, [key]) => sum + state.results[key]!.value, 0) < 6) {
      if (++attempts > 1000) throw new Error('Não foi possível concluir a exceção das rolagens. Tente novamente.');
      const lowest = [...ATTRIBUTES].sort(([a], [b]) => state.results[a]!.value - state.results[b]!.value)[0][0]; roll(lowest);
    }
  }
  return state;
};
export const attributePlanTotals = (plan: AttributePlan) => {
  const totals: Record<string, number> = {};
  for (const [key] of ATTRIBUTES) {
    const base = integer(plan.base[key]); const extra = integer(plan.adjustments[key]);
    if (base === null || extra === null || Math.abs(base) > 100 || Math.abs(extra) > 100) return null;
    const source = attributeSourceTotals(plan, key);
    totals[`Mod${key}`] = base + source.race + source.permanent + source.temporary;
  }
  return totals;
};
export const attributeAllocationStatus = (plan: AttributePlan) => {
  if (plan.method === 'unreviewed') return plan.inferred?.choices.some((c) => c.selected.filter(Boolean).length !== c.count) || plan.inferred?.unresolved.length ? 'Totais preservados; confirme as escolhas de origem dos bônus.' : 'Atributos alocados: base + bônus = total.';
  if (plan.method === 'manual') return 'Distribuição personalizada; confira os ajustes com o mestre.';
  const bases = ATTRIBUTES.map(([key]) => integer(plan.base[key]));
  if (bases.some((value) => value === null)) return 'Informe os seis valores iniciais para conferir a distribuição.';
  if (plan.method === 'rolled') return `Rolagens: soma inicial ${bases.reduce<number>((sum, value) => sum + (value ?? 0), 0)}; mínimo 6 antes dos ajustes.`;
  if (bases.some((value) => ATTRIBUTE_COST[value!] === undefined)) return 'Compra por pontos: valores iniciais entre −1 e 4.';
  const spent = bases.reduce<number>((sum, value) => sum + ATTRIBUTE_COST[value!], 0);
  return spent === 10 ? 'Todos os 10 pontos foram alocados.' : spent < 10 ? `${10 - spent} ponto(s) disponível(is) de 10.` : `${spent - 10} ponto(s) acima do limite de 10.`;
};
export const applyAttributePlan = (values: Record<string, string>) => {
  let plan = parseAttributePlan(values[ATTRIBUTE_PLAN_FIELD]);
  if (plan?.version === 2) { plan = inferAttributePlan(values, plan); values[ATTRIBUTE_PLAN_FIELD] = JSON.stringify(plan); }
  const totals = plan && attributePlanTotals(plan);
  if (totals) for (const [key, value] of Object.entries(totals)) values[key] = String(value);
  return values;
};
/** A PDF editor can change totals without knowing BossBar's allocation metadata. */
export const reconcileImportedAttributePlan = (values: Record<string, string>) => {
  let plan = parseAttributePlan(values[ATTRIBUTE_PLAN_FIELD]); const totals = plan && attributePlanTotals(plan);
  if (plan && totals && Object.entries(totals).some(([key, value]) => !values[key]?.trim() || Number(values[key]) !== value)) {
    plan = { ...plan, method: 'unreviewed', importedTotals: undefined };
    values['BossBar.Import.AtributosRevisar'] = 'Os totais foram alterados no PDF. A base foi deduzida novamente a partir dos bônus registrados, preservando os novos totais.';
  }
  if (plan && (plan.method === 'unreviewed' || plan.version === 2)) values[ATTRIBUTE_PLAN_FIELD] = JSON.stringify(inferAttributePlan(values, plan));
  return values;
};
export const attributePlanIssues = (values: Record<string, string>): CharacterSheetIssue[] => {
  const plan = parseAttributePlan(values[ATTRIBUTE_PLAN_FIELD]); const issues: CharacterSheetIssue[] = [];
  const issue = (id: string, message: string, severity: 'error' | 'warning' = 'warning', field = ATTRIBUTE_PLAN_FIELD) => issues.push({ id: `attributes:${id}`, field, message, reason: message, location: 'Atributos → Distribuição', severity, autoFixable: false, source: 'Livro Básico — Jogo do Ano, pp. 17, 35 e 37', correction: 'Revise os valores iniciais, os ajustes e os aumentos registrados na seção Atributos.' });
  if (!plan) { issue('invalid', 'Os dados da distribuição de atributos são inválidos. Reabra a distribuição e revise o cadastro.', 'error'); return issues; }
  if (plan.method === 'unreviewed' && !plan.inferred) issue('unknown', 'Os totais foram preservados. Confirme os bônus de origem para deduzir os valores iniciais.');
  else {
    let spent = 0; let sum = 0; let valid = true;
    for (const [key, label] of ATTRIBUTES) {
      const base = integer(plan.base[key]); const adjustment = integer(plan.adjustments[key]);
      if (base === null || adjustment === null || Math.abs(base) > 100 || Math.abs(adjustment) > 100) { issue(`number:${key}`, `${label}: informe valores inteiros válidos para Base e Ajustes.`, 'error'); valid = false; continue; }
      sum += base;
      if (plan.method === 'unreviewed' && (base < -2 || base > 4)) issue(`imported-range:${key}`, `${label}: a base deduzida é ${base}, fora do intervalo inicial de −2 a 4. Confira bônus ainda não identificados ou uma regra da mesa; o total do PDF foi preservado.`);
      if (plan.method === 'points' || plan.method === 'rolled') {
        const min = plan.method === 'points' ? -1 : -2;
        if (base < min || base > 4) { issue(`range:${key}`, `${label}: o valor inicial deve estar entre ${min} e 4, antes de raça e outros ajustes.`, 'error'); valid = false; }
      }
      spent += ATTRIBUTE_COST[base] ?? 0;
    }
    if (valid && plan.method === 'points' && spent !== 10) issue('budget', attributeAllocationStatus(plan), spent > 10 ? 'error' : 'warning');
    if (valid && plan.method === 'rolled' && sum < 6) issue('rolls', 'A soma dos atributos rolados deve ser pelo menos 6 antes dos ajustes. Role novamente o menor resultado conforme o livro.', 'error');
    const seen = new Set<string>(); const level = Number(values.Lv);
    for (const entry of plan.increases) {
      const source = ATTRIBUTE_SOURCES.find(({ id }) => id === entry.sourceId);
      if (source?.allowedAmounts ? !source.allowedAmounts.includes(entry.amount ?? 1) : source?.amount !== undefined && !['spell', 'master'].includes(source.kind) && (entry.amount ?? 1) !== source.amount) issue(`amount:${entry.id}`, `${source!.name}: valores previstos ${source!.allowedAmounts?.join(' ou ') ?? source!.amount}. Para personalização, selecione Mestre.`, 'error');
      if (source?.attribute && entry.attribute !== source.attribute) issue(`attribute:${entry.id}`, `${source.name}: o atributo previsto é ${source.attribute}.`, 'error');
      if (source?.allowedAttributes && !source.allowedAttributes.includes(entry.attribute)) issue(`attribute:${entry.id}`, `${source.name}: escolha entre ${source.allowedAttributes.join(', ')}.`, 'error');
      if (source && source.kind !== 'master' && entry.duration && entry.duration !== source.duration) issue(`duration:${entry.id}`, `${source.name}: use duração ${source.duration === 'temporary' ? 'temporária' : 'permanente'}. Para uma exceção da mesa, selecione Mestre.`, 'error');
      if (source?.unique && plan.increases.some((other) => other !== entry && other.sourceId === entry.sourceId && other.attribute === entry.attribute)) issue(`unique:${entry.id}`, `${source.name}: esse aumento não se repete para o mesmo atributo.`, 'error');
      if (entry.level < 1 || entry.level > 20 || entry.level > level) issue(`level:${entry.id}`, `Aumento de ${entry.attribute}: nível de aquisição ${entry.level} inválido para um personagem de nível ${level}.`, 'error');
      if (source && !source.tierLimited) continue;
      const key = `${entry.attribute}:${attributeTier(entry.level)}`;
      if (seen.has(key)) issue(`tier:${entry.id}`, `${entry.attribute}: Aumento de Atributo só pode ser escolhido uma vez por patamar para o mesmo atributo.`, 'error');
      seen.add(key);
    }
    const totals = attributePlanTotals(plan);
    if (totals) for (const [key, total] of Object.entries(totals)) if (Number(values[key]) !== total) issue(`total:${key}`, `${key.slice(3)}: o total não corresponde à base, ajustes e aumentos registrados.`, 'error', key);
  }
  for (const choice of plan.inferred?.choices || []) {
    const selected = choice.selected.filter(Boolean);
    const invalid = selected.length > choice.count || selected.some((a) => !choice.allowed.includes(a)) || (choice.distinct && new Set(selected).size !== selected.length);
    if (selected.length !== choice.count || invalid) issue(`choice:${choice.id}`, `${choice.label}: confirme ${choice.count} atributo(s) ${choice.distinct ? 'diferentes' : '(podem se repetir)'}. Os totais importados permanecem iguais.`, invalid ? 'error' : 'warning');
  }
  for (const [index, message] of (plan.inferred?.unresolved || []).entries()) issue(`source:${index}`, message);
  for (const [key, label] of ATTRIBUTES) if (Number(values[`Mod${key}`]) < -5) issue(`minimum:${key}`, `${label} abaixo de −5: ${key === 'Con' ? 'o personagem morre' : ['For', 'Des'].includes(key) ? 'o personagem fica paralisado' : key === 'Car' ? 'o personagem torna-se um NPC' : 'o personagem fica inconsciente'}, conforme o Livro Básico, p. 17.`, 'warning', `Mod${key}`);
  return issues;
};
