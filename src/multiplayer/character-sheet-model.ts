/** PDF adapters. Canonical field identifiers remain stable for saved encounters
 * and clients; the current PDF representation is the editable Nimb layout. */
import { normalizeAttackRange, normalizeDamageType } from '../shared/attack-options.ts';
import { armorPenaltyTotal, equipmentDefenseTotal, sheetDefenseBreakdown } from '../shared/character-sheet-calculations.ts';
import { upgradeSheetLoadout, equipmentKeys, equippedRows, selectedArmorLimit, attackSkillTotal, combinedAttackBonus } from '../shared/character-sheet-loadout.ts';
import { calculateCharacterSkills } from '../shared/character-skills.ts';
export type SheetValues = Record<string, string>;
export const SHEET_MODEL_VERSION = 3;
export const SHEET_RULES_VERSION = 't20-jda-2026-09-r8';
export const SHEET_TEXT_LIMIT = 100_000;
export const SHEET_EXTRA_FIELD = 'BossBar.CanonicalData';

export const NIMB_FIELD_ALIASES: Record<string, string> = {
  'NOME DO PERSONAGEM': 'Nome', JOGADOR: 'Jogador', 'RAÇA': 'Raca', ORIGEM: 'Origem',
  CLASSE: 'Classe', Lv: 'nivel', DIVINDADE: 'Divindade',
  ModFor: 'modFor', ModDes: 'modDes', ModCon: 'modCon', ModInt: 'modInt', ModSab: 'modSab', ModCar: 'modCar',
  'PVs Totais': 'vidaMax', 'PVs Atuais': 'vidaAtual', 'PMs Totais': 'manaMax', 'PMs Atuais': 'manaAtual',
  CA: 'Texto13', 'B.Arm': 'defesa1', 'B.Arm1': 'defesa1', 'B.Esc': 'defesa2', 'B.Esc2': 'defesa2',
  'Outros B.CA': 'defesaOutros', Armadura: 'armadura1', Escudo: 'armadura2', Pa: 'penalidade1', Pe: 'penalidade2',
  'Proficiências': 'caracteristicas', SeleTamanho: 'modTamanho', ModFurtTam: 'tFurtividade',
  Desloc: 'deslocamento', CargaTotal: 'cargaAtual', CargaMax: 'cargaMaxima', Levantar: 'levantar',
  Exp: 'Pontos de Experiencia', 'Ofício 1': 'Texto8', 'Ofício_2': 'Texto9',
  HabRaçasOrigem: 'Habilidades de Raça e Origem', HabClassePoderes: 'Habilidades de classe e poderes',
  'Descrição': 'Descrição', Magias: 'Atualização',
  'BossBar.Nimb.Habilidades': 'Historico', 'BossBar.Nimb.Anotacoes': 'Anotações',
  'BossBar.Nimb.MagiasAdicionais': 'Magias', 'BossBar.Nimb.Equipamento': 'item1', 'BossBar.Nimb.Equipamento2': 'item2',
  'BossBar.Nimb.EntreAventuras': 'Entre aventuras', 'BossBar.Tibares': 'T$', 'BossBar.TibaresOuro': 'TO',
  'BossBar.PenalidadeArmadura': 'penalidadeDeArmadura', 'BossBar.LimiteAtributoDefesa': 'attLimit',
  'BossBar.ManobrasTamanho': 'manobras', TesteResist: 'Resistencia',
};
for (let index = 1; index <= 5; index++) {
  for (const [canonical, native] of [['Ataque', 'ataque'], ['Bônus Atq', 'tAtak'], ['Dano', 'dano'], ['Crítico', 'critico'], ['Tipo', 'tipo'], ['Alcance', 'alcance']]) {
    NIMB_FIELD_ALIASES[`${canonical} ${index}`] = `${native}${index}`;
  }
}

