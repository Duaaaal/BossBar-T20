import { catalogKey } from './rules-catalog.ts';
import { parseCharacterClasses, characterClassErrors } from './character-classes.ts';

type Values = Record<string, string>;
export const RESOURCE_AUTO_FIELD = 'BossBar.Recursos.Automaticos';
// Initial PV, subsequent PV, PM per level, printed page. No generic Int bonus for Inventor.
const PROGRESSION: Record<string, [number, number, number, number]> = {
  arcanista: [8, 2, 6, 37], barbaro: [24, 6, 3, 41], bardo: [12, 3, 4, 44], bucaneiro: [16, 4, 3, 47],
  cacador: [16, 4, 4, 50], cavaleiro: [20, 5, 3, 53], clerigo: [16, 4, 5, 57], druida: [16, 4, 4, 61],
  guerreiro: [20, 5, 3, 65], inventor: [12, 3, 4, 68], ladino: [12, 3, 4, 73], lutador: [20, 5, 3, 76], nobre: [16, 4, 4, 79], paladino: [20, 5, 3, 82],
  treinador: [12, 3, 4, 16], frade: [12, 3, 6, 39],
  alquimista: [12, 3, 4, 22], atleta: [20, 5, 3, 24], burgues: [12, 3, 4, 25], duelista: [16, 4, 3, 27],
  ermitao: [12, 3, 4, 29], inovador: [20, 5, 3, 31], machadodepedra: [24, 6, 3, 32], magimarcialista: [16, 4, 4, 34],
  necromante: [8, 2, 6, 35], santo: [20, 5, 4, 37], seteiro: [16, 4, 4, 39], usurpador: [16, 4, 5, 40], vassalo: [20, 5, 3, 41], ventanista: [12, 3, 4, 44],
};
const HEROES_CLASSES = new Set(['treinador', 'alquimista', 'atleta', 'burgues', 'duelista', 'ermitao', 'inovador', 'machadodepedra', 'magimarcialista', 'necromante', 'santo', 'seteiro', 'usurpador', 'vassalo', 'ventanista']);
const numeric = (text?: string) => text?.trim() && /^[+-]?\d+$/.test(text.trim()) ? Number(text) : null;
export const characterResources = (values: Values) => {
  const level = numeric(values.Lv); const con = numeric(values.ModCon);
  const classes = parseCharacterClasses(values.CLASSE || '', level || 1);
  if (!classes.length || !level || level > 20 || characterClassErrors(classes).length || classes.reduce((sum, entry) => sum + entry.level, 0) !== level || classes.some(({ name }) => !PROGRESSION[catalogKey(name)])) return null;
  let health = 0; let mana = 0; const healthSources: string[] = []; const manaSources: string[] = []; const unresolved: string[] = [];
  const manaAttributes = new Map<string, string>();
  const healthCalculation: string[] = []; const manaCalculation: string[] = [];
  const healthBonuses: string[] = []; const manaBonuses: string[] = [];
  const headings = Object.entries(values).filter(([key]) => /^BossBar\.Habilidades\./.test(key)).flatMap(([, text]) => text.split(/(?:^|\r?\n)\s*[-•]\s+/)).map((text) => catalogKey(text.trim().split(/[:\r\n]/)[0]).replace(/jaincluso.*$/, ''));
  const owns = (name: string) => headings.includes(catalogKey(name));
  for (const [index, entry] of classes.entries()) {
    const key = catalogKey(entry.name); const [initial, per, pm, page] = PROGRESSION[key]; const first = index === 0 ? 1 : 0;
    const book = HEROES_CLASSES.has(key) ? 'Heróis de Arton' : key === 'frade' ? 'Deuses de Arton' : 'Livro Básico';
    if (con !== null) {
      const amount = first * Math.max(1, initial + con) + (entry.level - first) * Math.max(1, per + con);
      if (first) healthCalculation.push(initial + con < 1
        ? `máx(1, ${initial} (${entry.name}: inicial) + ${con} (CON))`
        : `${initial} (${entry.name}: inicial) + ${con} (CON)`);
      if (entry.level > first) healthCalculation.push(`${entry.level - first} × ${per + con < 1 ? 'máx(1, ' : '['}${per} (${entry.name}: por nível) + ${con} (CON)${per + con < 1 ? ')' : ']'}`);
      health += amount; healthSources.push(`${entry.name} ${entry.level}: ${first ? `${initial} + ${con} (1º nível); ` : ''}${entry.level - first} × máx(1, ${per} + ${con}) = ${amount} PV. ${book}, p. ${page}.`);
    }
    manaCalculation.push(`${entry.level} (níveis de ${entry.name}) × ${pm} (PM por nível)`);
    mana += entry.level * pm; manaSources.push(`${entry.name} ${entry.level}: ${entry.level} × ${pm} = ${entry.level * pm} PM. ${book}, p. ${page}.`);
    if (['clerigo', 'druida', 'frade', 'ermitao'].includes(key)) manaAttributes.set('Sab', 'Magias');
    if (['bardo', 'paladino', 'magimarcialista', 'santo', 'usurpador'].includes(key)) manaAttributes.set('Car', ['paladino', 'santo'].includes(key) ? 'Abençoado' : key === 'usurpador' ? 'Magias do Usurpador (Heróis de Arton, p. 41)' : 'Magias');
    if (key === 'arcanista' || key === 'necromante') {
      const explicit = (values.SeleAtribMagia || '').replace(/^mod/i, '').toLowerCase();
      const path = key === 'necromante' ? 'Int' : owns('Feiticeiro') || headings.some((name) => /^caminhodoarcanista.*feiticeiro/.test(name)) ? 'Car'
        : owns('Mago') || owns('Bruxo') || headings.some((name) => /^caminhodoarcanista.*(mago|bruxo)/.test(name)) ? 'Int'
          : ['int', 'car'].includes(explicit) ? explicit === 'int' ? 'Int' : 'Car' : null;
      if (path) manaAttributes.set(path, key === 'necromante' ? 'Magias do Necromante' : 'Caminho do Arcanista');
      else unresolved.push('Confirme o atributo-chave do Arcanista em Magias: Inteligência para Mago/Bruxo ou Carisma para Feiticeiro.');
      if (owns('Poder Mágico')) { mana += entry.level; manaBonuses.push(`${entry.level} (Poder Mágico)`); manaSources.push(`Poder Mágico: +${entry.level} PM. Livro Básico, p. 38.`); }
    }
  }
  for (const [code, source] of manaAttributes) {
    const amount = numeric(values['Mod' + code]);
    if (amount === null) unresolved.push(`Confirme ${code} para calcular os PM de ${source}.`);
    else { mana += amount; manaBonuses.push(`${amount} (${code.toUpperCase()}: ${source})`); manaSources.push(`${source}: ${code} ${amount >= 0 ? '+' : ''}${amount} PM (uma vez por atributo).`); }
  }
  const race = catalogKey(values['RAÇA'] || '');
  if (race === 'anao' || owns('Duro como Pedra')) { health += level + 2; healthBonuses.push(`[3 + ${level - 1}] (Duro como Pedra)`); healthSources.push(`Duro como Pedra: 3 + ${level - 1} = ${level + 2} PV. Livro Básico, p. 20.`); }
  if (race === 'elfo' || owns('Sangue Mágico')) { mana += level; manaBonuses.push(`${level} (Sangue Mágico)`); manaSources.push(`Sangue Mágico: +${level} PM. Livro Básico, p. 22.`); }
  if (owns('Vitalidade')) { health += level; healthBonuses.push(`${level} (Vitalidade)`); healthSources.push(`Vitalidade: +${level} PV. Livro Básico, p. 129.`); }
  if (owns('Vontade de Ferro')) { mana += Math.floor(level / 2); manaBonuses.push(`${Math.floor(level / 2)} (Vontade de Ferro)`); manaSources.push(`Vontade de Ferro: +${Math.floor(level / 2)} PM. Livro Básico, p. 131.`); }
  if (classes.length > 1) healthSources.push('Multiclasse: apenas a primeira classe concede PV iniciais. Livro Básico, p. 35.');
  if (manaAttributes.size) manaSources.push('O mesmo atributo não se soma duas vezes. Livro Básico, p. 226.');
  if (mana < 0) { const terms = [...manaCalculation, ...manaBonuses]; manaCalculation.splice(0, manaCalculation.length, `máx(0, ${terms.join(' + ')})`); manaBonuses.length = 0; }
  return { health: con === null ? null : Math.max(1, health), mana: unresolved.length ? null : Math.max(0, mana), knownMana: Math.max(0, mana), healthSources, manaSources, unresolved, healthCalculation: [...healthCalculation, ...healthBonuses], manaCalculation: [...manaCalculation, ...manaBonuses] };
};

