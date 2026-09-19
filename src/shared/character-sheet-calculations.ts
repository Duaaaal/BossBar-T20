import { equipmentKeys, equippedRows, selectedArmorLimit } from './character-sheet-loadout.ts';
import { passiveDefenseSources } from './defense-sources.ts';
type Values = Record<string, string>;
const numeric = (value: string | undefined) => Number((value || '0').replace(',', '.'));
export const sheetDefenseBreakdown = (values: Values) => {
  const limit = selectedArmorLimit(values);
  const attribute = numeric(values.ModAtribDefe);
  const appliedAttribute = limit.trim() ? Math.min(attribute, numeric(limit)) : attribute;
  const lines = ['Base natural: 10 · Livro Básico, p. 106.', `Atributo ${values.SeleAtribDefe || 'não identificado'}: ${attribute}${limit.trim() ? '; limite da armadura ' + limit : '; sem limite da armadura'} → ${appliedAttribute}.`];
  let total = 10 + appliedAttribute;
  for (const kind of ['Armadura', 'Escudo'] as const) {
    for (const index of equippedRows(values, kind)) {
      const keys = equipmentKeys(kind, index); const amount = numeric(values[keys.defense]) + numeric(values[keys.otherDefense]);
      lines.push(`${kind}: ${values[keys.name] || 'sem nome'} · ${numeric(values[keys.defense])} + ${numeric(values[keys.otherDefense])} (Outros: Defesa) = ${amount}.`); total += amount;
    }
  }
  const sources = passiveDefenseSources(values);
  const attributes = new Map<string, number>([[values.SeleAtribDefe || '', appliedAttribute]]);
  for (const source of sources) if (source.attribute) attributes.set(source.attribute, Math.max(attributes.get(source.attribute) ?? -Infinity, source.amount));
  const counted = new Set<string>();
  for (const source of sources) {
    let applied = source.amount;
    if (source.attribute) {
      applied = counted.has(source.attribute) || source.amount !== attributes.get(source.attribute) ? 0 : source.amount - (source.attribute === values.SeleAtribDefe ? appliedAttribute : 0);
      if (source.amount === attributes.get(source.attribute)) counted.add(source.attribute);
    }
    total += applied;
    lines.push(`${source.name}: ${source.amount}${source.attribute ? ` (${source.attribute}; ${applied} adicional após evitar duplicação do atributo)` : ''} · ${source.detail} ${source.source}`);
  }
  const other = numeric(values['Outros B.CA']); total += other;
  lines.push(`Outros: ${other}${values['BossBar.DefesaJustificativa'] ? ' · ' + values['BossBar.DefesaJustificativa'] : ' (fonte manual não detalhada)'}.`, `Defesa total: ${total}.`, 'Não há bônus geral por nível. Progressões usam os níveis da classe que concede a habilidade. Um mesmo atributo não soma duas vezes. Livro Básico, p. 226.', 'Efeitos que gastam ações/PM ou dependem da situação devem ser registrados em Outros enquanto ativos.');
  return { total, description: lines.join('\n'), sources };
};
export const sheetDefenseTotal = (values: Values) => sheetDefenseBreakdown(values).total;

export const armorPenaltyTotal = (values: Values) => Math.max(0, (['Armadura', 'Escudo'] as const).reduce((total, kind) =>
  total + equippedRows(values, kind).reduce((sum, index) => {
    const keys = equipmentKeys(kind, index);
    return sum + Math.abs(numeric(values[keys.penalty])) - numeric(values[keys.otherPenalty]);
  }, 0), 0));

export const equipmentDefenseTotal = (values: Values, kind: 'Armadura' | 'Escudo') =>
  equippedRows(values, kind).reduce((total, index) => {
    const keys = equipmentKeys(kind, index);
    return total + numeric(values[keys.defense]) + numeric(values[keys.otherDefense]);
  }, 0);

/** Livro Básico — Jogo do Ano, p. 170, Tabela 4-1. */
export const baseSpellManaCost = (circle: string) => ({ '1': 1, '2': 3, '3': 6, '4': 10, '5': 15 } as Record<string, number>)[circle.trim()] ?? null;

export const SHEET_COIN_FIELDS = ['BossBar.Tibares', 'BossBar.TibaresOuro', 'BossBar.MoedaPersonalizada.Quantidade'] as const;