const skillSuffixes = ['Acro', 'Ades', 'Atle', 'Atua', 'Cava', 'Conh', 'Cura', 'Dipl', 'Enga', 'Fort', 'Furt', 'Guer', 'Inic', 'Inti', 'Intu', 'Inve', 'Joga', 'Ladi', 'Luta', 'Mist', 'Nobr', 'Ofi1', 'Ofi2', 'Perc', 'Pilo', 'Pont', 'Refl', 'Reli', 'Sobr', 'Vont'];
const skillChecks = ['acro', 'ades', 'atle', 'atua', 'caval', 'conhe', 'cura', 'dipl', 'enga', 'forti', 'furti', 'guerra', 'ini', 'inti', 'intu', 'inve', 'joga', 'ladi', 'luta', 'misti', 'nobre', 'ofi1', 'ofi2', 'perce', 'pilo', 'ponta', 'refle', 'reli', 'sobre', 'vonta'];
const skillCodes = ['010', '020', '030', '040', '050', '060', '070', '080', '090', '100', '110', '120', '130', '140', '150', '160', '170', '180', '190', '200', '220', '230', '240', '250', '210', '260', '270', '280', '290', '300'];
export const NIMB_SKILLS = skillCodes.map((code, index) => ({
  code, index, modifier: `ModAtrib${skillSuffixes[index]}`, selector: `SeleAtrib${skillSuffixes[index]}`,
  trained: `Mar Trei ${skillChecks[index]}`, half: `${code.slice(0, 2)}1`, training: `${code.slice(0, 2)}3`, other: `${code.slice(0, 2)}4`,
}));
const attributeLabels: Record<string, string> = { modFor: 'FOR', modDes: 'DES', modCon: 'CON', modInt: 'INT', modSab: 'SAB', modCar: 'CAR' };
const nativeAttribute = (value: string) => Object.keys(attributeLabels).find((name) =>
  name.toLowerCase() === value.toLowerCase() || attributeLabels[name] === value.toUpperCase()) ?? value;
const number = (value: string | undefined) => Number((value || '0').replace(',', '.'));
const itemKeys = (index: number) => [index <= 15 ? `Item${index}` : `BossBar.Item.${index}.Nome`, `BossBar.Item.${index}.Quantidade`, index <= 15 ? `PesoItem${index}` : `BossBar.Item.${index}.Peso`];
const parseInventory = (text: string) => {
  const items: Array<{ name: string; spaces: string }> = [];
  const unparsed: string[] = [];
  const overflow: string[] = [];
  for (const line of text.split(/\r?\n/).filter((line) => line.trim())) {
    const match = /^(.*?)\s*\(([\d.,]+)\s+espaços?\)\s*$/i.exec(line.trim());
    if (items.length >= 100) { overflow.push(line); continue; }
    items.push({ name: match ? match[1] : line.trim(), spaces: match ? match[2].replace(',', '.') : '' });
    if (!match) unparsed.push(line);
  }
  return { items, unparsed, overflow };
};
const populateInventory = (values: SheetValues, text: string) => {
  const { items, overflow } = parseInventory(text);
  for (let index = 1; index <= 100; index++) {
    const [name, quantity, spaces] = itemKeys(index);
    const item = items[index - 1];
    values[name] = item?.name ?? '';
    values[quantity] = item ? '1' : '';
    values[spaces] = item?.spaces ?? '';
  }
  if (overflow.length) values['BossBar.Import.InventarioRevisar'] = `O PDF excede o limite de 100 itens. Linhas preservadas no PDF original: ${overflow.join('; ')}`;
  else delete values['BossBar.Import.InventarioRevisar'];
  values['BossBar.InventoryRowsVersion'] = '2';
};

/** Keep the Nimb equipment text and the editable rows in agreement. Changing
 * both representations requires a review instead of silently choosing one. */
