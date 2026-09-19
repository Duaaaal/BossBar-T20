import { trainingBenefitOrigins } from './training-benefits.ts';
import { baseSpellManaCost } from './character-sheet-calculations.ts';
import { T20_CATALOG, catalogKey, catalogTextKey, findAbility, findSpell, sourceCitation, spellFieldDefaults, type AbilityCategory, type CharacterAbility, type CharacterSpell } from './rules-catalog.ts';
import type { CharacterSheetIssue } from './character-sheet.ts';
import { referenceTextMatches, referenceDifference } from './reference-comparison.ts';
import skillMechanics from './data/t20-skill-mechanics.json' with { type: 'json' };

type Values = Record<string, string>;
export const ABILITY_FIELDS = [
  ['race', 'BossBar.Habilidades.Raca', 'Habilidades de raça'],
  ['origin', 'BossBar.Habilidades.Origem', 'Habilidades de origem'],
  ['class', 'BossBar.Habilidades.Classe', 'Habilidades e poderes de classe'],
  ['general', 'BossBar.Habilidades.Gerais', 'Poderes gerais'],
  ['review', 'BossBar.Habilidades.Revisar', 'Revisar classificação'],
] as const;
export const SPELL_FIELDS = ['Nome', 'Circulo', 'Escola', 'Execucao', 'Alcance', 'Area', 'Duracao', 'Resistencia', 'Custo', 'Efeito'] as const;
export const TEXT_CATALOG_VERSION_FIELD = 'BossBar.TextCatalogVersion';
export const OLD_ABILITY_FIELDS = ['BossBar.Nimb.Habilidades', 'HabRaçasOrigem', 'HabClassePoderes'];
const notesField = 'BossBar.Nimb.MagiasAdicionais';
const appendNote = (values: Values, note: string) => {
  if ((values[notesField] ?? '').includes(note)) return;
  const next = [values[notesField], note].filter(Boolean).join('\n\n');
  if (next.length > 100_000) throw new Error('Anotações para Magias: falta espaço para preservar os dados antigos. Reduza as anotações antes de migrar; a ficha original foi preservada.');
  values[notesField] = next;
};
export const splitTextEntries = (text: string) => text.trim() ? text.split(/(?:^|\r?\n)\s*[-•]\s+/).filter((part) => part.trim()).map((part) => part.trim()) : [];
const abilityNames = new Set(T20_CATALOG.abilities.flatMap((ref) => [ref.name, ...(ref.aliases ?? [])]).map(catalogKey));
for(const rule of skillMechanics.rules)if(['ability','class','race'].includes(rule.kind))abilityNames.add(catalogKey(rule.name));
export const abilityEntry = (text: string) => {
  const colon = text.indexOf(':');
  // Longest known heading supports names such as "Missa: Chamado às Armas".
  const end = [...text.slice(0, 160).matchAll(/[:.]/g)].map((match) => match.index!).reverse()
    .find((index) => abilityNames.has(catalogKey(text.slice(0, index))));
  if (end !== undefined) return { name: text.slice(0, end).trim(), description: text.slice(end + 1).trim(), text };
  return colon > 0 && colon < 160 ? { name: text.slice(0, colon).trim(), description: text.slice(colon + 1).trim(), text }
    : { name: text.length < 120 ? text : 'Texto sem identificação', description: text.length < 120 ? '' : text, text };
};
const identity = (values: Values) => ({ race: values['RAÇA'], characterClass: values.CLASSE });
export const sheetAbilities = (values: Values): CharacterAbility[] => ABILITY_FIELDS.flatMap(([category, field]) =>
  splitTextEntries(values[field] ?? '').map((text, index) => {
    const entry = abilityEntry(text); const matched = findAbility(entry.name, identity(values), category);
    const reference = matched.reference;
    const ancestry = category === 'race' ? values['RAÇA'] : category === 'origin' ? values.ORIGEM : '';
    const granted=reference?trainingBenefitOrigins(values,reference.id):[];
    const acquiredFrom = granted.length?granted.join(' · '):ancestry && reference?.owner.split('/').some((owner) => catalogKey(owner) === catalogKey(ancestry))
      ? `${category === 'race' ? 'Raça' : 'Origem'}: ${ancestry}` : undefined;
    return { id: `${field}:${index + 1}`, name: entry.name, description: entry.description, category,
      ...(acquiredFrom ? { acquiredFrom } : {}),
      ...(reference ? { referenceId: reference.id, source: sourceCitation(reference) } : {}), implementation: 'text-only' as const };
  }));
