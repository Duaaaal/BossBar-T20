import type { CharacterSheetSummary } from './character-sheet';
import { attackTestFormulaExpression, parseAttackTestFormula } from './player-combat.ts';

export const sheetAttackTestExpression = (attack: CharacterSheetSummary['attacks'][number], summary: CharacterSheetSummary) => {
  const skill = summary.skills.find(({ name }) => name.toLowerCase() === (attack.skill || 'Luta').toLowerCase());
  return attackTestFormulaExpression(parseAttackTestFormula(attack.attackBonus, attack.attackBonusIncludesSkill), attack.attackBonusIncludesSkill ? 0 : skill?.total ?? 0);
};

type Values = Record<string, string>;
const number = (value: string | undefined) => Number((value || '0').replace(',', '.'));
const normalized = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export const equipmentKeys = (kind: 'Armadura' | 'Escudo', index: number) => ({
  name: index === 1 ? kind : `BossBar.${kind}.${index}.Nome`,
  defense: index === 1 ? kind === 'Armadura' ? 'B.Arm1' : 'B.Esc2' : `BossBar.${kind}.${index}.Defesa`,
  penalty: index === 1 ? kind === 'Armadura' ? 'Pa' : 'Pe' : `BossBar.${kind}.${index}.Penalidade`,
  equipped: `BossBar.${kind}.${index}.Equipado`,
  otherDefense: `BossBar.${kind}.${index}.OutrosDefesa`,
  otherPenalty: `BossBar.${kind}.${index}.OutrosPenalidade`,
  limit: `BossBar.${kind}.${index}.LimiteAtributo`,
});

export const equippedRows = (values: Values, kind: 'Armadura' | 'Escudo') => {
  const rows = Array.from({ length: 20 }, (_, index) => index + 1);
  if (rows.some((index) => equipmentKeys(kind, index).equipped in values)) return rows.filter((index) => values[equipmentKeys(kind, index).equipped] === 'Yes');
  return [1]; // Compatibility with sheets written before equipment selection.
};

/** Livro Básico, pp. 152–153 and 167. Unknown equipment keeps its imported/manual limit. */
export const inferredArmorAttributeLimit = (name: string): string | null => {
  const text = normalized(name);
  if (/brunea|cota de malha|loriga segmentada|meia armadura|armadura completa|armadura pesada/.test(text)) return text.includes('mitral') ? '2' : '0';
  if (/acolchoada|armadura de couro|couro batido|gibao de peles|couraca|armadura leve/.test(text)) return '';
  return null;
};

export const selectedArmorLimit = (values: Values) => {
  const index = equippedRows(values, 'Armadura')[0];
  if (!index) return '';
  return values[equipmentKeys('Armadura', index).limit] ?? (values['arm pesa'] === 'Yes' ? '' : values['BossBar.LimiteAtributoDefesa'] || '0');
};

export const attackSkillName = (values: Values, index: number, secondary = false): 'Luta' | 'Pontaria' => {
  const prefix = `BossBar.Ataque.${index}${secondary ? '.Segunda' : ''}`;
  const configured = values[`${prefix}.Pericia`];
  if (configured === 'Luta' || configured === 'Pontaria') return configured;
  const range = values[secondary ? `${prefix}.Alcance` : `Alcance ${index}`] || '';
  return /curto|medio|longo/i.test(normalized(range)) ? 'Pontaria' : 'Luta';
};
export const attackSkillTotal = (values: Values, index: number, secondary = false) => values[attackSkillName(values, index, secondary) === 'Luta' ? '190' : '260'] ?? '';
export const adjustmentFormula = (adjustment: string) => `1d20${adjustment.trim() ? ` ${/^[+-]/.test(adjustment.trim()) ? '' : '+ '}${adjustment.trim()}` : ''}`;
export const combinedAttackBonus = (base: string, adjustment: string) => {
  let total = number(base); const dice: string[] = [];
  for (const term of adjustment.replace(/\s/g, '').match(/[+-]?(?:\d+d\d+|\d+)/gi) ?? []) {
    if (/d/i.test(term)) dice.push(`${dice.length && !/^[+-]/.test(term) ? '+' : ''}${term}`);
    else total += Number(term);
  }
  return dice.length ? `${dice.join(' ')} ${total < 0 ? '-' : '+'} ${Math.abs(total)}` : String(total);
};