export const synchronizeNimbInventory = (original: SheetValues, values: SheetValues) => {
  if (original['BossBar.Source'] !== 'nimb') return;
  const textKeys = ['BossBar.Nimb.Equipamento', 'BossBar.Nimb.Equipamento2'];
  const textChanged = textKeys.some((name) => (values[name] ?? '') !== (original[name] ?? ''));
  const rowsChanged = Array.from({ length: 100 }, (_, offset) => itemKeys(offset + 1))
    .some((keys) => keys.some((key, index) => (values[key] || (index === 1 ? '0' : '')) !== (original[key] || (index === 1 ? '0' : ''))));
  if (textChanged && rowsChanged) {
    const parsed = parseInventory(textKeys.map((key) => values[key]).filter(Boolean).join('\n')).items;
    const rows = Array.from({ length: 100 }, (_, offset) => itemKeys(offset + 1)).filter(([name]) => values[name]?.trim());
    const consistent = rows.length === parsed.length && rows.every(([name, quantity, spaces], index) => {
      const count = number(values[quantity]);
      return parsed[index].name === `${count === 1 ? '' : `${count} × `}${values[name]}` && number(parsed[index].spaces) === number(values[spaces]) * count;
    });
    if (consistent) return;
    throw new Error('Itens: o texto do equipamento e as linhas de itens foram alterados ao mesmo tempo. Revise uma representação por vez para evitar substituir dados.');
  }
  if (textChanged) {
    populateInventory(values, textKeys.map((key) => values[key]).filter(Boolean).join('\n'));
    values['BossBar.CargaRevisada'] = 'Off';
  } else if (rowsChanged) {
    const overflow = parseInventory(textKeys.map((key) => original[key]).filter(Boolean).join('\n')).overflow;
    const lines: string[] = [];
    for (let index = 1; index <= 100; index++) {
      const [name, quantity, spaces] = itemKeys(index);
      if (!values[name]?.trim()) continue;
      const count = number(values[quantity]);
      lines.push(`${count === 1 ? '' : `${count} × `}${values[name]}${values[spaces]?.trim() ? ` (${number(values[spaces]) * count} espaços)` : ''}`);
    }
    values[textKeys[0]] = [...lines, ...overflow].join('\n');
    values[textKeys[1]] = '';
  }
};
export const isNimbSheet = (values: SheetValues) => ['Nome', 'nivel', 'modFor', 'vidaMax', 'total1', 'Historico'].every((name) => name in values);
export const isLegacySheet = (values: SheetValues) => ['NOME DO PERSONAGEM', 'Lv', 'ModFor', 'PVs Totais', 'CA'].every((name) => name in values);

const mergeSpellNotes = (values: SheetValues): SheetValues => {
  const previous = values['BossBar.CdJustificativa']?.trim();
  if (!previous) return values;
  const notes = values['BossBar.Nimb.MagiasAdicionais'] ?? '';
  const merged = [notes, `Origem dos outros bônus de CD:\n${previous}`].filter(Boolean).join('\n\n');
  if (merged.length > SHEET_TEXT_LIMIT) throw new Error('Anotações para Magias: o texto anterior e a origem do bônus de CD excedem o limite de 100.000 caracteres. Reduza as anotações antes de continuar; os dados originais foram preservados.');
  return { ...values, 'BossBar.Nimb.MagiasAdicionais': merged, 'BossBar.CdJustificativa': '' };
};

