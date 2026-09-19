import data from './data/t20-attribute-sources.json' with { type: 'json' };
import { catalogKey, T20_CATALOG } from './rules-catalog.ts';
import type { AttributeCode } from './character-attributes.ts';

export type AttributeSource = { id: string; name: string; sourceId: string; page: number; kind: string;
  duration: 'permanent' | 'temporary'; attribute?: AttributeCode; amount?: number; allowedAmounts?: number[]; allowedAttributes?: AttributeCode[]; note: string; tierLimited?: boolean; unique?: boolean };
export const ATTRIBUTE_SOURCES = data.sources as AttributeSource[];
export const attributeSourceCitation = (source: { sourceId: string; page: number }) => source.sourceId === 'custom' ? 'Regra da mesa' : `${T20_CATALOG.sources.find(({ id }) => id === source.sourceId)?.name ?? source.sourceId}, p. ${source.page}`;
export type AttributeChoice = { id: string; label: string; count: number; amount: number; allowed: AttributeCode[]; selected: AttributeCode[]; source: string; distinct: boolean };
export type InferredAttributeSources = { fixed: Record<string, number>; labels: string[]; choices: AttributeChoice[]; unresolved: string[] };
const CODES: AttributeCode[] = ['For', 'Des', 'Con', 'Int', 'Sab', 'Car'];

/** Only definite granted bonuses are inferred. Merely knowing a spell or owning
 * an item is not evidence that its conditional effect is currently active. */
