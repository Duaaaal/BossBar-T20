import type { CharacterSheetEditorField } from './shared/character-sheet';
import { armorPenaltyTotal, equipmentDefenseTotal, baseSpellManaCost, sheetDefenseBreakdown } from './shared/character-sheet-calculations';
import { equipmentKeys, equippedRows, attackSkillName } from './shared/character-sheet-loadout';
import { sheetInventoryLoad } from './shared/character-sheet-inventory';
import { parseAttributePlan, ATTRIBUTE_PLAN_FIELD, type AttributeCode } from './shared/character-attributes';
import { attributeCalculationDescription } from './shared/attribute-calculation-description';
import { characterResources } from './shared/character-resources';
import { calculateCharacterSkills, skillDisplayName } from './shared/character-skills';

export const inventoryCalculationDescription = (load: ReturnType<typeof sheetInventoryLoad>) =>
  `Carga real = ${load.gross ?? '?'} (bruta) − ${load.equipped ?? '?'} (equipada) = ${load.total ?? '?'} espaços`;

export const sheetCalculationDescription = (name: string, fields: CharacterSheetEditorField[]): string => {
  const values = Object.fromEntries(fields.map(({ name, value }) => [name, value])); const number = (key: string) => Number((values[key] || '0').replace(',', '.'));
  const field = fields.find((entry) => entry.name === name);
  if (name === 'PVs Totais' || name === 'PMs Totais') {
    const calculation = characterResources(values); const health = name === 'PVs Totais';
    if (!calculation) return 'Escolha a classe e informe seus níveis para calcular a progressão de PV e PM.';
    const expected = health ? calculation.health : calculation.mana;
    const terms = health ? calculation.healthCalculation : calculation.manaCalculation;
    const adjustment = expected !== null && values[name]?.trim() ? number(name) - expected : 0;
    return `${health ? 'PV' : 'PM'} = ${health && expected === null ? '? (CON) + ' : ''}${terms.join(' + ') || '0'}${!health && expected === null ? ' + ? (atributo pendente)' : ''}${adjustment ? ` + ${adjustment} (outros ajustes)` : ''} = ${expected === null ? 'a confirmar' : expected + adjustment}`;

  }
  if (name === 'CA') return sheetDefenseBreakdown(values).description;
  if (name === 'CargaTotal') return inventoryCalculationDescription(sheetInventoryLoad(values));
  if (name === 'BossBar.PenalidadeArmadura' || name === 'B.Arm' || name === 'B.Esc') {
    const penalty = name === 'BossBar.PenalidadeArmadura';
    const lines = (['Armadura', 'Escudo'] as const).filter((kind) => penalty || (name === 'B.Arm' ? kind === 'Armadura' : kind === 'Escudo')).flatMap((kind) => equippedRows(values, kind).map((index) => {
      const keys = equipmentKeys(kind, index);
      return `${kind}: ${values[keys.name] || 'sem nome'} · ${penalty ? `${Math.abs(number(keys.penalty))} − ${number(keys.otherPenalty)} (Outros: Penalidade)` : `${number(keys.defense)} + ${number(keys.otherDefense)} (Outros: Defesa)`}`;
    }));
    return [...lines, `${penalty ? 'Penalidade total (mínimo 0)' : 'Bônus total'}: ${penalty ? armorPenaltyTotal(values) : equipmentDefenseTotal(values, name === 'B.Arm' ? 'Armadura' : 'Escudo')}.`, 'Somente equipamentos selecionados. Livro Básico, p. 152.'].join('\n');
  }
  if (name === 'CargaMax' || name === 'Levantar') {
    const force = values.ModFor?.trim() ? number('ModFor') : null;
    const max = force === null ? null : 10 + (force > 0 ? force * 2 : force);
    const capacity = values.CargaMax?.trim() ? number('CargaMax') : max;
    const expected = name === 'CargaMax' ? max : capacity === null ? null : capacity * 2;
    const adjustment = expected !== null && values[name]?.trim() ? number(name) - expected : 0;
    const equation = name === 'CargaMax'
      ? `Carga máxima = 10 (base) + ${force === null ? '?' : force > 0 ? `${force} × 2` : force} (FOR)`
      : `Levantar = ${capacity ?? '?'} (carga máxima) × 2`;
    return `${equation}${adjustment ? ` + ${adjustment} (ajustes)` : ''} = ${expected === null ? '?' : expected + adjustment} espaços`;

  }
  const spell = /^(BossBar\.Magia\.\d+)\.Custo$/.exec(name);
  if (spell) return `Custo = ${baseSpellManaCost(values[spell[1] + '.Circulo'] || '') ?? '?'} PM (${values[spell[1] + '.Circulo'] || '?'}º círculo)`;
  if (name === 'TesteResist') return `CD = 10 (base) + ${number('ModAtribMagia')} (${values.SeleAtribMagia || 'atributo'}) + ${Math.floor(number('Lv') / 2)} (metade do nível ${values.Lv}) + ${number('BossBar.CdOutros')} (outros) = ${10 + number('ModAtribMagia') + Math.floor(number('Lv') / 2) + number('BossBar.CdOutros')}`;
  if (/^ModAtrib/.test(name)) {
    const code = values[name.replace('ModAtrib', 'SeleAtrib')] || ''; const attr = (code.slice(0, 1).toUpperCase() + code.slice(1).toLowerCase()) as AttributeCode;
    const plan = parseAttributePlan(values[ATTRIBUTE_PLAN_FIELD]);
    return plan && ['For', 'Des', 'Con', 'Int', 'Sab', 'Car'].includes(attr) ? attributeCalculationDescription(plan, attr) : `${code || 'Atributo'} = ${values[name] || 'a confirmar'}`;
  }
  const attack = /^BossBar\.Ataque\.(\d+)\.(Segunda\.)?Base$/.exec(name);
  if (attack || (field?.section === 'Perícias' && field.label === 'Total')) {
    const skill = attack ? attackSkillName(values, Number(attack[1]), Boolean(attack[2])) : field!.group!;
    const entry=[...calculateCharacterSkills(values).values()].find((entry)=>entry.rule.name===skill);
    if(!entry)return 'Complete os dados da perícia para calcular o total.';
    const name=attack?'Teste':skillDisplayName(entry.rule,values);
    if(entry.replacement)return `${name} = ${entry.total} (${entry.replacement}, por substituição)`;
    const extras=entry.sources.filter((source)=>source.amount).map((source)=>` + ${source.amount} (${source.name})`).join('');
    return `${name} = ${entry.attributeValue} (${entry.attribute}) + ${entry.halfLevel} (metade do nível ${values.Lv}) + ${entry.training} (treino) + ${entry.other} (outros)${entry.size?` + ${entry.size} (tamanho)`:''}${entry.penalty?` − ${entry.penalty} (armadura)`:''}${extras} = ${entry.total}${entry.dice.length?' + '+entry.dice.join(' + ')+' (dados adicionais)':''}${entry.roll?`; 2d20, usar o ${entry.roll==='best'?'melhor':'pior'}`:''}`;
  }
  return `${field?.label || name}: ${values[name] || 'não informado'}.\n${name === 'BossBar.Nimb.PaginasAdicionais' ? 'Informações adicionais. Registre alterações em Anotações da ficha.' : 'Consulte o campo de origem para revisar.'}`;
};