export const canonicalSheetValues = (raw: SheetValues): SheetValues => {
  if (!isNimbSheet(raw)) return upgradeSheetLoadout(mergeSpellNotes(raw));
  let extra: SheetValues = {};
  try {
    const parsed: unknown = JSON.parse(raw[SHEET_EXTRA_FIELD] || '{}');
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      extra = Object.fromEntries(Object.entries(parsed).filter(([key, value]) => key.length <= 180 && typeof value === 'string' && value.length <= SHEET_TEXT_LIMIT));
    }
  } catch { /* Invalid supplemental metadata is reported by the PDF inspector. */ }
  const values: SheetValues = { ...extra, 'BossBar.Source': 'nimb', 'Base CA': '10', For: '', Des: '', Con: '', Int: '', Sab: '', Car: '' };
  for (const [canonical, native] of Object.entries(NIMB_FIELD_ALIASES)) values[canonical] = raw[native] ?? '';
  for (let index = 1; index <= 5; index++) {
    const damage = values[`Dano ${index}`].trim();
    if (damage === '-') {
      values[`Dano ${index}`] = '0';
      values[`BossBar.Ataque.${index}.SemDano`] = 'Yes';
    } else if (damage.includes('/')) {
      const parts = damage.split('/');
      if (parts.length === 2) {
        values[`Dano ${index}`] = parts[0].trim();
        values[`BossBar.Ataque.${index}.DanoAlternativo`] = parts[1].trim();
      }
    }
    if (values[`Tipo ${index}`].trim() === '-') values[`Tipo ${index}`] = '';
    if (values[`Crítico ${index}`].trim() === '-') values[`Crítico ${index}`] = '';
    values[`Tipo ${index}`] = normalizeDamageType(values[`Tipo ${index}`]) ?? values[`Tipo ${index}`];
    values[`Alcance ${index}`] = normalizeAttackRange(values[`Alcance ${index}`]) ?? values[`Alcance ${index}`];
  }
  const penalty = Math.abs(number(raw.penalidadeDeArmadura || String(Math.abs(number(raw.penalidade1)) + Math.abs(number(raw.penalidade2)))));
  if (extra['BossBar.EquipmentVersion'] === '2') {
    for (const name of ['B.Arm1', 'B.Esc2', 'Armadura', 'Escudo', 'Pa', 'Pe']) if (name in extra) values[name] = extra[name];
  } else {
    values['B.Arm1'] = String(number(raw.defesa1) - number(extra['BossBar.Armadura.1.OutrosDefesa']));
    values['B.Esc2'] = String(number(raw.defesa2) - number(extra['BossBar.Escudo.1.OutrosDefesa']));
  }
  if (!('BossBar.Armadura.1.OutrosPenalidade' in extra) && !('BossBar.Escudo.1.OutrosPenalidade' in extra)) {
    const residual = Math.abs(number(raw.penalidade1)) + Math.abs(number(raw.penalidade2)) - penalty;
    if (residual) values['BossBar.Armadura.1.OutrosPenalidade'] = String(residual);
  }
  values['BossBar.PenalidadeArmadura'] = String(armorPenaltyTotal(values));
  values['arm pesa'] = raw.checkPesada === 'Yes' ? 'Off' : 'Yes';
  values.SeleAtribDefe = attributeLabels[raw.modDef] ?? raw.modDef ?? 'DES';
  values.ModAtribDefe = raw[nativeAttribute(values.SeleAtribDefe)] ?? '';
  if (!raw.defesaOutros?.trim() && raw.Texto13?.trim()) {
    const attributeDefense = values['arm pesa'] === 'Yes' ? number(values.ModAtribDefe) : Math.min(number(values.ModAtribDefe), number(raw.attLimit));
    const residual = number(raw.Texto13) - 10 - number(raw.defesa1) - number(raw.defesa2) - attributeDefense;
    if (Number.isFinite(residual) && residual !== 0) {
      values['Outros B.CA'] = String(residual);
      values['BossBar.Import.DefesaSemOrigem'] = String(residual);
    }
  }
  if (extra['BossBar.Defesa.BonusExportado'] !== undefined) values['Outros B.CA'] = String(number(raw.defesaOutros) - number(extra['BossBar.Defesa.BonusExportado']));
  values.SeleAtribMagia = attributeLabels[raw.modSelectMagia] ?? raw.modSelectMagia ?? '';
  values.ModAtribMagia = raw.modificadorMagia ?? '';
  const spellAttribute = raw[nativeAttribute(values.SeleAtribMagia)];
  const spellBase = 10 + Math.floor(number(raw.nivel) / 2) + number(spellAttribute);
  if (!('BossBar.CdOutros' in extra) && raw.nivel?.trim() && spellAttribute?.trim() && number(raw.Resistencia) > spellBase) {
    values['BossBar.CdOutros'] = String(number(raw.Resistencia) - spellBase);
    values['BossBar.Import.CdSemOrigem'] = values['BossBar.CdOutros'];
  }
  for (const suffix of ['Defe', 'Magia']) {
    if (`BossBar.Migration.Attribute.${suffix}` in extra) {
      values[`ModAtrib${suffix}`] = extra[`BossBar.Migration.Attribute.${suffix}`];
      values[`SeleAtrib${suffix}`] = 'Revisar';
    }
  }
  if (!Object.keys(extra).some((name) => /^Item\d+$/.test(name) || /^BossBar\.Item\./.test(name))) {
    populateInventory(values, [raw.item1, raw.item2].filter(Boolean).join('\n'));
  } else if (extra['BossBar.InventoryRowsVersion'] !== '2') {
    if (!values['BossBar.MigratedFrom']) {
      const { unparsed, overflow } = parseInventory([raw.item1, raw.item2].filter(Boolean).join('\n'));
      const remaining = [...overflow];
      for (const line of unparsed) {
        const rows = Array.from({ length: 100 }, (_, offset) => itemKeys(offset + 1));
        if (rows.some(([name]) => values[name]?.trim() === line.trim())) continue;
        const empty = rows.find(([name]) => !values[name]?.trim());
        if (!empty) { remaining.push(line); continue; }
        values[empty[0]] = line.trim(); values[empty[1]] = '1'; values[empty[2]] = '';
      }
      if (remaining.length) values['BossBar.Import.InventarioRevisar'] = `Linhas além do limite de 100 itens, preservadas no PDF: ${remaining.join('; ')}`;
      else delete values['BossBar.Import.InventarioRevisar'];
    }
    values['BossBar.InventoryRowsVersion'] = '2';
  }
  for (const skill of NIMB_SKILLS) {
    values[skill.code] = raw[skill.index === 22 ? 'tota23' : `total${skill.index + 1}`] ?? '';
    values[skill.trained] = raw[`treinado${skill.index + 1}`] ?? 'Off';
    values[skill.selector] = attributeLabels[raw[`modSelect${skill.index}`]] ?? raw[`modSelect${skill.index}`] ?? '';
    values[skill.modifier] = raw[nativeAttribute(values[skill.selector])] ?? '';
    if (`BossBar.Migration.Attribute.${skill.code}` in extra) {
      values[skill.modifier] = extra[`BossBar.Migration.Attribute.${skill.code}`];
      values[skill.selector] = 'Revisar';
    }
    values[skill.half] = raw.metadeDoNivel ?? '';
    values[skill.training] = raw[`treino${skill.index}`] ?? '';
    const adjustment = ['010', '110', '180'].includes(skill.code) ? penalty : 0;
    const size = skill.code === '110' ? number(raw.tFurtividade) : 0;
    // Nimb's Outros already includes armor/size. Separate those terms once.
    values[skill.other] = String(number(raw[`outros${skill.index + 1}`]) + adjustment - size - number(extra[`BossBar.Pericias.BonusExportado.${skill.code}`]));
  }
  const upgraded = upgradeSheetLoadout(mergeSpellNotes(values));
  upgraded['B.Arm'] = String(equipmentDefenseTotal(upgraded, 'Armadura'));
  upgraded['B.Esc'] = String(equipmentDefenseTotal(upgraded, 'Escudo'));
  upgraded['BossBar.PenalidadeArmadura'] = String(armorPenaltyTotal(upgraded));
  return upgraded;
};

