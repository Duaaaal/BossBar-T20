import { catalogKey, T20_CATALOG } from './rules-catalog.ts';
import { parseCharacterClasses } from './character-classes.ts';
import { equipmentKeys, equippedRows, inferredArmorAttributeLimit } from './character-sheet-loadout.ts';

type Values = Record<string, string>;
export type DefenseSource = { name: string; amount: number; source: string; detail: string; attribute?: string };
const number = (value?: string) => Number((value || '0').replace(',', '.'));
export const DEFENSE_SOURCES_VERSION = 'BossBar.Defesa.FontesVersao';

/** Passive effects only. Knowing a spell, posture or power that spends PM does
 * not establish that its effect is active. Equipment conditions are observable. */
export const passiveDefenseSources = (values: Values): DefenseSource[] => {
  const headings = Object.entries(values).filter(([key]) => /^BossBar\.Habilidades\./.test(key)).flatMap(([, text]) => text.split(/(?:^|\r?\n)\s*[-•]\s+/)).map((entry) => catalogKey(entry.trim().split(/[:\r\n]/)[0]).replace(/jaincluso.*$/, ''));
  const owns = (name: string) => headings.includes(catalogKey(name));
  const classes = parseCharacterClasses(values.CLASSE || '', number(values.Lv) || 1);
  const level = (name: string) => classes.find((entry) => catalogKey(entry.name) === catalogKey(name))?.level || 0;
  const race = catalogKey(values['RAÇA'] || '');
  const origin = catalogKey(values.ORIGEM || '');
  const armorIndex = equippedRows(values, 'Armadura').find((index) => values[equipmentKeys('Armadura', index).name]?.trim());
  const armorName = armorIndex ? values[equipmentKeys('Armadura', armorIndex).name] : '';
  const armor = Boolean(armorName);
  const inferred = inferredArmorAttributeLimit(armorName);
  const heavy = armor && (inferred !== null ? inferred !== '' : Boolean(values[equipmentKeys('Armadura', armorIndex!).limit]?.trim()));
  const shield = equippedRows(values, 'Escudo').some((index) => values[equipmentKeys('Escudo', index).name]?.trim());
  const rows: DefenseSource[] = [];
  const add = (name: string, amount: number, page: number, detail = '', book = 'Livro Básico', attribute?: string) => rows.push({ name, amount, source: `${book}, p. ${page}`, detail, ...(attribute ? { attribute } : {}) });
  if (race === 'minotauro' || owns('Couro Rígido')) add('Couro Rígido', 1, 25);
  if (race === 'trog' || owns('Reptiliano')) add('Reptiliano', 1, 31);
  if (race === 'golem' || race === 'golemferro' || owns('Chassi') && !race.startsWith('golem')) add('Chassi de ferro', 2, race === 'golem' ? 27 : 134, '', race === 'golem' ? 'Livro Básico' : 'Ameaças de Arton');
  if (race === 'nagah' || owns('Presentes de Sszzaas')) add('Presentes de Sszzaas', 1, 333, '', 'Ameaças de Arton');
  for (const [name, page] of [['Criado pelas Voracis', 472], ['Escudeiro da Luz', 474]] as const) if (origin === catalogKey(name) || owns(name)) add(name, 2, page, 'Benefício de origem.', 'Atlas de Arton');
  if (owns('Herança de Kundali')) add('Herança de Kundali', 2, 36, 'Herança registrada na ficha.', 'Deuses de Arton');
  for (const [raceName, name, amount, page] of [['ceratops', 'Paquidérmico', 1, 265], ['yidishan', 'Peças Metálicas', 2, 300], ['moreaucrocodilo', 'Predador Aquático', 1, 304]] as const) if (race === raceName || owns(name)) add(name, amount, page, '', 'Ameaças de Arton');
  for (const [name, amount, page, book] of [['Esquiva', 2, 125, 'Livro Básico'], ['Escamas Dracônicas', 2, 133, 'Livro Básico'], ['Herói do Povo', 2, 61, 'Heróis de Arton']] as const) if (owns(name)) add(name, amount, page, '', book);
  if (!heavy && owns('Pele de Ferro')) add('Pele de Ferro', owns('Pele de Aço') ? 8 : 4, 42, 'Sem armadura pesada; Pele de Aço substitui o bônus por +8.');
  if (!heavy && owns('Armadura das Amazonas')) add('Armadura das Amazonas', 2, 114, 'Sem armadura pesada.', 'Heróis de Arton');
  if (armor && owns('Escudeiro')) add('Escudeiro', 1, 54, 'Bônus da manutenção da armadura.');
  if (shield && owns('Estilo de Arma e Escudo')) add('Estilo de Arma e Escudo', 2, 125, 'Escudo equipado.');
  if (heavy && owns('Encouraçado')) {
    const related = new Set(T20_CATALOG.abilities.filter((entry) => /Pré-requisitos?:[^]*Encouraçado/i.test(entry.description) && owns(entry.name)).map((entry) => catalogKey(entry.name)));
    // Supplement powers with this prerequisite are not all in the textual index.
    for (const name of ['Inexpugnável', 'Fanático', 'Bastião', 'Encastelado']) if (owns(name)) related.add(catalogKey(name));
    add('Encouraçado', 2 + 2 * related.size, 125, `Armadura pesada; ${related.size} outro(s) poder(es) com esse pré-requisito.`);
  }
  if (owns('Carapaça')) {
    const tormenta = new Set(['Anatomia Insana', 'Antenas', 'Armamento Aberrante', 'Articulações Flexíveis', 'Asas Insetoides', 'Corpo Aberrante', 'Cuspir Enxame', 'Dentes Afiados', 'Desprezar a Realidade', 'Empunhadura Rubra', 'Fome de Mana', 'Larva Explosiva', 'Legião Aberrante', 'Mãos Membranosas', 'Membros Estendidos', 'Membros Extras', 'Mente Aberrante', 'Olhos Vermelhos', 'Pele Corrompida', 'Sangue Ácido', 'Visco Rubro', 'Bolsões Insanos', 'Carapaça Corrompida', 'Repulsivo', 'Secreção Cicatrizante', 'Simetria Radial', 'Tempo Místico'].filter(owns).map(catalogKey));
    add('Carapaça', 1 + Math.floor(tormenta.size / 2), 136, `${tormenta.size} outro(s) poder(es) da Tormenta identificado(s).`);
  }
  const attribute = (name: string, code: string, cap: number, page: number, detail: string, book = 'Livro Básico') => add(name, Math.min(number(values['Mod' + code]), cap), page, detail, book, code.toUpperCase());
  if (heavy && values.SeleAtribDefe === 'INT' && owns('Blindagem')) attribute('Blindagem', 'Int', Infinity, 69, 'Permite Inteligência na Defesa com armadura pesada.');
  if (heavy && values.SeleAtribDefe === 'CAR' && owns('Armadura Brilhante')) attribute('Armadura Brilhante', 'Car', Infinity, 79, 'Permite Carisma na Defesa com armadura pesada.');
  if (heavy && values.SeleAtribDefe === 'CON' && owns('Duro Como Aço')) attribute('Duro Como Aço', 'Con', Infinity, 87, 'Substitui Destreza por Constituição com armadura pesada.', 'Heróis de Arton');
  const bucaneer = level('Bucaneiro');
  if (!heavy && bucaneer) {
    attribute('Insolência', 'Car', bucaneer, 47, `Limitado ao nível ${bucaneer} de Bucaneiro; exige liberdade de movimentos.`);
    if (bucaneer >= 3) add('Esquiva Sagaz', 1 + Math.floor((bucaneer - 3) / 4), 48, `Nível ${bucaneer} de Bucaneiro; exige liberdade de movimentos.`);
  }
  const fighter = level('Lutador');
  if (!armor && owns('Braços Calejados')) attribute('Braços Calejados', 'For', fighter || number(values.Lv), 76, 'Sem armadura; limitado ao nível de Lutador.');
  if (!heavy && fighter >= 3) attribute('Casca Grossa', 'Con', fighter, 77, `Limitado ao nível ${fighter} de Lutador; sem armadura pesada.`);
  if (fighter >= 7) add('Casca Grossa · progressão', 1 + Math.floor((fighter - 7) / 4), 77, `Nível ${fighter} de Lutador.`);
  if (!heavy && (race === 'kappa' || owns('Carapaça Kappa'))) {
    if (fighter >= 3 || values.SeleAtribDefe === 'CON' || level('Machado de Pedra') > 0 && !armor) add('Carapaça Kappa', 2, 158, 'Constituição já somada; usa o bônus alternativo.', 'Ameaças de Arton');
    else attribute('Carapaça Kappa', 'Con', number(values.Lv), 158, 'Sem armadura pesada; limitado ao nível de personagem.', 'Ameaças de Arton');
  }
  const primitive = level('Machado de Pedra');
  if (primitive) {
    if (!armor) attribute('Tanga de Peles', 'Con', Infinity, 33, 'Sem armadura.', 'Heróis de Arton');
    if (primitive >= 3) add('Tanga de Peles · progressão', 1 + Math.floor((primitive - 3) / 4), 33, `Nível ${primitive} de Machado de Pedra.`, 'Heróis de Arton');
  }
  if (owns('Defesa Estratégica')) attribute('Defesa Estratégica', 'Int', level('Guerreiro') || number(values.Lv), 68, 'Limitado ao nível da classe.', 'Heróis de Arton');
  for (const [name, page] of [['Sentidos do Tigre', 132], ['Cavaleiro Rústico', 168]] as const) if (!heavy && owns(name)) attribute(name, 'Sab', Infinity, page, 'Exige liberdade de movimentos.', 'Heróis de Arton');
  if (level('Vassalo') >= 13 && owns('Caminho do Soldado')) add('Marquês · Caminho do Soldado', 2, 43, '13º nível de Vassalo.', 'Heróis de Arton');
  return rows;
};

/** Migrate previously aggregated Others once, preserving their residual. */
export const upgradeDefenseSources = (values: Values) => {
  if (values[DEFENSE_SOURCES_VERSION] === '1') return;
  const sources = passiveDefenseSources(values);
  const selected = values.SeleAtribDefe;
  const seen = new Set([selected]);
  const bonus = sources.reduce((sum, row) => { if (row.attribute && seen.has(row.attribute)) return sum; if (row.attribute) seen.add(row.attribute); return sum + row.amount; }, 0);
  const previous = number(values['Outros B.CA']);
  // Do not invent an offset that would cancel a newly identified bonus.
  const included = Math.min(Math.max(0, previous), Math.max(0, bonus));
  if (included) {
    values['BossBar.Defesa.OutrosAnteriores'] = values['Outros B.CA'];
    values['Outros B.CA'] = String(previous - included);
    if (values['BossBar.Import.DefesaSemOrigem']) values['BossBar.Import.DefesaSemOrigem'] = values['Outros B.CA'] === '0' ? '' : values['Outros B.CA'];
  }
  values[DEFENSE_SOURCES_VERSION] = '1';
};