type AutomaticResources = { version: 1; health: boolean; mana: boolean; previousHealth: string; previousMana: string };
const parseAutomatic = (value?: string): AutomaticResources | null => {
  try { const state = JSON.parse(value || 'null'); return state?.version === 1 && typeof state.health === 'boolean' && typeof state.mana === 'boolean' ? state : null; } catch { return null; }
};
export const initializeAutomaticResources = (values: Values) => {
  values[RESOURCE_AUTO_FIELD] = JSON.stringify({ version: 1, health: true, mana: true, previousHealth: values['PVs Totais'], previousMana: values['PMs Totais'] });
};
/** Existing/manual maxima are never silently replaced. Only new sheets opt into progression. */
export const recalculateCharacterResources = (values: Values) => {
  const state = parseAutomatic(values[RESOURCE_AUTO_FIELD]); if (!state) return values;
  const expected = characterResources(values);
  for (const [kind, maximum, current, previous] of [['health', 'PVs Totais', 'PVs Atuais', 'previousHealth'], ['mana', 'PMs Totais', 'PMs Atuais', 'previousMana']] as const) {
    if (values[maximum] !== state[previous]) state[kind] = false;
    // A pending Arcanista path does not erase the PM already granted by class levels.
    const next = kind === 'mana' ? expected?.knownMana : expected?.health; if (!state[kind] || next === null || next === undefined) continue;
    const old = values[maximum]; values[maximum] = String(next); state[previous] = String(next);
    if (values[current] === old) values[current] = String(next);
    else if (Number(values[current]) > next) values[current] = String(next);
  }
  values[RESOURCE_AUTO_FIELD] = JSON.stringify(state); return values;
};