export const nimbSheetValues = (values: SheetValues): SheetValues => {
  const raw: SheetValues = {};
  const mapped = new Set(Object.keys(NIMB_FIELD_ALIASES));
  for (const [canonical, native] of Object.entries(NIMB_FIELD_ALIASES)) raw[native] = values[canonical] ?? '';
  if (values['BossBar.TextCatalogVersion'] === '1') {
    raw['Habilidades de Raça e Origem'] = [values['BossBar.Habilidades.Raca'], values['BossBar.Habilidades.Origem']].filter(Boolean).join('\n');
    raw['Habilidades de classe e poderes'] = [values['BossBar.Habilidades.Classe'], values['BossBar.Habilidades.Gerais']].filter(Boolean).join('\n');
    raw.Historico = [raw['Habilidades de Raça e Origem'], raw['Habilidades de classe e poderes'], values['BossBar.Habilidades.Revisar']].filter(Boolean).join('\n');
    if (raw.Historico.length > SHEET_TEXT_LIMIT) throw new Error('O texto completo das habilidades excede 100.000 caracteres. Reduza as anotações antes de salvar; nenhum texto foi descartado.');
  }
  for (let index = 1; index <= 5; index++) {
    if (values[`Ataque ${index}`]?.trim() || values[`Dano ${index}`]?.trim()) raw[`tAtak${index}`] = combinedAttackBonus(attackSkillTotal(values, index), values[`BossBar.Ataque.${index}.Ajuste`] || '0');
    const compactTypes: Record<string, string> = { Perfuração: 'Perf.', Impacto: 'Impac.', Corte: 'Corte' };
    raw[`tipo${index}`] = compactTypes[raw[`tipo${index}`]] ?? raw[`tipo${index}`];
    raw[`alcance${index}`] = ({ Adjacente: '-', 'Curto (9m)': 'Curto', 'Médio (30m)': 'Médio', 'Longo (90m)': 'Longo' } as Record<string, string>)[raw[`alcance${index}`]] ?? raw[`alcance${index}`];
    raw[`critico${index}`] = raw[`critico${index}`].replace(/^20\/x(\d+)$/, 'x$1').replace(/^(\d+)\/x2$/, '$1');
    if (values[`BossBar.Ataque.${index}.SemDano`] === 'Yes' && number(values[`Dano ${index}`]) === 0) {
      raw[`dano${index}`] = '-'; raw[`critico${index}`] = '-'; raw[`tipo${index}`] = '-';
    } else if (values[`BossBar.Ataque.${index}.DuasArmas`] === 'Yes' && values[`BossBar.Ataque.${index}.Segunda.Dano`]?.trim()) {
      raw[`dano${index}`] = `${values[`Dano ${index}`]}/${values[`BossBar.Ataque.${index}.Segunda.Dano`]}`;
    }
  }
  // The editable defense bonuses and the displayed equipment share Nimb fields.
  raw.defesa1 = values['B.Arm'] ?? values['B.Arm1'] ?? '';
  raw.defesa2 = values['B.Esc'] ?? values['B.Esc2'] ?? '';
  const defense = sheetDefenseBreakdown(values);
  const limit = selectedArmorLimit(values);
  const attribute = limit.trim() ? Math.min(number(values.ModAtribDefe), number(limit)) : number(values.ModAtribDefe);
  const naturalBonus = defense.total - 10 - attribute - number(raw.defesa1) - number(raw.defesa2) - number(values['Outros B.CA']);
  raw.defesaOutros = String(number(values['Outros B.CA']) + naturalBonus);
  for (const [kind, nativeName, nativePenalty] of [['Armadura', 'armadura1', 'penalidade1'], ['Escudo', 'armadura2', 'penalidade2']] as const) {
    const index = equippedRows(values, kind)[0];
    const keys = index ? equipmentKeys(kind, index) : null;
    raw[nativeName] = keys ? values[keys.name] || '' : '';
    raw[nativePenalty] = keys ? values[keys.penalty] || '0' : '0';
  }
  const penalty = Math.abs(number(values['BossBar.PenalidadeArmadura'] || String(Math.abs(number(values.Pa)) + Math.abs(number(values.Pe)))));
  raw.penalidadeDeArmadura = String(penalty);
  const armorLimit = selectedArmorLimit(values);
  raw.checkPesada = armorLimit.trim() ? 'Yes' : 'Off';
  raw.attLimit = armorLimit || '0';
  raw.modDef = nativeAttribute(values.SeleAtribDefe || 'DES');
  raw.modSelectMagia = nativeAttribute(values.SeleAtribMagia || 'SAB');
  raw.modificadorMagia = values.ModAtribMagia ?? '';
  raw.metadeDoNivel = values['011'] ?? '';
  const calculatedSkills=calculateCharacterSkills(values);const skillExportBonuses:SheetValues={};
  for (const name of ['For', 'Des', 'Con', 'Int', 'Sab', 'Car', 'Base CA', 'arm pesa', 'SeleAtribDefe', 'ModAtribDefe', 'SeleAtribMagia', 'ModAtribMagia', 'BossBar.Source']) mapped.add(name);
  for (const skill of NIMB_SKILLS) {
    raw[skill.index === 22 ? 'tota23' : `total${skill.index + 1}`] = values[skill.code] ?? '';
    raw[`treinado${skill.index + 1}`] = values[skill.trained] ?? 'Off';
    raw[`modSelect${skill.index}`] = nativeAttribute(values[skill.selector] || 'INT');
    raw[`treino${skill.index}`] = values[skill.training] ?? '';
    const adjustment = ['010', '110', '180'].includes(skill.code) ? penalty : 0;
    const size = skill.code === '110' ? number(values.ModFurtTam) : 0;
    const calculated=calculatedSkills.get(skill.code);
    const bonus=calculated&&Number.isFinite(calculated.total)?calculated.total-calculated.attributeValue-calculated.halfLevel-calculated.training-number(values[skill.other])-size+adjustment:0;
    raw[`outros${skill.index + 1}`] = String(number(values[skill.other]) - adjustment + size + bonus);
    skillExportBonuses[`BossBar.Pericias.BonusExportado.${skill.code}`]=String(bonus);
    for (const name of [skill.code, skill.trained, skill.selector, skill.modifier, skill.half, skill.training, skill.other]) mapped.add(name);
  }
  const stored = Object.fromEntries(Object.entries(values).filter(([name]) => !mapped.has(name)));
  for (const name of ['B.Arm1', 'B.Esc2', 'Armadura', 'Escudo', 'Pa', 'Pe']) stored[name] = values[name] ?? '';
  stored['BossBar.Defesa.BonusExportado'] = String(naturalBonus);
  Object.assign(stored,skillExportBonuses);
  raw[SHEET_EXTRA_FIELD] = JSON.stringify(stored);
  return raw;
};