const legacyAdjustment = (formula: string, base: number, includesSkill: boolean) => {
  const withoutDie = formula.trim().replace(/^1d20\s*\+?\s*/i, '') || '0';
  if (!includesSkill) return withoutDie;
  if (/^[+-]?\s*\d+$/.test(withoutDie)) return String(Number(withoutDie.replace(/\s/g, '')) - base);
  return `${withoutDie} ${base < 0 ? '+' : '-'} ${Math.abs(base)}`;
};

export const upgradeSheetLoadout = (values: Values) => {
  if (values['BossBar.EquipmentVersion'] !== '2') {
    for (const kind of ['Armadura', 'Escudo'] as const) {
      const keys = equipmentKeys(kind, 1);
      const legacyTotal = values[kind === 'Armadura' ? 'B.Arm' : 'B.Esc'];
      if (values[keys.defense] === undefined && legacyTotal !== undefined) values[keys.defense] = String(number(legacyTotal) - number(values[keys.otherDefense]));
      const configured = Boolean(values[keys.name]?.trim() || number(values[keys.defense]) || number(values[keys.penalty]) || number(values[keys.otherDefense]));
      values[keys.equipped] ??= configured ? 'Yes' : 'Off';
      if (kind === 'Armadura') values[keys.limit] ??= values['arm pesa'] === 'Yes'
        ? inferredArmorAttributeLimit(values[keys.name] || '') ?? ''
        : values['BossBar.LimiteAtributoDefesa']?.trim() || (inferredArmorAttributeLimit(values[keys.name] || '') ?? '0');
    }
    values['BossBar.EquipmentVersion'] = '2';
  }
  let principalFound = Array.from({ length: 20 }, (_, index) => `BossBar.Ataque.${index + 1}.Principal`).some((key) => key in values);
  for (let index = 1; index <= 20; index++) {
    const prefix = `BossBar.Ataque.${index}`;
    const configured = Boolean(values[`Ataque ${index}`]?.trim() || values[`Dano ${index}`]?.trim());
    if (!configured && !Object.keys(values).some((name) => name.startsWith(`${prefix}.`))) continue;
    values[`${prefix}.Pericia`] = attackSkillName(values, index);
    const base = attackSkillTotal(values, index);
    values[`${prefix}.Base`] = base;
    if (!(`${prefix}.Ajuste` in values)) {
      const includesSkill = values[`${prefix}.TesteTotal`] === 'Yes' || (values[`${prefix}.TesteTotal`] === undefined && values['BossBar.Source'] === 'nimb' && !values['BossBar.MigratedFrom']);
      values[`${prefix}.Ajuste`] = legacyAdjustment(values[`Bônus Atq ${index}`] || '0', number(base), includesSkill);
    }
    if (!principalFound && configured && !(`${prefix}.Principal` in values)) { values[`${prefix}.Principal`] = 'Yes'; principalFound = true; }
    values[`${prefix}.Principal`] ??= 'Off';
    if (values[`${prefix}.DanoAlternativo`]?.trim() && !(`${prefix}.DuasArmas` in values)) {
      values[`${prefix}.DuasArmas`] = 'Yes';
      values[`${prefix}.Segunda.Nome`] = `${values[`Ataque ${index}`] || 'Arma dupla'} — segunda extremidade`;
      values[`${prefix}.Segunda.Dano`] = values[`${prefix}.DanoAlternativo`];
      values[`${prefix}.Segunda.Ajuste`] = values[`${prefix}.Ajuste`];
      values[`${prefix}.Segunda.Pericia`] = values[`${prefix}.Pericia`];
      values[`${prefix}.Segunda.Critico`] = values[`Crítico ${index}`] || '20/x2';
      values[`${prefix}.Segunda.Tipo`] = values[`Tipo ${index}`] || '';
      values[`${prefix}.Segunda.Alcance`] = values[`Alcance ${index}`] || 'Adjacente';
      values[`${prefix}.Informacoes`] = [values[`${prefix}.Informacoes`], 'Segunda extremidade da arma dupla preservada da ficha anterior.'].filter(Boolean).join('\n');
    }
    if (values[`${prefix}.DuasArmas`] === 'Yes') {
      values[`${prefix}.Segunda.Pericia`] = attackSkillName(values, index, true);
      values[`${prefix}.Segunda.Base`] = attackSkillTotal(values, index, true);
    }
  }
  return values;
};