export const inferAttributeSources = (values: Record<string, string>): InferredAttributeSources => {
  const result: InferredAttributeSources = { fixed: {}, labels: [], choices: [], unresolved: [] };
  const add = (label: string, bonuses: Record<string, number>, source: string) => {
    for (const [code, value] of Object.entries(bonuses)) result.fixed[code] = (result.fixed[code] || 0) + value;
    result.labels.push(`${label}: ${Object.entries(bonuses).map(([code, value]) => `${code} ${value >= 0 ? '+' : ''}${value}`).join(', ')} · ${source}`);
  };
  const choice = (id: string, label: string, count: number, source: string, allowed = CODES, distinct = true, amount = 1) =>
    result.choices.push({ id, label, count, amount, allowed, selected: [], source, distinct });
  const racialText = catalogKey(values['BossBar.Habilidades.Raca'] || '');
  const allPowers = Object.entries(values).filter(([name]) => /^BossBar\.Habilidades\./.test(name) || /habilidades e poderes/i.test(name)).map(([, value]) => value).join('\n');
  let raceName = values['RAÇA'] || values.Raca || '';
  const originalRaceName = raceName;
  if (catalogKey(raceName) === 'humana') raceName = 'Humano';
  if (/^(sereia|tritao)$/i.test(catalogKey(raceName))) raceName = 'Sereia/Tritão';
  if (catalogKey(raceName).startsWith('suraggel')) {
    const variant = /aggelus|luzsagrada/.test(`${catalogKey(raceName)} ${racialText}`) ? 'Aggelus' : /sulfure|sombras?profanas?/.test(`${catalogKey(raceName)} ${racialText}`) ? 'Sulfure' : '';
    if (variant) raceName = variant;
    else result.unresolved.push('Suraggel: confirme se é aggelus (Sab +2, Car +1) ou sulfure (Des +2, Int +1). Informe a variante no campo Raça.');
  }
  if (catalogKey(raceName) === 'moreau') {
    const heritage = data.races.find(({ name }) => name.startsWith('Moreau — ') && racialText.includes(catalogKey(name.split(' — ')[1])));
    if (heritage) raceName = heritage.name;
    else result.unresolved.push('Moreau: escolha a herança no campo Raça para identificar seu bônus fixo.');
  }
  const racial = data.races.find(({ name }) => catalogKey(name) === catalogKey(raceName));
  if (racial) {
    const reference = attributeSourceCitation(racial);
    add(racial.name, racial.fixed as Record<string, number>, reference);
    if (racial.choices) choice('race:choices', `${racial.name}: atributos escolhidos`, racial.choices, reference, racial.allowed as AttributeCode[]);
    if (raceName.startsWith('Golem — ') || raceName === 'Mashin') {
      const size = catalogKey(values.SeleTamanho || '');
      if (size === 'pequeno') add('Tamanho do golem', { Des: 1 }, 'Ameaças de Arton, p. 135');
      else if (size === 'grande') add('Tamanho do golem', { Des: -1 }, 'Ameaças de Arton, p. 135');
    }
  } else if (catalogKey(raceName) === 'kallyanach') choice('race:choices', 'Kallyanach: +2 em um atributo ou +1 em dois', 2, 'Ameaças de Arton, p. 151', CODES, false);
  else if (catalogKey(raceName) === 'nagah') {
    if (/macho/.test(racialText)) add('Nagah macho', { For: 1, Des: 1, Con: 1 }, 'Ameaças de Arton, p. 333');
    else if (/femea/.test(racialText)) add('Nagah fêmea', { Int: 1, Sab: 1, Car: 1 }, 'Ameaças de Arton, p. 333');
    else result.unresolved.push('Nagah: informe macho ou fêmea nas habilidades de raça para identificar os atributos raciais.');
  } else if (catalogKey(raceName) === 'duende') {
    choice('race:gifts', 'Duende: dons', 2, 'Heróis de Arton, p. 9');
    if (/naturezaanimal|animal.*feitodecarne/.test(racialText)) choice('race:nature', 'Duende: natureza animal', 1, 'Heróis de Arton, p. 9');
    else if (!/naturezavegetal|naturezamineral|florescerfeerico|feitodematerialinorganico/.test(racialText)) result.unresolved.push('Duende: confirme a natureza animal, vegetal ou mineral nas habilidades de raça.');
    const size = catalogKey(values.SeleTamanho || '');
    if (size === 'minusculo') add('Tamanho do duende', { For: -1 }, 'Heróis de Arton, p. 9');
    if (size === 'grande') add('Tamanho do duende', { Des: -1 }, 'Heróis de Arton, p. 9');
  } else if (raceName && !result.unresolved.length) result.unresolved.push(`Não foi possível identificar os modificadores de ${raceName}. Registre os bônus conhecidos pela opção Registrar aumento; os totais importados serão preservados.`);
  const origin = catalogKey(values.ORIGEM || values.Origem || '');
  if (origin === 'criadafavela') add('Cria da Favela', { Con: 1 }, 'Atlas de Arton, p. 472');
  if (origin === 'aspiranteaheroi') choice('origin:aspirant', 'Aspirante a Herói', 1, 'Atlas de Arton, p. 471');
  if (/herancadealgazara|algazara/.test(racialText + ' ' + catalogKey(originalRaceName))) choice('race:algazara', 'Herança de Al-Gazara: resultado aleatório registrado', 1, 'Deuses de Arton, p. 36');
  // Only headings identify owned powers. Prerequisite/body mentions do not.
  const headings = allPowers.split(/\r?\n/).map((line) => catalogKey(line.replace(/^\s*[-•]\s*/, '').split(':')[0]));
  const hasPower = (name: string) => headings.some((heading) => heading === catalogKey(name) || heading.startsWith(catalogKey(name) + 'ja'));
  if (hasPower('Apoteose Celestial')) add('Apoteose Celestial', { Sab: 1, Con: -1 }, 'Heróis de Arton, p. 54');
  if (hasPower('Saúde Perfeita')) add('Saúde Perfeita', { Con: 1 }, 'Heróis de Arton, p. 183');
  if (hasPower('Rainha Amazona')) add('Rainha Amazona', { Car: 1 }, 'Heróis de Arton, p. 114');
  if (headings.some((h) => h.includes('herancasuperior') && h.includes('feerica'))) add('Herança Superior — Linhagem Feérica', { Car: 2 }, 'Livro Básico, p. 39');
  if (headings.some((h) => h.includes('herancasuperior') && h.includes('abencoada'))) add('Herança Superior — Linhagem Abençoada', { Sab: 1 }, 'Deuses de Arton, p. 33');
  if (headings.some((h) => h.includes('autoridadeeclesiastica') && h.includes('marah'))) add('Autoridade Eclesiástica — Marah', { Car: 1 }, 'Deuses de Arton, p. 23');
  const vassalLevel = Number((values.CLASSE || '').match(/Vassalo\s+(\d+)/i)?.[1] || 0);
  const governor = hasPower('Caminho do Governante') || headings.some((h) => h.includes('caminho') && h.includes('governante'));
  const soldier = hasPower('Caminho do Soldado') || headings.some((h) => h.includes('caminho') && h.includes('soldado'));
  if (vassalLevel >= 11 && governor) add('Visconde — Caminho do Governante', { Int: 1 }, 'Heróis de Arton, p. 42');
  if (vassalLevel >= 11 && !governor && !soldier) result.unresolved.push('Vassalo: informe Caminho do Soldado ou Caminho do Governante nas habilidades de classe para identificar os aumentos.');
  if (vassalLevel >= 17 && (governor || soldier)) choice('class:vassal:17', 'Rei Mercenário: pontos do caminho', 3, 'Heróis de Arton, p. 43', governor ? CODES.slice(3) : CODES.slice(0, 3), false);
  if (vassalLevel >= 18) add('Rei', { Car: 1 }, 'Heróis de Arton, p. 43');
  if (vassalLevel >= 20) choice('class:vassal:20', 'Imperador: atributos escolhidos', 2, 'Heróis de Arton, p. 43');
  // The imported description often omits the selected attribute and acquisition
  // level. Do not guess those from the highest score or apply the power twice.
  for (const [index, match] of [...allPowers.matchAll(/(?:^|\n)\s*[-•]?\s*Aumento de Atributo([^\n]*)/gi)].entries()) {
    const explicit = CODES.find((code, i) => new RegExp(`\\b(?:${code}|${['Força','Destreza','Constituição','Inteligência','Sabedoria','Carisma'][i]})\\b`, 'i').test(match[1].split(':')[0]));
    if (explicit) add(`Aumento de Atributo (${explicit})`, { [explicit]: 1 }, 'Livro Básico, p. 38; aquisição importada');
    else choice(`power:increase:${index}`, 'Aumento de Atributo importado: confirme o atributo', 1, 'Livro Básico, p. 38');
  }
  return result;
};