export const sheetSpells = (values: Values): CharacterSpell[] => Array.from({ length: 100 }, (_, i) => {
  const prefix = `BossBar.Magia.${i + 1}`; const name = values[`${prefix}.Nome`] ?? ''; const ref = findSpell(name);
  return { id: prefix, name, circle: /^[1-5]$/.test(values[`${prefix}.Circulo`] ?? '') ? Number(values[`${prefix}.Circulo`]) : null,
    cost: baseSpellManaCost(values[`${prefix}.Circulo`] ?? ''), school: values[`${prefix}.Escola`] ?? '', execution: values[`${prefix}.Execucao`] ?? '', range: values[`${prefix}.Alcance`] ?? '', area: values[`${prefix}.Area`] ?? '', duration: values[`${prefix}.Duracao`] ?? '', resistance: values[`${prefix}.Resistencia`] ?? '', description: values[`${prefix}.Efeito`] ?? '',
    ...(ref ? { referenceId: ref.id, source: sourceCitation(ref) } : {}), implementation: 'text-only' as const };
}).filter(({ name, description }) => name.trim() || description.trim());

const schools: Record<string, string> = { abjur: 'Abjuração', abj: 'Abjuração', adiv: 'Adivinhação', conv: 'Convocação', encan: 'Encantamento', encant: 'Encantamento', evoc: 'Evocação', ilus: 'Ilusão', necro: 'Necromancia', trans: 'Transmutação' };
const splitTuple = (text: string) => { let depth = 0; let token = ''; const parts: string[] = []; for (const char of text) { if (char === '(') depth++; if (char === ')') depth--; if (char === ',' && depth === 0) { parts.push(token.trim()); token = ''; } else token += char; } parts.push(token.trim()); return parts; };
export const parseNimbSpell = (text: string) => {
  // Editable BossBar exports use explicit labels to retain area/resistance too.
  if (/^Nome:\s*/.test(text)) {
    const labels: Record<string, string> = { Nome: 'Nome', 'Círculo': 'Circulo', Escola: 'Escola', 'Execução': 'Execucao', Alcance: 'Alcance', 'Área / Alvo': 'Area', 'Duração': 'Duracao', 'Resistência': 'Resistencia', Custo: 'Custo', 'Custo (PM)': 'Custo', Efeito: 'Efeito' };
    const result: Record<string, string> = {};
    const effect = text.indexOf(' | Efeito:');
    const metadata = effect < 0 ? text : text.slice(0, effect);
    for (const part of metadata.split(' | ')) {
      const colon = part.indexOf(':'); const key = labels[part.slice(0, colon)];
      if (key) result[key] = part.slice(colon + 1).trim();
    }
    if (effect >= 0) result.Efeito = text.slice(effect + ' | Efeito:'.length).trim();
    if (result.Nome) return result;
  }
  const match = /^(.+?)\s*\(([^]*?)\)\s*:\s*([^]*)$/.exec(text);
  if (!match) return null;
  const tuple = splitTuple(match[2]);
  if (tuple.length < 6 || !/^[1-5][º°o]?$/i.test(tuple[0]) || !/^\d+\s*PM$/i.test(tuple.at(-1)!)) return null;
  return { Nome: match[1].trim(), Circulo: tuple[0][0], Escola: schools[catalogKey(tuple[1])] ?? tuple[1], Execucao: tuple[2] === 'Movimentação' ? 'Movimento' : tuple[2], Alcance: tuple[3], Duracao: tuple.slice(4, -1).join(', '), Custo: tuple.at(-1)!.replace(/\s*PM$/i, ''), Efeito: match[3].trim() };
};
/** Idempotent import/migration. Legacy text remains in canonical metadata for recovery. */
export const upgradeSheetContent = (values: Values) => {
  if (values[TEXT_CATALOG_VERSION_FIELD] !== '1') {
    const groups = new Map<AbilityCategory, string[]>(ABILITY_FIELDS.map(([category, field]) => [category, splitTextEntries(values[field] ?? '')]));
    const existing = new Set([...groups.values()].flat().map(catalogTextKey));
    for (const field of OLD_ABILITY_FIELDS) for (const text of splitTextEntries(values[field] ?? '')) {
      if (existing.has(catalogTextKey(text))) continue;
      const entry = abilityEntry(text); const match = findAbility(entry.name, identity(values), field === 'HabClassePoderes' ? 'class' : undefined);
      groups.get(match.category)!.push(text); existing.add(catalogTextKey(text));
    }
    for (const [category, field] of ABILITY_FIELDS) {
      const text = groups.get(category)!.map((text) => `- ${text}`).join('\n');
      if (text.length > 100_000) throw new Error('Habilidades: a categoria excede 100.000 caracteres. Reduza o texto antes de migrar; a ficha original foi preservada.');
      values[field] = text;
    }
    for (const field of OLD_ABILITY_FIELDS) if (values[field]) values[`BossBar.Original.${field}`] = values[field];
    const legacyOnly = !values['BossBar.Magia.1.Nome']?.trim() && values['BossBar.Magia.1.Efeito']?.trim() === values.Magias?.trim();
    if (legacyOnly) for (const suffix of SPELL_FIELDS) delete values[`BossBar.Magia.1.${suffix}`];
    const hasRows = Array.from({ length: 100 }, (_, i) => values[`BossBar.Magia.${i + 1}.Nome`]?.trim()).some(Boolean);
    if (!hasRows) {
      const blocks = splitTextEntries(values.Magias ?? ''); let row = 0;
      // Some Nimb versions place a second spell block in the native Magias field.
      const extraBlocks = splitTextEntries(values[notesField] ?? '');
      const extraSpells = extraBlocks.filter((text) => parseNimbSpell(text));
      if (extraSpells.length) {
        values['BossBar.Original.MagiasAdicionais'] = values[notesField];
        values[notesField] = extraBlocks.filter((text) => !parseNimbSpell(text)).join('\n');
        blocks.push(...extraSpells);
      }
      const unparsed: string[] = [];
      const seen = new Set<string>();
      for (const text of blocks) {
        if (seen.has(catalogKey(text))) continue;
        seen.add(catalogKey(text));
        const parsed = parseNimbSpell(text); const named = !parsed && findSpell(text);
        const spell = parsed ?? (named ? { Nome: named.name } : null);
        if (!spell || row >= 100) { unparsed.push(text); continue; }
        row++;
        for (const [suffix, value] of Object.entries(spell)) values[`BossBar.Magia.${row}.${suffix}`] = value;
      }
      if (unparsed.length) {
        values['BossBar.Import.MagiasRevisar'] = 'Há texto que não pôde ser separado em magias com segurança. Revise Anotações para Magias e cadastre as linhas faltantes.';
        appendNote(values, `Texto de magias para revisão:\n${unparsed.join('\n')}`);
      }
    }
    if (values.Magias) values['BossBar.Original.Magias'] = values.Magias;
    values[TEXT_CATALOG_VERSION_FIELD] = '1';
  }
  for (const [category, field] of ABILITY_FIELDS) {
    const entries = splitTextEntries(values[field] ?? '');
    let changed = false;
    const text = entries.map((text) => {
      const entry = abilityEntry(text); const ref = findAbility(entry.name, identity(values), category).reference;
      if (entry.description || !ref) return text;
      changed = true; return `${entry.name}: ${ref.description}`;
    }).map((text) => `- ${text}`).join('\n');
    if (changed) {
      if (text.length > 100_000) throw new Error('Habilidades: não há espaço para completar as descrições. Reduza as anotações e tente novamente; a ficha original foi preservada.');
      values[field] = text;
    }
  }
  for (let index = 1; index <= 100; index++) {
    const prefix = `BossBar.Magia.${index}`; const ref = findSpell(values[`${prefix}.Nome`] ?? '');
    if (ref) {
      for (const [suffix, value] of Object.entries(spellFieldDefaults(ref))) if (!values[`${prefix}.${suffix}`]?.trim()) values[`${prefix}.${suffix}`] = value;
    }
    const cost = baseSpellManaCost(values[`${prefix}.Circulo`] ?? '');
    if (cost !== null) {
      const old = values[`${prefix}.Custo`]?.trim();
      if (old && Number(old) !== cost) appendNote(values, `${values[`${prefix}.Nome`] || `Magia ${index}`}: custo anteriormente informado ${old} PM. O campo do círculo exibe o custo-base de ${cost} PM; reduções e ajustes permanecem como anotação.`);
      values[`${prefix}.Custo`] = String(cost);
    } else if (values[`${prefix}.Custo`]) {
      appendNote(values, `${values[`${prefix}.Nome`] || `Magia ${index}`}: custo anteriormente informado ${values[`${prefix}.Custo`]} PM. Informe o círculo para exibir o custo-base.`);
      values[`${prefix}.Custo`] = '';
    }
  }
  return values;
};

export const sheetContentIssues = (values: Values): CharacterSheetIssue[] => {
  const issues: CharacterSheetIssue[] = [];
  const warn = (id: string, field: string, message: string, source?: string, values?: { actual: string; expected: string }) => issues.push({ id, field, severity: 'warning', autoFixable: false, message, ...(source ? { source } : {}), ...values });
  const compare = (id: string, field: string, name: string, actual: string, ref: { id: string; description: string; baseDescription?: string; sourceId: string; page: number }) => {
    if (!actual.trim() || [ref.description, ref.baseDescription].some((text) => text && referenceTextMatches(actual, text))) return;
    issues.push({ id, field, severity: 'warning', autoFixable: false,
      message: `“${name}”: há uma diferença de texto em relação a ${sourceCitation(ref)}. Isso não confirma um erro na ficha: pode ser uma adaptação, outra revisão do livro ou uma alteração do personagem. Compare os trechos; seu texto foi preservado.`,
      source: sourceCitation(ref), comparison: { ...referenceDifference(actual, ref.baseDescription ?? ref.description), referenceId: ref.id } });
  };
  for (const [category, field] of ABILITY_FIELDS) for (const [index, text] of splitTextEntries(values[field] ?? '').entries()) {
    const entry = abilityEntry(text); const match = findAbility(entry.name, identity(values), category); const ref = match.reference;
    if (category === 'review' || !match.candidates.length) warn(`catalog:ability:${category}:${index}`, field, `“${entry.name}”: não foi possível identificar com segurança a categoria no catálogo. Preserve o texto e coloque-o no campo de raça, origem, classe ou poderes gerais após conferir a referência.`);
    else if (match.category !== category) warn(`catalog:ability-category:${category}:${index}`, field, `“${entry.name}” pertence a ${ABILITY_FIELDS.find(([id]) => id === match.category)?.[2] ?? 'uma categoria a revisar'} no livro. Mova o texto para o campo correspondente.`, ref && sourceCitation(ref));
    else if (ref && catalogKey(entry.name) !== catalogKey(ref.name)) warn(`catalog:ability-alias:${category}:${index}`, field, `“${entry.name}” foi identificado como “${ref.name}”. O nome importado foi preservado; confira a referência.`, sourceCitation(ref));
    if (ref) compare(`catalog:ability-text:${category}:${index}`, field, entry.name, entry.description, ref);
  }
  for (let index = 1; index <= 100; index++) {
    const prefix = `BossBar.Magia.${index}`; const name = values[`${prefix}.Nome`]?.trim(); if (!name) continue;
    const ref = findSpell(name);
    if (!ref) { warn(`catalog:spell-unknown:${index}`, `${prefix}.Nome`, `“${name}” não foi localizada no catálogo dos seis livros. Confira a grafia ou preencha os dados da magia personalizada manualmente.`); continue; }
    for (const [suffix, expected] of Object.entries(spellFieldDefaults(ref))) {
      const actual = values[`${prefix}.${suffix}`] ?? '';
      if (['Nome', 'Custo', 'Efeito'].includes(suffix) || catalogTextKey(actual) === catalogTextKey(expected)) continue;
      warn(`catalog:spell:${index}:${suffix}`, `${prefix}.${suffix}`, `${name}: este campo difere da referência. O valor foi preservado; revise se representa uma alteração da mesa ou um aprimoramento.`, sourceCitation(ref), { actual, expected });
    }
    const effect = values[`${prefix}.Efeito`] ?? '';
    compare(`catalog:spell:${index}:Efeito`, `${prefix}.Efeito`, name, effect, ref);
  }
  if (values['BossBar.Import.MagiasRevisar']) warn('catalog:spell-unparsed', notesField, values['BossBar.Import.MagiasRevisar']);
  return issues;
};
